<script lang="ts">
  import { getAddonIconPacks, listAvailableIcons } from '../lib/icons';
  import Icon from './Icon.svelte';

  let {
    value = '',
    compact = false,
    onSelect
  }: {
    value?: string | null;
    compact?: boolean;
    onSelect: (refId: string) => void;
  } = $props();

  let search = $state('');
  let activePack = $state<string>('all');

  const mdiIcons = listAvailableIcons().map((name) => ({
    refId: name,
    label: name,
    packId: 'mdi'
  }));

  const addonPacks = getAddonIconPacks();

  const allItems = [
    ...mdiIcons,
    ...addonPacks.flatMap((p) =>
      p.icons.map((ic) => ({
        refId: ic.refId,
        label: ic.label || ic.name,
        packId: p.packId
      }))
    )
  ];

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return allItems
      .filter((item) => {
        if (activePack !== 'all' && item.packId !== activePack) return false;
        if (!q) return true;
        return item.label.toLowerCase().includes(q) || item.refId.toLowerCase().includes(q);
      })
      .slice(0, compact ? 28 : 48);
  });
</script>

<div class="icon-picker-wrap">
  <div class="picker-top">
    <input
      type="text"
      bind:value={search}
      placeholder="Search icons (e.g. christmas, tree, home, clock)..."
      aria-label="Search icons"
    />
  </div>

  {#if addonPacks.length > 0}
    <div class="pack-chips">
      <button type="button" class="chip" class:active={activePack === 'all'} onclick={() => (activePack = 'all')}>
        All
      </button>
      <button type="button" class="chip" class:active={activePack === 'mdi'} onclick={() => (activePack = 'mdi')}>
        MDI
      </button>
      {#each addonPacks as p (p.packId)}
        <button
          type="button"
          class="chip"
          class:active={activePack === p.packId}
          onclick={() => (activePack = p.packId)}
        >
          {p.packName}
        </button>
      {/each}
    </div>
  {/if}

  <div class="icon-grid">
    {#each filtered as item (item.refId)}
      <button
        type="button"
        class="icon-opt"
        class:selected={value === item.refId}
        title={item.label}
        aria-label={item.label}
        onclick={() => onSelect(item.refId)}
      >
        <Icon name={item.refId} size={22} />
      </button>
    {/each}
  </div>
</div>

<style>
  .icon-picker-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .picker-top input {
    width: 100%;
  }
  .pack-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    min-height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 0.78rem;
    background: var(--tw-surface-elevated);
  }
  .chip.active {
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
    border-color: transparent;
  }
  .icon-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .icon-opt {
    min-width: 40px;
    min-height: 40px;
    padding: 4px;
    background: var(--tw-surface-elevated);
  }
  .icon-opt.selected {
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
    border-color: transparent;
  }
</style>
