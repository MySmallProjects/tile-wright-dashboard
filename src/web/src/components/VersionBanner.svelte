<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    frontendVersion,
    serverVersion
  }: {
    frontendVersion: string;
    serverVersion: string | null;
  } = $props();

  const DISMISS_KEY = 'tw_dismissed_version';

  function readDismissed(): string | null {
    try {
      return sessionStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  }

  let dismissedVersion = $state<string | null>(readDismissed());

  function dismiss() {
    dismissedVersion = serverVersion;
    try {
      if (serverVersion) sessionStorage.setItem(DISMISS_KEY, serverVersion);
    } catch {
      // ignore storage errors
    }
  }

  let hasMismatch = $derived(
    Boolean(serverVersion && serverVersion !== frontendVersion && dismissedVersion !== serverVersion)
  );
</script>

{#if hasMismatch}
  <div class="version-banner" role="alert">
    <div class="msg">
      <Icon name="refresh" size={18} />
      <span>
        <strong>New version available</strong> ({serverVersion}, currently {frontendVersion}).
      </span>
    </div>
    <div class="actions">
      <button type="button" class="primary" onclick={() => window.location.reload()}>
        Reload
      </button>
      <button
        type="button"
        class="dismiss-btn"
        title="Dismiss"
        aria-label="Dismiss new version banner"
        onclick={dismiss}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  </div>
{/if}

<style>
  .version-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px 8px 16px;
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
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }
  button {
    min-height: 34px;
    padding: 0 12px;
  }
  .dismiss-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    min-height: 0;
    padding: 0;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: transparent;
    color: #ffffff;
    cursor: pointer;
    align-self: flex-start;
  }
  .dismiss-btn:hover {
    background: rgba(255, 255, 255, 0.18);
  }
</style>
