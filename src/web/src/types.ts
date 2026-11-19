export interface BackgroundSettings {
  mode: 'theme' | 'solid' | 'image';
  color?: string | null;
  imageId?: string | null;
  fit: 'cover' | 'contain';
  blur: number;
  dim: number;
}

export interface SiteSettings {
  defaultTheme: string;
  defaultBackground: BackgroundSettings;
  forceSecureCookies: boolean;
  autoLoginEnabled: boolean;
}

export interface PublicUser {
  id: string;
  displayName: string;
  role: 'admin' | 'user';
  hasPassword: boolean;
  createdAt: string;
}

export interface AuthStatus {
  needsSetup: boolean;
  authenticated: boolean;
  user: PublicUser | null;
  isHttps: boolean;
  autoLoginEnabled: boolean;
  defaultTheme: string;
  defaultBackground: BackgroundSettings;
}

export interface UserSettings {
  theme: string;
  background?: BackgroundSettings | null;
  gridColumnWidth: number;
  gridCellHeight: number;
  gridGap: number;
  moveSnapping: boolean;
  resizeSnapping: boolean;
  autoArrange: boolean;
  tileOpacity: number;
  tileBorder: boolean;
  backdropBlur: boolean;
  dashboardInfiniteCycle: boolean;
}

export interface DashboardSummary {
  id: string;
  name: string;
  icon?: string | null;
  order: number;
  enabled: boolean;
  backgroundOverride?: BackgroundSettings | null;
}

export interface TileLayoutItem {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pinned: boolean;
  order: number;
}

export interface DashboardDetail {
  summary: DashboardSummary;
  tiles: TileLayoutItem[];
  tileSettings: Record<string, Record<string, unknown>>;
  tileData: Record<string, Record<string, unknown>>;
}

export interface VersionInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
  buildNumber: number;
  buildDate: string;
  configuration: string;
  machineName: string;
  gitCommit?: string;
  gitDirty?: boolean;
}
