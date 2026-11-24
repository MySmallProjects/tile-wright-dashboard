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

export interface SelectOptionSpec {
  value: string;
  label: string;
}

export interface SettingsFieldSchema {
  key: string;
  label: string;
  type:
    | 'text'
    | 'multiline'
    | 'number'
    | 'toggle'
    | 'select'
    | 'colour'
    | 'icon'
    | 'url'
    | 'duration'
    | 'secret'
    | 'group';
  helpText?: string | null;
  helpLinkUrl?: string | null;
  helpLinkLabel?: string | null;
  defaultValue?: unknown;
  required?: boolean;
  min?: number | null;
  max?: number | null;
  pattern?: string | null;
  options?: SelectOptionSpec[] | null;
  dynamicOptionsEndpoint?: string | null;
  fields?: SettingsFieldSchema[] | null;
  visibleWhen?: FieldVisibilityCondition | null;
}

export interface FieldVisibilityCondition {
  key: string;
  equals?: unknown;
}

export interface TileElementSpec {
  tagName: string;
  script: string;
}

export interface TileSizeSpec {
  w: number;
  h: number;
}

export interface TileTypeContribution {
  id: string;
  name: string;
  description: string;
  icon: string;
  element: TileElementSpec;
  settingsElement?: TileElementSpec | null;
  defaultSize: TileSizeSpec;
  minSize: TileSizeSpec;
  maxSize: TileSizeSpec;
  settingsSchema: SettingsFieldSchema[];
}

export interface ThemeContribution {
  id: string;
  name: string;
  cssFile: string;
  preferredIconPack?: string | null;
}

export interface SettingsTabContribution {
  id: string;
  label: string;
  scope: 'user' | 'admin' | string;
  element: TileElementSpec;
}

export interface AddonContributions {
  tiles: TileTypeContribution[];
  themes: ThemeContribution[];
  settingsTabs?: SettingsTabContribution[];
  addonSettingsSchema: SettingsFieldSchema[];
}

export interface AddonInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  builtIn: boolean;
  state: 'enabled' | 'disabled' | 'failed' | 'pending-install' | 'pending-removal';
  error?: string | null;
  forcedDisabled: boolean;
  contributes: AddonContributions;
}

export interface AddonTile {
  addonId: string;
  addonName: string;
  addonVersion: string;
  tileTypeId: string;
  spec: TileTypeContribution;
}

export interface AddonIconItem {
  refId: string;
  name: string;
  label: string;
  imageUrl: string;
  color: boolean;
}

export interface AddonIconPack {
  addonId: string;
  packId: string;
  packName: string;
  icons: AddonIconItem[];
}

export interface AddonOverview {
  restartRequired: boolean;
  addons: AddonInfo[];
  availableTiles: AddonTile[];
  iconPacks: AddonIconPack[];
}
