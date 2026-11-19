import '../components/tw-clock-tile.js';
import '../components/tw-sample-tile.js';

const VARIATION_INFO = {
  A: 'Fixed-width columns centred in leftover space. Base cell = 0.5 col; column count adapts to viewport width. Pinned tiles fall back to flow if too narrow.',
  B: 'Fluid full-width grid with fixed column counts per screen breakpoint (phone 2, tablet portrait 4, tablet landscape 6, desktop 8 logical cols).',
  C: 'Free-placement canvas (float: true when Auto-arrange is off). Tiles stay where dropped with gaps preserved.',
  D: 'Strict ordered flow list for unpinned tiles; pinned tiles claim fixed (x, y) slots that flowing tiles wrap around.'
};

// Initial 3 mock dashboards (base cell = 0.5 logical column; w=2 is 1 logical column)
const INITIAL_DASHBOARDS = [
  {
    id: 'home',
    name: 'Home',
    tiles: [
      { id: 't1', type: 'clock', title: 'Clock', w: 4, h: 1, x: 0, y: 0, pinned: true, order: 0, settings: { hourFormat: '24', dateFormat: 'dddd dd MMM yyyy', showSeconds: false } },
      { id: 't2', type: 'sample', title: 'Living Room', w: 2, h: 1, x: 4, y: 0, pinned: false, order: 1, settings: { kind: 'sensor', title: 'Living Room', value: '21.4 °C', subtitle: '48% humidity', state: 'normal' } },
      { id: 't3', type: 'sample', title: 'Kitchen Light', w: 2, h: 1, x: 6, y: 0, pinned: false, order: 2, settings: { kind: 'toggle', title: 'Kitchen Light', on: true, subtitle: 'Ceiling pendant' } },
      { id: 't4', type: 'sample', title: 'Front Door', w: 1, h: 1, x: 0, y: 1, pinned: false, order: 3, settings: { kind: 'sensor', title: 'Front Door', value: 'Closed', subtitle: 'Locked', state: 'normal' } },
      { id: 't5', type: 'sample', title: 'Shopping', w: 3, h: 2, x: 1, y: 1, pinned: false, order: 4, settings: { kind: 'note', title: 'Shopping List', value: '• Milk\n• Coffee beans\n• AA batteries', subtitle: 'Tap Edit to reposition' } },
      { id: 't6', type: 'sample', title: 'Quick Links', w: 2, h: 2, x: 4, y: 1, pinned: false, order: 5, settings: { kind: 'links', title: 'Home Services', links: ['Home Assistant', 'Router Admin', 'NAS'] } }
    ]
  },
  {
    id: 'energy',
    name: 'Energy & Air',
    tiles: [
      { id: 'e1', type: 'sample', title: 'Grid Power', w: 2, h: 1, x: 0, y: 0, pinned: true, order: 0, settings: { kind: 'sensor', title: 'Grid Draw', value: '2.4 kW', subtitle: 'Warning > 2.0 kW', state: 'warning' } },
      { id: 'e2', type: 'sample', title: 'Solar', w: 2, h: 1, x: 2, y: 0, pinned: false, order: 1, settings: { kind: 'sensor', title: 'Solar Gen', value: '3.8 kW', subtitle: 'Peak today 4.1 kW', state: 'normal' } },
      { id: 'e3', type: 'sample', title: 'Air Quality', w: 2, h: 1, x: 4, y: 0, pinned: false, order: 2, settings: { kind: 'sensor', title: 'Study CO₂', value: '1,240 ppm', subtitle: 'Critical > 1,000', state: 'critical' } },
      { id: 'e4', type: 'sample', title: 'Desk Lamp', w: 2, h: 1, x: 0, y: 1, pinned: false, order: 3, settings: { kind: 'toggle', title: 'Office Fan', on: false, subtitle: 'Auto ventilation' } }
    ]
  },
  {
    id: 'media',
    name: 'Media & Room',
    tiles: [
      { id: 'm1', type: 'clock', title: 'Wall Clock', w: 4, h: 1, x: 0, y: 0, pinned: false, order: 0, settings: { hourFormat: '12', dateFormat: 'ddd, dd MMM', showSeconds: true } },
      { id: 'm2', type: 'sample', title: 'Living TV', w: 2, h: 1, x: 0, y: 1, pinned: false, order: 1, settings: { kind: 'toggle', title: 'Living Room TV', on: false, subtitle: 'HDMI 1' } },
      { id: 'm3', type: 'sample', title: 'Movie Night', w: 2, h: 1, x: 2, y: 1, pinned: false, order: 2, settings: { kind: 'toggle', title: 'Movie Scene', on: true, subtitle: 'Dim lights 20%' } },
      { id: 'm4', type: 'sample', title: 'Reminders', w: 4, h: 1, x: 0, y: 2, pinned: false, order: 3, settings: { kind: 'note', title: 'Weekend Plan', value: 'Bin collection is Thursday morning.', subtitle: 'Pinned note' } }
    ]
  }
];

