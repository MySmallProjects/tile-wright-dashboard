class TwAddonHaGraph extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._state = {
      loading: false,
      value: null,
      unit: '',
      friendlyName: '',
      semanticState: 'normal',
      customColour: null,
      error: null,
      needsSetup: false
    };
    this._subscribedSource = null;
    this._renderedMode = null;
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

  _computeGaugeMetrics(rawValue) {
    const min = this._parseBound(this._settings.minValue, 0);
    const max = this._parseBound(this._settings.maxValue, 100);
    const num = Number.parseFloat(String(rawValue));
    const isNumeric = Number.isFinite(num);

    let ratio = 0;
    if (isNumeric && max > min) {
      ratio = Math.max(0, Math.min(1, (num - min) / (max - min)));
    }
    return { min, max, num, isNumeric, ratio };
  }

  _pickValueFontSize(text) {
    const len = String(text || '').length;
    if (len <= 4) return 28;
    if (len <= 6) return 23;
    if (len <= 8) return 19;
    if (len <= 11) return 15;
    return 12;
  }

  _resolveColour() {
    const st = this._state;
    const baseColour = this._settings.useCustomColour && this._settings.fillColour
      ? this._settings.fillColour
      : 'var(--tw-accent, #22c55e)';

    if (st.customColour) return st.customColour;
    if (st.semanticState === 'critical') return 'var(--tw-state-critical)';
    if (st.semanticState === 'warning') return 'var(--tw-state-warning)';
    return baseColour;
  }

  _renderGaugeSimpleHtml({ ratio, displayValue, unit, gaugeColour }) {
    const radius = 74;
    const arcLength = Math.PI * radius;
    const dashOffset = arcLength * (1 - ratio);
    const fullText = unit ? `${displayValue}${unit.startsWith('%') ? '' : ' '}${unit}` : String(displayValue);
    const fontSize = this._pickValueFontSize(fullText);
    const unitFontSize = Math.max(10, Math.round(fontSize * 0.65));
    const unitGap = unit && !unit.startsWith('%') ? ' ' : '';

    return `
      <div class="graph-wrap">
        <svg class="gauge-svg" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${this._escapeHtml(fullText)}">
          <path
            class="gauge-track"
            d="M 26 108 A 74 74 0 0 1 174 108"
            fill="none"
            stroke-width="34"
            stroke-linecap="butt"
          />
          <path
            class="gauge-fill"
            d="M 26 108 A 74 74 0 0 1 174 108"
            fill="none"
            stroke="${this._escapeHtml(gaugeColour)}"
            stroke-width="34"
            stroke-linecap="butt"
            stroke-dasharray="${arcLength.toFixed(3)}"
            stroke-dashoffset="${dashOffset.toFixed(3)}"
            stroke-opacity="${ratio > 0 ? '1' : '0'}"
          />
          <text
            class="gauge-value"
            x="100"
            y="102"
            text-anchor="middle"
            fill="${this._escapeHtml(gaugeColour)}"
            font-size="${fontSize}"
          ><tspan class="val-num">${this._escapeHtml(displayValue)}</tspan>${unit ? `<tspan class="val-unit" font-size="${unitFontSize}">${this._escapeHtml(unitGap + unit)}</tspan>` : ''}</text>
        </svg>
      </div>
    `;
  }

  _updateGaugeSimpleInPlace({ title, ratio, displayValue, unit, gaugeColour }) {
    const titleEl = this.shadowRoot.querySelector('.title');
    if (titleEl) titleEl.textContent = title;

    const fillEl = this.shadowRoot.querySelector('.gauge-fill');
    const valEl = this.shadowRoot.querySelector('.gauge-value');
    const svgEl = this.shadowRoot.querySelector('.gauge-svg');
    if (!fillEl || !valEl || !svgEl) return false;

    const radius = 74;
    const arcLength = Math.PI * radius;
    const dashOffset = arcLength * (1 - ratio);
    const fullText = unit ? `${displayValue}${unit.startsWith('%') ? '' : ' '}${unit}` : String(displayValue);
    const fontSize = this._pickValueFontSize(fullText);
    const unitFontSize = Math.max(10, Math.round(fontSize * 0.65));
    const unitGap = unit && !unit.startsWith('%') ? ' ' : '';

    svgEl.setAttribute('aria-label', fullText);
    fillEl.setAttribute('stroke', gaugeColour);
    fillEl.setAttribute('stroke-dasharray', arcLength.toFixed(3));
    fillEl.setAttribute('stroke-dashoffset', dashOffset.toFixed(3));
    fillEl.setAttribute('stroke-opacity', ratio > 0 ? '1' : '0');

    valEl.setAttribute('fill', gaugeColour);
    valEl.setAttribute('font-size', String(fontSize));
    valEl.innerHTML = `<tspan class="val-num">${this._escapeHtml(displayValue)}</tspan>${unit ? `<tspan class="val-unit" font-size="${unitFontSize}">${this._escapeHtml(unitGap + unit)}</tspan>` : ''}`;
    return true;
  }

  render() {
    const st = this._state;
    const title = (this._settings.title || '').trim() || st.friendlyName || this.entityId || 'HA Graph';
    const graphType = this._settings.graphType || 'gauge-simple';
    const unit = this._settings.unitOverride || st.unit || '';
    const displayValue =
      st.value !== null && typeof this._context?.formatValue === 'function'
        ? this._context.formatValue(st.value, this._settings.valueFormat)
        : st.value;

    const gaugeColour = this._resolveColour();
    const isGraphReady = !st.needsSetup && st.value !== null;
    const modeKey = isGraphReady ? `graph:${graphType}` : 'status';

    if (isGraphReady && graphType === 'gauge-simple' && this._renderedMode === modeKey) {
      const { ratio } = this._computeGaugeMetrics(st.value);
      if (this._updateGaugeSimpleInPlace({ title, ratio, displayValue, unit, gaugeColour })) {
        return;
      }
    }

    let bodyHtml;
    if (st.needsSetup) {
      bodyHtml = `<div class="sub"><strong>Needs setup</strong><br>${this._escapeHtml(st.error || 'Select an entity in tile settings.')}</div>`;
    } else if (st.value !== null) {
      const { ratio } = this._computeGaugeMetrics(st.value);
      // Dispatch by graphType so future graph types can be added cleanly.
      switch (graphType) {
        case 'gauge-simple':
        default:
          bodyHtml = this._renderGaugeSimpleHtml({ ratio, displayValue, unit, gaugeColour });
          break;
      }
    } else if (st.error) {
      bodyHtml = `<div class="err">${this._escapeHtml(st.error)}</div>`;
    } else {
      bodyHtml = '<div class="sub">Loading...</div>';
    }

    this._renderedMode = modeKey;
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
          gap: 6px;
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
        .graph-wrap {
          flex: 1 1 0;
          min-width: 0;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .gauge-svg {
          width: 100%;
          height: 100%;
          display: block;
          overflow: visible;
        }
        .gauge-track {
          stroke: var(--tw-gauge-track, rgba(148, 163, 184, 0.25));
        }
        .gauge-fill {
          transition: stroke-dashoffset 0.35s ease, stroke 0.25s ease, stroke-opacity 0.2s ease;
        }
        .gauge-value {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          transition: fill 0.25s ease;
        }
        .val-unit {
          font-weight: 600;
          opacity: 0.9;
        }
        .sub {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          font-size: 0.78rem;
          color: var(--tw-text-muted);
        }
        .err {
          flex: 1;
          display: flex;
          align-items: center;
          font-size: 0.8rem;
          color: var(--tw-state-critical);
        }
      </style>
      <div class="wrap">
        <div class="title">${this._escapeHtml(title)}</div>
        ${bodyHtml}
      </div>
    `;
  }
}

if (!customElements.get('tw-addon-ha-graph')) {
  customElements.define('tw-addon-ha-graph', TwAddonHaGraph);
}
