<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../lib/api';
  import type {
    AddonOverview,
    BackgroundSettings,
    PublicUser,
    SiteSettings,
    UserSettings,
    VersionInfo
  } from '../types';
  import AddonManagerTab from './AddonManagerTab.svelte';
  import Icon from './Icon.svelte';

  let {
    currentUser,
    userSettings,
    siteSettings,
    addonOverview,
    frontendVersion,
    serverVersionInfo,
    onClose,
    onOpenDashboards,
    onUserSettingsSaved,
    onSiteSettingsSaved,
    onRefreshAddons,
    onNotify
  }: {
    currentUser: PublicUser;
    userSettings: UserSettings;
    siteSettings: SiteSettings;
    addonOverview: AddonOverview;
    frontendVersion: string;
    serverVersionInfo: VersionInfo | null;
    onClose: () => void;
    onOpenDashboards?: () => void;
    onUserSettingsSaved: (s: UserSettings) => void;
    onSiteSettingsSaved: (s: SiteSettings) => void;
    onRefreshAddons: () => Promise<void>;
    onNotify: (msg: string) => void;
  } = $props();

  type TabId = 'appearance' | 'account' | 'site' | 'addons' | 'about';
  let activeTab = $state<TabId>('appearance');

  // Local editable copies (snapshot Svelte 5 $state proxies before cloning)
  const clone = <T>(val: T): T => structuredClone($state.snapshot(val)) as T;

  let draftUser = $state<UserSettings>(clone(userSettings));
  let draftUserBg = $state<BackgroundSettings>(
    clone(
      userSettings.background ?? { mode: 'theme', color: '#1e293b', imageId: null, fit: 'cover', blur: 0, dim: 25 }
    )
  );
  let draftSite = $state<SiteSettings>(clone(siteSettings));
  let draftSiteBg = $state<BackgroundSettings>(
    clone(
      siteSettings.defaultBackground ?? { mode: 'theme', color: '#1e293b', imageId: null, fit: 'cover', blur: 0, dim: 25 }
    )
  );

  // Account password form
  let currentPw = $state('');
  let newPw = $state('');
  let pwMsg = $state('');
  let pwErr = $state('');

  // Admin user management
  let users = $state<PublicUser[]>([]);
  let newUserName = $state('');
  let newUserRole = $state<'user' | 'admin'>('user');
  let newUserPw = $state('');
  let adminErr = $state('');

  let saving = $state(false);
  let uploading = $state(false);

  onMount(async () => {
    if (currentUser.role === 'admin') {
      await loadUsers();
    }
  });

  async function loadUsers() {
    try {
      users = await api.listUsers();
    } catch {
      adminErr = 'Failed to load users.';
    }
  }

  async function saveAppearance() {
    saving = true;
    try {
      const payload: UserSettings = {
        ...draftUser,
        background: draftUserBg.mode === 'theme' ? null : draftUserBg
      };
      const saved = await api.saveUserSettings(payload);
      onUserSettingsSaved(saved);
      onNotify('User settings saved.');
    } catch {
      onNotify('Failed to save user settings.');
    } finally {
      saving = false;
    }
  }

  async function handleUserBgUpload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    try {
      const { imageId } = await api.uploadUserBackground(file);
      draftUserBg = { ...draftUserBg, mode: 'image', imageId };
      onNotify('Background uploaded & resized.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Background upload failed.');
    } finally {
      uploading = false;
      input.value = '';
    }
  }

  async function handleSiteBgUpload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    try {
      const { imageId } = await api.uploadSiteBackground(file);
      draftSiteBg = { ...draftSiteBg, mode: 'image', imageId };
      onNotify('Site background uploaded & resized.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Background upload failed.');
    } finally {
      uploading = false;
      input.value = '';
    }
  }

  async function saveOwnPassword(remove = false) {
    pwMsg = '';
    pwErr = '';
    saving = true;
    try {
      await api.changeOwnPassword(currentUser.hasPassword ? currentPw : null, remove ? null : newPw);
      currentPw = '';
      newPw = '';
      pwMsg = remove ? 'Password removed. Other sessions signed out.' : 'Password updated. Other sessions signed out.';
    } catch (err) {
      pwErr = err instanceof ApiError ? err.message : 'Could not update password.';
    } finally {
      saving = false;
    }
  }

  async function saveSite() {
    saving = true;
    adminErr = '';
    try {
      const saved = await api.saveSiteSettings({
        ...draftSite,
        defaultBackground: draftSiteBg
      });
      onSiteSettingsSaved(saved);
      onNotify('Site settings saved.');
    } catch (err) {
      adminErr = err instanceof ApiError ? err.message : 'Failed to save site settings.';
    } finally {
      saving = false;
    }
  }

  async function handleCreateUser(e: SubmitEvent) {
    e.preventDefault();
    adminErr = '';
    if (!newUserName.trim()) return;
    try {
      await api.createUser(newUserName.trim(), newUserRole, newUserPw || null);
      newUserName = '';
      newUserPw = '';
      newUserRole = 'user';
      await loadUsers();
      onNotify('User created.');
    } catch (err) {
      adminErr = err instanceof ApiError ? err.message : 'Failed to create user.';
    }
  }

  async function handleToggleRole(u: PublicUser) {
    adminErr = '';
    const nextRole = u.role === 'admin' ? 'user' : 'admin';
    try {
      await api.updateUser(u.id, u.displayName, nextRole);
      await loadUsers();
      onNotify(`Updated ${u.displayName} to ${nextRole}.`);
    } catch (err) {
      adminErr = err instanceof ApiError ? err.message : 'Failed to update role.';
    }
  }

  async function handleResetUserPw(u: PublicUser) {
    adminErr = '';
    const entered = window.prompt(`Enter new password for ${u.displayName} (leave blank to remove password):`);
    if (entered === null) return;
    try {
      await api.resetUserPassword(u.id, entered || null);
      await loadUsers();
      onNotify(`Password updated for ${u.displayName} (sessions revoked).`);
    } catch (err) {
      adminErr = err instanceof ApiError ? err.message : 'Failed to reset password.';
    }
  }

  async function handleDeleteUser(u: PublicUser) {
    adminErr = '';
    if (!window.confirm(`Delete user "${u.displayName}"? Their sessions will be revoked immediately.`)) return;
    try {
      await api.deleteUser(u.id);
      await loadUsers();
      onNotify(`Deleted ${u.displayName}.`);
    } catch (err) {
      adminErr = err instanceof ApiError ? err.message : 'Failed to delete user.';
    }
  }

  let hasVersionMismatch = $derived(
    Boolean(serverVersionInfo && serverVersionInfo.version !== frontendVersion)
  );
