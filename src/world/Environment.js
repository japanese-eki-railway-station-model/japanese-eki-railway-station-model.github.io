import * as THREE from 'three';

// ─── Colour keyframes for sky (top) and horizon ──────────
// Each entry: [simHour, topHex, horizonHex]
const SKY_KEYS = [
  [  0, 0x00010a, 0x05091a ],   // deep night
  [  4, 0x00010a, 0x05091a ],   // deep night
  [  5, 0x0a0a1f, 0x1a1030 ],   // pre-dawn
  [  6, 0x1a1040, 0xd4510a ],   // sunrise — orange horizon
  [  7, 0x2255aa, 0xf0a050 ],   // early morning
  [  8, 0x3a7fd4, 0xc8dff5 ],   // morning blue
  [ 12, 0x2266cc, 0xadd4f5 ],   // noon
  [ 16, 0x2a5fbb, 0xb8d8f0 ],   // afternoon
  [ 18, 0x1a3a7a, 0xf07830 ],   // golden hour
  [ 19, 0x0d1a40, 0xd0420a ],   // sunset
  [ 20, 0x040818, 0x200818 ],   // dusk
  [ 21, 0x00010a, 0x05091a ],   // night
  [ 24, 0x00010a, 0x05091a ],   // night
];

// ─── Ambient light intensity & colour keyframes ──────────
// [simHour, intensity, hexColour]
const AMBIENT_KEYS = [
  [  0, 0.04, 0x101828 ],
  [  5, 0.08, 0x201828 ],
  [  6, 0.30, 0xff8844 ],
  [  7, 0.55, 0xffd0a0 ],
  [  8, 0.75, 0xfff5e8 ],
  [ 12, 0.85, 0xffffff ],
  [ 17, 0.70, 0xffe8c0 ],
  [ 18, 0.50, 0xff9944 ],
  [ 19, 0.25, 0xff5522 ],
  [ 20, 0.10, 0x201020 ],
  [ 21, 0.04, 0x101828 ],
  [ 24, 0.04, 0x101828 ],
];

// ─── Sun light intensity & colour keyframes ──────────────
const SUN_KEYS = [
  [  0, 0.0,  0xffffff ],
  [  5, 0.0,  0xffffff ],
  [  6, 0.6,  0xff8833 ],
  [  7, 1.0,  0xffcc88 ],
  [  8, 1.4,  0xfff5e0 ],
  [ 12, 1.6,  0xffffff ],
  [ 17, 1.3,  0xffe8c0 ],
  [ 18, 0.9,  0xff9944 ],
  [ 19, 0.4,  0xff5522 ],
  [ 20, 0.0,  0xffffff ],
  [ 24, 0.0,  0xffffff ],
];

// ─── Fog density keyframes ────────────────────────────────
const FOG_KEYS = [
  [  0, 0.018 ],
  [  5, 0.022 ],   // morning mist
  [  7, 0.014 ],
  [  8, 0.006 ],
  [ 16, 0.005 ],
  [ 18, 0.010 ],
  [ 20, 0.016 ],
  [ 24, 0.018 ],
];

// ─── Helpers ─────────────────────────────────────────────
function lerpColour(a, b, t) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t);
}

function sampleKeys(keys, simHour) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [h0, ...v0] = keys[i];
    const [h1, ...v1] = keys[i + 1];
    if (simHour >= h0 && simHour < h1) {
      const t = (simHour - h0) / (h1 - h0);
      return { t, v0, v1 };
    }
  }
  return { t: 0, v0: keys[keys.length - 1].slice(1), v1: keys[keys.length - 1].slice(1) };
}

// ─── Sky mesh (fullscreen gradient quad) ─────────────────
function buildSkyMesh() {
  const geo = new THREE.SphereGeometry(1000, 32, 16);
  // Flip normals inward
  geo.scale(-1, 1, 1);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTopColor:  { value: new THREE.Color(0x00010a) },
      uHoriColor: { value: new THREE.Color(0x05091a) },
      uSunPos:    { value: new THREE.Vector3(0, -1, 0) },
      uSunColor:  { value: new THREE.Color(1, 0.6, 0.2) },
      uSunVis:    { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3  uTopColor;
      uniform vec3  uHoriColor;
      uniform vec3  uSunPos;
      uniform vec3  uSunColor;
      uniform float uSunVis;

      varying vec3 vWorldPos;

      void main() {
        vec3 dir    = normalize(vWorldPos);
        float t     = clamp(dir.y * 1.8 + 0.3, 0.0, 1.0);
        vec3 sky    = mix(uHoriColor, uTopColor, t);

        // Sun disc
        float sunD  = dot(dir, normalize(uSunPos));
        float disc  = smoothstep(0.9992, 0.9998, sunD);
        float glow  = pow(max(sunD, 0.0), 64.0) * 0.35;
        sky += (disc + glow) * uSunColor * uSunVis;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
    side:        THREE.BackSide,
    depthWrite:  false,
  });

  return new THREE.Mesh(geo, mat);
}

