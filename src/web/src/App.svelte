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
    DashboardDetail,
    DashboardSummary,
    PublicUser,
    SiteSettings,
    UserSettings,
    VersionInfo
  } from './types';
  import DashboardGrid from './components/DashboardGrid.svelte';
  import DashboardManagerModal from './components/DashboardManagerModal.svelte';
  import DashboardPager from './components/DashboardPager.svelte';
  import DashboardSwitcher from './components/DashboardSwitcher.svelte';
  import FirstRunSetup from './components/FirstRunSetup.svelte';
  import Icon from './components/Icon.svelte';
  import LoginScreen from './components/LoginScreen.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import VersionBanner from './components/VersionBanner.svelte';

  const AUTOLOGIN_KEY = 'tw_autologin_user_id';
  const lastDashboardKey = (userId: string) => `tw_last_dashboard_${userId}`;
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
    backdropBlur: false,
    dashboardInfiniteCycle: true
  });
  let dashboards = $state<DashboardSummary[]>([]);
  let enabledDashboards = $derived(dashboards.filter((d) => d.enabled !== false));
  let activeDashboard = $state<DashboardDetail | null>(null);
  let editMode = $state(false);
  let showSettings = $state(false);
  let showDashboardManager = $state(false);
  let serverVersionInfo = $state<VersionInfo | null>(null);
  let serverVersion = $state<string | null>(null);
  let hubConnected = $state(false);
  let toastMsg = $state('');
  let toastTimer: number | null = null;
  let swipeStart: { x: number; y: number; time: number } | null = null;

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

  async function selectDashboard(id: string) {
    if (editMode || !currentUser) return;
    try {
      const detail = await api.getDashboard(id);
      activeDashboard = detail;
      localStorage.setItem(lastDashboardKey(currentUser.id), detail.summary.id);
    } catch {
      notify('Could not load dashboard.');
    }
  }

  function stepDashboard(delta: number) {
    if (editMode || enabledDashboards.length <= 1 || !activeDashboard) return;
    const idx = enabledDashboards.findIndex((d) => d.id === activeDashboard?.summary.id);
    if (idx < 0) return;

    if (userSettings.dashboardInfiniteCycle !== false) {
      const nextIdx = (idx + delta + enabledDashboards.length) % enabledDashboards.length;
      void selectDashboard(enabledDashboards[nextIdx].id);
    } else {
      const nextIdx = idx + delta;
      if (nextIdx >= 0 && nextIdx < enabledDashboards.length) {
        void selectDashboard(enabledDashboards[nextIdx].id);
      }
    }
  }

  async function handleDashboardsChanged(nextList: DashboardSummary[], switchToId?: string) {
    dashboards = nextList;
    const nextEnabled = nextList.filter((d) => d.enabled !== false);
    const currentStillEnabled =
      activeDashboard && nextEnabled.some((d) => d.id === activeDashboard?.summary.id);
    const targetId =
      switchToId ??
      (currentStillEnabled ? activeDashboard!.summary.id : nextEnabled[0]?.id ?? nextList[0]?.id);

    if (targetId) {
      await selectDashboard(targetId);
    } else {
      activeDashboard = null;
    }
  }

  async function loadUserWorkspace(user: PublicUser) {
    currentUser = user;
    if (!user.hasPassword) {
      localStorage.setItem(AUTOLOGIN_KEY, user.id);
    }

    const [uSettings, list] = await Promise.all([
      api.getUserSettings(),
      api.listDashboards()
    ]);

    userSettings = uSettings;
    dashboards = list;

    const enabled = list.filter((d) => d.enabled !== false);
    if (enabled.length > 0) {
      const rememberedId = localStorage.getItem(lastDashboardKey(user.id));
      const initialId = enabled.some((d) => d.id === rememberedId) ? rememberedId! : enabled[0].id;
      activeDashboard = await api.getDashboard(initialId);
      localStorage.setItem(lastDashboardKey(user.id), activeDashboard.summary.id);
    } else if (list.length > 0) {
      activeDashboard = await api.getDashboard(list[0].id);
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
    dashboards = [];
    activeDashboard = null;
    editMode = false;
    showSettings = false;
    showDashboardManager = false;
  }

  // Horizontal swipe gesture (view mode only, ignores inputs/textareas including Shadow DOM)
  function isInteractiveTarget(e: PointerEvent): boolean {
    const path = e.composedPath();
    for (const node of path) {
      if (node instanceof HTMLElement) {
        const tag = node.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') {
          return true;
        }
      }
    }
    return false;
  }

  function handlePointerDown(e: PointerEvent) {
    if (editMode || showSettings || showDashboardManager || enabledDashboards.length <= 1) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isInteractiveTarget(e)) return;
    swipeStart = { x: e.clientX, y: e.clientY, time: Date.now() };
  }

  function handlePointerUp(e: PointerEvent) {
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    const dt = Date.now() - swipeStart.time;
    swipeStart = null;

    if (editMode || showSettings || showDashboardManager || enabledDashboards.length <= 1) return;
    if (dt < 600 && Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      stepDashboard(dx < 0 ? 1 : -1);
    }
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (editMode || showSettings || showDashboardManager || !currentUser || enabledDashboards.length <= 1) return;
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLElement) {
        const tag = activeEl.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl.isContentEditable) return;
        // Also skip if a shadow host (e.g. tw-note-tile) has an active textarea focused
        if (activeEl.shadowRoot?.activeElement?.tagName === 'TEXTAREA') return;
      }
      if (e.key === 'ArrowRight') stepDashboard(1);
      if (e.key === 'ArrowLeft') stepDashboard(-1);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      mq?.removeEventListener('change', onSchemeChange);
      window.removeEventListener('keydown', onKeyDown);
    };
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
        <DashboardSwitcher
          dashboards={enabledDashboards}
          activeId={activeDashboard?.summary.id ?? null}
          disabled={editMode}
          onSelect={(id) => void selectDashboard(id)}
          onManage={() => (showDashboardManager = true)}
        />
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

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="dashboard-viewport"
      onpointerdown={handlePointerDown}
      onpointerup={handlePointerUp}
      onpointercancel={() => (swipeStart = null)}
    >
      {#if activeDashboard}
        {#key activeDashboard.summary.id}
          <DashboardGrid
            dashboard={activeDashboard}
            {userSettings}
            {editMode}
            onEnterEdit={() => (editMode = true)}
            onExitEdit={() => (editMode = false)}
            onDashboardChanged={(updated) => (activeDashboard = updated)}
            onNotify={notify}
          />
        {/key}
      {/if}
    </div>

    <DashboardPager
      dashboards={enabledDashboards}
      activeId={activeDashboard?.summary.id ?? null}
      {editMode}
      infiniteCycle={userSettings.dashboardInfiniteCycle !== false}
      onSelect={(id) => void selectDashboard(id)}
    />

    {#if showDashboardManager}
      <DashboardManagerModal
        {dashboards}
        activeId={activeDashboard?.summary.id ?? null}
        onClose={() => (showDashboardManager = false)}
        onChanged={(list, nextId) => void handleDashboardsChanged(list, nextId)}
        onSelect={(id) => void selectDashboard(id)}
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
        onOpenDashboards={() => {
          showSettings = false;
          showDashboardManager = true;
        }}
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
  .dashboard-viewport {
    flex: 1;
    display: flex;
    flex-direction: column;
    touch-action: pan-y;
    padding-bottom: 56px;
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
    bottom: 68px;
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
