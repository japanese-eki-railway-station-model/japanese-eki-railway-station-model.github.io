// ═══════════════════════════════════════════════════════════
// AudioSystem.js
// Manages all audio: ambient, announcements, train events,
// weather sounds. All MP3s live in public/audio/announcements/
// ═══════════════════════════════════════════════════════════

const BASE = '/audio/announcements/';

// ─── File manifest ────────────────────────────────────────
const FILES = {
  // Announcements
  shinkansen_arrive:   BASE + 'announce_shinkansen_arrive.mp3',
  shinkansen_depart:   BASE + 'announce_shinkansen_depart.mp3',
  shinkansen_passing:  BASE + 'announce_shinkansen_passing.mp3',
  local_arrive:        BASE + 'announce_local_arrive.mp3',
  local_depart:        BASE + 'announce_local_depart.mp3',
  local_last:          BASE + 'announce_local_last.mp3',
  morning:             BASE + 'announce_morning.mp3',
  noon:                BASE + 'announce_noon.mp3',
  night:               BASE + 'announce_night.mp3',
  weather_rain:        BASE + 'announce_weather_rain.mp3',
  weather_storm:       BASE + 'announce_weather_storm.mp3',
  mind_gap:            BASE + 'announce_mind_gap.mp3',
  no_smoking:          BASE + 'announce_no_smoking.mp3',
};

// ─── Helpers ──────────────────────────────────────────────
function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

// ═══════════════════════════════════════════════════════════
// AUDIO SYSTEM
// ═══════════════════════════════════════════════════════════
export class AudioSystem {
  /**
   * @param {TrainScheduler} trainScheduler
   * @param {WeatherSystem}  weatherSystem
   * @param {Clock}          clock
   * @param {Dashboard}      dashboard
   */
  constructor(trainScheduler, weatherSystem, clock, dashboard) {
    this.trainScheduler = trainScheduler;
    this.weatherSystem  = weatherSystem;
    this.clock          = clock;
    this.dashboard      = dashboard;

    this._ctx           = null;   // AudioContext, created on first user interaction
    this._buffers       = {};     // key → AudioBuffer
    this._loaded        = false;
    this._muted         = false;
    this._masterGain    = null;

    // Announcement queue — one at a time, never overlap
    this._announceQueue = [];
    this._announcing    = false;

    // State tracking to avoid duplicate triggers
    this._lastWeather   = null;
    this._lastHour      = -1;

    // Random announcement timers (sim seconds)
    this._mindGapTimer  = 0;
    this._noSmokingTimer= 0;
    this._mindGapInterval   = 900  + Math.random() * 900;   // ~15-30 sim min
    this._noSmokingInterval = 1200 + Math.random() * 1200;  // ~20-40 sim min

    // Init audio context on first click/touch (browser autoplay policy)
    const resume = async () => {
      await this._initContext();
      document.removeEventListener('click',    resume);
      document.removeEventListener('touchend', resume);
    };
    document.addEventListener('click',    resume, { once: true });
    document.addEventListener('touchend', resume, { once: true });

    // Hook into TrainScheduler
    if (trainScheduler) {
      const prev = trainScheduler.onEvent;
      trainScheduler.onEvent = (type, service) => {
        prev?.(type, service);
        this._onTrainEvent(type, service);
      };
    }

    // Schedule time-based announcements via clock
    if (clock) {
      clock.at(6.0,  () => this._queue('morning'));
      clock.at(12.0, () => this._queue('noon'));
      clock.at(22.0, () => this._queue('night'));
    }
  }