const state = {
  dashboards: structuredClone(INITIAL_DASHBOARDS),
  currentIndex: 0,
  variation: 'A',
  colWidth: 200,
  cellHeight: 110,
  gap: 12,
  moveSnap: true,
  resizeSnap: true,
  autoArrange: false,
  editMode: false,
  editSnapshot: null,
  theme: 'light',
  bgMode: 'image',
  dim: 25,
  tileOpacity: 88,
  blur: false,
  tileBorder: true,
  tileCounter: 100
};

let grid = null;
let currentBaseCols = 8;
let toastTimer = null;

// DOM refs
const el = {
  appShell: document.getElementById('appShell'),
  bgLayer: document.getElementById('bgLayer'),
  bgDim: document.getElementById('bgDim'),
  dashboardTitle: document.getElementById('dashboardTitle'),
  gridMeta: document.getElementById('gridMeta'),
  toggleControlsBtn: document.getElementById('toggleControlsBtn'),
  controlsPanel: document.getElementById('controlsPanel'),
  themeBtn: document.getElementById('themeBtn'),
  editModeBtn: document.getElementById('editModeBtn'),
  addDefaultTileBtn: document.getElementById('addDefaultTileBtn'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  doneEditBtn: document.getElementById('doneEditBtn'),
  variationSelect: document.getElementById('variationSelect'),
  variationDesc: document.getElementById('variationDesc'),
  colWidthRange: document.getElementById('colWidthRange'),
  colWidthVal: document.getElementById('colWidthVal'),
  cellHeightRange: document.getElementById('cellHeightRange'),
  cellHeightVal: document.getElementById('cellHeightVal'),
  gapRange: document.getElementById('gapRange'),
  gapVal: document.getElementById('gapVal'),
  moveSnapChk: document.getElementById('moveSnapChk'),
  resizeSnapChk: document.getElementById('resizeSnapChk'),
  autoArrangeChk: document.getElementById('autoArrangeChk'),
  bgSelect: document.getElementById('bgSelect'),
  dimRange: document.getElementById('dimRange'),
  dimVal: document.getElementById('dimVal'),
  opacityRange: document.getElementById('opacityRange'),
  opacityVal: document.getElementById('opacityVal'),
  blurChk: document.getElementById('blurChk'),
  tileBorderChk: document.getElementById('tileBorderChk'),
  stage: document.getElementById('stage'),
  gridOuter: document.getElementById('gridOuter'),
  gridStack: document.getElementById('gridStack'),
  pageDots: document.getElementById('pageDots'),
  prevDashBtn: document.getElementById('prevDashBtn'),
  nextDashBtn: document.getElementById('nextDashBtn'),
  pagerHint: document.getElementById('pagerHint'),
  toast: document.getElementById('toast')
};

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

function currentDashboard() {
  return state.dashboards[state.currentIndex];
}

function computeColumns() {
  const avail = Math.max(280, el.stage.clientWidth - 24);

  if (state.variation === 'B') {
    let logical = 8;
    if (avail < 540) logical = 2;
    else if (avail < 900) logical = 4;
    else if (avail < 1280) logical = 6;
    return { logicalCols: logical, baseCols: logical * 2, widthCss: '100%', maxWidthCss: '1600px' };
  }

  // Variations A, C, D: fixed-width columns centred in leftover space
  const logical = Math.max(2, Math.floor(avail / state.colWidth));
  const baseCols = logical * 2;
  const exactWidth = logical * state.colWidth;
  return { logicalCols: logical, baseCols, widthCss: `${exactWidth}px`, maxWidthCss: '100%' };
}

function applyAppearance() {
  document.documentElement.setAttribute('data-theme', state.theme);
  el.themeBtn.textContent = state.theme === 'light' ? 'Dark Mode' : 'Light Mode';

  if (state.bgMode === 'image') {
    el.bgLayer.style.backgroundImage = 'url("assets/bg-sample.svg")';
    el.bgLayer.style.backgroundColor = 'var(--tw-bg)';
  } else if (state.bgMode === 'solid') {
    el.bgLayer.style.backgroundImage = 'none';
    el.bgLayer.style.backgroundColor = state.theme === 'light' ? '#cbd5e1' : '#111827';
  } else {
    el.bgLayer.style.backgroundImage = 'none';
    el.bgLayer.style.backgroundColor = 'var(--tw-bg)';
  }

  el.bgDim.style.background = `rgba(0, 0, 0, ${(state.dim / 100).toFixed(2)})`;
  document.documentElement.style.setProperty('--tw-tile-opacity', (state.tileOpacity / 100).toFixed(2));
  document.documentElement.style.setProperty('--tw-tile-blur', state.blur ? '12px' : '0px');
  document.documentElement.style.setProperty('--tw-tile-border', state.tileBorder ? '1px solid var(--tw-border)' : '1px solid transparent');
}

function buildTileDom(tile, fitsPinned) {
  const item = document.createElement('div');
  item.className = 'grid-stack-item';
  item.dataset.tileId = tile.id;
  item.dataset.pinned = String(Boolean(tile.pinned));

  const content = document.createElement('div');
  content.className = 'grid-stack-item-content';

  // Edit mode toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'tile-toolbar';

  const titleWrap = document.createElement('span');
  titleWrap.className = 'tile-toolbar-title';
  const titleSpan = document.createElement('span');
  titleSpan.textContent = tile.title;
  titleWrap.appendChild(titleSpan);

  if (tile.pinned) {
    const badge = document.createElement('span');
    badge.className = fitsPinned ? 'pin-badge' : 'pin-badge fallback';
    badge.textContent = fitsPinned ? 'Pinned' : 'Flow fallback';
    titleWrap.appendChild(badge);
  }

  const actions = document.createElement('div');
  actions.className = 'tile-toolbar-actions';

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.title = tile.pinned ? 'Unpin (return to flow)' : 'Pin to current position';
  pinBtn.textContent = tile.pinned ? '📌' : 'Pin';
  if (tile.pinned) pinBtn.classList.add('active-pin');
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePinTile(tile.id);
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.title = 'Delete tile';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.confirm(`Delete tile "${tile.title}"?`)) {
      deleteTile(tile.id);
    }
  });

  actions.appendChild(pinBtn);
  actions.appendChild(delBtn);
  toolbar.appendChild(titleWrap);
  toolbar.appendChild(actions);

  // Tile body hosting the Web Component
  const body = document.createElement('div');
  body.className = 'tile-body';

  const wc = document.createElement(tile.type === 'clock' ? 'tw-clock-tile' : 'tw-sample-tile');
  wc.settings = tile.settings;
  wc.context = {
    mode: state.editMode ? 'edit' : 'view',
    theme: state.theme,
    width: tile.w,
    height: tile.h
  };
  body.appendChild(wc);

  content.appendChild(toolbar);
  content.appendChild(body);
  item.appendChild(content);
  return item;
}

