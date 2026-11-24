const TASK_ICONS = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  cart: 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  flag: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
  calendar: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z',
  clock: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z',
  wrench: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
  pill: 'M4.22 11.29l7.07-7.07a5 5 0 0 1 7.07 7.07l-7.07 7.07a5 5 0 0 1-7.07-7.07zm1.42 1.42a3 3 0 0 0 4.24 4.24l2.83-2.83-4.24-4.24-2.83 2.83z',
  phone: 'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  mail: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  book: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z',
  dollar: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  gift: 'M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z',
  briefcase: 'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
  alert: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  bolt: 'M7 2v11h3v9l7-12h-4l4-8z',
  leaf: 'M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z',
  paw: 'M4.5 11c1.38 0 2.5-1.12 2.5-2.5S5.88 6 4.5 6 2 7.12 2 8.5 3.12 11 4.5 11zm4.5-4c1.38 0 2.5-1.12 2.5-2.5S10.38 2 9 2 6.5 3.12 6.5 4.5 7.62 7 9 7zm6 0c1.38 0 2.5-1.12 2.5-2.5S16.38 2 15 2s-2.5 1.12-2.5 2.5S13.62 7 15 7zm4.5 4c1.38 0 2.5-1.12 2.5-2.5S20.88 6 19.5 6 17 7.12 17 8.5s1.12 2.5 2.5 2.5zm-7.5 1c-2.94 0-5.5 2.38-5.5 5 0 1.66 1.34 3 3 3 1.07 0 1.88-.43 2.5-.43.62 0 1.43.43 2.5.43 1.66 0 3-1.34 3-3 0-2.62-2.56-5-5.5-5z',
  tag: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z'
};

const ICON_KEYS = Object.keys(TASK_ICONS);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeColour(val) {
  const s = String(val || '').trim();
  if (/^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|var\(--[a-z0-9-]+\)|[a-z]{3,20})$/i.test(s)) {
    return s;
  }
  return 'var(--tw-accent)';
}

function makeTaskId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function normalizeTasks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object' && typeof item.text === 'string')
    .map((item) => ({
      id: typeof item.id === 'string' && item.id ? item.id : makeTaskId(),
      text: item.text,
      done: Boolean(item.done),
      icon: typeof item.icon === 'string' ? item.icon.trim() : ''
    }));
}

