/**
 * <tw-clock-tile> — Phase 1 Prototype Web Component
 * Proves the Tilewright Tile Contract (§4.4):
 *  - Receives `settings`, `data`, and `context` properties from the host
 *  - Uses Shadow DOM and inherits theme CSS custom properties (--tw-*)
 *  - Emits `settings-changed` and `request-action` (bubbles + composed)
 *  - Handles "Needs setup" state gracefully
 *  - Formats dates using .NET / Unicode tokens (e.g. "dddd dd MMM yyyy")
 */

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Formats a Date using standard .NET / Unicode date tokens.
 * Note: MM = month (01-12), mm = minutes (00-59).
 */
export function formatDotNetDate(date, pattern) {
  const tokenRegex = /dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|yy|HH|H|hh|h|mm|ss|tt/g;
  const h24 = date.getHours();
  const h12 = h24 % 12 || 12;
  return String(pattern).replace(tokenRegex, (tok) => {
    switch (tok) {
      case 'dddd': return DAYS_LONG[date.getDay()];
      case 'ddd':  return DAYS_SHORT[date.getDay()];
      case 'dd':   return pad2(date.getDate());
      case 'd':    return String(date.getDate());
      case 'MMMM': return MONTHS_LONG[date.getMonth()];
      case 'MMM':  return MONTHS_SHORT[date.getMonth()];
      case 'MM':   return pad2(date.getMonth() + 1);
      case 'M':    return String(date.getMonth() + 1);
      case 'yyyy': return String(date.getFullYear());
      case 'yy':   return String(date.getFullYear()).slice(-2);
      case 'HH':   return pad2(h24);
      case 'H':    return String(h24);
      case 'hh':   return pad2(h12);
      case 'h':    return String(h12);
      case 'mm':   return pad2(date.getMinutes());
      case 'ss':   return pad2(date.getSeconds());
      case 'tt':   return h24 >= 12 ? 'PM' : 'AM';
      default:     return tok;
    }
  });
}

class TwClockTile extends HTMLElement {
  static tileMeta = {
    id: 'clock',
    name: 'Clock',
    defaultSize: { w: 2, h: 1 },
    minSize: { w: 1, h: 1 },
    maxSize: { w: 4, h: 2 }
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {
      hourFormat: '24',
      dateFormat: 'dddd dd MMM yyyy',
      showSeconds: false,
      layout: 'date-below', // date-below | date-above | hidden
      alignment: 'center',  // left | center | right
      fontScale: 1,
      needsSetup: false
    };
    this._data = null;
    this._context = { mode: 'view', theme: 'light', width: 2, height: 1 };
    this._timer = null;
  }

  get settings() { return this._settings; }
  set settings(val) {
    this._settings = { ...this._settings, ...(val || {}) };
    this._render();
    this._syncTimer();
  }

  get data() { return this._data; }
  set data(val) {
    this._data = val;
    this._render();
  }

  get context() { return this._context; }
  set context(val) {
    this._context = { ...this._context, ...(val || {}) };
    this._render();
  }

  connectedCallback() {
    this._render();
    this._syncTimer();
  }

  disconnectedCallback() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _syncTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (!this.isConnected) return;
    const ms = this._settings.showSeconds ? 1000 : 1000;
    this._timer = setInterval(() => this._updateClockText(), ms);
  }

  _formatTime(now) {
    const use12 = this._settings.hourFormat === '12';
    const h24 = now.getHours();
    const h = use12 ? (h24 % 12 || 12) : h24;
    const m = pad2(now.getMinutes());
    const s = pad2(now.getSeconds());
    const suffix = use12 ? (h24 >= 12 ? ' PM' : ' AM') : '';
    return `${use12 ? h : pad2(h)}:${m}${this._settings.showSeconds ? ':' + s : ''}${suffix}`;
  }

  _updateClockText() {
    const timeEl = this.shadowRoot.querySelector('.time');
    const dateEl = this.shadowRoot.querySelector('.date');
    if (!timeEl) return;
    const now = new Date();
    timeEl.textContent = this._formatTime(now);
    if (dateEl) {
      dateEl.textContent = formatDotNetDate(now, this._settings.dateFormat || 'dddd dd MMM yyyy');
    }
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  _render() {
    const s = this._settings;
    const scale = Number(s.fontScale) || 1;
    const align = s.alignment || 'center';
    const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
    const isNeedsSetup = Boolean(s.needsSetup) || !s.dateFormat;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          width: 100%;
          height: 100%;
          color: var(--tw-text);
          font-family: var(--tw-font-family);
        }
        .wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: ${justify};
          text-align: ${align};
          padding: var(--tw-tile-padding, 14px);
          gap: 4px;
          min-width: 0;
        }
        .time {
          font-size: calc(2.1rem * ${scale});
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.05;
          font-variant-numeric: tabular-nums;
        }
        .date {
          font-size: calc(0.92rem * ${scale});
          color: var(--tw-text-muted);
          font-weight: 500;
        }
        .push-note {
          margin-top: 4px;
          font-size: 0.74rem;
          color: var(--tw-accent);
        }
        .setup {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: var(--tw-text-muted);
          font-size: 0.88rem;
          text-align: center;
        }
        .setup-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid var(--tw-state-warning);
          color: var(--tw-state-warning);
        }
        .quick-btn {
          margin-top: 6px;
          font-family: inherit;
          font-size: 0.75rem;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--tw-border);
          background: transparent;
          color: var(--tw-text-muted);
          cursor: pointer;
        }
        .quick-btn:hover {
          border-color: var(--tw-accent);
          color: var(--tw-accent);
        }
      </style>
      <div class="wrap">
        ${isNeedsSetup ? `
          <div class="setup">
            <span class="setup-badge">Needs setup</span>
            <span>Configure clock format in tile settings.</span>
          </div>
        ` : `
          ${s.layout === 'date-above' ? '<div class="date"></div>' : ''}
          <div class="time"></div>
          ${s.layout !== 'date-above' && s.layout !== 'hidden' ? '<div class="date"></div>' : ''}
          ${this._data && this._data.serverNote ? `<div class="push-note">${this._data.serverNote}</div>` : ''}
          ${this._context.showDemoActions ? `
            <div>
              <button class="quick-btn" data-act="toggle-format">Toggle 12h/24h</button>
              <button class="quick-btn" data-act="ping">Request Action</button>
            </div>
          ` : ''}
        `}
      </div>
    `;

    this._updateClockText();

    const toggleBtn = this.shadowRoot.querySelector('[data-act="toggle-format"]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const next = this._settings.hourFormat === '24' ? '12' : '24';
        this._settings = { ...this._settings, hourFormat: next };
        this._updateClockText();
        this._emit('settings-changed', { hourFormat: next });
      });
    }

    const pingBtn = this.shadowRoot.querySelector('[data-act="ping"]');
    if (pingBtn) {
      pingBtn.addEventListener('click', () => {
        this._emit('request-action', { action: 'clock.sync', timestamp: new Date().toISOString() });
      });
    }
  }
}

if (!customElements.get('tw-clock-tile')) {
  customElements.define('tw-clock-tile', TwClockTile);
}
