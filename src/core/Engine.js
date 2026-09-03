import * as THREE from 'three';
import { Clock }          from './Clock.js';
import { Dashboard }      from '../ui/Dashboard.js';
import { GhostCamera }    from '../camera/GhostCamera.js';
import { Environment }    from '../world/Environment.js';
import { Station }        from '../world/Station.js';
import { Platform }       from '../world/Platform.js';
import { TrainScheduler } from '../systems/TrainScheduler.js';
import { CrowdSystem }    from '../systems/CrowdSystem.js';
import { WeatherSystem }  from '../systems/WeatherSystem.js';
import { AudioSystem }    from '../systems/AudioSystem.js';

class Engine {
  constructor() {
    this._ready   = false;
    this._rafId   = null;
    this._lastNow = null;

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initClock();
    this._initResize();

    this.dashboard = new Dashboard(() => this._onEnter());
  }

  _initRenderer() {
    this.canvas   = document.getElementById('scene-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace   = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene     = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc9d4db, 0.0055);
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 2, -10);
    this.camera.lookAt(0, 2, -20);
  }

  _initClock() {
    this.clock = new Clock({
      onTick:        (h) => this._onTick(h),
      onSimMinute:   (h) => this._onSimMinute(h),
      onSimHour:     (h) => this._onSimHour(h),
      onDayComplete: ()  => console.log('[Clock] New day begun'),
    });
  }

  _onEnter() {
    this.environment    = new Environment(this.scene, this.renderer);
    this.station        = new Station(this.scene);
    this.platform       = new Platform(this.scene, this.station.group.position);
    this.trainScheduler = new TrainScheduler(this.scene, this.platform, this.dashboard);
    this.trainScheduler.registerWithClock(this.clock);
    this.crowdSystem    = new CrowdSystem(this.scene, this.platform, this.trainScheduler);
    this.weather        = new WeatherSystem(this.scene, this.renderer, this.environment);
    this.audio          = new AudioSystem(this.trainScheduler, this.weather, this.clock, this.dashboard);
    this.audio.fadeIn(3.0);

    this.ghostCamera = new GhostCamera(this.camera, this.canvas, this.dashboard);
    this.ghostCamera.teleport(new THREE.Vector3(0, 2, -10), Math.PI, -0.05);
    this.ghostCamera.enable();

    this.clock.start();
    this._ready = true;
    this._loop();
  }

  _loop() {
    this._rafId = requestAnimationFrame(() => this._loop());
    if (!this._ready) return;

    const now = performance.now();
    this.clock.tick(now);

    const dt = Math.min(this._lastNow ? (now - this._lastNow) / 1000 : 0.016, 0.1);
    this._lastNow = now;

    this.ghostCamera?.update(dt);
    this.environment?.update(this.clock.simHour, dt);
    this.station?.update(this.clock.simHour);
    this.platform?.update(this.clock.simHour);
    this.trainScheduler?.update(dt, this.clock.simHour);
    this.crowdSystem?.update(dt, this.clock.simHour);
    this.weather?.update(dt, this.clock.simHour);
    this.audio?.update(dt, this.clock.simHour);

    this.renderer.render(this.scene, this.camera);
  }

  _onTick(simHour) {}

  _onSimMinute(simHour) {
    this.dashboard.updateTime(simHour, this.weather?.label ?? 'clear');
  }

  _onSimHour(simHour) {
    const h = Math.floor(simHour);
    console.log(`[Clock] ${this.clock.formatTime(simHour)} sim time`);
    if (h === 6)  this.dashboard.showTrainBanner('奥津軽いまべつ駅へようこそ', 'Welcome to Okutsugaru-Imabetsu Station');
    if (h === 22) this.dashboard.showTrainBanner('本日もご利用ありがとうございました', 'Thank you for visiting today');
  }

  _initResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });
  }
}

new Engine();