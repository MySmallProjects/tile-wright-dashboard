<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { api } from './lib/api';
  import { DashboardHubClient } from './lib/signalr';
  import {
    applyThemeAndSurface,
    buildBackgroundStyles,
    resolveEffectiveBackground
  } from './lib/theme';
  import type {
    AuthStatus,
    DashboardDetail,
    PublicUser,
    SiteSettings,
    UserSettings,
    VersionInfo
  } from './types';
  import DashboardGrid from './components/DashboardGrid.svelte';
  import FirstRunSetup from './components/FirstRunSetup.svelte';
  import Icon from './components/Icon.svelte';
  import LoginScreen from './components/LoginScreen.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import VersionBanner from './components/VersionBanner.svelte';

  const AUTOLOGIN_KEY = 'tw_autologin_user_id';
  const frontendVersion = __APP_VERSION__;

  const hub = new DashboardHubClient();

  let booting = $state(true);
  let needsSetup = $state(false);
  let currentUser = $state<PublicUser | null>(null);
  let siteSettings = $state<SiteSettings>({
    defaultTheme: 'light',
    defaultBackground: { mode: 'theme', fit: 'cover', blur: 0, dim: 25 },
    forceSecureCookies: false,
    autoLoginEnabled: false
  });
  let userSettings = $state<UserSettings>({
    theme: 'light',
    gridColumnWidth: 64,
    gridCellHeight: 64,
    gridGap: 10,
    moveSnapping: true,
    resizeSnapping: true,
    autoArrange: false,
    tileOpacity: 88,
    tileBorder: true,
    backdropBlur: false
  });
  let activeDashboard = $state<DashboardDetail | null>(null);
  let editMode = $state(false);
  let showSettings = $state(false);
  let serverVersionInfo = $state<VersionInfo | null>(null);
  let serverVersion = $state<string | null>(null);
  let hubConnected = $state(false);
  let toastMsg = $state('');
  let toastTimer: number | null = null;

  function notify(msg: string) {
    toastMsg = msg;
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastMsg = '';
    }, 2400);
  }

  let effectiveBg = $derived(
    resolveEffectiveBackground(
      activeDashboard?.summary.backgroundOverride,
      currentUser ? userSettings.background : null,
      siteSettings
    )
  );
  let bgStyles = $derived(buildBackgroundStyles(effectiveBg));

  // Keep theme & tile CSS custom properties synced
  $effect(() => {
    const themePref = currentUser ? userSettings.theme : siteSettings.defaultTheme;
    applyThemeAndSurface(themePref, currentUser ? userSettings : null);
  });

  async function refreshVersion() {
    try {
      const info = await api.getVersion();
      serverVersionInfo = info;
      serverVersion = info.version;
    } catch {
      // ignore offline transient error
    }
  }

  async function loadUserWorkspace(user: PublicUser) {
    currentUser = user;
    if (!user.hasPassword) {
      localStorage.setItem(AUTOLOGIN_KEY, user.id);
    }

    const [uSettings, dashboards] = await Promise.all([
      api.getUserSettings(),
      api.listDashboards()
    ]);

    userSettings = uSettings;
    if (dashboards.length > 0) {
      activeDashboard = await api.getDashboard(dashboards[0].id);
    } else {
      activeDashboard = null;
    }

    void hub.start({
      onServerVersion: (v) => {
        serverVersion = v;
        if (v !== frontendVersion) {
          void refreshVersion();
        }
      },
      onStateChange: (connected) => {
        hubConnected = connected;
      }
    });
  }

  async function boot() {
    booting = true;
    try {
      const [status, site] = await Promise.all([
        api.getAuthStatus(),
        api.getSiteSettings(),
        refreshVersion()
      ]);

      siteSettings = site;
      needsSetup = status.needsSetup;

      if (status.authenticated && status.user) {
        await loadUserWorkspace(status.user);
      } else if (!status.needsSetup && status.autoLoginEnabled) {
        const rememberedId = localStorage.getItem(AUTOLOGIN_KEY);
        if (rememberedId) {
          try {
            const autoUser = await api.login(rememberedId, null);
            await loadUserWorkspace(autoUser);
          } catch {
            localStorage.removeItem(AUTOLOGIN_KEY);
          }
        }
      }
    } finally {
      booting = false;
    }
  }

  async function handleLoggedIn(user: PublicUser) {
    needsSetup = false;
    await loadUserWorkspace(user);
  }

  async function handleLogout() {
    await hub.stop();
    localStorage.removeItem(AUTOLOGIN_KEY);
    try {
      await api.logout();
    } catch {
      // ignore
    }
    currentUser = null;
    activeDashboard = null;
    editMode = false;
    showSettings = false;
  }

  onMount(() => {
    void boot();
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSchemeChange = () => {
      const themePref = currentUser ? userSettings.theme : siteSettings.defaultTheme;
      if (themePref === 'system') {
        applyThemeAndSurface('system', currentUser ? userSettings : null);
      }
    };
    mq?.addEventListener('change', onSchemeChange);
    return () => mq?.removeEventListener('change', onSchemeChange);
  });

  onDestroy(() => {
    void hub.stop();
  });
