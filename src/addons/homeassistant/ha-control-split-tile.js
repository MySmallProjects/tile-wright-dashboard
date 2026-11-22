function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

class TwAddonHaControlSplit extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._state = {
      loading: false,
      toggling: false,
      state: null,
      friendlyName: '',
      haIcon: '',
      updatedAt: null,
      error: null,
      needsSetup: false
    };
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
        haIcon: val.icon || this._state.haIcon,
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
              haIcon: res.icon || '',
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

  resolveIconMarkup(iconName) {
    if (!iconName) return '';
    const resolved = typeof this._context?.resolveIcon === 'function'
      ? this._context.resolveIcon(iconName)
      : (typeof this._context?.resolveIconPath === 'function'
          ? { kind: 'svg', path: this._context.resolveIconPath(iconName) }
          : null);

    if (!resolved) return '';
    if (resolved.kind === 'image') {
      return `<img src="${escapeHtml(resolved.url)}" alt="" />`;
    }
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${escapeHtml(resolved.path)}" /></svg>`;
  }

  render() {
    const st = this._state;
    const service = this._settings.service || 'toggle';
    const isOn = service !== 'press' && String(st.state || '').toLowerCase() === 'on';
    const iconSide = this._settings.deviceIconPosition === 'right' ? 'right' : 'left';
    const statusSizeMap = { small: 32, medium: 48, large: 64 };
    const statusIconPx = statusSizeMap[this._settings.statusIconSize] || 32;

    const deviceIconName = this._settings.deviceIcon || st.haIcon || 'home';
    const statusIconName = service === 'press'
      ? (this._settings.pressIcon || 'home')
      : (isOn ? (this._settings.iconOn || 'lightning-bolt') : (this._settings.iconOff || 'power'));

    const deviceIconHtml = this.resolveIconMarkup(deviceIconName);
    const statusIconHtml = this.resolveIconMarkup(statusIconName);

    const hideLabel = this._settings.hideLabel !== false;
    const labelOverride = typeof this._settings.label === 'string' ? this._settings.label.trim() : '';
    const labelText = hideLabel
      ? ''
      : (labelOverride || st.friendlyName || this.entityId || 'HA Control');

    const showUpdated = Boolean(this._settings.showLastUpdated);
    let updatedText = '';
    if (showUpdated && st.updatedAt) {
      const d = new Date(st.updatedAt);
      updatedText = Number.isNaN(d.getTime())
        ? ''
        : `Updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }

    const hasBottomRow = Boolean(labelText || updatedText || st.error);
    const ariaLabel = labelOverride || st.friendlyName || this.entityId || 'HA Control';

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host {
          display: block; position: relative; width: 100%; height: 100%;
          min-height: 0; overflow: hidden;
          color: var(--tw-text); font-family: var(--tw-font-family);
        }
        .setup {
          position: absolute; inset: 0; padding: 14px;
          font-size: 0.84rem; color: var(--tw-text-muted);
          display: flex; flex-direction: column; justify-content: center;
        }
        button.tile-btn {
          position: absolute; inset: 0; width: 100%; height: 100%;
          border: none; background: transparent; color: inherit; font-family: inherit;
          padding: 8px 12px; gap: 6px; overflow: hidden;
          display: flex; flex-direction: column;
          cursor: pointer; touch-action: manipulation;
        }
        .split-top {
          flex: 1 1 0; min-height: 0; width: 100%;
          display: flex; flex-direction: ${iconSide === 'right' ? 'row-reverse' : 'row'};
          align-items: center; justify-content: space-between;
          gap: 10px; overflow: hidden;
        }
        .col-device {
          flex: 1 1 0; min-width: 0; height: 100%;
          display: flex; align-items: center;
          justify-content: ${iconSide === 'right' ? 'flex-end' : 'flex-start'};
          color: var(--tw-text); overflow: hidden;
        }
        .col-device svg {
          width: 44px; height: 44px; max-width: 100%; max-height: 100%;
          object-fit: contain; display: block;
        }
        .col-device img {
          width: auto; height: 100%; max-width: 100%; max-height: 48px;
          object-fit: contain; display: block;
        }
        .col-status {
          flex: 0 0 auto; height: 100%;
          display: flex; align-items: center; justify-content: center;
          color: var(--tw-text-muted);
          transition: color 0.15s ease, opacity 0.15s ease;
        }
        .col-status.is-on {
          color: var(--tw-accent);
        }
        .col-status.is-toggling {
          opacity: 0.45;
        }
        .col-status svg,
        .col-status img {
          width: ${statusIconPx}px; height: ${statusIconPx}px; max-width: 100%; max-height: 100%;
          object-fit: contain; display: block;
        }
        .split-bottom {
          flex: 0 0 auto; width: 100%;
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          border-top: 1px solid var(--tw-border); padding-top: 4px;
          overflow: hidden;
        }
        .label {
          font-size: 0.84rem; font-weight: 600; color: var(--tw-text); line-height: 1.25;
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .updated {
          font-size: 0.72rem; color: var(--tw-text-muted); opacity: 0.85; line-height: 1.2;
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .err {
          font-size: 0.76rem; color: var(--tw-state-critical);
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
      </style>
      ${st.needsSetup
        ? `<div class="setup"><strong>Needs setup</strong><span>${escapeHtml(st.error || 'Select a Home Assistant entity.')}</span></div>`
        : `<button type="button" class="tile-btn" aria-label="${escapeHtml(ariaLabel)}" ${st.toggling ? 'disabled' : ''}>
             <div class="split-top">
               <div class="col-device">${deviceIconHtml}</div>
               <div class="col-status ${isOn ? 'is-on' : ''} ${st.toggling ? 'is-toggling' : ''}">${statusIconHtml}</div>
             </div>
             ${hasBottomRow ? `
               <div class="split-bottom">
                 ${labelText ? `<div class="label">${escapeHtml(labelText)}</div>` : ''}
                 ${updatedText ? `<div class="updated">${escapeHtml(updatedText)}</div>` : ''}
                 ${st.error ? `<div class="err">${escapeHtml(st.error)}</div>` : ''}
               </div>
             ` : ''}
           </button>`}
    `;

    const btn = this.shadowRoot.querySelector('button.tile-btn');
    if (btn) {
      btn.addEventListener('click', () => this.triggerToggle());
    }
  }
}

if (!customElements.get('tw-addon-ha-control-split')) {
  customElements.define('tw-addon-ha-control-split', TwAddonHaControlSplit);
}
