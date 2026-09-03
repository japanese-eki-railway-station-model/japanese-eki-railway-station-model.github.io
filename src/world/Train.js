import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════
// Shared module-level materials (undercarriage hardware looks
// the same across every train type — created once, reused)
// ═══════════════════════════════════════════════════════════
const matBogieFrame = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.5 });
const matWheel       = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.4, metalness: 0.85 });
const matPantograph  = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.7 });
const matFlatcar     = new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.8, metalness: 0.1 });
const matHeadlight   = new THREE.MeshStandardMaterial({
  color: 0xfffbe6, emissive: 0xfff5cc, emissiveIntensity: 1.3, roughness: 0.3,
});

const COUPLER_GAP = 0.15;
const BOGIE_H     = 0.55; // car floor height above rail top

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function nightFactor(simHour) {
  if (simHour < 5)  return 1;
  if (simHour < 7)  return 1 - smoothstep(5, 7, simHour);
  if (simHour < 17) return 0;
  if (simHour < 19) return smoothstep(17, 19, simHour);
  return 1;
}

// ═══════════════════════════════════════════════════════════
// Train roster
// ═══════════════════════════════════════════════════════════
export const TRAIN_TYPES = {
  shinkansen: {
    label: 'Hayabusa (E5)', carCount: 5, carLength: 7.5, width: 2.6, height: 3.3,
    bodyColor: '#f2f2ee', bandColor: '#1a5c3a', accentColor: '#e6007e',
    windowGlowColor: 0xffdca0, hasDoors: true, doorsPerSide: 1,
    hasPantograph: true, noseLength: 3.0, noseBluntness: 0.12,
    maxSpeed: 26,
  },
  kiha40: {
    label: 'Kiha 40', carCount: 2, carLength: 6.0, width: 2.3, height: 3.0,
    bodyColor: '#f0ead8', bandColor: '#c1440e', accentColor: null,
    windowGlowColor: 0xffe0b0, hasDoors: true, doorsPerSide: 2,
    hasPantograph: false, noseLength: 0.6, noseBluntness: 0.55,
    maxSpeed: 10,
  },
  emu701: {
    label: '701 Series', carCount: 3, carLength: 6.5, width: 2.4, height: 3.1,
    bodyColor: '#c8ccd0', bandColor: '#1a7a3c', accentColor: null,
    windowGlowColor: 0xfff0d0, hasDoors: true, doorsPerSide: 2,
    hasPantograph: true, noseLength: 0.5, noseBluntness: 0.6,
    maxSpeed: 14,
  },
  freight: {
    label: 'JR Freight', wagonCount: 5,
    locomotive: {
      length: 8.0, width: 2.5, height: 3.4,
      bodyColor: '#1a3a6b', bandColor: '#0d2244', accentColor: null,
      windowGlowColor: 0xffe8c0, noseLength: 1.0, noseBluntness: 0.7,
    },
    wagon: { length: 6.0, width: 2.4 },
    maxSpeed: 12,
  },
};

// ═══════════════════════════════════════════════════════════
// Procedural textures
// ═══════════════════════════════════════════════════════════
function computeWindowLayout(spec, w, h) {
  const winY = h * 0.28, winH = h * 0.30;
  const count = Math.max(3, Math.round(spec.length / 1.3));
  const marginX = w * 0.05;
  const usableW = w - marginX * 2;
  const gap = usableW / count;
  const winW = gap * 0.68;
  const rects = [];
  for (let i = 0; i < count; i++) {
    rects.push({ x: marginX + i * gap + (gap - winW) / 2, y: winY, w: winW, h: winH });
  }
  return rects;
}

