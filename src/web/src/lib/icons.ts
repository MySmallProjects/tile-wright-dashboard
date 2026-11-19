import {
  mdiAccount,
  mdiAccountPlus,
  mdiAlert,
  mdiCheck,
  mdiClockOutline,
  mdiClose,
  mdiCog,
  mdiDelete,
  mdiHome,
  mdiImage,
  mdiLock,
  mdiLogout,
  mdiNoteTextOutline,
  mdiPencil,
  mdiPin,
  mdiPinOff,
  mdiPlus,
  mdiRefresh,
  mdiShieldAccount,
  mdiThemeLightDark,
  mdiViewDashboard,
  mdiWeatherNight,
  mdiWhiteBalanceSunny
} from '@mdi/js';

const ICON_MAP: Record<string, string> = {
  account: mdiAccount,
  'account-plus': mdiAccountPlus,
  alert: mdiAlert,
  check: mdiCheck,
  'clock-outline': mdiClockOutline,
  close: mdiClose,
  cog: mdiCog,
  delete: mdiDelete,
  home: mdiHome,
  image: mdiImage,
  lock: mdiLock,
  logout: mdiLogout,
  'note-text-outline': mdiNoteTextOutline,
  pencil: mdiPencil,
  pin: mdiPin,
  'pin-off': mdiPinOff,
  plus: mdiPlus,
  refresh: mdiRefresh,
  'shield-account': mdiShieldAccount,
  'theme-light-dark': mdiThemeLightDark,
  'view-dashboard': mdiViewDashboard,
  'weather-night': mdiWeatherNight,
  'white-balance-sunny': mdiWhiteBalanceSunny
};

export function resolveMdiPath(name: string | null | undefined): string {
  if (!name) return mdiViewDashboard;
  const clean = name.replace(/^mdi:/i, '').trim().toLowerCase();
  return ICON_MAP[clean] ?? mdiViewDashboard;
}

export function listAvailableIcons(): string[] {
  return Object.keys(ICON_MAP);
}
