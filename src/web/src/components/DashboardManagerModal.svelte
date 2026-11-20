<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { DASHBOARD_ICON_CHOICES } from '../lib/icons';
  import type { BackgroundSettings, DashboardSummary } from '../types';
  import Icon from './Icon.svelte';

  let {
    dashboards,
    activeId,
    onClose,
    onChanged,
    onSelect,
    onNotify
  }: {
    dashboards: DashboardSummary[];
    activeId: string | null;
    onClose: () => void;
    onChanged: (nextList: DashboardSummary[], switchToId?: string) => void;
    onSelect: (id: string) => void;
    onNotify: (msg: string) => void;
  } = $props();

  let newName = $state('');
  let newIcon = $state('home');
  let busy = $state(false);
  let error = $state('');

  // Inline edit state for one dashboard at a time
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editIcon = $state('view-dashboard');
  let editBg = $state<BackgroundSettings>({
    mode: 'theme',
    color: '#1e293b',
    imageId: null,
    fit: 'cover',
    blur: 0,
    dim: 25
  });
  let uploading = $state(false);

  const clone = <T>(val: T): T => structuredClone($state.snapshot(val)) as T;

  async function handleCreate(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const trimmed = newName.trim();
    if (!trimmed) return;
    busy = true;
    try {
      const created = await api.createDashboard(trimmed, newIcon);
      const updated = await api.listDashboards();
      newName = '';
      onChanged(updated, created.id);
      onNotify(`Created dashboard "${created.name}".`);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to create dashboard.';
    } finally {
      busy = false;
    }
  }

  function startEdit(d: DashboardSummary) {
    editingId = d.id;
    editName = d.name;
    editIcon = d.icon || 'view-dashboard';
    editBg = clone(
      d.backgroundOverride ?? { mode: 'theme', color: '#1e293b', imageId: null, fit: 'cover', blur: 0, dim: 25 }
    );
  }

  async function handleBgUpload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    try {
      const { imageId } = await api.uploadUserBackground(file);
      editBg = { ...editBg, mode: 'image', imageId };
      onNotify('Dashboard background uploaded.');
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Upload failed.';
    } finally {
      uploading = false;
      input.value = '';
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    error = '';
    busy = true;
    try {
      const bgPayload = editBg.mode === 'theme' ? null : clone(editBg);
      await api.updateDashboard(editingId, editName.trim() || 'Dashboard', editIcon, bgPayload);
      const updated = await api.listDashboards();
      editingId = null;
      onChanged(updated);
      onNotify('Dashboard updated.');
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to update dashboard.';
    } finally {
      busy = false;
    }
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= dashboards.length) return;
    busy = true;
    error = '';
    try {
      const ids = dashboards.map((d) => d.id);
      [ids[index], ids[target]] = [ids[target], ids[index]];
      const reordered = await api.reorderDashboards(ids);
      onChanged(reordered);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to reorder dashboards.';
    } finally {
      busy = false;
    }
  }

  async function duplicate(d: DashboardSummary) {
    busy = true;
    error = '';
    try {
      const copy = await api.duplicateDashboard(d.id);
      const updated = await api.listDashboards();
      onChanged(updated, copy.id);
      onNotify(`Duplicated "${d.name}".`);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to duplicate dashboard.';
    } finally {
      busy = false;
    }
  }

  let enabledCount = $derived(dashboards.filter((d) => d.enabled !== false).length);

  async function toggleEnabled(d: DashboardSummary) {
    const currentlyEnabled = d.enabled !== false;
    if (currentlyEnabled && enabledCount <= 1) return;
    busy = true;
    error = '';
    try {
      await api.updateDashboard(
        d.id,
        d.name,
        d.icon ?? null,
        d.backgroundOverride ?? null,
        !currentlyEnabled
      );
      const updated = await api.listDashboards();
      const firstEnabled = updated.find((x) => x.enabled !== false)?.id;
      const nextActive = currentlyEnabled && d.id === activeId ? firstEnabled : undefined;
      onChanged(updated, nextActive);
      onNotify(currentlyEnabled ? `Disabled "${d.name}".` : `Enabled "${d.name}".`);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to update dashboard.';
    } finally {
      busy = false;
    }
  }

  async function remove(d: DashboardSummary) {
    if (dashboards.length <= 1) return;
    if (d.enabled !== false && enabledCount <= 1) return;
    if (!window.confirm(`Delete dashboard "${d.name}" and all of its tiles?`)) return;
    busy = true;
    error = '';
    try {
      await api.deleteDashboard(d.id);
      const updated = await api.listDashboards();
      const firstEnabled = updated.find((x) => x.enabled !== false)?.id ?? updated[0]?.id;
      const nextActive = d.id === activeId ? firstEnabled : undefined;
      onChanged(updated, nextActive);
      onNotify(`Deleted "${d.name}".`);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to delete dashboard.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Manage Dashboards">
  <div class="modal card">
    <header class="modal-header">
      <h2>Manage Dashboards</h2>
      <button type="button" class="icon-btn ghost" onclick={onClose} aria-label="Close">
        <Icon name="close" size={22} />
      </button>
    </header>

    <div class="modal-body">
      {#if error}
        <div class="error-text">{error}</div>
      {/if}

      <form class="create-box" onsubmit={handleCreate}>
        <h3>Create Dashboard</h3>
        <div class="create-row">
          <input type="text" bind:value={newName} placeholder="Dashboard name (e.g. Kitchen)" required />
          <button type="submit" class="primary" disabled={busy}>
            <Icon name="plus" size={18} /> Create
          </button>
        </div>
        <div class="icon-picker">
          {#each DASHBOARD_ICON_CHOICES as iconName}
            <button
              type="button"
              class="icon-choice"
              class:selected={newIcon === iconName}
              title={iconName}
              aria-label={`Select icon ${iconName}`}
              onclick={() => (newIcon = iconName)}
            >
              <Icon name={iconName} size={20} />
            </button>
          {/each}
        </div>
      </form>

      <div class="dash-list">
        <h3>Your Dashboards ({dashboards.length})</h3>
        {#each dashboards as d, idx (d.id)}
          {@const isEnabled = d.enabled !== false}
          <div class="dash-card" class:active={d.id === activeId} class:disabled-dash={!isEnabled}>
            {#if editingId === d.id}
              <div class="edit-form">
                <div class="create-row">
                  <input type="text" bind:value={editName} placeholder="Dashboard name" />
                </div>
                <div class="icon-picker">
                  {#each DASHBOARD_ICON_CHOICES as iconName}
                    <button
                      type="button"
                      class="icon-choice"
                      class:selected={editIcon === iconName}
                      title={iconName}
                      onclick={() => (editIcon = iconName)}
                    >
                      <Icon name={iconName} size={18} />
                    </button>
                  {/each}
                </div>

                <div class="bg-row">
                  <label for="dashBgMode">Background override</label>
                  <select id="dashBgMode" bind:value={editBg.mode}>
                    <option value="theme">Inherit (User / Site default)</option>
                    <option value="solid">Solid colour</option>
                    <option value="image">Uploaded image</option>
                  </select>
                </div>

                {#if editBg.mode === 'solid'}
                  <div class="bg-row">
                    <label for="dashBgColor">Colour</label>
                    <input id="dashBgColor" type="color" bind:value={editBg.color} />
                  </div>
                {:else if editBg.mode === 'image'}
                  <div class="bg-row">
                    <label for="dashBgFile">Image</label>
                    <input id="dashBgFile" type="file" accept="image/jpeg,image/png,image/webp" onchange={handleBgUpload} disabled={uploading} />
                  </div>
                  <div class="bg-row">
                    <label for="dashBgDim">Dim ({editBg.dim}%)</label>
                    <input id="dashBgDim" type="range" min="0" max="75" step="5" bind:value={editBg.dim} />
                  </div>
                {/if}

                <div class="edit-actions">
                  <button type="button" onclick={() => (editingId = null)} disabled={busy}>Cancel</button>
                  <button type="button" class="primary" onclick={saveEdit} disabled={busy}>Save</button>
                </div>
              </div>
            {:else}
              <div class="dash-row">
                <button
                  type="button"
                  class="dash-main ghost"
                  disabled={!isEnabled}
                  onclick={() => {
                    onSelect(d.id);
                    onClose();
                  }}
                >
                  <Icon name={d.icon || 'view-dashboard'} size={22} />
                  <span class="dash-title">{d.name}</span>
                  {#if d.id === activeId}
                    <span class="current-tag">Current</span>
                  {:else if !isEnabled}
                    <span class="disabled-tag">Disabled</span>
                  {/if}
                </button>

                <div class="dash-actions">
                  <button
                    type="button"
                    class="toggle-btn"
                    title={isEnabled ? 'Disable dashboard (hide from switcher & swipe)' : 'Enable dashboard'}
                    disabled={busy || (isEnabled && enabledCount <= 1)}
                    onclick={() => toggleEnabled(d)}
                  >
                    {isEnabled ? 'Disable' : 'Enable'}
                  </button>
                  <button type="button" class="icon-btn" title="Move up" aria-label="Move up" disabled={busy || idx === 0} onclick={() => move(idx, -1)}>
                    <Icon name="arrow-up" size={18} />
                  </button>
                  <button type="button" class="icon-btn" title="Move down" aria-label="Move down" disabled={busy || idx === dashboards.length - 1} onclick={() => move(idx, 1)}>
                    <Icon name="arrow-down" size={18} />
                  </button>
                  <button type="button" class="icon-btn" title="Rename & style" aria-label="Edit dashboard" disabled={busy} onclick={() => startEdit(d)}>
                    <Icon name="pencil" size={18} />
                  </button>
                  <button type="button" class="icon-btn" title="Duplicate" aria-label="Duplicate dashboard" disabled={busy} onclick={() => duplicate(d)}>
                    <Icon name="content-copy" size={18} />
                  </button>
                  <button type="button" class="icon-btn danger" title="Delete" aria-label="Delete dashboard" disabled={busy || dashboards.length <= 1 || (isEnabled && enabledCount <= 1)} onclick={() => remove(d)}>
                    <Icon name="delete" size={18} />
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--tw-modal-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .modal {
    width: 100%;
    max-width: 660px;
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
  .modal-header h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .modal-body {
    padding: 16px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 0.92rem;
    color: var(--tw-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .create-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--tw-border);
  }
  .create-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .create-row input {
    flex: 1 1 200px;
  }
  .icon-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .icon-choice {
    min-width: 38px;
    min-height: 38px;
    padding: 0;
    background: var(--tw-surface-elevated);
  }
  .icon-choice.selected {
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
    border-color: transparent;
  }
  .dash-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dash-card {
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
  }
  .dash-card.active {
    border-color: var(--tw-accent);
  }
  .dash-card.disabled-dash {
    opacity: 0.65;
  }
  .disabled-tag {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--tw-border);
    color: var(--tw-text-muted);
  }
  .toggle-btn {
    min-height: 36px;
    padding: 0 10px;
    font-size: 0.8rem;
  }
  .dash-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .dash-main {
    flex: 1 1 180px;
    justify-content: flex-start;
    padding: 0 6px;
  }
  .dash-title {
    font-weight: 600;
  }
  .current-tag {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
  }
  .dash-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .dash-actions .icon-btn {
    min-width: 36px;
    min-height: 36px;
    padding: 0;
  }
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px;
  }
  .bg-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 0.88rem;
  }
  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
