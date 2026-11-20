class TwAddonHttpGet extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._busy = false;
    this._status = null; // 'ok' | 'fail' | null
    this._statusTimer = null;
  }

  set settings(val) {
    this._settings = val || {};
    this.render();
  }

  set context(val) {
    this._context = val || {};
    this.render();
  }

  disconnectedCallback() {
    if (this._statusTimer !== null) {
      clearTimeout(this._statusTimer);
      this._statusTimer = null;
    }
  }

  triggerGet() {
    const url = String(this._settings.url || '').trim();
    if (!url || this._busy) return;

    this._busy = true;
    this._status = null;
    if (this._statusTimer !== null) {
      clearTimeout(this._statusTimer);
      this._statusTimer = null;
    }
    this.render();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'trigger-get',
        payload: { url },
        onResult: (res) => {
          this._busy = false;
          this._status = res && res.ok ? 'ok' : 'fail';
          this.render();

          this._statusTimer = window.setTimeout(() => {
            this._status = null;
            this._statusTimer = null;
            this.render();
          }, 3000);
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const url = String(this._settings.url || '').trim();
    const label = typeof this._settings.label === 'string' ? this._settings.label.trim() : '';
    const labelPos = ['top', 'left', 'right'].includes(this._settings.labelPosition)
      ? this._settings.labelPosition
      : 'top';
    const displayMode = this._settings.displayMode === 'icon' ? 'icon' : 'pill';
    const pillText = (typeof this._settings.buttonText === 'string' && this._settings.buttonText.trim())
      ? this._settings.buttonText.trim()
      : 'Trigger';

    let buttonContent = `<div class="pill">${this._busy ? '...' : pillText}</div>`;
    if (displayMode === 'icon') {
      const chosenIcon = this._settings.icon || 'lightning-bolt';
      const resolved = typeof this._context?.resolveIcon === 'function'
        ? this._context.resolveIcon(chosenIcon)
        : (typeof this._context?.resolveIconPath === 'function'
            ? { kind: 'svg', path: this._context.resolveIconPath(chosenIcon) }
            : null);
      if (resolved) {
        const inner = resolved.kind === 'image'
          ? `<img src="${resolved.url}" alt="" />`
          : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${resolved.path}" /></svg>`;
        buttonContent = `<div class="icon-wrap">${inner}</div>`;
      }
    }

    const direction =
      labelPos === 'left' ? 'row' :
      labelPos === 'right' ? 'row-reverse' : 'column';

    const labelHtml = label ? `<div class="label">${label}</div>` : '';
    const statusHtml = this._status === 'ok'
      ? '<span class="status ok" aria-label="Success">✓</span>'
      : this._status === 'fail'
        ? '<span class="status fail" aria-label="Failed">✕</span>'
        : '';

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host { display: flex; width: 100%; height: 100%; position: relative; overflow: hidden; color: var(--tw-text); font-family: var(--tw-font-family); }
        button.tile-btn {
          flex: 1; width: 100%; height: 100%; border: none; background: transparent; color: inherit;
          font-family: inherit; padding: var(--tw-tile-padding, 12px);
          display: flex; flex-direction: ${direction};
          align-items: center;
          justify-content: ${label && labelPos !== 'top' ? 'space-between' : 'center'};
          gap: 8px; cursor: pointer; touch-action: manipulation; overflow: hidden;
        }
        .label {
          font-size: 0.88rem; font-weight: 600; color: var(--tw-text-muted);
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .pill {
          padding: 7px 16px; border-radius: 999px; font-weight: 700; font-size: 0.92rem;
          background: var(--tw-surface-elevated); color: var(--tw-text);
          border: 1px solid var(--tw-border); white-space: nowrap;
        }
        .icon-wrap {
          display: flex; align-items: center; justify-content: center;
          color: var(--tw-accent);
        }
        .icon-wrap svg,
        .icon-wrap img {
          width: 38px; height: 38px; max-width: 100%; max-height: 100%;
          object-fit: contain; display: block;
        }
        .status {
          position: absolute; top: 8px; right: 10px;
          width: 22px; height: 22px; border-radius: 999px;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 0.82rem; font-weight: 800; color: #ffffff;
          pointer-events: none;
        }
        .status.ok { background: var(--tw-state-normal); }
        .status.fail { background: var(--tw-state-critical); }
        .setup {
          flex: 1; display: flex; align-items: center; justify-content: center;
          text-align: center; padding: 14px; font-size: 0.84rem; color: var(--tw-text-muted);
        }
      </style>
      ${!url
        ? '<div class="setup"><div><strong>Needs setup</strong><br>Set a target URL in tile settings.</div></div>'
        : `<button type="button" class="tile-btn" ${this._busy ? 'disabled' : ''}>
             ${labelHtml}
             ${buttonContent}
           </button>
           ${statusHtml}`}
    `;

    const btn = this.shadowRoot.querySelector('button.tile-btn');
    if (btn) {
      btn.addEventListener('click', () => this.triggerGet());
    }
  }
}

if (!customElements.get('tw-addon-http-get')) {
  customElements.define('tw-addon-http-get', TwAddonHttpGet);
}
