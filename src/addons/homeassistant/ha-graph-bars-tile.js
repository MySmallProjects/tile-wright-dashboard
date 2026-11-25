class TwAddonHaGraphBars extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._entityStates = new Map(); // entityId -> state object
    this._subscribedSources = new Set();
    this._renderedSignature = null;
  }

  _getItems() {
    const raw = Array.isArray(this._settings.items) ? this._settings.items : [];
    return raw.map((item, idx) => ({
      index: idx,
      entityId: String(item?.manualEntityId || item?.entityId || '').trim(),
      name: String(item?.name || '').trim(),
      icon: String(item?.icon || '').trim(),
      minValue: item?.minValue,
      maxValue: item?.maxValue,
      unitOverride: String(item?.unitOverride || '').trim(),
      valueFormat: String(item?.valueFormat || '').trim()
    }));
  }

  _getUniqueEntityIds() {
    const ids = new Set();
    for (const item of this._getItems()) {
      if (item.entityId) ids.add(item.entityId);
    }
    return ids;
  }

  set settings(val) {
    this._settings = val || {};
    this.refreshSubscriptions();
    this.fetchAllStates();
  }

  set context(val) {
    this._context = val || {};
    this.render();
  }

  set data(val) {
    // Live push from SignalR DataUpdate (source: ha:<entityId>)
    if (val && val.entityId && this._getUniqueEntityIds().has(val.entityId)) {
      this.fetchEntityState(val.entityId);
    }
  }

  connectedCallback() {
    this.refreshSubscriptions();
    this.fetchAllStates();
  }

  disconnectedCallback() {
    for (const source of this._subscribedSources) {
      this.dispatchEvent(new CustomEvent('unsubscribe-source', {
        detail: { source },
        bubbles: true,
        composed: true
      }));
    }
    this._subscribedSources.clear();
  }

  refreshSubscriptions() {
    if (!this.isConnected) return;
    const desired = new Set();
    for (const entityId of this._getUniqueEntityIds()) {
      desired.add(`ha:${entityId}`);
    }

    for (const existing of [...this._subscribedSources]) {
      if (!desired.has(existing)) {
        this.dispatchEvent(new CustomEvent('unsubscribe-source', {
          detail: { source: existing },
          bubbles: true,
          composed: true
        }));
        this._subscribedSources.delete(existing);
      }
    }

    for (const next of desired) {
      if (!this._subscribedSources.has(next)) {
        this.dispatchEvent(new CustomEvent('subscribe-source', {
          detail: { source: next },
          bubbles: true,
          composed: true
        }));
        this._subscribedSources.add(next);
      }
    }
  }

  fetchAllStates() {
    if (!this.isConnected) return;
    const ids = this._getUniqueEntityIds();
    // Prune stale cached states for removed entities
    for (const cachedId of [...this._entityStates.keys()]) {
      if (!ids.has(cachedId)) this._entityStates.delete(cachedId);
    }
    if (ids.size === 0) {
      this.render();
      return;
    }
    for (const entityId of ids) {
      this.fetchEntityState(entityId);
    }
  }

  fetchEntityState(entityId) {
    if (!this.isConnected || !entityId) return;
    const prev = this._entityStates.get(entityId);
    if (!prev) {
      this._entityStates.set(entityId, {
        loading: true,
        value: null,
        unit: '',
        friendlyName: '',
        haIcon: '',
        semanticState: 'normal',
        customColour: null,
        error: null,
        needsSetup: false
      });
      this.render();
    }

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'get-state',
        payload: {
          entityId,
          colourRules: Array.isArray(this._settings.colourRules) ? this._settings.colourRules : []
        },
        onResult: (res) => {
          if (!res) {
            this._entityStates.set(entityId, {
              ...(this._entityStates.get(entityId) || {}),
              loading: false,
              error: 'No response from Home Assistant addon.'
            });
          } else if (res.needsSetup) {
            this._entityStates.set(entityId, {
              ...(this._entityStates.get(entityId) || {}),
              loading: false,
              needsSetup: true,
              error: res.error
            });
          } else if (res.error) {
            this._entityStates.set(entityId, {
              ...(this._entityStates.get(entityId) || {}),
              loading: false,
              error: res.error
            });
          } else {
            this._entityStates.set(entityId, {
              loading: false,
              value: res.state,
              unit: res.unit || '',
              friendlyName: res.friendlyName || entityId,
              haIcon: res.icon || '',
              semanticState: res.semanticState || 'normal',
              customColour: res.customColour || null,
              error: null,
              needsSetup: false
            });
          }
          this.render();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _parseBound(raw, fallback) {
    if (raw === '' || raw === null || raw === undefined) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  _computeRatio(rawValue, minRaw, maxRaw) {
    const min = this._parseBound(minRaw, 0);
    const max = this._parseBound(maxRaw, 100);
    const num = Number.parseFloat(String(rawValue));
    if (!Number.isFinite(num) || max <= min) return 0;
    return Math.max(0, Math.min(1, (num - min) / (max - min)));
  }

  _resolveBarColour(st) {
    const baseColour = this._settings.useCustomColour && this._settings.barColour
      ? this._settings.barColour
      : 'var(--tw-graph-bar-color, var(--tw-accent))';

    if (!st) return baseColour;
    if (st.customColour) return st.customColour;
    if (st.semanticState === 'critical') return 'var(--tw-state-critical)';
    if (st.semanticState === 'warning') return 'var(--tw-state-warning)';
    return baseColour;
  }

  _resolveIconHtml(item, st) {
    if (this._settings.showIcons === false) return '';
    const chosenIcon = item.icon || st?.haIcon || 'chart-line';
    const resolved = typeof this._context?.resolveIcon === 'function'
      ? this._context.resolveIcon(chosenIcon)
      : (typeof this._context?.resolveIconPath === 'function'
          ? { kind: 'svg', path: this._context.resolveIconPath(chosenIcon) }
          : null);
    if (!resolved) return '<div class="icon-box" part="icon"></div>';
    const inner = resolved.kind === 'image'
      ? `<img src="${resolved.url}" alt="" />`
      : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${resolved.path}" /></svg>`;
    return `<div class="icon-box" part="icon">${inner}</div>`;
  }

  _buildRowViewModel(item) {
    const st = item.entityId ? this._entityStates.get(item.entityId) : null;
    const label = item.name || st?.friendlyName || item.entityId || 'Select entity';
    const colour = this._resolveBarColour(st);

    let valueText = '…';
    let pct = 0;
    if (!item.entityId) {
      valueText = 'No entity';
    } else if (st?.error) {
      valueText = st.error;
    } else if (st && st.value !== null && st.value !== undefined) {
      const unit = item.unitOverride || st.unit || '';
      const formatted = typeof this._context?.formatValue === 'function'
        ? this._context.formatValue(st.value, item.valueFormat)
        : st.value;
      const unitGap = unit ? ' ' : '';
      valueText = `${formatted}${unitGap}${unit}`;
      pct = this._computeRatio(st.value, item.minValue, item.maxValue) * 100;
    }

    return {
      item,
      st,
      label,
      valueText,
      pct,
      colour,
      isError: Boolean(st?.error)
    };
  }

  _renderBarStyle1Row(vm) {
    const iconHtml = this._resolveIconHtml(vm.item, vm.st);
    return `
      <div class="bar-row" part="row" data-row-idx="${vm.item.index}" style="--bar-colour: ${this._escapeHtml(vm.colour)};">
        ${iconHtml}
        <div class="bar-track" part="bar">
          <div class="bar-fill" part="fill" style="width: ${vm.pct.toFixed(2)}%;"></div>
          <div class="bar-content">
            <span class="bar-label" part="label">${this._escapeHtml(vm.label)}</span>
            <span class="bar-value${vm.isError ? ' is-err' : ''}" part="value">${this._escapeHtml(vm.valueText)}</span>
          </div>
        </div>
      </div>
    `;
  }

  _updateBarStyle1InPlace(vms, title) {
    const titleEl = this.shadowRoot.querySelector('.title');
    if (title && titleEl) titleEl.textContent = title;

    const rowEls = this.shadowRoot.querySelectorAll('.bar-row');
    if (rowEls.length !== vms.length) return false;

    for (let i = 0; i < vms.length; i++) {
      const vm = vms[i];
      const rowEl = rowEls[i];
      rowEl.style.setProperty('--bar-colour', vm.colour);

      const fillEl = rowEl.querySelector('.bar-fill');
      const labelEl = rowEl.querySelector('.bar-label');
      const valueEl = rowEl.querySelector('.bar-value');
      if (!fillEl || !labelEl || !valueEl) return false;

      fillEl.style.width = `${vm.pct.toFixed(2)}%`;
      labelEl.textContent = vm.label;
      valueEl.textContent = vm.valueText;
      valueEl.classList.toggle('is-err', vm.isError);
    }
    return true;
  }

  render() {
    const items = this._getItems();
    const title = String(this._settings.title || '').trim();
    const graphType = this._settings.graphType || 'bar-style-1';
    const showIcons = this._settings.showIcons !== false;

    // Check if Home Assistant itself needs setup
    let setupError = null;
    for (const st of this._entityStates.values()) {
      if (st?.needsSetup) {
        setupError = st.error || 'Configure Home Assistant URL and access token in Settings → Addons.';
        break;
      }
    }

    const vms = items.map((item) => this._buildRowViewModel(item));
    const iconSig = showIcons ? vms.map((vm) => vm.item.icon || vm.st?.haIcon || '').join('|') : 'no-icons';
    const signature = items.length === 0
      ? 'empty'
      : setupError
        ? 'setup'
        : `${graphType}::${title ? '1' : '0'}::${items.length}::${iconSig}`;

    if (
      graphType === 'bar-style-1' &&
      items.length > 0 &&
      !setupError &&
      this._renderedSignature === signature
    ) {
      if (this._updateBarStyle1InPlace(vms, title)) {
        return;
      }
    }

    let bodyHtml;
    if (items.length === 0) {
      bodyHtml = '<div class="sub"><strong>Needs setup</strong><br>Add one or more Home Assistant entities in tile settings.</div>';
    } else if (setupError) {
      bodyHtml = `<div class="sub"><strong>Needs setup</strong><br>${this._escapeHtml(setupError)}</div>`;
    } else {
      // Dispatch by graphType so additional bar styles can be added cleanly.
      switch (graphType) {
        case 'bar-style-1':
        default:
          bodyHtml = `<div class="bars-list">${vms.map((vm) => this._renderBarStyle1Row(vm)).join('')}</div>`;
          break;
      }
    }

    this._renderedSignature = signature;
    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host {
          display: flex;
          width: 100%;
          height: 100%;
          overflow: hidden;
          color: var(--tw-text);
          font-family: var(--tw-font-family);
        }
        .wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: var(--tw-tile-padding, 12px);
          gap: 8px;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .title {
          font-size: 0.84rem;
          font-weight: 600;
          color: var(--tw-text-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .bars-list {
          flex: 1 1 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: var(--tw-graph-bar-gap, 8px);
          overflow-y: auto;
          overflow-x: hidden;
        }
        .bar-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: var(--tw-graph-bar-row-padding, 8px 10px);
          border-radius: var(--tw-graph-bar-row-radius, 12px);
          background: var(--tw-graph-bar-row-bg, color-mix(in srgb, var(--tw-text) 6%, transparent));
          min-width: 0;
          flex-shrink: 0;
        }
        .icon-box {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--tw-graph-bar-icon-color, var(--tw-text));
          flex-shrink: 0;
        }
        .icon-box svg,
        .icon-box img {
          width: 22px;
          height: 22px;
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
        }
        .bar-track {
          position: relative;
          flex: 1 1 0;
          min-width: 0;
          height: var(--tw-graph-bar-height, 30px);
          border-radius: var(--tw-graph-bar-radius, 999px);
          background: var(--tw-graph-bar-track, color-mix(in srgb, var(--bar-colour) 22%, transparent));
          overflow: hidden;
        }
        .bar-fill {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          background: var(--bar-colour);
          transition: width 0.35s ease, background-color 0.25s ease;
        }
        .bar-content {
          position: relative;
          z-index: 1;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 0 12px;
          color: var(--tw-graph-bar-text, #ffffff);
          text-shadow: var(--tw-graph-bar-text-shadow, 0 1px 2px rgba(0, 0, 0, 0.45));
          min-width: 0;
        }
        .bar-label {
          font-size: 0.85rem;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .bar-value {
          font-size: 0.85rem;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .bar-value.is-err {
          color: var(--tw-state-critical);
          font-size: 0.76rem;
        }
        .sub {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          font-size: 0.78rem;
          color: var(--tw-text-muted);
        }
      </style>
      <div class="wrap">
        ${title ? `<div class="title">${this._escapeHtml(title)}</div>` : ''}
        ${bodyHtml}
      </div>
    `;
  }
}

if (!customElements.get('tw-addon-ha-graph-bars')) {
  customElements.define('tw-addon-ha-graph-bars', TwAddonHaGraphBars);
}
