<script lang="ts">
  import { tick } from 'svelte';
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

  let open = $state(false);
  let search = $state('');
  let activePack = $state<string>('all');
  let searchInput = $state<HTMLInputElement | null>(null);

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

  let selectedItem = $derived(
    value ? allItems.find((item) => item.refId === value) : undefined
  );

  let matching = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (activePack !== 'all' && item.packId !== activePack) return false;
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || item.refId.toLowerCase().includes(q);
    });
  });

  const MAX_UNFILTERED = 200;
  let isUnfilteredAll = $derived(activePack === 'all' && search.trim() === '');
  let filtered = $derived(
    isUnfilteredAll ? matching.slice(0, MAX_UNFILTERED) : matching
  );

  async function openPicker() {
    open = true;
    await tick();
    searchInput?.focus();
  }

  function closePicker() {
    open = false;
  }

  function chooseIcon(refId: string) {
    onSelect(refId);
    open = false;
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      closePicker();
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="icon-trigger-row" class:compact>
  <button
    type="button"
    class="icon-trigger"
    onclick={openPicker}
    aria-haspopup="dialog"
    aria-expanded={open}
    title={value ? `Change icon (${selectedItem?.label ?? value})` : 'Choose icon'}
  >
    <span class="icon-preview" class:empty={!value}>
      {#if value}
        <Icon name={value} size={compact ? 18 : 22} />
      {:else}
        <Icon name="image-outline" size={compact ? 16 : 18} />
      {/if}
    </span>
    <span class="icon-name">
      {value ? (selectedItem?.label ?? value) : 'Choose icon...'}
    </span>
    <span class="chevron" aria-hidden="true">▾</span>
  </button>

  {#if value}
    <button
      type="button"
      class="clear-btn"
      title="Clear icon"
      aria-label="Clear icon"
      onclick={() => onSelect('')}
    >
      ✕
    </button>
  {/if}
</div>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="icon-modal-backdrop" onclick={(e) => { if (e.target === e.currentTarget) closePicker(); }}>
    <div class="icon-modal" role="dialog" aria-modal="true" aria-label="Choose an icon">
      <div class="icon-modal-header">
        <h3>Choose Icon</h3>
        <button type="button" class="close-btn" aria-label="Close icon picker" onclick={closePicker}>✕</button>
      </div>

      <div class="icon-modal-body">
        <div class="picker-top">
          <input
            bind:this={searchInput}
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
          {#if filtered.length === 0}
            <div class="empty-msg">No icons match "{search.trim()}".</div>
          {:else}
            {#each filtered as item (item.refId)}
              <button
                type="button"
                class="icon-opt"
                class:selected={value === item.refId}
                title={item.label}
                aria-label={item.label}
                onclick={() => chooseIcon(item.refId)}
              >
                <Icon name={item.refId} size={22} />
              </button>
            {/each}
          {/if}
        </div>

        {#if isUnfilteredAll && matching.length > MAX_UNFILTERED}
          <div class="count-hint">
            Showing {MAX_UNFILTERED} of {matching.length} icons — search or pick a pack to see more.
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .icon-trigger-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
  }
  .icon-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 4px 10px 4px 6px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
    border-radius: 10px;
    color: var(--tw-text);
    cursor: pointer;
    max-width: 100%;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .icon-trigger-row.compact .icon-trigger {
    min-height: 34px;
    padding: 3px 8px 3px 5px;
  }
  .icon-trigger:hover {
    border-color: var(--tw-accent);
  }
  .icon-preview {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--tw-surface-solid);
    border: 1px solid var(--tw-border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--tw-accent);
  }
  .icon-trigger-row.compact .icon-preview {
    width: 24px;
    height: 24px;
  }
  .icon-preview.empty {
    color: var(--tw-text-muted);
    opacity: 0.65;
  }
  .icon-name {
    font-size: 0.86rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }
  .chevron {
    font-size: 0.75rem;
    color: var(--tw-text-muted);
    margin-left: 2px;
  }
  .clear-btn {
    min-width: 30px;
    min-height: 30px;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
    color: var(--tw-text-muted);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .clear-btn:hover {
    color: var(--tw-state-critical);
    border-color: var(--tw-state-critical);
  }

  .icon-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1100;
    background: var(--tw-modal-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .icon-modal {
    width: 100%;
    max-width: 520px;
    max-height: 82vh;
    background: var(--tw-surface-solid);
    border: var(--tw-tile-border);
    border-radius: var(--tw-tile-radius);
    box-shadow: var(--tw-tile-shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .icon-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--tw-border);
  }
  .icon-modal-header h3 {
    margin: 0;
    font-size: 1rem;
  }
  .close-btn {
    min-width: 32px;
    min-height: 32px;
    padding: 0;
    border-radius: 8px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--tw-text-muted);
    cursor: pointer;
  }
  .close-btn:hover {
    background: var(--tw-surface-elevated);
    color: var(--tw-text);
  }
  .icon-modal-body {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
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
    max-height: 320px;
    overflow-y: auto;
    padding: 2px;
  }
  .icon-opt {
    min-width: 40px;
    min-height: 40px;
    padding: 4px;
    background: var(--tw-surface-elevated);
  }
  .icon-opt:hover {
    border-color: var(--tw-accent);
  }
  .icon-opt.selected {
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
    border-color: transparent;
  }
  .empty-msg,
  .count-hint {
    font-size: 0.8rem;
    color: var(--tw-text-muted);
  }
</style>
