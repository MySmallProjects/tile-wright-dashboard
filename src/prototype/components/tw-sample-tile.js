/**
 * <tw-sample-tile> — Disposable mock tile for the Phase 1 Layout Lab.
 * Demonstrates Shadow DOM theming (--tw-*) and interactive controls in view mode
 * that become non-interactive in edit mode via host pointer-events: none.
 */

class TwSampleTile extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = { kind: 'default', title: 'Tile', subtitle: '', value: '', state: 'normal', on: false };
  }

  get settings() { return this._settings; }
  set settings(val) {
    this._settings = { ...this._settings, ...(val || {}) };
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    const s = this._settings;
    const stateColor =
      s.state === 'critical' ? 'var(--tw-state-critical)' :
      s.state === 'warning'  ? 'var(--tw-state-warning)' :
                               'var(--tw-state-normal)';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          width: 100%;
          height: 100%;
          color: var(--tw-text);
          font-family: var(--tw-font-family);
        }
        .card {
          flex: 1;
          padding: var(--tw-tile-padding, 14px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 6px;
          min-width: 0;
        }
        .label {
          font-size: 0.82rem;
          color: var(--tw-text-muted);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .value {
          font-size: 1.55rem;
          font-weight: 700;
          line-height: 1.1;
          color: ${s.kind === 'sensor' ? stateColor : 'var(--tw-text)'};
        }
        .sub {
          font-size: 0.78rem;
          color: var(--tw-text-muted);
        }
        .toggle-btn {
          align-self: flex-start;
          min-height: 36px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid var(--tw-border);
          background: ${s.on ? 'var(--tw-accent)' : 'transparent'};
          color: ${s.on ? 'var(--tw-accent-contrast)' : 'var(--tw-text)'};
          font-family: inherit;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
        }
        .links {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .link-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid var(--tw-border);
          color: var(--tw-text);
          text-decoration: none;
          font-size: 0.85rem;
        }
        .note-text {
          font-size: 0.9rem;
          line-height: 1.35;
          white-space: pre-wrap;
        }
      </style>
      <div class="card">
        <div class="label">${s.title || 'Tile'}</div>
        ${this._renderBody(s)}
      </div>
    `;

    const toggleBtn = this.shadowRoot.querySelector('.toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this._settings = { ...this._settings, on: !this._settings.on };
        this._render();
        this.dispatchEvent(new CustomEvent('request-action', {
          detail: { action: 'toggle', title: s.title, on: this._settings.on },
          bubbles: true,
          composed: true
        }));
      });
    }
  }

  _renderBody(s) {
    if (s.kind === 'toggle') {
      return `
        <button class="toggle-btn" type="button">${s.on ? 'ON' : 'OFF'}</button>
        <div class="sub">${s.subtitle || 'Tap in view mode'}</div>
      `;
    }
    if (s.kind === 'sensor') {
      return `
        <div class="value">${s.value || '--'}</div>
        <div class="sub">${s.subtitle || ''}</div>
      `;
    }
    if (s.kind === 'note') {
      return `
        <div class="note-text">${s.value || 'Quick note...'}</div>
        <div class="sub">${s.subtitle || 'Post-it tile'}</div>
      `;
    }
    if (s.kind === 'links') {
      const items = s.links || ['Home Assistant', 'Router', 'NAS'];
      return `
        <div class="links">
          ${items.map((name) => `<a class="link-row" href="#${encodeURIComponent(name)}" onclick="return false;"><span>${name}</span><span>↗</span></a>`).join('')}
        </div>
      `;
    }
    return `
      <div class="value">${s.value || 'Default'}</div>
      <div class="sub">${s.subtitle || 'Drag or resize in Edit mode'}</div>
    `;
  }
}

if (!customElements.get('tw-sample-tile')) {
  customElements.define('tw-sample-tile', TwSampleTile);
}
