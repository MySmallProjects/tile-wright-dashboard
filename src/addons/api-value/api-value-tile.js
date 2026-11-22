function parseDurationMs(raw, fallbackMs) {
  const m = String(raw || '').trim().match(/^(\d+)\s*([smhd]?)$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  if (!n || n <= 0) return fallbackMs;
  switch (m[2].toLowerCase()) {
    case 's': return Math.max(10000, n * 1000);
    case 'm': return n * 60000;
    case 'h': return n * 3600000;
    case 'd': return n * 86400000;
    default:  return Math.max(10000, n * 1000);
  }
}

class TwAddonApiValue extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._state = { loading: false, value: null, error: null, needsSetup: false, updated: '' };
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

    if (!this._settings.apiUrl) {
      this._state = { loading: false, value: null, error: null, needsSetup: true, updated: '' };
      this.render();
      return;
    }

    this.fetchNow();
    const interval = parseDurationMs(this._settings.refreshInterval, 2 * 3600000);
    this._timer = window.setInterval(() => this.fetchNow(), interval);
  }

  fetchNow() {
    this._state = { ...this._state, loading: this._state.value === null, error: null, needsSetup: false };
    this.render();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'fetch-value',
        payload: {
          apiUrl: this._settings.apiUrl,
          jsonPath: this._settings.jsonPath || '',
          prefix: this._settings.prefix || '',
          suffix: this._settings.suffix || '',
          numberFormat: this._settings.numberFormat || '',
          decimals: this._settings.decimals !== '' && this._settings.decimals != null ? Number(this._settings.decimals) : null,
          refreshInterval: this._settings.refreshInterval || '2h'
        },
        onResult: (res) => {
          if (!res) {
            this._state = { loading: false, value: null, error: 'No response from server.', needsSetup: false, updated: '' };
          } else if (res.needsSetup) {
            this._state = { loading: false, value: null, error: res.error, needsSetup: true, updated: '' };
          } else if (res.error) {
            this._state = { loading: false, value: this._state.value, error: res.error, needsSetup: false, updated: '' };
          } else {
            this._state = {
              loading: false,
              value: res.value,
              error: null,
              needsSetup: false,
              updated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
          }
          this.render();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const label = this._settings.label || 'API Value';
    const logoUrl = this._settings.logoUrl || '';
    const isInline = this._settings.layout === 'inline';
    const st = this._state;

    const inlineRightHtml = st.needsSetup
      ? '<div class="sub" title="Set API URL & JSON path">Needs setup</div>'
      : st.value !== null
        ? `<div class="val" title="${st.error ? st.error : `Updated ${st.updated}`}">${st.value}</div>`
        : st.error
          ? `<div class="err" title="${st.error}">${st.error}</div>`
          : '<div class="sub">Loading...</div>';

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); overflow: hidden; }
        .wrap {
          flex: 1; display: flex; flex-direction: column; justify-content: space-between;
          padding: var(--tw-tile-padding, 14px); gap: 6px; min-width: 0;
        }
        .wrap.inline {
          flex-direction: row; align-items: center; justify-content: space-between; gap: 10px;
        }
        .head,
        .left { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .left { flex: 1; }
        .right {
          display: flex; align-items: center; justify-content: flex-end;
          flex-shrink: 0; text-align: right; min-width: 0; max-width: 60%;
        }
        .logo { width: 22px; height: 22px; object-fit: contain; border-radius: 4px; flex-shrink: 0; }
        .label { font-size: 0.84rem; font-weight: 600; color: var(--tw-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .wrap.inline .label { font-size: 0.9rem; }
        .val { font-size: 1.75rem; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
        .wrap.inline .val { font-size: 1.25rem; white-space: nowrap; }
        .sub { font-size: 0.74rem; color: var(--tw-text-muted); }
        .err { font-size: 0.82rem; color: var(--tw-state-critical); }
        .wrap.inline .sub,
        .wrap.inline .err {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
      </style>
      ${isInline
        ? `<div class="wrap inline">
             <div class="left">
               ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="" />` : ''}
               <span class="label">${label}</span>
             </div>
             <div class="right">
               ${inlineRightHtml}
             </div>
           </div>`
        : `<div class="wrap">
             <div class="head">
               ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="" />` : ''}
               <span class="label">${label}</span>
             </div>
             ${st.needsSetup
               ? '<div class="sub"><strong>Needs setup</strong> — set API URL & JSON path.</div>'
               : st.value !== null
                 ? `<div class="val">${st.value}</div><div class="sub">${st.error ? st.error : `Updated ${st.updated}`}</div>`
                 : st.error
                   ? `<div class="err">${st.error}</div>`
                   : '<div class="sub">Loading...</div>'}
           </div>`}
    `;
  }
}

if (!customElements.get('tw-addon-api-value')) {
  customElements.define('tw-addon-api-value', TwAddonApiValue);
}
