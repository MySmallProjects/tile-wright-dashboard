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

function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class TwAddonApiMultiValue extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._state = { loading: false, items: null, error: null, needsSetup: false, updated: '' };
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

  _getConfiguredItems() {
    return Array.isArray(this._settings.items)
      ? this._settings.items.filter((x) => x && (x.priceJson || x.label))
      : [];
  }

  scheduleFetch() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (!this.isConnected) return;

    const items = this._getConfiguredItems();
    if (!this._settings.apiUrl || items.length === 0) {
      this._state = { loading: false, items: null, error: null, needsSetup: true, updated: '' };
      this.render();
      return;
    }

    this.fetchNow();
    const interval = parseDurationMs(this._settings.refreshInterval, 2 * 3600000);
    this._timer = window.setInterval(() => this.fetchNow(), interval);
  }

  fetchNow() {
    const configured = this._getConfiguredItems();
    this._state = { ...this._state, loading: this._state.items === null, error: null, needsSetup: false };
    this.render();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'fetch-values',
        payload: {
          apiUrl: this._settings.apiUrl,
          refreshInterval: this._settings.refreshInterval || '2h',
          items: configured.map((item) => {
            const rawDec = item.decimals == null ? '' : String(item.decimals).trim();
            const parsedDec = rawDec !== '' ? Number(rawDec) : null;
            return {
              priceJson: item.priceJson || '',
              changeJson: item.changeJson || '',
              prefix: item.prefix || '',
              suffix: item.suffix || '',
              numberFormat: item.numberFormat || '',
              decimals: parsedDec !== null && Number.isFinite(parsedDec) ? parsedDec : null
            };
          })
        },
        onResult: (res) => {
          if (!res) {
            this._state = { loading: false, items: null, error: 'No response from server.', needsSetup: false, updated: '' };
          } else if (res.needsSetup) {
            this._state = { loading: false, items: null, error: res.error, needsSetup: true, updated: '' };
          } else if (res.error) {
            this._state = { loading: false, items: this._state.items, error: res.error, needsSetup: false, updated: this._state.updated };
          } else {
            const items = Array.isArray(res.items) ? res.items : [];
            items.forEach((item, idx) => {
              if (item && item.changeWarning) {
                const cfg = configured[idx];
                const itemLabel = cfg?.label || cfg?.priceJson || `Item ${idx + 1}`;
                console.warn(`[API / Stock List] ${itemLabel}: ${item.changeWarning}`);
              }
            });
            this._state = {
              loading: false,
              items,
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
    const title = typeof this._settings.title === 'string' ? this._settings.title.trim() : '';
    const showUpdated = this._settings.showUpdated !== false;
    const positiveColour = this._settings.positiveColour || '#22c55e';
    const negativeColour = this._settings.negativeColour || '#ef4444';
    const configured = this._getConfiguredItems();
    const st = this._state;

    const rowsHtml = configured.map((cfg, idx) => {
      const res = st.items && st.items[idx] ? st.items[idx] : null;
      const label = escapeHtml(cfg.label || cfg.priceJson || `Item ${idx + 1}`);
      const logoUrl = cfg.logoUrl ? escapeHtml(cfg.logoUrl) : '';

      let rightHtml = '<span class="sub">...</span>';
      if (res) {
        if (res.error) {
          rightHtml = `<span class="err" title="${escapeHtml(res.error)}">${escapeHtml(res.error)}</span>`;
        } else if (typeof res.change === 'number' && Number.isFinite(res.change) && res.changeDisplay != null) {
          const colour = res.change < 0 ? negativeColour : positiveColour;
          const display = `${res.value} (${res.changeDisplay}%)`;
          rightHtml = `<span class="val" style="color: ${escapeHtml(colour)}">${escapeHtml(display)}</span>`;
        } else {
          rightHtml = `<span class="val">${escapeHtml(res.value)}</span>`;
        }
      }

      return `
        <div class="row">
          <div class="left">
            ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="" />` : ''}
            <span class="label">${label}</span>
          </div>
          <div class="right">
            ${rightHtml}
          </div>
        </div>
      `;
    }).join('');

    const footerHtml = st.error
      ? `<div class="foot err" title="${escapeHtml(st.error)}">${escapeHtml(st.error)}</div>`
      : showUpdated && st.updated
        ? `<div class="foot sub">Updated ${escapeHtml(st.updated)}</div>`
        : '';

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); overflow: hidden; }
        .wrap {
          flex: 1; display: flex; flex-direction: column; justify-content: center;
          padding: var(--tw-tile-padding, 12px); gap: 6px; min-width: 0; overflow-y: auto;
        }
        .head {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          margin-bottom: 2px;
        }
        .title {
          font-size: 0.78rem; font-weight: 700; color: var(--tw-text-muted);
          text-transform: uppercase; letter-spacing: 0.04em;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .rows {
          display: flex; flex-direction: column; gap: 6px; min-width: 0;
        }
        .row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          min-width: 0;
        }
        .row + .row {
          padding-top: 6px;
          border-top: 1px solid var(--tw-border);
        }
        .left {
          display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;
        }
        .right {
          display: flex; align-items: center; justify-content: flex-end;
          flex-shrink: 0; text-align: right; min-width: 0; max-width: 60%;
        }
        .logo {
          width: 20px; height: 20px; object-fit: contain; border-radius: 4px; flex-shrink: 0;
        }
        .label {
          font-size: 0.88rem; font-weight: 600; color: var(--tw-text-muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .val {
          font-size: 1.1rem; font-weight: 700; line-height: 1.15;
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .sub { font-size: 0.74rem; color: var(--tw-text-muted); white-space: nowrap; }
        .err {
          font-size: 0.78rem; color: var(--tw-state-critical);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .foot { margin-top: 2px; }
      </style>
      <div class="wrap">
        ${title
          ? `<div class="head"><span class="title">${escapeHtml(title)}</span></div>`
          : ''}
        ${st.needsSetup
          ? '<div class="sub"><strong>Needs setup</strong> — set API URL &amp; add items.</div>'
          : st.loading && !st.items
            ? '<div class="sub">Loading...</div>'
            : `<div class="rows">${rowsHtml}</div>${footerHtml}`}
      </div>
    `;
  }
}

if (!customElements.get('tw-addon-api-multi-value')) {
  customElements.define('tw-addon-api-multi-value', TwAddonApiMultiValue);
}