function syncFromGridToModel() {
  if (!grid) return;
  const dash = currentDashboard();
  const byId = new Map(dash.tiles.map((t) => [t.id, t]));
  const nodes = grid.engine.nodes;

  for (const n of nodes) {
    const id = n.el?.dataset?.tileId;
    const tile = byId.get(id);
    if (!tile) continue;
    tile.w = n.w ?? 1;
    tile.h = n.h ?? 1;
    // Only overwrite pinned coords if it actually fit the current column count
    if (!tile.pinned || !Number.isFinite(tile.x) || tile.x + tile.w <= currentBaseCols) {
      tile.x = n.x ?? 0;
      tile.y = n.y ?? 0;
    }
  }

  // Recompute flow order from visual reading order (top-to-bottom, left-to-right)
  const sorted = [...dash.tiles].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  sorted.forEach((t, idx) => { t.order = idx; });
}

function snapWidth(w, maxCols) {
  if (!state.resizeSnap) return Math.max(1, Math.min(w, maxCols));
  // Allow 0.5 col (1 base cell) or any whole column (2, 4, 6, 8, ... up to maxCols)
  if (w <= 1) return 1;
  const snapped = Math.max(2, Math.round(w / 2) * 2);
  return Math.min(snapped, maxCols);
}

function snapX(x, w, maxCols) {
  if (!state.moveSnap) return Math.max(0, Math.min(x, maxCols - w));
  // If tile is 1+ logical col wide (w >= 2), snap x to even base cells (logical column boundary)
  if (w >= 2) {
    const snapped = Math.round(x / 2) * 2;
    return Math.max(0, Math.min(snapped, maxCols - w));
  }
  return Math.max(0, Math.min(x, maxCols - w));
}

