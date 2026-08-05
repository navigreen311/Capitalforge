// ============================================================
// apiClient — recovering a request whose access token has aged out
//
// Three layers grew their own refresh-and-retry: `useAuthFetch`, `loadJson`,
// and `loadJsonWithMeta`. The twelve components that call `apiClient`
// directly had none, so a click landing after the fifteen-minute mark failed
// outright with whatever wording the server used. The New Client wizard is
// the worst case: five steps of typed input, and the submit is an imperative
// `apiClient.post`.
//
// The pre-emptive case matters as much as the retry. With no access token at
// all the request goes out with no Authorization header, and the API answers
// AUTH_TOKEN_MISSING — a different error from an expired token, and the one
// that actually reached the user.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient, documentsApi, ApiRequestError } from '../../../src/frontend/lib/api-client';

const REFRESH_RESPONSE = {
  success: true,
  data: { accessToken: 'new-access-token', refreshToken: 'rotated-refresh-token' },
};

const PAYLOAD = { success: true, data: { business: { id: 'biz-1' } } };

function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Authorization header sent on the nth fetch call. */
function authOn(mock: { mock: { calls: unknown[][] } }, n: number): string | undefined {
  const init = mock.mock.calls[n]?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

let storage: Storage;

beforeEach(() => {
  storage = fakeStorage({
    cf_access_token: 'expired-access-token',
    cf_refresh_token: 'valid-refresh-token',
  });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
});

describe('apiClient — 401 recovery', () => {
  it('refreshes and retries a POST instead of throwing at the caller', async () => {
    let dataCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return jsonResponse(200, REFRESH_RESPONSE);
      dataCalls += 1;
      return dataCalls === 1
        ? jsonResponse(401, { success: false, error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Access token has expired.' } })
        : jsonResponse(200, PAYLOAD);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiClient.post('/businesses', { legalName: 'Apex Ventures LLC' });

    expect(res).toEqual(PAYLOAD);
  });

  it('sends the refreshed token on the retry, not the expired one', async () => {
    let dataCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return jsonResponse(200, REFRESH_RESPONSE);
      dataCalls += 1;
      return dataCalls === 1 ? jsonResponse(401, { success: false }) : jsonResponse(200, PAYLOAD);
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.post('/businesses', {});

    expect(authOn(fetchMock, 0)).toBe('Bearer expired-access-token');
    expect(authOn(fetchMock, 2)).toBe('Bearer new-access-token');
  });

  it('still throws when the refresh cannot save the request', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/auth/refresh')
        ? jsonResponse(400, { success: false })
        : jsonResponse(401, {
            success: false,
            error: { code: 'AUTH_TOKEN_EXPIRED', message: 'Access token has expired.' },
          }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.post('/businesses', {})).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('does not refresh for a request that opted out of auth', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { success: false }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiClient.post('/auth/login', {}, { skipAuth: true }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('apiClient — missing access token', () => {
  it('trades the refresh token for one before sending, rather than sending none', async () => {
    // The AUTH_TOKEN_MISSING case: no access token, so without this the
    // request goes out unauthenticated and is rejected as such.
    storage.removeItem('cf_access_token');

    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/auth/refresh')
        ? jsonResponse(200, REFRESH_RESPONSE)
        : jsonResponse(200, PAYLOAD),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiClient.post('/businesses', {});

    expect(res).toEqual(PAYLOAD);
    // Refresh first, then the real request carrying the new token.
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/refresh');
    expect(authOn(fetchMock, 1)).toBe('Bearer new-access-token');
  });

  it('sends no Authorization header when there is nothing to send or recover', async () => {
    storage.clear();
    const fetchMock = vi.fn(async () => jsonResponse(200, PAYLOAD));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get('/businesses');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authOn(fetchMock, 0)).toBeUndefined();
  });
});

describe('apiClient — an unrecoverable 401 says what happened', () => {
  it('replaces the header-level wording with something the reader can act on', async () => {
    // What the API actually sends when no Authorization header arrives. It is
    // accurate and tells the reader nothing they can use.
    storage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(401, {
          success: false,
          error: { code: 'AUTH_TOKEN_MISSING', message: 'Authorization token is required.' },
        }),
      ),
    );

    const err = (await apiClient.post('/businesses', {}).catch((e) => e)) as ApiRequestError;

    expect(err.message).toBe('Your session has ended. Sign in again to continue.');
    // The code is preserved, so callers can still branch on it.
    expect(err.code).toBe('AUTH_TOKEN_MISSING');
    expect(err.statusCode).toBe(401);
  });

  it('leaves a non-401 message exactly as the server wrote it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(422, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'legalName is required.' },
        }),
      ),
    );

    const err = (await apiClient.post('/businesses', {}).catch((e) => e)) as ApiRequestError;

    expect(err.message).toBe('legalName is required.');
  });
});

describe('apiClient — untouched behaviour', () => {
  it('does not refresh when the first attempt succeeds', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, PAYLOAD));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get('/businesses');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves a non-auth failure alone', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(500, { success: false, error: { code: 'INTERNAL', message: 'boom' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/businesses')).rejects.toMatchObject({ statusCode: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── documentsApi.upload — the one call that bypasses request() ───────────────
//
// Upload cannot go through `request()`: it must omit Content-Type so the
// browser sets the multipart boundary. In bypassing it, it lost the two things
// `request()` does for every other call — refresh-and-retry on 401, and
// treating a non-2xx as an error. It read the token once, sent it, and handed
// `r.json()` back whatever came, so an aged-out token returned the 401
// envelope to the caller as though it were a result.
//
// No component calls it today. It is exported surface, and the next person to
// reach for it should get the same guarantees as `documentsApi.get`.

describe('documentsApi.upload — refresh on a bypassed path', () => {
  it('refreshes and retries rather than returning the 401 envelope', async () => {
    let dataCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return jsonResponse(200, REFRESH_RESPONSE);
      dataCalls += 1;
      return dataCalls === 1
        ? jsonResponse(401, { success: false, error: { code: 'AUTH_TOKEN_EXPIRED', message: 'expired' } })
        : jsonResponse(200, { success: true, data: { id: 'doc-1' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await documentsApi.upload(new FormData());

    expect(res).toEqual({ success: true, data: { id: 'doc-1' } });
  });

  it('rebuilds the header so the retry carries the new token', async () => {
    let dataCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return jsonResponse(200, REFRESH_RESPONSE);
      dataCalls += 1;
      return dataCalls === 1 ? jsonResponse(401, { success: false }) : jsonResponse(200, { success: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await documentsApi.upload(new FormData());

    expect(authOn(fetchMock, 0)).toBe('Bearer expired-access-token');
    expect(authOn(fetchMock, 2)).toBe('Bearer new-access-token');
  });

  it('throws on a non-2xx instead of handing the error body back as a result', async () => {
    // The defect in miniature: `.then(r => r.json())` cannot tell a document
    // from a refusal, so the caller decides it succeeded.
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return jsonResponse(200, REFRESH_RESPONSE);
      return jsonResponse(500, { success: false, error: { code: 'STORAGE_DOWN', message: 'Storage unavailable' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(documentsApi.upload(new FormData())).rejects.toBeInstanceOf(ApiRequestError);
  });
});
