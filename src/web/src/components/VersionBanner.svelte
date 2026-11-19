<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    frontendVersion,
    serverVersion
  }: {
    frontendVersion: string;
    serverVersion: string | null;
  } = $props();

  let hasMismatch = $derived(Boolean(serverVersion && serverVersion !== frontendVersion));
</script>

{#if hasMismatch}
  <div class="version-banner" role="alert">
    <div class="msg">
      <Icon name="refresh" size={18} />
      <span>
        <strong>New version available</strong> ({serverVersion}, currently {frontendVersion}).
      </span>
    </div>
    <button type="button" class="primary" onclick={() => window.location.reload()}>
      Reload
    </button>
  </div>
{/if}

<style>
  .version-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 16px;
    background: var(--tw-state-warning);
    color: #ffffff;
    font-size: 0.9rem;
    flex-wrap: wrap;
  }
  .msg {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  button {
    min-height: 34px;
    padding: 0 12px;
  }
</style>
