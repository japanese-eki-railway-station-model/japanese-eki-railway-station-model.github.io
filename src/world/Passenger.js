import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════
// NPC appearance constants
// ═══════════════════════════════════════════════════════════
const BODY_COLORS  = [0x2c3e50, 0x7f8c8d, 0x8e44ad, 0x2980b9, 0x16a085, 0xc0392b, 0x27ae60, 0xe67e22];
const SKIN_COLORS  = [0xf5cba7, 0xe59866, 0xd4a574, 0xf0c990, 0xc68642];
const BAG_COLORS   = [0x2c3e50, 0x8e44ad, 0x7f8c8d, 0xc0392b, 0x27ae60];

const NPC_HEIGHT   = 1.75;
const HEAD_R       = 0.11;
const TORSO_H      = 0.55;
const TORSO_W      = 0.28;
const TORSO_D      = 0.16;
const LIMB_R       = 0.055;
const LEG_H        = 0.55;
const ARM_H        = 0.45;
const WALK_SPEED   = 1.1;  // units/sec
const WALK_CYCLE   = 1.4;  // seconds per full stride

// ═══════════════════════════════════════════════════════════
// PASSENGER (single NPC)
// ═══════════════════════════════════════════════════════════
export class Passenger {
  /**
   * @param {THREE.Scene} scene
   * @param {number}      seed   deterministic variation seed
   */
  constructor(scene, seed = 0) {
    this.scene  = scene;
    this.seed   = seed;
    this.group  = new THREE.Group();
    scene.add(this.group);

    // State machine
    this.state       = 'idle';  // idle | walking | waiting | boarding | alighting | despawning
    this._walkTarget = null;    // THREE.Vector3
    this._walkDir    = new THREE.Vector3();
    this._walkTime   = 0;
    this._stateTimer = 0;
    this._onArrival  = null;    // callback when walk target reached

    // Limb references for animation
    this._limbs = {};

    this._build(seed);
  }

