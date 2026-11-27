<script lang="ts">
  import { onMount } from 'svelte';
  import { ensureAddonScriptLoaded } from '../lib/addonLoader';
  import {
    buildTileSettingsExport,
    buildTileSettingsFilename,
    parseTileSettingsImport
  } from '../lib/tileSettingsTransfer';
  import type { AddonTile, DashboardSummary } from '../types';
  import Icon from './Icon.svelte';
  import SchemaForm from './SchemaForm.svelte';

  let {
    tileDef,
    currentSettings = {},
    tileEnabled = true,
    dashboards = [],
    currentDashboardId = null,
    saving = false,
    onToggleEnabled,
    onCopyToDashboard,
    onSave,
    onClose
  }: {
    tileDef: AddonTile;
    currentSettings?: Record<string, unknown>;
    tileEnabled?: boolean;
    dashboards?: DashboardSummary[];
    currentDashboardId?: string | null;
    saving?: boolean;
    onToggleEnabled?: (enabled: boolean) => void;
    onCopyToDashboard?: (target: DashboardSummary, draftSettings: Record<string, unknown>) => Promise<void>;
    onSave: (nextSettings: Record<string, unknown>) => void;
    onClose: () => void;
  } = $props();

  type CustomSettingsElement = HTMLElement & {
    settings?: Record<string, unknown>;
    context?: Record<string, unknown>;
  };

  let customHostEl: HTMLDivElement | undefined = $state();
  let customEl: CustomSettingsElement | undefined = $state();
  let customError = $state('');
  let schemaFormRef:
    | {
        getValues: () => Record<string, unknown>;
        setValues: (next: Record<string, unknown>) => void;
      }
    | undefined = $state();
  let importFileInput: HTMLInputElement | undefined = $state();
  let transferError = $state('');
  let transferNotice = $state('');
  let showCopyMenu = $state(false);
  let copyingToDashboard = $state(false);

  const hasSettings = $derived(
    Boolean(tileDef.spec.settingsElement) || tileDef.spec.settingsSchema.length > 0
  );

  onMount(async () => {
    const customSpec = tileDef.spec.settingsElement;
    if (!customSpec || !customHostEl) return;

    try {
      await ensureAddonScriptLoaded(tileDef.addonId, customSpec.script);
      const el = document.createElement(customSpec.tagName) as CustomSettingsElement;
      el.settings = structuredClone($state.snapshot(currentSettings));
      el.context = { addonId: tileDef.addonId, tileTypeId: tileDef.tileTypeId };
      el.addEventListener('settings-changed', (ev: Event) => {
        const detail = (ev as CustomEvent<Record<string, unknown>>).detail;
        if (detail) onSave(detail);
      });
      customHostEl.innerHTML = '';
      customHostEl.appendChild(el);
      customEl = el;
    } catch (err) {
      customError = err instanceof Error ? err.message : 'Failed to load custom settings UI.';
    }
  });

  function getCurrentDraftSettings(): Record<string, unknown> {
    if (schemaFormRef) {
      return schemaFormRef.getValues();
    }
    if (customEl?.settings) {
      return structuredClone($state.snapshot(customEl.settings));
    }
    return structuredClone($state.snapshot(currentSettings));
  }

  function handleExport() {
    transferError = '';
    transferNotice = '';
    const payload = buildTileSettingsExport(tileDef, getCurrentDraftSettings());
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildTileSettingsFilename(tileDef);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    transferError = '';
    importFileInput?.click();
  }

  async function handleImportFile(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const result = parseTileSettingsImport(text, tileDef);
      if (!result.ok) {
        transferNotice = '';
        transferError = result.error;
        return;
      }

      transferError = '';
      if (schemaFormRef) {
        schemaFormRef.setValues(result.settings);
        transferNotice = 'Settings loaded from file. Review and click Save Tile Settings to apply.';
      } else if (customEl) {
        customEl.settings = structuredClone(result.settings);
        transferNotice = 'Settings loaded from file.';
      }
    } catch {
      transferNotice = '';
      transferError = 'Failed to read the selected file.';
    }
  }

  async function handleCopyPick(target: DashboardSummary) {
    if (!onCopyToDashboard || copyingToDashboard) return;
    showCopyMenu = false;
    copyingToDashboard = true;
    transferError = '';
    transferNotice = '';
    try {
      await onCopyToDashboard(target, getCurrentDraftSettings());
      transferNotice = `Copied tile to "${target.name}".`;
    } catch {
      transferError = `Failed to copy tile to "${target.name}".`;
    } finally {
      copyingToDashboard = false;
    }
  }
</script>

