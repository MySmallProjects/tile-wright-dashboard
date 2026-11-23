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

  async handleUpload(scope, fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0 || !this._context?.invokeAction) return;

    const batches = chunkFilesForUpload(files);
    let processed = 0;
    let uploadedCount = 0;
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

          const res = await this._context.invokeAction('upload', { scope, files: encoded });
          if (res?.error) {
            errors.push(String(res.error));
          } else {
            if (Array.isArray(res?.uploaded)) uploadedCount += res.uploaded.length;
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

      const status = uploadedCount > 0 ? `Uploaded ${uploadedCount} icon${uploadedCount === 1 ? '' : 's'}.` : '';
      const errMsg = errors.length > 0 ? errors.join(' ') : '';
      this._state = {
        ...this._state,
        uploadingScope: null,
        uploadProgress: null,
        status,
        error: errMsg
      };
      if (uploadedCount > 0) {
        this._context.notify?.(status);
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

  _renderSection(scope, title, subtitle, items, canEdit) {
    const busy = this._state.uploadingScope === scope;
    const progress = busy ? this._state.uploadProgress : null;
    const uploadLabel = busy
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

    return `
      <section class="section">
        <div class="sec-head">
          <div>
            <h3>${title} <span class="count">(${items.length})</span></h3>
            <p class="muted">${subtitle}</p>
          </div>
          ${canEdit
            ? `<label class="upload-btn ${busy ? 'disabled' : ''}">
                 <span>${uploadLabel}</span>
                 <input type="file" multiple accept=".png,.svg,.webp,.jpg,.jpeg,.gif,.ico,image/*" data-upload-scope="${scope}" ${busy ? 'disabled' : ''} />
               </label>`
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

    this.shadowRoot.querySelectorAll('input[data-upload-scope]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const el = e.currentTarget;
        const scope = el.getAttribute('data-upload-scope') || 'user';
        void this.handleUpload(scope, el.files);
        el.value = '';
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
