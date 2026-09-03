export class Dashboard {
  constructor(onEnter) {
    this.onEnter = onEnter;
    this.hudVisible = false;
    this._bannerTimer = null;

    this._buildDOM();
    this._startWelcomeSequence();
  }

  // ─── DOM ──────────────────────────────────────────────
  _buildDOM() {
    // Welcome screen
    this.welcome = document.createElement('div');
    this.welcome.id = 'welcome-screen';
    this.welcome.innerHTML = `
      <span class="welcome-ja">奥津軽いまべつ駅</span>
      <span class="welcome-en">Okutsugaru-Imabetsu Station</span>
      <div class="welcome-divider"></div>
      <span class="welcome-enter">タップして入る</span>
    `;
    document.getElementById('dashboard-root').appendChild(this.welcome);

    // Cache elements
    this.elJa      = this.welcome.querySelector('.welcome-ja');
    this.elEn      = this.welcome.querySelector('.welcome-en');
    this.elDiv     = this.welcome.querySelector('.welcome-divider');
    this.elEnter   = this.welcome.querySelector('.welcome-enter');

    // HUD
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div id="hud-time">00:00</div>
      <div id="hud-period">深夜</div>
      <div id="hud-weather"></div>
    `;
    document.getElementById('dashboard-root').appendChild(hud);
    this.hud        = hud;
    this.hudTime    = hud.querySelector('#hud-time');
    this.hudPeriod  = hud.querySelector('#hud-period');
    this.hudWeather = hud.querySelector('#hud-weather');

    // Crosshair (desktop pointer-lock)
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    document.getElementById('dashboard-root').appendChild(crosshair);
    this.crosshair = crosshair;

    // Train arrival banner
    const banner = document.createElement('div');
    banner.id = 'train-banner';
    banner.innerHTML = `
      <div id="train-banner-ja"></div>
      <div id="train-banner-en"></div>
    `;
    document.getElementById('dashboard-root').appendChild(banner);
    this.banner   = banner;
    this.bannerJa = banner.querySelector('#train-banner-ja');
    this.bannerEn = banner.querySelector('#train-banner-en');

    // Mobile hint
    const hint = document.createElement('div');
    hint.id = 'mobile-hint';
    hint.textContent = '左スワイプで移動　右スワイプで視点';
    document.getElementById('dashboard-root').appendChild(hint);
    this.mobileHint = hint;
  }

  // ─── Welcome sequence ─────────────────────────────────
  _startWelcomeSequence() {
    // Staggered reveal: ja → en → divider → enter prompt
    setTimeout(() => this.elJa.classList.add('show'),    400);
    setTimeout(() => this.elEn.classList.add('show'),    900);
    setTimeout(() => this.elDiv.classList.add('show'),  1400);
    setTimeout(() => this.elEnter.classList.add('show'),2200);

    // Bind enter interaction after prompt appears
    setTimeout(() => {
      this.welcome.addEventListener('click',   () => this._enter(), { once: true });
      this.welcome.addEventListener('touchend',() => this._enter(), { once: true });
    }, 2800);
  }

  _enter() {
    // Fade out welcome
    this.welcome.classList.add('hidden');

    // Fade in canvas
    const canvas = document.getElementById('scene-canvas');
    setTimeout(() => canvas.classList.add('visible'), 400);

    // Show HUD
    setTimeout(() => {
      this.hud.classList.add('visible');
      this.hudVisible = true;
    }, 1800);

    // Show mobile hint briefly
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (isTouch) {
      setTimeout(() => {
        this.mobileHint.classList.add('visible');
        setTimeout(() => this.mobileHint.classList.remove('visible'), 4000);
      }, 2400);
    }

    // Notify engine
    setTimeout(() => this.onEnter?.(), 600);

    // Remove welcome from DOM after transition
    setTimeout(() => this.welcome.remove(), 3000);
  }

  // ─── HUD updates (called by Clock) ────────────────────

  /**
   * @param {number} simHour   0-23.99
   * @param {string} weather   'clear'|'rain'|'storm'|'fog'|'snow'
   */
  updateTime(simHour, weather = 'clear') {
    if (!this.hudVisible) return;

    const h = Math.floor(simHour);
    const m = Math.floor((simHour % 1) * 60);
    this.hudTime.textContent =
      String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');

    this.hudPeriod.textContent  = this._periodKanji(simHour);
    this.hudWeather.textContent = this._weatherKanji(weather);
  }

  _periodKanji(h) {
    if (h >= 5  && h < 8)  return '夜明け';   // dawn
    if (h >= 8  && h < 11) return '朝';        // morning
    if (h >= 11 && h < 13) return '昼';        // noon
    if (h >= 13 && h < 17) return '午後';      // afternoon
    if (h >= 17 && h < 19) return '夕暮れ';   // dusk
    if (h >= 19 && h < 22) return '夜';        // evening
    return '深夜';                              // midnight
  }

  _weatherKanji(weather) {
    const map = {
      clear: '晴れ',
      cloud: '曇り',
      rain:  '雨',
      storm: '嵐',
      fog:   '霧',
      snow:  '雪',
    };
    return map[weather] ?? '';
  }

  // ─── Train banner ──────────────────────────────────────

  /**
   * @param {string} ja   Japanese announcement line
   * @param {string} en   English subtitle
   * @param {number} dur  Duration in ms (default 5s)
   */
  showTrainBanner(ja, en, dur = 5000) {
    if (this._bannerTimer) {
      clearTimeout(this._bannerTimer);
      this.banner.classList.remove('visible');
    }

    // Small delay so fade-out of previous completes
    setTimeout(() => {
      this.bannerJa.textContent = ja;
      this.bannerEn.textContent = en;
      this.banner.classList.add('visible');

      this._bannerTimer = setTimeout(() => {
        this.banner.classList.remove('visible');
        this._bannerTimer = null;
      }, dur);
    }, 120);
  }

  // ─── Crosshair ────────────────────────────────────────
  showCrosshair()  { this.crosshair.classList.add('visible');    }
  hideCrosshair()  { this.crosshair.classList.remove('visible'); }
}