</script>

<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
  <div class="modal card">
    <header class="modal-header">
      <h2>Settings</h2>
      <button type="button" class="icon-btn ghost" onclick={onClose} aria-label="Close settings">
        <Icon name="close" size={22} />
      </button>
    </header>

    <nav class="tabs">
      <button type="button" class:active={activeTab === 'appearance'} onclick={() => (activeTab = 'appearance')}>
        Appearance &amp; Grid
      </button>
      <button type="button" class:active={activeTab === 'account'} onclick={() => (activeTab = 'account')}>
        Account
      </button>
      {#if currentUser.role === 'admin'}
        <button type="button" class:active={activeTab === 'site'} onclick={() => (activeTab = 'site')}>
          Site &amp; Users
        </button>
        <button type="button" class:active={activeTab === 'addons'} onclick={() => (activeTab = 'addons')}>
          Addons {#if addonOverview.restartRequired}●{/if}
        </button>
      {/if}
      <button type="button" class:active={activeTab === 'about'} onclick={() => (activeTab = 'about')}>
        Version
      </button>
    </nav>

    <div class="modal-body">
      {#if activeTab === 'appearance'}
        <section class="section">
          <h3>Theme</h3>
          <div class="row">
            <label for="userTheme">Theme</label>
            <select id="userTheme" bind:value={draftUser.theme}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">Follow device setting</option>
            </select>
          </div>
          <div class="row">
            <label for="tileOpacity">Tile opacity ({draftUser.tileOpacity}%)</label>
            <input id="tileOpacity" type="range" min="10" max="100" step="5" bind:value={draftUser.tileOpacity} />
          </div>
          <div class="row">
            <label><input type="checkbox" bind:checked={draftUser.tileBorder} /> Show tile borders</label>
          </div>
          <div class="row">
            <label><input type="checkbox" bind:checked={draftUser.backdropBlur} /> Backdrop blur (may be slower on old tablets)</label>
          </div>
        </section>

        <section class="section">
          <h3>Background</h3>
          <div class="row">
            <label for="userBgMode">Mode</label>
            <select id="userBgMode" bind:value={draftUserBg.mode}>
              <option value="theme">Inherit (Site / Theme default)</option>
              <option value="solid">Solid colour</option>
              <option value="image">Uploaded image</option>
            </select>
          </div>
          {#if draftUserBg.mode === 'solid'}
            <div class="row">
              <label for="userBgColor">Colour</label>
              <input id="userBgColor" type="color" bind:value={draftUserBg.color} />
            </div>
          {:else if draftUserBg.mode === 'image'}
            <div class="row">
              <label for="userBgFile">Upload image (JPEG/PNG/WebP)</label>
              <input id="userBgFile" type="file" accept="image/jpeg,image/png,image/webp" onchange={handleUserBgUpload} disabled={uploading} />
            </div>
            <div class="row">
              <label for="userBgFit">Fit</label>
              <select id="userBgFit" bind:value={draftUserBg.fit}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
              </select>
            </div>
            <div class="row">
              <label for="userBgDim">Dim ({draftUserBg.dim}%)</label>
              <input id="userBgDim" type="range" min="0" max="75" step="5" bind:value={draftUserBg.dim} />
            </div>
            <div class="row">
              <label for="userBgBlur">Background blur ({draftUserBg.blur}px)</label>
              <input id="userBgBlur" type="range" min="0" max="20" step="2" bind:value={draftUserBg.blur} />
            </div>
          {/if}
        </section>

        <section class="section">
          <h3>Grid (Free-Placement Canvas)</h3>
          <div class="row">
            <label for="colW">Column width ({draftUser.gridColumnWidth}px)</label>
            <input id="colW" type="range" min="48" max="240" step="4" bind:value={draftUser.gridColumnWidth} />
          </div>
          <div class="row">
            <label for="cellH">Cell height ({draftUser.gridCellHeight}px)</label>
            <input id="cellH" type="range" min="32" max="180" step="4" bind:value={draftUser.gridCellHeight} />
          </div>
          <div class="row">
            <label for="gap">Gap ({draftUser.gridGap}px)</label>
            <input id="gap" type="range" min="0" max="28" step="2" bind:value={draftUser.gridGap} />
          </div>
          <div class="row">
            <label><input type="checkbox" bind:checked={draftUser.moveSnapping} /> Move snapping</label>
          </div>
          <div class="row">
            <label><input type="checkbox" bind:checked={draftUser.resizeSnapping} /> Resize snapping</label>
          </div>
          <div class="row">
            <label><input type="checkbox" bind:checked={draftUser.autoArrange} /> Auto-arrange (dense packing)</label>
          </div>
          <div class="row">
            <label><input type="checkbox" bind:checked={draftUser.dashboardInfiniteCycle} /> Infinite cycling through dashboards (wrap at start/end)</label>
          </div>
        </section>

        <div class="footer-actions">
          {#if onOpenDashboards}
            <button type="button" onclick={onOpenDashboards}>
              <Icon name="view-dashboard" size={18} /> Manage Dashboards
            </button>
          {/if}
          <button type="button" class="primary" onclick={saveAppearance} disabled={saving}>
            {saving ? 'Saving...' : 'Save Appearance & Grid'}
          </button>
        </div>

      {:else if activeTab === 'account'}
        <section class="section">
          <h3>Password for {currentUser.displayName}</h3>
          <p class="muted">Changing or removing your password signs out your other devices.</p>
          {#if currentUser.hasPassword}
            <div class="row">
              <label for="curPw">Current password</label>
              <input id="curPw" type="password" bind:value={currentPw} />
            </div>
          {/if}
          <div class="row">
            <label for="newPw">New password</label>
            <input id="newPw" type="password" bind:value={newPw} placeholder="Enter new password" />
          </div>
          {#if pwErr}<div class="error-text">{pwErr}</div>{/if}
          {#if pwMsg}<div class="ok-text">{pwMsg}</div>{/if}
          <div class="footer-actions">
            {#if currentUser.hasPassword}
              <button type="button" class="danger" onclick={() => saveOwnPassword(true)} disabled={saving}>
                Remove Password
              </button>
            {/if}
            <button type="button" class="primary" onclick={() => saveOwnPassword(false)} disabled={saving || !newPw}>
              Update Password
            </button>
          </div>
        </section>

      {:else if activeTab === 'site' && currentUser.role === 'admin'}
        <section class="section">
          <h3>Site Defaults &amp; Security</h3>
          <div class="row">
            <label for="siteTheme">Default theme</label>
            <select id="siteTheme" bind:value={draftSite.defaultTheme}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div class="row">
            <label for="siteBgMode">Default background</label>
            <select id="siteBgMode" bind:value={draftSiteBg.mode}>
              <option value="theme">Theme default</option>
              <option value="solid">Solid colour</option>
              <option value="image">Uploaded image</option>
            </select>
          </div>
          {#if draftSiteBg.mode === 'solid'}
            <div class="row">
              <label for="siteBgColor">Colour</label>
              <input id="siteBgColor" type="color" bind:value={draftSiteBg.color} />
            </div>
          {:else if draftSiteBg.mode === 'image'}
            <div class="row">
              <label for="siteBgFile">Upload site wallpaper</label>
              <input id="siteBgFile" type="file" accept="image/jpeg,image/png,image/webp" onchange={handleSiteBgUpload} disabled={uploading} />
            </div>
            <div class="row">
              <label for="siteBgDim">Dim ({draftSiteBg.dim}%)</label>
              <input id="siteBgDim" type="range" min="0" max="75" step="5" bind:value={draftSiteBg.dim} />
            </div>
          {/if}
          <div class="row">
            <label><input type="checkbox" bind:checked={draftSite.autoLoginEnabled} /> Remember last passwordless user per device (Auto-login)</label>
          </div>
          <div class="row">
            <label><input type="checkbox" bind:checked={draftSite.forceSecureCookies} /> Force secure cookies (for unusual reverse proxies)</label>
          </div>
          <div class="footer-actions">
            <button type="button" class="primary" onclick={saveSite} disabled={saving}>
              {saving ? 'Saving...' : 'Save Site Settings'}
            </button>
          </div>
        </section>

        <section class="section">
          <h3>Users</h3>
          {#if adminErr}<div class="error-text">{adminErr}</div>{/if}
          <div class="user-list">
            {#each users as u (u.id)}
              <div class="user-row">
                <div>
                  <strong>{u.displayName}</strong>
                  <span class="badge">{u.role}</span>
                  <span class="muted">{u.hasPassword ? 'Password set' : 'No password'}</span>
                </div>
                <div class="user-actions">
                  <button type="button" onclick={() => handleToggleRole(u)}>
                    Make {u.role === 'admin' ? 'User' : 'Admin'}
                  </button>
                  <button type="button" onclick={() => handleResetUserPw(u)}>Password</button>
                  <button type="button" class="danger" onclick={() => handleDeleteUser(u)}>Delete</button>
                </div>
              </div>
            {/each}
          </div>

          <form class="add-user" onsubmit={handleCreateUser}>
            <input type="text" bind:value={newUserName} placeholder="Display name" required />
            <select bind:value={newUserRole}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <input type="password" bind:value={newUserPw} placeholder="Password (optional)" />
            <button type="submit" class="primary">
              <Icon name="account-plus" size={18} /> Add User
            </button>
          </form>
        </section>

      {:else if activeTab === 'addons' && currentUser.role === 'admin'}
        <AddonManagerTab
          overview={addonOverview}
          onRefresh={onRefreshAddons}
          {onNotify}
        />

      {:else if activeTab === 'about'}
        <section class="section">
          <h3>Version Info</h3>
          {#if hasVersionMismatch}
            <div class="mismatch-box">
              <strong>Version mismatch detected!</strong> Reload the browser to load the matching frontend build.
            </div>
          {/if}
          <div class="kv"><span>Frontend version</span><code>{frontendVersion}</code></div>
          {#if serverVersionInfo}
            <div class="kv"><span>Server version</span><code>{serverVersionInfo.version}</code></div>
            <div class="kv"><span>Build number</span><code>{serverVersionInfo.buildNumber}</code></div>
            <div class="kv"><span>Build date (UTC)</span><code>{serverVersionInfo.buildDate}</code></div>
            <div class="kv"><span>Configuration</span><code>{serverVersionInfo.configuration}</code></div>
            <div class="kv"><span>Build machine</span><code>{serverVersionInfo.machineName}</code></div>
            {#if serverVersionInfo.gitCommit}
              <div class="kv"><span>Git commit</span><code>{serverVersionInfo.gitCommit}{serverVersionInfo.gitDirty ? ' (dirty)' : ''}</code></div>
            {/if}
          {:else}
            <p class="muted">Server version not loaded.</p>
          {/if}
        </section>
      {/if}
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
    max-width: 680px;
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
  .tabs {
    display: flex;
    gap: 6px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--tw-border);
    overflow-x: auto;
  }
  .tabs button {
    min-height: 36px;
    font-size: 0.86rem;
    background: transparent;
  }
  .tabs button.active {
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
    border-color: transparent;
  }
  .modal-body {
    padding: 16px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--tw-border);
  }
  .section:last-child {
    border-bottom: none;
  }
  .section h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 0.9rem;
  }
  .row label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .footer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .user-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .user-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--tw-surface-elevated);
    border: 1px solid var(--tw-border);
    font-size: 0.88rem;
  }
  .user-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .user-actions button {
    min-height: 34px;
    padding: 0 10px;
    font-size: 0.82rem;
  }
  .badge {
    display: inline-block;
    margin: 0 6px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.74rem;
    background: var(--tw-accent);
    color: var(--tw-accent-contrast);
  }
  .add-user {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .add-user input {
    flex: 1 1 140px;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.9rem;
    padding: 4px 0;
  }
  .kv code {
    font-family: var(--tw-font-mono);
  }
  .ok-text {
    color: var(--tw-state-normal);
    font-size: 0.88rem;
  }
  .mismatch-box {
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--tw-state-warning);
    color: #ffffff;
    font-size: 0.9rem;
  }
</style>