class TwAddonTaskList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
    this._data = {};
    this._context = {};
    this._tasks = [];
    this._lastSavedJson = '';
    this._editingId = null;
    this._pickerTarget = null; // null | { kind: 'new' } | { kind: 'task', id: string }
    this._iconSearch = '';
    this._showAddBar = false;
    this._newTaskIcon = '';
    this._newTaskDraft = '';
    this._dragging = null;
    this._outsideClickHandler = (ev) => {
      if (!this._pickerTarget) return;
      const path = ev.composedPath ? ev.composedPath() : [];
      const popover = this.shadowRoot?.querySelector('.icon-popover');
      if (popover && path.includes(popover)) return;
      const triggers = this.shadowRoot?.querySelectorAll('[data-icon-trigger]');
      if (triggers) {
        for (const t of triggers) {
          if (path.includes(t)) return;
        }
      }
      this._pickerTarget = null;
      this.render();
    };
  }

  set settings(val) {
    this._settings = val || {};
    if (this.interactionMode() !== 'full') {
      this._editingId = null;
      this._pickerTarget = null;
      this._showAddBar = false;
    }
    this.render();
  }

  set data(val) {
    this._data = val || {};
    const incoming = normalizeTasks(this._data.tasks);
    const json = JSON.stringify(incoming);
    if (json === this._lastSavedJson) return;
    this._tasks = incoming;
    this._lastSavedJson = json;
    if (!this._dragging && !this._editingId) {
      this.render();
    }
  }

  set context(val) {
    this._context = val || {};
    this.render();
  }

  connectedCallback() {
    document.addEventListener('pointerdown', this._outsideClickHandler, true);
    this.render();
  }

  disconnectedCallback() {
    document.removeEventListener('pointerdown', this._outsideClickHandler, true);
  }

  interactionMode() {
    const mode = this._settings.interactionMode;
    if (mode === 'check-only' || mode === 'readonly') return mode;
    return 'full';
  }

  completedBehavior() {
    const b = this._settings.completedBehavior;
    if (b === 'sink' || b === 'hide') return b;
    return 'keep';
  }

  density() {
    return this._settings.density === 'compact' ? 'compact' : 'comfortable';
  }

  saveTasks(nextTasks) {
    this._tasks = nextTasks;
    this._lastSavedJson = JSON.stringify(nextTasks);
    const nextData = { ...this._data, tasks: nextTasks };
    this._data = nextData;
    this.dispatchEvent(new CustomEvent('tile-data-changed', {
      detail: nextData,
      bubbles: true,
      composed: true
    }));
  }

  resolveTaskIconHtml(iconRef) {
    const ref = String(iconRef || '').trim();
    if (!ref) return '';
    const lower = ref.toLowerCase();
    if (TASK_ICONS[lower]) {
      return `<svg class="task-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${TASK_ICONS[lower]}" /></svg>`;
    }
    if (typeof this._context?.resolveIcon === 'function') {
      const resolved = this._context.resolveIcon(ref);
      if (resolved) {
        if (resolved.kind === 'image' && resolved.url) {
          return `<img class="task-icon-img" src="${escapeHtml(resolved.url)}" alt="" />`;
        }
        if (resolved.kind === 'svg' && resolved.path) {
          return `<svg class="task-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${escapeHtml(resolved.path)}" /></svg>`;
        }
      }
    }
    return '';
  }

  visibleTasks() {
    const behavior = this.completedBehavior();
    if (behavior === 'hide') {
      return this._tasks.filter((t) => !t.done);
    }
    if (behavior === 'sink') {
      const active = this._tasks.filter((t) => !t.done);
      const done = this._tasks.filter((t) => t.done);
      return [...active, ...done];
    }
    return [...this._tasks];
  }

  addTask(text, icon) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    const task = {
      id: makeTaskId(),
      text: trimmed,
      done: false,
      icon: String(icon || '').trim()
    };
    this._newTaskDraft = '';
    this.saveTasks([...this._tasks, task]);
    this.render();
    const input = this.shadowRoot?.querySelector('.add-input');
    if (input) input.focus();
  }

  toggleTask(id) {
    if (this.interactionMode() === 'readonly') return;
    const next = this._tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    this.saveTasks(next);
    this.render();
  }

  updateTaskText(id, text) {
    const trimmed = String(text || '').trim();
    this._editingId = null;
    if (!trimmed) {
      this.render();
      return;
    }
    const existing = this._tasks.find((t) => t.id === id);
    if (!existing || existing.text === trimmed) {
      this.render();
      return;
    }
    const next = this._tasks.map((t) => (t.id === id ? { ...t, text: trimmed } : t));
    this.saveTasks(next);
    this.render();
  }

  updateTaskIcon(id, icon) {
    const clean = String(icon || '').trim();
    const next = this._tasks.map((t) => (t.id === id ? { ...t, icon: clean } : t));
    this._pickerTarget = null;
    this.saveTasks(next);
    this.render();
  }

  deleteTask(id) {
    if (this.interactionMode() !== 'full') return;
    if (this._editingId === id) this._editingId = null;
    if (this._pickerTarget?.kind === 'task' && this._pickerTarget.id === id) {
      this._pickerTarget = null;
    }
    const next = this._tasks.filter((t) => t.id !== id);
    this.saveTasks(next);
    this.render();
  }

  resetAllTasks() {
    if (this.interactionMode() === 'readonly') return;
    if (!this._tasks.some((t) => t.done)) return;
    const next = this._tasks.map((t) => (t.done ? { ...t, done: false } : t));
    this.saveTasks(next);
    this.render();
  }

  reorderVisibleTask(draggedId, targetId, position) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const fromIdx = this._tasks.findIndex((t) => t.id === draggedId);
    const targetIdx = this._tasks.findIndex((t) => t.id === targetId);
    if (fromIdx === -1 || targetIdx === -1) return;

    const next = [...this._tasks];
    const [moved] = next.splice(fromIdx, 1);
    const adjustedTargetIdx = next.findIndex((t) => t.id === targetId);
    if (adjustedTargetIdx === -1) return;
    const insertIdx = position === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
    next.splice(insertIdx, 0, moved);

    if (next.every((t, i) => t.id === this._tasks[i].id)) return;
    this.saveTasks(next);
    this.render();
  }

  startDrag(ev, rowEl, taskId) {
    if (this.interactionMode() !== 'full') return;
    ev.preventDefault();
    ev.stopPropagation();

    const listEl = this.shadowRoot?.querySelector('.list');
    if (!listEl) return;

    const handle = ev.currentTarget;
    try {
      handle.setPointerCapture(ev.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }

    const startY = ev.clientY;
    const rowEls = Array.from(listEl.querySelectorAll('.task-row'));
    const rects = rowEls.map((el) => ({
      el,
      id: el.dataset.id,
      rect: el.getBoundingClientRect()
    }));

    let dropTargetId = null;
    let dropPosition = null;

    rowEl.classList.add('is-dragging');
    this._dragging = { id: taskId };

    const clearIndicators = () => {
      for (const item of rects) {
        item.el.classList.remove('drop-before', 'drop-after');
      }
    };

    const onMove = (moveEv) => {
      moveEv.preventDefault();
      const dy = moveEv.clientY - startY;
      rowEl.style.transform = `translateY(${dy}px)`;

      clearIndicators();
      dropTargetId = null;
      dropPosition = null;

      for (const item of rects) {
        if (item.id === taskId) continue;
        const midY = item.rect.top + item.rect.height / 2;
        if (moveEv.clientY < midY) {
          dropTargetId = item.id;
          dropPosition = 'before';
          item.el.classList.add('drop-before');
          break;
        }
      }

      if (!dropTargetId) {
        for (let i = rects.length - 1; i >= 0; i--) {
          if (rects[i].id !== taskId) {
            dropTargetId = rects[i].id;
            dropPosition = 'after';
            rects[i].el.classList.add('drop-after');
            break;
          }
        }
      }
    };

    const finish = (apply) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      clearIndicators();
      rowEl.classList.remove('is-dragging');
      rowEl.style.transform = '';
      this._dragging = null;
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        // Ignore
      }
      if (apply && dropTargetId && dropPosition) {
        this.reorderVisibleTask(taskId, dropTargetId, dropPosition);
      }
    };

    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  getOtherIcons() {
    if (typeof this._context?.listIcons !== 'function') return [];
    const raw = this._context.listIcons();
    if (!Array.isArray(raw)) return [];
    const seen = new Set(ICON_KEYS);
    const out = [];
    for (const item of raw) {
      if (!item || typeof item.refId !== 'string') continue;
      const key = item.refId.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        refId: item.refId.trim(),
        label: String(item.label || item.refId).trim()
      });
    }
    return out;
  }

  renderIconResultsHtml(query, currentIcon) {
    const q = String(query || '').trim().toLowerCase();
    const currentLower = String(currentIcon || '').trim().toLowerCase();

    const curatedMatches = ICON_KEYS.filter((key) => !q || key.includes(q));
    const allOthers = this.getOtherIcons();
    const otherMatches = allOthers.filter(
      (ic) => !q || ic.label.toLowerCase().includes(q) || ic.refId.toLowerCase().includes(q)
    );

    const maxOthers = q ? 200 : 120;
    const shownOthers = otherMatches.slice(0, maxOthers);
    const remainingOthers = otherMatches.length - shownOthers.length;

    let html = '';

    if (curatedMatches.length > 0) {
      html += `<div class="icon-section-label">Suggested</div>`;
      html += `<div class="icon-grid">${curatedMatches.map((key) => {
        const active = currentLower === key ? 'is-selected' : '';
        return `
          <button type="button" class="icon-choice ${active}" data-pick-icon="${escapeHtml(key)}" title="${escapeHtml(key)}" aria-label="${escapeHtml(key)}">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${TASK_ICONS[key]}" /></svg>
          </button>
        `;
      }).join('')}</div>`;
    }

    if (shownOthers.length > 0) {
      html += `<div class="icon-section-label">All icons</div>`;
      html += `<div class="icon-grid">${shownOthers.map((ic) => {
        const active = currentLower === ic.refId.toLowerCase() ? 'is-selected' : '';
        const iconHtml = this.resolveTaskIconHtml(ic.refId);
        if (!iconHtml) return '';
        return `
          <button type="button" class="icon-choice ${active}" data-pick-icon="${escapeHtml(ic.refId)}" title="${escapeHtml(ic.label)}" aria-label="${escapeHtml(ic.label)}">
            ${iconHtml}
          </button>
        `;
      }).join('')}</div>`;
      if (remainingOthers > 0) {
        html += `<div class="icon-more-note">Type to search ${remainingOthers} more icons…</div>`;
      }
    }

    if (!html) {
      html = `<div class="icon-empty">No matching icons</div>`;
    }

    return html;
  }

  renderIconPopover() {
    if (!this._pickerTarget) return '';
    const currentIcon = this._pickerTarget.kind === 'new'
      ? this._newTaskIcon
      : (this._tasks.find((t) => t.id === this._pickerTarget.id)?.icon || '');

    return `
      <div class="icon-popover" role="dialog" aria-label="Choose task icon">
        <div class="icon-popover-head">
          <span>Task icon</span>
          <button type="button" class="icon-clear-btn" data-pick-icon="" title="Remove icon">None</button>
        </div>
        <input type="search" class="icon-search-input" placeholder="Search icons..." value="${escapeHtml(this._iconSearch)}" aria-label="Search icons" />
        <div class="icon-scroll">
          ${this.renderIconResultsHtml(this._iconSearch, currentIcon)}
        </div>
      </div>
    `;
  }

  render() {
    const title = typeof this._settings.title === 'string' && this._settings.title.trim()
      ? this._settings.title.trim()
      : 'Tasks';
    const accent = safeColour(this._settings.colour);
    const mode = this.interactionMode();
    const canEdit = mode === 'full';
    const canCheck = mode === 'full' || mode === 'check-only';
    const isCompact = this.density() === 'compact';
    const showProgress = this._settings.showProgress !== false;
    const showReset = Boolean(this._settings.showResetButton) && canCheck;

    const totalCount = this._tasks.length;
    const doneCount = this._tasks.filter((t) => t.done).length;
    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    const visible = this.visibleTasks();
    const hiddenCompletedCount = this.completedBehavior() === 'hide' ? doneCount : 0;

    // Preserve scroll position across re-renders
    const prevList = this.shadowRoot?.querySelector('.list');
    const prevScrollTop = prevList ? prevList.scrollTop : 0;

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        :host {
          display: flex;
          width: 100%;
          height: 100%;
          color: var(--tw-text);
          font-family: var(--tw-font-family);
          --tl-accent: ${accent};
        }
        .wrap {
          position: relative;
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: var(--tw-tile-padding, 14px);
          gap: ${isCompact ? '6px' : '8px'};
          border-top: 4px solid var(--tl-accent);
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 22px;
        }
        .title {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--tw-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .head-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .counter {
          font-size: 0.74rem;
          font-weight: 600;
          color: var(--tw-text-muted);
          font-variant-numeric: tabular-nums;
        }
        .reset-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 1px solid var(--tw-border);
          background: var(--tw-surface-elevated);
          color: var(--tw-text-muted);
          border-radius: 6px;
          padding: 2px 7px;
          font-size: 0.72rem;
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .reset-btn:hover {
          border-color: var(--tl-accent);
          color: var(--tl-accent);
        }
        .add-toggle-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          padding: 0;
          border: 1px solid var(--tw-border);
          background: var(--tw-surface-elevated);
          color: var(--tw-text-muted);
          border-radius: 6px;
          cursor: pointer;
          flex-shrink: 0;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .add-toggle-btn:hover {
          border-color: var(--tl-accent);
          color: var(--tl-accent);
        }
        .add-toggle-btn.is-open {
          border-color: var(--tl-accent);
          background: var(--tl-accent);
          color: #ffffff;
        }
        .add-toggle-btn svg {
          width: 14px;
          height: 14px;
          transition: transform 0.15s ease;
        }
        .add-toggle-btn.is-open svg {
          transform: rotate(45deg);
        }
        .progress-track {
          width: 100%;
          height: 3px;
          border-radius: 999px;
          background: var(--tw-border);
          overflow: hidden;
          flex-shrink: 0;
        }
        .progress-fill {
          height: 100%;
          background: var(--tl-accent);
          border-radius: 999px;
          transition: width 0.25s ease;
        }
        .list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: ${isCompact ? '3px' : '5px'};
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          padding-right: 2px;
        }
        .task-row {
          position: relative;
          display: flex;
          align-items: center;
          gap: ${isCompact ? '6px' : '8px'};
          padding: ${isCompact ? '4px 6px' : '7px 8px'};
          border-radius: 9px;
          border: 1px solid transparent;
          background: var(--tw-surface-elevated);
          min-width: 0;
          transition: background 0.15s, border-color 0.15s, opacity 0.15s;
        }
        .task-row:hover {
          border-color: var(--tw-border);
        }
        .task-row.is-done {
          opacity: 0.68;
        }
        .task-row.is-dragging {
          z-index: 10;
          opacity: 0.94;
          border-color: var(--tl-accent);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
          pointer-events: none;
        }
        .task-row.drop-before::before,
        .task-row.drop-after::after {
          content: '';
          position: absolute;
          left: 4px;
          right: 4px;
          height: 2px;
          border-radius: 2px;
          background: var(--tl-accent);
          pointer-events: none;
        }
        .task-row.drop-before::before { top: -3px; }
        .task-row.drop-after::after { bottom: -3px; }

        .drag-handle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 24px;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--tw-text-muted);
          opacity: 0.55;
          cursor: grab;
          touch-action: none;
          flex-shrink: 0;
          border-radius: 4px;
        }
        .drag-handle:hover {
          opacity: 1;
          color: var(--tw-text);
        }
        .drag-handle:active {
          cursor: grabbing;
        }
        .drag-handle svg {
          width: 14px;
          height: 14px;
        }

        .icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${isCompact ? '20px' : '22px'};
          height: ${isCompact ? '20px' : '22px'};
          padding: 0;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--tl-accent);
          flex-shrink: 0;
        }
        .icon-btn.is-interactive {
          cursor: pointer;
        }
        .icon-btn.is-interactive:hover {
          background: var(--tw-border);
        }
        .icon-btn.is-placeholder {
          display: none;
          color: var(--tw-text-muted);
          opacity: 0.55;
        }
        .task-row:hover .icon-btn.is-placeholder,
        .task-row:focus-within .icon-btn.is-placeholder {
          display: inline-flex;
        }
        .icon-btn.is-placeholder:hover {
          opacity: 1;
          color: var(--tl-accent);
        }
        .task-icon-svg,
        .task-icon-img {
          width: ${isCompact ? '15px' : '16px'};
          height: ${isCompact ? '15px' : '16px'};
          object-fit: contain;
          display: block;
        }

        .task-text {
          flex: 1;
          min-width: 0;
          font-size: ${isCompact ? '0.84rem' : '0.92rem'};
          line-height: 1.35;
          color: var(--tw-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          user-select: none;
        }
        .task-row.is-done .task-text {
          text-decoration: line-through;
          color: var(--tw-text-muted);
        }

        .edit-input {
          flex: 1;
          min-width: 0;
          border: 1px solid var(--tl-accent);
          border-radius: 6px;
          background: var(--tw-surface-solid, transparent);
          color: var(--tw-text);
          font-family: inherit;
          font-size: ${isCompact ? '0.84rem' : '0.92rem'};
          padding: 2px 6px;
          outline: none;
        }

        .row-actions {
          display: none;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }
        .task-row:hover .row-actions,
        .task-row:focus-within .row-actions {
          display: inline-flex;
        }
        @media (hover: none) {
          .row-actions {
            display: inline-flex;
            opacity: 0.85;
          }
        }
        .action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          padding: 0;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--tw-text-muted);
          cursor: pointer;
        }
        .action-btn:hover {
          background: var(--tw-border);
          color: var(--tw-text);
        }
        .action-btn.delete:hover {
          color: var(--tw-state-critical, #dc2626);
        }
        .action-btn svg {
          width: 14px;
          height: 14px;
        }

        .check-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${isCompact ? '18px' : '20px'};
          height: ${isCompact ? '18px' : '20px'};
          padding: 0;
          border-radius: 6px;
          border: 2px solid var(--tw-border);
          background: transparent;
          color: #ffffff;
          flex-shrink: 0;
          cursor: ${canCheck ? 'pointer' : 'default'};
          transition: background 0.15s, border-color 0.15s, transform 0.1s;
        }
        .check-btn.is-interactive:hover {
          border-color: var(--tl-accent);
        }
        .check-btn.is-interactive:active {
          transform: scale(0.92);
        }
        .check-btn.is-checked {
          background: var(--tl-accent);
          border-color: var(--tl-accent);
        }
        .check-btn svg {
          width: 13px;
          height: 13px;
          opacity: 0;
          transition: opacity 0.12s;
        }
        .check-btn.is-checked svg {
          opacity: 1;
        }

        .empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--tw-text-muted);
          font-size: 0.86rem;
          font-style: italic;
          padding: 12px;
        }
        .hidden-note {
          font-size: 0.75rem;
          color: var(--tw-text-muted);
          text-align: center;
          padding: 4px 0 2px;
        }

        .add-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 6px;
          border-radius: 10px;
          border: 1px solid var(--tw-border);
          background: var(--tw-surface-elevated);
          flex-shrink: 0;
        }
        .add-bar:focus-within {
          border-color: var(--tl-accent);
        }
        .add-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          padding: 0;
          border: none;
          border-radius: 7px;
          background: transparent;
          color: var(--tw-text-muted);
          cursor: pointer;
          flex-shrink: 0;
        }
        .add-icon-btn.has-icon {
          color: var(--tl-accent);
        }
        .add-icon-btn:hover {
          background: var(--tw-border);
          color: var(--tl-accent);
        }
        .add-icon-btn svg {
          width: 16px;
          height: 16px;
        }
        .add-input {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          color: var(--tw-text);
          font-family: inherit;
          font-size: 0.88rem;
          padding: 4px 2px;
        }
        .add-input::placeholder {
          color: var(--tw-text-muted);
        }
        .add-submit {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          padding: 0;
          border: none;
          border-radius: 7px;
          background: var(--tl-accent);
          color: #ffffff;
          cursor: pointer;
          flex-shrink: 0;
          font-weight: 700;
        }
        .add-submit:hover {
          filter: brightness(1.08);
        }
        .add-submit svg {
          width: 16px;
          height: 16px;
        }

        .icon-popover {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: ${this._showAddBar ? '52px' : '12px'};
          max-width: 280px;
          max-height: calc(100% - 64px);
          z-index: 30;
          background: var(--tw-surface-solid, #1e293b);
          border: 1px solid var(--tw-border);
          border-radius: 12px;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .icon-popover-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.74rem;
          font-weight: 700;
          color: var(--tw-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        .icon-clear-btn {
          border: none;
          background: transparent;
          color: var(--tw-text-muted);
          font-size: 0.74rem;
          font-family: inherit;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 5px;
        }
        .icon-clear-btn:hover {
          background: var(--tw-border);
          color: var(--tw-text);
        }
        .icon-search-input {
          width: 100%;
          border: 1px solid var(--tw-border);
          border-radius: 7px;
          background: var(--tw-surface-elevated);
          color: var(--tw-text);
          font-family: inherit;
          font-size: 0.8rem;
          padding: 5px 8px;
          outline: none;
          flex-shrink: 0;
        }
        .icon-search-input:focus {
          border-color: var(--tl-accent);
        }
        .icon-scroll {
          flex: 1;
          min-height: 0;
          max-height: 220px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 2px;
        }
        .icon-section-label {
          font-size: 0.68rem;
          font-weight: 700;
          color: var(--tw-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-top: 2px;
        }
        .icon-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
        }
        .icon-choice {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 30px;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: var(--tw-text);
          cursor: pointer;
          padding: 0;
        }
        .icon-choice:hover {
          background: var(--tw-surface-elevated);
          border-color: var(--tw-border);
          color: var(--tl-accent);
        }
        .icon-choice.is-selected {
          background: var(--tw-surface-elevated);
          border-color: var(--tl-accent);
          color: var(--tl-accent);
        }
        .icon-choice svg,
        .icon-choice img {
          width: 17px;
          height: 17px;
          object-fit: contain;
        }
        .icon-more-note,
        .icon-empty {
          font-size: 0.74rem;
          color: var(--tw-text-muted);
          text-align: center;
          padding: 6px 2px;
        }
      </style>

      <div class="wrap">
        <div class="head">
          <span class="title">${escapeHtml(title)}</span>
          <div class="head-right">
            ${showReset && doneCount > 0
              ? `<button type="button" class="reset-btn" data-action="reset-all" title="Uncheck all tasks">Reset</button>`
              : ''}
            ${showProgress && totalCount > 0
              ? `<span class="counter">${doneCount} / ${totalCount}</span>`
              : ''}
            ${canEdit
              ? `<button type="button" class="add-toggle-btn ${this._showAddBar ? 'is-open' : ''}" data-action="toggle-add" aria-expanded="${this._showAddBar ? 'true' : 'false'}" title="${this._showAddBar ? 'Hide add task' : 'Add task'}" aria-label="${this._showAddBar ? 'Hide add task' : 'Add task'}">
                   <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
                 </button>`
              : ''}
          </div>
        </div>

        ${showProgress && totalCount > 0
          ? `<div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${pct}%"></div></div>`
          : ''}

        <div class="list" role="list">
          ${visible.length === 0
            ? `<div class="empty">${totalCount === 0
                ? (canEdit ? (this._showAddBar ? 'No tasks yet. Add one below.' : 'No tasks yet. Click + to add one.') : 'No tasks yet.')
                : 'All tasks completed!'}</div>`
            : visible.map((task) => this.renderRow(task, canEdit, canCheck)).join('')}
          ${hiddenCompletedCount > 0 && visible.length > 0
            ? `<div class="hidden-note">${hiddenCompletedCount} completed hidden</div>`
            : ''}
        </div>

        ${canEdit && this._showAddBar ? this.renderAddBar() : ''}
        ${canEdit ? this.renderIconPopover() : ''}
      </div>
    `;

    const listEl = this.shadowRoot.querySelector('.list');
    if (listEl && prevScrollTop > 0) {
      listEl.scrollTop = prevScrollTop;
    }

    this.bindEvents();
  }

  renderRow(task, canEdit, canCheck) {
    const isEditing = canEdit && this._editingId === task.id;
    const iconHtml = this.resolveTaskIconHtml(task.icon);
    const hasIcon = Boolean(iconHtml);

    const dragHandleHtml = canEdit
      ? `<button type="button" class="drag-handle" data-drag="${escapeHtml(task.id)}" title="Drag to reorder" aria-label="Drag to reorder">
           <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
             <path d="M9 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-6 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
           </svg>
         </button>`
      : '';

    let iconSlotHtml = '';
    if (hasIcon) {
      if (canEdit) {
        iconSlotHtml = `<button type="button" class="icon-btn is-interactive" data-icon-trigger="task" data-id="${escapeHtml(task.id)}" title="Change icon" aria-label="Change task icon">${iconHtml}</button>`;
      } else {
        iconSlotHtml = `<span class="icon-btn" aria-hidden="true">${iconHtml}</span>`;
      }
    } else if (canEdit) {
      iconSlotHtml = `<button type="button" class="icon-btn is-interactive is-placeholder" data-icon-trigger="task" data-id="${escapeHtml(task.id)}" title="Add icon" aria-label="Add task icon">
        <svg class="task-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 11h3v-2h-3V8h-2v3H8v2h3v3h2v-3z" /></svg>
      </button>`;
    }

    const contentHtml = isEditing
      ? `<input type="text" class="edit-input" data-edit-input="${escapeHtml(task.id)}" value="${escapeHtml(task.text)}" aria-label="Edit task" />`
      : `<span class="task-text" data-text-id="${escapeHtml(task.id)}" title="${escapeHtml(task.text)}">${escapeHtml(task.text)}</span>`;

    const actionsHtml = canEdit && !isEditing
      ? `<span class="row-actions">
           <button type="button" class="action-btn" data-action="edit" data-id="${escapeHtml(task.id)}" title="Edit task" aria-label="Edit task">
             <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
           </button>
           <button type="button" class="action-btn delete" data-action="delete" data-id="${escapeHtml(task.id)}" title="Delete task" aria-label="Delete task">
             <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
           </button>
         </span>`
      : '';

    const checkHtml = `
      <button type="button"
        class="check-btn ${task.done ? 'is-checked' : ''} ${canCheck ? 'is-interactive' : ''}"
        data-action="toggle"
        data-id="${escapeHtml(task.id)}"
        role="checkbox"
        aria-checked="${task.done ? 'true' : 'false'}"
        aria-label="${task.done ? 'Mark task incomplete' : 'Mark task complete'}"
        ${canCheck ? '' : 'disabled'}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
      </button>
    `;

    return `
      <div class="task-row ${task.done ? 'is-done' : ''}" role="listitem" data-id="${escapeHtml(task.id)}">
        ${dragHandleHtml}
        ${iconSlotHtml}
        ${contentHtml}
        ${actionsHtml}
        ${checkHtml}
      </div>
    `;
  }

  renderAddBar() {
    const iconHtml = this.resolveTaskIconHtml(this._newTaskIcon);
    const hasIcon = Boolean(iconHtml);
    return `
      <form class="add-bar">
        <button type="button"
          class="add-icon-btn ${hasIcon ? 'has-icon' : ''}"
          data-icon-trigger="new"
          title="${hasIcon ? 'Change icon for new task' : 'Pick icon for new task'}"
          aria-label="Pick icon for new task">
          ${hasIcon
            ? iconHtml
            : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>`}
        </button>
        <input type="text" class="add-input" placeholder="Add a task..." value="${escapeHtml(this._newTaskDraft)}" aria-label="New task" />
        <button type="submit" class="add-submit" title="Add task" aria-label="Add task">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
        </button>
      </form>
    `;
  }

  bindEvents() {
    const root = this.shadowRoot;
    if (!root) return;

    const resetBtn = root.querySelector('[data-action="reset-all"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetAllTasks());
    }

    const toggleAddBtn = root.querySelector('[data-action="toggle-add"]');
    if (toggleAddBtn) {
      toggleAddBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._showAddBar = !this._showAddBar;
        if (!this._showAddBar && this._pickerTarget?.kind === 'new') {
          this._pickerTarget = null;
          this._iconSearch = '';
        }
        this.render();
        if (this._showAddBar) {
          const input = this.shadowRoot?.querySelector('.add-input');
          if (input) input.focus();
        }
      });
    }

    // Checkboxes
    root.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.toggleTask(btn.dataset.id);
      });
    });

    // Edit buttons
    root.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._pickerTarget = null;
        this._editingId = btn.dataset.id;
        this.render();
      });
    });

    // Double-click text to edit
    if (this.interactionMode() === 'full') {
      root.querySelectorAll('.task-text').forEach((span) => {
        span.addEventListener('dblclick', (ev) => {
          ev.stopPropagation();
          this._pickerTarget = null;
          this._editingId = span.dataset.textId;
          this.render();
        });
      });
    }

    // Active inline edit input
    const editInput = root.querySelector('.edit-input');
    if (editInput) {
      const id = editInput.dataset.editInput;
      editInput.focus();
      editInput.select();
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        this.updateTaskText(id, editInput.value);
      };
      editInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
          ev.stopPropagation();
        }
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commit();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          committed = true;
          this._editingId = null;
          this.render();
        }
      });
      editInput.addEventListener('blur', commit);
    }

    // Delete buttons
    root.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.deleteTask(btn.dataset.id);
      });
    });

    // Drag handles
    root.querySelectorAll('[data-drag]').forEach((handle) => {
      handle.addEventListener('pointerdown', (ev) => {
        const row = handle.closest('.task-row');
        if (row) this.startDrag(ev, row, handle.dataset.drag);
      });
    });

    // Icon picker triggers
    root.querySelectorAll('[data-icon-trigger]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const kind = btn.dataset.iconTrigger;
        const id = btn.dataset.id || '';
        const same =
          this._pickerTarget &&
          this._pickerTarget.kind === kind &&
          (kind === 'new' || this._pickerTarget.id === id);
        this._iconSearch = '';
        this._pickerTarget = same ? null : (kind === 'new' ? { kind: 'new' } : { kind: 'task', id });
        this.render();
      });
    });

    // Helper to bind icon choice buttons inside popover
    const bindIconChoices = (scope) => {
      scope.querySelectorAll('[data-pick-icon]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const chosen = btn.dataset.pickIcon || '';
          this._iconSearch = '';
          if (this._pickerTarget?.kind === 'new') {
            this._newTaskIcon = chosen;
            this._pickerTarget = null;
            this.render();
          } else if (this._pickerTarget?.kind === 'task') {
            this.updateTaskIcon(this._pickerTarget.id, chosen);
          }
        });
      });
    };
    bindIconChoices(root);

    // Live icon search in popover
    const iconSearchInput = root.querySelector('.icon-search-input');
    const iconScroll = root.querySelector('.icon-scroll');
    if (iconSearchInput && iconScroll) {
      iconSearchInput.focus();
      iconSearchInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
          ev.stopPropagation();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          this._pickerTarget = null;
          this._iconSearch = '';
          this.render();
        }
      });
      iconSearchInput.addEventListener('input', () => {
        this._iconSearch = iconSearchInput.value;
        const currentIcon = this._pickerTarget?.kind === 'new'
          ? this._newTaskIcon
          : (this._tasks.find((t) => t.id === this._pickerTarget?.id)?.icon || '');
        iconScroll.innerHTML = this.renderIconResultsHtml(this._iconSearch, currentIcon);
        bindIconChoices(iconScroll);
      });
    }

    // Add task form
    const addForm = root.querySelector('.add-bar');
    const addInput = root.querySelector('.add-input');
    if (addInput) {
      addInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
          ev.stopPropagation();
        }
      });
      addInput.addEventListener('input', () => {
        this._newTaskDraft = addInput.value;
      });
    }
    if (addForm && addInput) {
      addForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        this.addTask(addInput.value, this._newTaskIcon);
      });
    }
  }
}

if (!customElements.get('tw-addon-task-list')) {
  customElements.define('tw-addon-task-list', TwAddonTaskList);
}
