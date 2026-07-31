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
