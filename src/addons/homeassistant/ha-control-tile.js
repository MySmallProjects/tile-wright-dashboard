class TwAddonHaControl extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._state = { loading: false, toggling: false, state: null, friendlyName: '', updatedAt: null, error: null, needsSetup: false };
    this._subscribedSource = null;
  }

  get entityId() {
    return (this._settings.manualEntityId || this._settings.entityId || '').trim();
  }

  set settings(val) {
    this._settings = val || {};
    this.refreshSubscription();
    this.fetchState();
  }

  set context(val) {
    this._context = val || {};
    this.render();
  }

  set data(val) {
    if (val && val.entityId && val.entityId === this.entityId) {
      this._state = {
        ...this._state,
        state: val.state,
        friendlyName: val.friendlyName || this._state.friendlyName,
        updatedAt: val.updatedAt || new Date().toISOString()
      };
      this.render();
    }
  }

  connectedCallback() {
    this.refreshSubscription();
    this.fetchState();
  }

  disconnectedCallback() {
    if (this._subscribedSource) {
      this.dispatchEvent(new CustomEvent('unsubscribe-source', {
        detail: { source: this._subscribedSource },
        bubbles: true,
        composed: true
      }));
      this._subscribedSource = null;
    }
  }

  refreshSubscription() {
    if (!this.isConnected) return;
    const next = this.entityId ? `ha:${this.entityId}` : null;
    if (next === this._subscribedSource) return;
    if (this._subscribedSource) {
      this.dispatchEvent(new CustomEvent('unsubscribe-source', {
        detail: { source: this._subscribedSource },
        bubbles: true,
        composed: true
      }));
    }
    this._subscribedSource = next;
    if (next) {
      this.dispatchEvent(new CustomEvent('subscribe-source', {
        detail: { source: next },
        bubbles: true,
        composed: true
      }));
    }
  }

  fetchState() {
    if (!this.isConnected) return;
    if (!this.entityId) {
      this._state = { ...this._state, needsSetup: true, error: null };
      this.render();
      return;
    }

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'get-state',
        payload: { entityId: this.entityId },
        onResult: (res) => {
          if (!res) return;
          if (res.needsSetup) {
            this._state = { ...this._state, needsSetup: true, error: res.error };
          } else if (res.error) {
            this._state = { ...this._state, error: res.error };
          } else {
            this._state = {
              ...this._state,
              needsSetup: false,
              error: null,
              state: res.state,
              friendlyName: res.friendlyName || this.entityId,
              updatedAt: res.updatedAt || new Date().toISOString()
            };
          }
          this.render();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  triggerToggle() {
    if (!this.entityId || this._state.toggling) return;
    this._state = { ...this._state, toggling: true, error: null };
    this.render();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'toggle',
        payload: {
          entityId: this.entityId,
          service: this._settings.service || 'toggle'
        },
        onResult: (res) => {
          this._state = {
            ...this._state,
            toggling: false,
            state: res?.state ?? this._state.state,
            updatedAt: new Date().toISOString(),
            error: res?.error ?? null
          };
          this.render();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const st = this._state;
    const label = this._settings.label || st.friendlyName || this.entityId || 'HA Control';
    const labelPos = this._settings.labelPosition === 'bottom' ? 'bottom' : 'top';
    const service = this._settings.service || 'toggle';
    const displayMode = this._settings.displayMode === 'icon' ? 'icon' : 'text';
    const customBtnLabel = typeof this._settings.buttonLabel === 'string' ? this._settings.buttonLabel.trim() : '';
    const isOn = service !== 'press' && String(st.state || '').toLowerCase() === 'on';

    const pillText = st.toggling
      ? '...'
      : customBtnLabel
        ? customBtnLabel
        : service === 'press'
          ? 'Press'
          : (st.state ? String(st.state).toUpperCase() : 'TOGGLE');

    let centerHtml = `<div class="pill">${pillText}</div>`;
    if (displayMode === 'icon') {
      const chosenIcon = service === 'press'
        ? (this._settings.pressIcon || 'home')
        : (isOn ? (this._settings.iconOn || 'lightning-bolt') : (this._settings.iconOff || 'view-dashboard'));

      const resolved = typeof this._context?.resolveIcon === 'function'
        ? this._context.resolveIcon(chosenIcon)
        : (typeof this._context?.resolveIconPath === 'function'
            ? { kind: 'svg', path: this._context.resolveIconPath(chosenIcon) }
            : null);

      if (resolved) {
        const iconInner = resolved.kind === 'image'
          ? `<img src="${resolved.url}" alt="" />`
          : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${resolved.path}" /></svg>`;
        centerHtml = `<div class="icon-wrap ${isOn ? 'is-on' : ''}">${iconInner}</div>`;
      }
    }

    const labelHtml = `<div class="label">${label}</div>`;
    const showUpdated = Boolean(this._settings.showLastUpdated);
    let updatedText = '';
    if (showUpdated && st.updatedAt) {
      const d = new Date(st.updatedAt);
      updatedText = Number.isNaN(d.getTime())
        ? ''
        : `Updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); }
        button.tile-btn {
          flex: 1; width: 100%; height: 100%; border: none; background: transparent; color: inherit;
          font-family: inherit; padding: var(--tw-tile-padding, 12px);
          display: flex; flex-direction: column;
          align-items: ${displayMode === 'icon' ? 'center' : 'flex-start'};
          justify-content: space-between;
          text-align: ${displayMode === 'icon' ? 'center' : 'left'};
          cursor: pointer; touch-action: manipulation; gap: 6px; overflow: hidden;
        }
        .label { font-size: 0.88rem; font-weight: 600; color: var(--tw-text-muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pill {
          padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 0.92rem;
          background: ${isOn ? 'var(--tw-accent)' : 'var(--tw-surface-elevated)'};
          color: ${isOn ? 'var(--tw-accent-contrast)' : 'var(--tw-text)'};
          border: 1px solid var(--tw-border);
        }
        .icon-wrap {
          flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: center;
          color: var(--tw-text-muted); transition: color 0.15s ease, transform 0.1s ease;
        }
        .icon-wrap.is-on {
          color: var(--tw-accent);
        }
        .icon-wrap svg,
        .icon-wrap img {
          width: 40px; height: 40px; max-width: 100%; max-height: 100%;
          object-fit: contain; display: block;
        }
        .updated { font-size: 0.72rem; color: var(--tw-text-muted); opacity: 0.85; white-space: nowrap; }
        .err { font-size: 0.78rem; color: var(--tw-state-critical); }
      </style>
      ${st.needsSetup
        ? `<div style="padding:14px;font-size:0.84rem;color:var(--tw-text-muted);"><strong>Needs setup</strong><br>${st.error || 'Select a Home Assistant entity.'}</div>`
        : `<button type="button" class="tile-btn" ${st.toggling ? 'disabled' : ''}>
             ${labelPos === 'top' ? labelHtml : ''}
             ${centerHtml}
             ${labelPos === 'bottom' ? labelHtml : ''}
             ${updatedText ? `<div class="updated">${updatedText}</div>` : ''}
             ${st.error ? `<div class="err">${st.error}</div>` : ''}
           </button>`}
    `;

    const btn = this.shadowRoot.querySelector('button.tile-btn');
    if (btn) {
      btn.addEventListener('click', () => this.triggerToggle());
    }
  }
}

if (!customElements.get('tw-addon-ha-control')) {
  customElements.define('tw-addon-ha-control', TwAddonHaControl);
}
