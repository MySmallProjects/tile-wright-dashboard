import {
  DEFAULT_CONFIG,
  MAX_IDLE_SECONDS,
  MAX_INTERVAL_SECONDS,
  MIN_IDLE_SECONDS,
  MIN_INTERVAL_SECONDS,
  formatDurationCompact,
  loadCyclerConfig,
  saveCyclerConfig
} from './cycler-config.js';

const PRESETS = [
  { label: '15s', seconds: 15 },
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '2m', seconds: 120 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 }
];

function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class TwAddonDashboardCyclerSettings extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._context = null;
    this._draft = { ...DEFAULT_CONFIG };
    this._useCustomSubset = false;
    this._status = '';
  }

  set context(val) {
    this._context = val || null;
    if (this._context) {
      this._loadDraft();
    }
    if (this.isConnected) {
      this._render();
    }
  }

  connectedCallback() {
    if (this._context) {
      this._loadDraft();
    }
    this._render();
  }

  _getUserId() {
    return this._context?.user?.id ?? 'default';
  }

  _getDashboards() {
    return Array.isArray(this._context?.dashboards) ? this._context.dashboards : [];
  }

  _loadDraft() {
    const cfg = loadCyclerConfig(this._getUserId());
    this._draft = { ...cfg };
    this._useCustomSubset = Array.isArray(cfg.includedDashboardIds);
    this._status = '';
  }

  _handleSave(e) {
    e.preventDefault();
    const dashboards = this._getDashboards();
    let includedDashboardIds = null;
    if (this._useCustomSubset) {
      const selected = Array.isArray(this._draft.includedDashboardIds)
        ? this._draft.includedDashboardIds
        : dashboards.map((d) => d.id);
      includedDashboardIds = selected;
    }

    const saved = saveCyclerConfig(this._getUserId(), {
      ...this._draft,
      includedDashboardIds
    });
    this._draft = { ...saved };
    this._useCustomSubset = Array.isArray(saved.includedDashboardIds);
    this._status = saved.enabled
      ? `Saved. Cycling every ${formatDurationCompact(saved.intervalSeconds)} on this device.`
      : 'Saved. Auto-cycling is disabled on this device.';
    this._context?.notify?.(this._status);
    this._render();
  }

  _toggleDashboardId(id, checked) {
    const dashboards = this._getDashboards();
    const current = new Set(
      Array.isArray(this._draft.includedDashboardIds)
        ? this._draft.includedDashboardIds
        : dashboards.map((d) => d.id)
    );
    if (checked) {
      current.add(id);
    } else {
      current.delete(id);
    }
    this._draft = { ...this._draft, includedDashboardIds: Array.from(current) };
    this._status = '';
    this._render();
  }

  _render() {
    const dashboards = this._getDashboards();
    const selectedIds = new Set(
      Array.isArray(this._draft.includedDashboardIds)
        ? this._draft.includedDashboardIds
        : dashboards.map((d) => d.id)
    );
    const activeCount = this._useCustomSubset
      ? dashboards.filter((d) => selectedIds.has(d.id)).length
      : dashboards.length;

    const presetsHtml = PRESETS.map(
      (p) => `
        <button
          type="button"
          class="chip ${this._draft.intervalSeconds === p.seconds ? 'active' : ''}"
          data-preset="${p.seconds}"
        >${p.label}</button>
      `
    ).join('');

    const dashboardsHtml = dashboards
      .map(
        (d) => `
        <label class="dash-check">
          <input type="checkbox" data-dash-id="${escapeHtml(d.id)}" ${selectedIds.has(d.id) ? 'checked' : ''} />
          <span>${escapeHtml(d.name)}</span>
        </label>
      `
      )
      .join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--tw-text);
          font-family: var(--tw-font-family);
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .intro {
          margin: 0;
          color: var(--tw-text-muted);
          font-size: 0.9rem;
          line-height: 1.45;
        }
        .section {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--tw-border);
          background: var(--tw-surface);
        }
        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
        }
        .toggle-row strong {
          display: block;
          font-size: 0.95rem;
        }
        .help {
          font-size: 0.82rem;
          color: var(--tw-text-muted);
          margin-top: 2px;
        }
        .field-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-label {
          font-size: 0.88rem;
          font-weight: 600;
        }
        .inline-input {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        input[type="number"] {
          width: 110px;
          padding: 7px 10px;
          border-radius: 8px;
          border: 1px solid var(--tw-border);
          background: var(--tw-bg);
          color: var(--tw-text);
          font: inherit;
        }
        input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: var(--tw-accent);
          cursor: pointer;
          flex-shrink: 0;
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .chip {
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid var(--tw-border);
          background: transparent;
          color: var(--tw-text);
          font: inherit;
          font-size: 0.82rem;
          cursor: pointer;
        }
        .chip:hover {
          border-color: var(--tw-accent);
        }
        .chip.active {
          background: var(--tw-accent);
          border-color: var(--tw-accent);
          color: #fff;
        }
        .dash-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 4px;
          padding-left: 4px;
        }
        .dash-check {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          cursor: pointer;
        }
        .warn {
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--tw-state-warning, #f59e0b);
          color: var(--tw-state-warning, #f59e0b);
          font-size: 0.85rem;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .btn-primary {
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid var(--tw-accent);
          background: var(--tw-accent);
          color: #fff;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .status {
          font-size: 0.86rem;
          color: var(--tw-state-normal, #22c55e);
        }
      </style>

      <form class="form" id="cycler-form">
        <p class="intro">
          Automatically switches to the next dashboard on a timer. Settings are stored
          <strong>per device/browser</strong>, so you can enable cycling on a wall-mounted tablet without affecting your desktop.
        </p>

        <div class="section">
          <label class="toggle-row">
            <div>
              <strong>Enable auto-cycling on this device</strong>
              <div class="help">Automatically pauses in Edit Mode, while modals are open, or when this browser tab is hidden.</div>
            </div>
            <input type="checkbox" id="opt-enabled" ${this._draft.enabled ? 'checked' : ''} />
          </label>
        </div>

        <div class="section">
          <div class="field-row">
            <label class="field-label" for="opt-interval">Switch interval (seconds)</label>
            <div class="inline-input">
              <input
                type="number"
                id="opt-interval"
                min="${MIN_INTERVAL_SECONDS}"
                max="${MAX_INTERVAL_SECONDS}"
                step="1"
                value="${this._draft.intervalSeconds}"
              />
              <span class="help">(${formatDurationCompact(this._draft.intervalSeconds)})</span>
            </div>
            <div class="chips">${presetsHtml}</div>
          </div>
        </div>

        <div class="section">
          <label class="toggle-row">
            <div>
              <strong>Pause on user interaction</strong>
              <div class="help">When you tap, swipe, or type, hold on the current dashboard before resuming.</div>
            </div>
            <input type="checkbox" id="opt-pause-interaction" ${this._draft.pauseOnInteraction ? 'checked' : ''} />
          </label>

          ${
            this._draft.pauseOnInteraction
              ? `
            <div class="field-row">
              <label class="field-label" for="opt-idle">Resume after idle (seconds)</label>
              <div class="inline-input">
                <input
                  type="number"
                  id="opt-idle"
                  min="${MIN_IDLE_SECONDS}"
                  max="${MAX_IDLE_SECONDS}"
                  step="5"
                  value="${this._draft.idleResumeSeconds}"
                />
                <span class="help">0 = just reset the cycle timer on interaction</span>
              </div>
            </div>
          `
              : ''
          }

          <label class="toggle-row">
            <div>
              <strong>Show play / pause control on pager</strong>
              <div class="help">Adds a compact pause/resume button with countdown ring to the bottom dashboard pager.</div>
            </div>
            <input type="checkbox" id="opt-show-btn" ${this._draft.showPagerButton ? 'checked' : ''} />
          </label>
        </div>

        ${
          dashboards.length > 0
            ? `
          <div class="section">
            <label class="toggle-row">
              <div>
                <strong>Only cycle specific dashboards</strong>
                <div class="help">Leave unchecked to cycle through all enabled dashboards (${dashboards.length}).</div>
              </div>
              <input type="checkbox" id="opt-custom-subset" ${this._useCustomSubset ? 'checked' : ''} />
            </label>

            ${this._useCustomSubset ? `<div class="dash-list">${dashboardsHtml}</div>` : ''}
          </div>
        `
            : ''
        }

        ${
          this._draft.enabled && activeCount < 2
            ? `<div class="warn">At least 2 enabled dashboards must be included for auto-cycling to run.</div>`
            : ''
        }

        <div class="actions">
          <button type="submit" class="btn-primary">Save Auto-Cycle Settings</button>
          ${this._status ? `<span class="status">${escapeHtml(this._status)}</span>` : ''}
        </div>
      </form>
    `;

    const root = this.shadowRoot;
    root.getElementById('cycler-form')?.addEventListener('submit', (e) => this._handleSave(e));

    root.getElementById('opt-enabled')?.addEventListener('change', (e) => {
      this._draft = { ...this._draft, enabled: e.target.checked };
      this._status = '';
      this._render();
    });

    root.getElementById('opt-interval')?.addEventListener('change', (e) => {
      const val = Number(e.target.value);
      if (Number.isFinite(val)) {
        this._draft = {
          ...this._draft,
          intervalSeconds: Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.round(val)))
        };
        this._status = '';
        this._render();
      }
    });

    root.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const secs = Number(btn.getAttribute('data-preset'));
        if (Number.isFinite(secs)) {
          this._draft = { ...this._draft, intervalSeconds: secs };
          this._status = '';
          this._render();
        }
      });
    });

    root.getElementById('opt-pause-interaction')?.addEventListener('change', (e) => {
      this._draft = { ...this._draft, pauseOnInteraction: e.target.checked };
      this._status = '';
      this._render();
    });

    root.getElementById('opt-idle')?.addEventListener('change', (e) => {
      const val = Number(e.target.value);
      if (Number.isFinite(val)) {
        this._draft = {
          ...this._draft,
          idleResumeSeconds: Math.min(MAX_IDLE_SECONDS, Math.max(MIN_IDLE_SECONDS, Math.round(val)))
        };
        this._status = '';
      }
    });

    root.getElementById('opt-show-btn')?.addEventListener('change', (e) => {
      this._draft = { ...this._draft, showPagerButton: e.target.checked };
      this._status = '';
    });

    root.getElementById('opt-custom-subset')?.addEventListener('change', (e) => {
      this._useCustomSubset = e.target.checked;
      if (this._useCustomSubset && !Array.isArray(this._draft.includedDashboardIds)) {
        this._draft = { ...this._draft, includedDashboardIds: dashboards.map((d) => d.id) };
      } else if (!this._useCustomSubset) {
        this._draft = { ...this._draft, includedDashboardIds: null };
      }
      this._status = '';
      this._render();
    });

    root.querySelectorAll('[data-dash-id]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const id = input.getAttribute('data-dash-id');
        if (id) this._toggleDashboardId(id, e.target.checked);
      });
    });
  }
}

if (!customElements.get('tw-addon-dashboard-cycler-settings')) {
  customElements.define('tw-addon-dashboard-cycler-settings', TwAddonDashboardCyclerSettings);
}
