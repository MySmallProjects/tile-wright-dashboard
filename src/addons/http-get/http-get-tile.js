class TwAddonHttpGet extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._busy = false;
    this._status = null; // 'ok' | 'fail' | null
    this._statusTimer = null;
    this._clickTimer = null;
    this._pillText = 'Trigger';
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
    if (this._clickTimer !== null) {
      clearTimeout(this._clickTimer);
      this._clickTimer = null;
    }
  }

  _triggerClickFeedback() {
    const btn = this.shadowRoot.querySelector('button.tile-btn');
    if (!btn) return;

    btn.classList.remove('is-clicked');
    // Force reflow so rapid re-clicks restart the keyframe animation.
    void btn.offsetWidth;
    btn.classList.add('is-clicked');

    if (this._clickTimer !== null) {
      clearTimeout(this._clickTimer);
    }
    this._clickTimer = window.setTimeout(() => {
      this._clickTimer = null;
      btn.classList.remove('is-clicked');
    }, 620);
  }

  _syncState() {
    const btn = this.shadowRoot.querySelector('button.tile-btn');
    if (btn) {
      btn.disabled = this._busy;
      btn.classList.toggle('is-busy', this._busy);
    }

    const pill = this.shadowRoot.querySelector('.pill');
    if (pill) {
      pill.textContent = this._busy ? '...' : this._pillText;
    }

    const statusEl = this.shadowRoot.querySelector('.status');
    if (statusEl) {
      if (this._status === 'ok') {
        statusEl.className = 'status ok';
        statusEl.setAttribute('aria-label', 'Success');
        statusEl.textContent = '✓';
      } else if (this._status === 'fail') {
        statusEl.className = 'status fail';
        statusEl.setAttribute('aria-label', 'Failed');
        statusEl.textContent = '✕';
      } else {
        statusEl.className = 'status';
        statusEl.removeAttribute('aria-label');
        statusEl.textContent = '';
      }
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
    this._syncState();
    this._triggerClickFeedback();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'trigger-get',
        payload: { url },
        onResult: (res) => {
          this._busy = false;
          this._status = res && res.ok ? 'ok' : 'fail';
          this._syncState();

          this._statusTimer = window.setTimeout(() => {
            this._status = null;
            this._statusTimer = null;
            this._syncState();
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
    const iconSizeMap = { small: 32, medium: 48, large: 64, xlarge: 128 };
    const iconPx = iconSizeMap[this._settings.iconSize] || 48;
    this._pillText = (typeof this._settings.buttonText === 'string' && this._settings.buttonText.trim())
      ? this._settings.buttonText.trim()
      : 'Trigger';

    let buttonContent = `<div class="pill">${this._busy ? '...' : this._pillText}</div>`;
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
        button.tile-btn:disabled { cursor: wait; }
        .label {
          flex-shrink: 0;
          font-size: 0.88rem; font-weight: 600; color: var(--tw-text-muted);
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .pill {
          position: relative;
          padding: 7px 16px; border-radius: 999px; font-weight: 700; font-size: 0.92rem;
          background: var(--tw-surface-elevated); color: var(--tw-text);
          border: 1px solid var(--tw-border); white-space: nowrap;
          transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
        }
        button.tile-btn:not(:disabled):hover .pill {
          border-color: color-mix(in srgb, var(--tw-accent) 45%, var(--tw-border));
          box-shadow: 0 4px 12px color-mix(in srgb, var(--tw-accent) 28%, rgba(0, 0, 0, 0.24));
        }
        button.tile-btn:not(:disabled):active .pill {
          transform: scale(0.95);
        }
        .icon-wrap {
          position: relative;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 1; min-width: 0; min-height: 0;
          max-width: 100%; max-height: 100%;
          color: var(--tw-accent); border-radius: 999px;
          transition: transform 0.15s ease;
        }
        .icon-wrap::after {
          content: '';
          position: absolute;
          inset: -8px;
          border-radius: 999px;
          pointer-events: none;
          opacity: 0;
        }
        .icon-wrap svg,
        .icon-wrap img {
          width: ${iconPx}px; height: ${iconPx}px; max-width: 100%; max-height: 100%;
          object-fit: contain; display: block;
          transition: filter 0.2s ease, transform 0.15s ease;
        }
        button.tile-btn:not(:disabled):hover .icon-wrap svg,
        button.tile-btn:not(:disabled):hover .icon-wrap img {
          filter: drop-shadow(0 4px 10px color-mix(in srgb, var(--tw-accent) 45%, rgba(0, 0, 0, 0.3)));
        }
        button.tile-btn:not(:disabled):active .icon-wrap {
          transform: scale(0.9);
        }
        button.tile-btn.is-clicked .icon-wrap::after {
          animation: tw-ring-fade 0.6s ease-out forwards;
        }
        button.tile-btn.is-clicked .icon-wrap svg,
        button.tile-btn.is-clicked .icon-wrap img {
          animation: tw-icon-glow 0.6s ease-out forwards;
        }
        button.tile-btn.is-clicked .pill {
          animation: tw-pill-glow 0.6s ease-out forwards;
        }
        button.tile-btn.is-busy .icon-wrap,
        button.tile-btn.is-busy .pill {
          animation: tw-busy-pulse 1.1s ease-in-out 0.18s infinite;
        }
        @keyframes tw-ring-fade {
          0% {
            opacity: 0.9;
            transform: scale(0.75);
            box-shadow: 0 0 0 2px var(--tw-accent), 0 0 14px var(--tw-accent);
          }
          100% {
            opacity: 0;
            transform: scale(1.45);
            box-shadow: 0 0 0 1px var(--tw-accent), 0 0 22px transparent;
          }
        }
        @keyframes tw-icon-glow {
          0% {
            filter: drop-shadow(0 0 12px var(--tw-accent));
            transform: scale(0.92);
          }
          35% {
            filter: drop-shadow(0 0 10px var(--tw-accent));
            transform: scale(1.03);
          }
          100% {
            filter: drop-shadow(0 0 0 transparent);
            transform: scale(1);
          }
        }
        @keyframes tw-pill-glow {
          0% {
            box-shadow: 0 0 0 2px var(--tw-accent), 0 0 16px color-mix(in srgb, var(--tw-accent) 65%, transparent);
          }
          100% {
            box-shadow: 0 0 0 10px transparent, 0 0 24px transparent;
          }
        }
        @keyframes tw-busy-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.95); }
        }
        .status {
          position: absolute; top: 8px; right: 10px;
          width: 22px; height: 22px; border-radius: 999px;
          display: none; align-items: center; justify-content: center;
          font-size: 0.82rem; font-weight: 800; color: #ffffff;
          pointer-events: none;
        }
        .status.ok { display: inline-flex; background: var(--tw-state-normal); }
        .status.fail { display: inline-flex; background: var(--tw-state-critical); }
        .setup {
          flex: 1; display: flex; align-items: center; justify-content: center;
          text-align: center; padding: 14px; font-size: 0.84rem; color: var(--tw-text-muted);
        }
      </style>
      ${!url
        ? '<div class="setup"><div><strong>Needs setup</strong><br>Set a target URL in tile settings.</div></div>'
        : `<button type="button" class="tile-btn">
             ${labelHtml}
             ${buttonContent}
           </button>
           <span class="status"></span>`}
    `;

    const btn = this.shadowRoot.querySelector('button.tile-btn');
    if (btn) {
      btn.addEventListener('click', () => this.triggerGet());
    }
    this._syncState();
  }
}

if (!customElements.get('tw-addon-http-get')) {
  customElements.define('tw-addon-http-get', TwAddonHttpGet);
}
