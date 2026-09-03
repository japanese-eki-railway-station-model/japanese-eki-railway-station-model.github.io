import { Train, TRAIN_TYPES } from '../world/Train.js';

// ═══════════════════════════════════════════════════════════
// Motion tuning (stylized, not real-world km/h — chosen for a
// cinematic, watchable pace within the 24min-per-day sim clock)
// ═══════════════════════════════════════════════════════════
const CRUISE_SPEED = { shinkansen: 5.0, kiha40: 2.0, emu701: 2.6, freight: 1.6 };
const DECEL_DISTANCE = { shinkansen: 18, kiha40: 9, emu701: 10 };
const ACCEL_DISTANCE = { shinkansen: 18, kiha40: 9, emu701: 10 };
const STOP_DURATION  = { shinkansen: 12, kiha40: 7, emu701: 8 }; // real seconds, doors open
const CLOSE_DELAY    = 1.5; // real seconds between doors-closed and departure

const SPAWN_DISTANCE   = 42;
const DESPAWN_DISTANCE = 44;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ═══════════════════════════════════════════════════════════
// Announcement text — reused from the station's script set
// ═══════════════════════════════════════════════════════════
const ANNOUNCEMENTS = {
  shinkansen: {
    arrive:        { ja: 'まもなく、2番線に、はやぶさ号が参ります。', en: 'The Hayabusa will soon arrive on Track 2.' },
    departWarning: { ja: 'ドアが閉まります、ご注意ください。', en: 'Doors are closing, please be careful.' },
    depart:        { ja: '2番線から、はやぶさ号が発車いたします。', en: 'The Hayabusa is departing from Track 2.' },
  },
  kiha40: {
    arrive:        { ja: 'まもなく、1番線に、普通列車が参ります。', en: 'A local train will soon arrive on Track 1.' },
    departWarning: { ja: 'ドアが閉まります、ご注意ください。', en: 'Doors are closing, please be careful.' },
    depart:        { ja: '1番線から、普通列車が発車いたします。', en: 'The local train is departing from Track 1.' },
  },
  emu701: {
    arrive:        { ja: 'まもなく、1番線に、普通列車が参ります。', en: 'A local train will soon arrive on Track 1.' },
    departWarning: { ja: 'ドアが閉まります、ご注意ください。', en: 'Doors are closing, please be careful.' },
    depart:        { ja: '1番線から、普通列車が発車いたします。', en: 'The local train is departing from Track 1.' },
  },
  generic: {
    passing: { ja: 'ただいま、通過列車があります。ホームの内側にお下がりください。', en: 'A train is now passing through. Please stand back from the platform edge.' },
  },
};

// ═══════════════════════════════════════════════════════════
// Daily timetable — 18 services across the 24 sim-hour day
// ═══════════════════════════════════════════════════════════
export const TIMETABLE = [
  { hour: 5.33,  type: 'kiha40',     track: 'track1', direction:  1, stops: true  }, // 05:20
  { hour: 6.17,  type: 'emu701',     track: 'track1', direction: -1, stops: true  }, // 06:10
  { hour: 6.75,  type: 'shinkansen', track: 'track3', direction:  1, stops: true  }, // 06:45
  { hour: 7.50,  type: 'freight',    track: 'track2', direction:  1, stops: false }, // 07:30
  { hour: 8.25,  type: 'kiha40',     track: 'track1', direction: -1, stops: true  }, // 08:15
  { hour: 9.67,  type: 'shinkansen', track: 'track4', direction: -1, stops: false }, // 09:40
  { hour: 11.00, type: 'emu701',     track: 'track1', direction:  1, stops: true  }, // 11:00
  { hour: 12.50, type: 'freight',    track: 'track4', direction: -1, stops: false }, // 12:30
  { hour: 13.75, type: 'shinkansen', track: 'track3', direction: -1, stops: true  }, // 13:45
  { hour: 15.00, type: 'kiha40',     track: 'track1', direction:  1, stops: true  }, // 15:00
  { hour: 16.33, type: 'emu701',     track: 'track1', direction: -1, stops: true  }, // 16:20
  { hour: 17.17, type: 'shinkansen', track: 'track3', direction:  1, stops: true  }, // 17:10
  { hour: 18.00, type: 'freight',    track: 'track2', direction:  1, stops: false }, // 18:00
  { hour: 18.67, type: 'emu701',     track: 'track1', direction: -1, stops: true  }, // 18:40
  { hour: 19.50, type: 'kiha40',     track: 'track1', direction:  1, stops: true  }, // 19:30
  { hour: 21.00, type: 'shinkansen', track: 'track3', direction: -1, stops: true  }, // 21:00
  { hour: 22.25, type: 'kiha40',     track: 'track1', direction:  1, stops: true  }, // 22:15
  { hour: 23.83, type: 'freight',    track: 'track4', direction: -1, stops: false }, // 23:50
];

