import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════
// Layout constants (local to the shared building anchor, same
// origin as Station.js — default world position (0,0,-20))
// ═══════════════════════════════════════════════════════════
const BACK_WALL_Z     = -3.0;   // matches Station.js HALF_DEPTH
const DOOR_X          = -1.8;   // matches Station.js back door center

const PLATFORM_HEIGHT = 0.35;   // platforms sit above rail level
const BALLAST_TOP     = 0.06;   // ballast bed surface (~ground level)
const BALLAST_BOTTOM  = -0.14;

const X_HALF           = 6.0;   // platform width, matches building
const TRACK_X_MIN      = -45;
const TRACK_X_MAX      = 45;

const NARROW_GAUGE = 1.067;     // conventional JR lines
const STD_GAUGE    = 1.435;     // shinkansen

// Depth layout (all Z values, front→back)
const STEP_Z0 = BACK_WALL_Z;          // -3.0
const STEP_Z1 = -3.3;

const PLATFORM_A = { zMin: -7.3,  zMax: -3.3 };
const ZONE_1     = { zMin: -13.3, zMax: -7.3  };
const PLATFORM_B = { zMin: -18.8, zMax: -13.3 };
const ZONE_2     = { zMin: -24.8, zMax: -18.8 };
const FAR_FENCE_Z = -25.0;

export const TRACKS = {
  track1: { z: -8.8,  gauge: NARROW_GAUGE, type: 'local',      platform: 'A', boarding: true  },
  track2: { z: -11.8, gauge: NARROW_GAUGE, type: 'through',    platform: null, boarding: false },
  track3: { z: -20.3, gauge: STD_GAUGE,    type: 'shinkansen', platform: 'B', boarding: true  },
  track4: { z: -23.3, gauge: STD_GAUGE,    type: 'shinkansen-through', platform: null, boarding: false },
};
export const TRACK_X_RANGE = { min: TRACK_X_MIN, max: TRACK_X_MAX };

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
// Procedural textures
// ═══════════════════════════════════════════════════════════
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function toTexture(canvas, rx = 1, ry = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBallastTexture() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a544c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    const s = 60 + Math.random() * 90;
    ctx.fillStyle = `rgb(${s},${s - 4},${s - 10})`;
    const x = Math.random() * size, y = Math.random() * size;
    const r = 1 + Math.random() * 2.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return toTexture(c, 10, 4);
}

