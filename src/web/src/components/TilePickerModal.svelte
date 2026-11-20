<script lang="ts">
  import type { AddonTile } from '../types';
  import Icon from './Icon.svelte';

  let {
    tiles,
    onPick,
    onClose
  }: {
    tiles: AddonTile[];
    onPick: (tile: AddonTile) => void;
    onClose: () => void;
  } = $props();

  let search = $state('');
  let selectedAddon = $state<string>('all');

  let addonChips = $derived.by(() => {
    const map = new Map<string, string>();
    for (const t of tiles) {
      map.set(t.addonId, t.addonName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  });

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return tiles.filter((t) => {
      if (selectedAddon !== 'all' && t.addonId !== selectedAddon) return false;
      if (!q) return true;
      return (
        t.spec.name.toLowerCase().includes(q) ||
        t.spec.description.toLowerCase().includes(q) ||
        t.addonName.toLowerCase().includes(q)
      );
    });
  });
</script>

<div class="picker-backdrop" role="dialog" aria-modal="true" aria-label="Add Tile">
  <div class="picker card">
    <header class="picker-header">
      <h2>Add Tile</h2>
      <button type="button" class="icon-btn ghost" onclick={onClose} aria-label="Close">
        <Icon name="close" size={22} />
      </button>
    </header>

    <div class="picker-filters">
      <input
        type="text"
        bind:value={search}
        placeholder="Search tiles..."
        aria-label="Search tiles"
      />
      <div class="chips">
        <button
          type="button"
          class="chip"
          class:active={selectedAddon === 'all'}
          onclick={() => (selectedAddon = 'all')}
        >
          All ({tiles.length})
        </button>
        {#each addonChips as chip (chip.id)}
          <button
            type="button"
            class="chip"
            class:active={selectedAddon === chip.id}
            onclick={() => (selectedAddon = chip.id)}
          >
            {chip.name}
          </button>
        {/each}
      </div>
    </div>

    <div class="picker-body">
      {#if filtered.length === 0}
        <p class="muted empty">No matching tiles found.</p>
      {:else}
        <div class="tile-grid">
          {#each filtered as tile (tile.tileTypeId)}
            <button type="button" class="tile-card" onclick={() => onPick(tile)}>
              <div class="tile-icon">
                <Icon name={tile.spec.icon || 'view-dashboard'} size={30} />
              </div>
              <div class="tile-name">{tile.spec.name}</div>
              <div class="tile-desc muted">{tile.spec.description}</div>
              <div class="tile-meta muted">
                <span>{tile.addonName}</span>
                <span>v{tile.addonVersion}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--tw-modal-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .picker {
    width: 100%;
    max-width: 780px;
    max-height: 88vh;
    background: var(--tw-surface-solid);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* Full-screen sheet on tablet/mobile viewports (§6.4) */
  @media (max-width: 820px) {
    .picker-backdrop {
      padding: 0;
    }
    .picker {
      max-width: 100%;
      max-height: 100vh;
      height: 100vh;
      border-radius: 0;
    }
  }
  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--tw-border);
  }
  .picker-header h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .picker-filters {
    padding: 12px 18px;
    border-bottom: 1px solid var(--tw-border);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 0.82rem;
    background: var(--tw-surface-elevated);
  }
  .chip.active {
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
    border-color: transparent;
  }
  .picker-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 18px;
  }
  .tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 12px;
  }
  .tile-card {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    padding: 14px;
    gap: 6px;
    background: var(--tw-surface-elevated);
    min-height: 132px;
  }
  .tile-card:hover {
    border-color: var(--tw-accent);
  }
  .tile-icon {
    color: var(--tw-accent);
  }
  .tile-name {
    font-weight: 700;
    font-size: 0.98rem;
  }
  .tile-desc {
    font-size: 0.82rem;
    line-height: 1.3;
    flex: 1;
  }
  .tile-meta {
    width: 100%;
    display: flex;
    justify-content: space-between;
    font-size: 0.74rem;
    margin-top: 4px;
  }
  .empty {
    text-align: center;
    padding: 32px 0;
  }
</style>
