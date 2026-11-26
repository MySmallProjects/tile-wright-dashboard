class TwAddonHaControlMulti extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._entityStates = new Map(); // entityId -> state object
    this._busyEntities = new Set(); // entityId currently executing an action
    this._subscribedSources = new Set();
    this._draggingEntityId = null;
    this._pendingRender = false;
  }

  _getItems() {
    const raw = Array.isArray(this._settings.items) ? this._settings.items : [];
    const validTypes = new Set(['toggle', 'switch', 'button', 'dimmer', 'number', 'text']);
    return raw.map((item, idx) => {
      const rawType = String(item?.deviceType || 'toggle').trim();
      return {
        index: idx,
        entityId: String(item?.manualEntityId || item?.entityId || '').trim(),
        deviceType: validTypes.has(rawType) ? rawType : 'toggle',
        name: String(item?.name || item?.label || '').trim(),
        icon: String(item?.icon || '').trim(),
        iconOn: String(item?.iconOn || '').trim(),
        iconOff: String(item?.iconOff || '').trim(),
        iconSize: String(item?.iconSize || 'xsmall').trim(),
        minValue: item?.minValue,
        maxValue: item?.maxValue,
        step: item?.step,
        service: String(item?.service || 'press').trim() || 'press',
        buttonLabel: String(item?.buttonLabel || '').trim(),
        unitOverride: String(item?.unitOverride || '').trim(),
        valueFormat: String(item?.valueFormat || '').trim(),
        showLastUpdated: Boolean(item?.showLastUpdated)
      };
    });
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
    this._requestRender();
  }

  set data(val) {
    // Live push from SignalR DataUpdate (source: ha:<entityId>)
    if (!val || !val.entityId || !this._getUniqueEntityIds().has(val.entityId)) return;
    const prev = this._entityStates.get(val.entityId) || {};
    const brightness = typeof val.brightness === 'number' ? val.brightness : prev.brightness ?? null;
    const brightnessPct = typeof val.brightnessPct === 'number'
      ? val.brightnessPct
      : (typeof brightness === 'number' ? Math.round((brightness * 100) / 255) : prev.brightnessPct ?? null);

    this._entityStates.set(val.entityId, {
      ...prev,
      loading: false,
      state: val.state ?? prev.state ?? null,
      unit: val.unit ?? prev.unit ?? '',
      friendlyName: val.friendlyName || prev.friendlyName || val.entityId,
      haIcon: val.icon || prev.haIcon || '',
      brightness,
      brightnessPct,
      min: typeof val.min === 'number' ? val.min : prev.min ?? null,
      max: typeof val.max === 'number' ? val.max : prev.max ?? null,
      step: typeof val.step === 'number' ? val.step : prev.step ?? null,
      updatedAt: val.updatedAt || new Date().toISOString(),
      error: null,
      needsSetup: false
    });
    this._requestRender();
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

  _requestRender() {
    if (this._draggingEntityId) {
      this._pendingRender = true;
      return;
    }
    this._pendingRender = false;
    this.render();
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
      this._requestRender();
      return;
    }
    for (const entityId of ids) {
      this.fetchEntityState(entityId);
    }
  }

  fetchEntityState(entityId) {
    if (!this.isConnected || !entityId) return;
    if (!this._entityStates.has(entityId)) {
      this._entityStates.set(entityId, {
        loading: true,
        state: null,
        unit: '',
        friendlyName: '',
        haIcon: '',
        brightness: null,
        brightnessPct: null,
        updatedAt: null,
        error: null,
        needsSetup: false
      });
      this._requestRender();
    }

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'get-state',
        payload: { entityId },
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
              state: res.state,
              unit: res.unit || '',
              friendlyName: res.friendlyName || entityId,
              haIcon: res.icon || '',
              brightness: typeof res.brightness === 'number' ? res.brightness : null,
              brightnessPct: typeof res.brightnessPct === 'number' ? res.brightnessPct : null,
              min: typeof res.min === 'number' ? res.min : null,
              max: typeof res.max === 'number' ? res.max : null,
              step: typeof res.step === 'number' ? res.step : null,
              updatedAt: res.updatedAt || new Date().toISOString(),
              error: null,
              needsSetup: false
            });
          }
          this._requestRender();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  _triggerService(entityId, service) {
    if (!entityId || this._busyEntities.has(entityId)) return;
    this._busyEntities.add(entityId);
    this._requestRender();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'toggle',
        payload: { entityId, service: service || 'toggle' },
        onResult: (res) => {
          this._busyEntities.delete(entityId);
          const prev = this._entityStates.get(entityId) || {};
          this._entityStates.set(entityId, {
            ...prev,
            state: res?.state ?? prev.state,
            brightness: typeof res?.brightness === 'number' ? res.brightness : prev.brightness,
            brightnessPct: typeof res?.brightnessPct === 'number' ? res.brightnessPct : prev.brightnessPct,
            updatedAt: new Date().toISOString(),
            error: res?.error ?? null
          });
          this._requestRender();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  _setBrightness(entityId, brightnessPct) {
    if (!entityId) return;
    const clamped = Math.max(0, Math.min(100, Math.round(Number(brightnessPct) || 0)));
    this._busyEntities.add(entityId);

    const prev = this._entityStates.get(entityId) || {};
    this._entityStates.set(entityId, {
      ...prev,
      state: clamped > 0 ? 'on' : 'off',
      brightnessPct: clamped,
      updatedAt: new Date().toISOString(),
      error: null
    });
    this._requestRender();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'set-brightness',
        payload: { entityId, brightnessPct: clamped },
        onResult: (res) => {
          this._busyEntities.delete(entityId);
          const cur = this._entityStates.get(entityId) || {};
          this._entityStates.set(entityId, {
            ...cur,
            state: res?.state ?? cur.state,
            brightness: typeof res?.brightness === 'number' ? res.brightness : cur.brightness,
            brightnessPct: typeof res?.brightnessPct === 'number' ? res.brightnessPct : clamped,
            updatedAt: new Date().toISOString(),
            error: res?.error ?? null
          });
          this._requestRender();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  _setNumberValue(entityId, rawValue) {
    if (!entityId) return;
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return;
    this._busyEntities.add(entityId);

    const prev = this._entityStates.get(entityId) || {};
    this._entityStates.set(entityId, {
      ...prev,
      state: String(num),
      updatedAt: new Date().toISOString(),
      error: null
    });
    this._requestRender();

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'set-value',
        payload: { entityId, value: num },
        onResult: (res) => {
          this._busyEntities.delete(entityId);
          const cur = this._entityStates.get(entityId) || {};
          this._entityStates.set(entityId, {
            ...cur,
            state: res?.state ?? cur.state,
            min: typeof res?.min === 'number' ? res.min : cur.min,
            max: typeof res?.max === 'number' ? res.max : cur.max,
            step: typeof res?.step === 'number' ? res.step : cur.step,
            updatedAt: new Date().toISOString(),
            error: res?.error ?? null
          });
          this._requestRender();
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  _parseFinite(raw) {
    if (raw === '' || raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _resolveIconMarkup(iconName) {
    if (!iconName) return '';
    const resolved = typeof this._context?.resolveIcon === 'function'
      ? this._context.resolveIcon(iconName)
      : (typeof this._context?.resolveIconPath === 'function'
          ? { kind: 'svg', path: this._context.resolveIconPath(iconName) }
          : null);
    if (!resolved) return '';
    if (resolved.kind === 'image') {
      return `<img src="${this._escapeHtml(resolved.url)}" alt="" />`;
    }
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${this._escapeHtml(resolved.path)}" /></svg>`;
  }

  _formatUpdatedTime(updatedAt) {
    if (!updatedAt) return '';
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return '';
    return `Updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }

  _getBrightnessPct(st) {
    const isOn = String(st?.state || '').toLowerCase() === 'on';
    if (!isOn) return 0;
    if (typeof st?.brightnessPct === 'number' && Number.isFinite(st.brightnessPct)) {
      return Math.max(0, Math.min(100, Math.round(st.brightnessPct)));
    }
    if (typeof st?.brightness === 'number' && Number.isFinite(st.brightness)) {
      return Math.max(0, Math.min(100, Math.round((st.brightness * 100) / 255)));
    }
    return 100;
  }

  _buildRowViewModel(item) {
    const st = item.entityId ? this._entityStates.get(item.entityId) : null;
    const label = item.name || st?.friendlyName || item.entityId || 'Select entity';
    const isBusy = item.entityId ? this._busyEntities.has(item.entityId) : false;
    const isOn = String(st?.state || '').toLowerCase() === 'on';
    const updatedText = item.showLastUpdated && st?.updatedAt ? this._formatUpdatedTime(st.updatedAt) : '';

    // Leading icon is optional and omitted for `toggle` (which uses per-device On/Off icons on the button itself)
    let leadingIconHtml = '';
    if (item.deviceType !== 'toggle' && item.icon) {
      const markup = this._resolveIconMarkup(item.icon);
      if (markup) {
        const iconActive = (item.deviceType === 'switch' || item.deviceType === 'dimmer') && isOn;
        leadingIconHtml = `<div class="icon-box ${iconActive ? 'is-on' : ''}" part="icon">${markup}</div>`;
      }
    }

    let controlHtml = '';
    if (!item.entityId) {
      controlHtml = '<span class="sub">No entity</span>';
    } else if (st?.error) {
      const escapedErr = this._escapeHtml(st.error);
      controlHtml = `<span class="err" title="${escapedErr}">${escapedErr}</span>`;
    } else {
      switch (item.deviceType) {
        case 'toggle': {
          const iconSizeMap = { xsmall: 24, small: 32, medium: 48, large: 64 };
          const iconPx = iconSizeMap[item.iconSize] || 24;
          const btnPx = iconPx + 12;
          const chosenIcon = isOn
            ? (item.iconOn || item.iconOff)
            : (item.iconOff || item.iconOn);
          const iconMarkup = chosenIcon ? this._resolveIconMarkup(chosenIcon) : '';
          if (iconMarkup) {
            controlHtml = `
              <button
                type="button"
                class="icon-toggle-btn ${isOn ? 'is-on' : ''} ${isBusy ? 'is-busy' : ''}"
                style="--toggle-icon-px: ${iconPx}px; --toggle-btn-px: ${btnPx}px;"
                data-action="toggle"
                data-entity="${this._escapeHtml(item.entityId)}"
                data-service="toggle"
                aria-label="Toggle ${this._escapeHtml(label)}"
                aria-pressed="${isOn ? 'true' : 'false'}"
                ${isBusy ? 'disabled' : ''}
              >${iconMarkup}</button>
            `;
          } else {
            const pillLabel = isBusy ? '...' : (st?.state ? String(st.state).toUpperCase() : 'TOGGLE');
            controlHtml = `
              <button
                type="button"
                class="pill-btn ${isOn ? 'is-on' : ''}"
                data-action="toggle"
                data-entity="${this._escapeHtml(item.entityId)}"
                data-service="toggle"
                aria-label="Toggle ${this._escapeHtml(label)}"
                aria-pressed="${isOn ? 'true' : 'false'}"
                ${isBusy ? 'disabled' : ''}
              >${this._escapeHtml(pillLabel)}</button>
            `;
          }
          break;
        }

        case 'switch': {
          controlHtml = `
            <button
              type="button"
              role="switch"
              class="switch-btn ${isOn ? 'is-on' : ''} ${isBusy ? 'is-busy' : ''}"
              data-action="toggle"
              data-entity="${this._escapeHtml(item.entityId)}"
              data-service="toggle"
              aria-label="Toggle ${this._escapeHtml(label)}"
              aria-checked="${isOn ? 'true' : 'false'}"
              ${isBusy ? 'disabled' : ''}
            >
              <span class="switch-knob"></span>
            </button>
          `;
          break;
        }

        case 'button': {
          const defaultLabel =
            item.service === 'press' ? 'Press' :
            item.service === 'turn_on' ? 'Run' :
            item.service === 'turn_off' ? 'Off' : 'Toggle';
          const btnText = isBusy ? '...' : (item.buttonLabel || defaultLabel);
          controlHtml = `
            <button
              type="button"
              class="pill-btn action-btn"
              data-action="toggle"
              data-entity="${this._escapeHtml(item.entityId)}"
              data-service="${this._escapeHtml(item.service)}"
              aria-label="${this._escapeHtml(label)}"
              ${isBusy ? 'disabled' : ''}
            >${this._escapeHtml(btnText)}</button>
          `;
          break;
        }

        case 'dimmer': {
          const pct = this._getBrightnessPct(st);
          const pctText = pct > 0 ? `${pct}%` : 'Off';
          controlHtml = `
            <div class="dimmer-wrap" part="slider-wrap">
              <div class="slider-track" part="slider" style="--pct: ${pct}%;">
                <div class="slider-fill" part="slider-fill">
                  <span class="slider-handle" part="slider-handle"></span>
                </div>
                <input
                  type="range"
                  class="dimmer-slider"
                  min="0"
                  max="100"
                  step="1"
                  value="${pct}"
                  data-slider-kind="dimmer"
                  data-entity="${this._escapeHtml(item.entityId)}"
                  aria-label="${this._escapeHtml(label)} brightness"
                />
              </div>
              <span class="dimmer-pct" part="slider-value" data-pct-for="${this._escapeHtml(item.entityId)}">${pctText}</span>
            </div>
          `;
          break;
        }

        case 'number': {
          const min = this._parseFinite(item.minValue) ?? (typeof st?.min === 'number' ? st.min : 0);
          const max = this._parseFinite(item.maxValue) ?? (typeof st?.max === 'number' ? st.max : 100);
          const rawStep = this._parseFinite(item.step) ?? (typeof st?.step === 'number' ? st.step : 1);
          const step = rawStep > 0 ? rawStep : 1;
          const parsedVal = this._parseFinite(st?.state);
          const curVal = parsedVal !== null ? Math.max(min, Math.min(max, parsedVal)) : min;
          const pct = max > min ? Math.max(0, Math.min(100, ((curVal - min) / (max - min)) * 100)) : 0;
          const unit = st?.unit || '';
          const displayText = parsedVal !== null
            ? `${curVal}${unit ? ` ${unit}` : ''}`
            : '…';
          controlHtml = `
            <div class="dimmer-wrap" part="slider-wrap">
              <div class="slider-track" part="slider" style="--pct: ${pct.toFixed(2)}%;">
                <div class="slider-fill" part="slider-fill">
                  <span class="slider-handle" part="slider-handle"></span>
                </div>
                <input
                  type="range"
                  class="dimmer-slider"
                  min="${min}"
                  max="${max}"
                  step="${step}"
                  value="${curVal}"
                  data-slider-kind="number"
                  data-unit="${this._escapeHtml(unit)}"
                  data-entity="${this._escapeHtml(item.entityId)}"
                  aria-label="${this._escapeHtml(label)} value"
                />
              </div>
              <span class="dimmer-pct" part="slider-value" data-pct-for="${this._escapeHtml(item.entityId)}">${this._escapeHtml(displayText)}</span>
            </div>
          `;
          break;
        }

        case 'text':
        default: {
          if (st && st.state !== null && st.state !== undefined) {
            const unit = item.unitOverride || st.unit || '';
            const displayValue = typeof this._context?.formatValue === 'function'
              ? this._context.formatValue(st.state, item.valueFormat)
              : st.state;
            controlHtml = `<div class="val" part="value">${this._escapeHtml(displayValue)}${unit ? `<span class="unit">${this._escapeHtml(unit)}</span>` : ''}</div>`;
          } else {
            controlHtml = '<span class="sub">...</span>';
          }
          break;
        }
      }
    }

    return {
      item,
      label,
      isOn,
      isBusy,
      updatedText,
      leadingIconHtml,
      controlHtml,
      isDimmer: item.deviceType === 'dimmer'
    };
  }

  _renderHeaderBlock(vm) {
    const labelMeta = `
      <div class="label-col">
        <span class="label" part="label">${this._escapeHtml(vm.label)}</span>
        ${vm.updatedText ? `<span class="updated">${this._escapeHtml(vm.updatedText)}</span>` : ''}
      </div>
    `;

    if (vm.isDimmer && vm.item.entityId) {
      return `
        <button
          type="button"
          class="head-toggle ${vm.isOn ? 'is-on' : ''}"
          data-action="toggle"
          data-entity="${this._escapeHtml(vm.item.entityId)}"
          data-service="toggle"
          title="Tap to toggle on/off"
          aria-label="Toggle ${this._escapeHtml(vm.label)}"
          ${vm.isBusy ? 'disabled' : ''}
        >
          ${vm.leadingIconHtml}
          ${labelMeta}
        </button>
      `;
    }

    return `
      <div class="head-static">
        ${vm.leadingIconHtml}
        ${labelMeta}
      </div>
    `;
  }

  _renderInlineRow(vm) {
    return `
      <div class="row type-${vm.item.deviceType}" part="row">
        <div class="left">
          ${this._renderHeaderBlock(vm)}
        </div>
        <div class="right">
          ${vm.controlHtml}
        </div>
      </div>
    `;
  }

  _renderStackedRow(vm) {
    return `
      <div class="row type-${vm.item.deviceType}" part="row">
        <div class="head">
          ${this._renderHeaderBlock(vm)}
        </div>
        <div class="ctrl-wrap">
          ${vm.controlHtml}
        </div>
      </div>
    `;
  }

  _bindEvents() {
    this.shadowRoot.querySelectorAll('button[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const entityId = btn.getAttribute('data-entity');
        const service = btn.getAttribute('data-service') || 'toggle';
        if (entityId) this._triggerService(entityId, service);
      });
    });

    this.shadowRoot.querySelectorAll('input.dimmer-slider').forEach((slider) => {
      const entityId = slider.getAttribute('data-entity');
      const kind = slider.getAttribute('data-slider-kind') || 'dimmer';
      const unit = slider.getAttribute('data-unit') || '';
      const trackEl = slider.closest('.slider-track');
      const pctEl = slider.closest('.dimmer-wrap')?.querySelector('.dimmer-pct');

      slider.addEventListener('pointerdown', () => {
        this._draggingEntityId = entityId;
      });

      const finishDrag = () => {
        if (this._draggingEntityId === entityId) {
          this._draggingEntityId = null;
          if (this._pendingRender) {
            this._pendingRender = false;
            this.render();
          }
        }
      };
      slider.addEventListener('pointerup', finishDrag);
      slider.addEventListener('pointercancel', finishDrag);

      slider.addEventListener('input', () => {
        const val = Number(slider.value);
        const min = Number(slider.min);
        const max = Number(slider.max);
        const pct = max > min ? Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100)) : 0;
        if (trackEl) trackEl.style.setProperty('--pct', `${pct.toFixed(2)}%`);
        if (pctEl) {
          if (kind === 'number') {
            pctEl.textContent = `${val}${unit ? ` ${unit}` : ''}`;
          } else {
            pctEl.textContent = val > 0 ? `${val}%` : 'Off';
          }
        }
      });

      slider.addEventListener('change', () => {
        this._draggingEntityId = null;
        if (!entityId) return;
        if (kind === 'number') {
          this._setNumberValue(entityId, Number(slider.value));
        } else {
          this._setBrightness(entityId, Number(slider.value));
        }
      });
    });
  }

  render() {
    const items = this._getItems();
    const title = String(this._settings.title || '').trim();
    const layout = ['inline', 'stacked', 'grid'].includes(this._settings.layout)
      ? this._settings.layout
      : 'inline';
    const gridColumns = ['2', '3', '4'].includes(String(this._settings.gridColumns || ''))
      ? Number(this._settings.gridColumns)
      : null;
    const gridTemplateCols = gridColumns
      ? `repeat(${gridColumns}, minmax(0, 1fr))`
      : 'repeat(auto-fit, minmax(140px, 1fr))';

    let setupError = null;
    for (const st of this._entityStates.values()) {
      if (st?.needsSetup) {
        setupError = st.error || 'Configure Home Assistant URL and access token in Settings → Addons.';
        break;
      }
    }

    let bodyHtml;
    if (items.length === 0) {
      bodyHtml = '<div class="empty sub"><strong>Needs setup</strong><br>Add one or more Home Assistant devices in tile settings.</div>';
    } else if (setupError) {
      bodyHtml = `<div class="empty sub"><strong>Needs setup</strong><br>${this._escapeHtml(setupError)}</div>`;
    } else {
      const vms = items.map((item) => this._buildRowViewModel(item));
      let rowsHtml;
      switch (layout) {
        case 'stacked':
        case 'grid':
          rowsHtml = vms.map((vm) => this._renderStackedRow(vm)).join('');
          break;
        case 'inline':
        default:
          rowsHtml = vms.map((vm) => this._renderInlineRow(vm)).join('');
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

        /* Inline layout */
        .layout-inline {
          gap: 8px;
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
          padding-top: 8px;
          border-top: 1px solid var(--tw-border);
        }
        .layout-inline .left {
          display: flex;
          align-items: center;
          min-width: 0;
          flex: 1 1 auto;
        }
        .layout-inline .right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-shrink: 0;
          min-width: 0;
        }
        .layout-inline .row.type-dimmer .right,
        .layout-inline .row.type-number .right {
          flex: 0 1 52%;
          min-width: 110px;
        }

        /* Stacked layout */
        .layout-stacked {
          gap: 10px;
        }
        .layout-stacked .row {
          display: flex;
          flex-direction: column;
          gap: 6px;
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
          min-width: 0;
        }
        .layout-stacked .ctrl-wrap {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-width: 0;
        }
        .layout-stacked .row.type-dimmer .ctrl-wrap,
        .layout-stacked .row.type-number .ctrl-wrap {
          justify-content: stretch;
        }
        .layout-stacked .val {
          font-size: 1.5rem;
        }

        /* Grid layout */
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
          gap: 8px;
          padding: 8px 10px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--tw-text) 5%, transparent);
          border: 1px solid var(--tw-border);
          min-width: 0;
        }
        .layout-grid .head {
          display: flex;
          align-items: center;
          min-width: 0;
        }
        .layout-grid .ctrl-wrap {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-width: 0;
        }
        .layout-grid .row.type-dimmer .ctrl-wrap,
        .layout-grid .row.type-number .ctrl-wrap {
          justify-content: stretch;
        }
        .layout-grid .val {
          font-size: 1.35rem;
        }

        /* Header (icon + name + optional updated time) */
        .head-static,
        .head-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          max-width: 100%;
        }
        .head-toggle {
          border: none;
          background: transparent;
          color: inherit;
          font-family: inherit;
          padding: 2px 4px;
          margin: -2px -4px;
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          touch-action: manipulation;
          transition: background-color 0.15s ease;
        }
        .head-toggle:hover {
          background: color-mix(in srgb, var(--tw-text) 8%, transparent);
        }
        .head-toggle:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .label-col {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .label {
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--tw-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .updated {
          font-size: 0.7rem;
          color: var(--tw-text-muted);
          opacity: 0.85;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .icon-box {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--tw-text-muted);
          flex-shrink: 0;
          transition: color 0.15s ease;
        }
        .icon-box.is-on {
          color: var(--tw-accent);
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

        /* Icon toggle button */
        .icon-toggle-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: var(--toggle-btn-px, 36px);
          height: var(--toggle-btn-px, 36px);
          padding: 4px;
          border: 1px solid var(--tw-border);
          border-radius: 10px;
          background: var(--tw-surface-elevated, color-mix(in srgb, var(--tw-text) 6%, transparent));
          color: var(--tw-text-muted);
          cursor: pointer;
          touch-action: manipulation;
          transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
        }
        .icon-toggle-btn.is-on {
          color: var(--tw-accent);
          border-color: color-mix(in srgb, var(--tw-accent) 55%, var(--tw-border));
          background: color-mix(in srgb, var(--tw-accent) 14%, transparent);
        }
        .icon-toggle-btn.is-busy {
          opacity: 0.45;
        }
        .icon-toggle-btn svg,
        .icon-toggle-btn img {
          width: var(--toggle-icon-px, 24px);
          height: var(--toggle-icon-px, 24px);
          object-fit: contain;
          display: block;
        }

        /* Pill button (toggle fallback & button action) */
        .pill-btn {
          padding: 5px 12px;
          border-radius: 999px;
          font-family: inherit;
          font-weight: 700;
          font-size: 0.8rem;
          background: var(--tw-surface-elevated, color-mix(in srgb, var(--tw-text) 8%, transparent));
          color: var(--tw-text);
          border: 1px solid var(--tw-border);
          cursor: pointer;
          touch-action: manipulation;
          white-space: nowrap;
          transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
        }
        .pill-btn:hover:not(:disabled) {
          border-color: var(--tw-accent);
        }
        .pill-btn.is-on {
          background: var(--tw-accent);
          color: var(--tw-accent-contrast, #ffffff);
          border-color: var(--tw-accent);
        }
        .pill-btn:disabled {
          opacity: 0.55;
          cursor: default;
        }

        /* 2-state sliding switch */
        .switch-btn {
          position: relative;
          width: 46px;
          height: 26px;
          border-radius: 999px;
          border: 1px solid var(--tw-border);
          background: var(--tw-surface-elevated, color-mix(in srgb, var(--tw-text) 14%, transparent));
          padding: 2px;
          cursor: pointer;
          touch-action: manipulation;
          flex-shrink: 0;
          transition: background-color 0.18s ease, border-color 0.18s ease, opacity 0.15s ease;
        }
        .switch-btn.is-on {
          background: var(--tw-accent);
          border-color: var(--tw-accent);
        }
        .switch-btn.is-busy {
          opacity: 0.55;
        }
        .switch-knob {
          display: block;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          transform: translateX(0);
          transition: transform 0.18s ease;
        }
        .switch-btn.is-on .switch-knob {
          transform: translateX(20px);
        }

        /* Light dimmer & number slider (pill-bar style) */
        .dimmer-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          min-width: 0;
        }
        .slider-track {
          position: relative;
          flex: 1 1 0;
          min-width: 60px;
          height: var(--tw-slider-height, 36px);
          border-radius: var(--tw-slider-radius, 12px);
          background: var(--tw-slider-track, color-mix(in srgb, var(--tw-slider-fill, var(--tw-accent)) 20%, transparent));
          overflow: hidden;
        }
        .slider-track:has(.dimmer-slider:focus-visible) {
          outline: 2px solid var(--tw-accent);
          outline-offset: 2px;
        }
        .slider-fill {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          width: var(--pct, 0%);
          background: var(--tw-slider-fill, var(--tw-accent));
          border-radius: var(--tw-slider-radius, 12px);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 6px;
          overflow: hidden;
          pointer-events: none;
        }
        .slider-handle {
          width: var(--tw-slider-handle-width, 4px);
          height: var(--tw-slider-handle-height, 50%);
          min-height: 12px;
          max-height: 24px;
          border-radius: var(--tw-slider-handle-radius, 999px);
          background: var(--tw-slider-handle-bg, #ffffff);
          box-shadow: var(--tw-slider-handle-shadow, 0 1px 2px rgba(0, 0, 0, 0.25));
          flex-shrink: 0;
        }
        .dimmer-slider {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          opacity: 0;
          cursor: pointer;
          touch-action: none;
        }
        .dimmer-pct {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--tw-slider-value-color, var(--tw-text-muted));
          font-variant-numeric: tabular-nums;
          min-width: 34px;
          text-align: right;
          flex-shrink: 0;
        }

        /* Text / Value (read-only) */
        .val {
          font-size: 1.1rem;
          font-weight: 700;
          line-height: 1.15;
          color: var(--tw-text);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .unit {
          font-size: 0.82rem;
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

    this._bindEvents();
  }
}

if (!customElements.get('tw-addon-ha-control-multi')) {
  customElements.define('tw-addon-ha-control-multi', TwAddonHaControlMulti);
}
