import * as THREE from 'three';
import { Passenger } from '../world/Passenger.js';

// ═══════════════════════════════════════════════════════════
// Crowd density by sim hour (0-1 scale)
// ═══════════════════════════════════════════════════════════
const DENSITY_KEYS = [
  [0,  0.02], [5,  0.02], [6,  0.35], [7,  0.85],
  [8,  0.70], [9,  0.40], [10, 0.20], [11, 0.25],
  [12, 0.30], [13, 0.25], [14, 0.20], [15, 0.30],
  [16, 0.55], [17, 0.80], [18, 0.75], [19, 0.50],
  [20, 0.30], [21, 0.20], [22, 0.10], [23, 0.04], [24, 0.02],
];

const MAX_PASSENGERS   = 24;
const SPAWN_INTERVAL   = 6.0;   // real seconds between spawn attempts
const DESPAWN_IDLE_MIN = 20.0;  // real seconds a passenger waits before leaving if no train
const DESPAWN_IDLE_MAX = 60.0;

// Waiting spot grid on Platform A and B
const PLATFORM_A_WAIT_SPOTS = [];
const PLATFORM_B_WAIT_SPOTS = [];

for (let ix = -2; ix <= 2; ix++) {
  for (let iz = 0; iz < 3; iz++) {
    PLATFORM_A_WAIT_SPOTS.push(new THREE.Vector3(ix * 1.8, 0.35, -4.5 - iz * 0.9));
    PLATFORM_B_WAIT_SPOTS.push(new THREE.Vector3(ix * 1.8, 0.35, -15.0 - iz * 0.9));
  }
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════
function lerpDensity(simHour) {
  for (let i = 0; i < DENSITY_KEYS.length - 1; i++) {
    const [h0, d0] = DENSITY_KEYS[i];
    const [h1, d1] = DENSITY_KEYS[i + 1];
    if (simHour >= h0 && simHour < h1) {
      const t = (simHour - h0) / (h1 - h0);
      return d0 + (d1 - d0) * t;
    }
  }
  return 0.02;
}

function randomRange(min, max, seed) {
  const r = Math.abs(Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1;
  return min + r * (max - min);
}

function pickRandom(arr, seed) {
  const idx = Math.floor(Math.abs(Math.sin(seed * 91.3) * 99999) % arr.length);
  return arr[idx];
}

// ═══════════════════════════════════════════════════════════
// CROWD SYSTEM
// ═══════════════════════════════════════════════════════════
export class CrowdSystem {
  /**
   * @param {THREE.Scene}    scene
   * @param {Platform}       platform
   * @param {TrainScheduler} trainScheduler
   */
  constructor(scene, platform, trainScheduler) {
    this.scene          = scene;
    this.platform       = platform;
    this.trainScheduler = trainScheduler;

    this._passengers  = [];   // { passenger, role, idleTimer, waitSpot, targetPlatform, seed }
    this._seedCounter = 0;
    this._spawnTimer  = 0;
    this._usedSpots   = new Set();

    // Hook into TrainScheduler events so passengers react to trains
    if (trainScheduler) {
      trainScheduler.onEvent = (type, service) => this._onTrainEvent(type, service);
    }
  }

  // ─── Main update ─────────────────────────────────────
  /**
   * @param {number} dt       real delta seconds
   * @param {number} simHour  0–23.99
   */
  update(dt, simHour) {
    const density = lerpDensity(simHour);
    const targetCount = Math.round(density * MAX_PASSENGERS);

    // Spawn new passengers
    this._spawnTimer += dt;
    if (this._spawnTimer >= SPAWN_INTERVAL) {
      this._spawnTimer = 0;
      if (this._passengers.length < targetCount) {
        this._spawnPassenger(simHour);
      }
    }

    // Update existing passengers
    for (let i = this._passengers.length - 1; i >= 0; i--) {
      const p = this._passengers[i];
      p.passenger.update(dt);
      p.idleTimer += dt;

      // Cull excess passengers over target
      if (this._passengers.length > targetCount + 4 && p.passenger.state === 'idle') {
        this._remove(i);
        continue;
      }

      // Passenger gives up waiting and leaves after random timeout
      if (p.passenger.state === 'waiting' && p.idleTimer > p.despawnAfter) {
        this._walkToExit(i);
      }
    }
  }

  // ─── Spawn ─────────────────────────────────────────────
  _spawnPassenger(simHour) {
    const seed   = this._seedCounter++;
    const isA    = seed % 3 !== 0;   // 2/3 go to Platform A (local), 1/3 Platform B (Shinkansen)
    const spots  = isA ? PLATFORM_A_WAIT_SPOTS : PLATFORM_B_WAIT_SPOTS;

    // Find a free spot
    const freeSpots = spots.filter((_, i) => !this._usedSpots.has(`${isA ? 'A' : 'B'}_${i}`));
    if (freeSpots.length === 0) return;

    const spot    = pickRandom(freeSpots, seed);
    const spotKey = `${isA ? 'A' : 'B'}_${spots.indexOf(spot)}`;
    this._usedSpots.add(spotKey);

    const p = new Passenger(this.scene, seed);

    // Spawn from station entrance side (front of platform A)
    const entranceX = randomRange(-4, 4, seed);
    p.setPosition(entranceX, 0.35, -3.5);

    // World-offset (platform anchor is at world z = -20)
    const anchor = this.platform.group.position;
    p.group.position.x += anchor.x;
    p.group.position.z += anchor.z;

    const worldSpot = spot.clone().add(anchor);
    worldSpot.y = 0.35;

    const record = {
      passenger: p,
      role: 'waiting',
      idleTimer: 0,
      despawnAfter: randomRange(DESPAWN_IDLE_MIN, DESPAWN_IDLE_MAX, seed),
      waitSpot: worldSpot,
      spotKey,
      targetPlatform: isA ? 'A' : 'B',
      seed,
    };
    this._passengers.push(record);

    // Walk to waiting spot then switch to wait state
    p.walkTo(worldSpot, () => {
      p.wait();
      // Face toward the track
      p.group.rotation.y = isA ? Math.PI : 0;
    });
  }

  // ─── Train events ──────────────────────────────────────
  _onTrainEvent(type, service) {
    if (type === 'arrive') {
      const platform = service.entry.track === 'track3' || service.entry.track === 'track4'
        ? 'B' : 'A';
      this._passengersBoardTrain(platform, service);
    }

    if (type === 'depart') {
      const platform = service.entry.track === 'track3' || service.entry.track === 'track4'
        ? 'B' : 'A';
      this._alightPassengers(platform, service);
    }
  }

  _passengersBoardTrain(platformLabel, service) {
    const boarders = this._passengers.filter(p =>
      p.targetPlatform === platformLabel &&
      (p.passenger.state === 'waiting' || p.passenger.state === 'idle')
    );

    const anchor = this.platform.group.position;
    const trainX = 0 + anchor.x;   // train stops at x=0 in platform local space

    let delay = 0;
    for (const record of boarders) {
      const doorZ = record.waitSpot.z;
      const boardTarget = new THREE.Vector3(trainX, record.waitSpot.y, doorZ);

      // Stagger boarding so they don't all move at once
      setTimeout(() => {
        if (record.passenger.state === 'despawning') return;
        record.passenger.walkTo(boardTarget, () => {
          // "Disappear" into the train
          record.passenger.despawn();
          this._usedSpots.delete(record.spotKey);
          const idx = this._passengers.indexOf(record);
          if (idx >= 0) this._passengers.splice(idx, 1);
        });
      }, delay * 1000);

      delay += randomRange(0.3, 1.2, record.seed);
    }
  }

  _alightPassengers(platformLabel, service) {
    // Spawn a small batch of alighting passengers from near the train center
    const anchor = this.platform.group.position;
    const count = 2 + Math.floor(Math.random() * 4);

    for (let i = 0; i < count; i++) {
      const seed = this._seedCounter++;
      const p = new Passenger(this.scene, seed);

      const spawnX = anchor.x + randomRange(-3, 3, seed);
      const spawnZ = platformLabel === 'A'
        ? anchor.z + randomRange(PLATFORM_A_WAIT_SPOTS[0].z, PLATFORM_A_WAIT_SPOTS[PLATFORM_A_WAIT_SPOTS.length - 1].z, seed)
        : anchor.z + randomRange(PLATFORM_B_WAIT_SPOTS[0].z, PLATFORM_B_WAIT_SPOTS[PLATFORM_B_WAIT_SPOTS.length - 1].z, seed);

      p.setPosition(spawnX, 0.35, spawnZ);

      // Walk toward station exit (front of Platform A)
      const exitTarget = new THREE.Vector3(
        anchor.x + randomRange(-4, 4, seed + 1),
        0.35,
        anchor.z - 2.5  // station back door
      );

      const record = {
        passenger: p,
        role: 'alighting',
        idleTimer: 0,
        despawnAfter: 30,
        waitSpot: exitTarget,
        spotKey: null,
        targetPlatform: platformLabel,
        seed,
      };
      this._passengers.push(record);

      // Stagger alighting
      setTimeout(() => {
        p.walkTo(exitTarget, () => {
          // Walk off into station, then despawn
          const finalExit = new THREE.Vector3(
            anchor.x + randomRange(-3, 3, seed + 2),
            0.35,
            anchor.z + 8  // past station entrance
          );
          p.walkTo(finalExit, () => {
            p.despawn();
            const idx = this._passengers.indexOf(record);
            if (idx >= 0) this._passengers.splice(idx, 1);
          });
        });
      }, i * randomRange(400, 900, seed));
    }
  }

  // ─── Walk to exit ──────────────────────────────────────
  _walkToExit(index) {
    const record = this._passengers[index];
    if (!record) return;

    this._usedSpots.delete(record.spotKey);
    const anchor = this.platform.group.position;

    const exitTarget = new THREE.Vector3(
      anchor.x + randomRange(-4, 4, record.seed + 5),
      0.35,
      anchor.z + 10
    );

    record.passenger.walkTo(exitTarget, () => {
      record.passenger.despawn();
      const idx = this._passengers.indexOf(record);
      if (idx >= 0) this._passengers.splice(idx, 1);
    });
  }

  // ─── Remove ────────────────────────────────────────────
  _remove(index) {
    const record = this._passengers[index];
    if (!record) return;
    this._usedSpots.delete(record.spotKey);
    record.passenger.despawn();
    this._passengers.splice(index, 1);
  }

  // ─── Clear all ─────────────────────────────────────────
  clearAll() {
    for (let i = this._passengers.length - 1; i >= 0; i--) {
      this._remove(i);
    }
  }

  get count() { return this._passengers.length; }
}