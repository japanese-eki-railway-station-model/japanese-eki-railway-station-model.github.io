import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════
// Weather state definitions
// ═══════════════════════════════════════════════════════════
const WEATHER_STATES = {
  clear:  { label: '晴れ',  fogMult: 1.0, windStr: 0.0, rainInt: 0.0, snowInt: 0.0, transTime: 30 },
  cloud:  { label: '曇り',  fogMult: 1.8, windStr: 0.1, rainInt: 0.0, snowInt: 0.0, transTime: 40 },
  rain:   { label: '雨',    fogMult: 2.8, windStr: 0.4, rainInt: 1.0, snowInt: 0.0, transTime: 25 },
  storm:  { label: '嵐',    fogMult: 4.2, windStr: 1.0, rainInt: 1.8, snowInt: 0.0, transTime: 15 },
  fog:    { label: '霧',    fogMult: 7.0, windStr: 0.0, rainInt: 0.0, snowInt: 0.0, transTime: 60 },
  snow:   { label: '雪',    fogMult: 3.5, windStr: 0.2, rainInt: 0.0, snowInt: 1.0, transTime: 35 },
};

// Transition probability table — [from][to] weights
// Higher numbers = more likely to transition to that state
const TRANSITION = {
  clear:  { clear: 8, cloud: 5, rain: 2, storm: 0, fog: 2, snow: 1 },
  cloud:  { clear: 4, cloud: 6, rain: 4, storm: 1, fog: 2, snow: 1 },
  rain:   { clear: 2, cloud: 4, rain: 5, storm: 2, fog: 1, snow: 0 },
  storm:  { clear: 1, cloud: 3, rain: 5, storm: 2, fog: 0, snow: 0 },
  fog:    { clear: 4, cloud: 3, rain: 1, storm: 0, fog: 4, snow: 1 },
  snow:   { clear: 2, cloud: 3, rain: 1, storm: 0, fog: 2, snow: 4 },
};

// Duration range (real seconds) for each weather type
const DURATION = {
  clear: [90, 180], cloud: [60, 120], rain: [40, 90],
  storm: [20, 50],  fog:  [60, 150], snow: [50, 110],
};

// Snow is more likely during night/early morning (sim hours)
const SNOW_BIAS_HOURS = { start: 20, end: 8 };  // 20:00 – 08:00

// ═══════════════════════════════════════════════════════════
// Particle system builder (rain + snow share same approach)
// ═══════════════════════════════════════════════════════════
function buildParticleSystem(count, color, size) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 220;
    pos[i * 3 + 1] = Math.random() * 80;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 220;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, transparent: true, opacity: 0.0, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

// ═══════════════════════════════════════════════════════════
// Wind — moves scene objects (trees sway, rain tilts)
// ═══════════════════════════════════════════════════════════
class WindSystem {
  constructor() {
    this.strength  = 0;     // 0-1
    this.direction = new THREE.Vector2(1, 0.3);  // XZ plane
    this._time     = 0;
    this._gustTime = 0;
    this._gust     = 0;
  }

  update(dt, targetStrength) {
    this._time     += dt;
    this._gustTime += dt;

    // Random gust every 4-12 seconds
    if (this._gustTime > 4 + Math.random() * 8) {
      this._gustTime = 0;
      this._gust = targetStrength * (0.3 + Math.random() * 0.7);
    }
    this._gust = THREE.MathUtils.lerp(this._gust, 0, dt * 0.5);

    this.strength = THREE.MathUtils.lerp(
      this.strength,
      targetStrength + this._gust,
      dt * 0.3
    );

    // Slowly rotate wind direction
    const angle = this._time * 0.05;
    this.direction.set(Math.cos(angle), Math.sin(angle) * 0.4).normalize();
  }

  /** Sway amount for trees (radians) */
  get treeSway() {
    return this.strength * 0.12 * (1 + Math.sin(this._time * 2.3) * 0.3);
  }

  /** Tilt angle for rain particles */
  get rainTilt() {
    return this.strength * 0.35;
  }
}

