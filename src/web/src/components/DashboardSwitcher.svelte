<script lang="ts">
  import type { DashboardSummary } from '../types';
  import Icon from './Icon.svelte';

  let {
    dashboards,
    activeId,
    disabled = false,
    onSelect,
    onManage
  }: {
    dashboards: DashboardSummary[];
    activeId: string | null;
    disabled?: boolean;
    onSelect: (id: string) => void;
    onManage: () => void;
  } = $props();

  let open = $state(false);
  let active = $derived(dashboards.find((d) => d.id === activeId) ?? dashboards[0] ?? null);

  function toggle() {
    if (disabled) return;
    open = !open;
  }

  function pick(id: string) {
    open = false;
    if (id !== activeId) {
      onSelect(id);
    }
  }

  function openManager() {
    open = false;
    onManage();
  }
</script>

<div class="switcher">
  <button
    type="button"
    class="trigger"
    {disabled}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={toggle}
  >
    <Icon name={active?.icon || 'view-dashboard'} size={22} />
    <span class="name">{active?.name || 'Tilewright'}</span>
    <Icon name="chevron-down" size={18} />
  </button>

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={() => (open = false)}></div>
    <div class="menu card" role="menu">
      <div class="menu-list">
        {#each dashboards as dash (dash.id)}
          <button
            type="button"
            class="menu-item"
            class:active={dash.id === activeId}
            role="menuitem"
            onclick={() => pick(dash.id)}
          >
            <Icon name={dash.icon || 'view-dashboard'} size={20} />
            <span class="item-name">{dash.name}</span>
            {#if dash.id === activeId}
              <Icon name="check" size={18} />
            {/if}
          </button>
        {/each}
      </div>
      <div class="menu-footer">
        <button type="button" class="manage-btn" onclick={openManager}>
          <Icon name="cog" size={18} /> Manage Dashboards
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .switcher {
    position: relative;
  }
  .trigger {
    background: transparent;
    border-color: transparent;
    padding: 0 10px;
    font-weight: 700;
    font-size: 1.02rem;
  }
  .trigger:hover:not(:disabled) {
    background: var(--tw-surface-elevated);
    border-color: var(--tw-border);
  }
  .name {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 25;
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 30;
    min-width: 240px;
    max-width: 320px;
    background: var(--tw-surface-solid);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .menu-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 55vh;
    overflow-y: auto;
  }
  .menu-item {
    justify-content: flex-start;
    background: transparent;
    border-color: transparent;
    padding: 0 12px;
    width: 100%;
  }
  .menu-item:hover {
    background: var(--tw-surface-elevated);
  }
  .menu-item.active {
    background: var(--tw-surface-elevated);
    border-color: var(--tw-accent);
    color: var(--tw-accent);
  }
  .item-name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .menu-footer {
    border-top: 1px solid var(--tw-border);
    padding-top: 6px;
  }
  .manage-btn {
    width: 100%;
    justify-content: flex-start;
    background: var(--tw-surface-elevated);
  }
</style>
