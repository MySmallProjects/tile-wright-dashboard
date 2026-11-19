import type {
  AuthStatus,
  BackgroundSettings,
  DashboardDetail,
  DashboardSummary,
  PublicUser,
  SiteSettings,
  TileLayoutItem,
  UserSettings,
  VersionInfo
} from '../types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore non-json error body
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const api = {
  // System
  getVersion: () => request<VersionInfo>('/api/version'),

  // Auth
  getAuthStatus: () => request<AuthStatus>('/api/auth/status'),
  getLoginUsers: () => request<PublicUser[]>('/api/auth/users'),
  setupAdmin: (displayName: string, password: string | null) =>
    request<PublicUser>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ displayName, password: password || null })
    }),
  login: (userId: string, password: string | null) =>
    request<PublicUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ userId, password: password || null })
    }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  changeOwnPassword: (currentPassword: string | null, newPassword: string | null) =>
    request<void>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword: currentPassword || null, newPassword: newPassword || null })
    }),

  // Site settings
  getSiteSettings: () => request<SiteSettings>('/api/site'),
  saveSiteSettings: (settings: SiteSettings) =>
    request<SiteSettings>('/api/site', {
      method: 'PUT',
      body: JSON.stringify(settings)
    }),

  // User settings
  getUserSettings: () => request<UserSettings>('/api/user/settings'),
  saveUserSettings: (settings: UserSettings) =>
    request<UserSettings>('/api/user/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    }),

  // Admin user management
  listUsers: () => request<PublicUser[]>('/api/users'),
  createUser: (displayName: string, role: 'admin' | 'user', password: string | null) =>
    request<PublicUser>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ displayName, role, password: password || null })
    }),
  updateUser: (id: string, displayName: string, role: 'admin' | 'user') =>
    request<PublicUser>(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ displayName, role })
    }),
  resetUserPassword: (id: string, newPassword: string | null) =>
    request<void>(`/api/users/${encodeURIComponent(id)}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword: newPassword || null })
    }),
  deleteUser: (id: string) =>
    request<void>(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Dashboards
  listDashboards: () => request<DashboardSummary[]>('/api/dashboards'),
  getDashboard: (id: string) => request<DashboardDetail>(`/api/dashboards/${encodeURIComponent(id)}`),
  createDashboard: (name: string, icon: string | null) =>
    request<DashboardSummary>('/api/dashboards', {
      method: 'POST',
      body: JSON.stringify({ name, icon })
    }),
  updateDashboard: (
    id: string,
    name: string,
    icon: string | null,
    backgroundOverride: BackgroundSettings | null,
    enabled?: boolean
  ) =>
    request<DashboardSummary>(`/api/dashboards/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name, icon, backgroundOverride, enabled })
    }),
  reorderDashboards: (orderedIds: string[]) =>
    request<DashboardSummary[]>('/api/dashboards/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds })
    }),
  duplicateDashboard: (id: string, name?: string) =>
    request<DashboardSummary>(`/api/dashboards/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name: name || null })
    }),
  deleteDashboard: (id: string) =>
    request<void>(`/api/dashboards/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveLayout: (id: string, tiles: TileLayoutItem[]) =>
    request<TileLayoutItem[]>(`/api/dashboards/${encodeURIComponent(id)}/layout`, {
      method: 'PUT',
      body: JSON.stringify({ tiles })
    }),
  saveTileSettings: (dashboardId: string, tileId: string, settings: Record<string, unknown>) =>
    request<Record<string, unknown>>(
      `/api/dashboards/${encodeURIComponent(dashboardId)}/tiles/${encodeURIComponent(tileId)}/settings`,
      { method: 'PUT', body: JSON.stringify(settings) }
    ),
  saveTileData: (dashboardId: string, tileId: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(
      `/api/dashboards/${encodeURIComponent(dashboardId)}/tiles/${encodeURIComponent(tileId)}/data`,
      { method: 'PUT', body: JSON.stringify(data) }
    ),

  // Backgrounds
  uploadUserBackground: async (file: File): Promise<{ imageId: string }> => {
    const form = new FormData();
    form.append('file', file);
    return request<{ imageId: string }>('/api/backgrounds/user', {
      method: 'POST',
      body: form
    });
  },
  uploadSiteBackground: async (file: File): Promise<{ imageId: string }> => {
    const form = new FormData();
    form.append('file', file);
    return request<{ imageId: string }>('/api/backgrounds/site', {
      method: 'POST',
      body: form
    });
  }
};