function createPlatformTexture() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a8a49a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2500; i++) {
    const s = 150 + Math.random() * 40;
    ctx.fillStyle = `rgba(${s},${s},${s - 6},0.07)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < size; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  return toTexture(c, 6, 2);
}

function createTactileTexture() {
  const size = 128;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e0a800';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#b98700';
  for (let y = 8; y < size; y += 16) {
    for (let x = 8; x < size; x += 16) {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  return toTexture(c, 4, 1);
}

function createStairTexture() {
  const w = 64, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#6b6b6b' : '#585858';
    ctx.fillRect(0, (i / steps) * h, w, h / steps);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, (i / steps) * h, w, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLineSignTexture(number, label) {
  const w = 256, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a6b3a';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `bold 110px sans-serif`;
  ctx.fillText(number, w / 2, h / 2 + 38);
  ctx.font = `20px sans-serif`;
  ctx.fillText(label, w / 2, h * 0.86);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════
function addBox(parent, w, h, d, cx, cy, cz, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Straight inclined ramp (stylized stairs) between two points, with railings. */
function buildRamp(width, p0, p1, rampMaterial, railMaterial) {
  const start = new THREE.Vector3(...p0);
  const end   = new THREE.Vector3(...p1);
  const dir   = new THREE.Vector3().subVectors(end, start);
  const runLength = dir.length();
  dir.normalize();

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.15, runLength),
    rampMaterial
  );
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  mesh.quaternion.copy(quat);
  mesh.position.copy(start).addScaledVector(dir, runLength / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.9, runLength),
      railMaterial
    );
    rail.position.set(side * (width / 2 - 0.04), 0.5, 0);
    mesh.add(rail);
  }
  return mesh;
}

function buildRails(centerZ, gauge, material) {
  const group = new THREE.Group();
  const length = TRACK_X_MAX - TRACK_X_MIN;
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 0.07), material);
    rail.position.set((TRACK_X_MIN + TRACK_X_MAX) / 2, BALLAST_TOP + 0.1, centerZ + side * gauge / 2);
    rail.castShadow = true;
    group.add(rail);
  }
  return group;
}

function buildSleepers(centerZ, gauge, material) {
  const spacing = 0.55;
  const count = Math.floor((TRACK_X_MAX - TRACK_X_MIN) / spacing);
  const geo = new THREE.BoxGeometry(spacing * 0.4, 0.08, gauge + 0.5);
  const mesh = new THREE.InstancedMesh(geo, material, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const x = TRACK_X_MIN + i * spacing + spacing / 2;
    dummy.position.set(x, BALLAST_TOP + 0.04, centerZ);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildFence(xMin, xMax, z, height, material) {
  const group = new THREE.Group();
  const postSpacing = 1.5;
  const count = Math.floor((xMax - xMin) / postSpacing) + 1;
  for (let i = 0; i < count; i++) {
    const x = xMin + i * postSpacing;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, height, 6), material);
    post.position.set(x, height / 2, z);
    post.castShadow = true;
    group.add(post);
  }
  for (const ry of [height * 0.4, height * 0.85]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(xMax - xMin, 0.03, 0.03), material
    );
    rail.position.set((xMin + xMax) / 2, ry, z);
    group.add(rail);
  }
  return group;
}

// ═══════════════════════════════════════════════════════════
// PLATFORM
// ═══════════════════════════════════════════════════════════
export class Platform {
  /**
   * @param {THREE.Scene}    scene
   * @param {THREE.Vector3}  position  shared anchor, same as Station
   */
  constructor(scene, position = new THREE.Vector3(0, 0, -20)) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    // World-space track/platform info for TrainScheduler & CrowdSystem
    this.tracks = {};
    for (const [key, t] of Object.entries(TRACKS)) {
      this.tracks[key] = {
        ...t,
        worldZ: position.z + t.z,
        xMin: position.x + TRACK_X_MIN,
        xMax: position.x + TRACK_X_MAX,
        railTopY: position.y + BALLAST_TOP + 0.16,
      };
    }
    this.platformA = {
      xMin: position.x - X_HALF, xMax: position.x + X_HALF,
      zMin: position.z + PLATFORM_A.zMin, zMax: position.z + PLATFORM_A.zMax,
      y: position.y + PLATFORM_HEIGHT,
    };
    this.platformB = {
      xMin: position.x - X_HALF, xMax: position.x + X_HALF,
      zMin: position.z + PLATFORM_B.zMin, zMax: position.z + PLATFORM_B.zMax,
      y: position.y + PLATFORM_HEIGHT,
    };

    this._nightLights = [];

    this._buildMaterials();
    this._buildPlatformSlabs();
    this._buildTracks();
    this._buildFences();
    this._buildFootbridge();
    this._buildShelterAndBenches();
    this._buildSignage();
    this._buildLamps();
  }

  // ─── Materials ────────────────────────────────────────
  _buildMaterials() {
    this.matPlatform = new THREE.MeshStandardMaterial({ map: createPlatformTexture(), roughness: 0.9 });
    this.matBallast  = new THREE.MeshStandardMaterial({ map: createBallastTexture(), roughness: 1.0 });
    this.matTactile  = new THREE.MeshStandardMaterial({ map: createTactileTexture(), roughness: 0.8 });
    this.matRail     = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.35, metalness: 0.85 });
    this.matSleeper  = new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.95 });
    this.matMetal    = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.4, metalness: 0.7 });
    this.matStairs   = new THREE.MeshStandardMaterial({ map: createStairTexture(), roughness: 0.8 });
    this.matRoof     = new THREE.MeshStandardMaterial({ color: 0x4c5a63, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    this.matWood     = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.75 });
    this.matGlow     = new THREE.MeshStandardMaterial({
      color: 0xffcc88, emissive: 0xffaa55, emissiveIntensity: 0.0, roughness: 0.6,
    });
  }

  // ─── Platform slabs + entrance step ────────────────────
  _buildPlatformSlabs() {
    // Step at back door bridging building floor → Platform A
    addBox(this.group, 1.6, PLATFORM_HEIGHT, STEP_Z0 - STEP_Z1,
      DOOR_X, PLATFORM_HEIGHT / 2, (STEP_Z0 + STEP_Z1) / 2, this.matPlatform);

    // Platform A slab
    addBox(this.group, X_HALF * 2, PLATFORM_HEIGHT, PLATFORM_A.zMax - PLATFORM_A.zMin,
      0, PLATFORM_HEIGHT / 2, (PLATFORM_A.zMin + PLATFORM_A.zMax) / 2, this.matPlatform);

    // Platform B slab (island)
    addBox(this.group, X_HALF * 2, PLATFORM_HEIGHT, PLATFORM_B.zMax - PLATFORM_B.zMin,
      0, PLATFORM_HEIGHT / 2, (PLATFORM_B.zMin + PLATFORM_B.zMax) / 2, this.matPlatform);

    // Tactile warning strips on boarding edges
    addBox(this.group, X_HALF * 2, 0.02, 0.3,
      0, PLATFORM_HEIGHT + 0.01, PLATFORM_A.zMin + 0.2, this.matTactile);
    addBox(this.group, X_HALF * 2, 0.02, 0.3,
      0, PLATFORM_HEIGHT + 0.01, PLATFORM_B.zMax - 0.2, this.matTactile);
  }

  // ─── Ballast beds + rails + sleepers ───────────────────
  _buildTracks() {
    addBox(this.group, TRACK_X_MAX - TRACK_X_MIN, BALLAST_TOP - BALLAST_BOTTOM,
      ZONE_1.zMax - ZONE_1.zMin, (TRACK_X_MIN + TRACK_X_MAX) / 2,
      (BALLAST_TOP + BALLAST_BOTTOM) / 2, (ZONE_1.zMin + ZONE_1.zMax) / 2, this.matBallast);

    addBox(this.group, TRACK_X_MAX - TRACK_X_MIN, BALLAST_TOP - BALLAST_BOTTOM,
      ZONE_2.zMax - ZONE_2.zMin, (TRACK_X_MIN + TRACK_X_MAX) / 2,
      (BALLAST_TOP + BALLAST_BOTTOM) / 2, (ZONE_2.zMin + ZONE_2.zMax) / 2, this.matBallast);

    for (const t of Object.values(TRACKS)) {
      this.group.add(buildRails(t.z, t.gauge, this.matRail));
      this.group.add(buildSleepers(t.z, t.gauge, this.matSleeper));
    }
  }

  // ─── Safety fence on the non-boarding edge of Platform B ─
  _buildFences() {
    this.group.add(buildFence(-X_HALF, X_HALF, PLATFORM_B.zMax - 0.05, 1.0, this.matMetal));
    // Far boundary fence beyond track4
    this.group.add(buildFence(-10, 10, FAR_FENCE_Z, 1.2, this.matMetal));
  }

  // ─── Footbridge connecting Platform A → Platform B ─────
  _buildFootbridge() {
    const x = 5.0, width = 1.8;
    const deckY = 4.2;

    // Stair A: platform A → deck
    const stairA = buildRamp(width,
      [x, PLATFORM_HEIGHT, -3.6],
      [x, deckY, -6.8],
      this.matStairs, this.matMetal
    );
    this.group.add(stairA);

    // Deck spanning zone 1 + most of Platform B
    addBox(this.group, width, 0.15, 17.9 - 6.8, x, deckY - 0.075, -(6.8 + 17.9) / 2, this.matPlatform);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.9, 17.9 - 6.8), this.matMetal
      );
      rail.position.set(x + side * (width / 2 - 0.04), deckY + 0.45, -(6.8 + 17.9) / 2);
      this.group.add(rail);
    }
    // Roof over the deck
    addBox(this.group, width + 0.4, 0.12, 17.9 - 6.8 + 0.6,
      x, deckY + 2.3, -(6.8 + 17.9) / 2, this.matRoof);

    // Support column mid-span (clear of both zone-1 tracks)
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, deckY, 8), this.matMetal
    );
    col.position.set(x, deckY / 2, -10.3);
    col.castShadow = true;
    this.group.add(col);

    // Stair B: deck → Platform B
    const stairB = buildRamp(width,
      [x, deckY, -17.9],
      [x, PLATFORM_HEIGHT, -15.0],
      this.matStairs, this.matMetal
    );
    this.group.add(stairB);
  }

  // ─── Waiting shelter + benches on Platform B ───────────
  _buildShelterAndBenches() {
    const shelter = new THREE.Group();
    shelter.position.set(-2, PLATFORM_HEIGHT, -16.0);
    this.group.add(shelter);

    const postH = 2.2;
    for (const [dx, dz] of [[-1.5, -1.0], [1.5, -1.0], [-1.5, 1.0], [1.5, 1.0]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, postH, 8), this.matMetal);
      post.position.set(dx, postH / 2, dz);
      post.castShadow = true;
      shelter.add(post);
    }
    addBox(shelter, 3.2, 0.1, 2.4, 0, postH, 0, this.matRoof);
    addBox(shelter, 1.8, 0.1, 0.4, 0, 0.45, 0, this.matWood);

    // Benches on Platform A too
    addBox(this.group, 1.8, 0.1, 0.4, 3.5, PLATFORM_HEIGHT + 0.45, -5.0, this.matWood);
    addBox(this.group, 1.8, 0.1, 0.4, -3.5, PLATFORM_HEIGHT + 0.45, -15.5, this.matWood);
  }

  // ─── Signage ────────────────────────────────────────────
  _buildSignage() {
    const signs = [
      { number: '1', label: 'Local', x: -4.5, z: -5.0, y: PLATFORM_HEIGHT },
      { number: '2', label: 'Shinkansen', x: -4.5, z: -16.5, y: PLATFORM_HEIGHT },
    ];
    for (const s of signs) {
      const tex = createLineSignTexture(s.number, s.label);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8), this.matMetal
      );
      post.position.set(s.x, s.y + 1.0, s.z);
      post.castShadow = true;
      this.group.add(post);

      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.8),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide })
      );
      board.position.set(s.x, s.y + 1.9, s.z);
      this.group.add(board);
    }
  }

  // ─── Platform lamps ─────────────────────────────────────
  _buildLamps() {
    const positions = [
      [4.5, PLATFORM_A.zMin + 1.0, PLATFORM_HEIGHT],
      [-4.5, PLATFORM_A.zMin + 1.0, PLATFORM_HEIGHT],
      [4.5, PLATFORM_B.zMax - 1.0, PLATFORM_HEIGHT],
      [-4.5, PLATFORM_B.zMax - 1.0, PLATFORM_HEIGHT],
    ];
    for (const [x, z, y] of positions) {
      const group = new THREE.Group();
      group.position.set(x, y, z);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 3.0, 8), this.matMetal
      );
      pole.position.y = 1.5;
      pole.castShadow = true;
      group.add(pole);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), this.matGlow);
      head.position.y = 3.1;
      group.add(head);

      const light = new THREE.PointLight(0xffaa55, 0.0, 9, 2);
      light.position.y = 3.0;
      group.add(light);

      this.group.add(group);
      this._nightLights.push({ light, dayI: 0.0, nightI: 1.3 });
    }
  }

  // ─── Per-frame update ───────────────────────────────────
  /**
   * @param {number} simHour  0.0 – 23.99
   */
  update(simHour) {
    const nf = nightFactor(simHour);
    for (const { light, dayI, nightI } of this._nightLights) {
      light.intensity = THREE.MathUtils.lerp(dayI, nightI, nf);
    }
    this.matGlow.emissiveIntensity = THREE.MathUtils.lerp(0.0, 1.1, nf);
  }
}