const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeStreamUrl(raw) {
  const s = String(raw || '').trim();
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s;
  return '';
}

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
    this._state = { loading: false, dataUrl: null, streamUrl: null, error: null, needsSetup: false };
    this._timer = null;
    this._retryNonce = 0;
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
    this.stopStream();
  }

  stopStream() {
    const img = this.shadowRoot?.querySelector('img[data-mjpeg]');
    if (img) {
      img.src = BLANK_IMG;
    }
  }

  scheduleFetch() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (!this.isConnected) return;

    const mode = this._settings.sourceMode || 'url';

    if (mode === 'mjpeg') {
      const url = safeStreamUrl(this._settings.imageUrl);
      if (!url) {
        this.stopStream();
        this._state = { loading: false, dataUrl: null, streamUrl: null, error: null, needsSetup: true };
        this.render();
        return;
      }
      // Refresh timer is intentionally disabled for MJPEG streams.
      this._state = { loading: false, dataUrl: null, streamUrl: url, error: null, needsSetup: false };
      this.render();
      return;
    }

    this.stopStream();

    if (mode === 'url' && !this._settings.imageUrl) {
      this._state = { loading: false, dataUrl: null, streamUrl: null, error: null, needsSetup: true };
      this.render();
      return;
    }

    this.fetchNow();
    const interval = parseDurationMs(this._settings.refreshInterval, 15 * 60000);
    this._timer = window.setInterval(() => this.fetchNow(), interval);
  }

  fetchNow() {
    this._state = { ...this._state, loading: !this._state.dataUrl, streamUrl: null, error: null, needsSetup: false };
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
          if ((this._settings.sourceMode || 'url') === 'mjpeg') return;
          if (!res) {
            this._state = { loading: false, dataUrl: null, streamUrl: null, error: 'No response from server.', needsSetup: false };
          } else if (res.needsSetup) {
            this._state = { loading: false, dataUrl: null, streamUrl: null, error: res.error, needsSetup: true };
          } else if (res.error) {
            this._state = { loading: false, dataUrl: this._state.dataUrl, streamUrl: null, error: res.error, needsSetup: false };
          } else {
            this._state = { loading: false, dataUrl: res.dataUrl, streamUrl: null, error: null, needsSetup: false };
          }
          this.render();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  retryStream() {
    const url = safeStreamUrl(this._settings.imageUrl);
    if (!url) return;
    this._retryNonce += 1;
    const sep = url.includes('?') ? '&' : '?';
    const busted = `${url}${sep}_tw_retry=${this._retryNonce}`;
    this._state = { loading: false, dataUrl: null, streamUrl: busted, error: null, needsSetup: false };
    this.render();
  }

  render() {
    const fit = this._settings.fit === 'contain' ? 'contain' : 'cover';
    const caption = this._settings.caption || '';
    const st = this._state;
    const isMjpeg = (this._settings.sourceMode || 'url') === 'mjpeg';
    const imgSrc = isMjpeg ? st.streamUrl : st.dataUrl;

    // Close any previous MJPEG connection before replacing DOM
    this.stopStream();

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); }
        .wrap { position: relative; flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        img { width: 100%; height: 100%; object-fit: ${fit}; display: block; }
        .caption {
          position: absolute; bottom: 0; left: 0; right: 0; padding: 6px 10px;
          background: rgba(0, 0, 0, 0.55); color: #ffffff; font-size: 0.82rem; font-weight: 500;
        }
        .msg { padding: 14px; text-align: center; font-size: 0.85rem; color: var(--tw-text-muted); display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .err { color: var(--tw-state-critical); }
        .retry-btn {
          border: 1px solid var(--tw-border);
          background: var(--tw-surface-elevated);
          color: var(--tw-text);
          border-radius: 7px;
          padding: 4px 12px;
          font-size: 0.78rem;
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .retry-btn:hover {
          border-color: var(--tw-accent);
          color: var(--tw-accent);
        }
      </style>
      <div class="wrap">
        ${st.needsSetup
          ? '<div class="msg"><strong>Needs setup</strong><span>Configure an image/stream URL or folder in tile settings.</span></div>'
          : imgSrc && !st.error
            ? `<img src="${escapeHtml(imgSrc)}" ${isMjpeg ? 'data-mjpeg="1"' : ''} alt="${escapeHtml(caption || (isMjpeg ? 'MJPEG camera stream' : 'Image tile'))}" />${caption ? `<div class="caption">${escapeHtml(caption)}</div>` : ''}`
            : st.error
              ? `<div class="msg err"><span>${escapeHtml(st.error)}</span>${isMjpeg ? '<button type="button" class="retry-btn" data-action="retry">Retry stream</button>' : ''}</div>`
              : '<div class="msg">Loading image...</div>'}
      </div>
    `;

    if (isMjpeg) {
      const img = this.shadowRoot.querySelector('img[data-mjpeg]');
      if (img) {
        img.addEventListener('error', () => {
          if (img.src === BLANK_IMG) return;
          this._state = {
            ...this._state,
            error: 'Unable to load MJPEG stream. Check the URL and network access.'
          };
          this.render();
        });
      }
      const retryBtn = this.shadowRoot.querySelector('[data-action="retry"]');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.retryStream());
      }
    }
  }
}

if (!customElements.get('tw-addon-image')) {
  customElements.define('tw-addon-image', TwAddonImage);
}
