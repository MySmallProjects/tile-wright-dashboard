function safeUrl(raw) {
  const s = String(raw || '').trim();
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s;
  return '#';
}

class TwAddonLinks extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
  }

  set settings(val) {
    this._settings = val || {};
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const title = this._settings.title || '';
    const style = this._settings.style || 'list';
    const items = Array.isArray(this._settings.items) ? this._settings.items.filter((x) => x && x.name && x.url) : [];

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; width: 100%; height: 100%; color: var(--tw-text); font-family: var(--tw-font-family); }
        .wrap {
          flex: 1; display: flex; flex-direction: column; padding: var(--tw-tile-padding, 14px);
          gap: 8px; overflow-y: auto; min-width: 0;
        }
        .title { font-size: 0.8rem; font-weight: 700; color: var(--tw-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .items.list { display: flex; flex-direction: column; gap: 6px; }
        .items.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(74px, 1fr)); gap: 6px; }
        .items.pills { display: flex; flex-wrap: wrap; gap: 6px; }
        a.link {
          display: inline-flex; align-items: center; justify-content: space-between; gap: 6px;
          padding: 8px 12px; border-radius: ${style === 'pills' ? '999px' : '10px'};
          border: 1px solid var(--tw-border); background: var(--tw-surface-elevated);
          color: var(--tw-text); text-decoration: none; font-size: 0.88rem; font-weight: 500;
          min-height: 38px; min-width: 0;
        }
        .items.grid a.link {
          flex-direction: column; justify-content: center; text-align: center;
          padding: 10px 6px; min-height: 56px; font-size: 0.82rem; gap: 2px;
        }
        .items.grid a.link .arrow { font-size: 0.72rem; opacity: 0.65; }
        a.link span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
        a.link:hover { border-color: var(--tw-accent); color: var(--tw-accent); }
        .setup { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--tw-text-muted); font-size: 0.86rem; }
      </style>
      <div class="wrap">
        ${title ? `<div class="title">${title}</div>` : ''}
        ${items.length === 0
          ? '<div class="setup"><div><strong>Needs setup</strong><br>Add one or more links in tile settings.</div></div>'
          : `<div class="items ${style}"></div>`}
      </div>
    `;

    const container = this.shadowRoot.querySelector('.items');
    if (container) {
      for (const item of items) {
        const a = document.createElement('a');
        a.className = 'link';
        a.href = safeUrl(item.url);
        if (item.newTab !== false) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        const label = document.createElement('span');
        label.textContent = item.name;
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = item.newTab !== false ? '↗' : '→';
        a.appendChild(label);
        a.appendChild(arrow);
        container.appendChild(a);
      }
    }
  }
}

if (!customElements.get('tw-addon-links')) {
  customElements.define('tw-addon-links', TwAddonLinks);
}
