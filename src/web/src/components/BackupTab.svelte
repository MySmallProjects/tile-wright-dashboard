<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import Icon from './Icon.svelte';

  let {
    onNotify
  }: {
    onNotify: (msg: string) => void;
  } = $props();

  let busy = $state(false);
  let clearFirst = $state(true);
  let error = $state('');
  let statusMsg = $state('');

  function downloadSiteBackup() {
    window.location.href = '/api/backup/site';
  }

  function downloadUsersFile() {
    window.location.href = '/api/backup/users';
  }

  async function handleRestoreZip(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const warn = clearFirst
      ? 'This will CLEAR existing site settings, dashboards, addon settings, secrets, and installed addons before restoring from the zip. Continue?'
      : 'This will restore files from the zip over existing site settings and dashboards. Continue?';
    if (!window.confirm(warn)) {
      input.value = '';
      return;
    }

    error = '';
    statusMsg = '';
    busy = true;
    try {
      const res = await api.restoreSiteBackup(file, clearFirst);
      statusMsg = res.message;
      onNotify('Site backup restored.');
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Restore failed.';
    } finally {
      busy = false;
      input.value = '';
    }
  }

  async function handleUploadUsers(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (
      !window.confirm(
        'This will OVERWRITE all existing users (including the admin account) and sign out all active sessions. Continue?'
      )
    ) {
      input.value = '';
      return;
    }

    error = '';
    statusMsg = '';
    busy = true;
    try {
      const res = await api.importUsersFile(file);
      statusMsg = res.message;
      onNotify('Users imported. Reloading...');
      window.setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to import users file.';
    } finally {
      busy = false;
      input.value = '';
    }
  }

  async function handleClearDashboards() {
    if (
      !window.confirm(
        'WARNING: All dashboards, layouts, tile settings, and tile data for ALL users will be permanently removed and reset to an empty Home dashboard. Continue?'
      )
    ) {
      return;
    }

    error = '';
    statusMsg = '';
    busy = true;
    try {
      const res = await api.clearAllDashboards();
      statusMsg = res.message;
      onNotify('All dashboard data cleared.');
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to clear dashboard data.';
    } finally {
      busy = false;
    }
  }

  async function handleSiteReset() {
    if (
      !window.confirm(
        'DANGER: Site Reset will permanently wipe the entire data folder — all users, sessions, dashboards, settings, secrets, and uploaded addons. Continue?'
      )
    ) {
      return;
    }
    const typed = window.prompt('Type RESET to confirm wiping the entire site:');
    if (typed !== 'RESET') {
      onNotify('Site reset cancelled.');
      return;
    }

    error = '';
    statusMsg = '';
    busy = true;
    try {
      const res = await api.resetSite();
      statusMsg = res.message;
      onNotify('Site reset complete. Reloading...');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Failed to reset site.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="backup-tab">
  {#if error}<div class="error-text">{error}</div>{/if}
  {#if statusMsg}<div class="ok-text">{statusMsg}</div>{/if}

  <section class="card-box">
    <h3>Site Backup (.zip)</h3>
    <p class="muted small">
      Downloads site settings, all users' dashboards &amp; tile data, backgrounds, addon settings,
      enabled/disabled addon state, and installed addons (excludes <code>users.json</code>).
    </p>
    <div class="warn-note">
      <Icon name="alert" size={18} />
      <span>
        <strong>Sensitive data warning:</strong> This backup may include sensitive passwords, API keys, and Home Assistant auth tokens. Store it securely.
      </span>
    </div>
    <div class="actions">
      <button type="button" class="primary" onclick={downloadSiteBackup} disabled={busy}>
        Download Site Backup (.zip)
      </button>
    </div>
  </section>

  <section class="card-box">
    <h3>Restore Site Backup (.zip)</h3>
    <p class="muted small">
      Upload a previously created Tilewright backup zip. The archive is validated before any live data is modified.
    </p>
    <label class="chk-row">
      <input type="checkbox" bind:checked={clearFirst} disabled={busy} />
      <span>Clear previous site &amp; dashboard data first, then restore</span>
    </label>
    <div class="actions">
      <label class="btn primary upload-btn">
        Upload &amp; Restore (.zip)
        <input type="file" accept=".zip,application/zip" onchange={handleRestoreZip} disabled={busy} hidden />
      </label>
    </div>
  </section>

  <section class="card-box">
    <h3>Users File (<code>users.json</code>)</h3>
    <p class="muted small">
      Export or overwrite the users file (including roles, password hashes, and the admin account). Importing signs out all active sessions.
    </p>
    <div class="actions">
      <button type="button" onclick={downloadUsersFile} disabled={busy}>
        Download Users (.json)
      </button>
      <label class="btn danger upload-btn">
        Upload &amp; Overwrite Users (.json)
        <input type="file" accept=".json,application/json" onchange={handleUploadUsers} disabled={busy} hidden />
      </label>
    </div>
  </section>

  <section class="card-box danger-box">
    <h3>Clear All Dashboard Data</h3>
    <p class="muted small">
      Resets all dashboards and removes all tile settings and tile data for every user, creating a fresh empty Home dashboard for each.
    </p>
    <div class="actions">
      <button type="button" class="danger" onclick={handleClearDashboards} disabled={busy}>
        Clear All Dashboard Data
      </button>
    </div>
  </section>

  <section class="card-box danger-box">
    <h3>Site Reset</h3>
    <p class="muted small">
      Wipes the entire data folder (users, sessions, dashboards, backgrounds, secrets, addon settings, and any uploaded addons) and returns to first-run admin setup.
    </p>
    <div class="actions">
      <button type="button" class="danger" onclick={handleSiteReset} disabled={busy}>
        Reset Entire Site
      </button>
    </div>
  </section>
</div>

<style>
  .backup-tab {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .card-box {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 12px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
  }
  .danger-box {
    border-color: rgba(220, 38, 38, 0.4);
  }
  .card-box h3 {
    margin: 0;
    font-size: 0.96rem;
  }
  .card-box p {
    margin: 0;
  }
  .small {
    font-size: 0.84rem;
    line-height: 1.4;
  }
  .warn-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(217, 119, 6, 0.14);
    border: 1px solid var(--tw-state-warning);
    color: var(--tw-text);
    font-size: 0.84rem;
    line-height: 1.35;
  }
  .chk-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.88rem;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .upload-btn {
    cursor: pointer;
  }
  .ok-text {
    color: var(--tw-state-normal);
    font-size: 0.88rem;
  }
</style>