</script>

<div class="bg-layer" style={bgStyles.layerStyle}></div>
<div class="bg-dim" style={bgStyles.dimStyle}></div>

<div class="app-root">
  <VersionBanner {frontendVersion} {serverVersion} />

  {#if booting}
    <div class="boot-screen">Loading Tilewright...</div>
  {:else if needsSetup}
    <FirstRunSetup onCreated={handleLoggedIn} />
  {:else if !currentUser}
    <LoginScreen onLoggedIn={handleLoggedIn} />
  {:else}
    <header class="topbar">
      <div class="topbar-left">
        <Icon name={activeDashboard?.summary.icon || 'view-dashboard'} size={22} />
        <span class="dash-name">{activeDashboard?.summary.name || 'Tilewright'}</span>
        <span class="hub-dot" class:connected={hubConnected} title={hubConnected ? 'Live connected' : 'Offline / reconnecting'}></span>
      </div>

      <div class="topbar-right">
        {#if !editMode}
          <button type="button" onclick={() => (editMode = true)} title="Edit dashboard layout">
            <Icon name="pencil" size={18} /> Edit
          </button>
        {/if}
        <button type="button" class="icon-btn" onclick={() => (showSettings = true)} aria-label="Settings" title="Settings">
          <Icon name="cog" size={20} />
        </button>
        <button type="button" class="icon-btn" onclick={handleLogout} aria-label="Log out" title="Log out ({currentUser.displayName})">
          <Icon name="logout" size={20} />
        </button>
      </div>
    </header>

    {#if activeDashboard}
      <DashboardGrid
        dashboard={activeDashboard}
        {userSettings}
        {editMode}
        onEnterEdit={() => (editMode = true)}
        onExitEdit={() => (editMode = false)}
        onDashboardChanged={(updated) => (activeDashboard = updated)}
        onNotify={notify}
      />
    {/if}

    {#if showSettings}
      <SettingsModal
        {currentUser}
        {userSettings}
        {siteSettings}
        {frontendVersion}
        {serverVersionInfo}
        onClose={() => (showSettings = false)}
        onUserSettingsSaved={(s) => (userSettings = s)}
        onSiteSettingsSaved={(s) => (siteSettings = s)}
        onNotify={notify}
      />
    {/if}
  {/if}
</div>

{#if toastMsg}
  <div class="toast" role="status" aria-live="polite">{toastMsg}</div>
{/if}

<style>
  .boot-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--tw-text-muted);
    font-size: 1rem;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 14px;
    background: var(--tw-chrome-bg);
    border-bottom: 1px solid var(--tw-border);
  }
  .topbar-left,
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dash-name {
    font-weight: 700;
    font-size: 1.05rem;
  }
  .hub-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--tw-text-muted);
    opacity: 0.5;
  }
  .hub-dot.connected {
    background: var(--tw-state-normal);
    opacity: 1;
  }
  .toast {
    position: fixed;
    bottom: 18px;
    right: 18px;
    z-index: 60;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--tw-surface-solid);
    color: var(--tw-text);
    border: 1px solid var(--tw-border);
    box-shadow: var(--tw-tile-shadow);
    font-size: 0.88rem;
  }
</style>
