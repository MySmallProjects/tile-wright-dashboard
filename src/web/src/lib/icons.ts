import {
  mdiAccount,
  mdiAccountPlus,
  mdiAlert,
  mdiArrowDown,
  mdiArrowUp,
  mdiBed,
  mdiChartLine,
  mdiCheck,
  mdiChevronDown,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClockOutline,
  mdiClose,
  mdiCog,
  mdiContentCopy,
  mdiDelete,
  mdiDownload,
  mdiFlower,
  mdiGarage,
  mdiHome,
  mdiImage,
  mdiLightningBolt,
  mdiLock,
  mdiLogout,
  mdiNoteTextOutline,
  mdiOfficeBuilding,
  mdiPencil,
  mdiPin,
  mdiPinOff,
  mdiPlus,
  mdiRefresh,
  mdiShieldAccount,
  mdiSilverwareForkKnife,
  mdiSofa,
  mdiTelevision,
  mdiThemeLightDark,
  mdiUpload,
  mdiViewDashboard,
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWhiteBalanceSunny
} from '@mdi/js';

const ICON_MAP: Record<string, string> = {
  account: mdiAccount,
  'account-plus': mdiAccountPlus,
  alert: mdiAlert,
  'arrow-down': mdiArrowDown,
  'arrow-up': mdiArrowUp,
  bed: mdiBed,
  'chart-line': mdiChartLine,
  check: mdiCheck,
  'chevron-down': mdiChevronDown,
  'chevron-left': mdiChevronLeft,
  'chevron-right': mdiChevronRight,
  'clock-outline': mdiClockOutline,
  close: mdiClose,
  cog: mdiCog,
  'content-copy': mdiContentCopy,
  delete: mdiDelete,
  download: mdiDownload,
  flower: mdiFlower,
  garage: mdiGarage,
  home: mdiHome,
  image: mdiImage,
  'lightning-bolt': mdiLightningBolt,
  lock: mdiLock,
  logout: mdiLogout,
  'note-text-outline': mdiNoteTextOutline,
  'office-building': mdiOfficeBuilding,
  pencil: mdiPencil,
  pin: mdiPin,
  'pin-off': mdiPinOff,
  plus: mdiPlus,
  refresh: mdiRefresh,
  'shield-account': mdiShieldAccount,
  'silverware-fork-knife': mdiSilverwareForkKnife,
  sofa: mdiSofa,
  television: mdiTelevision,
  'theme-light-dark': mdiThemeLightDark,
  upload: mdiUpload,
  'view-dashboard': mdiViewDashboard,
  'weather-night': mdiWeatherNight,
  'weather-partly-cloudy': mdiWeatherPartlyCloudy,
  'white-balance-sunny': mdiWhiteBalanceSunny
};

export const DASHBOARD_ICON_CHOICES = [
  'home',
  'view-dashboard',
  'sofa',
  'silverware-fork-knife',
  'bed',
  'office-building',
  'garage',
  'flower',
  'lightning-bolt',
  'weather-partly-cloudy',
  'television',
  'chart-line'
];

import type { AddonIconItem, AddonIconPack } from '../types';

export type ResolvedIcon =
  | { kind: 'svg'; path: string }
  | { kind: 'image'; url: string; label: string; color: boolean };

let registeredPacks: AddonIconPack[] = [];
const addonIconIndex = new Map<string, AddonIconItem>();

export function registerAddonIconPacks(packs: AddonIconPack[]): void {
  registeredPacks = packs ?? [];
  addonIconIndex.clear();
  for (const pack of registeredPacks) {
    for (const ic of pack.icons) {
      addonIconIndex.set(ic.refId.toLowerCase(), ic);
    }
  }
}

export function getAddonIconPacks(): AddonIconPack[] {
  return registeredPacks;
}

export function resolveMdiPath(name: string | null | undefined): string {
  if (!name) return mdiViewDashboard;
  const clean = name.replace(/^mdi:/i, '').trim().toLowerCase();
  return ICON_MAP[clean] ?? mdiViewDashboard;
}

export function resolveIcon(ref: string | null | undefined): ResolvedIcon {
  if (ref) {
    const key = ref.trim().toLowerCase();
    const imgIcon = addonIconIndex.get(key);
    if (imgIcon) {
      return { kind: 'image', url: imgIcon.imageUrl, label: imgIcon.label, color: imgIcon.color };
    }
  }
  return { kind: 'svg', path: resolveMdiPath(ref) };
}

export function listAvailableIcons(): string[] {
  return Object.keys(ICON_MAP);
}
