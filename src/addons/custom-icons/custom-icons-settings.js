function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed reading ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const MAX_BATCH_RAW_BYTES = 512 * 1024; // ~685 KB base64 JSON per request (stays under proxy/server limits)
const MAX_BATCH_FILES = 10;

function chunkFilesForUpload(files) {
  const batches = [];
  let current = [];
  let currentBytes = 0;

  for (const f of files) {
    const size = typeof f.size === 'number' ? f.size : 0;
    if (
      current.length > 0 &&
      (current.length >= MAX_BATCH_FILES || currentBytes + size > MAX_BATCH_RAW_BYTES)
    ) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(f);
    currentBytes += size;
  }

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

class TwAddonCustomIconsSettings extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._context = null;
    this._state = {
      loading: true,
      uploadingScope: null,
      uploadProgress: null,
      deletingKey: null,
      deletingAllScope: null,
      conflictMode: 'rename',
      site: [],
      user: [],
      isAdmin: false,
      error: '',
      status: ''
    };
  }

  set context(val) {
    this._context = val || null;
    if (this.isConnected && this._context) {
      void this.loadIcons();
    }
  }

  connectedCallback() {
    this.render();
    if (this._context) {
      void this.loadIcons();
    }
  }

  async loadIcons() {
    if (!this._context?.invokeAction) return;
    this._state = { ...this._state, loading: true, error: '' };
    this.render();
    try {
      const res = await this._context.invokeAction('list', {});
      if (res?.error) {
        this._state = { ...this._state, loading: false, error: String(res.error) };
      } else {
        this._state = {
          ...this._state,
          loading: false,
          site: Array.isArray(res?.site) ? res.site : [],
          user: Array.isArray(res?.user) ? res.user : [],
          isAdmin: Boolean(res?.isAdmin ?? this._context.isAdmin),
          error: ''
        };
      }
    } catch (e) {
      this._state = { ...this._state, loading: false, error: e instanceof Error ? e.message : 'Failed to load custom icons.' };
    }
    this.render();
  }

  _formatNamePreview(names, max = 5) {
    if (!names || names.length === 0) return '';
    const shown = names.slice(0, max).join(', ');
    return names.length > max ? `${shown} (+${names.length - max} more)` : shown;
  }

  async handleUpload(scope, fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0 || !this._context?.invokeAction) return;

    const conflictMode = this._state.conflictMode || 'rename';
    const batches = chunkFilesForUpload(files);
    let processed = 0;
    let uploadedCount = 0;
    let addedCount = 0;
    const renamed = [];
    const overwritten = [];
    const skipped = [];
    const errors = [];

    this._state = {
      ...this._state,
      uploadingScope: scope,
      uploadProgress: { done: 0, total: files.length },
      error: '',
      status: ''
    };
    this.render();

    try {
      for (const batch of batches) {
        try {
          const encoded = await Promise.all(
            batch.map(async (f) => ({
              fileName: f.name,
              dataBase64: await readFileAsDataUrl(f)
            }))
          );

          const res = await this._context.invokeAction('upload', { scope, conflictMode, files: encoded });
          if (res?.error) {
            errors.push(String(res.error));
          } else {
            if (Array.isArray(res?.uploaded)) uploadedCount += res.uploaded.length;
            if (Array.isArray(res?.added)) addedCount += res.added.length;
            if (Array.isArray(res?.renamed)) renamed.push(...res.renamed.map(String));
            if (Array.isArray(res?.overwritten)) overwritten.push(...res.overwritten.map(String));
            if (Array.isArray(res?.skipped)) skipped.push(...res.skipped.map(String));
            if (Array.isArray(res?.errors)) errors.push(...res.errors.map(String));
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Upload batch failed.';
          errors.push(msg);
        }

        processed += batch.length;
        this._state = {
          ...this._state,
          uploadProgress: { done: processed, total: files.length }
        };
        this.render();
      }

      const details = [];
      if (addedCount > 0 && (renamed.length > 0 || overwritten.length > 0 || skipped.length > 0)) {
        details.push(`${addedCount} new`);
      }
      if (renamed.length > 0) details.push(`${renamed.length} renamed`);
      if (overwritten.length > 0) details.push(`${overwritten.length} overwritten`);
      if (skipped.length > 0) details.push(`${skipped.length} skipped`);

      let toastSummary = '';
      if (uploadedCount > 0) {
        toastSummary = `Uploaded ${uploadedCount} icon${uploadedCount === 1 ? '' : 's'}${details.length > 0 ? ` (${details.join(', ')})` : ''}.`;
      } else if (skipped.length > 0) {
        toastSummary = `No icons uploaded (${skipped.length} duplicate${skipped.length === 1 ? '' : 's'} skipped).`;
      }

      const detailLines = [];
      if (renamed.length > 0) detailLines.push(`Renamed: ${this._formatNamePreview(renamed)}`);
      if (overwritten.length > 0) detailLines.push(`Overwritten: ${this._formatNamePreview(overwritten)}`);
      if (skipped.length > 0) detailLines.push(`Skipped: ${this._formatNamePreview(skipped)}`);

      const status = detailLines.length > 0 ? `${toastSummary} ${detailLines.join(' · ')}` : toastSummary;
      const errMsg = errors.length > 0 ? errors.join(' ') : '';
      this._state = {
        ...this._state,
        uploadingScope: null,
        uploadProgress: null,
        status,
        error: errMsg
      };
      if (toastSummary) {
        const hasConflicts = renamed.length > 0 || overwritten.length > 0 || skipped.length > 0;
        this._context.notify?.(toastSummary, hasConflicts ? 7000 : 4500);
      }
      if (uploadedCount > 0) {
        await this._context.refreshAddons?.();
        await this.loadIcons();
        return;
      }
    } catch (e) {
      this._state = {
        ...this._state,
        uploadingScope: null,
        uploadProgress: null,
        error: e instanceof Error ? e.message : 'Upload failed.'
      };
    }
    this.render();
  }

  async handleDelete(scope, fileName) {
    if (!this._context?.invokeAction) return;
    this._state = { ...this._state, deletingKey: `${scope}:${fileName}`, error: '', status: '' };
    this.render();
    try {
      const res = await this._context.invokeAction('delete', { scope, fileName });
      if (res?.error) {
        this._state = { ...this._state, deletingKey: null, error: String(res.error) };
      } else {
        this._state = { ...this._state, deletingKey: null, status: `Removed ${fileName}.` };
        await this._context.refreshAddons?.();
        await this.loadIcons();
        return;
      }
    } catch (e) {
      this._state = {
        ...this._state,
        deletingKey: null,
        error: e instanceof Error ? e.message : 'Delete failed.'
      };
    }
    this.render();
  }

  async handleDeleteAll(scope, title, count) {
    if (!this._context?.invokeAction || count <= 0) return;
    const confirmed = window.confirm(
      `Delete all ${count} icon${count === 1 ? '' : 's'} in "${title}"? This cannot be undone.`
    );
    if (!confirmed) return;

    this._state = { ...this._state, deletingAllScope: scope, error: '', status: '' };
    this.render();
    try {
      const res = await this._context.invokeAction('delete-all', { scope });
      if (res?.error) {
        this._state = { ...this._state, deletingAllScope: null, error: String(res.error) };
      } else {
        const deletedCount = typeof res?.deleted === 'number' ? res.deleted : count;
        const errs = Array.isArray(res?.errors) ? res.errors.map(String) : [];
        const status = `Deleted ${deletedCount} icon${deletedCount === 1 ? '' : 's'} from ${title}.`;
        this._state = {
          ...this._state,
          deletingAllScope: null,
          status,
          error: errs.length > 0 ? errs.join(' ') : ''
        };
        this._context.notify?.(status, 4500);
        await this._context.refreshAddons?.();
        await this.loadIcons();
        return;
      }
    } catch (e) {
      this._state = {
        ...this._state,
        deletingAllScope: null,
        error: e instanceof Error ? e.message : 'Delete all failed.'
      };
    }
    this.render();
  }

  _renderSection(scope, title, subtitle, items, canEdit) {
    const busy = this._state.uploadingScope === scope || this._state.deletingAllScope === scope;
    const deletingAll = this._state.deletingAllScope === scope;
    const progress = this._state.uploadingScope === scope ? this._state.uploadProgress : null;
    const uploadLabel = this._state.uploadingScope === scope
      ? (progress && progress.total > 1 ? `Uploading ${progress.done}/${progress.total}...` : 'Uploading...')
      : '+ Upload Icons';
    const cards = items.length === 0
      ? `<div class="empty">No icons uploaded yet.</div>`
      : `<div class="grid">
          ${items.map((ic) => {
            const delKey = `${scope}:${ic.fileName}`;
            const isDeleting = this._state.deletingKey === delKey;
            return `
              <div class="icon-card" title="${escapeHtml(ic.fileName)}">
                <img src="${escapeHtml(ic.url)}" alt="${escapeHtml(ic.label)}" loading="lazy" />
                <span class="name">${escapeHtml(ic.label)}</span>
                ${canEdit
                  ? `<button type="button" class="del-btn" data-scope="${scope}" data-file="${escapeHtml(ic.fileName)}" ${isDeleting ? 'disabled' : ''} title="Delete icon" aria-label="Delete ${escapeHtml(ic.label)}">✕</button>`
                  : ''}
              </div>
            `;
          }).join('')}
        </div>`;

    const conflictMode = this._state.conflictMode || 'rename';
    return `
      <section class="section">
        <div class="sec-head">
          <div>
            <h3>${title} <span class="count">(${items.length})</span></h3>
            <p class="muted">${subtitle}</p>
          </div>
          ${canEdit
            ? `<div class="sec-actions">
                 <select class="conflict-select" data-conflict-select aria-label="Duplicate filename handling" title="How to handle duplicate filenames" ${busy ? 'disabled' : ''}>
                   <option value="rename" ${conflictMode === 'rename' ? 'selected' : ''}>Duplicates: Rename</option>
                   <option value="overwrite" ${conflictMode === 'overwrite' ? 'selected' : ''}>Duplicates: Overwrite</option>
                   <option value="skip" ${conflictMode === 'skip' ? 'selected' : ''}>Duplicates: Skip</option>
                 </select>
                 <label class="upload-btn ${busy ? 'disabled' : ''}">
                   <span>${uploadLabel}</span>
                   <input type="file" multiple accept=".png,.svg,.webp,.jpg,.jpeg,.gif,.ico,image/*" data-upload-scope="${scope}" ${busy ? 'disabled' : ''} />
                 </label>
                 ${items.length > 0
                   ? `<button type="button" class="delete-all-btn" data-delete-all-scope="${scope}" data-delete-all-title="${escapeHtml(title)}" data-delete-all-count="${items.length}" ${busy ? 'disabled' : ''}>${deletingAll ? 'Deleting...' : 'Delete All'}</button>`
                   : ''}
               </div>`
            : ''}
        </div>
        ${cards}
      </section>
    `;
  }

  render() {
    const st = this._state;
    const isAdmin = Boolean(st.isAdmin || this._context?.isAdmin);

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host { display: block; color: var(--tw-text); font-family: var(--tw-font-family); }
        .wrap { display: flex; flex-direction: column; gap: 18px; }
        .section {
          display: flex; flex-direction: column; gap: 10px;
          padding: 12px 14px; border-radius: 12px;
          background: var(--tw-surface-elevated); border: 1px solid var(--tw-border);
        }
        .sec-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
        }
        .sec-actions {
          display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .conflict-select {
          min-height: 36px; padding: 0 10px; border-radius: 8px;
          background: var(--tw-surface-solid); color: var(--tw-text);
          border: 1px solid var(--tw-border); font-size: 0.82rem; font-family: inherit;
          cursor: pointer;
        }
        .conflict-select:disabled { opacity: 0.6; cursor: default; }
        h3 { margin: 0; font-size: 0.96rem; }
        .count { font-weight: 400; color: var(--tw-text-muted); font-size: 0.85rem; }
        .muted { margin: 2px 0 0; font-size: 0.8rem; color: var(--tw-text-muted); }
        .upload-btn {
          display: inline-flex; align-items: center; justify-content: center;
          min-height: 36px; padding: 0 12px; border-radius: 8px;
          background: var(--tw-accent); color: var(--tw-accent-contrast);
          font-size: 0.84rem; font-weight: 600; cursor: pointer; user-select: none;
        }
        .upload-btn.disabled { opacity: 0.6; pointer-events: none; }
        .upload-btn input { display: none; }
        .delete-all-btn {
          display: inline-flex; align-items: center; justify-content: center;
          min-height: 36px; padding: 0 12px; border-radius: 8px;
          background: transparent; color: var(--tw-state-critical);
          border: 1px solid color-mix(in srgb, var(--tw-state-critical) 55%, var(--tw-border));
          font-size: 0.82rem; font-weight: 600; font-family: inherit; cursor: pointer;
        }
        .delete-all-btn:hover:not(:disabled) {
          background: rgba(220, 38, 38, 0.12);
          border-color: var(--tw-state-critical);
        }
        .delete-all-btn:disabled { opacity: 0.6; cursor: default; }
        .grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
          gap: 8px;
          max-height: 340px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .icon-card {
          position: relative;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 6px; padding: 10px 6px 8px; border-radius: 10px;
          background: var(--tw-surface-solid); border: 1px solid var(--tw-border);
          min-width: 0;
        }
        .icon-card img {
          width: 34px; height: 34px; object-fit: contain; display: block;
        }
        .icon-card .name {
          font-size: 0.74rem; color: var(--tw-text-muted);
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .del-btn {
          position: absolute; top: 4px; right: 4px;
          width: 22px; height: 22px; border-radius: 999px;
          border: 1px solid var(--tw-border); background: var(--tw-surface-elevated);
          color: var(--tw-text-muted); font-size: 0.7rem; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; padding: 0;
        }
        .del-btn:hover { color: var(--tw-state-critical); border-color: var(--tw-state-critical); }
        .empty { font-size: 0.82rem; color: var(--tw-text-muted); padding: 6px 2px; }
        .banner {
          padding: 8px 12px; border-radius: 8px; font-size: 0.84rem;
        }
        .banner.err { background: rgba(220, 38, 38, 0.14); color: var(--tw-state-critical); }
        .banner.ok { background: rgba(22, 163, 74, 0.14); color: var(--tw-state-normal); }
      </style>
      <div class="wrap">
        ${st.error ? `<div class="banner err">${escapeHtml(st.error)}</div>` : ''}
        ${st.status ? `<div class="banner ok">${escapeHtml(st.status)}</div>` : ''}
        ${st.loading
          ? '<div class="empty">Loading custom icons...</div>'
          : `
            ${this._renderSection(
              'user',
              'My Icons',
              'Personal icons visible only to you under the "My Icons" chip in the icon picker. Select one or more PNG, SVG, WebP, JPG, GIF, or ICO files.',
              st.user,
              true
            )}
            ${this._renderSection(
              'site',
              'Site Icons',
              isAdmin
                ? 'Shared icons visible to all users under the "Site Icons" chip in the icon picker.'
                : 'Shared icons uploaded by an administrator (available under the "Site Icons" chip).',
              st.site,
              isAdmin
            )}
          `}
      </div>
    `;

    this.shadowRoot.querySelectorAll('select[data-conflict-select]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const val = e.currentTarget.value;
        this._state = {
          ...this._state,
          conflictMode: val === 'overwrite' || val === 'skip' ? val : 'rename'
        };
        this.render();
      });
    });

    this.shadowRoot.querySelectorAll('input[data-upload-scope]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const el = e.currentTarget;
        const scope = el.getAttribute('data-upload-scope') || 'user';
        void this.handleUpload(scope, el.files);
        el.value = '';
      });
    });

    this.shadowRoot.querySelectorAll('button[data-delete-all-scope]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const el = e.currentTarget;
        const scope = el.getAttribute('data-delete-all-scope') || 'user';
        const title = el.getAttribute('data-delete-all-title') || (scope === 'site' ? 'Site Icons' : 'My Icons');
        const count = Number(el.getAttribute('data-delete-all-count') || '0');
        void this.handleDeleteAll(scope, title, count);
      });
    });

    this.shadowRoot.querySelectorAll('button.del-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const el = e.currentTarget;
        const scope = el.getAttribute('data-scope') || 'user';
        const fileName = el.getAttribute('data-file') || '';
        if (fileName) void this.handleDelete(scope, fileName);
      });
    });
  }
}

if (!customElements.get('tw-addon-custom-icons-settings')) {
  customElements.define('tw-addon-custom-icons-settings', TwAddonCustomIconsSettings);
}