function createLiveryTexture(spec) {
  const w = 512, h = 140;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = spec.bodyColor;
  ctx.fillRect(0, 0, w, h);

  const bandY = h * 0.62;
  ctx.fillStyle = spec.bandColor;
  ctx.fillRect(0, bandY, w, h - bandY);

  if (spec.accentColor) {
    ctx.fillStyle = spec.accentColor;
    ctx.fillRect(0, bandY - 4, w, 4);
  }

  const wins = computeWindowLayout(spec, w, h);
  ctx.fillStyle = 'rgba(20,28,38,0.85)';
  for (const r of wins) ctx.fillRect(r.x, r.y, r.w, r.h);

  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  const seamGap = w / Math.max(3, Math.round(spec.length));
  for (let x = 0; x < w; x += seamGap) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWindowGlowTexture(spec) {
  const w = 512, h = 140;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const wins = computeWindowLayout(spec, w, h);
  ctx.fillStyle = '#fff2cc';
  for (const r of wins) ctx.fillRect(r.x, r.y, r.w, r.h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContainerTexture(color, label) {
  const w = 256, h = 140;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  for (let x = 6; x < w; x += 10) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(label, w / 2, h * 0.55);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ═══════════════════════════════════════════════════════════
// Component builders
// ═══════════════════════════════════════════════════════════
function buildBogie(carWidth) {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, carWidth * 0.85), matBogieFrame);
  frame.position.y = 0.4;
  frame.castShadow = true;
  group.add(frame);

  for (const wx of [-0.6, 0.6]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 10), matWheel);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.25, side * carWidth * 0.42);
      group.add(wheel);
    }
  }
  return group;
}

function buildPantograph() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.6), matPantograph);
  group.add(base);

  const armGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6);
  for (const sign of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, matPantograph);
    arm.position.set(sign * 0.25, 0.5, 0);
    arm.rotation.z = sign * (Math.PI / 5);
    group.add(arm);
  }
  const contact = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.1), matPantograph);
  contact.position.y = 0.95;
  group.add(contact);
  return group;
}

/** Tapered nose cylinder — default orientation: tip at -X, wide base at +X */
function buildTaperedNose(carWidth, carHeight, length, bluntness, material) {
  const avgR = (carWidth + carHeight) / 4;
  const geo = new THREE.CylinderGeometry(avgR * bluntness, avgR, length, 10, 1);
  geo.rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function buildDoorPair(height, material) {
  const group = new THREE.Group();
  const leafW = 0.55, leafT = 0.06;
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, height, leafT), material);
    leaf.position.set(side * leafW * 0.5, height / 2, 0);
    leaf.castShadow = true;
    leaf.userData.closedX = leaf.position.x;
    leaf.userData.openX   = leaf.position.x + side * leafW * 0.9;
    group.add(leaf);
  }
  return group;
}

/**
 * Builds one passenger/locomotive car.
 * @param {object} spec  { width,height,length,bodyColor,bandColor,accentColor,
 *   windowGlowColor,hasDoors,doorsPerSide,hasPantograph,noseFront,noseBack,
 *   noseLength,noseBluntness }
 */
