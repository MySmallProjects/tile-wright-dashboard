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

export function resolveMdiPath(name: string | null | undefined): string {
  if (!name) return mdiViewDashboard;
  const clean = name.replace(/^mdi:/i, '').trim().toLowerCase();
  return ICON_MAP[clean] ?? mdiViewDashboard;
}

export function listAvailableIcons(): string[] {
  return Object.keys(ICON_MAP);
}
