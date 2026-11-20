function parseDurationMs(raw, fallbackMs) {
  const m = String(raw || '').trim().match(/^(\d+)\s*([smhd]?)$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  if (!n || n <= 0) return fallbackMs;
  switch (m[2].toLowerCase()) {
    case 's': return Math.max(60000, n * 1000);
    case 'm': return Math.max(300000, n * 60000);
    case 'h': return n * 3600000;
    case 'd': return n * 86400000;
    default:  return fallbackMs;
  }
}

class TwAddonOpenMeteo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._state = { loading: false, days: null, error: null, needsSetup: false };
    this._timer = null;
  }

  set settings(val) {
    this._settings = val || {};
    this.scheduleFetch();
  }

  connectedCallback() {
    this.scheduleFetch();
  }

  disconnectedCallback() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  scheduleFetch() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (!this.isConnected) return;

    const lat = this._settings.latitude;
    const lon = this._settings.longitude;
    if (lat === '' || lat == null || lon === '' || lon == null) {
      this._state = { loading: false, days: null, error: null, needsSetup: true };
      this.render();
      return;
    }

    this.fetchNow();
    const interval = parseDurationMs(this._settings.refreshInterval, 30 * 60000);
    this._timer = window.setInterval(() => this.fetchNow(), interval);
  }

  fetchNow() {
    this._state = { ...this._state, loading: !this._state.days, error: null, needsSetup: false };
    this.render();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'fetch-forecast',
        payload: {
          latitude: Number(this._settings.latitude),
          longitude: Number(this._settings.longitude),
          timezone: this._settings.timezone || 'Europe/London',
          refreshInterval: this._settings.refreshInterval || '30m'
        },
        onResult: (res) => {
          if (!res) {
            this._state = { loading: false, days: null, error: 'No response from server.', needsSetup: false };
          } else if (res.needsSetup) {
            this._state = { loading: false, days: null, error: res.error, needsSetup: true };
          } else if (res.error) {
            this._state = { loading: false, days: this._state.days, error: res.error, needsSetup: false };
          } else {
            this._state = { loading: false, days: res.days || [], error: null, needsSetup: false };
          }
          this.render();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const showSun = this._settings.showSunTimes !== false;
    const st = this._state;

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host { display: flex; width: 100%; height: 100%; overflow: hidden; color: var(--tw-text); font-family: var(--tw-font-family); }
        .grid {
          flex: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
          padding: 8px; gap: 6px; width: 100%; height: 100%; min-height: 0; overflow: hidden; align-items: stretch;
        }
        .day {
          display: flex; flex-direction: column; align-items: center; justify-content: space-between;
          text-align: center; padding: 6px 4px; border-radius: 10px;
          background: var(--tw-surface-elevated); border: 1px solid var(--tw-border);
          min-width: 0; min-height: 0; overflow: hidden; gap: 2px;
        }
        .dow {
          font-size: 0.85rem; font-weight: 700; letter-spacing: 0.02em; flex-shrink: 0; line-height: 1.1;
        }
        .icon-wrap {
          flex: 1 1 0; display: flex; align-items: center; justify-content: center;
          width: 100%; min-height: 0; overflow: hidden;
        }
        .icon-wrap img {
          max-width: 44px; max-height: 44px; width: auto; height: 100%; object-fit: contain; display: block;
        }
        .sun {
          display: flex; flex-direction: column; gap: 1px; font-size: 0.72rem; flex-shrink: 0;
          color: var(--tw-text-muted); font-variant-numeric: tabular-nums; line-height: 1.15;
        }
        .sun-row {
          display: inline-flex; align-items: center; justify-content: center; gap: 3px;
        }
        .msg {
          flex: 1; display: flex; align-items: center; justify-content: center;
          text-align: center; padding: 12px; font-size: 0.86rem; color: var(--tw-text-muted);
        }
        .err { color: var(--tw-state-critical); }
      </style>
      ${st.needsSetup
        ? '<div class="msg"><div><strong>Needs setup</strong><br>Set latitude and longitude in tile settings.</div></div>'
        : st.days && st.days.length > 0
          ? `<div class="grid">
              ${st.days.map((d) => `
                <div class="day" title="${d.description}">
                  <div class="dow">${d.dow}</div>
                  <div class="icon-wrap">
                    <img src="/api/addons/openmeteo/assets/icons/${encodeURIComponent(d.iconFile)}" alt="${d.description}" />
                  </div>
                  ${showSun ? `
                    <div class="sun">
                      <span class="sun-row" title="Sunrise">↑ ${d.sunrise}</span>
                      <span class="sun-row" title="Sunset">↓ ${d.sunset}</span>
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>`
          : st.error
            ? `<div class="msg err">${st.error}</div>`
            : '<div class="msg">Loading forecast...</div>'}
    `;
  }
}

if (!customElements.get('tw-addon-openmeteo')) {
  customElements.define('tw-addon-openmeteo', TwAddonOpenMeteo);
}
