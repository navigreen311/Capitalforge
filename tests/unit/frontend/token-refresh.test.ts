// ============================================================
// attemptTokenRefresh — the client half of POST /api/auth/refresh
//
// This function disagreed with the route it calls in three places at once: it
// sent `{ refresh_token }` where the schema requires `{ refreshToken }`, and
// read `access_token` off the top level of a `{ success, data: { accessToken } }`
// envelope. Every refresh answered 400, and because a failed refresh is
// reported as "sign in required", the entire dashboard locked fifteen minutes
// after sign-in while holding a refresh token good for another seven days.
//
// These tests pin the wire contract in both directions, and the single-flight
// behaviour that stops sixteen widgets refreshing the same rotating token.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attemptTokenRefresh } from '../../../src/frontend/hooks/useAuthFetch';

/** Captured from POST /api/auth/refresh against a running server. */
const REAL_RESPONSE = {
  success: true,
  data: {
    accessToken: 'new-access-token',
    refreshToken: 'rotated-refresh-token',
  },
};

function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
    _store: store,
  } as unknown as Storage & { _store: Map<string, string> };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let storage: Storage & { _store: Map<string, string> };

beforeEach(() => {
  storage = fakeStorage({
    cf_access_token: 'expired-access-token',
    cf_refresh_token: 'valid-refresh-token',
  });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
});

describe('attemptTokenRefresh — request shape', () => {
  it('sends refreshToken, the key the route schema requires', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, REAL_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);

    await attemptTokenRefresh();

    // The mock is declared with no parameters, so its recorded calls type as
    // an empty tuple; the arguments are still there at runtime.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/refresh');
    expect(JSON.parse(init.body as string)).toEqual({
      refreshToken: 'valid-refresh-token',
    });
    // The shape that produced a 400 on every call.
    expect(init.body as string).not.toContain('refresh_token');
  });
});

describe('attemptTokenRefresh — response shape', () => {
  it('reads the new tokens out of the envelope, not off the top level', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, REAL_RESPONSE)));

    await expect(attemptTokenRefresh()).resolves.toBe(true);
    expect(storage.getItem('cf_access_token')).toBe('new-access-token');
  });

  it('stores the rotated refresh token, which the old one is replaced by', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, REAL_RESPONSE)));

    await attemptTokenRefresh();

    expect(storage.getItem('cf_refresh_token')).toBe('rotated-refresh-token');
  });

  it('reports failure rather than storing undefined when the envelope has no token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { success: true, data: {} })));

    await expect(attemptTokenRefresh()).resolves.toBe(false);
    expect(storage.getItem('cf_access_token')).toBe('expired-access-token');
  });
});

describe('attemptTokenRefresh — failure handling', () => {
  it('drops both tokens when the refresh token itself is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { success: false })));

    await expect(attemptTokenRefresh()).resolves.toBe(false);
    expect(storage.getItem('cf_access_token')).toBeNull();
    expect(storage.getItem('cf_refresh_token')).toBeNull();
  });

  it('keeps the tokens when the failure is not an authentication one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { success: false })));

    await expect(attemptTokenRefresh()).resolves.toBe(false);
    expect(storage.getItem('cf_refresh_token')).toBe('valid-refresh-token');
  });

  it('returns false without calling the API when there is nothing to refresh', async () => {
    storage.removeItem('cf_refresh_token');
    const fetchMock = vi.fn(async () => jsonResponse(200, REAL_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);

    await expect(attemptTokenRefresh()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports failure rather than throwing when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    await expect(attemptTokenRefresh()).resolves.toBe(false);
  });
});

describe('attemptTokenRefresh — single flight', () => {
  it('refreshes once for concurrent callers and gives them all the same answer', async () => {
    // The dashboard mounts sixteen widgets; an expired access token 401s all
    // of them at once. Rotation means the second request to reach the server
    // presents a token the first has already retired.
    const fetchMock = vi.fn(async () => jsonResponse(200, REAL_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all(
      Array.from({ length: 16 }, () => attemptTokenRefresh()),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r === true)).toBe(true);
  });

  it('allows a later refresh once the in-flight one has settled', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, REAL_RESPONSE));
    vi.stubGlobal('fetch', fetchMock);

    await attemptTokenRefresh();
    await attemptTokenRefresh();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
