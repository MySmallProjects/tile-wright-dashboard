class TwAddonHaSensorMulti extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._entityStates = new Map(); // entityId -> state object
    this._subscribedSources = new Set();
  }

  _getItems() {
    const raw = Array.isArray(this._settings.items) ? this._settings.items : [];
    return raw.map((item, idx) => ({
      index: idx,
      entityId: String(item?.manualEntityId || item?.entityId || '').trim(),
      name: String(item?.name || item?.label || '').trim(),
      icon: String(item?.icon || '').trim(),
      iconSize: String(item?.iconSize || '').trim(),
      valueSize: String(item?.valueSize || 'medium').trim(),
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

  _resolveValueColour(st) {
    if (!st) return 'var(--tw-text)';
    if (st.customColour) return st.customColour;
    if (st.semanticState === 'critical') return 'var(--tw-state-critical)';
    if (st.semanticState === 'warning') return 'var(--tw-state-warning)';
    return 'var(--tw-text)';
  }

  _resolveIconHtml(item, st) {
    if (this._settings.showIcons === false) return '';
    const chosenIcon = item.icon || st?.haIcon || 'lightning-bolt';
    const resolved = typeof this._context?.resolveIcon === 'function'
      ? this._context.resolveIcon(chosenIcon)
      : (typeof this._context?.resolveIconPath === 'function'
          ? { kind: 'svg', path: this._context.resolveIconPath(chosenIcon) }
          : null);
    if (!resolved) return '';
    const inner = resolved.kind === 'image'
      ? `<img src="${this._escapeHtml(resolved.url)}" alt="" />`
      : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${resolved.path}" /></svg>`;
    return `<div class="icon-box" part="icon">${inner}</div>`;
  }

  _buildRowViewModel(item) {
    const st = item.entityId ? this._entityStates.get(item.entityId) : null;
    const label = item.name || st?.friendlyName || item.entityId || 'Select entity';
    const colour = this._resolveValueColour(st);
    const iconHtml = this._resolveIconHtml(item, st);

    let valueHtml = '<span class="sub">...</span>';
    if (!item.entityId) {
      valueHtml = '<span class="sub">No entity</span>';
    } else if (st?.error) {
      const escapedErr = this._escapeHtml(st.error);
      valueHtml = `<span class="err" title="${escapedErr}">${escapedErr}</span>`;
    } else if (st && st.value !== null && st.value !== undefined) {
      const unit = item.unitOverride || st.unit || '';
      const displayValue = typeof this._context?.formatValue === 'function'
        ? this._context.formatValue(st.value, item.valueFormat)
        : st.value;
      valueHtml = `<div class="val" part="value">${this._escapeHtml(displayValue)}${unit ? `<span class="unit">${this._escapeHtml(unit)}</span>` : ''}</div>`;
    }

    return { item, label, colour, iconHtml, valueHtml };
  }

  _buildRowStyle(vm) {
    const iconSizeMap = { xsmall: 24, small: 32, medium: 48, large: 64, xlarge: 128 };
    const valueScaleMap = { small: 0.75, medium: 1, large: 1.35, xlarge: 1.8 };
    const parts = [`--row-colour: ${this._escapeHtml(vm.colour)}`];
    const iconPx = iconSizeMap[vm.item.iconSize];
    if (iconPx) parts.push(`--row-icon-size: ${iconPx}px`);
    const valScale = valueScaleMap[vm.item.valueSize];
    if (valScale && valScale !== 1) parts.push(`--row-val-scale: ${valScale}`);
    return parts.join('; ') + ';';
  }

  _renderStackedRow(vm) {
    return `
      <div class="row" part="row" style="${this._buildRowStyle(vm)}">
        <div class="head">
          ${vm.iconHtml}
          <span class="label" part="label">${this._escapeHtml(vm.label)}</span>
        </div>
        <div class="val-wrap">
          ${vm.valueHtml}
        </div>
      </div>
    `;
  }

  _renderInlineRow(vm) {
    return `
      <div class="row" part="row" style="${this._buildRowStyle(vm)}">
        <div class="left">
          ${vm.iconHtml}
          <span class="label" part="label">${this._escapeHtml(vm.label)}</span>
        </div>
        <div class="right">
          ${vm.valueHtml}
        </div>
      </div>
    `;
  }

  render() {
    const items = this._getItems();
    const title = String(this._settings.title || '').trim();
    const layout = ['stacked', 'inline', 'grid'].includes(this._settings.layout)
      ? this._settings.layout
      : 'stacked';
    const gridColumns = ['2', '3', '4'].includes(String(this._settings.gridColumns || ''))
      ? Number(this._settings.gridColumns)
      : null;
    const gridTemplateCols = gridColumns
      ? `repeat(${gridColumns}, minmax(0, 1fr))`
      : 'repeat(auto-fit, minmax(120px, 1fr))';
    const valueAlign = ['left', 'center', 'right'].includes(this._settings.valueAlign)
      ? this._settings.valueAlign
      : 'right';
    const valueJustify =
      valueAlign === 'left' ? 'flex-start' :
      valueAlign === 'center' ? 'center' : 'flex-end';

    let setupError = null;
    for (const st of this._entityStates.values()) {
      if (st?.needsSetup) {
        setupError = st.error || 'Configure Home Assistant URL and access token in Settings → Addons.';
        break;
      }
    }

    let bodyHtml;
    if (items.length === 0) {
      bodyHtml = '<div class="empty sub"><strong>Needs setup</strong><br>Add one or more Home Assistant entities in tile settings.</div>';
    } else if (setupError) {
      bodyHtml = `<div class="empty sub"><strong>Needs setup</strong><br>${this._escapeHtml(setupError)}</div>`;
    } else {
      const vms = items.map((item) => this._buildRowViewModel(item));
      let rowsHtml;
      switch (layout) {
        case 'inline':
          rowsHtml = vms.map((vm) => this._renderInlineRow(vm)).join('');
          break;
        case 'grid':
        case 'stacked':
        default:
          rowsHtml = vms.map((vm) => this._renderStackedRow(vm)).join('');
          break;
      }
      bodyHtml = `<div class="rows layout-${layout}">${rowsHtml}</div>`;
    }

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
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--tw-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .rows {
          flex: 1 1 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          justify-content: safe center;
          overflow-y: auto;
          overflow-x: hidden;
          min-width: 0;
        }

        /* Stacked layout: large rows with icon + title on top, value below */
        .layout-stacked {
          gap: 10px;
        }
        .layout-stacked .row {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          flex-shrink: 0;
        }
        .layout-stacked .row + .row {
          padding-top: 10px;
          border-top: 1px solid var(--tw-border);
        }
        .layout-stacked .head {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .layout-stacked .icon-box {
          width: var(--row-icon-size, 22px);
          height: var(--row-icon-size, 22px);
        }
        .layout-stacked .label {
          font-size: 0.86rem;
          font-weight: 600;
          color: var(--tw-text-muted);
        }
        .layout-stacked .val-wrap {
          min-width: 0;
          text-align: ${valueAlign};
        }
        .layout-stacked .val {
          font-size: calc(1.7rem * var(--row-val-scale, 1));
          font-weight: 700;
          line-height: 1.1;
        }
        .layout-stacked .unit {
          font-size: calc(0.92rem * var(--row-val-scale, 1));
        }

        /* Grid layout: cards with icon + title on top, value below */
        .rows.layout-grid {
          display: grid;
          grid-template-columns: ${gridTemplateCols};
          align-content: safe center;
          gap: 10px;
        }
        .layout-grid .row {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--tw-text) 5%, transparent);
          border: 1px solid var(--tw-border);
          min-width: 0;
        }
        .layout-grid .head {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .layout-grid .icon-box {
          width: var(--row-icon-size, 20px);
          height: var(--row-icon-size, 20px);
        }
        .layout-grid .label {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--tw-text-muted);
        }
        .layout-grid .val-wrap {
          min-width: 0;
          text-align: ${valueAlign};
        }
        .layout-grid .val {
          font-size: calc(1.45rem * var(--row-val-scale, 1));
          font-weight: 700;
          line-height: 1.1;
        }
        .layout-grid .unit {
          font-size: calc(0.86rem * var(--row-val-scale, 1));
        }

        /* Inline layout: single-line rows with icon, name, value */
        .layout-inline {
          gap: 6px;
        }
        .layout-inline .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
          flex-shrink: 0;
        }
        .layout-inline .row + .row {
          padding-top: 6px;
          border-top: 1px solid var(--tw-border);
        }
        .layout-inline .left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex: 1;
        }
        .layout-inline .right {
          display: flex;
          align-items: center;
          justify-content: ${valueJustify};
          flex-shrink: 0;
          text-align: ${valueAlign};
          min-width: 0;
          max-width: 60%;
        }
        .layout-inline .icon-box {
          width: var(--row-icon-size, 20px);
          height: var(--row-icon-size, 20px);
        }
        .layout-inline .label {
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--tw-text-muted);
        }
        .layout-inline .val {
          font-size: calc(1.1rem * var(--row-val-scale, 1));
          font-weight: 700;
          line-height: 1.15;
        }
        .layout-inline .unit {
          font-size: calc(0.82rem * var(--row-val-scale, 1));
        }

        /* Shared */
        .icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--row-colour, var(--tw-text));
          flex-shrink: 0;
        }
        .icon-box svg,
        .icon-box img {
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
        }
        .label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .val {
          color: var(--row-colour, var(--tw-text));
          font-variant-numeric: tabular-nums;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .unit {
          font-weight: 500;
          margin-left: 3px;
          opacity: 0.85;
        }
        .sub {
          font-size: 0.78rem;
          color: var(--tw-text-muted);
        }
        .err {
          font-size: 0.78rem;
          color: var(--tw-state-critical);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: block;
        }
        .empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
      </style>
      <div class="wrap">
        ${title ? `<div class="title">${this._escapeHtml(title)}</div>` : ''}
        ${bodyHtml}
      </div>
    `;
  }
}

if (!customElements.get('tw-addon-ha-sensor-multi')) {
  customElements.define('tw-addon-ha-sensor-multi', TwAddonHaSensorMulti);
}
