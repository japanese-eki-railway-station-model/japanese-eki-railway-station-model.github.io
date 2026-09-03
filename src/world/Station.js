import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════
// Building constants
// ═══════════════════════════════════════════════════════════
const WALL_HEIGHT = 3.0;
const HALF_WIDTH  = 6.0;   // building X extent: -6 .. 6
const HALF_DEPTH  = 3.0;   // building Z extent: -3 .. 3  (front=+Z, platform=-Z)
const WALL_THICK  = 0.2;

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
// Procedural textures (canvas-based, no external files → fast load)
// ═══════════════════════════════════════════════════════════
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStuccoTexture() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3000; i++) {
    const shade = 200 + Math.random() * 40;
    ctx.fillStyle = `rgba(${shade},${shade - 6},${shade - 20},0.06)`;
    const x = Math.random() * size, y = Math.random() * size;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  // faint horizontal panel seams
  ctx.strokeStyle = 'rgba(120,110,95,0.15)';
  ctx.lineWidth = 1;
  for (let y = 0; y < size; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  return toTexture(c, 3, 2);
}

function createWoodTexture(base = '#5a3a24', grain = '#3d2716') {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 4) {
    ctx.strokeStyle = grain;
    ctx.globalAlpha = 0.15 + Math.random() * 0.2;
    ctx.beginPath();
    ctx.moveTo(x + (Math.random() * 3 - 1.5), 0);
    ctx.lineTo(x + (Math.random() * 3 - 1.5), size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // plank seams
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < size; y += 42) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  return toTexture(c, 2, 1);
}

function createConcreteTexture(dark = false) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = dark ? '#4a4d52' : '#9a9a94';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const s = 120 + Math.random() * 80;
    ctx.fillStyle = `rgba(${s},${s},${s - 4},0.08)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.6, 1.6);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let x = 0; x < size; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  return toTexture(c, 4, 4);
}

function createRoofTexture() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4c5a63';
  ctx.fillRect(0, 0, size, size);
  // corrugated horizontal ridges
  for (let y = 0; y < size; y += 8) {
    const shade = y % 16 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.18)';
    ctx.fillStyle = shade;
    ctx.fillRect(0, y, size, 3);
  }
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  return toTexture(c, 4, 2);
}

function createSignTexture(mainJa, subEn, w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // JR-style: white body, green top/bottom bands
  ctx.fillStyle = '#f4f2ec';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0a6b3a';
  ctx.fillRect(0, 0, w, h * 0.14);
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.floor(h * 0.32)}px "Noto Serif JP", serif`;
  ctx.fillText(mainJa, w / 2, h * 0.58);
  ctx.font = `${Math.floor(h * 0.13)}px sans-serif`;
  ctx.fillStyle = '#3a3a3a';
  ctx.fillText(subEn, w / 2, h * 0.78);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVendingTexture() {
  const w = 256, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h * 0.16);
  ctx.fillStyle = '#c0392b';
  ctx.font = `bold 34px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('飲料', w / 2, h * 0.11);
  // drink panel grid
  const cols = 3, rows = 6;
  const gridTop = h * 0.20, gridBottom = h * 0.62;
  const cellW = w / cols, cellH = (gridBottom - gridTop) / rows;
  const drinkColors = ['#2e86de', '#f9ca24', '#22a6b3', '#eb4d4b', '#6ab04c', '#f0932b'];
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const x = cIdx * cellW + cellW * 0.15;
      const y = gridTop + r * cellH + cellH * 0.1;
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(x, y, cellW * 0.7, cellH * 0.8);
      ctx.fillStyle = drinkColors[(r + cIdx) % drinkColors.length];
      ctx.fillRect(x + cellW * 0.12, y + cellH * 0.1, cellW * 0.46, cellH * 0.5);
    }
  }
  // coin slot / buy panel
  ctx.fillStyle = '#111111';
  ctx.fillRect(w * 0.1, h * 0.68, w * 0.8, h * 0.22);
  ctx.fillStyle = '#f9ca24';
  ctx.font = `20px sans-serif`;
  ctx.fillText('SUICA / IC', w / 2, h * 0.80);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ═══════════════════════════════════════════════════════════
// Hip roof geometry builder
// ═══════════════════════════════════════════════════════════
function buildHipRoof(halfWidth, halfDepth, overhang, wallTopY, ridgeHeight, ridgeHalfLen, material) {
  const W = halfWidth + overhang;
  const Dd = halfDepth + overhang;
  const Y0 = wallTopY;
  const Y1 = wallTopY + ridgeHeight;
  const R = ridgeHalfLen;

  const A = [-W, Y0, -Dd];
  const B = [ W, Y0, -Dd];
  const C = [ W, Y0,  Dd];
  const Dc = [-W, Y0,  Dd];
  const P = [-R, Y1, 0];
  const Q = [ R, Y1, 0];

  const tris = [
    [Dc, C, Q], [Dc, Q, P],   // front slope
    [B, A, P],  [B, P, Q],    // back slope
    [A, Dc, P],               // left hip
    [C, B, Q],                // right hip
  ];

  const positions = [];
  const uvs = [];
  for (const tri of tris) {
    for (const v of tri) {
      positions.push(v[0], v[1], v[2]);
      uvs.push(v[0] / (W * 2) + 0.5, v[2] / (Dd * 2) + 0.5);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ═══════════════════════════════════════════════════════════
// Low-poly tree
// ═══════════════════════════════════════════════════════════
function buildTree(scale = 1) {
  const group = new THREE.Group();

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.0, 6), trunkMat);
  trunk.position.y = 1.0;
  trunk.castShadow = true;
  group.add(trunk);

  const leafColors = [0x3d6b32, 0x4a7a3a, 0x365e2c];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: leafColors[i % leafColors.length],
      roughness: 1.0,
      flatShading: true,
    });
    const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 - i * 0.12, 0), mat);
    foliage.position.set(
      (Math.random() - 0.5) * 0.5,
      2.0 + i * 0.55,
      (Math.random() - 0.5) * 0.5
    );
    foliage.castShadow = true;
    group.add(foliage);
  }

  group.scale.setScalar(scale);
  return group;
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

// ═══════════════════════════════════════════════════════════
// STATION
// ═══════════════════════════════════════════════════════════
export class Station {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} position  world position of building center
   */
  constructor(scene, position = new THREE.Vector3(0, 0, -20)) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    // World-space reference points other systems can use later
    this.platformDoorPosition = position.clone().add(new THREE.Vector3(-1.8, 0, -HALF_DEPTH));
    this.entrancePosition     = position.clone().add(new THREE.Vector3(0, 0,  HALF_DEPTH + 2));

    this._nightLights   = [];   // { light, dayI, nightI }
    this._nightEmissive = [];   // { material, dayI, nightI }

    this._buildMaterials();
    this._buildFoundation();
    this._buildWalls();
    this._buildDoorsAndWindows();
    this._buildRoof();
    this._buildInterior();
    this._buildSignage();
    this._buildVendingMachines();
    this._buildCanopy();
    this._buildLamps();
    this._buildTrees();
    this._buildApron();
  }

  // ─── Materials ────────────────────────────────────────
  _buildMaterials() {
    this.matStucco = new THREE.MeshStandardMaterial({
      map: createStuccoTexture(), roughness: 0.85, metalness: 0.02,
    });
    this.matWood = new THREE.MeshStandardMaterial({
      map: createWoodTexture(), roughness: 0.7, metalness: 0.0,
    });
    this.matDarkWood = new THREE.MeshStandardMaterial({
      map: createWoodTexture('#3a2a1c', '#241608'), roughness: 0.75,
    });
    this.matConcrete = new THREE.MeshStandardMaterial({
      map: createConcreteTexture(), roughness: 0.95,
    });
    this.matAsphalt = new THREE.MeshStandardMaterial({
      map: createConcreteTexture(true), roughness: 0.95,
    });
    this.matRoof = new THREE.MeshStandardMaterial({
      map: createRoofTexture(), roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide,
    });
    this.matGlass = new THREE.MeshPhysicalMaterial({
      color: 0xaad0e8, roughness: 0.05, metalness: 0.0,
      transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    this.matMetal = new THREE.MeshStandardMaterial({
      color: 0x2b2b2e, roughness: 0.4, metalness: 0.7,
    });
    this.matGlow = new THREE.MeshStandardMaterial({
      color: 0xffcc88, emissive: 0xffaa55, emissiveIntensity: 0.0, roughness: 0.6,
    });
  }

  // ─── Foundation ───────────────────────────────────────
  _buildFoundation() {
    addBox(this.group, HALF_WIDTH * 2 + 0.4, 0.25, HALF_DEPTH * 2 + 0.4,
      0, -0.125, 0, this.matConcrete);
  }

  // ─── Walls (box-segment method, gaps left for openings) ─
  _buildWalls() {
    const H = WALL_HEIGHT, hw = HALF_WIDTH, hd = HALF_DEPTH;
    const walls = new THREE.Group();
    this.group.add(walls);

    // Front wall (z = +hd) — door + 2 windows
    const front = [
      [1.6, H, WALL_THICK, -5.2, H / 2, hd],
      [2.4, 1.0, WALL_THICK, -3.2, 0.5, hd],
      [2.4, 0.6, WALL_THICK, -3.2, 2.7, hd],
      [1.1, H, WALL_THICK, -1.45, H / 2, hd],
      [1.8, 0.8, WALL_THICK, 0, 2.6, hd],
      [1.1, H, WALL_THICK, 1.45, H / 2, hd],
      [2.4, 1.0, WALL_THICK, 3.2, 0.5, hd],
      [2.4, 0.6, WALL_THICK, 3.2, 2.7, hd],
      [1.6, H, WALL_THICK, 5.2, H / 2, hd],
    ];

    // Back wall (z = -hd) — platform door + 1 window
    const back = [
      [3.4, H, WALL_THICK, -4.3, H / 2, -hd],
      [1.6, 0.8, WALL_THICK, -1.8, 2.6, -hd],
      [2.0, H, WALL_THICK, 0, H / 2, -hd],
      [2.4, 1.0, WALL_THICK, 2.2, 0.5, -hd],
      [2.4, 0.6, WALL_THICK, 2.2, 2.7, -hd],
      [2.6, H, WALL_THICK, 4.7, H / 2, -hd],
    ];

    // Left wall (x = -hw) — 1 window
    const left = [
      [WALL_THICK, H, 1.8, -hw, H / 2, -2.1],
      [WALL_THICK, 1.0, 2.4, -hw, 0.5, 0],
      [WALL_THICK, 0.6, 2.4, -hw, 2.7, 0],
      [WALL_THICK, H, 1.8, -hw, H / 2, 2.1],
    ];

    // Right wall (x = +hw) — 1 window
    const right = [
      [WALL_THICK, H, 1.8, hw, H / 2, -2.1],
      [WALL_THICK, 1.0, 2.4, hw, 0.5, 0],
      [WALL_THICK, 0.6, 2.4, hw, 2.7, 0],
      [WALL_THICK, H, 1.8, hw, H / 2, 2.1],
    ];

    for (const [w, h, d, cx, cy, cz] of [...front, ...back, ...left, ...right]) {
      addBox(walls, w, h, d, cx, cy, cz, this.matStucco);
    }
  }

  // ─── Doors & windows (glass panes filling the gaps) ────
  _buildDoorsAndWindows() {
    const hw = HALF_WIDTH, hd = HALF_DEPTH;
    const openings = new THREE.Group();
    this.group.add(openings);

    // Front entrance — glass sliding door
    addBox(openings, 1.8, 2.2, 0.06, 0, 1.1, hd, this.matGlass);
    // Front windows
    addBox(openings, 2.4, 1.4, 0.06, -3.2, 1.7, hd, this.matGlass);
    addBox(openings, 2.4, 1.4, 0.06, 3.2, 1.7, hd, this.matGlass);

    // Back door — solid wood, leads to platform
    addBox(openings, 1.6, 2.2, 0.08, -1.8, 1.1, -hd, this.matDarkWood);
    // Back window
    addBox(openings, 2.4, 1.4, 0.06, 2.2, 1.7, -hd, this.matGlass);

    // Side windows
    addBox(openings, 0.06, 1.4, 2.4, -hw, 1.7, 0, this.matGlass);
    addBox(openings, 0.06, 1.4, 2.4, hw, 1.7, 0, this.matGlass);
  }

  // ─── Roof ───────────────────────────────────────────────
  _buildRoof() {
    const roof = buildHipRoof(
      HALF_WIDTH, HALF_DEPTH, /*overhang*/ 0.6,
      WALL_HEIGHT, /*ridgeHeight*/ 1.6, /*ridgeHalfLen*/ 2.4,
      this.matRoof
    );
    this.group.add(roof);
  }

  // ─── Interior ────────────────────────────────────────
  _buildInterior() {
    const interior = new THREE.Group();
    this.group.add(interior);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_WIDTH * 2 - 0.4, HALF_DEPTH * 2 - 0.4),
      this.matWood
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.03;
    floor.receiveShadow = true;
    interior.add(floor);

    // Bench against back interior wall
    addBox(interior, 1.8, 0.1, 0.4, -3, 0.45, -2.6, this.matWood);
    for (const lx of [-3.7, -2.3]) {
      addBox(interior, 0.06, 0.45, 0.06, lx, 0.225, -2.6, this.matMetal);
    }

    // Ticket counter near front-left interior
    addBox(interior, 1.2, 1.0, 0.6, -4, 0.5, 2.0, this.matDarkWood);
    addBox(interior, 1.0, 0.6, 0.05, -4, 1.5, 1.7, this.matGlass);

    // Ceiling light
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      this.matGlow
    );
    bulb.position.set(0, 2.75, 0);
    interior.add(bulb);
    this._nightEmissive.push({ material: this.matGlow, dayI: 0.0, nightI: 1.1 });

    const interiorLight = new THREE.PointLight(0xffddaa, 0.0, 8, 2);
    interiorLight.position.set(0, 2.6, 0);
    interior.add(interiorLight);
    this._nightLights.push({ light: interiorLight, dayI: 0.0, nightI: 1.3 });
  }

  // ─── Signage ───────────────────────────────────────────
  _buildSignage() {
    const signTex = createSignTexture('奥津軽いまべつ', 'OKUTSUGARU-IMABETSU');

    // Standing sign near entrance path
    const standGroup = new THREE.Group();
    standGroup.position.set(4.6, 0, HALF_DEPTH + 2.6);

    for (const dx of [-1.1, 1.1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.0, 8), this.matMetal
      );
      post.position.set(dx, 1.0, 0);
      post.castShadow = true;
      standGroup.add(post);
    }
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.9),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, side: THREE.DoubleSide })
    );
    board.position.set(0, 1.55, 0);
    standGroup.add(board);
    this.group.add(standGroup);

    // Small nameplate above entrance
    const plateTex = createSignTexture('奥津軽いまべつ駅', ' ');
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.42),
      new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.7, side: THREE.DoubleSide })
    );
    plate.position.set(0, 2.85, HALF_DEPTH + 0.04);
    this.group.add(plate);
  }

  // ─── Vending machines ──────────────────────────────────
  _buildVendingMachines() {
    const vendTex = createVendingTexture();
    const frontMat = new THREE.MeshStandardMaterial({
      map: vendTex, roughness: 0.5, emissive: 0x442200, emissiveIntensity: 0.0,
    });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 });

    const positions = [
      [-5.0, HALF_DEPTH + 1.0],
      [-3.9, HALF_DEPTH + 1.0],
    ];

    for (const [x, z] of positions) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.8, 0.7),
        [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat] // +x -x +y -y +z -z
      );
      mesh.position.set(x, 0.9, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this._nightEmissive.push({ material: frontMat, dayI: 0.0, nightI: 0.9 });
  }

  // ─── Canopy (platform-side lean-to roof) ───────────────
  _buildCanopy() {
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.12, 4.2),
      this.matRoof
    );
    canopy.position.set(0, WALL_HEIGHT + 0.15, -HALF_DEPTH - 1.9);
    canopy.rotation.x = -0.05;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    this.group.add(canopy);

    for (const x of [-3.5, 3.5]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 2.9, 8), this.matMetal
      );
      pole.position.set(x, 1.45, -HALF_DEPTH - 3.7);
      pole.castShadow = true;
      this.group.add(pole);
    }
  }

  // ─── Lamp posts ────────────────────────────────────────
  _buildLamps() {
    const positions = [
      [7, 8], [-7, 8], [0, 15],
    ];
    for (const [x, z] of positions) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 3.2, 8), this.matMetal
      );
      pole.position.y = 1.6;
      pole.castShadow = true;
      group.add(pole);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 8), this.matGlow
      );
      head.position.y = 3.3;
      group.add(head);

      const light = new THREE.PointLight(0xffaa55, 0.0, 10, 2);
      light.position.y = 3.2;
      group.add(light);

      this.group.add(group);
      this._nightLights.push({ light, dayI: 0.0, nightI: 1.4 });
    }
    // Lamp heads share matGlow with the interior bulb — already tracked once
    // in _buildInterior(), so all glow together without duplicate entries.
  }

  // ─── Trees ─────────────────────────────────────────────
  _buildTrees() {
    const positions = [
      [-9, 2, 1.0], [9, -1, 0.85], [-8, -6, 1.1], [10, 6, 0.9],
    ];
    for (const [x, z, scale] of positions) {
      const tree = buildTree(scale);
      tree.position.set(x, 0, z);
      this.group.add(tree);
    }
  }

  // ─── Entrance apron / paved path ───────────────────────
  _buildApron() {
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 10),
      this.matAsphalt
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, 0.012, HALF_DEPTH + 6);
    apron.receiveShadow = true;
    this.group.add(apron);
  }

  // ─── Per-frame update ──────────────────────────────────
  /**
   * @param {number} simHour  0.0 – 23.99
   */
  update(simHour) {
    const nf = nightFactor(simHour);
    for (const { light, dayI, nightI } of this._nightLights) {
      light.intensity = THREE.MathUtils.lerp(dayI, nightI, nf);
    }
    for (const { material, dayI, nightI } of this._nightEmissive) {
      material.emissiveIntensity = THREE.MathUtils.lerp(dayI, nightI, nf);
    }
  }
}