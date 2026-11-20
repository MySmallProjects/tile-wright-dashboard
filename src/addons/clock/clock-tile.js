const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n) => String(n).padStart(2, '0');

function formatDotNetDate(date, pattern) {
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

class TwAddonClock extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._timer = null;
  }

  set settings(val) {
    this._settings = val || {};
    this.render();
  }

  connectedCallback() {
    this.render();
    this._timer = window.setInterval(() => this.updateText(), 1000);
  }

  disconnectedCallback() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  updateText() {
    const timeEl = this.shadowRoot?.querySelector('.time');
    const dateEl = this.shadowRoot?.querySelector('.date');
    if (!timeEl) return;

    const now = new Date();
    const use12 = this._settings.hourFormat === '12';
    const h24 = now.getHours();
    const h = use12 ? (h24 % 12 || 12) : h24;
    const m = pad2(now.getMinutes());
    const s = pad2(now.getSeconds());
    const suffix = use12 ? (h24 >= 12 ? ' PM' : ' AM') : '';
    timeEl.textContent = `${use12 ? h : pad2(h)}:${m}${this._settings.showSeconds ? ':' + s : ''}${suffix}`;
    if (dateEl) {
      dateEl.textContent = formatDotNetDate(now, this._settings.dateFormat || 'dddd dd MMM yyyy');
    }
  }

  render() {
    const scale = Math.max(0.5, Math.min(3, Number(this._settings.fontScale) || 1));
    const align = this._settings.alignment || 'center';
    const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
    const layout = this._settings.layout || 'date-below';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); }
        .wrap {
          flex: 1; display: flex; flex-direction: column; justify-content: center;
          align-items: ${justify}; text-align: ${align};
          padding: var(--tw-tile-padding, 14px); gap: 4px; min-width: 0;
        }
        .time {
          font-size: calc(2.15rem * ${scale}); font-weight: 700; letter-spacing: -0.02em;
          line-height: 1.05; font-variant-numeric: tabular-nums;
        }
        .date { font-size: calc(0.94rem * ${scale}); color: var(--tw-text-muted); font-weight: 500; }
      </style>
      <div class="wrap">
        ${layout === 'date-above' ? '<div class="date"></div>' : ''}
        <div class="time"></div>
        ${layout === 'date-below' ? '<div class="date"></div>' : ''}
      </div>
    `;
    this.updateText();
  }
}

if (!customElements.get('tw-addon-clock')) {
  customElements.define('tw-addon-clock', TwAddonClock);
}
