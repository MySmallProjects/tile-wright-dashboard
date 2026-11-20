<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { GridStack } from 'gridstack';
  import 'gridstack/dist/gridstack.min.css';
  import { api } from '../lib/api';
  import { ensureAddonScriptLoaded } from '../lib/addonLoader';
  import type {
    AddonOverview,
    AddonTile,
    DashboardDetail,
    TileLayoutItem,
    UserSettings
  } from '../types';
  import Icon from './Icon.svelte';
  import TilePickerModal from './TilePickerModal.svelte';
  import TileSettingsModal from './TileSettingsModal.svelte';

  // Built-in starter definitions (kept until Phase 6 replaces them with full standalone addons)
  const STARTER_TILES: AddonTile[] = [
    {
      addonId: 'starter',
      addonName: 'Built-in Starter',
      addonVersion: '0.1.0',
      tileTypeId: 'clock',
      spec: {
        id: 'clock',
        name: 'Clock',
        description: 'Live time and date with .NET format tokens.',
        icon: 'clock-outline',
        element: { tagName: 'tw-clock-tile', script: '' },
        defaultSize: { w: 6, h: 2 },
        minSize: { w: 2, h: 1 },
        maxSize: { w: 16, h: 6 },
        settingsSchema: [
          {
            key: 'hourFormat',
            label: 'Hour format',
            type: 'select',
            defaultValue: '24',
            options: [
              { value: '24', label: '24-hour' },
              { value: '12', label: '12-hour (AM/PM)' }
            ]
          },
          {
            key: 'dateFormat',
            label: 'Date format (.NET tokens)',
            type: 'text',
            defaultValue: 'dddd dd MMM yyyy',
            helpText: 'Example: dddd dd MMM yyyy → Thursday 19 Nov 2026'
          },
          { key: 'showSeconds', label: 'Show seconds', type: 'toggle', defaultValue: false }
        ]
      }
    },
    {
      addonId: 'starter',
      addonName: 'Built-in Starter',
      addonVersion: '0.1.0',
      tileTypeId: 'note',
      spec: {
        id: 'note',
        name: 'Note',
        description: 'Quick post-it text stored separately from layout.',
        icon: 'note-text-outline',
        element: { tagName: 'tw-note-tile', script: '' },
        defaultSize: { w: 4, h: 3 },
        minSize: { w: 2, h: 2 },
        maxSize: { w: 16, h: 12 },
        settingsSchema: []
      }
    }
  ];

  let {
    dashboard,
    userSettings,
    addonOverview,
    editMode = false,
    onEnterEdit,
    onExitEdit,
    onDashboardChanged,
    onNotify
  }: {
    dashboard: DashboardDetail;
    userSettings: UserSettings;
    addonOverview: AddonOverview;
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

  let showPicker = $state(false);
  let settingsTarget = $state<{ tileId: string; def: AddonTile } | null>(null);
  let savingTileSettings = $state(false);

  const clone = <T>(val: T): T => structuredClone($state.snapshot(val)) as T;

  let allPickerTiles = $derived.by(() => {
    const addonTiles = addonOverview.availableTiles ?? [];
    const existingIds = new Set(addonTiles.map((t) => t.tileTypeId));
    return [...addonTiles, ...STARTER_TILES.filter((s) => !existingIds.has(s.tileTypeId))];
  });

  function resolveTileDef(typeId: string): {
    def?: AddonTile;
    placeholder?: { title: string; detail: string };
  } {
    const found = allPickerTiles.find((t) => t.tileTypeId === typeId);
    if (found) return { def: found };

    // Check if it belongs to a known disabled or failed addon (addonId:tileId)
    const [addonId] = typeId.split(':');
    const addon = addonOverview.addons.find((a) => a.id === addonId);
    if (addon) {
      if (addon.state === 'disabled') {
        return {
          placeholder: {
            title: 'Addon disabled',
            detail: `"${addon.name}" is currently disabled. Re-enable it in Admin Settings to restore this tile.`
          }
        };
      }
      if (addon.state === 'failed') {
        return {
          placeholder: {
            title: 'Addon failed to load',
            detail: `"${addon.name}" failed: ${addon.error || 'Unknown error'}`
          }
        };
      }
    }

    return {
      placeholder: {
        title: 'Addon not installed',
        detail: `Tile type "${typeId}" is unavailable. Its settings and data have been preserved.`
      }
    };
  }

  $effect(() => {
    const incoming = dashboard.tiles;
    if (!editMode) {
      workingTiles = clone(incoming);
    }
  });

  $effect(() => {
    if (editMode && !editSnapshot) {
      editSnapshot = clone(workingTiles);
    } else if (!editMode) {
      editSnapshot = null;
    }
  });

  $effect(() => {
    void dashboard.summary.id;
    void editMode;
    void userSettings.gridColumnWidth;
    void userSettings.gridCellHeight;
    void userSettings.gridGap;
    void userSettings.autoArrange;
    void userSettings.resizeSnapping;
    void userSettings.moveSnapping;
    void addonOverview;
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

  function mountTileBody(body: HTMLDivElement, tile: TileLayoutItem, def: AddonTile) {
    const attach = () => {
      body.innerHTML = '';
      const wc = document.createElement(def.spec.element.tagName) as HTMLElement & {
        settings?: Record<string, unknown>;
        data?: Record<string, unknown>;
        context?: Record<string, unknown>;
      };
      wc.settings = dashboard.tileSettings[tile.id] ?? {};
      wc.data = dashboard.tileData[tile.id] ?? {};
      wc.context = {
        mode: editMode ? 'edit' : 'view',
        theme: document.documentElement.getAttribute('data-theme') || 'light',
        width: tile.w,
        height: tile.h,
        addonId: def.addonId,
        tileId: tile.id
      };

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

      wc.addEventListener('settings-changed', async (ev: Event) => {
        const detail = (ev as CustomEvent<Record<string, unknown>>).detail;
        if (!detail) return;
        try {
          const merged = { ...(dashboard.tileSettings[tile.id] ?? {}), ...detail };
          await api.saveTileSettings(dashboard.summary.id, tile.id, merged);
          dashboard.tileSettings[tile.id] = merged;
        } catch {
          onNotify('Failed to save tile settings.');
        }
      });

      wc.addEventListener('request-action', async (ev: Event) => {
        const detail = (ev as CustomEvent<{ action?: string; payload?: unknown }>).detail;
        if (!detail?.action || def.addonId === 'starter') return;
        try {
          await api.invokeAddonAction(def.addonId, detail.action, detail.payload);
        } catch {
          onNotify('Tile action failed.');
        }
      });

      body.appendChild(wc);
    };

    if (def.spec.element.script) {
      body.innerHTML = '<div class="tile-placeholder muted">Loading tile...</div>';
      void ensureAddonScriptLoaded(def.addonId, def.spec.element.script)
        .then(attach)
        .catch(() => {
          body.innerHTML = '<div class="tile-placeholder error-text">Failed to load tile script.</div>';
        });
    } else {
      attach();
    }
  }

  function buildTileDom(tile: TileLayoutItem): HTMLDivElement {
    const resolved = resolveTileDef(tile.type);
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
    titleSpan.textContent = resolved.def?.spec.name ?? tile.type;

    const actions = document.createElement('div');
    actions.className = 'tile-toolbar-actions';

    if (resolved.def) {
      const cfgBtn = document.createElement('button');
      cfgBtn.type = 'button';
      cfgBtn.title = 'Tile settings';
      cfgBtn.textContent = '⚙';
      cfgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsTarget = { tileId: tile.id, def: resolved.def! };
      });
      actions.appendChild(cfgBtn);
    }

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
      if (window.confirm(`Delete "${resolved.def?.spec.name ?? tile.type}" tile?`)) {
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

    if (resolved.def) {
      mountTileBody(body, tile, resolved.def);
    } else if (resolved.placeholder) {
      body.innerHTML = `
        <div class="tile-placeholder">
          <strong>${resolved.placeholder.title}</strong>
          <span class="muted">${resolved.placeholder.detail}</span>
        </div>
      `;
    }

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

  function handlePickTile(def: AddonTile) {
    showPicker = false;
    syncFromGridToWorking();
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const w = Math.min(def.spec.defaultSize?.w || 4, currentBaseCols);
    const h = Math.max(1, def.spec.defaultSize?.h || 2);
    workingTiles = [
      ...workingTiles,
      { id, type: def.tileTypeId, x: -1, y: -1, w, h, pinned: false, order: workingTiles.length }
    ];
    mountGrid();

    // Open tile settings immediately if it has a schema or custom settings element (§6.4)
    if (def.spec.settingsElement || (def.spec.settingsSchema && def.spec.settingsSchema.length > 0)) {
      settingsTarget = { tileId: id, def };
    }
  }

  async function handleSaveTileSettings(nextSettings: Record<string, unknown>) {
    if (!settingsTarget) return;
    savingTileSettings = true;
    try {
      const { tileId } = settingsTarget;
      await api.saveTileSettings(dashboard.summary.id, tileId, nextSettings);
      dashboard.tileSettings[tileId] = nextSettings;
      settingsTarget = null;
      mountGrid();
      onNotify('Tile settings saved.');
    } catch {
      onNotify('Failed to save tile settings.');
    } finally {
      savingTileSettings = false;
    }
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
        <button type="button" onclick={() => (showPicker = true)}>
          <Icon name="plus" size={18} /> Add Tile
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

{#if showPicker}
  <TilePickerModal
    tiles={allPickerTiles}
    onPick={handlePickTile}
    onClose={() => (showPicker = false)}
  />
{/if}

{#if settingsTarget}
  <TileSettingsModal
    tileDef={settingsTarget.def}
    currentSettings={dashboard.tileSettings[settingsTarget.tileId] ?? {}}
    saving={savingTileSettings}
    onSave={handleSaveTileSettings}
    onClose={() => (settingsTarget = null)}
  />
{/if}

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
  :global(.tile-placeholder) {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 14px;
    gap: 6px;
    font-size: 0.85rem;
  }
</style>