function mountGrid() {
  if (grid) {
    grid.destroy(false);
    grid = null;
  }
  el.gridStack.innerHTML = '';

  const { logicalCols, baseCols, widthCss, maxWidthCss } = computeColumns();
  currentBaseCols = baseCols;

  el.gridOuter.style.width = widthCss;
  el.gridOuter.style.maxWidth = maxWidthCss;

  const isFloat = state.variation === 'C' && !state.autoArrange;

  grid = GridStack.init({
    column: baseCols,
    cellHeight: state.cellHeight,
    margin: Math.round(state.gap / 2),
    float: isFloat,
    animate: true,
    staticGrid: !state.editMode,
    handle: '.tile-toolbar',
    alwaysShowResizeHandle: true,
    resizable: { handles: 'se, sw' }
  }, el.gridStack);

  const dash = currentDashboard();
  const tiles = [...dash.tiles];

  // For Variation D (strict flow + pinned), place pinned tiles first, then flowing tiles in strict order
  const pinnedTiles = tiles.filter((t) => t.pinned);
  const flowTiles = tiles.filter((t) => !t.pinned).sort((a, b) => a.order - b.order);

  const orderedToAdd = state.variation === 'D' ? [...pinnedTiles, ...flowTiles] : tiles.sort((a, b) => a.order - b.order);

  grid.batchUpdate();
  for (const tile of orderedToAdd) {
    const clampedW = Math.min(tile.w, baseCols);
    const hasCoords = Number.isFinite(tile.x) && Number.isFinite(tile.y);
    const fitsPinned = tile.pinned && hasCoords && (tile.x + clampedW <= baseCols);
    const dom = buildTileDom(tile, fitsPinned);

    const widgetOpts = {
      w: clampedW,
      h: tile.h,
      minW: 1,
      minH: 1,
      maxW: baseCols,
      locked: state.variation === 'D' && fitsPinned && !state.editMode
    };

    if (!hasCoords) {
      widgetOpts.autoPosition = true;
    } else if (fitsPinned || state.variation === 'C') {
      widgetOpts.x = Math.min(tile.x, Math.max(0, baseCols - clampedW));
      widgetOpts.y = tile.y;
      widgetOpts.autoPosition = false;
    } else if (state.variation === 'D') {
      widgetOpts.autoPosition = true;
    } else {
      widgetOpts.x = Math.min(tile.x, Math.max(0, baseCols - clampedW));
      widgetOpts.y = tile.y;
      widgetOpts.autoPosition = false;
    }

    grid.makeWidget(dom, widgetOpts);
  }
  grid.batchUpdate(false);

  if (state.autoArrange) {
    grid.compact('compact');
  } else if (state.variation === 'D') {
    grid.compact('list');
  }

  // Capture any auto-positioned coordinates into the model immediately
  syncFromGridToModel();

  // Snap & sync handlers
  grid.on('change', () => {
    syncFromGridToModel();
  });

  grid.on('dragstop', (_ev, itemEl) => {
    const node = itemEl.gridstackNode;
    if (!node) return;
    const nx = snapX(node.x, node.w, currentBaseCols);
    if (nx !== node.x) {
      grid.update(itemEl, { x: nx });
    }
    if (state.autoArrange) {
      grid.compact('compact');
    } else if (state.variation === 'D') {
      grid.compact('list');
    }
    syncFromGridToModel();
  });

  grid.on('resizestop', (_ev, itemEl) => {
    const node = itemEl.gridstackNode;
    if (!node) return;
    const nw = snapWidth(node.w, currentBaseCols);
    const nx = snapX(node.x, nw, currentBaseCols);
    if (nw !== node.w || nx !== node.x) {
      grid.update(itemEl, { w: nw, x: nx });
    }
    if (state.autoArrange) {
      grid.compact('compact');
    }
    syncFromGridToModel();
  });

  el.dashboardTitle.textContent = dash.name;
  el.gridMeta.textContent = `Var ${state.variation} · ${logicalCols} cols (${baseCols} base) · ${dash.tiles.length} tiles`;
  el.variationDesc.textContent = VARIATION_INFO[state.variation];
  renderPager();
}