// ═══════════════════════════════════════════════════════════
// WEATHER SYSTEM
// ═══════════════════════════════════════════════════════════
export class WeatherSystem {
  /**
   * @param {THREE.Scene}          scene
   * @param {THREE.WebGLRenderer}  renderer
   * @param {Environment}          environment   to drive fog + rain from Environment
   */
  constructor(scene, renderer, environment) {
    this.scene       = scene;
    this.renderer    = renderer;
    this.environment = environment;

    // Current / target state
    this.current     = 'clear';
    this._target     = 'clear';
    this._transition = 0;    // 0-1 blend between current and target states
    this._stateTimer = 0;
    this._stateDuration = this._pickDuration('clear');

    // Interpolated values (what the scene actually reads)
    this.fogMult   = 1.0;
    this.windStr   = 0.0;
    this.rainInt   = 0.0;
    this.snowInt   = 0.0;

    // Particles
    this._rain = buildParticleSystem(7000, 0xaabbcc, 0.07);
    this._snow = buildParticleSystem(3500, 0xffffff, 0.18);
    scene.add(this._rain, this._snow);

    // Wind
    this._wind = new WindSystem();

    // Lightning flash state
    this._lightningTimer    = 0;
    this._lightningInterval = 8 + Math.random() * 12;
    this._lightningFlash    = new THREE.PointLight(0xdde8ff, 0.0, 800);
    this._lightningFlash.position.set(20, 80, -30);
    scene.add(this._lightningFlash);
    this._flashDuration = 0;

    // Expose current weather label for Dashboard HUD
    this.label = '晴れ';
  }

  // ─── Main update ──────────────────────────────────────
  /**
   * @param {number} dt        real delta seconds
   * @param {number} simHour   0–23.99
   */
  update(dt, simHour) {
    this._stateTimer += dt;

    // ── Decide next state ─────────────────────────────
    if (this._stateTimer >= this._stateDuration && this._transition >= 0.98) {
      this.current      = this._target;
      this._stateTimer  = 0;
      this._stateDuration = this._pickDuration(this.current);
      this._target      = this._pickNext(this.current, simHour);
      this._transition  = 0;
    }

    // ── Blend toward target ───────────────────────────
    const transTime = WEATHER_STATES[this._target]?.transTime ?? 30;
    this._transition = Math.min(1, this._transition + dt / transTime);
    const t = this._transition;

    const A = WEATHER_STATES[this.current];
    const B = WEATHER_STATES[this._target];

    this.fogMult  = THREE.MathUtils.lerp(A.fogMult,  B.fogMult,  t);
    this.windStr  = THREE.MathUtils.lerp(A.windStr,  B.windStr,  t);
    this.rainInt  = THREE.MathUtils.lerp(A.rainInt,  B.rainInt,  t);
    this.snowInt  = THREE.MathUtils.lerp(A.snowInt,  B.snowInt,  t);
    this.label    = t > 0.5 ? B.label : A.label;

    // ── Wind ─────────────────────────────────────────
    this._wind.update(dt, this.windStr);

    // ── Particles ─────────────────────────────────────
    this._updateRain(dt);
    this._updateSnow(dt);

    // ── Lightning ─────────────────────────────────────
    if (this.current === 'storm' || this._target === 'storm') {
      this._updateLightning(dt);
    } else {
      this._lightningFlash.intensity = 0;
    }

    // ── Push values to Environment ────────────────────
    if (this.environment) {
      // Override fog density
      const baseDensity = this.environment.scene?.fog?.density ?? 0.006;
      if (this.scene.fog) {
        this.scene.fog.density = THREE.MathUtils.lerp(
          this.scene.fog.density,
          0.006 * this.fogMult,
          dt * 0.5
        );
      }
      // Let Environment know the active weather string
      this.environment.currentWeather = this.current;
    }

    // ── Tone mapping exposure by weather ─────────────
    let targetExp = 1.0;
    if (this.current === 'storm') targetExp = 0.6;
    else if (this.current === 'rain') targetExp = 0.75;
    else if (this.current === 'fog')  targetExp = 0.7;
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(
      this.renderer.toneMappingExposure, targetExp, dt * 0.4
    );
  }

