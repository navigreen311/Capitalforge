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
import { attemptTokenRefresh, canRecoverSession } from './token-refresh';
import { getAccessToken, setAccessToken, clearAccessToken } from './session-storage';

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

// The key itself lives in `session-storage`, which owns every storage key in
// this app. It was a literal here and in eight other places, and one of those
// eight read `cf_token` — a key nothing writes.
//
// These three keep their names because a dozen callers import them.

export function setAuthToken(token: string): void {
  setAccessToken(token);
}

export function getAuthToken(): string | null {
  return getAccessToken();
}

export function clearAuthToken(): void {
  clearAccessToken();
}

/**
 * Authorization header for imperative `fetch()` calls.
 *
 * `apiClient` and `useAuthFetch` inject the token themselves; this is for the
 * places that call `fetch('/api/...')` directly — typically inside event
 * handlers, where a hook cannot be used. Every /api route except a small
 * public allowlist now requires a bearer token, so a direct fetch without
 * these headers gets a 401.
 *
 * Returns an empty object when there is no token, so it can always be spread.
 */
export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

  // Built per attempt, not once: a retry after a refresh has to carry the new
  // token, and reusing the first attempt's headers would repeat the 401.
  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(extraHeaders as Record<string, string>),
    };
    if (!skipAuth) {
      const token = getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const send = async (): Promise<Response> => {
    // Timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        method,
        headers: buildHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        ...restInit,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms [${method} ${path}]`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // No access token but a refresh token to trade for one: spend it now rather
  // than sending a request with no Authorization header, which the API
  // rejects as AUTH_TOKEN_MISSING. Worth doing before the attempt because
  // some of these calls are submits — by the time the error came back, the
  // caller had already filled in a five-step form.
  if (!skipAuth && canRecoverSession()) {
    await attemptTokenRefresh();
  }

  let response = await send();

  // 401 — every imperative caller used to get this raw. `useAuthFetch` and the
  // `loadJson` helpers each grew their own refresh-and-retry; the twelve
  // components calling `apiClient` directly never did, so an access token that
  // aged out mid-page turned the next click into a hard failure with a
  // server-worded message. Doing it here covers all of them at once.
  // `attemptTokenRefresh` is single-flight, so concurrent 401s share one call.
  if (!skipAuth && response.status === 401 && (await attemptTokenRefresh())) {
    response = await send();
  }

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
    // `ApiRequestError` reads `payload.error.message`, so a failure body
    // without an `error` object threw a TypeError from inside the error
    // constructor — the caller got "Cannot read properties of undefined"
    // in place of the status it actually needed to handle. Every route in
    // this API sends the envelope, but a proxy, a gateway or an unhandled
    // throw upstream does not.
    const payload = parsed as Partial<ApiErrorPayload>;
    let error = payload.error ?? {
      code: 'UNEXPECTED_ERROR',
      message: response.statusText || `Request failed (${response.status})`,
    };

    // A 401 that survived the refresh above means there is no session left to
    // repair. "Authorization token is required." is accurate and useless: it
    // describes a missing HTTP header to someone who has just filled in a
    // form and been told nothing about why it will not send. Nothing else in
    // the interface says they are signed out — the name in the header is a
    // placeholder and no route guards this page — so this message is the
    // only place it can be said.
    if (!skipAuth && response.status === 401) {
      error = {
        ...error,
        message: 'Your session has ended. Sign in again to continue.',
      };
    }

    throw new ApiRequestError({
      success: false,
      ...payload,
      error,
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
  list: (params?: Partial<PaginationParams> & { search?: string; status?: string; sortBy?: string; sortDir?: string }) =>
    request('GET', '/v1/clients', { params: params ?? {} }),

  get: (id: string) =>
    request('GET', `/v1/clients/${id}`),

  create: (body: Record<string, unknown>) =>
    request('POST', '/v1/clients', { body }),

  update: (id: string, body: Record<string, unknown>) =>
    request('PATCH', `/v1/clients/${id}`, { body }),
};

// ─── Resource helpers — Applications ─────────────────────────────────────────

export const applicationsApi = {
  list: (params?: Partial<PaginationParams> & { status?: string; businessId?: string; groupByStatus?: string }) =>
    request('GET', '/applications', { params: params ?? {} }),

  get: (id: string) =>
    request('GET', `/applications/${id}`),

  create: (body: Record<string, unknown>) =>
    request('POST', '/applications', { body }),

  update: (id: string, body: Record<string, unknown>) =>
    request('PATCH', `/applications/${id}`, { body }),

  /** Declarations by id — see PRE_SUBMISSION_DECLARATIONS. A positional array
   *  cannot say which thing was confirmed. */
  submit: (id: string, declarations: Record<string, boolean>) =>
    request('POST', `/applications/${id}/submit`, { body: { declarations } }),

  // updateStatus removed: it PATCHed /applications/:id/status, which the API
  // does not register and answers 404. Its only caller was the pipeline
  // board's drag-and-drop, which swallowed the failure. Status changes go
  // through submit() and the decision workflow, both of which run the
  // compliance steps a bare status write skips.

  complianceGate: (businessId: string) =>
    request('GET', `/applications/compliance-gate/${businessId}`),

  velocity: (businessId: string) =>
    request('GET', `/applications/velocity/${businessId}`),
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

  /**
   * Upload, with the refresh `request()` gives every other call here.
   *
   * This has to bypass `request()` — it must omit Content-Type so the browser
   * sets the multipart boundary — and in bypassing it, it lost two things
   * `request()` does for everyone else: refresh-and-retry on 401, and treating
   * a non-2xx as an error. It sent whatever token was in storage and handed
   * the parsed body back regardless, so an access token that aged out mid-page
   * returned the 401 envelope to the caller as though it were a result.
   *
   * Headers are rebuilt on the retry so it carries the refreshed token rather
   * than repeating the 401 — the same ordering mistake `fetch-all-pages`
   * documents.
   *
   * No caller today: this is exported surface, and the next person to reach
   * for it should get the same guarantees as `documentsApi.get`.
   */
  upload: async (formData: FormData) => {
    const send = (): Promise<Response> =>
      fetch(`${BASE_URL}/documents/upload`, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
      });

    let response = await send();
    if (response.status === 401 && (await attemptTokenRefresh())) {
      response = await send();
    }

    const parsed: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiRequestError({
        statusCode: response.status,
        error: {
          code: 'UPLOAD_FAILED',
          message:
            (parsed as { error?: { message?: string } } | null)?.error?.message
            ?? `Upload failed with status ${response.status}`,
        },
      } as ApiErrorPayload);
    }

    return parsed;
  },

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
