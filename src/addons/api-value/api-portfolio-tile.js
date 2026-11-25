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

function parseQty(raw) {
  if (raw === null || raw === undefined) return 0;
  const trimmed = String(raw).trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

function parsePrice(raw) {
  if (raw === null || raw === undefined) return NaN;
  const trimmed = String(raw).trim();
  if (!trimmed) return NaN;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

class TwAddonApiPortfolio extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._state = { loading: false, items: null, error: null, needsSetup: false, updated: '' };
    this._timer = null;
  }

  set settings(val) {
    this._settings = val || {};
    this.scheduleFetch();
  }

  set context(val) {
    this._context = val || {};
    this.render();
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
      ? this._settings.items.filter((x) => x && (x.priceJson || x.name))
      : [];
  }

  _formatTotal(num, formatString) {
    const clean = Number.isFinite(num) ? Number(num.toPrecision(12)) : num;
    if (typeof this._context?.formatValue === 'function') {
      return this._context.formatValue(clean, formatString);
    }
    return String(clean);
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
          items: configured.map((item) => ({
            priceJson: item.priceJson || ''
          }))
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
    const showGrandTotal = this._settings.showGrandTotal !== false;
    const grandTotalLabel = typeof this._settings.grandTotalLabel === 'string' && this._settings.grandTotalLabel.trim()
      ? this._settings.grandTotalLabel.trim()
      : 'Total';
    const grandTotalColour = typeof this._settings.grandTotalColour === 'string' && this._settings.grandTotalColour.trim()
      ? this._settings.grandTotalColour.trim()
      : '#22c55e';
    const configured = this._getConfiguredItems();
    const st = this._state;

    let grandTotal = 0;
    let hasValidTotal = false;

    const rowsHtml = configured.map((cfg, idx) => {
      const res = st.items && st.items[idx] ? st.items[idx] : null;
      const name = escapeHtml(cfg.name || cfg.priceJson || `Item ${idx + 1}`);
      const iconUrl = cfg.iconUrl ? escapeHtml(cfg.iconUrl) : '';
      const qty = parseQty(cfg.qty);
      const qtyDisplay = Number.isFinite(qty) ? `x ${qty}` : '';

      let rightHtml = '<span class="sub">...</span>';
      if (res) {
        if (res.error) {
          rightHtml = `<span class="err" title="${escapeHtml(res.error)}">${escapeHtml(res.error)}</span>`;
        } else {
          const price = parsePrice(res.raw ?? res.value);
          if (!Number.isFinite(price)) {
            const msg = `Invalid price: ${res.raw ?? res.value ?? ''}`;
            rightHtml = `<span class="err" title="${escapeHtml(msg)}">${escapeHtml(msg)}</span>`;
          } else if (!Number.isFinite(qty)) {
            const msg = `Invalid qty: ${cfg.qty}`;
            rightHtml = `<span class="err" title="${escapeHtml(msg)}">${escapeHtml(msg)}</span>`;
          } else {
            const total = price * qty;
            grandTotal += total;
            hasValidTotal = true;
            const formatted = this._formatTotal(total, cfg.totalFormat);
            rightHtml = `<span class="val">${escapeHtml(formatted)}</span>`;
          }
        }
      }

      return `
        <div class="row">
          <div class="left">
            ${iconUrl ? `<img class="logo" src="${iconUrl}" alt="" />` : ''}
            <span class="label">${name}</span>
          </div>
          <div class="mid">
            ${qtyDisplay ? `<span class="qty">${escapeHtml(qtyDisplay)}</span>` : ''}
          </div>
          <div class="right">
            ${rightHtml}
          </div>
        </div>
      `;
    }).join('');

    let grandTotalHtml = '';
    if (showGrandTotal && hasValidTotal) {
      const firstFormat = configured.find((c) => typeof c.totalFormat === 'string' && c.totalFormat.trim())?.totalFormat || '';
      const grandFormat = typeof this._settings.grandTotalFormat === 'string' && this._settings.grandTotalFormat.trim()
        ? this._settings.grandTotalFormat
        : firstFormat;
      const formattedGrand = this._formatTotal(grandTotal, grandFormat);
      grandTotalHtml = `
        <div class="row total-row">
          <div class="left total-left">
            <span class="total-label">${escapeHtml(grandTotalLabel)}</span>
          </div>
          <div class="right">
            <span class="val total-val" style="color: ${escapeHtml(grandTotalColour)}">${escapeHtml(formattedGrand)}</span>
          </div>
        </div>
      `;
    }

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
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          column-gap: 10px;
          row-gap: 6px;
          align-items: center;
          min-width: 0;
        }
        .row {
          display: grid;
          grid-template-columns: subgrid;
          grid-column: 1 / -1;
          align-items: center;
          min-width: 0;
        }
        .row + .row {
          padding-top: 6px;
          border-top: 1px solid var(--tw-border);
        }
        .total-row {
          padding-top: 8px;
          border-top: 2px solid var(--tw-border);
          margin-top: 2px;
        }
        .left {
          display: flex; align-items: center; gap: 8px; min-width: 0;
        }
        .total-left {
          grid-column: 1 / 3;
        }
        .mid {
          display: flex; align-items: center; justify-content: flex-end;
          white-space: nowrap;
        }
        .qty {
          font-size: 0.78rem; font-weight: 500; color: var(--tw-text-muted);
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .right {
          display: flex; align-items: center; justify-content: flex-end;
          text-align: right; min-width: 0;
        }
        .logo {
          width: 20px; height: 20px; object-fit: contain; border-radius: 4px; flex-shrink: 0;
        }
        .label {
          font-size: 0.88rem; font-weight: 600; color: var(--tw-text-muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .total-label {
          font-size: 0.9rem; font-weight: 700; color: var(--tw-text);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .val {
          font-size: 1.1rem; font-weight: 700; line-height: 1.15;
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .total-val {
          font-size: 1.15rem;
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
            : `<div class="rows">${rowsHtml}${grandTotalHtml}</div>${footerHtml}`}
      </div>
    `;
  }
}

if (!customElements.get('tw-addon-api-portfolio')) {
  customElements.define('tw-addon-api-portfolio', TwAddonApiPortfolio);
}
