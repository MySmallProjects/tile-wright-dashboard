/**
 * Built-in starter Note Web Component for Phase 3.
 * Saves note text via `tile-data-changed` independently of dashboard layout
 * so Edit Mode Cancel never discards note edits.
 */
class TwNoteTile extends HTMLElement {
  private _data: { text?: string } = { text: '' };
  private _debounce: number | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set data(val: Record<string, unknown> | undefined) {
    const nextText = typeof val?.text === 'string' ? val.text : '';
    this._lastSavedText = nextText;
    if (this._data.text !== nextText) {
      this._data = { text: nextText };
      const ta = this.shadowRoot?.querySelector('textarea');
      if (ta && ta !== this.shadowRoot?.activeElement && ta.value !== nextText) {
        ta.value = nextText;
      }
    }
  }

  connectedCallback() {
    this.render();
  }

  private _lastSavedText = '';

  private emitSave(text: string) {
    if (text === this._lastSavedText) return;
    this._lastSavedText = text;
    this._data = { text };
    this.dispatchEvent(new CustomEvent('tile-data-changed', {
      detail: { text },
      bubbles: true,
      composed: true
    }));
  }

  private render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          width: 100%;
          height: 100%;
          color: var(--tw-text);
          font-family: var(--tw-font-family);
        }
        .wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: var(--tw-tile-padding, 14px);
          gap: 6px;
        }
        .title {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--tw-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        textarea {
          flex: 1;
          width: 100%;
          resize: none;
          border: none;
          outline: none;
          background: transparent;
          color: var(--tw-text);
          font-family: inherit;
          font-size: 0.94rem;
          line-height: 1.4;
        }
      </style>
      <div class="wrap">
        <div class="title">Note</div>
        <textarea placeholder="Write a note..."></textarea>
      </div>
    `;

    const ta = this.shadowRoot.querySelector('textarea');
    if (ta) {
      ta.value = this._data.text ?? '';
      ta.addEventListener('input', () => {
        if (this._debounce !== null) clearTimeout(this._debounce);
        this._debounce = window.setTimeout(() => this.emitSave(ta.value), 1500);
      });
      ta.addEventListener('blur', () => {
        if (this._debounce !== null) {
          clearTimeout(this._debounce);
          this._debounce = null;
        }
        this.emitSave(ta.value);
      });
    }
  }
}

export function registerNoteTile() {
  if (!customElements.get('tw-note-tile')) {
    customElements.define('tw-note-tile', TwNoteTile);
  }
}
