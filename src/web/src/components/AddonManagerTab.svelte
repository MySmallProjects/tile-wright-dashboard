<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import type { AddonInfo, AddonOverview } from '../types';
  import Icon from './Icon.svelte';
  import SchemaForm from './SchemaForm.svelte';

  let {
    overview,
    onRefresh,
    onNotify
  }: {
    overview: AddonOverview;
    onRefresh: () => Promise<void>;
    onNotify: (msg: string) => void;
  } = $props();

  let busy = $state(false);
  let error = $state('');
  let statusMsg = $state('');

  // Editing global addon settings for one addon
  let configAddon = $state<AddonInfo | null>(null);
  let configValues = $state<Record<string, unknown>>({});
  let configSecretsSet = $state<Record<string, boolean>>({});
  let loadingConfig = $state(false);

  async function handleUpload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    error = '';
    statusMsg = '';
    busy = true;
    try {
      const res = await api.uploadAddon(file);
      statusMsg = res.isUpgrade
        ? `Staged upgrade for ${res.name} (v${res.previousVersion} → v${res.version}). Restart required.`
        : `Staged ${res.name} v${res.version} for installation. Restart required.`;
      await onRefresh();
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Addon upload failed.';
    } finally {
      busy = false;
      input.value = '';
    }
  }

  async function toggleEnabled(addon: AddonInfo) {
    error = '';
    statusMsg = '';
    busy = true;
    try {
      const isEnabled = addon.state === 'enabled';
      if (isEnabled) {
        await api.disableAddon(addon.id);
        statusMsg = `Marked "${addon.name}" as disabled. Restart required to take effect.`;
      } else {
        await api.enableAddon(addon.id);
        statusMsg = `Marked "${addon.name}" as enabled. Restart required to take effect.`;
      }
      await onRefresh();
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Could not update addon state.';
    } finally {
      busy = false;
    }
  }

  async function removeAddon(addon: AddonInfo) {
    if (!window.confirm(`Remove addon "${addon.name}" on next restart? Existing tiles will show a placeholder and keep their data.`)) {
      return;
    }
    error = '';
    statusMsg = '';
    busy = true;
    try {
      await api.removeAddon(addon.id);
      statusMsg = `Marked "${addon.name}" for removal on next restart.`;
      await onRefresh();
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Could not remove addon.';
    } finally {
      busy = false;
    }
  }

  async function triggerRestart() {
    error = '';
    statusMsg = '';
    busy = true;
    try {
      const res = await api.restartForAddons();
      statusMsg = res.message;
      onNotify(res.message);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Restart request failed.';
    } finally {
      busy = false;
    }
  }

  async function openAddonConfig(addon: AddonInfo) {
    configAddon = addon;
    loadingConfig = true;
    error = '';
    try {
      const res = await api.getAddonSettings(addon.id);
      configValues = res.settings;
      configSecretsSet = res.secretsSet;
    } catch {
      error = 'Failed to load addon settings.';
      configAddon = null;
    } finally {
      loadingConfig = false;
    }
  }

  async function saveAddonConfig(vals: Record<string, unknown>, secrets: Record<string, string | null>) {
    if (!configAddon) return;
    busy = true;
    error = '';
    try {
      await api.saveAddonSettings(configAddon.id, vals, secrets);
      onNotify(`Saved settings for ${configAddon.name}.`);
      configAddon = null;
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to save addon settings.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="addon-mgr">
  {#if overview.restartRequired}
    <div class="restart-banner">
      <div>
        <strong>Restart required</strong> — Pending addon changes take effect on next startup.
      </div>
      <button type="button" class="primary" onclick={triggerRestart} disabled={busy}>
        <Icon name="refresh" size={18} /> Restart Now
      </button>
    </div>
  {/if}

  <div class="upload-box">
    <div>
      <strong>Install or Upgrade Addon (.zip)</strong>
      <div class="muted small">
        In-process trust model: only install addons you trust. Changes apply on next server restart.
      </div>
    </div>
    <label class="btn primary upload-label">
      <Icon name="plus" size={18} /> Upload .zip
      <input type="file" accept=".zip,application/zip" onchange={handleUpload} disabled={busy} hidden />
    </label>
  </div>

  {#if error}<div class="error-text">{error}</div>{/if}
  {#if statusMsg}<div class="ok-text">{statusMsg}</div>{/if}

  {#if configAddon}
    <div class="config-box">
      <div class="config-head">
        <h3>{configAddon.name} — Addon Settings</h3>
        <button type="button" class="icon-btn ghost" onclick={() => (configAddon = null)} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
      </div>
      {#if loadingConfig}
        <p class="muted">Loading settings...</p>
      {:else}
        <SchemaForm
          schema={configAddon.contributes.addonSettingsSchema}
          addonId={configAddon.id}
          initialValues={configValues}
          secretsSet={configSecretsSet}
          saving={busy}
          submitLabel="Save Addon Settings"
          onSubmit={saveAddonConfig}
          onCancel={() => (configAddon = null)}
        />
      {/if}
    </div>
  {:else}
    <div class="addon-list">
      {#each overview.addons as addon (addon.id)}
        <div class="addon-card">
          <div class="addon-info">
            <div class="addon-title">
              <strong>{addon.name}</strong>
              <span class="ver muted">v{addon.version}</span>
              {#if addon.builtIn}<span class="pill">Built-in</span>{/if}
              <span class="pill state-{addon.state}">{addon.state}</span>
              {#if addon.forcedDisabled}<span class="pill state-failed">Forced off (config)</span>{/if}
            </div>
            <div class="muted small">{addon.description}</div>
            {#if addon.error}
              <div class="error-text small">Error: {addon.error}</div>
            {/if}
          </div>

          <div class="addon-actions">
            {#if addon.contributes.addonSettingsSchema?.length > 0 && addon.state === 'enabled'}
              <button type="button" onclick={() => openAddonConfig(addon)} disabled={busy}>
                Settings
              </button>
            {/if}
            {#if addon.state !== 'pending-install' && addon.state !== 'pending-removal'}
              <button type="button" onclick={() => toggleEnabled(addon)} disabled={busy}>
                {addon.state === 'enabled' ? 'Disable' : 'Enable'}
              </button>
            {/if}
            {#if !addon.builtIn && addon.state !== 'pending-removal'}
              <button type="button" class="danger" onclick={() => removeAddon(addon)} disabled={busy}>
                Remove
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .addon-mgr {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .restart-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--tw-state-warning);
    color: #ffffff;
    font-size: 0.88rem;
  }
  .upload-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
  }
  .upload-label {
    cursor: pointer;
  }
  .addon-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .addon-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
  }
  .addon-info {
    flex: 1 1 240px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .addon-title {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .ver {
    font-size: 0.8rem;
    font-family: var(--tw-font-mono);
  }
  .small {
    font-size: 0.82rem;
  }
  .pill {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--tw-border);
    color: var(--tw-text);
  }
  .pill.state-enabled {
    background: var(--tw-state-normal);
    color: #ffffff;
  }
  .pill.state-disabled {
    background: var(--tw-border);
    color: var(--tw-text-muted);
  }
  .pill.state-failed {
    background: var(--tw-state-critical);
    color: #ffffff;
  }
  .pill.state-pending-install,
  .pill.state-pending-removal {
    background: var(--tw-state-warning);
    color: #ffffff;
  }
  .addon-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .addon-actions button {
    min-height: 36px;
    padding: 0 10px;
    font-size: 0.84rem;
  }
  .config-box {
    padding: 14px;
    border-radius: 12px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .config-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .config-head h3 {
    margin: 0;
    font-size: 1rem;
  }
  .ok-text {
    color: var(--tw-state-normal);
    font-size: 0.88rem;
  }
</style>
