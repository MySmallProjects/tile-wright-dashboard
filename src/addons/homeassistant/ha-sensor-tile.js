class TwAddonHaSensor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._state = { loading: false, value: null, unit: '', friendlyName: '', haIcon: '', semanticState: 'normal', customColour: null, error: null, needsSetup: false };
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
              haIcon: res.icon || '',
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
    const labelPos = this._settings.labelPosition === 'bottom' ? 'bottom' : 'top';
    const iconPos = ['left', 'right', 'above', 'below'].includes(this._settings.iconPosition)
      ? this._settings.iconPosition
      : 'none';
    const unit = this._settings.unitOverride || st.unit || '';
    const displayValue =
      st.value !== null && typeof this._context?.formatValue === 'function'
        ? this._context.formatValue(st.value, this._settings.valueFormat)
        : st.value;

    const valueColour = st.customColour
      ? st.customColour
      : st.semanticState === 'critical'
        ? 'var(--tw-state-critical)'
        : st.semanticState === 'warning'
          ? 'var(--tw-state-warning)'
          : 'var(--tw-text)';

    let iconHtml = '';
    if (iconPos !== 'none') {
      const chosenIcon = this._settings.icon || st.haIcon || 'lightning-bolt';
      const resolved = typeof this._context?.resolveIcon === 'function'
        ? this._context.resolveIcon(chosenIcon)
        : (typeof this._context?.resolveIconPath === 'function'
            ? { kind: 'svg', path: this._context.resolveIconPath(chosenIcon) }
            : null);
      if (resolved) {
        const inner = resolved.kind === 'image'
          ? `<img src="${resolved.url}" alt="" />`
          : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${resolved.path}" /></svg>`;
        iconHtml = `<div class="icon-box">${inner}</div>`;
      }
    }

    const mainDirection =
      iconPos === 'left' ? 'row' :
      iconPos === 'right' ? 'row-reverse' :
      iconPos === 'below' ? 'column-reverse' : 'column';

    const labelHtml = `<div class="label">${label}</div>`;
    const bodyHtml = st.needsSetup
      ? `<div class="sub"><strong>Needs setup</strong><br>${st.error || 'Select an entity in tile settings.'}</div>`
      : st.value !== null
        ? `<div class="main">${iconHtml}<div class="val">${displayValue}${unit ? `<span class="unit">${unit}</span>` : ''}</div></div>`
        : st.error
          ? `<div class="err">${st.error}</div>`
          : '<div class="sub">Loading...</div>';

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host { display: flex; width: 100%; height: 100%; overflow: hidden; color: var(--tw-text); font-family: var(--tw-font-family); }
        .wrap {
          flex: 1; display: flex; flex-direction: column; justify-content: space-between;
          padding: var(--tw-tile-padding, 12px); gap: 6px; min-width: 0; min-height: 0; overflow: hidden;
        }
        .label {
          font-size: 0.84rem; font-weight: 600; color: var(--tw-text-muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0;
        }
        .main {
          flex: 1 1 0; min-height: 0; display: flex; flex-direction: ${mainDirection};
          align-items: center;
          justify-content: ${iconPos === 'left' || iconPos === 'right' ? 'space-between' : 'center'};
          gap: 8px; overflow: hidden;
        }
        .icon-box {
          display: flex; align-items: center; justify-content: center;
          color: ${valueColour}; flex-shrink: 0;
        }
        .icon-box svg,
        .icon-box img {
          width: 34px; height: 34px; max-width: 100%; max-height: 100%;
          object-fit: contain; display: block;
        }
        .val {
          font-size: 1.7rem; font-weight: 700; line-height: 1.1; color: ${valueColour};
          font-variant-numeric: tabular-nums; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .unit { font-size: 0.92rem; font-weight: 500; margin-left: 3px; opacity: 0.85; }
        .sub { font-size: 0.78rem; color: var(--tw-text-muted); }
        .err { font-size: 0.8rem; color: var(--tw-state-critical); }
      </style>
      <div class="wrap">
        ${labelPos === 'top' ? labelHtml : ''}
        ${bodyHtml}
        ${labelPos === 'bottom' ? labelHtml : ''}
      </div>
    `;
  }
}

if (!customElements.get('tw-addon-ha-sensor')) {
  customElements.define('tw-addon-ha-sensor', TwAddonHaSensor);
}