<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Settings: ${tileDef.spec.name}`}>
  <div class="modal card">
    <header class="modal-header">
      <div class="title-wrap">
        <Icon name={tileDef.spec.icon || 'cog'} size={22} />
        <div>
          <h2>{tileDef.spec.name} Settings</h2>
          <div class="muted sub">{tileDef.addonName} v{tileDef.addonVersion}</div>
        </div>
      </div>
      <div class="header-actions">
        {#if hasSettings}
          <button
            type="button"
            class="icon-btn ghost"
            onclick={handleExport}
            disabled={saving || copyingToDashboard}
            title="Download settings JSON"
            aria-label="Download settings JSON"
          >
            <Icon name="download" size={20} />
          </button>
          <button
            type="button"
            class="icon-btn ghost"
            onclick={triggerImport}
            disabled={saving || copyingToDashboard}
            title="Upload settings JSON"
            aria-label="Upload settings JSON"
          >
            <Icon name="upload" size={20} />
          </button>
          <input
            type="file"
            accept=".json,application/json"
            hidden
            bind:this={importFileInput}
            onchange={handleImportFile}
          />
        {/if}
        {#if onCopyToDashboard && dashboards.length > 0}
          <div class="copy-wrap">
            <button
              type="button"
              class="icon-btn ghost"
              onclick={() => (showCopyMenu = !showCopyMenu)}
              disabled={saving || copyingToDashboard}
              title="Copy tile to dashboard"
              aria-label="Copy tile to dashboard"
              aria-haspopup="menu"
              aria-expanded={showCopyMenu}
            >
              <Icon name="arrow-right" size={20} />
            </button>
            {#if showCopyMenu}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="copy-backdrop" onclick={() => (showCopyMenu = false)}></div>
              <div class="copy-menu card" role="menu" aria-label="Copy tile to dashboard">
                <div class="copy-menu-header">Copy tile to dashboard</div>
                <div class="copy-menu-list">
                  {#each dashboards as dash (dash.id)}
                    <button
                      type="button"
                      class="copy-menu-item"
                      role="menuitem"
                      onclick={() => void handleCopyPick(dash)}
                    >
                      <Icon name={dash.icon || 'view-dashboard'} size={18} />
                      <span class="copy-menu-name">{dash.name}</span>
                      {#if dash.id === currentDashboardId}
                        <span class="copy-menu-tag">Current</span>
                      {:else if dash.enabled === false}
                        <span class="copy-menu-tag">Disabled</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
        {#if hasSettings || (onCopyToDashboard && dashboards.length > 0)}
          <span class="header-divider" aria-hidden="true"></span>
        {/if}
        <button type="button" class="icon-btn ghost" onclick={onClose} aria-label="Close">
          <Icon name="close" size={22} />
        </button>
      </div>
    </header>

    <div class="modal-body">
      {#if onToggleEnabled}
        <label class="tile-enabled-row">
          <div class="tile-enabled-copy">
            <strong>Enabled</strong>
            <span class="muted">When disabled, this tile only appears in edit mode and will not update.</span>
          </div>
          <input
            type="checkbox"
            checked={tileEnabled}
            disabled={saving}
            onchange={(e) => onToggleEnabled((e.currentTarget as HTMLInputElement).checked)}
          />
        </label>
      {/if}

      {#if transferError}
        <div class="transfer-banner error" role="alert">
          <span>{transferError}</span>
          <button type="button" class="icon-btn ghost dismiss-btn" onclick={() => (transferError = '')} aria-label="Dismiss error">
            <Icon name="close" size={16} />
          </button>
        </div>
      {/if}
      {#if transferNotice}
        <div class="transfer-banner notice" role="status">
          <span>{transferNotice}</span>
          <button type="button" class="icon-btn ghost dismiss-btn" onclick={() => (transferNotice = '')} aria-label="Dismiss notice">
            <Icon name="close" size={16} />
          </button>
        </div>
      {/if}

      {#if tileDef.spec.settingsElement}
        {#if customError}
          <div class="error-text">{customError}</div>
        {:else}
          <div bind:this={customHostEl}></div>
        {/if}
      {:else if tileDef.spec.settingsSchema.length === 0}
        <p class="muted">This tile has no configurable settings.</p>
        <div class="actions">
          <button type="button" class="primary" onclick={onClose}>Close</button>
        </div>
      {:else}
        <SchemaForm
          bind:this={schemaFormRef}
          schema={tileDef.spec.settingsSchema}
          addonId={tileDef.addonId}
          initialValues={currentSettings}
          {saving}
          submitLabel="Save Tile Settings"
          onSubmit={(vals) => onSave(vals)}
          onCancel={onClose}
        />
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1050;
    background: var(--tw-modal-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .modal {
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    background: var(--tw-surface-solid);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--tw-border);
  }
  .title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .header-divider {
    width: 1px;
    height: 20px;
    background: var(--tw-border);
    margin: 0 4px;
  }
  .copy-wrap {
    position: relative;
  }
  .copy-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
  }
  .copy-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 30;
    min-width: 220px;
    max-width: 280px;
    background: var(--tw-surface-solid);
    border: 1px solid var(--tw-border);
    box-shadow: var(--tw-tile-shadow);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .copy-menu-header {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--tw-text-muted);
    padding: 4px 8px;
  }
  .copy-menu-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 240px;
    overflow-y: auto;
  }
  .copy-menu-item {
    justify-content: flex-start;
    width: 100%;
    padding: 7px 10px;
    border-color: transparent;
    background: transparent;
    font-size: 0.88rem;
  }
  .copy-menu-item:hover {
    background: var(--tw-surface-elevated);
    border-color: var(--tw-border);
  }
  .copy-menu-name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .copy-menu-tag {
    font-size: 0.72rem;
    color: var(--tw-text-muted);
    flex-shrink: 0;
  }
  .modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .sub {
    font-size: 0.78rem;
  }
  .modal-body {
    padding: 16px 18px;
    overflow-y: auto;
  }
  .tile-enabled-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    margin-bottom: 14px;
    border-radius: 8px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
    cursor: pointer;
  }
  .tile-enabled-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.88rem;
  }
  .tile-enabled-copy .muted {
    font-size: 0.78rem;
  }
  .tile-enabled-row input[type='checkbox'] {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .transfer-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 0.86rem;
    margin-bottom: 14px;
    border: 1px solid var(--tw-border);
  }
  .transfer-banner.error {
    background: color-mix(in srgb, var(--tw-state-critical) 12%, transparent);
    border-color: color-mix(in srgb, var(--tw-state-critical) 40%, transparent);
    color: var(--tw-state-critical);
  }
  .transfer-banner.notice {
    background: color-mix(in srgb, var(--tw-accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--tw-accent) 35%, transparent);
    color: var(--tw-text);
  }
  .dismiss-btn {
    min-width: 28px;
    min-height: 28px;
    padding: 0;
    flex-shrink: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }
</style>
