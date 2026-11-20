function parseDurationMs(raw, fallbackMs) {
  const m = String(raw || '').trim().match(/^(\d+)\s*([smhd]?)$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  if (!n || n <= 0) return fallbackMs;
  switch (m[2].toLowerCase()) {
    case 's': return Math.max(3000, n * 1000);
    case 'm': return n * 60000;
    case 'h': return n * 3600000;
    case 'd': return n * 86400000;
    default:  return Math.max(3000, n * 1000);
  }
}

class TwAddonImage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._state = { loading: false, dataUrl: null, error: null, needsSetup: false };
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

    const mode = this._settings.sourceMode || 'url';
    if (mode === 'url' && !this._settings.imageUrl) {
      this._state = { loading: false, dataUrl: null, error: null, needsSetup: true };
      this.render();
      return;
    }

    this.fetchNow();
    const interval = parseDurationMs(this._settings.refreshInterval, 15 * 60000);
    this._timer = window.setInterval(() => this.fetchNow(), interval);
  }

  fetchNow() {
    this._state = { ...this._state, loading: !this._state.dataUrl, error: null, needsSetup: false };
    this.render();
    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'fetch-image',
        payload: {
          sourceMode: this._settings.sourceMode || 'url',
          imageUrl: this._settings.imageUrl || '',
          folderPath: this._settings.folderPath || '',
          refreshInterval: this._settings.refreshInterval || '15m'
        },
        onResult: (res) => {
          if (!res) {
            this._state = { loading: false, dataUrl: null, error: 'No response from server.', needsSetup: false };
          } else if (res.needsSetup) {
            this._state = { loading: false, dataUrl: null, error: res.error, needsSetup: true };
          } else if (res.error) {
            this._state = { loading: false, dataUrl: this._state.dataUrl, error: res.error, needsSetup: false };
          } else {
            this._state = { loading: false, dataUrl: res.dataUrl, error: null, needsSetup: false };
          }
          this.render();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const fit = this._settings.fit === 'contain' ? 'contain' : 'cover';
    const caption = this._settings.caption || '';
    const st = this._state;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); }
        .wrap { position: relative; flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        img { width: 100%; height: 100%; object-fit: ${fit}; display: block; }
        .caption {
          position: absolute; bottom: 0; left: 0; right: 0; padding: 6px 10px;
          background: rgba(0, 0, 0, 0.55); color: #ffffff; font-size: 0.82rem; font-weight: 500;
        }
        .msg { padding: 14px; text-align: center; font-size: 0.85rem; color: var(--tw-text-muted); }
        .err { color: var(--tw-state-critical); }
      </style>
      <div class="wrap">
        ${st.needsSetup
          ? '<div class="msg"><strong>Needs setup</strong><br>Configure an image URL or folder in tile settings.</div>'
          : st.dataUrl
            ? `<img src="${st.dataUrl}" alt="${caption || 'Image tile'}" />${caption ? `<div class="caption">${caption}</div>` : ''}`
            : st.error
              ? `<div class="msg err">${st.error}</div>`
              : '<div class="msg">Loading image...</div>'}
      </div>
    `;
  }
}

if (!customElements.get('tw-addon-image')) {
  customElements.define('tw-addon-image', TwAddonImage);
}
