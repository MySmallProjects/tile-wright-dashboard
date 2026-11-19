<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { GridStack } from 'gridstack';
  import 'gridstack/dist/gridstack.min.css';
  import { api } from '../lib/api';
  import type { DashboardDetail, TileLayoutItem, UserSettings } from '../types';
  import Icon from './Icon.svelte';

  let {
    dashboard,
    userSettings,
    editMode = false,
    onEnterEdit,
    onExitEdit,
    onDashboardChanged,
    onNotify
  }: {
    dashboard: DashboardDetail;
    userSettings: UserSettings;
    editMode: boolean;
    onEnterEdit: () => void;
    onExitEdit: () => void;
    onDashboardChanged: (updated: DashboardDetail) => void;
    onNotify: (msg: string) => void;
  } = $props();

  let stageEl: HTMLDivElement | undefined = $state();
  let gridOuterEl: HTMLDivElement | undefined = $state();
  let gridEl: HTMLDivElement | undefined = $state();

  let grid: GridStack | null = null;
  let currentBaseCols = $state(8);
  let workingTiles = $state<TileLayoutItem[]>([]);
  let editSnapshot: TileLayoutItem[] | null = null;
  let saving = $state(false);
  let resizeTimer: number | null = null;

  const clone = <T>(val: T): T => structuredClone($state.snapshot(val)) as T;

  // Sync workingTiles when dashboard changes outside edit mode
  $effect(() => {
    const incoming = dashboard.tiles;
    if (!editMode) {
      workingTiles = clone(incoming);
    }
  });

  // Snapshot on entering edit mode
  $effect(() => {
    if (editMode && !editSnapshot) {
      editSnapshot = clone(workingTiles);
    } else if (!editMode) {
      editSnapshot = null;
    }
  });

  // Remount grid ONLY when explicit layout dependencies change (untrack prevents tileData saves from remounting DOM)
  $effect(() => {
    void dashboard.summary.id;
    void editMode;
    void userSettings.gridColumnWidth;
    void userSettings.gridCellHeight;
    void userSettings.gridGap;
    void userSettings.autoArrange;
    void userSettings.resizeSnapping;
    void userSettings.moveSnapping;
    if (gridEl && stageEl && gridOuterEl) {
      untrack(() => mountGrid());
    }
  });

  function computeColumns() {
    const avail = Math.max(280, (stageEl?.clientWidth ?? window.innerWidth) - 24);
    const colW = Math.max(48, userSettings.gridColumnWidth || 64);
    const logical = Math.max(2, Math.floor(avail / colW));
    const baseCols = logical * 2;
    return { logicalCols: logical, baseCols, widthPx: logical * colW };
  }

  function snapWidth(w: number, maxCols: number): number {
    if (!userSettings.resizeSnapping) return Math.max(1, Math.min(w, maxCols));
    if (w <= 1) return 1;
    const snapped = Math.max(2, Math.round(w / 2) * 2);
    return Math.min(snapped, maxCols);
  }

  function snapX(x: number, w: number, maxCols: number): number {
    if (!userSettings.moveSnapping) return Math.max(0, Math.min(x, maxCols - w));
    if (w >= 2) {
      const snapped = Math.round(x / 2) * 2;
      return Math.max(0, Math.min(snapped, maxCols - w));
    }
    return Math.max(0, Math.min(x, maxCols - w));
  }

  function syncFromGridToWorking() {
    if (!grid) return;
    const byId = new Map(workingTiles.map((t) => [t.id, t]));
    for (const n of grid.engine.nodes) {
      const id = (n.el as HTMLElement | undefined)?.dataset?.tileId;
      if (!id) continue;
      const tile = byId.get(id);
      if (!tile) continue;
      tile.w = n.w ?? 1;
      tile.h = n.h ?? 1;
      if (!tile.pinned || tile.x + tile.w <= currentBaseCols) {
        tile.x = n.x ?? 0;
        tile.y = n.y ?? 0;
      }
    }
    const sorted = [...workingTiles].sort((a, b) => a.y - b.y || a.x - b.x);
    sorted.forEach((t, i) => {
      t.order = i;
    });
  }

  function buildTileDom(tile: TileLayoutItem): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'grid-stack-item';
    item.dataset.tileId = tile.id;
    item.dataset.pinned = String(Boolean(tile.pinned));

    const content = document.createElement('div');
    content.className = 'grid-stack-item-content';

    const toolbar = document.createElement('div');
    toolbar.className = 'tile-toolbar';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tile-toolbar-title';
    titleSpan.textContent = tile.type === 'clock' ? 'Clock' : tile.type === 'note' ? 'Note' : tile.type;

    const actions = document.createElement('div');
    actions.className = 'tile-toolbar-actions';

    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.title = tile.pinned ? 'Unpin tile' : 'Pin tile';
    pinBtn.textContent = tile.pinned ? 'Pinned' : 'Pin';
    if (tile.pinned) pinBtn.classList.add('active-pin');
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      syncFromGridToWorking();
      const target = workingTiles.find((t) => t.id === tile.id);
      if (target) {
        target.pinned = !target.pinned;
        mountGrid();
      }
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.title = 'Delete tile';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.confirm(`Delete this ${tile.type} tile?`)) {
        syncFromGridToWorking();
        workingTiles = workingTiles.filter((t) => t.id !== tile.id);
        mountGrid();
      }
    });

    actions.appendChild(pinBtn);
    actions.appendChild(delBtn);
    toolbar.appendChild(titleSpan);
    toolbar.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'tile-body';

    const tagName = tile.type === 'clock' ? 'tw-clock-tile' : 'tw-note-tile';
    const wc = document.createElement(tagName) as HTMLElement & {
      settings?: Record<string, unknown>;
      data?: Record<string, unknown>;
    };
    wc.settings = dashboard.tileSettings[tile.id] ?? {};
    wc.data = dashboard.tileData[tile.id] ?? {};
    wc.addEventListener('tile-data-changed', async (ev: Event) => {
      const detail = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (!detail) return;
      try {
        await api.saveTileData(dashboard.summary.id, tile.id, detail);
        dashboard.tileData[tile.id] = detail;
      } catch {
        onNotify('Failed to save tile data.');
      }
    });

    body.appendChild(wc);
    content.appendChild(toolbar);
    content.appendChild(body);
    item.appendChild(content);
    return item;
  }

  function mountGrid() {
    if (!gridEl || !gridOuterEl) return;
    if (grid) {
      grid.destroy(false);
      grid = null;
    }
    gridEl.innerHTML = '';

    const { baseCols, widthPx } = computeColumns();
    currentBaseCols = baseCols;
    gridOuterEl.style.width = `${widthPx}px`;
    gridOuterEl.style.maxWidth = '100%';

    // Winning Lab Variation C: Free-Placement Canvas ('float' when Auto-arrange is off, 'compact' when on)
    const g = GridStack.init(
      {
        column: baseCols,
        cellHeight: Math.max(32, userSettings.gridCellHeight || 64),
        margin: Math.round((userSettings.gridGap ?? 10) / 2),
        mode: userSettings.autoArrange ? 'compact' : 'float',
        animate: true,
        staticGrid: !editMode,
        disableDrag: !editMode,
        disableResize: !editMode,
        handle: '.tile-toolbar',
        alwaysShowResizeHandle: editMode,
        resizable: { handles: 'se, sw' }
      },
      gridEl
    );
    if (!g) return;
    grid = g;

    g.batchUpdate();
    for (const tile of workingTiles) {
      const clampedW = Math.min(tile.w || 2, baseCols);
      const dom = buildTileDom(tile);
      const hasCoords = tile.x >= 0 && tile.y >= 0;
      g.makeWidget(dom, {
        w: clampedW,
        h: Math.max(1, tile.h || 2),
        x: hasCoords ? Math.min(tile.x, Math.max(0, baseCols - clampedW)) : undefined,
        y: hasCoords ? tile.y : undefined,
        autoPosition: !hasCoords,
        minW: 1,
        minH: 1,
        maxW: baseCols
      });
    }
    g.batchUpdate(false);

    if (userSettings.autoArrange) {
      g.compact('compact');
    }

    syncFromGridToWorking();

    g.on('change', () => syncFromGridToWorking());

    g.on('dragstop', (_ev: Event, itemEl: HTMLElement) => {
      const node = (itemEl as HTMLElement & { gridstackNode?: { x?: number; w?: number } }).gridstackNode;
      if (!node) return;
      const nx = snapX(node.x ?? 0, node.w ?? 1, currentBaseCols);
      if (nx !== node.x) g.update(itemEl, { x: nx });
      if (userSettings.autoArrange) g.compact('compact');
      syncFromGridToWorking();
    });

    g.on('resizestop', (_ev: Event, itemEl: HTMLElement) => {
      const node = (itemEl as HTMLElement & { gridstackNode?: { x?: number; w?: number } }).gridstackNode;
      if (!node) return;
      const nw = snapWidth(node.w ?? 1, currentBaseCols);
      const nx = snapX(node.x ?? 0, nw, currentBaseCols);
      if (nw !== node.w || nx !== node.x) g.update(itemEl, { w: nw, x: nx });
      if (userSettings.autoArrange) g.compact('compact');
      syncFromGridToWorking();
    });
  }

  function addStarterTile(type: 'clock' | 'note') {
    syncFromGridToWorking();
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const w = type === 'clock' ? Math.min(6, currentBaseCols) : Math.min(4, currentBaseCols);
    const h = type === 'clock' ? 2 : 3;
    workingTiles = [
      ...workingTiles,
      { id, type, x: -1, y: -1, w, h, pinned: false, order: workingTiles.length }
    ];
    mountGrid();
  }

  async function handleDone() {
    syncFromGridToWorking();
    saving = true;
    try {
      const saved = await api.saveLayout(dashboard.summary.id, clone(workingTiles));
      editSnapshot = null;
      onDashboardChanged({ ...dashboard, tiles: saved });
      onExitEdit();
      onNotify('Dashboard layout saved.');
    } catch {
      onNotify('Failed to save layout.');
    } finally {
      saving = false;
    }
  }

  function handleCancel() {
    if (editSnapshot) {
      workingTiles = clone(editSnapshot);
    }
    editSnapshot = null;
    onExitEdit();
    onNotify('Layout changes reverted.');
  }

  onMount(() => {
    const onResize = () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        syncFromGridToWorking();
        mountGrid();
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  onDestroy(() => {
    if (grid) {
      grid.destroy(false);
      grid = null;
    }
  });
</script>

<div class="grid-wrapper" class:is-edit-mode={editMode}>
  {#if editMode}
    <div class="edit-bar">
      <div class="edit-left">
        <strong>Editing "{dashboard.summary.name}"</strong>
        <span class="edit-hint">Drag headers to move · Drag corners to resize</span>
      </div>
      <div class="edit-actions">
        <button type="button" onclick={() => addStarterTile('clock')}>
          <Icon name="clock-outline" size={18} /> + Clock
        </button>
        <button type="button" onclick={() => addStarterTile('note')}>
          <Icon name="note-text-outline" size={18} /> + Note
        </button>
        <button type="button" onclick={handleCancel} disabled={saving}>Cancel</button>
        <button type="button" class="primary" onclick={handleDone} disabled={saving}>
          <Icon name="check" size={18} /> {saving ? 'Saving...' : 'Done'}
        </button>
      </div>
    </div>
  {/if}

  <div class="stage" bind:this={stageEl}>
    {#if workingTiles.length === 0 && !editMode}
      <div class="empty-prompt card">
        <Icon name="view-dashboard" size={40} />
        <h2>This dashboard is empty</h2>
        <p class="muted">Enter Edit Mode to add your first tiles.</p>
        <button type="button" class="primary" onclick={onEnterEdit}>
          <Icon name="plus" size={20} /> Add Tiles
        </button>
      </div>
    {/if}

    <div class="grid-outer" bind:this={gridOuterEl}>
      <div class="grid-stack" bind:this={gridEl}></div>
    </div>
  </div>
</div>

<style>
  .grid-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .edit-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 16px;
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
    flex-wrap: wrap;
  }
  .edit-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .edit-hint {
    font-size: 0.84rem;
    opacity: 0.9;
  }
  .edit-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .edit-actions button {
    min-height: 36px;
  }
  .stage {
    flex: 1;
    padding: 16px 12px 48px;
  }
  .grid-outer {
    margin: 0 auto;
  }
  .empty-prompt {
    max-width: 380px;
    margin: 48px auto;
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
  }
  .empty-prompt h2 {
    margin: 4px 0 0;
    font-size: 1.2rem;
  }
  .empty-prompt p {
    margin: 0 0 8px;
  }
</style>
