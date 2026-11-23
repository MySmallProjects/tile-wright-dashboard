function parseDurationMs(raw, fallbackMs) {
  const m = String(raw || '').trim().match(/^(\d+)\s*([smhd]?)$/i);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  if (!n || n <= 0) return fallbackMs;
  switch (m[2].toLowerCase()) {
    case 's': return Math.max(3000, n * 1000);
    case 'm': return n * 60000;
    case 'h': return n * 3600000;
    case 'd': return n * 86400000;
    default:  return Math.max(3000, n * 1000);
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso, includeTime) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    if (includeTime) {
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return d.toISOString().slice(0, includeTime ? 16 : 10).replace('T', ' ');
  }
}

function formatLocation(meta, includeState = false) {
  if (!meta) return '';
  const parts = [];
  if (meta.city) parts.push(meta.city);
  if (includeState && meta.state && meta.state !== meta.city) parts.push(meta.state);
  if (meta.country) parts.push(meta.country);
  return parts.join(', ');
}

class TwAddonImmich extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._context = {};
    this._timer = null;
    this._inFlight = false;
    this._activeSlot = 0;
    this._lastFetchKey = null;
    this._current = null;
    this._detailedInfo = null;
    this._loadingDetails = false;
    this._status = { loading: false, error: null, needsSetup: false, setupMsg: '' };
    this._domBuilt = false;
  }

  set settings(val) {
    const next = val || {};
    const prevKey = this._computeFetchKey(this._settings);
    const nextKey = this._computeFetchKey(next);
    this._settings = next;

    if (!this.isConnected) return;

    this._applyDisplaySettings();
    if (prevKey !== nextKey || !this._current) {
      this._scheduleFetch();
    }
  }

  set context(val) {
    this._context = val || {};
    if (this._domBuilt) {
      this._applyDisplaySettings();
    }
  }

  connectedCallback() {
    this._buildDom();
    this._applyDisplaySettings();
    this._scheduleFetch();
  }

  disconnectedCallback() {
    this._clearTimer();
  }

  _clearTimer() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _computeFetchKey(s) {
    return JSON.stringify({
      refreshInterval: s.refreshInterval || '5m',
      imageSize: s.imageSize || 'thumbnail',
      matchOrientation: Boolean(s.matchOrientation),
      albumId: s.albumId || '',
      personId: s.personId || '',
      tagId: s.tagId || '',
      favoritesOnly: Boolean(s.favoritesOnly),
      takenAfter: s.takenAfter || '',
      takenBefore: s.takenBefore || '',
      city: s.city || '',
      state: s.state || '',
      country: s.country || '',
      rating: s.rating || '',
      extraFiltersJson: s.extraFiltersJson || ''
    });
  }

  _detectOrientation() {
    const rect = this.getBoundingClientRect();
    let w = rect.width;
    let h = rect.height;
    if (!w || !h) {
      w = Number(this._context?.width) || 0;
      h = Number(this._context?.height) || 0;
    }
    if (!w || !h) return 'any';
    const ratio = w / h;
    if (ratio >= 1.1) return 'landscape';
    if (ratio <= 1 / 1.1) return 'portrait';
    return 'any';
  }

  _scheduleFetch() {
    this._clearTimer();
    if (!this.isConnected) return;

    this._fetchNext();
    const interval = parseDurationMs(this._settings.refreshInterval, 5 * 60000);
    this._timer = window.setInterval(() => this._fetchNext(), interval);
  }

  _advanceNow() {
    if (this._inFlight) return;
    this._scheduleFetch();
  }

  _fetchNext() {
    if (this._inFlight) return;
    this._inFlight = true;

    if (!this._current) {
      this._status = { loading: true, error: null, needsSetup: false, setupMsg: '' };
      this._renderStatus();
    }

    const s = this._settings;
    const payload = {
      imageSize: s.imageSize || 'thumbnail',
      matchOrientation: Boolean(s.matchOrientation),
      orientation: s.matchOrientation ? this._detectOrientation() : 'any',
      albumId: s.albumId || '',
      personId: s.personId || '',
      tagId: s.tagId || '',
      favoritesOnly: Boolean(s.favoritesOnly),
      takenAfter: s.takenAfter || '',
      takenBefore: s.takenBefore || '',
      city: s.city || '',
      state: s.state || '',
      country: s.country || '',
      rating: s.rating || '',
      extraFiltersJson: s.extraFiltersJson || ''
    };

    this.dispatchEvent(new CustomEvent('request-action', {
      detail: {
        action: 'fetch-random',
        payload,
        onResult: (res) => {
          this._inFlight = false;
          if (!res) {
            this._status = { loading: false, error: 'No response from server.', needsSetup: false, setupMsg: '' };
            this._renderStatus();
            return;
          }
          if (res.needsSetup) {
            this._current = null;
            this._status = { loading: false, error: null, needsSetup: true, setupMsg: res.error || '' };
            this._renderStatus();
            return;
          }
          if (res.error) {
            this._status = { loading: false, error: res.error, needsSetup: false, setupMsg: '' };
            this._renderStatus();
            return;
          }

          this._status = { loading: false, error: null, needsSetup: false, setupMsg: '' };
          this._showImage(res);
        }
      },
      bubbles: true,
      composed: true
    }));
  }

  _showImage(res) {
    this._current = res;
    this._detailedInfo = null;
    this._loadingDetails = false;

    const nextSlotIdx = this._current && this._slotHasImage(this._activeSlot)
      ? (this._activeSlot === 0 ? 1 : 0)
      : this._activeSlot;

    const nextSlot = this.shadowRoot.querySelector(`.slot[data-slot="${nextSlotIdx}"]`);
    const prevSlot = this.shadowRoot.querySelector(`.slot[data-slot="${1 - nextSlotIdx}"]`);
    if (!nextSlot || !prevSlot) return;

    const fg = nextSlot.querySelector('.photo');
    const bg = nextSlot.querySelector('.bg-blur');
    const altText = res.fileName || 'Immich photo';

    fg.src = res.dataUrl;
    fg.alt = altText;
    bg.src = res.dataUrl;

    // Force a reflow before toggling active class so CSS transition always fires
    void nextSlot.offsetWidth;
    nextSlot.classList.add('active');
    prevSlot.classList.remove('active');
    this._activeSlot = nextSlotIdx;

    this._renderStatus();
    this._renderOverlay();
    this._applyDisplaySettings();
  }

  _slotHasImage(idx) {
    const slot = this.shadowRoot?.querySelector(`.slot[data-slot="${idx}"] .photo`);
    return Boolean(slot && slot.getAttribute('src'));
  }

  _openInfoDialog() {
    if (!this._current) return;
    const dialog = this.shadowRoot.querySelector('dialog.info-dialog');
    if (!dialog) return;

    this._renderDialogBody();
    if (!dialog.open) {
      dialog.showModal();
    }

    // Fetch enriched details (albums, tags, full EXIF) once per displayed photo
    if (!this._detailedInfo && !this._loadingDetails && this._current.assetId) {
      const requestedId = this._current.assetId;
      this._loadingDetails = true;
      this._renderDialogBody();

      this.dispatchEvent(new CustomEvent('request-action', {
        detail: {
          action: 'asset-info',
          payload: { assetId: requestedId },
          onResult: (res) => {
            this._loadingDetails = false;
            if (res && !res.error && this._current?.assetId === requestedId) {
              this._detailedInfo = res;
            }
            this._renderDialogBody();
          }
        },
        bubbles: true,
        composed: true
      }));
    }
  }

  _buildOverlayText() {
    const mode = this._settings.overlayInfo || 'none';
    const meta = this._current;
    if (!meta || mode === 'none') return '';

    switch (mode) {
      case 'date':
        return formatDate(meta.takenAt, false);
      case 'date-time':
        return formatDate(meta.takenAt, true);
      case 'location':
        return formatLocation(meta, false);
      case 'date-location': {
        const d = formatDate(meta.takenAt, false);
        const loc = formatLocation(meta, false);
        return [d, loc].filter(Boolean).join(' · ');
      }
      case 'filename':
        return meta.fileName || '';
      case 'people':
        return Array.isArray(meta.people) && meta.people.length > 0 ? meta.people.join(', ') : '';
      default:
        return '';
    }
  }

  _renderOverlay() {
    const el = this.shadowRoot?.querySelector('.overlay');
    if (!el) return;
    const text = this._buildOverlayText();
    if (text && this._current) {
      el.textContent = text;
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }
  }

  _renderStatus() {
    const msgEl = this.shadowRoot?.querySelector('.status-msg');
    if (!msgEl) return;
    const st = this._status;

    if (st.needsSetup) {
      msgEl.hidden = false;
      msgEl.className = 'status-msg';
      msgEl.innerHTML = `<strong>Needs setup</strong><br>${escapeHtml(st.setupMsg || 'Configure Immich URL and API Key in Settings → Addons.')}`;
    } else if (!this._current && st.error) {
      msgEl.hidden = false;
      msgEl.className = 'status-msg err';
      msgEl.textContent = st.error;
    } else if (!this._current && st.loading) {
      msgEl.hidden = false;
      msgEl.className = 'status-msg';
      msgEl.textContent = 'Loading photo...';
    } else {
      msgEl.hidden = true;
    }
  }

  _applyDisplaySettings() {
    if (!this._domBuilt) return;
    const stage = this.shadowRoot.querySelector('.stage');
    const infoBtn = this.shadowRoot.querySelector('.info-btn');
    const fit = this._settings.fit || 'cover';
    const crossfade = this._settings.crossfade !== false;
    const tapToAdvance = this._settings.tapToAdvance !== false;
    const showInfoButton = this._settings.showInfoButton !== false;
    const isEdit = this._context?.mode === 'edit';

    stage.dataset.fit = fit;
    stage.classList.toggle('no-fade', !crossfade);
    stage.classList.toggle('tappable', tapToAdvance && !isEdit);

    if (infoBtn) {
      infoBtn.hidden = !showInfoButton || !this._current;
    }

    this._renderOverlay();
  }

  _renderDialogBody() {
    const body = this.shadowRoot?.querySelector('.dialog-body');
    const footerLink = this.shadowRoot?.querySelector('.immich-link');
    if (!body) return;

    const info = this._detailedInfo || this._current;
    if (!info) return;

    const rows = [];
    const taken = formatDate(info.takenAt, true);
    if (taken) rows.push(['Taken', taken]);

    const loc = formatLocation(info, true);
    if (loc) rows.push(['Location', loc]);

    if (info.folder) rows.push(['Folder', info.folder]);
    if (info.fileName) rows.push(['File', info.fileName]);

    if (Array.isArray(info.albums) && info.albums.length > 0) {
      rows.push(['Albums', info.albums.join(', ')]);
    } else if (this._loadingDetails) {
      rows.push(['Albums', 'Loading…']);
    }

    if (Array.isArray(info.people) && info.people.length > 0) {
      rows.push(['People', info.people.join(', ')]);
    }

    if (Array.isArray(info.tags) && info.tags.length > 0) {
      rows.push(['Tags', info.tags.join(', ')]);
    }

    const camera = [info.make, info.model].filter(Boolean).join(' ');
    if (camera) rows.push(['Camera', camera]);
    if (info.lensModel) rows.push(['Lens', info.lensModel]);

    if (info.width && info.height) {
      rows.push(['Dimensions', `${info.width} × ${info.height}`]);
    }

    if (info.description) {
      rows.push(['Description', info.description]);
    }

    const previewHtml = this._current?.dataUrl
      ? `<div class="dialog-preview"><img src="${this._current.dataUrl}" alt="${escapeHtml(info.fileName || 'Photo')}" /></div>`
      : '';

    const rowsHtml = rows.length > 0
      ? `<dl class="meta-list">${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`
      : '<p class="empty-meta">No additional metadata available for this photo.</p>';

    body.innerHTML = `${previewHtml}${rowsHtml}`;

    if (footerLink) {
      if (info.immichUrl) {
        footerLink.href = info.immichUrl;
        footerLink.hidden = false;
      } else {
        footerLink.hidden = true;
      }
    }
  }

  _buildDom() {
    if (this._domBuilt) return;
    this._domBuilt = true;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          width: 100%;
          height: 100%;
          color: var(--tw-text);
          font-family: var(--tw-font-family);
          user-select: none;
        }
        .stage {
          position: relative;
          flex: 1;
          width: 100%;
          height: 100%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .stage.tappable {
          cursor: pointer;
        }
        .slot {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.6s ease;
          pointer-events: none;
        }
        .stage.no-fade .slot {
          transition: none;
        }
        .slot.active {
          opacity: 1;
        }
        .bg-blur {
          position: absolute;
          inset: -12px;
          width: calc(100% + 24px);
          height: calc(100% + 24px);
          object-fit: cover;
          filter: blur(18px) brightness(0.65);
          transform: scale(1.05);
          display: none;
        }
        .photo {
          position: relative;
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }
        .stage[data-fit="contain"] .photo {
          object-fit: contain;
        }
        .stage[data-fit="contain-blur"] .bg-blur {
          display: block;
        }
        .stage[data-fit="contain-blur"] .photo {
          object-fit: contain;
        }
        .overlay {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 16px 10px 6px 10px;
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.72));
          color: #ffffff;
          font-size: 0.78rem;
          font-weight: 500;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
        }
        .info-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(0, 0, 0, 0.45);
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          backdrop-filter: blur(4px);
          transition: background 0.15s ease, transform 0.15s ease;
          z-index: 2;
        }
        .info-btn[hidden] {
          display: none;
        }
        .info-btn:hover {
          background: rgba(0, 0, 0, 0.78);
          transform: scale(1.06);
        }
        .info-btn svg {
          width: 15px;
          height: 15px;
          fill: currentColor;
        }
        .status-msg {
          position: relative;
          z-index: 1;
          padding: 14px;
          text-align: center;
          font-size: 0.85rem;
          color: var(--tw-text-muted);
          line-height: 1.4;
        }
        .status-msg.err {
          color: var(--tw-state-critical);
        }
        dialog.info-dialog {
          padding: 0;
          border: 1px solid var(--tw-border, rgba(255, 255, 255, 0.16));
          border-radius: 12px;
          background: var(--tw-surface, #1e1e24);
          color: var(--tw-text, #f5f5f5);
          font-family: var(--tw-font-family, system-ui, sans-serif);
          width: min(440px, 92vw);
          max-height: 85vh;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
          overflow: hidden;
        }
        dialog.info-dialog::backdrop {
          background: rgba(0, 0, 0, 0.62);
          backdrop-filter: blur(3px);
        }
        .dialog-inner {
          display: flex;
          flex-direction: column;
          max-height: 85vh;
        }
        .dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--tw-border, rgba(255, 255, 255, 0.12));
        }
        .dialog-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }
        .dialog-close {
          background: transparent;
          border: none;
          color: var(--tw-text-muted, #aaa);
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 6px;
        }
        .dialog-close:hover {
          color: var(--tw-text, #fff);
          background: rgba(255, 255, 255, 0.08);
        }
        .dialog-body {
          padding: 14px 16px;
          overflow-y: auto;
          user-select: text;
        }
        .dialog-preview {
          margin-bottom: 12px;
          border-radius: 8px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.25);
          display: flex;
          justify-content: center;
          max-height: 220px;
        }
        .dialog-preview img {
          max-width: 100%;
          max-height: 220px;
          object-fit: contain;
          display: block;
        }
        .meta-list {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 6px 14px;
          margin: 0;
          font-size: 0.85rem;
        }
        .meta-list dt {
          color: var(--tw-text-muted, #9aa0a6);
          font-weight: 500;
          white-space: nowrap;
        }
        .meta-list dd {
          margin: 0;
          word-break: break-word;
        }
        .empty-meta {
          margin: 0;
          font-size: 0.85rem;
          color: var(--tw-text-muted, #9aa0a6);
        }
        .dialog-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-top: 1px solid var(--tw-border, rgba(255, 255, 255, 0.12));
        }
        .immich-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 6px;
          background: var(--tw-accent, #4f8cff);
          color: #ffffff;
          text-decoration: none;
          font-size: 0.85rem;
          font-weight: 500;
        }
        .immich-link:hover {
          filter: brightness(1.1);
        }
        .immich-link[hidden] {
          display: none;
        }
        .close-btn-secondary {
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid var(--tw-border, rgba(255, 255, 255, 0.2));
          background: transparent;
          color: var(--tw-text, #f5f5f5);
          font-size: 0.85rem;
          cursor: pointer;
        }
        .close-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
        }
      </style>

      <div class="stage" part="stage" data-fit="cover">
        <div class="slot" data-slot="0">
          <img class="bg-blur" alt="" aria-hidden="true" />
          <img class="photo" part="image" alt="" />
        </div>
        <div class="slot" data-slot="1">
          <img class="bg-blur" alt="" aria-hidden="true" />
          <img class="photo" part="image" alt="" />
        </div>
        <div class="status-msg" part="status" hidden></div>
        <div class="overlay" part="overlay" hidden></div>
        <button class="info-btn" part="info-button" type="button" title="Photo details" aria-label="Photo details" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 9h2V7h-2m1 13c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m0-18A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2m-1 15h2v-6h-2v6Z"/>
          </svg>
        </button>
      </div>

      <dialog class="info-dialog" part="info-dialog">
        <div class="dialog-inner">
          <div class="dialog-header">
            <h3 class="dialog-title">Photo Details</h3>
            <button class="dialog-close" type="button" aria-label="Close">&times;</button>
          </div>
          <div class="dialog-body"></div>
          <div class="dialog-footer">
            <a class="immich-link" target="_blank" rel="noopener noreferrer" hidden>Open in Immich &#8599;</a>
            <button class="close-btn-secondary" type="button">Close</button>
          </div>
        </div>
      </dialog>
    `;

    const stage = this.shadowRoot.querySelector('.stage');
    const infoBtn = this.shadowRoot.querySelector('.info-btn');
    const dialog = this.shadowRoot.querySelector('dialog.info-dialog');
    const closeTop = this.shadowRoot.querySelector('.dialog-close');
    const closeBottom = this.shadowRoot.querySelector('.close-btn-secondary');

    stage.addEventListener('click', () => {
      if (this._context?.mode === 'edit') return;
      if (this._settings.tapToAdvance === false) return;
      if (this._status.needsSetup) return;
      this._advanceNow();
    });

    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._context?.mode === 'edit') return;
      this._openInfoDialog();
    });

    const closeDialog = (e) => {
      if (e) e.stopPropagation();
      if (dialog.open) dialog.close();
    };

    closeTop.addEventListener('click', closeDialog);
    closeBottom.addEventListener('click', closeDialog);
    dialog.addEventListener('click', (e) => {
      e.stopPropagation();
      // Click on backdrop closes dialog
      if (e.target === dialog) {
        dialog.close();
      }
    });
  }
}

if (!customElements.get('tw-addon-immich')) {
  customElements.define('tw-addon-immich', TwAddonImmich);
}
