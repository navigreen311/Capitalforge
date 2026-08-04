// ============================================================
// loadJsonWithMeta — a 401 gets one refresh, same as its sibling
//
// `lib/load-json.ts` exports two nearly identical helpers. `loadJson` answered
// a 401 by refreshing the token and retrying; `loadJsonWithMeta` threw
// straight to "Sign in required". Access tokens last fifteen minutes, so the
// pages reading through the second one — the client portal and the client
// compliance tab — locked at the quarter-hour and stayed locked, while the
// pages beside them recovered on their own.
//
// These pin the retry, and pin that the retry sends the *new* token: the
// headers are built per attempt, and reusing the first attempt's would repeat
// the 401 with a fresh request.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJsonWithMeta, LoadError } from '../../../src/frontend/lib/load-json';

const REFRESH_RESPONSE = {
  success: true,
  data: { accessToken: 'new-access-token', refreshToken: 'rotated-refresh-token' },
};

const PAYLOAD = {
  success: true,
  data: { score: 82 },
  meta: { stub: true },
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
  } as unknown as Storage;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
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

describe('loadJsonWithMeta — 401 recovery', () => {
  it('refreshes and retries instead of demanding a new sign-in', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return jsonResponse(200, REFRESH_RESPONSE);
      return fetchMock.mock.calls.filter((c) => !String(c[0]).includes('/auth/refresh')).length === 1
        ? jsonResponse(401, { success: false })
        : jsonResponse(200, PAYLOAD);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadJsonWithMeta<{ score: number }>('/api/compliance/score');

    expect(result.data).toEqual({ score: 82 });
    expect(result.meta).toEqual({ stub: true });
  });

  it('sends the refreshed token on the retry, not the expired one', async () => {
    let dataCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return jsonResponse(200, REFRESH_RESPONSE);
      dataCalls += 1;
      return dataCalls === 1 ? jsonResponse(401, { success: false }) : jsonResponse(200, PAYLOAD);
    });
    vi.stubGlobal('fetch', fetchMock);

    await loadJsonWithMeta('/api/compliance/score');

    expect(authOn(fetchMock, 0)).toBe('Bearer expired-access-token');
    expect(authOn(fetchMock, 2)).toBe('Bearer new-access-token');
  });

  it('reports auth_required when the refresh itself fails', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/auth/refresh')
        ? jsonResponse(400, { success: false })
        : jsonResponse(401, { success: false }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadJsonWithMeta('/api/compliance/score')).rejects.toMatchObject({
      info: { type: 'auth_required', status: 401 },
    });
  });

  it('reports auth_required when the retry is rejected too', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/auth/refresh')
        ? jsonResponse(200, REFRESH_RESPONSE)
        : jsonResponse(401, { success: false }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const err = await loadJsonWithMeta('/api/compliance/score').catch((e) => e);
    expect(err).toBeInstanceOf(LoadError);
    expect((err as LoadError).info.type).toBe('auth_required');
  });

  it('does not refresh for an endpoint declared anonymous', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { success: false }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      loadJsonWithMeta('/api/public/thing', { allowAnonymous: true }),
    ).rejects.toBeInstanceOf(LoadError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves a 403 on the same path as a 401', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return jsonResponse(200, REFRESH_RESPONSE);
      return jsonResponse(403, { success: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadJsonWithMeta('/api/compliance/score')).rejects.toMatchObject({
      info: { type: 'auth_required' },
    });
  });
});

describe('loadJsonWithMeta — untouched behaviour', () => {
  it('returns data and meta on a first-try success without refreshing', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, PAYLOAD));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadJsonWithMeta<{ score: number }>('/api/compliance/score');

    expect(result.data).toEqual({ score: 82 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still reports a server error as a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { success: false })));

    await expect(loadJsonWithMeta('/api/compliance/score')).rejects.toMatchObject({
      info: { type: 'server_error', status: 500 },
    });
  });
});
