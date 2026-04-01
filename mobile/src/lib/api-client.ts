import * as SecureStore from 'expo-secure-store';

const SECURE_KEYS = {
  ACCESS_TOKEN: 'capitalforge_access_token',
  REFRESH_TOKEN: 'capitalforge_refresh_token',
  USER_ID: 'capitalforge_user_id',
} as const;

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// ─── Token Storage ────────────────────────────────────────────────────────────

export const TokenStore = {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);
  },
  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
  },
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, accessToken),
      SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshToken),
    ]);
  },
  async clearTokens(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN),
      SecureStore.deleteItemAsync(SECURE_KEYS.USER_ID),
    ]);
  },
  async setUserId(userId: string): Promise<void> {
    return SecureStore.setItemAsync(SECURE_KEYS.USER_ID, userId);
  },
  async getUserId(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_KEYS.USER_ID);
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  statusCode: number;
}

// ─── Core Fetch with Auto-Refresh ─────────────────────────────────────────────

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await TokenStore.getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available');

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    await TokenStore.clearTokens();
    throw new Error('Session expired. Please log in again.');
  }

  const { data } = await response.json();
  await TokenStore.setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const accessToken = await TokenStore.getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Auto-refresh on 401
  if (response.status === 401 && retry) {
    if (isRefreshing) {
      // Queue this request until refresh completes
      const token = await new Promise<string>((resolve) => {
        refreshQueue.push(resolve);
      });
      return apiFetch<T>(path, { ...options, headers: { ...headers, Authorization: `Bearer ${token}` } }, false);
    }

    isRefreshing = true;
    try {
      const newToken = await refreshAccessToken();
      refreshQueue.forEach((resolve) => resolve(newToken));
      refreshQueue = [];
      isRefreshing = false;
      return apiFetch<T>(path, options, false);
    } catch (err) {
      refreshQueue = [];
      isRefreshing = false;
      throw err;
    }
  }

  if (!response.ok) {
    let errorBody: Partial<ApiError> = { statusCode: response.status };
    try {
      const json = await response.json();
      errorBody = { ...errorBody, ...json };
    } catch {
      errorBody.message = response.statusText;
    }
    throw errorBody as ApiError;
  }

  // Handle 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

// ─── Multipart Upload ─────────────────────────────────────────────────────────

async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const accessToken = await TokenStore.getAccessToken();

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: response.statusText }));
    throw { ...errorBody, statusCode: response.status } as ApiError;
  }

  return response.json() as Promise<T>;
}

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<ApiResponse<{ accessToken: string; refreshToken: string; user: unknown }>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    apiFetch<void>('/auth/logout', { method: 'POST' }),

  me: () =>
    apiFetch<ApiResponse<{ id: string; email: string; role: string; name: string }>>('/auth/me'),
};

// ─── Clients Endpoints ────────────────────────────────────────────────────────

export const clientsApi = {
  list: (params?: { search?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return apiFetch<ApiResponse<unknown[]>>(`/clients${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => apiFetch<ApiResponse<unknown>>(`/clients/${id}`),
};

// ─── Applications / Pipeline ──────────────────────────────────────────────────

export const applicationsApi = {
  list: (params?: { status?: string; page?: number }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return apiFetch<ApiResponse<unknown[]>>(`/applications${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => apiFetch<ApiResponse<unknown>>(`/applications/${id}`),
  approve: (id: string, notes?: string) =>
    apiFetch<ApiResponse<unknown>>(`/applications/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  decline: (id: string, reason: string) =>
    apiFetch<ApiResponse<unknown>>(`/applications/${id}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

// ─── Dashboard / KPIs ─────────────────────────────────────────────────────────

export const dashboardApi = {
  kpis: () => apiFetch<ApiResponse<{
    activeClients: number;
    pendingApplications: number;
    totalFundingDeployed: number;
    complianceScore: number;
  }>>('/dashboard/kpis'),

  recentActivity: () => apiFetch<ApiResponse<unknown[]>>('/dashboard/activity'),
};

// ─── Alerts ───────────────────────────────────────────────────────────────────

export const alertsApi = {
  list: () => apiFetch<ApiResponse<unknown[]>>('/alerts'),
  markRead: (id: string) =>
    apiFetch<void>(`/alerts/${id}/read`, { method: 'PATCH' }),
  markAllRead: () =>
    apiFetch<void>('/alerts/read-all', { method: 'PATCH' }),
};

// ─── Documents ────────────────────────────────────────────────────────────────

export const documentsApi = {
  upload: (clientId: string, type: string, uri: string, mimeType: string, filename: string) => {
    const formData = new FormData();
    formData.append('clientId', clientId);
    formData.append('type', type);
    // @ts-ignore — React Native FormData accepts uri-based file objects
    formData.append('file', { uri, type: mimeType, name: filename });
    return apiUpload<ApiResponse<{ id: string; url: string }>>('/documents/upload', formData);
  },
};

export default {
  auth: authApi,
  clients: clientsApi,
  applications: applicationsApi,
  dashboard: dashboardApi,
  alerts: alertsApi,
  documents: documentsApi,
};
