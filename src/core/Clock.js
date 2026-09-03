// 24 real minutes = 24 simulated hours
// 1 real second    = 60 sim seconds  = 1 sim minute
// 1 real minute    = 1 sim hour

const REAL_DURATION_MS = 24 * 60 * 1000; // 1,440,000 ms

export class Clock {
  /**
   * @param {object} callbacks
   * @param {function} callbacks.onTick        (simHour: number) — every frame
   * @param {function} callbacks.onSimMinute   (simHour: number) — every sim minute (~1 real sec)
   * @param {function} callbacks.onSimHour     (simHour: number) — every sim hour  (~1 real min)
   * @param {function} callbacks.onDayComplete ()               — full 24hr cycle done
   */
  constructor(callbacks = {}) {
    this.onTick        = callbacks.onTick        ?? null;
    this.onSimMinute   = callbacks.onSimMinute   ?? null;
    this.onSimHour     = callbacks.onSimHour     ?? null;
    this.onDayComplete = callbacks.onDayComplete ?? null;

    // Start at 05:00 (dawn) so first thing you see is sunrise
    this._startSimHour = 5.0;

    this._running      = false;
    this._realElapsed  = 0;       // ms of real time elapsed in current day
    this._lastReal     = null;    // performance.now() at last tick

    this._lastSimMinute = -1;
    this._lastSimHour   = -1;

    // Registered scheduled events: { simHour, callback, repeat, _fired }
    this._events = [];
  }

  // ─── Control ──────────────────────────────────────────
  start() {
    // Convert start hour to ms offset into the real 24-min window
    this._realElapsed = (this._startSimHour / 24) * REAL_DURATION_MS;
    this._lastReal    = performance.now();
    this._running     = true;
  }

  pause()  { this._running = false; }
  resume() {
    this._lastReal = performance.now();
    this._running  = true;
  }

  // ─── Schedule ─────────────────────────────────────────
  /**
   * Fire a callback at a specific sim hour each day
   * @param {number}   simHour  e.g. 6.0 = 06:00, 18.5 = 18:30
   * @param {function} callback
   * @param {boolean}  repeat   if true, fires every day cycle
   */
  at(simHour, callback, repeat = true) {
    this._events.push({ simHour, callback, repeat, _fired: false });
  }

  // ─── Per-frame tick ───────────────────────────────────
  /**
   * Call this from your main render loop
   * @param {number} nowMs  performance.now()
   */
  tick(nowMs) {
    if (!this._running) return;

    const dt = nowMs - this._lastReal;
    this._lastReal = nowMs;

    this._realElapsed += dt;

    // Day rollover
    if (this._realElapsed >= REAL_DURATION_MS) {
      this._realElapsed -= REAL_DURATION_MS;
      this._lastSimMinute = -1;
      this._lastSimHour   = -1;
      // Reset daily events
      for (const ev of this._events) ev._fired = false;
      this.onDayComplete?.();
    }

    const simHour = this._realToSimHour(this._realElapsed);

    // ── onTick every frame ───────────────────────────────
    this.onTick?.(simHour);

    // ── onSimMinute ──────────────────────────────────────
    const simMinTotal = Math.floor(simHour * 60); // 0-1439
    if (simMinTotal !== this._lastSimMinute) {
      this._lastSimMinute = simMinTotal;
      this.onSimMinute?.(simHour);
    }

    // ── onSimHour ────────────────────────────────────────
    const simHourInt = Math.floor(simHour);
    if (simHourInt !== this._lastSimHour) {
      this._lastSimHour = simHourInt;
      this.onSimHour?.(simHour);
    }

    // ── Scheduled events ─────────────────────────────────
    for (const ev of this._events) {
      if (ev._fired) continue;
      if (simHour >= ev.simHour) {
        ev._fired = true;
        ev.callback(simHour);
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────
  _realToSimHour(realMs) {
    return (realMs / REAL_DURATION_MS) * 24;
  }

  /**
   * Current sim hour as a formatted string  "HH:MM"
   */
  formatTime(simHour) {
    const h = Math.floor(simHour) % 24;
    const m = Math.floor((simHour % 1) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /**
   * Normalised day progress 0.0 → 1.0
   */
  get progress() {
    return this._realElapsed / REAL_DURATION_MS;
  }

  /**
   * Current sim hour (0.0 – 23.99)
   */
  get simHour() {
    return this._realToSimHour(this._realElapsed);
  }

  /**
   * Real delta time of last frame in seconds
   * Useful for systems that need dt
   */
  get dtSeconds() {
    return this._lastDt ?? 0;
  }
}