function buildPassengerCar(spec) {
  const group = new THREE.Group();
  group.userData.doorLeaves = [];

  const bodyTex = createLiveryTexture(spec);
  const bodyMat = new THREE.MeshStandardMaterial({ map: bodyTex, roughness: 0.45, metalness: 0.25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.length, spec.height, spec.width), bodyMat);
  body.position.y = BOGIE_H + spec.height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Window glow overlay (lights up at night)
  const glowTex = createWindowGlowTexture(spec);
  const glowMat = new THREE.MeshStandardMaterial({
    map: glowTex, transparent: true, emissive: spec.windowGlowColor,
    emissiveMap: glowTex, emissiveIntensity: 0.0, roughness: 0.6, depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(spec.length * 0.94, spec.height * 0.5), glowMat);
    plane.position.set(0, BOGIE_H + spec.height * 0.58, side * (spec.width / 2 + 0.01));
    plane.rotation.y = side > 0 ? 0 : Math.PI;
    group.add(plane);
  }
  group.userData.glowMaterial = glowMat;

  // Solid-colour material for curved/small parts (nose, doors) — avoids UV stretching
  const trimMat = new THREE.MeshStandardMaterial({ color: spec.bodyColor, roughness: 0.45, metalness: 0.25 });
  const NOSE_OVERLAP = 0.3;

  if (spec.noseFront) {
    const nose = buildTaperedNose(spec.width, spec.height, spec.noseLength, spec.noseBluntness, trimMat);
    nose.scale.x = -1; // flips tip to +X
    nose.position.set(spec.length / 2 + spec.noseLength / 2 - NOSE_OVERLAP, BOGIE_H + spec.height / 2, 0);
    group.add(nose);

    const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), matHeadlight);
    light.position.set(spec.length / 2 + spec.noseLength - 0.15, BOGIE_H + spec.height * 0.4, 0);
    group.add(light);
  }
  if (spec.noseBack) {
    const nose = buildTaperedNose(spec.width, spec.height, spec.noseLength, spec.noseBluntness, trimMat);
    nose.position.set(-(spec.length / 2 + spec.noseLength / 2 - NOSE_OVERLAP), BOGIE_H + spec.height / 2, 0);
    group.add(nose);

    const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), matHeadlight);
    light.position.set(-(spec.length / 2 + spec.noseLength - 0.15), BOGIE_H + spec.height * 0.4, 0);
    group.add(light);
  }

  // Bogies
  for (const bx of [-spec.length * 0.32, spec.length * 0.32]) {
    const bogie = buildBogie(spec.width);
    bogie.position.set(bx, 0, 0);
    group.add(bogie);
  }

  // Pantograph
  if (spec.hasPantograph) {
    const pan = buildPantograph();
    pan.position.set(0, BOGIE_H + spec.height, 0);
    group.add(pan);
    group.userData.pantograph = pan;
  }

  // Doors
  if (spec.hasDoors) {
    const doorSpacing = spec.length / (spec.doorsPerSide + 1);
    for (let i = 1; i <= spec.doorsPerSide; i++) {
      const dx = -spec.length / 2 + doorSpacing * i;
      for (const side of [-1, 1]) {
        const pair = buildDoorPair(spec.height * 0.8, trimMat);
        pair.position.set(dx, BOGIE_H + 0.05, side * (spec.width / 2 + 0.02));
        pair.rotation.y = side > 0 ? 0 : Math.PI;
        group.add(pair);
        group.userData.doorLeaves.push(...pair.children);
      }
    }
  }

  return group;
}

function buildFlatcarWithContainer(spec, seed) {
  const group = new THREE.Group();
  const deckH = 0.9;

  const deck = new THREE.Mesh(new THREE.BoxGeometry(spec.length, 0.25, spec.width), matFlatcar);
  deck.position.y = deckH;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  for (const bx of [-spec.length * 0.32, spec.length * 0.32]) {
    const bogie = buildBogie(spec.width);
    bogie.position.set(bx, 0, 0);
    group.add(bogie);
  }

  const palette = ['#c0392b', '#2e6da4', '#f39c12', '#27ae60', '#7f8c8d'];
  const color = palette[seed % palette.length];
  const contTex = createContainerTexture(color, `JRF ${1000 + seed * 37}`);
  const contMat = new THREE.MeshStandardMaterial({ map: contTex, roughness: 0.6, metalness: 0.2 });
  const container = new THREE.Mesh(
    new THREE.BoxGeometry(spec.length * 0.9, 2.4, spec.width * 0.92), contMat
  );
  container.position.y = deckH + 0.125 + 1.2;
  container.castShadow = true;
  container.receiveShadow = true;
  group.add(container);

  return group;
}

// ═══════════════════════════════════════════════════════════
// TRAIN
// ═══════════════════════════════════════════════════════════
export class Train {
  /**
   * @param {THREE.Scene} scene
   * @param {string}      typeKey    key into TRAIN_TYPES
   * @param {number}      trackZ     world Z of the track centerline
   * @param {number}      railTopY   world Y of the rail top (car floor rests above this)
   * @param {object}      options    { direction: 1|-1, startX: number }
   */
  constructor(scene, typeKey, trackZ, railTopY, options = {}) {
    this.scene   = scene;
    this.typeKey = typeKey;
    this.spec    = TRAIN_TYPES[typeKey];
    this.direction = options.direction ?? 1;

    this.group = new THREE.Group();
    this.group.position.set(options.startX ?? 0, railTopY, trackZ);
    if (this.direction < 0) this.group.rotation.y = Math.PI;
    scene.add(this.group);

    this._cars = [];
    this._doorLeaves   = [];
    this._glowMaterials = [];
    this._pantographs  = [];
    this._doorState  = 0;
    this._doorTarget = 0;
    this.length = 0;

    if (typeKey === 'freight') this._buildFreight();
    else this._buildPassengerConsist();
  }

