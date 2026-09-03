// ============================================================
// The dashboard presents the engine's answer instead of inventing one
//
// Two things this surface used to do:
//
//   1. A failed query was caught, written to the console, and answered as
//      `success: true, opportunities: [], total_pipeline_value: 0` with a fresh
//      `last_updated` timestamp. An outage was indistinguishable from a tenant
//      with nobody ready, and the answer said it was current. The panel has an
//      error state; it was unreachable.
//
//   2. `estimated_additional_credit` was
//      `Math.round(Number(lastCompleted.targetCredit ?? 0) * 0.75)` — the
//      previous round's TARGET credit (the variable was named `achievedCredit`),
//      times a multiplier derived from nothing, under a comment claiming to sum
//      approved applications. Those were summed into `total_pipeline_value` and
//      rendered as a gold badge.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const TENANT = 'tenant-1';

const businessFindFirst = vi.fn();
const businessFindMany = vi.fn();
const businessCount = vi.fn();
const transaction = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({ $on: vi.fn() })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

vi.mock('@backend/config/database.js', () => ({
  prisma: {
    business: { findFirst: businessFindFirst, findMany: businessFindMany, count: businessCount },
    $transaction: transaction,
    $on: vi.fn(),
  },
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { dashboardRestackRouter } = await import(
    '@backend/api/routes/dashboard-restack.routes.js'
  );
  const { setPrismaClient } = await import('@backend/services/restack-trigger.js');
  const { prisma } = await import('@backend/config/database.js');
  setPrismaClient(prisma as never);

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: TENANT, userId: 'u-1', role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api/v1/dashboard/restack', dashboardRestackRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  businessFindMany.mockResolvedValue([{ id: 'biz-1', tenantId: TENANT }]);
  businessCount.mockResolvedValue(0);
  businessFindFirst.mockResolvedValue({
    id: 'biz-1',
    legalName: 'Acme Holdings LLC',
    tenantId: TENANT,
    fundingReadinessScore: 84,
    cardApplications: [],
    fundingRounds: [{ roundNumber: 2, status: 'completed', completedAt: new Date('2026-01-15') }],
    creditProfiles: [{ utilization: 0.2 }],
  });
});

interface Body {
  success: boolean;
  data?: {
    opportunities: Array<Record<string, unknown>>;
    eligible_count: number;
    active_count: number;
    not_assessed_count: number;
    last_updated: string;
  };
  error?: { code: string; message: string };
}

describe('a failed query', () => {
  it('is a 500, not an empty list with a fresh timestamp', async () => {
    businessFindMany.mockRejectedValue(new Error('connection terminated'));
    transaction.mockRejectedValue(new Error('connection terminated'));

    const res = await fetch(`${baseUrl}/api/v1/dashboard/restack`);
    const body = (await res.json()) as Body;

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('RESTACK_FETCH_FAILED');
    expect(body.data).toBeUndefined();
  });
});

describe('the response', () => {
  it('carries no forecast figure', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/restack`);
    const text = await res.text();
    const body = JSON.parse(text) as Body;

    expect(text).not.toMatch(/total_pipeline_value/);
    expect(text).not.toMatch(/estimated_additional_credit/);
    expect(body.data!.eligible_count).toBe(1);
  });

  it('says what the count is out of', async () => {
    businessCount.mockResolvedValueOnce(45).mockResolvedValueOnce(40);

    const res = await fetch(`${baseUrl}/api/v1/dashboard/restack`);
    const body = (await res.json()) as Body;

    expect(body.data!.active_count).toBe(45);
    expect(body.data!.not_assessed_count).toBe(40);
  });

  it('agrees with the engine about who is eligible', async () => {
    // The whole point of the merge. This client has a round in progress, which
    // the service now blocks on — the dashboard's own rule, moved into the
    // service — so the dashboard must not list them.
    businessFindFirst.mockResolvedValue({
      id: 'biz-1',
      legalName: 'Acme Holdings LLC',
      tenantId: TENANT,
      fundingReadinessScore: 84,
      cardApplications: [],
      fundingRounds: [{ roundNumber: 3, status: 'in_progress', completedAt: null }],
      creditProfiles: [{ utilization: 0.2 }],
    });

    const res = await fetch(`${baseUrl}/api/v1/dashboard/restack`);
    const body = (await res.json()) as Body;

    expect(body.data!.opportunities).toEqual([]);
  });

  it('reports a readiness score of null rather than 0 when unassessed', async () => {
    // `readiness_score: biz.fundingReadinessScore ?? 0` — the `?? 0` removed
    // everywhere else in this codebase, still here.
    businessFindFirst.mockResolvedValue({
      id: 'biz-1',
      legalName: 'Acme Holdings LLC',
      tenantId: TENANT,
      fundingReadinessScore: null,
      cardApplications: [],
      fundingRounds: [],
      creditProfiles: [{ utilization: 0.2 }],
    });

    const res = await fetch(`${baseUrl}/api/v1/dashboard/restack`);
    const body = (await res.json()) as Body;

    // Unassessed blocks, so they are not an opportunity — and the field that
    // would have said 0 is gone from the payload entirely.
    expect(body.data!.opportunities).toEqual([]);
  });
});
