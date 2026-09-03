import * as THREE from 'three';

const _euler   = new THREE.Euler(0, 0, 0, 'YXZ');
const _v3      = new THREE.Vector3();

const MOVE_SPEED      = 8;    // units/sec
const BOOST_MULT      = 3.2;
const LOOK_SENS       = 0.0018;
const MOBILE_LOOK_SENS= 0.004;
const MOBILE_MOVE_SENS= 0.012;
const LERP_FACTOR     = 0.12;
const PITCH_LIMIT     = Math.PI / 2 - 0.04;

export class GhostCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLCanvasElement}       canvas
   * @param {Dashboard}               dashboard
   */
  constructor(camera, canvas, dashboard) {
    this.camera    = camera;
    this.canvas    = canvas;
    this.dashboard = dashboard;
    this.enabled   = false;

    // Movement state
    this._keys     = {};
    this._velocity = new THREE.Vector3();
    this._target   = new THREE.Vector3();

    // Look state
    this._yaw   = 0;   // radians
    this._pitch = 0;

    // Mobile touch state
    this._touches  = {};          // id → {x, y, side}
    this._moveJoy  = { dx: 0, dz: 0 };
    this._lookDelta= { dx: 0, dy: 0 };

    // Pointer lock state
    this._locked = false;

    this._bindDesktop();
    this._bindMobile();
  }

  // ─── Enable / Disable ─────────────────────────────────
  enable() {
    this.enabled = true;
    // Set initial camera rotation from current euler
    _euler.setFromQuaternion(this.camera.quaternion);
    this._yaw   = _euler.y;
    this._pitch = _euler.x;
  }

  disable() {
    this.enabled = false;
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  // ─── Desktop bindings ─────────────────────────────────
  _bindDesktop() {
    // Pointer lock on click
    this.canvas.addEventListener('click', () => {
      if (!this.enabled) return;
      this.canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this._locked = document.pointerLockElement === this.canvas;
      if (this._locked) {
        this.dashboard?.showCrosshair();
      } else {
        this.dashboard?.hideCrosshair();
      }
    });

    // Mouse look
    document.addEventListener('mousemove', (e) => {
      if (!this._locked || !this.enabled) return;
      this._yaw   -= e.movementX * LOOK_SENS;
      this._pitch -= e.movementY * LOOK_SENS;
      this._pitch  = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._pitch));
    });

    // Keys
    document.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;

      // ESC exits pointer lock (browser handles it), but we also clean up
      if (e.code === 'Escape') {
        this._locked = false;
        this.dashboard?.hideCrosshair();
      }
    });

    document.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });
  }

  // ─── Mobile bindings ──────────────────────────────────
  _bindMobile() {
    const W = () => window.innerWidth;

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const side = t.clientX < W() / 2 ? 'left' : 'right';
        this._touches[t.identifier] = {
          x: t.clientX, y: t.clientY,
          startX: t.clientX, startY: t.clientY,
          side
        };
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const prev = this._touches[t.identifier];
        if (!prev) continue;

        const dx = t.clientX - prev.x;
        const dy = t.clientY - prev.y;

        if (prev.side === 'left') {
          // Left thumb → movement joystick
          // dx → strafe, dy → forward/back
          this._moveJoy.dx =  dx * MOBILE_MOVE_SENS;
          this._moveJoy.dz =  dy * MOBILE_MOVE_SENS;
        } else {
          // Right thumb → look
          this._yaw   -= dx * MOBILE_LOOK_SENS;
          this._pitch -= dy * MOBILE_LOOK_SENS;
          this._pitch  = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._pitch));
        }

        // Update previous position
        prev.x = t.clientX;
        prev.y = t.clientY;
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        const prev = this._touches[t.identifier];
        if (prev?.side === 'left') {
          this._moveJoy.dx = 0;
          this._moveJoy.dz = 0;
        }
        delete this._touches[t.identifier];
      }
    };

    this.canvas.addEventListener('touchend',    endTouch, { passive: false });
    this.canvas.addEventListener('touchcancel', endTouch, { passive: false });
  }

  // ─── Per-frame update ─────────────────────────────────
  /**
   * @param {number} dt  delta time in seconds
   */
  update(dt) {
    if (!this.enabled) return;

    // ── Apply rotation ───────────────────────────────────
    _euler.set(this._pitch, this._yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    // ── Compute move direction ───────────────────────────
    const boost   = this._keys['ShiftLeft'] || this._keys['ShiftRight'];
    const speed   = MOVE_SPEED * (boost ? BOOST_MULT : 1);

    // Desktop WASD / arrow keys
    const fwd  = (this._keys['KeyW'] || this._keys['ArrowUp'])    ? 1 : 0;
    const back = (this._keys['KeyS'] || this._keys['ArrowDown'])  ? 1 : 0;
    const left = (this._keys['KeyA'] || this._keys['ArrowLeft'])  ? 1 : 0;
    const rgt  = (this._keys['KeyD'] || this._keys['ArrowRight']) ? 1 : 0;
    const up   = this._keys['Space']     ? 1 : 0;
    const down = this._keys['ControlLeft'] || this._keys['ControlRight'] ? 1 : 0;

    // Mobile joystick deltas (already normalised per frame via sens)
    const mobFwd  = -this._moveJoy.dz;
    const mobSide =  this._moveJoy.dx;

    _v3.set(
      (rgt - left) + mobSide,
      (up  - down),
      (back - fwd) - mobFwd
    );

    if (_v3.lengthSq() > 0) _v3.normalize();
    _v3.multiplyScalar(speed * dt);

    // Transform direction by camera yaw only (no pitch on movement)
    const yawQ = new THREE.Quaternion();
    yawQ.setFromEuler(new THREE.Euler(0, this._yaw, 0, 'YXZ'));
    _v3.applyQuaternion(yawQ);

    // Lerp velocity
    this._velocity.lerp(_v3, LERP_FACTOR);
    this.camera.position.add(this._velocity);

    // Reset mobile joy so it doesn't drift when finger lifts
    this._moveJoy.dx = 0;
    this._moveJoy.dz = 0;
  }

  // ─── Teleport ─────────────────────────────────────────
  /**
   * Instantly move camera to a position + look direction
   * @param {THREE.Vector3} pos
   * @param {number} yaw    radians
   * @param {number} pitch  radians
   */
  teleport(pos, yaw = 0, pitch = 0) {
    this.camera.position.copy(pos);
    this._yaw   = yaw;
    this._pitch = pitch;
    this._velocity.set(0, 0, 0);
  }
}