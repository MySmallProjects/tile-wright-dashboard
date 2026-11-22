import type { AddonInfo } from '../types';

const loadedScripts = new Map<string, Promise<void>>();
const loadedThemes = new Set<string>();

/**
 * Lazily loads an addon's ES module script once (only for tile types or custom settings actually in use).
 */
export function ensureAddonScriptLoaded(addonId: string, scriptPath: string): Promise<void> {
  const versionParam = encodeURIComponent(__APP_VERSION__);
  const url = `/api/addons/${encodeURIComponent(addonId)}/assets/${scriptPath.replace(/^\/+/, '')}?v=${versionParam}`;
  const existing = loadedScripts.get(url);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.type = 'module';
    el.src = url;
    el.onload = () => resolve();
    el.onerror = () => {
      loadedScripts.delete(url);
      reject(new Error(`Failed to load addon script: ${url}`));
    };
    document.head.appendChild(el);
  });

  loadedScripts.set(url, promise);
  return promise;
}

/**
 * Loads CSS files contributed by enabled theme addons.
 */
export function syncAddonThemeStylesheets(addons: AddonInfo[]): void {
  const versionParam = encodeURIComponent(__APP_VERSION__);
  for (const addon of addons) {
    if (addon.state !== 'enabled') continue;
    for (const theme of addon.contributes.themes ?? []) {
      const url = `/api/addons/${encodeURIComponent(addon.id)}/assets/${theme.cssFile.replace(/^\/+/, '')}?v=${versionParam}`;
      if (loadedThemes.has(url)) continue;
      loadedThemes.add(url);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.dataset.addonTheme = `${addon.id}:${theme.id}`;
      document.head.appendChild(link);
    }
  }
}
