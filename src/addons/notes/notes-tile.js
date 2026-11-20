class TwAddonNotes extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._data = {};
    this._lastSaved = null;
    this._debounce = null;
  }

  set settings(val) {
    this._settings = val || {};
    this.render();
  }

  set data(val) {
    this._data = val || {};
    if (typeof this._data.text === 'string') {
      this._lastSaved = this._data.text;
    }
    const ta = this.shadowRoot?.querySelector('textarea');
    if (ta && ta !== this.shadowRoot?.activeElement) {
      ta.value = this.effectiveText();
    } else if (!ta) {
      this.render();
    }
  }

  effectiveText() {
    if (typeof this._data.text === 'string') return this._data.text;
    if (typeof this._settings.text === 'string') return this._settings.text;
    return '';
  }

  connectedCallback() {
    this.render();
  }

  emitSave(text) {
    if (text === this._lastSaved) return;
    this._lastSaved = text;
    this._data = { ...this._data, text };
    this.dispatchEvent(new CustomEvent('tile-data-changed', {
      detail: { text },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const title = this._settings.title || 'Note';
    const accent = this._settings.colour || 'var(--tw-accent)';
    const editable = Boolean(this._settings.allowViewEdit);
    const text = this.effectiveText();

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); }
        .wrap {
          flex: 1; display: flex; flex-direction: column; padding: var(--tw-tile-padding, 14px);
          gap: 6px; border-top: 4px solid ${accent}; min-width: 0;
        }
        .head {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 0.8rem; font-weight: 700; color: var(--tw-text-muted); text-transform: uppercase; letter-spacing: 0.04em;
        }
        textarea, .readonly {
          flex: 1; width: 100%; border: none; outline: none; resize: none; background: transparent;
          color: var(--tw-text); font-family: inherit; font-size: 0.94rem; line-height: 1.45;
          overflow-y: auto; white-space: pre-wrap; word-break: break-word;
        }
        .empty { color: var(--tw-text-muted); font-style: italic; }
      </style>
      <div class="wrap">
        <div class="head"><span>${title}</span></div>
        ${editable
          ? `<textarea placeholder="Tap to write..."></textarea>`
          : `<div class="readonly ${text ? '' : 'empty'}"></div>`}
      </div>
    `;

    if (editable) {
      const ta = this.shadowRoot.querySelector('textarea');
      if (ta) {
        ta.value = text;
        ta.addEventListener('input', () => {
          if (this._debounce) clearTimeout(this._debounce);
          this._debounce = window.setTimeout(() => this.emitSave(ta.value), 1500);
        });
        ta.addEventListener('blur', () => {
          if (this._debounce) { clearTimeout(this._debounce); this._debounce = null; }
          this.emitSave(ta.value);
        });
      }
    } else {
      const div = this.shadowRoot.querySelector('.readonly');
      if (div) div.textContent = text || 'Empty note (enable editing in tile settings).';
    }
  }
}

if (!customElements.get('tw-addon-notes')) {
  customElements.define('tw-addon-notes', TwAddonNotes);
}
