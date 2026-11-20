class TwAddonHaSensor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._state = { loading: false, value: null, unit: '', friendlyName: '', semanticState: 'normal', customColour: null, error: null, needsSetup: false };
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
    // Live push from SignalR DataUpdate (source: ha:<entityId>)
    if (val && val.entityId && val.entityId === this.entityId) {
      this.fetchState();
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

    this._state = { ...this._state, loading: this._state.value === null, needsSetup: false, error: null };
    this.render();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'get-state',
        payload: {
          entityId: this.entityId,
          colourRules: Array.isArray(this._settings.colourRules) ? this._settings.colourRules : []
        },
        onResult: (res) => {
          if (!res) {
            this._state = { ...this._state, loading: false, error: 'No response from Home Assistant addon.' };
          } else if (res.needsSetup) {
            this._state = { ...this._state, loading: false, needsSetup: true, error: res.error };
          } else if (res.error) {
            this._state = { ...this._state, loading: false, error: res.error };
          } else {
            this._state = {
              loading: false,
              value: res.state,
              unit: res.unit || '',
              friendlyName: res.friendlyName || this.entityId,
              semanticState: res.semanticState || 'normal',
              customColour: res.customColour || null,
              error: null,
              needsSetup: false
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
    const st = this._state;
    const label = this._settings.label || st.friendlyName || this.entityId || 'HA Sensor';
    const unit = this._settings.unitOverride || st.unit || '';

    const valueColour = st.customColour
      ? st.customColour
      : st.semanticState === 'critical'
        ? 'var(--tw-state-critical)'
        : st.semanticState === 'warning'
          ? 'var(--tw-state-warning)'
          : 'var(--tw-text)';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); }
        .wrap {
          flex: 1; display: flex; flex-direction: column; justify-content: space-between;
          padding: var(--tw-tile-padding, 14px); gap: 6px; min-width: 0;
        }
        .label { font-size: 0.84rem; font-weight: 600; color: var(--tw-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .val { font-size: 1.75rem; font-weight: 700; line-height: 1.1; color: ${valueColour}; font-variant-numeric: tabular-nums; }
        .unit { font-size: 0.95rem; font-weight: 500; margin-left: 3px; opacity: 0.85; }
        .sub { font-size: 0.78rem; color: var(--tw-text-muted); }
        .err { font-size: 0.8rem; color: var(--tw-state-critical); }
      </style>
      <div class="wrap">
        <div class="label">${label}</div>
        ${st.needsSetup
          ? `<div class="sub"><strong>Needs setup</strong><br>${st.error || 'Select an entity in tile settings.'}</div>`
          : st.value !== null
            ? `<div class="val">${st.value}${unit ? `<span class="unit">${unit}</span>` : ''}</div><div class="sub">${this.entityId}</div>`
            : st.error
              ? `<div class="err">${st.error}</div>`
              : '<div class="sub">Loading...</div>'}
      </div>
    `;
  }
}

if (!customElements.get('tw-addon-ha-sensor')) {
  customElements.define('tw-addon-ha-sensor', TwAddonHaSensor);
}
