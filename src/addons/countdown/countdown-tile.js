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

  if (mode === 'biweekly') {
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const anchorUtc = Date.UTC(year, month, day);
    const diffDays = Math.round((anchorUtc - todayUtc) / 86400000);
    if (diffDays >= 0) return diffDays;
    return ((diffDays % 14) + 14) % 14;
  }

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

    const layout = this._settings.layout || 'stacked';
    const iconName = this._settings.icon || '';
    const resolvedIcon = iconName && typeof this._context?.resolveIcon === 'function'
      ? this._context.resolveIcon(iconName)
      : (iconName && typeof this._context?.resolveIconPath === 'function'
          ? { kind: 'svg', path: this._context.resolveIconPath(iconName) }
          : null);

    const iconHtml = !resolvedIcon
      ? ''
      : resolvedIcon.kind === 'image'
        ? `<div class="icon"><img src="${resolvedIcon.url}" alt="" /></div>`
        : `<div class="icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${resolvedIcon.path}" /></svg></div>`;

    const splitNumber = days === 0 ? 'Today' : String(Math.abs(days ?? 0));
    const splitUnit = days === 0 ? '' : (days === 1 ? 'day left' : days > 1 ? 'days left' : (days === -1 ? 'day ago' : 'days ago'));

    const bodyHtml = needsSetup
      ? '<div class="wrap"><div class="setup"><strong>Needs setup</strong><br>Set a label and date in tile settings.</div></div>'
      : layout === 'split'
        ? `
          <div class="split-wrap">
            <div class="split-top ${iconHtml ? '' : 'no-icon'}">
              ${iconHtml ? `<div class="split-left">${iconHtml}</div>` : ''}
              <div class="split-right">
                <div class="split-num">${splitNumber}</div>
                ${splitUnit ? `<div class="split-unit">${splitUnit}</div>` : ''}
              </div>
            </div>
            <div class="split-bottom">${label}</div>
          </div>
        `
        : `<div class="wrap">${iconHtml}<div class="big">${headline}</div><div class="sub">${sub}</div></div>`;

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host {
          display: block; position: relative; width: 100%; height: 100%;
          min-height: 0; overflow: hidden;
          color: var(--tw-text); font-family: var(--tw-font-family);
        }
        .wrap {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 8px 10px; gap: 4px; overflow: hidden;
        }
        .icon {
          color: ${isToday ? 'var(--tw-state-normal)' : 'var(--tw-accent)'};
          display: flex; align-items: center; justify-content: center;
        }
        .wrap .icon img,
        .wrap .icon svg {
          width: 28px; height: 28px; object-fit: contain; display: block;
        }
        .big {
          font-size: 1.75rem; font-weight: 700; line-height: 1.05;
          color: ${isToday ? 'var(--tw-state-normal)' : 'var(--tw-accent)'};
        }
        .sub { font-size: 0.88rem; color: var(--tw-text-muted); font-weight: 500; }
        .setup { font-size: 0.84rem; color: var(--tw-text-muted); }

        /* Split layout: absolute inset:0 flex column so bottom label is NEVER pushed out */
        .split-wrap {
          position: absolute; inset: 0;
          display: flex; flex-direction: column;
          padding: 6px 10px; gap: 4px; overflow: hidden;
        }
        .split-top {
          flex: 1 1 0; min-height: 0;
          display: flex; align-items: center; justify-content: space-evenly;
          gap: 8px; overflow: hidden;
        }
        .split-left {
          flex: 0 1 auto; display: flex; align-items: center; justify-content: center;
          max-height: 100%; overflow: hidden;
        }
        .split-left .icon img,
        .split-left .icon svg {
          width: 40px; height: 40px; max-width: 100%; max-height: 100%;
          object-fit: contain; display: block;
        }
        .split-right {
          flex: 1 1 0; min-width: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; overflow: hidden;
        }
        .split-num {
          font-size: ${isToday ? '1.35rem' : '1.85rem'};
          font-weight: 700; line-height: 1;
          color: ${isToday ? 'var(--tw-state-normal)' : 'var(--tw-accent)'};
          font-variant-numeric: tabular-nums;
        }
        .split-unit {
          font-size: 0.78rem; color: var(--tw-text-muted); font-weight: 500;
          line-height: 1.15; margin-top: 2px;
        }
        .split-bottom {
          flex: 0 0 auto; text-align: center;
          font-size: 0.84rem; font-weight: 600; color: var(--tw-text); line-height: 1.25;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          border-top: 1px solid var(--tw-border); padding-top: 4px;
        }
      </style>
      ${bodyHtml}
    `;
  }
}

if (!customElements.get('tw-addon-countdown')) {
  customElements.define('tw-addon-countdown', TwAddonCountdown);
}
