<script lang="ts">
  import { onMount } from 'svelte';
  import { ensureAddonScriptLoaded } from '../lib/addonLoader';
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

  let customHostEl: HTMLDivElement | undefined = $state();
  let customError = $state('');

  onMount(async () => {
    const customSpec = tileDef.spec.settingsElement;
    if (!customSpec || !customHostEl) return;

    try {
      await ensureAddonScriptLoaded(tileDef.addonId, customSpec.script);
      const el = document.createElement(customSpec.tagName) as HTMLElement & {
        settings?: Record<string, unknown>;
        context?: Record<string, unknown>;
      };
      el.settings = structuredClone($state.snapshot(currentSettings));
      el.context = { addonId: tileDef.addonId, tileTypeId: tileDef.tileTypeId };
      el.addEventListener('settings-changed', (ev: Event) => {
        const detail = (ev as CustomEvent<Record<string, unknown>>).detail;
        if (detail) onSave(detail);
      });
      customHostEl.innerHTML = '';
      customHostEl.appendChild(el);
    } catch (err) {
      customError = err instanceof Error ? err.message : 'Failed to load custom settings UI.';
    }
  });
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
      <button type="button" class="icon-btn ghost" onclick={onClose} aria-label="Close">
        <Icon name="close" size={22} />
      </button>
    </header>

    <div class="modal-body">
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
    padding: 14px 18px;
    border-bottom: 1px solid var(--tw-border);
  }
  .title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
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
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
  }
</style>
