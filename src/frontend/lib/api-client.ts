// ============================================================
// CapitalForge API Client
// ============================================================
// Fetch wrapper with:
//   - Auth token injection (localStorage → Authorization header)
//   - Configurable timeout + AbortController
//   - Typed ApiResponse<T> envelope
//   - ApiRequestError class with structured error payload
//   - 401 → auto clear token + redirect to /login
//   - Resource-level helpers for every backend domain

import type { ApiResponse, PaginationParams } from '../../shared/types';

// ─── Re-export core types ─────────────────────────────────────────────────────
export type { ApiResponse };

// ─── Error payload ────────────────────────────────────────────────────────────

export interface ApiErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
  statusCode: number;
}

export class ApiRequestError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, string[]>;

  constructor(payload: ApiErrorPayload) {
    super(payload.error.message);
    this.name = 'ApiRequestError';
    this.statusCode = payload.statusCode;
    this.code = payload.error.code;
    this.details = payload.error.details;
  }
}

// ─── Token management ─────────────────────────────────────────────────────────

const TOKEN_KEY = 'cf_access_token';

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAuthToken(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

// ─── Request options ──────────────────────────────────────────────────────────

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON-serializable body; will be serialised automatically */
  body?: unknown;
  /** URL query string parameters; undefined/null values are omitted */
  params?: Record<string, unknown>;
  /** Skip token injection (e.g. for login / refresh endpoints) */
  skipAuth?: boolean;
  /** Request timeout in ms (default: 30 000) */
  timeoutMs?: number;
}

// ─── Base URL ─────────────────────────────────────────────────────────────────
// next.config.js rewrites /api/* → http://localhost:4000/api/*

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

// ─── Query string builder ─────────────────────────────────────────────────────

function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));
}

// ─── Core request ─────────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const {
    body,
    params,
    skipAuth = false,
    timeoutMs = 30_000,
    headers: extraHeaders = {},
    ...restInit
  } = options;

  const qs = params ? buildQuery(params) : '';
  const url = `${BASE_URL}${path}${qs}`;

  // Headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  if (!skipAuth) {
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  // Timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      ...restInit,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms [${method} ${path}]`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  // 401 — throw ApiRequestError so callers (e.g. useAuthFetch) can handle retry logic.
  // Do NOT redirect to login here; let the hook decide after attempting a token refresh.

  // Parse response
  const contentType = response.headers.get('content-type') ?? '';
  let parsed: unknown;

  if (contentType.includes('application/json')) {
    parsed = await response.json().catch(() => ({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Failed to parse JSON response' },
      statusCode: response.status,
    }));
  } else {
    const text = await response.text();
    parsed = {
      success: false,
      error: { code: 'NON_JSON_RESPONSE', message: text || response.statusText },
      statusCode: response.status,
    };
  }

  if (!response.ok) {
    throw new ApiRequestError({
      ...(parsed as ApiErrorPayload),
      statusCode: response.status,
    });
  }

  return parsed as ApiResponse<T>;
}

// ─── HTTP method shortcuts ────────────────────────────────────────────────────

export const apiClient = {
  get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return request<T>('GET', path, options);
  },
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return request<T>('POST', path, { ...options, body });
  },
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return request<T>('PUT', path, { ...options, body });
  },
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return request<T>('PATCH', path, { ...options, body });
  },
  delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return request<T>('DELETE', path, options);
  },
};

// ─── Resource helpers — Clients / Businesses ─────────────────────────────────

export const clientsApi = {
  list: (params?: Partial<PaginationParams> & { search?: string; status?: string }) =>
    request('GET', '/businesses', { params: params ?? {} }),

  get: (id: string) =>
    request('GET', `/businesses/${id}`),

  update: (id: string, body: Record<string, unknown>) =>
    request('PATCH', `/businesses/${id}`, { body }),
};

// ─── Resource helpers — Applications ─────────────────────────────────────────

export const applicationsApi = {
  list: (params?: Partial<PaginationParams> & { status?: string; businessId?: string }) =>
    request('GET', '/applications', { params: params ?? {} }),

  get: (id: string) =>
    request('GET', `/applications/${id}`),

  create: (body: Record<string, unknown>) =>
    request('POST', '/applications', { body }),

  updateStatus: (id: string, status: string) =>
    request('PATCH', `/applications/${id}/status`, { body: { status } }),
};

// ─── Resource helpers — Credit Intelligence ───────────────────────────────────

export const creditApi = {
  getProfile: (businessId: string) =>
    request('GET', `/credit/profile/${businessId}`),

  pullReport: (businessId: string, bureau: string) =>
    request('POST', '/credit/pull', { body: { businessId, bureau } }),
};

// ─── Resource helpers — Funding Rounds ───────────────────────────────────────

export const fundingRoundsApi = {
  list: (params?: Partial<PaginationParams> & { status?: string }) =>
    request('GET', '/funding-rounds', { params: params ?? {} }),

  get: (id: string) =>
    request('GET', `/funding-rounds/${id}`),

  create: (body: Record<string, unknown>) =>
    request('POST', '/funding-rounds', { body }),
};

// ─── Resource helpers — Compliance ───────────────────────────────────────────

export const complianceApi = {
  dashboard: () =>
    request('GET', '/compliance/dashboard'),

  overview: () =>
    request('GET', '/compliance/overview'),

  runAll: () =>
    request('POST', '/compliance/run-all'),

  checks: (params?: Partial<PaginationParams>) =>
    request('GET', '/compliance/checks', { params: params ?? {} }),

  stateAlerts: () =>
    request('GET', '/compliance/state-alerts'),

  // Documents
  listDocuments: () =>
    request('GET', '/compliance/documents'),

  uploadDocument: (body: Record<string, unknown>) =>
    request('POST', '/compliance/documents', { body }),

  toggleDocumentHold: (id: string, legalHold: boolean) =>
    request('PATCH', `/compliance/documents/${id}/hold`, { body: { legalHold } }),

  // Disclosures
  listDisclosures: () =>
    request('GET', '/compliance/disclosures'),

  fileDisclosure: (id: string) =>
    request('POST', `/compliance/disclosures/${id}/file`),

  // Complaints
  listComplaints: () =>
    request('GET', '/compliance/complaints'),

  createComplaint: (body: Record<string, unknown>) =>
    request('POST', '/compliance/complaints', { body }),

  updateComplaint: (id: string, body: Record<string, unknown>) =>
    request('PATCH', `/compliance/complaints/${id}`, { body }),
};

// ─── Resource helpers — Documents ────────────────────────────────────────────

export const documentsApi = {
  list: (params?: Partial<PaginationParams> & { businessId?: string; type?: string }) =>
    request('GET', '/documents', { params: params ?? {} }),

  get: (id: string) =>
    request('GET', `/documents/${id}`),

  upload: (formData: FormData) =>
    // Omit Content-Type so browser sets multipart/form-data boundary automatically
    fetch(`${BASE_URL}/documents/upload`, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
    }).then((r) => r.json()),

  exportDossier: (businessId: string) =>
    request('POST', `/documents/dossier/${businessId}`),
};

// ─── Resource helpers — Consent ───────────────────────────────────────────────

export const consentApi = {
  getByBusiness: (businessId: string) =>
    request('GET', `/consent/business/${businessId}`),

  revoke: (consentId: string) =>
    request('POST', `/consent/${consentId}/revoke`),
};

// ─── Default export ───────────────────────────────────────────────────────────

export default apiClient;