// ─── Stars ───────────────────────────────────────────────
function buildStars() {
  const count = 2800;
  const pos   = new Float32Array(count * 3);
  const r     = 900;
  for (let i = 0; i < count; i++) {
    // Random points on upper hemisphere (and some lower)
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(1 - Math.random() * 1.6); // bias toward upper
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    color:       0xffffff,
    size:        0.9,
    sizeAttenuation: true,
    transparent: true,
    opacity:     0.0,
    depthWrite:  false,
  });

  return new THREE.Points(geo, mat);
}

// ─── Ground ──────────────────────────────────────────────
function buildGround() {
  const geo = new THREE.PlaneGeometry(2000, 2000, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0x3a4a30 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

// ─── Rain particles ──────────────────────────────────────
function buildRain() {
  const count = 6000;
  const pos   = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 200;
    pos[i * 3 + 1] = Math.random() * 80;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 200;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color:       0xaabbcc,
    size:        0.08,
    transparent: true,
    opacity:     0.0,
    depthWrite:  false,
  });
  return new THREE.Points(geo, mat);
}

// ═══════════════════════════════════════════════════════════
export class Environment {
  /**
   * @param {THREE.Scene}           scene
   * @param {THREE.WebGLRenderer}   renderer
   */
  constructor(scene, renderer) {
    this.scene    = scene;
    this.renderer = renderer;

    // Weather state
    this.currentWeather  = 'clear';
    this._weatherTimer   = 0;
    this._nextWeatherIn  = this._randomWeatherInterval();
    this._rainIntensity  = 0;   // 0-1 lerp target

    // Build scene elements
    this.skyMesh  = buildSkyMesh();
    this.stars    = buildStars();
    this.ground   = buildGround();
    this.rain     = buildRain();

    scene.add(this.skyMesh, this.stars, this.ground, this.rain);

    // Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.04);
    scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far  = 500;
    this.sunLight.shadow.camera.left   = -80;
    this.sunLight.shadow.camera.right  =  80;
    this.sunLight.shadow.camera.top    =  80;
    this.sunLight.shadow.camera.bottom = -80;
    this.sunLight.shadow.bias = -0.0004;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target); // target stays at origin