  // ─── Build NPC geometry ───────────────────────────────
  _build(seed) {
    const bodyColor = BODY_COLORS[seed % BODY_COLORS.length];
    const skinColor = SKIN_COLORS[seed % SKIN_COLORS.length];
    const bagColor  = BAG_COLORS[(seed + 2) % BAG_COLORS.length];

    const matSkin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.85 });
    const matBody = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.9  });
    const matBag  = new THREE.MeshStandardMaterial({ color: bagColor,  roughness: 0.8  });
    const matShoe = new THREE.MeshStandardMaterial({ color: 0x1a1a1a,  roughness: 0.7  });
    const matPant = new THREE.MeshStandardMaterial({ color: 0x2c3342,  roughness: 0.85 });

    // ── Head ───────────────────────────────────────────
    const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 8, 8), matSkin);
    const headY = LEG_H + TORSO_H + HEAD_R + 0.04;
    head.position.y = headY;
    head.castShadow = true;
    this.group.add(head);

    // Hair (simple flat disc on top)
    const hairColor = [0x1a0a00, 0x3d2b1f, 0x0a0a0a][(seed + 1) % 3];
    const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 1.0 });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R + 0.01, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), matHair);
    hair.position.y = headY + 0.01;
    this.group.add(hair);

    // ── Torso ──────────────────────────────────────────
    const torsoY = LEG_H + TORSO_H / 2;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(TORSO_W, TORSO_H, TORSO_D), matBody);
    torso.position.y = torsoY;
    torso.castShadow = true;
    this.group.add(torso);

    // ── Left arm ───────────────────────────────────────
    const lArmPivot = new THREE.Group();
    lArmPivot.position.set(-TORSO_W / 2 - LIMB_R, LEG_H + TORSO_H - 0.05, 0);
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(LIMB_R, LIMB_R * 0.85, ARM_H, 6), matBody);
    lArm.position.y = -ARM_H / 2;
    lArmPivot.add(lArm);
    this.group.add(lArmPivot);
    this._limbs.lArmPivot = lArmPivot;

    // ── Right arm ──────────────────────────────────────
    const rArmPivot = new THREE.Group();
    rArmPivot.position.set(TORSO_W / 2 + LIMB_R, LEG_H + TORSO_H - 0.05, 0);
    const rArm = new THREE.Mesh(new THREE.CylinderGeometry(LIMB_R, LIMB_R * 0.85, ARM_H, 6), matBody);
    rArm.position.y = -ARM_H / 2;
    rArmPivot.add(rArm);
    this.group.add(rArmPivot);
    this._limbs.rArmPivot = rArmPivot;

    // ── Left leg ───────────────────────────────────────
    const lLegPivot = new THREE.Group();
    lLegPivot.position.set(-TORSO_W / 4, LEG_H, 0);
    const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(LIMB_R, LIMB_R * 0.8, LEG_H, 6), matPant);
    lLeg.position.y = -LEG_H / 2;
    lLegPivot.add(lLeg);
    // shoe
    const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), matShoe);
    lShoe.position.set(0, -LEG_H + 0.03, 0.04);
    lLegPivot.add(lShoe);
    this.group.add(lLegPivot);
    this._limbs.lLegPivot = lLegPivot;

    // ── Right leg ──────────────────────────────────────
    const rLegPivot = new THREE.Group();
    rLegPivot.position.set(TORSO_W / 4, LEG_H, 0);
    const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(LIMB_R, LIMB_R * 0.8, LEG_H, 6), matPant);
    rLeg.position.y = -LEG_H / 2;
    rLegPivot.add(rLeg);
    const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), matShoe);
    rShoe.position.set(0, -LEG_H + 0.03, 0.04);
    rLegPivot.add(rShoe);
    this.group.add(rLegPivot);
    this._limbs.rLegPivot = rLegPivot;

    // ── Bag (every other NPC carries one) ──────────────
    if (seed % 2 === 0) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.08), matBag);
      bag.position.set(TORSO_W / 2 + 0.1, LEG_H + TORSO_H * 0.35, 0);
      this.group.add(bag);
    }
  }

  // ─── Movement interface ───────────────────────────────
  /**
   * Walk toward a world-space target position, call onArrival when reached.
   * @param {THREE.Vector3} target
   * @param {function}      onArrival
   */
  walkTo(target, onArrival = null) {
    this._walkTarget = target.clone();
    this._onArrival  = onArrival;
    this._walkTime   = 0;
    this.state = 'walking';

    // Face the target
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) {
      this.group.rotation.y = Math.atan2(dx, dz);
    }
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  idle()  { this.state = 'idle';    this._resetLimbs(); }
  wait()  { this.state = 'waiting'; this._resetLimbs(); }

  despawn() {
    this.state = 'despawning';
    this.scene.remove(this.group);
  }

  _resetLimbs() {
    this._limbs.lArmPivot.rotation.x = 0;
    this._limbs.rArmPivot.rotation.x = 0;
    this._limbs.lLegPivot.rotation.x = 0;
    this._limbs.rLegPivot.rotation.x = 0;
  }

  // ─── Per-frame update ─────────────────────────────────
  /**
   * @param {number} dt  real delta seconds
   */
  update(dt) {
    if (this.state === 'despawning') return;

    this._stateTimer += dt;

    if (this.state === 'walking') {
      this._walkTime += dt;
      this._animateWalk(this._walkTime);

      const pos = this.group.position;
      const target = this._walkTarget;
      if (!target) return;

      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.12) {
        this.group.position.set(target.x, pos.y, target.z);
        this.state = 'idle';
        this._resetLimbs();
        this._onArrival?.();
        this._onArrival = null;
      } else {
        const speed = Math.min(WALK_SPEED, dist / dt);
        pos.x += (dx / dist) * speed * dt;
        pos.z += (dz / dist) * speed * dt;
      }

    } else if (this.state === 'waiting') {
      // Subtle idle sway
      const sway = Math.sin(this._stateTimer * 0.8 + this.seed) * 0.015;
      this.group.rotation.z = sway;

    } else if (this.state === 'idle') {
      this.group.rotation.z = 0;
    }
  }

  _animateWalk(t) {
    const phase = (t / WALK_CYCLE) * Math.PI * 2;
    const swing = 0.42;
    this._limbs.lLegPivot.rotation.x =  Math.sin(phase) * swing;
    this._limbs.rLegPivot.rotation.x = -Math.sin(phase) * swing;
    this._limbs.lArmPivot.rotation.x = -Math.sin(phase) * swing * 0.6;
    this._limbs.rArmPivot.rotation.x =  Math.sin(phase) * swing * 0.6;
  }
}