// ═══════════════════════════════════════════════════════════
// TRAIN SCHEDULER
// ═══════════════════════════════════════════════════════════
export class TrainScheduler {
  /**
   * @param {THREE.Scene} scene
   * @param {Platform}    platform   provides .tracks (world Z / rail Y per track)
   * @param {Dashboard}   dashboard  for banner announcements
   */
  constructor(scene, platform, dashboard) {
    this.scene = scene;
    this.platform = platform;
    this.dashboard = dashboard;

    /** Assign to receive events: onEvent(type, service) — for AudioSystem later */
    this.onEvent = null;

    this._active = []; // { train, entry, phase, boardTimer, closeTimer, doorsClosing, announcedPassing }
  }

  /** Registers every timetable entry with the sim Clock (daily repeat). */
  registerWithClock(clock) {
    for (const entry of TIMETABLE) {
      if (!TRAIN_TYPES[entry.type]) {
        console.warn(`[TrainScheduler] Unknown train type "${entry.type}", skipping.`);
        continue;
      }
      clock.at(entry.hour, () => this._spawn(entry), true);
    }
  }

  // ─── Spawn / despawn ────────────────────────────────────
  _spawn(entry) {
    const trackInfo = this.platform.tracks[entry.track];
    if (!trackInfo) {
      console.warn(`[TrainScheduler] Unknown track "${entry.track}", skipping.`);
      return;
    }
    const dir = entry.direction;
    const startX = dir > 0 ? -SPAWN_DISTANCE : SPAWN_DISTANCE;

    const train = new Train(this.scene, entry.type, trackInfo.worldZ, trackInfo.railTopY, {
      direction: dir, startX,
    });

    this._active.push({
      train, entry,
      phase: entry.stops ? 'approaching' : 'through',
      boardTimer: 0, closeTimer: 0,
      doorsClosing: false, announcedPassing: false,
    });
  }

  _despawn(service) {
    service.train.dispose();
    const idx = this._active.indexOf(service);
    if (idx >= 0) this._active.splice(idx, 1);
  }

  // ─── Announcements ──────────────────────────────────────
  _announce(service, type) {
    const bank = ANNOUNCEMENTS[service.entry.type] ?? ANNOUNCEMENTS.generic;
    const text = bank[type] ?? ANNOUNCEMENTS.generic[type];
    if (text) this.dashboard?.showTrainBanner(text.ja, text.en);
    this.onEvent?.(type, service);
  }

  // ─── Per-service motion ──────────────────────────────────
  _advance(service, dt, simHour) {
    const { train, entry } = service;
    const dir = entry.direction;
    const cruise = CRUISE_SPEED[entry.type] ?? 2.0;

    if (service.phase === 'through') {
      train.setPosition(train.x + dir * cruise * dt);

      if (!service.announcedPassing && Math.abs(train.x) < 5) {
        service.announcedPassing = true;
        this._announce(service, 'passing');
      }
      if (Math.abs(train.x) > DESPAWN_DISTANCE) { this._despawn(service); return; }

    } else if (service.phase === 'approaching') {
      const decelDist = DECEL_DISTANCE[entry.type] ?? 10;
      const dist = Math.abs(0 - train.x);
      const speed = dist > decelDist
        ? cruise
        : Math.max(cruise * smoothstep(0, decelDist, dist), 0.15);

      const step = dir * speed * dt;
      const newX = train.x + step;
      const overshot = dir > 0 ? newX >= 0 : newX <= 0;

      if (overshot) {
        train.setPosition(0);
        service.phase = 'boarding';
        service.boardTimer = 0;
        train.openDoors();
        this._announce(service, 'arrive');
      } else {
        train.setPosition(newX);
      }

    } else if (service.phase === 'boarding') {
      service.boardTimer += dt;
      const stopDuration = STOP_DURATION[entry.type] ?? 8;

      if (service.boardTimer > stopDuration && !service.doorsClosing) {
        train.closeDoors();
        service.doorsClosing = true;
        service.closeTimer = 0;
        this._announce(service, 'departWarning');
      }
      if (service.doorsClosing) {
        service.closeTimer += dt;
        if (service.closeTimer > CLOSE_DELAY) {
          service.phase = 'departing';
          this._announce(service, 'depart');
        }
      }

    } else if (service.phase === 'departing') {
      const accelDist = ACCEL_DISTANCE[entry.type] ?? 10;
      const distSince = Math.abs(train.x - 0);
      const speed = Math.max(cruise * smoothstep(0, accelDist, distSince), 0.05);

      train.setPosition(train.x + dir * speed * dt);
      if (Math.abs(train.x) > DESPAWN_DISTANCE) { this._despawn(service); return; }
    }

    train.update(dt, simHour);
  }

  // ─── Per-frame update ────────────────────────────────────
  /**
   * @param {number} dt       real delta seconds
   * @param {number} simHour  0.0 – 23.99
   */
  update(dt, simHour) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      this._advance(this._active[i], dt, simHour);
    }
  }

  get activeCount() { return this._active.length; }

  /** Removes every active train immediately (e.g. on teardown). */
  clearAll() {
    for (const service of [...this._active]) this._despawn(service);
  }
}