  // ─── AudioContext init + load ──────────────────────────
  async _initContext() {
    if (this._ctx) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = 1.0;
      this._masterGain.connect(this._ctx.destination);
      await this._loadAll();
      this._loaded = true;
      console.log('[AudioSystem] All audio loaded.');
    } catch (e) {
      console.warn('[AudioSystem] Init failed:', e);
    }
  }

  async _loadAll() {
    const entries = Object.entries(FILES);
    await Promise.allSettled(
      entries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ab  = await res.arrayBuffer();
          this._buffers[key] = await this._ctx.decodeAudioData(ab);
        } catch (e) {
          console.warn(`[AudioSystem] Could not load "${url}":`, e.message);
          // Graceful degradation — missing file just means silence for that cue
        }
      })
    );
  }

  // ─── Playback ─────────────────────────────────────────
  /**
   * Play a buffer immediately, with optional volume + offset
   * @param {string} key     key from FILES
   * @param {number} vol     0-1
   * @param {number} offset  start offset in seconds
   * @returns {AudioBufferSourceNode|null}
   */
  _play(key, vol = 1.0, offset = 0) {
    if (!this._loaded || !this._ctx || this._muted) return null;
    const buf = this._buffers[key];
    if (!buf) return null;

    const gainNode = this._ctx.createGain();
    gainNode.gain.value = clamp(vol, 0, 1);
    gainNode.connect(this._masterGain);

    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gainNode);
    src.start(this._ctx.currentTime + offset);
    return src;
  }

  // ─── Announcement queue ───────────────────────────────
  /**
   * Queue an announcement key — plays one at a time, never overlaps.
   */
  _queue(key) {
    if (!this._buffers[key]) return;  // not loaded, skip
    this._announceQueue.push(key);
    if (!this._announcing) this._playNext();
  }

  _playNext() {
    if (this._announceQueue.length === 0) {
      this._announcing = false;
      return;
    }
    this._announcing = true;
    const key = this._announceQueue.shift();
    const src = this._play(key, 1.0);
    if (src && this._buffers[key]) {
      const duration = this._buffers[key].duration;
      // Wait for it to finish + small gap, then play next
      setTimeout(() => this._playNext(), (duration + 0.8) * 1000);
    } else {
      // Buffer missing, skip to next
      setTimeout(() => this._playNext(), 500);
    }
  }

  // ─── Train event handler ──────────────────────────────
  _onTrainEvent(type, service) {
    const t = service.entry.type;

    if (type === 'arrive') {
      if (t === 'shinkansen') this._queue('shinkansen_arrive');
      else if (t === 'kiha40' || t === 'emu701') this._queue('local_arrive');
    }

    if (type === 'departWarning') {
      // Small chime before doors close — use mind_gap tone as stand-in
      // (replace with a proper jingle MP3 if you have one)
      this._play('mind_gap', 0.5);
    }

    if (type === 'depart') {
      if (t === 'shinkansen') this._queue('shinkansen_depart');
      else if (t === 'kiha40' || t === 'emu701') this._queue('local_depart');
    }

    if (type === 'passing') {
      this._queue('shinkansen_passing');
    }
  }

  // ─── Per-frame update ─────────────────────────────────
  /**
   * @param {number} dt       real delta seconds
   * @param {number} simHour  0–23.99
   */
  update(dt, simHour) {
    if (!this._loaded) return;

    // Sim-time-based random announcements
    // Convert real seconds to sim seconds (1 real sec = 60 sim sec)
    const simDt = dt * 60;

    this._mindGapTimer   += simDt;
    this._noSmokingTimer += simDt;

    if (this._mindGapTimer >= this._mindGapInterval) {
      this._mindGapTimer    = 0;
      this._mindGapInterval = 900 + Math.random() * 900;
      this._queue('mind_gap');
    }

    if (this._noSmokingTimer >= this._noSmokingInterval) {
      this._noSmokingTimer    = 0;
      this._noSmokingInterval = 1200 + Math.random() * 1200;
      this._queue('no_smoking');
    }

    // Weather-triggered announcements (once per weather change)
    if (this.weatherSystem) {
      const w = this.weatherSystem.current;
      if (w !== this._lastWeather) {
        this._lastWeather = w;
        if (w === 'rain' || w === 'storm') {
          this._queue(w === 'storm' ? 'weather_storm' : 'weather_rain');
        }
      }
    }

    // Last train of night (22:15 sim) — uses local_last
    const h = Math.floor(simHour * 100) / 100;
    const simHourInt = Math.floor(simHour);
    if (simHourInt !== this._lastHour) {
      this._lastHour = simHourInt;
      if (simHourInt === 22) {
        this._queue('local_last');
      }
    }
  }

  // ─── Master volume ────────────────────────────────────
  setVolume(vol) {
    if (this._masterGain) {
      this._masterGain.gain.setTargetAtTime(
        clamp(vol, 0, 1), this._ctx.currentTime, 0.1
      );
    }
  }

  mute()   { this._muted = true;  this.setVolume(0); }
  unmute() { this._muted = false; this.setVolume(1); }

  /** Fade volume in over `duration` real seconds */
  fadeIn(duration = 2.0) {
    if (!this._masterGain || !this._ctx) return;
    this._masterGain.gain.setValueAtTime(0, this._ctx.currentTime);
    this._masterGain.gain.linearRampToValueAtTime(1.0, this._ctx.currentTime + duration);
  }
}