function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function computeDaysRemaining(settings) {
  const today = startOfDay(new Date());
  const mode = settings.mode || 'one-off';

  if (mode === 'weekly') {
    const targetDay = Number(settings.weekday);
    if (Number.isNaN(targetDay) || targetDay < 0 || targetDay > 6) return null;
    const diff = (targetDay - today.getDay() + 7) % 7;
    return diff;
  }

  const raw = String(settings.targetDate || '').trim();
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  if (mode === 'yearly') {
    let next = new Date(today.getFullYear(), month, day);
    if (next < today) next = new Date(today.getFullYear() + 1, month, day);
    return Math.round((next - today) / 86400000);
  }

  const target = new Date(year, month, day);
  return Math.round((target - today) / 86400000);
}

class TwAddonCountdown extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._timer = null;
  }

  set settings(val) {
    this._settings = val || {};
    this.render();
  }

  set context(val) {
    this._context = val || {};
    this.render();
  }

  connectedCallback() {
    this.render();
    this._timer = window.setInterval(() => this.render(), 60000);
  }

  disconnectedCallback() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  render() {
    const label = String(this._settings.label || '').trim();
    const days = computeDaysRemaining(this._settings);
    const needsSetup = !label || days === null;

    let headline = '';
    let sub = '';
    let isToday = false;

    if (!needsSetup) {
      if (days === 0) {
        headline = 'Today';
        sub = label;
        isToday = true;
      } else if (days === 1) {
        headline = '1 day';
        sub = `until ${label}`;
      } else if (days > 1) {
        headline = `${days} days`;
        sub = `until ${label}`;
      } else {
        headline = `${Math.abs(days)}d ago`;
        sub = label;
      }
    }

    const iconName = this._settings.icon || '';
    const resolvedIcon = iconName && typeof this._context?.resolveIcon === 'function'
      ? this._context.resolveIcon(iconName)
      : (iconName && typeof this._context?.resolveIconPath === 'function'
          ? { kind: 'svg', path: this._context.resolveIconPath(iconName) }
          : null);

    const iconHtml = !resolvedIcon
      ? ''
      : resolvedIcon.kind === 'image'
        ? `<div class="icon"><img src="${resolvedIcon.url}" width="32" height="32" alt="" style="object-fit:contain;display:block;" /></div>`
        : `<div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${resolvedIcon.path}" /></svg></div>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); }
        .wrap {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: var(--tw-tile-padding, 14px); gap: 4px;
        }
        .icon {
          color: ${isToday ? 'var(--tw-state-normal)' : 'var(--tw-accent)'};
          display: flex; align-items: center; justify-content: center; margin-bottom: 2px;
        }
        .big {
          font-size: 1.9rem; font-weight: 700; line-height: 1.05;
          color: ${isToday ? 'var(--tw-state-normal)' : 'var(--tw-accent)'};
        }
        .sub { font-size: 0.9rem; color: var(--tw-text-muted); font-weight: 500; }
        .setup { font-size: 0.86rem; color: var(--tw-text-muted); }
      </style>
      <div class="wrap">
        ${needsSetup
          ? '<div class="setup"><strong>Needs setup</strong><br>Set a label and date in tile settings.</div>'
          : `${iconHtml}<div class="big">${headline}</div><div class="sub">${sub}</div>`}
      </div>
    `;
  }
}

if (!customElements.get('tw-addon-countdown')) {
  customElements.define('tw-addon-countdown', TwAddonCountdown);
}