  // ─── Passenger / EMU consist ───────────────────────────
  _buildPassengerConsist() {
    const spec = this.spec;
    const totalLength = spec.carCount * spec.carLength + (spec.carCount - 1) * COUPLER_GAP;
    this.length = totalLength;

    let leftEdge = -totalLength / 2;
    const panIndex = Math.floor(spec.carCount / 2);

    for (let i = 0; i < spec.carCount; i++) {
      const isFirst = i === 0;
      const isLast  = i === spec.carCount - 1;

      const carSpec = {
        width: spec.width, height: spec.height, length: spec.carLength,
        bodyColor: spec.bodyColor, bandColor: spec.bandColor, accentColor: spec.accentColor,
        windowGlowColor: spec.windowGlowColor,
        hasDoors: spec.hasDoors, doorsPerSide: spec.doorsPerSide,
        hasPantograph: spec.hasPantograph && i === panIndex,
        // outward-facing noses: leftmost car points -X, rightmost points +X
        noseFront: isLast,
        noseBack: isFirst,
        noseLength: spec.noseLength, noseBluntness: spec.noseBluntness,
      };

      const car = buildPassengerCar(carSpec);
      car.position.x = leftEdge + spec.carLength / 2;
      this.group.add(car);
      this._cars.push(car);

      this._glowMaterials.push(car.userData.glowMaterial);
      this._doorLeaves.push(...car.userData.doorLeaves);
      if (car.userData.pantograph) this._pantographs.push(car.userData.pantograph);

      leftEdge += spec.carLength + COUPLER_GAP;
    }
  }

  // ─── Freight consist: wagons + locomotive at the +X end ─
  _buildFreight() {
    const spec = this.spec;
    const lengths = [...Array(spec.wagonCount).fill(spec.wagon.length), spec.locomotive.length];
    const totalLength = lengths.reduce((a, b) => a + b, 0) + (lengths.length - 1) * COUPLER_GAP;
    this.length = totalLength;

    let leftEdge = -totalLength / 2;

    for (let i = 0; i < spec.wagonCount; i++) {
      const wagon = buildFlatcarWithContainer(spec.wagon, i);
      wagon.position.x = leftEdge + spec.wagon.length / 2;
      this.group.add(wagon);
      this._cars.push(wagon);
      leftEdge += spec.wagon.length + COUPLER_GAP;
    }

    const locoSpec = {
      ...spec.locomotive,
      hasDoors: false, doorsPerSide: 0,
      hasPantograph: true,
      noseFront: true, noseBack: false,
    };
    const loco = buildPassengerCar(locoSpec);
    loco.position.x = leftEdge + spec.locomotive.length / 2;
    this.group.add(loco);
    this._cars.push(loco);
    this._glowMaterials.push(loco.userData.glowMaterial);
    if (loco.userData.pantograph) this._pantographs.push(loco.userData.pantograph);
  }

  // ─── Position ───────────────────────────────────────────
  setPosition(x) {
    this.group.position.x = x;
  }
  get x() { return this.group.position.x; }
  get frontX() { return this.group.position.x + this.direction * (this.length / 2); }
  get backX()  { return this.group.position.x - this.direction * (this.length / 2); }

  // ─── Doors ───────────────────────────────────────────────
  openDoors()  { this._doorTarget = 1; }
  closeDoors() { this._doorTarget = 0; }
  get doorsOpen() { return this._doorState > 0.5; }

  // ─── Per-frame update ────────────────────────────────────
  /**
   * @param {number} dt        real delta seconds
   * @param {number} simHour   0.0 – 23.99
   */
  update(dt, simHour) {
    const nf = nightFactor(simHour);
    for (const mat of this._glowMaterials) {
      mat.emissiveIntensity = THREE.MathUtils.lerp(0.0, 1.4, nf);
    }

    this._doorState = THREE.MathUtils.lerp(this._doorState, this._doorTarget, Math.min(1, dt * 3));
    for (const leaf of this._doorLeaves) {
      leaf.position.x = THREE.MathUtils.lerp(
        leaf.userData.closedX, leaf.userData.openX, this._doorState
      );
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────
  dispose() {
    this.scene.remove(this.group);
  }
}