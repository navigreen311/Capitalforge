// ============================================================
// fetchAllPages — reading a whole list rather than its first page
//
// Every list endpoint here paginates with a small default, so a caller that
// fetches once gets 20–50 rows and no sign there are more. These pin the walk,
// both envelope shapes, and what happens when a page fails partway.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAllPages, readTotal } from '../../../src/frontend/lib/fetch-all-pages';

/** Rows out of either envelope shape. */
const pickComplaints = (json: unknown): string[] => {
  const body = json as { data?: { complaints?: string[] } | string[] };
  if (Array.isArray(body.data)) return body.data;
  return body.data?.complaints ?? [];
};

function pagedResponder(total: number, perPage: number, style: 'data' | 'meta') {
  return vi.fn(async (url: string) => {
    const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? '1');
    const start = (page - 1) * perPage;
    const rows = Array.from(
      { length: Math.max(0, Math.min(perPage, total - start)) },
      (_, i) => `row-${start + i}`,
    );

    const body =
      style === 'data'
        ? { success: true, data: { complaints: rows, total, page, pageSize: perPage } }
        : { success: true, data: rows, meta: { total, page, pageSize: perPage } };

    return { ok: true, json: async () => body } as unknown as Response;
  });
}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => 'token' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readTotal', () => {
  it('reads a total reported in meta', () => {
    expect(readTotal({ data: [], meta: { total: 42 } })).toBe(42);
  });

  it('reads a total reported inside data', () => {
    expect(readTotal({ data: { complaints: [], total: 7 } })).toBe(7);
  });

  it('is null when the endpoint reports no total', () => {
    expect(readTotal({ data: [] })).toBeNull();
    expect(readTotal(null)).toBeNull();
  });
});

describe('fetchAllPages', () => {
  it('walks every page of a data-envelope endpoint', async () => {
    vi.stubGlobal('fetch', pagedResponder(105, 100, 'data'));

    const result = await fetchAllPages('/api/complaints', pickComplaints);

    expect(result.rows).toHaveLength(105);
    expect(result.total).toBe(105);
    expect(result.truncated).toBe(false);
  });

  it('walks every page of a meta-envelope endpoint', async () => {
    vi.stubGlobal('fetch', pagedResponder(120, 50, 'meta'));

    const result = await fetchAllPages('/api/applications', pickComplaints);

    expect(result.rows).toHaveLength(120);
    expect(result.truncated).toBe(false);
  });

  it('makes one request when the first page holds everything', async () => {
    const responder = pagedResponder(12, 100, 'data');
    vi.stubGlobal('fetch', responder);

    const result = await fetchAllPages('/api/complaints', pickComplaints);

    expect(result.rows).toHaveLength(12);
    expect(responder).toHaveBeenCalledTimes(1);
  });

  it('strides by what came back, not by what was asked for', async () => {
    // Servers clamp pageSize to their own maximum; asking for 500 and getting
    // 100 must not make the walk skip four pages in five.
    vi.stubGlobal('fetch', pagedResponder(250, 100, 'data'));

    const result = await fetchAllPages('/api/complaints', pickComplaints, { pageSize: 500 });

    expect(result.rows).toHaveLength(250);
    expect(new Set(result.rows).size).toBe(250);
  });

  it('stops at the page cap and says it was truncated', async () => {
    vi.stubGlobal('fetch', pagedResponder(1000, 100, 'data'));

    const result = await fetchAllPages('/api/complaints', pickComplaints, { maxPages: 3 });

    expect(result.rows).toHaveLength(300);
    // The caller can say what it is showing rather than implying completeness.
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(1000);
  });

  it('keeps the pages that loaded when a later page fails', async () => {
    const responder = vi.fn(async (url: string) => {
      const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? '1');
      if (page === 2) return { ok: false, status: 500 } as unknown as Response;
      const rows = Array.from({ length: 100 }, (_, i) => `p${page}-${i}`);
      return {
        ok: true,
        json: async () => ({ data: { complaints: rows, total: 300, page, pageSize: 100 } }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', responder);

    const result = await fetchAllPages('/api/complaints', pickComplaints);

    // Page 1 and 3 survive; a partial register beats none, and it says so.
    expect(result.rows).toHaveLength(200);
    expect(result.truncated).toBe(true);
  });

  it('throws when the first page fails, rather than reporting an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 }) as unknown as Response));

    // An empty register and a rejected request are different claims.
    await expect(fetchAllPages('/api/complaints', pickComplaints)).rejects.toThrow('401');
  });

  it('does not walk when the endpoint reports no total', async () => {
    const responder = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { complaints: ['a', 'b'] } }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', responder);

    const result = await fetchAllPages('/api/complaints', pickComplaints);

    expect(result.rows).toEqual(['a', 'b']);
    expect(result.total).toBeNull();
    expect(responder).toHaveBeenCalledTimes(1);
  });

  it('appends its parameters to a path that already has a query', async () => {
    const responder = pagedResponder(5, 100, 'data');
    vi.stubGlobal('fetch', responder);

    await fetchAllPages('/api/complaints?status=open', pickComplaints);

    expect(responder.mock.calls[0][0]).toBe('/api/complaints?status=open&pageSize=100');
  });
});

// ── Token refresh mid-walk ───────────────────────────────────
//
// Access tokens last fifteen minutes and this walks up to twenty pages, so a
// long register can outlive its own token part way through. Before the retry,
// the later pages returned 401, were read as empty, and the result was reported
// as `truncated` — a partial register that says it is partial, which is the
// honest failure for a page that could not be read and the wrong one for a page
// that could have been read after a refresh.

describe('fetchAllPages — a token that ages out mid-walk', () => {
  const REFRESH = {
    success: true,
    data: { accessToken: 'new-access-token', refreshToken: 'rotated' },
  };

  function storage(seed: Record<string, string>) {
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

  function res(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }

  beforeEach(() => {
    const s = storage({ cf_access_token: 'expired', cf_refresh_token: 'valid' });
    vi.stubGlobal('localStorage', s);
    vi.stubGlobal('window', { localStorage: s });
  });

  it('refreshes and retries rather than reporting a truncated register', async () => {
    let firstPageCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return res(200, REFRESH);
      firstPageCalls += 1;
      // The token has aged out; the retry carries a new one.
      return firstPageCalls === 1
        ? res(401, { success: false })
        : res(200, { data: [{ id: 'a' }], meta: { total: 1 } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAllPages<{ id: string }>(
      '/api/things',
      (json) => ((json as { data?: { id: string }[] }).data ?? []),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it('sends the refreshed token on the retry, not the expired one', async () => {
    let pageCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) return res(200, REFRESH);
      pageCalls += 1;
      return pageCalls === 1
        ? res(401, { success: false })
        : res(200, { data: [], meta: { total: 0 } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchAllPages('/api/things', () => []);

    const authOn = (n: number) =>
      ((fetchMock.mock.calls[n]?.[1] as RequestInit | undefined)?.headers as
        | Record<string, string>
        | undefined)?.Authorization;
    expect(authOn(0)).toBe('Bearer expired');
    expect(authOn(2)).toBe('Bearer new-access-token');
  });

  it('still reports a genuine failure rather than retrying forever', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('/auth/refresh')
        ? res(400, { success: false })
        : res(401, { success: false }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllPages('/api/things', () => [])).rejects.toThrow();
  });
});
