class TwAddonHaControl extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._state = { loading: false, toggling: false, state: null, friendlyName: '', error: null, needsSetup: false };
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

  set data(val) {
    if (val && val.entityId && val.entityId === this.entityId) {
      this._state = { ...this._state, state: val.state, friendlyName: val.friendlyName || this._state.friendlyName };
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
              friendlyName: res.friendlyName || this.entityId
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
    const isOn = String(st.state || '').toLowerCase() === 'on';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); }
        button.tile-btn {
          flex: 1; width: 100%; height: 100%; border: none; background: transparent; color: inherit;
          font-family: inherit; padding: var(--tw-tile-padding, 14px);
          display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between;
          text-align: left; cursor: pointer; touch-action: manipulation;
        }
        .label { font-size: 0.88rem; font-weight: 600; color: var(--tw-text-muted); }
        .pill {
          padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 0.92rem;
          background: ${isOn ? 'var(--tw-accent)' : 'var(--tw-surface-elevated)'};
          color: ${isOn ? 'var(--tw-accent-contrast)' : 'var(--tw-text)'};
          border: 1px solid var(--tw-border);
        }
        .sub { font-size: 0.76rem; color: var(--tw-text-muted); }
        .err { font-size: 0.78rem; color: var(--tw-state-critical); }
      </style>
      ${st.needsSetup
        ? `<div style="padding:14px;font-size:0.84rem;color:var(--tw-text-muted);"><strong>Needs setup</strong><br>${st.error || 'Select a Home Assistant entity.'}</div>`
        : `<button type="button" class="tile-btn" ${st.toggling ? 'disabled' : ''}>
             <div class="label">${label}</div>
             <div class="pill">${st.toggling ? '...' : (st.state ? String(st.state).toUpperCase() : 'TOGGLE')}</div>
             <div class="${st.error ? 'err' : 'sub'}">${st.error || this.entityId}</div>
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