  // ─── Rain particles ────────────────────────────────
  _updateRain(dt) {
    const intensity = Math.min(this.rainInt, 1.5);
    this._rain.material.opacity = THREE.MathUtils.lerp(
      this._rain.material.opacity, intensity * 0.45, dt * 1.2
    );
    if (intensity < 0.01) return;

    const speed = 28 + this.windStr * 14;
    const tilt  = this._wind.rainTilt;
    const pos   = this._rain.geometry.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - speed * dt;
      let x = pos.getX(i) + tilt * this._wind.direction.x * speed * dt * 0.25;
      let z = pos.getZ(i) + tilt * this._wind.direction.y * speed * dt * 0.25;

      if (y < 0) {
        y = 70 + Math.random() * 10;
        x = (Math.random() - 0.5) * 220;
        z = (Math.random() - 0.5) * 220;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  // ─── Snow particles ────────────────────────────────
  _updateSnow(dt) {
    this._snow.material.opacity = THREE.MathUtils.lerp(
      this._snow.material.opacity, this.snowInt * 0.7, dt * 0.8
    );
    if (this.snowInt < 0.01) return;

    const fallSpeed = 2.5;
    const drift     = this._wind.strength * 0.4;
    const pos       = this._snow.geometry.attributes.position;
    const t         = performance.now() * 0.0005;

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i) - fallSpeed * dt;
      let z = pos.getZ(i);

      // Gentle swaying drift
      x += Math.sin(t + i * 0.3) * 0.015 + drift * this._wind.direction.x * dt;
      z += Math.cos(t + i * 0.5) * 0.015 + drift * this._wind.direction.y * dt;

      if (y < 0) {
        y = 70 + Math.random() * 10;
        x = (Math.random() - 0.5) * 220;
        z = (Math.random() - 0.5) * 220;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  // ─── Lightning ─────────────────────────────────────
  _updateLightning(dt) {
    this._lightningTimer += dt;
    this._flashDuration  -= dt;

    if (this._flashDuration > 0) {
      // Flickering flash
      this._lightningFlash.intensity = this._flashDuration > 0.08
        ? 3.5 + Math.random() * 1.5 : 0;
    } else {
      this._lightningFlash.intensity = 0;
    }

    if (this._lightningTimer > this._lightningInterval) {
      this._lightningTimer    = 0;
      this._lightningInterval = 6 + Math.random() * 14;
      this._flashDuration     = 0.12 + Math.random() * 0.1;

      // Randomise position each strike
      this._lightningFlash.position.set(
        (Math.random() - 0.5) * 100,
        60 + Math.random() * 30,
        (Math.random() - 0.5) * 100
      );
    }
  }

  // ─── State machine helpers ─────────────────────────
  _pickNext(from, simHour) {
    const weights = { ...TRANSITION[from] };

    // Suppress snow during warm hours (09:00-18:00 sim)
    if (simHour >= 9 && simHour <= 18) weights.snow = 0;

    // Boost snow chance at night
    const isNightHour = simHour >= SNOW_BIAS_HOURS.start || simHour < SNOW_BIAS_HOURS.end;
    if (isNightHour) weights.snow = (weights.snow ?? 0) * 2.5;

    // Suppress storm at dawn/night (too calm for cinema purposes)
    if (simHour < 7 || simHour > 22) weights.storm = 0;

    const keys   = Object.keys(weights);
    const total  = keys.reduce((s, k) => s + weights[k], 0);
    let roll     = Math.random() * total;

    for (const key of keys) {
      roll -= weights[key];
      if (roll <= 0) return key;
    }
    return 'clear';
  }

  _pickDuration(state) {
    const [min, max] = DURATION[state] ?? [60, 120];
    return min + Math.random() * (max - min);
  }

  // ─── Public getters ────────────────────────────────
  get windSway()     { return this._wind.treeSway; }
  get windDirection(){ return this._wind.direction; }
  get isStorming()   { return this.current === 'storm' && this._transition > 0.6; }
}