function renderPager() {
  el.pageDots.innerHTML = '';
  state.dashboards.forEach((d, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-dot' + (idx === state.currentIndex ? ' active' : '');
    btn.title = d.name;
    btn.setAttribute('aria-label', `Switch to ${d.name}`);
    btn.addEventListener('click', () => switchDashboard(idx));
    el.pageDots.appendChild(btn);
  });
  el.pagerHint.textContent = state.editMode ? 'Swipe locked in edit mode' : 'Swipe or ← → to switch';
}

function switchDashboard(nextIndex) {
  if (state.editMode) {
    showToast('Finish or cancel Edit Mode before switching dashboards.');
    return;
  }
  const len = state.dashboards.length;
  const wrapped = ((nextIndex % len) + len) % len;
  if (wrapped === state.currentIndex) return;
  state.currentIndex = wrapped;
  mountGrid();
  showToast(`Dashboard: ${currentDashboard().name}`);
}

function enterEditMode() {
  state.editSnapshot = structuredClone(currentDashboard().tiles);
  state.editMode = true;
  el.appShell.classList.add('is-edit-mode');
  el.editModeBtn.style.display = 'none';
  mountGrid();
}

function exitEditMode(save) {
  if (save) {
    syncFromGridToModel();
    showToast('Layout saved.');
  } else if (state.editSnapshot) {
    currentDashboard().tiles = state.editSnapshot;
    showToast('Layout changes reverted.');
  }
  state.editSnapshot = null;
  state.editMode = false;
  el.appShell.classList.remove('is-edit-mode');
  el.editModeBtn.style.display = '';
  mountGrid();
}

function togglePinTile(tileId) {
  syncFromGridToModel();
  const tile = currentDashboard().tiles.find((t) => t.id === tileId);
  if (!tile) return;
  tile.pinned = !tile.pinned;
  mountGrid();
  showToast(tile.pinned ? `"${tile.title}" pinned` : `"${tile.title}" set to flow`);
}

function deleteTile(tileId) {
  syncFromGridToModel();
  const dash = currentDashboard();
  dash.tiles = dash.tiles.filter((t) => t.id !== tileId);
  mountGrid();
  showToast('Tile deleted');
}

function addPresetTile(preset) {
  if (!state.editMode) {
    enterEditMode();
  }
  syncFromGridToModel();
  state.tileCounter += 1;
  const sizes = {
    default: { w: 2, h: 1, label: 'Default Tile (1×1)' },
    half:    { w: 1, h: 1, label: 'Half Tile (0.5×1)' },
    wide:    { w: 4, h: 1, label: 'Wide Tile (2×1)' },
    large:   { w: 4, h: 2, label: 'Large Tile (2×2)' }
  };
  const cfg = sizes[preset] || sizes.default;
  const dash = currentDashboard();
  dash.tiles.push({
    id: `tile-${state.tileCounter}`,
    type: 'sample',
    title: `${cfg.label} #${state.tileCounter - 100}`,
    w: Math.min(cfg.w, currentBaseCols),
    h: cfg.h,
    x: null,
    y: null,
    pinned: false,
    order: dash.tiles.length,
    settings: {
      kind: 'default',
      title: cfg.label,
      value: `${cfg.w / 2} col × ${cfg.h}`,
      subtitle: 'Added in Layout Lab'
    }
  });
  mountGrid();
  showToast(`Added ${cfg.label}`);
}

