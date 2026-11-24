import {
  CONFIG_CHANGED_EVENT,
  DEFAULT_CONFIG,
  formatDurationCompact,
  getNextDashboardId,
  getRotationDashboards,
  loadCyclerConfig
} from './cycler-config.js';

const RING_RADIUS = 13;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

class TwAddonDashboardCycler extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._host = null;
    this._unsubscribe = null;
    this._state = null;
    this._config = { ...DEFAULT_CONFIG };
    this._manualPaused = false;
    this._remainingSeconds = DEFAULT_CONFIG.intervalSeconds;
    this._idleUntil = 0;
    this._timerId = null;
    this._switching = false;

    this._onConfigChanged = this._handleConfigChanged.bind(this);
    this._onStorage = this._handleStorage.bind(this);
    this._onVisibilityChange = this._handleVisibilityChange.bind(this);
    this._onUserInteraction = this._handleUserInteraction.bind(this);
  }

  set host(val) {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._host = val || null;
    if (this.isConnected && this._host) {
      this._attachHost();
    }
  }

  connectedCallback() {
    window.addEventListener(CONFIG_CHANGED_EVENT, this._onConfigChanged);
    window.addEventListener('storage', this._onStorage);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('pointerdown', this._onUserInteraction, { passive: true, capture: true });
    window.addEventListener('keydown', this._onUserInteraction, { passive: true, capture: true });

    if (this._host) {
      this._attachHost();
    } else {
      this._render();
    }
  }

  disconnectedCallback() {
    window.removeEventListener(CONFIG_CHANGED_EVENT, this._onConfigChanged);
    window.removeEventListener('storage', this._onStorage);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('pointerdown', this._onUserInteraction, { capture: true });
    window.removeEventListener('keydown', this._onUserInteraction, { capture: true });

    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._stopTimer();
  }

  _attachHost() {
    if (!this._host) return;
    const initial = this._host.getState();
    this._state = initial;
    this._config = loadCyclerConfig(initial.userId);
    this._remainingSeconds = this._config.intervalSeconds;
    this._idleUntil = 0;

    this._unsubscribe = this._host.subscribe((nextState) => {
      const prevUserId = this._state?.userId;
      const prevDashId = this._state?.activeDashboardId;
      this._state = nextState;

      if (nextState.userId !== prevUserId) {
        this._config = loadCyclerConfig(nextState.userId);
        this._manualPaused = false;
        this._remainingSeconds = this._config.intervalSeconds;
        this._idleUntil = 0;
      } else if (nextState.activeDashboardId !== prevDashId) {
        this._remainingSeconds = this._config.intervalSeconds;
      }

      this._syncTimer();
      this._render();
    });

    this._syncTimer();
    this._render();
  }

  _handleConfigChanged(e) {
    const userId = this._state?.userId;
    if (e.detail?.userId && userId && e.detail.userId !== userId) return;
    this._config = loadCyclerConfig(userId);
    this._remainingSeconds = this._config.intervalSeconds;
    this._idleUntil = 0;
    if (!this._config.enabled) {
      this._manualPaused = false;
    }
    this._syncTimer();
    this._render();
  }

  _handleStorage() {
    if (!this._state) return;
    this._config = loadCyclerConfig(this._state.userId);
    this._remainingSeconds = Math.min(this._remainingSeconds, this._config.intervalSeconds);
    this._syncTimer();
    this._render();
  }

  _handleVisibilityChange() {
    this._syncTimer();
    this._render();
  }

  _handleUserInteraction(e) {
    if (!this._config.enabled || !this._config.pauseOnInteraction || this._manualPaused) return;
    // Ignore clicks on our own play/pause button so toggling pause works cleanly
    if (typeof e.composedPath === 'function' && e.composedPath().includes(this)) return;
    if (this._state?.editMode || this._state?.modalOpen) return;

    if (this._config.idleResumeSeconds > 0) {
      this._idleUntil = Date.now() + this._config.idleResumeSeconds * 1000;
    }
    this._remainingSeconds = this._config.intervalSeconds;
    this._render();
  }

  _getRotation() {
    return getRotationDashboards(this._state?.dashboards ?? [], this._config.includedDashboardIds);
  }

  _canCycle() {
    if (!this._config.enabled) return false;
    if (!this._state || this._state.editMode || this._state.modalOpen) return false;
    if (document.hidden) return false;
    return this._getRotation().length >= 2;
  }

  _isIdlePaused() {
    return this._config.pauseOnInteraction && this._idleUntil > Date.now();
  }

  _syncTimer() {
    if (this._canCycle() && !this._manualPaused) {
      if (this._timerId === null) {
        this._timerId = window.setInterval(() => this._tick(), 1000);
      }
    } else {
      this._stopTimer();
    }
  }

  _stopTimer() {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  async _tick() {
    if (!this._canCycle() || this._manualPaused || this._switching) {
      this._render();
      return;
    }

    if (this._isIdlePaused()) {
      this._render();
      return;
    }

    this._remainingSeconds -= 1;
    if (this._remainingSeconds <= 0) {
      const rotation = this._getRotation();
      const nextId = getNextDashboardId(rotation, this._state?.activeDashboardId);
      this._remainingSeconds = this._config.intervalSeconds;
      if (nextId && this._host) {
        this._switching = true;
        try {
          await this._host.selectDashboard(nextId);
        } finally {
          this._switching = false;
        }
      }
    }

    this._render();
  }

  _toggleManualPause() {
    this._manualPaused = !this._manualPaused;
    this._idleUntil = 0;
    if (!this._manualPaused) {
      this._remainingSeconds = this._config.intervalSeconds;
    }
    this._syncTimer();
    this._render();
  }

  _render() {
    const rotation = this._getRotation();
    const visible = this._config.enabled && this._config.showPagerButton && rotation.length >= 2;

    if (!visible) {
      this.shadowRoot.innerHTML = `<style>:host { display: none; }</style>`;
      return;
    }

    const idlePaused = !this._manualPaused && this._isIdlePaused();
    const idleRemaining = idlePaused ? Math.ceil((this._idleUntil - Date.now()) / 1000) : 0;
    const progress = this._manualPaused
      ? 0
      : idlePaused
        ? 0
        : Math.max(0, Math.min(1, 1 - this._remainingSeconds / Math.max(1, this._config.intervalSeconds)));
    const dashOffset = (RING_CIRCUMFERENCE * (1 - progress)).toFixed(2);

    const title = this._manualPaused
      ? 'Auto-cycle paused — click to resume'
      : idlePaused
        ? `Auto-cycle waiting after interaction (${formatDurationCompact(idleRemaining)}) — click to pause`
        : `Auto-cycling every ${formatDurationCompact(this._config.intervalSeconds)} (next in ${formatDurationCompact(this._remainingSeconds)}) — click to pause`;

    const iconPath = this._manualPaused
      ? 'M8,5.14V19.14L19,12.14L8,5.14Z' // play
      : 'M14,19H18V5H14M6,19H10V5H6V19Z'; // pause

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .divider {
          width: 1px;
          height: 18px;
          background: var(--tw-border);
          opacity: 0.85;
        }
        .cycle-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          padding: 0;
          border: none;
          border-radius: 999px;
          background: transparent;
          color: var(--tw-text);
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
        }
        .cycle-btn:hover {
          background: var(--tw-surface);
        }
        .cycle-btn.paused {
          color: var(--tw-text-muted);
        }
        .ring {
          position: absolute;
          inset: 0;
          width: 34px;
          height: 34px;
          transform: rotate(-90deg);
          pointer-events: none;
        }
        .ring-track {
          fill: none;
          stroke: var(--tw-border);
          stroke-width: 2;
          opacity: 0.45;
        }
        .ring-progress {
          fill: none;
          stroke: var(--tw-accent);
          stroke-width: 2;
          stroke-linecap: round;
          transition: stroke-dashoffset 0.35s linear;
        }
        .icon {
          width: 16px;
          height: 16px;
          fill: currentColor;
          position: relative;
          z-index: 1;
        }
      </style>
      <span class="divider" aria-hidden="true"></span>
      <button
        type="button"
        class="cycle-btn ${this._manualPaused || idlePaused ? 'paused' : ''}"
        part="button"
        title="${title}"
        aria-label="${title}"
        aria-pressed="${this._manualPaused ? 'true' : 'false'}"
      >
        <svg class="ring" viewBox="0 0 34 34" aria-hidden="true">
          <circle class="ring-track" cx="17" cy="17" r="${RING_RADIUS}" />
          <circle
            class="ring-progress"
            cx="17"
            cy="17"
            r="${RING_RADIUS}"
            stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}"
            stroke-dashoffset="${dashOffset}"
          />
        </svg>
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="${iconPath}" />
        </svg>
      </button>
    `;

    this.shadowRoot.querySelector('.cycle-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._toggleManualPause();
    });
  }
}

if (!customElements.get('tw-addon-dashboard-cycler')) {
  customElements.define('tw-addon-dashboard-cycler', TwAddonDashboardCycler);
}
