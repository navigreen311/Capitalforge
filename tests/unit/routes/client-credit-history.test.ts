// ============================================================
// GET /api/v1/clients/:clientId/credit/history
//
// The endpoint returns a score series for one scale at a time. Personal FICO
// runs 300-850 and business PAYDEX runs 0-100, so a response mixing them is
// not a chart anyone can read: a caller plotting `months` on a single axis
// would see PAYDEX 80 next to FICO 762 and draw a 682-point cliff.
//
// profileType used to be optional, and omitting it returned both. These tests
// pin the parameter as required, and pin that a served series never contains
// more than one scale.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';

// ── Fixture: one personal pull and one business pull, same month ──
// Exactly the shape that produced the mixed series.
const PROFILES = [
  {
    id: 'cp-personal',
    businessId: 'biz-1',
    profileType: 'personal',
    bureau: 'experian',
    score: 762,
    pulledAt: new Date('2026-03-01T00:00:00.000Z'),
  },
  {
    id: 'cp-business',
    businessId: 'biz-1',
    profileType: 'business',
    bureau: 'dnb',
    score: 80,
    pulledAt: new Date('2026-03-01T00:00:00.000Z'),
  },
];

const findMany = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    creditProfile: { findMany },
    // The router now verifies the client belongs to the caller's tenant before
    // any sub-route runs, so every test through this router needs a business
    // that matches. Without it the guard answers 404 and nothing below is
    // reached — which is the guard working, not this suite breaking.
    business: {
      findFirst: vi.fn(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(
          where.tenantId === 'tenant-1' ? { id: where.id } : null,
        ),
      ),
    },
    // The shared client in config/database.ts attaches query, info, warn and
    // error listeners when it is built. A double without $on fails there
    // with "client.$on is not a function", which surfaces as whatever the
    // route was doing rather than as a missing mock.
    $on: vi.fn(),
  })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

