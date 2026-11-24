<script lang="ts">
  import { onMount } from 'svelte';
  import { ensureAddonScriptLoaded } from '../lib/addonLoader';
  import {
    buildTileSettingsExport,
    buildTileSettingsFilename,
    parseTileSettingsImport
  } from '../lib/tileSettingsTransfer';
  import type { AddonTile } from '../types';
  import Icon from './Icon.svelte';
  import SchemaForm from './SchemaForm.svelte';

  let {
    tileDef,
    currentSettings = {},
    saving = false,
    onSave,
    onClose
  }: {
    tileDef: AddonTile;
    currentSettings?: Record<string, unknown>;
    saving?: boolean;
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
            disabled={saving}
            title="Download settings JSON"
            aria-label="Download settings JSON"
          >
            <Icon name="download" size={20} />
          </button>
          <button
            type="button"
            class="icon-btn ghost"
            onclick={triggerImport}
            disabled={saving}
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
          <span class="header-divider" aria-hidden="true"></span>
        {/if}
        <button type="button" class="icon-btn ghost" onclick={onClose} aria-label="Close">
          <Icon name="close" size={22} />
        </button>
      </div>
    </header>

    <div class="modal-body">
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
