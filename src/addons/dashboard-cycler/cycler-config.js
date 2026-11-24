export const CONFIG_CHANGED_EVENT = 'tw-dashboard-cycler:config-changed';

export const MIN_INTERVAL_SECONDS = 5;
export const MAX_INTERVAL_SECONDS = 3600;
export const MIN_IDLE_SECONDS = 0;
export const MAX_IDLE_SECONDS = 3600;

export const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  intervalSeconds: 60,
  pauseOnInteraction: true,
  idleResumeSeconds: 60,
  showPagerButton: true,
  includedDashboardIds: null
});

export function storageKeyForUser(userId) {
  return `tw_addon_dashboard_cycler_${userId || 'default'}`;
}

function clampInt(val, fallback, min, max) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function normalizeConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let includedDashboardIds = null;
  if (Array.isArray(src.includedDashboardIds)) {
    const seen = new Set();
    const cleaned = [];
    for (const item of src.includedDashboardIds) {
      if (typeof item === 'string' && item.trim() && !seen.has(item)) {
        seen.add(item);
        cleaned.push(item);
      }
    }
    includedDashboardIds = cleaned;
  }

  return {
    enabled: Boolean(src.enabled),
    intervalSeconds: clampInt(
      src.intervalSeconds,
      DEFAULT_CONFIG.intervalSeconds,
      MIN_INTERVAL_SECONDS,
      MAX_INTERVAL_SECONDS
    ),
    pauseOnInteraction:
      src.pauseOnInteraction === undefined ? DEFAULT_CONFIG.pauseOnInteraction : Boolean(src.pauseOnInteraction),
    idleResumeSeconds: clampInt(
      src.idleResumeSeconds,
      DEFAULT_CONFIG.idleResumeSeconds,
      MIN_IDLE_SECONDS,
      MAX_IDLE_SECONDS
    ),
    showPagerButton:
      src.showPagerButton === undefined ? DEFAULT_CONFIG.showPagerButton : Boolean(src.showPagerButton),
    includedDashboardIds
  };
}

export function loadCyclerConfig(userId, storage = globalThis.localStorage) {
  if (!storage) return normalizeConfig(DEFAULT_CONFIG);
  try {
    const raw = storage.getItem(storageKeyForUser(userId));
    if (!raw) return normalizeConfig(DEFAULT_CONFIG);
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return normalizeConfig(DEFAULT_CONFIG);
  }
}

export function saveCyclerConfig(userId, config, storage = globalThis.localStorage) {
  const normalized = normalizeConfig(config);
  if (storage) {
    try {
      storage.setItem(storageKeyForUser(userId), JSON.stringify(normalized));
    } catch {
      // ignore quota/private-mode errors
    }
  }
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(
      new CustomEvent(CONFIG_CHANGED_EVENT, {
        detail: { userId: userId || 'default', config: normalized }
      })
    );
  }
  return normalized;
}

export function getRotationDashboards(dashboards, includedDashboardIds) {
  if (!Array.isArray(dashboards)) return [];
  const enabled = dashboards.filter((d) => d && d.enabled !== false);
  if (includedDashboardIds === null || includedDashboardIds === undefined) {
    return enabled;
  }
  const allow = new Set(includedDashboardIds);
  return enabled.filter((d) => allow.has(d.id));
}

export function getNextDashboardId(rotationDashboards, activeDashboardId) {
  if (!Array.isArray(rotationDashboards) || rotationDashboards.length < 2) {
    return null;
  }
  const idx = rotationDashboards.findIndex((d) => d.id === activeDashboardId);
  if (idx < 0) {
    return rotationDashboards[0].id;
  }
  return rotationDashboards[(idx + 1) % rotationDashboards.length].id;
}

export function formatDurationCompact(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}