// Swipe gesture handling (view mode only, strict horizontal threshold)
let touchStart = null;
el.stage.addEventListener('pointerdown', (e) => {
  if (state.editMode) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  touchStart = { x: e.clientX, y: e.clientY, time: Date.now() };
});

el.stage.addEventListener('pointerup', (e) => {
  if (state.editMode || !touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  const dt = Date.now() - touchStart.time;
  touchStart = null;

  if (dt < 600 && Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
    if (dx < 0) switchDashboard(state.currentIndex + 1);
    else switchDashboard(state.currentIndex - 1);
  }
});

// Keyboard Left/Right arrows in view mode
window.addEventListener('keydown', (e) => {
  if (state.editMode) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.key === 'ArrowRight') switchDashboard(state.currentIndex + 1);
  if (e.key === 'ArrowLeft') switchDashboard(state.currentIndex - 1);
});

// Listen for tile action events in view mode
el.gridStack.addEventListener('request-action', (e) => {
  const d = e.detail || {};
  showToast(`Tile action: ${d.title || d.action} → ${d.on ? 'ON' : 'OFF'}`);
});

// Wire controls
el.toggleControlsBtn.addEventListener('click', () => {
  const collapsed = el.controlsPanel.classList.toggle('collapsed');
  el.toggleControlsBtn.setAttribute('aria-expanded', String(!collapsed));
});

el.themeBtn.addEventListener('click', () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  applyAppearance();
});

el.editModeBtn.addEventListener('click', enterEditMode);
el.doneEditBtn.addEventListener('click', () => exitEditMode(true));
el.cancelEditBtn.addEventListener('click', () => exitEditMode(false));
el.addDefaultTileBtn.addEventListener('click', () => addPresetTile('default'));

el.prevDashBtn.addEventListener('click', () => switchDashboard(state.currentIndex - 1));
el.nextDashBtn.addEventListener('click', () => switchDashboard(state.currentIndex + 1));

el.variationSelect.addEventListener('change', () => {
  syncFromGridToModel();
  state.variation = el.variationSelect.value;
  mountGrid();
});

el.colWidthRange.addEventListener('input', () => {
  state.colWidth = Number(el.colWidthRange.value);
  el.colWidthVal.textContent = String(state.colWidth);
  mountGrid();
});

el.cellHeightRange.addEventListener('input', () => {
  state.cellHeight = Number(el.cellHeightRange.value);
  el.cellHeightVal.textContent = String(state.cellHeight);
  mountGrid();
});

el.gapRange.addEventListener('input', () => {
  state.gap = Number(el.gapRange.value);
  el.gapVal.textContent = String(state.gap);
  mountGrid();
});

el.moveSnapChk.addEventListener('change', () => {
  state.moveSnap = el.moveSnapChk.checked;
});

el.resizeSnapChk.addEventListener('change', () => {
  syncFromGridToModel();
  state.resizeSnap = el.resizeSnapChk.checked;
  mountGrid();
});

el.autoArrangeChk.addEventListener('change', () => {
  syncFromGridToModel();
  state.autoArrange = el.autoArrangeChk.checked;
  mountGrid();
});

document.querySelectorAll('[data-add-preset]').forEach((btn) => {
  btn.addEventListener('click', () => addPresetTile(btn.dataset.addPreset));
});

el.bgSelect.addEventListener('change', () => {
  state.bgMode = el.bgSelect.value;
  applyAppearance();
});

el.dimRange.addEventListener('input', () => {
  state.dim = Number(el.dimRange.value);
  el.dimVal.textContent = String(state.dim);
  applyAppearance();
});

el.opacityRange.addEventListener('input', () => {
  state.tileOpacity = Number(el.opacityRange.value);
  el.opacityVal.textContent = String(state.tileOpacity);
  applyAppearance();
});

el.blurChk.addEventListener('change', () => {
  state.blur = el.blurChk.checked;
  applyAppearance();
});

el.tileBorderChk.addEventListener('change', () => {
  state.tileBorder = el.tileBorderChk.checked;
  applyAppearance();
});

// Responsive re-layout on window resize (debounced)
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    syncFromGridToModel();
    mountGrid();
  }, 150);
});

// Initial boot
applyAppearance();
mountGrid();