// The router requires business:read as of 2026-09-02. It had no permission
// middleware at all before, which is what made /owners and /credit/* reachable
// with nothing but a valid token and the tenancy guard.
vi.mock('@backend/middleware/rbac.middleware.js', () => ({
  requirePermissions: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('@backend/services/compliance.service.js', () => ({
  ComplianceService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@backend/services/email.service.js', () => ({
  emailService: { sendConsentRequest: vi.fn(), getMode: vi.fn() },
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // Imported lazily so the mocks above are in place first. This file compiles
  // to CommonJS, where top-level await is not valid.
  const express = (await import('express')).default;
  const { clientDetailRouter } = await import('@backend/api/routes/client-detail.routes.js');

  const app = express();
  app.use(express.json());
  // Stand in for the tenant middleware: the handler reads req.tenant.tenantId.
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: 'tenant-1' };
    next();
  });
  app.use('/api/v1/clients/:clientId', clientDetailRouter);

  server = app.listen(0);
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

interface HistoryResponse {
  success: boolean;
  data: {
    months: Array<Record<string, string | number>>;
    bureaus: string[];
    pullCount: number;
    changeSinceFirstPull: number | null;
    latestPullAt: string | null;
  };
  error: { code: string; message: string };
  meta?: { total: number };
}

const get = (query: string) =>
  fetch(`${baseUrl}/api/v1/clients/biz-1/credit/history${query}`);

/** `Response.json()` is `unknown` under strict TS; shape it once here. */
const getBody = async (query: string): Promise<HistoryResponse> =>
  (await get(query)).json() as Promise<HistoryResponse>;

describe('GET /credit/history — profileType is required', () => {
  it('rejects a request that omits profileType', async () => {
    const res = await get('');
    const body = (await res.json()) as HistoryResponse;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PROFILE_TYPE_REQUIRED');
  });

  it('does not query the database when profileType is missing', async () => {
    // The point of rejecting is to not serve a mixed series. Returning early
    // before the query is what guarantees no such series can be built.
    findMany.mockClear();
    await get('');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('explains why the parameter is required, naming both scales', async () => {
    const body = await getBody('');
    // A caller reading only the message should learn the reason, not just the
    // rule — the previous behaviour was silently wrong, not loudly missing.
    expect(body.error.message).toMatch(/FICO/);
    expect(body.error.message).toMatch(/PAYDEX/);
  });

  it('rejects an unrecognised profileType', async () => {
    findMany.mockClear();
    const res = await get('?profileType=bogus');
    const body = (await res.json()) as HistoryResponse;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_PROFILE_TYPE');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects an empty profileType rather than treating it as absent-but-fine', async () => {
    const res = await get('?profileType=');
    expect(res.status).toBe(400);
  });
});

describe('GET /credit/history — one scale per response', () => {
  it('scopes the query to the requested profileType', async () => {
    findMany.mockClear();
    findMany.mockResolvedValue(PROFILES.filter((p) => p.profileType === 'personal'));

    await get('?profileType=personal');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: 'biz-1', profileType: 'personal' }),
      }),
    );
  });

  it('returns only the personal series', async () => {
    findMany.mockResolvedValue(PROFILES.filter((p) => p.profileType === 'personal'));

    const body = await getBody('?profileType=personal');

    expect(body.data.bureaus).toEqual(['experian']);
    expect(body.data.months).toEqual([{ month: '2026-03', experian: 762 }]);
    // The business pull shares the month; it must not appear alongside it.
    expect(body.data.months[0]).not.toHaveProperty('dnb');
  });

  it('returns only the business series', async () => {
    findMany.mockResolvedValue(PROFILES.filter((p) => p.profileType === 'business'));

    const body = await getBody('?profileType=business');

    expect(body.data.bureaus).toEqual(['dnb']);
    expect(body.data.months).toEqual([{ month: '2026-03', dnb: 80 }]);
    expect(body.data.months[0]).not.toHaveProperty('experian');
  });

  it('never issues an unscoped query on any accepted input', async () => {
    // The single-scale guarantee rests entirely on the where-clause: the
    // handler does not re-filter in memory, and should not need to. What has
    // to hold is that no accepted path reaches the database without a
    // profileType — the regression was a `where` built with the filter
    // spread in conditionally, which silently vanished when it was absent.
    for (const type of ['personal', 'business'] as const) {
      findMany.mockClear();
      findMany.mockResolvedValue([]);

      await get(`?profileType=${type}`);

      expect(findMany).toHaveBeenCalledTimes(1);
      const args = findMany.mock.calls[0][0] as { where: { profileType?: string } };
      expect(args.where.profileType).toBe(type);
    }
  });

  it('reports an empty series rather than an error when nothing was pulled', async () => {
    findMany.mockResolvedValue([]);

    const res = await get('?profileType=business');
    const body = (await res.json()) as HistoryResponse;

    expect(res.status).toBe(200);
    expect(body.data.months).toEqual([]);
    expect(body.data.pullCount).toBe(0);
    // Unknowable, so null — not 0, which would read as "no movement".
    expect(body.data.changeSinceFirstPull).toBeNull();
    expect(body.data.latestPullAt).toBeNull();
  });

  it('reports no change across a single pull, with the count that qualifies it', async () => {
    findMany.mockResolvedValue(PROFILES.filter((p) => p.profileType === 'personal'));

    const body = await getBody('?profileType=personal');

    expect(body.data.pullCount).toBe(1);
    expect(body.data.changeSinceFirstPull).toBe(0);
  });

  it('gives no movement figure across two different bureaus', async () => {
    // Two bureaus on the same scale still measure different things, so the
    // delta between them is not movement.
    findMany.mockResolvedValue([
      { ...PROFILES[1], bureau: 'dnb', score: 80, pulledAt: new Date('2026-01-01T00:00:00.000Z') },
      { ...PROFILES[1], id: 'cp-x', bureau: 'experian_biz', score: 65, pulledAt: new Date('2026-03-01T00:00:00.000Z') },
    ]);

    const body = await getBody('?profileType=business');

    expect(body.data.pullCount).toBe(2);
    expect(body.data.changeSinceFirstPull).toBeNull();
  });

  it('reports movement across two pulls from the same bureau', async () => {
    findMany.mockResolvedValue([
      { ...PROFILES[1], score: 72, pulledAt: new Date('2026-01-01T00:00:00.000Z') },
      { ...PROFILES[1], id: 'cp-y', score: 80, pulledAt: new Date('2026-03-01T00:00:00.000Z') },
    ]);

    const body = await getBody('?profileType=business');

    expect(body.data.changeSinceFirstPull).toBe(8);
  });
});
