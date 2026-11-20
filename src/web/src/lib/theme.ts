import type { BackgroundSettings, SiteSettings, UserSettings } from '../types';

export function resolveThemeName(themePref: string | null | undefined): string {
  if (!themePref) return 'light';
  if (themePref === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return themePref;
}

export function applyThemeAndSurface(
  themePref: string,
  userSettings?: UserSettings | null
): string {
  const resolved = resolveThemeName(themePref);
  document.documentElement.setAttribute('data-theme', resolved);

  const opacity = (userSettings?.tileOpacity ?? 88) / 100;
  const border = userSettings?.tileBorder ?? true;
  const blur = userSettings?.backdropBlur ?? false;

  document.documentElement.style.setProperty('--tw-tile-opacity', opacity.toFixed(2));
  document.documentElement.style.setProperty(
    '--tw-tile-border',
    border ? '1px solid var(--tw-border)' : '1px solid transparent'
  );
  document.documentElement.style.setProperty('--tw-tile-blur', blur ? '12px' : '0px');
  return resolved;
}

export interface EffectiveBackground {
  settings: BackgroundSettings;
  scope: 'user' | 'site';
}

/**
 * Precedence (§6.6): dashboard override > user background > site default > theme default.
 */
export function resolveEffectiveBackground(
  dashboardOverride?: BackgroundSettings | null,
  userBg?: BackgroundSettings | null,
  site?: SiteSettings | null
): EffectiveBackground {
  if (dashboardOverride && dashboardOverride.mode !== 'theme') {
    return { settings: dashboardOverride, scope: 'user' };
  }
  if (userBg && userBg.mode !== 'theme') {
    return { settings: userBg, scope: 'user' };
  }
  if (site?.defaultBackground && site.defaultBackground.mode !== 'theme') {
    return { settings: site.defaultBackground, scope: 'site' };
  }
  return {
    settings: { mode: 'theme', fit: 'cover', blur: 0, dim: 0 },
    scope: 'site'
  };
}

export function buildBackgroundStyles(effective: EffectiveBackground): {
  layerStyle: string;
  dimStyle: string;
} {
  const bg = effective.settings;
  const parts: string[] = [];

  if (bg.mode === 'solid' && bg.color) {
    parts.push(`background-color: ${bg.color}`);
    parts.push('background-image: none');
  } else if (bg.mode === 'image' && bg.imageId) {
    const url = `/api/backgrounds/${effective.scope}/${encodeURIComponent(bg.imageId)}`;
    parts.push(`background-image: url("${url}")`);
    parts.push(`background-size: ${bg.fit === 'contain' ? 'contain' : 'cover'}`);
    if (bg.blur > 0) {
      parts.push(`filter: blur(${bg.blur}px)`);
    }
  } else {
    parts.push('background-image: none');
  }

  const dim = bg.mode === 'image' ? Math.max(0, Math.min(80, bg.dim ?? 0)) / 100 : 0;
  return {
    layerStyle: parts.join('; '),
    dimStyle: `background: rgba(0, 0, 0, ${dim.toFixed(2)})`
  };
}