    // Soft fill from opposite side
    this.fillLight = new THREE.DirectionalLight(0x8899bb, 0.0);
    scene.add(this.fillLight);
  }

  // ─── Per-frame update ─────────────────────────────────
  /**
   * @param {number} simHour  0.0 – 23.99
   * @param {number} dt       real delta seconds
   */
  update(simHour, dt) {
    this._updateSky(simHour);
    this._updateLights(simHour);
    this._updateFog(simHour);
    this._updateStars(simHour);
    this._updateWeather(dt);
    this._updateRain(dt);
  }

  // ─── Sky ──────────────────────────────────────────────
  _updateSky(simHour) {
    const { t, v0, v1 } = sampleKeys(SKY_KEYS, simHour);

    const topCol  = lerpColour(v0[0], v1[0], t);
    const horCol  = lerpColour(v0[1], v1[1], t);

    const u = this.skyMesh.material.uniforms;
    u.uTopColor.value.copy(topCol);
    u.uHoriColor.value.copy(horCol);

    // Sun position — arc from east (-X) over south (+Z up) to west (+X)
    const sunAngle = ((simHour - 6) / 12) * Math.PI; // 0 at 06:00, π at 18:00
    const sunX     = -Math.cos(sunAngle);
    const sunY     =  Math.sin(sunAngle) * 0.95;
    const sunZ     = -0.15;

    u.uSunPos.value.set(sunX, sunY, sunZ).normalize();
    u.uSunColor.value.set(1.0, sunY > 0.3 ? 0.95 : 0.55, sunY > 0.3 ? 0.85 : 0.2);

    // Sun only visible during day
    const vis = THREE.MathUtils.clamp(sunY * 3.5, 0, 1);
    u.uSunVis.value = vis;
  }

  // ─── Lights ───────────────────────────────────────────
  _updateLights(simHour) {
    // Ambient
    {
      const { t, v0, v1 } = sampleKeys(AMBIENT_KEYS, simHour);
      this.ambientLight.intensity = THREE.MathUtils.lerp(v0[0], v1[0], t);
      this.ambientLight.color.copy(lerpColour(v0[1], v1[1], t));
    }

    // Sun directional
    {
      const { t, v0, v1 } = sampleKeys(SUN_KEYS, simHour);
      this.sunLight.intensity = THREE.MathUtils.lerp(v0[0], v1[0], t);
      this.sunLight.color.copy(lerpColour(v0[1], v1[1], t));

      // Match sun light direction to sky sun position
      const su = this.skyMesh.material.uniforms.uSunPos.value;
      this.sunLight.position.copy(su).multiplyScalar(150);
      this.sunLight.target.position.set(0, 0, 0);

      // Fill light opposite sun, weaker
      this.fillLight.position.set(-su.x * 100, 30, -su.z * 100);
      this.fillLight.intensity = this.sunLight.intensity * 0.18;
    }
  }

  // ─── Fog ──────────────────────────────────────────────
  _updateFog(simHour) {
    const { t, v0, v1 } = sampleKeys(FOG_KEYS, simHour);
    let density = THREE.MathUtils.lerp(v0[0], v1[0], t);

    // Weather modifies fog
    if (this.currentWeather === 'rain')  density *= 2.2;
    if (this.currentWeather === 'storm') density *= 3.5;
    if (this.currentWeather === 'fog')   density *= 5.0;

    this.scene.fog.density = density;

    // Fog colour tracks horizon
    const u = this.skyMesh.material.uniforms;
    this.scene.fog.color.copy(u.uHoriColor.value);
  }

  // ─── Stars ────────────────────────────────────────────
  _updateStars(simHour) {
    // Visible fully at night, fade at dawn/dusk
    let opacity = 0;
    if (simHour < 5)        opacity = 1.0;
    else if (simHour < 6.5) opacity = 1.0 - (simHour - 5) / 1.5;
    else if (simHour > 20)  opacity = (simHour - 20) / 1.5;

    this.stars.material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);

    // Slow rotation for realism
    this.stars.rotation.y += 0.000015;
  }

  // ─── Weather system ───────────────────────────────────
  _updateWeather(dt) {
    this._weatherTimer += dt;
    if (this._weatherTimer < this._nextWeatherIn) return;

    this._weatherTimer   = 0;
    this._nextWeatherIn  = this._randomWeatherInterval();

    const roll = Math.random();
    // Weighted random
    if      (roll < 0.50) this.currentWeather = 'clear';
    else if (roll < 0.70) this.currentWeather = 'cloud';
    else if (roll < 0.85) this.currentWeather = 'rain';
    else if (roll < 0.93) this.currentWeather = 'fog';
    else                  this.currentWeather = 'storm';
  }

  _randomWeatherInterval() {
    // Between 60s and 180s real time
    return 60 + Math.random() * 120;
  }

  // ─── Rain ─────────────────────────────────────────────
  _updateRain(dt) {
    const isRaining = this.currentWeather === 'rain' || this.currentWeather === 'storm';
    const target    = isRaining
      ? (this.currentWeather === 'storm' ? 0.85 : 0.5)
      : 0.0;

    this._rainIntensity = THREE.MathUtils.lerp(this._rainIntensity, target, dt * 0.8);
    this.rain.material.opacity = this._rainIntensity * 0.55;

    if (this._rainIntensity < 0.01) return;

    // Animate rain drops falling
    const positions = this.rain.geometry.attributes.position;
    const count     = positions.count;
    const speed     = 28 + (this.currentWeather === 'storm' ? 20 : 0);

    for (let i = 0; i < count; i++) {
      let y = positions.getY(i) - speed * dt;
      if (y < 0) {
        y = 70 + Math.random() * 10;
        positions.setX(i, (Math.random() - 0.5) * 200);
        positions.setZ(i, (Math.random() - 0.5) * 200);
      }
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
  }

  // ─── Exposure tweak for tone mapping ──────────────────
  _updateExposure(simHour) {
    let exp = 1.0;
    if (simHour >= 20 || simHour < 5) exp = 0.6;
    else if (simHour < 7)              exp = 0.75;
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(
      this.renderer.toneMappingExposure, exp, 0.02
    );
  }
}