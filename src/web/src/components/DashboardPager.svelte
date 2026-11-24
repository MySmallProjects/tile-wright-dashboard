<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { DashboardSummary } from '../types';
  import Icon from './Icon.svelte';

  let {
    dashboards,
    activeId,
    editMode = false,
    infiniteCycle = true,
    onSelect,
    extra
  }: {
    dashboards: DashboardSummary[];
    activeId: string | null;
    editMode?: boolean;
    infiniteCycle?: boolean;
    onSelect: (id: string) => void;
    extra?: Snippet;
  } = $props();

  let activeIndex = $derived(dashboards.findIndex((d) => d.id === activeId));
  let canPrev = $derived(infiniteCycle || activeIndex > 0);
  let canNext = $derived(infiniteCycle || (activeIndex >= 0 && activeIndex < dashboards.length - 1));

  function step(delta: number) {
    if (editMode || dashboards.length <= 1 || activeIndex < 0) return;
    if (infiniteCycle) {
      const next = (activeIndex + delta + dashboards.length) % dashboards.length;
      onSelect(dashboards[next].id);
    } else {
      const next = activeIndex + delta;
      if (next >= 0 && next < dashboards.length) {
        onSelect(dashboards[next].id);
      }
    }
  }
</script>

{#if dashboards.length > 1 && !editMode}
  <nav class="pager" aria-label="Dashboard pages">
    <button type="button" class="nav-btn" aria-label="Previous dashboard" disabled={!canPrev} onclick={() => step(-1)}>
      <Icon name="chevron-left" size={20} />
    </button>

    <div class="dots">
      {#each dashboards as dash (dash.id)}
        <button
          type="button"
          class="dot"
          class:active={dash.id === activeId}
          title={dash.name}
          aria-label={`Switch to ${dash.name}`}
          aria-current={dash.id === activeId ? 'page' : undefined}
          onclick={() => onSelect(dash.id)}
        ></button>
      {/each}
    </div>

    <button type="button" class="nav-btn" aria-label="Next dashboard" disabled={!canNext} onclick={() => step(1)}>
      <Icon name="chevron-right" size={20} />
    </button>

    {#if extra}
      {@render extra()}
    {/if}
  </nav>
{/if}

<style>
  .pager {
    position: fixed;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--tw-chrome-bg);
    border: 1px solid var(--tw-border);
    box-shadow: var(--tw-tile-shadow);
  }
  .nav-btn {
    min-width: 34px;
    min-height: 34px;
    padding: 0;
    border-radius: 999px;
    border-color: transparent;
    background: transparent;
  }
  .dots {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px;
  }
  .dot {
    width: 10px;
    height: 10px;
    min-height: 10px;
    padding: 0;
    border-radius: 999px;
    border: none;
    background: var(--tw-text-muted);
    opacity: 0.4;
    transition: width 0.16s ease, opacity 0.16s ease, background-color 0.16s ease;
  }
  .dot.active {
    width: 24px;
    background: var(--tw-accent);
    opacity: 1;
  }
</style>
