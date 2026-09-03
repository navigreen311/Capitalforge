// ============================================================
// The re-stack summary states a verdict it did not make up
//
// This document is handed to a client. Its executive summary read:
//
//   "Based on your current credit profile and payment history, you are
//    eligible for an additional round of business credit card funding."
//
// unconditionally, from a generator that received no eligibility result and
// checked nothing. Whatever restack-trigger had decided, the letter said yes.
//
// Two fields also degraded to favourable claims rather than placeholders:
// `payment_rating ?? 'Good'` and `score_trend ?? 'Stable/Improving'`. Every
// other field in every other generator falls back to a visible bracket. A
// caller supplying nothing got a letter rating their client's payment history
// Good.
//
// The verdict is now read from the engine with the caller's own tenant, and
// anything the caller sent under the same key is overwritten — a caller who
// could type `eligible: true` into a request body could hand a client a letter
// saying they qualify for funding they do not qualify for.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const TENANT = 'tenant-1';

const businessFindFirst = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({ $on: vi.fn() })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

vi.mock('@backend/config/database.js', () => ({
  prisma: { business: { findFirst: businessFindFirst }, $on: vi.fn() },
}));

vi.mock('@backend/middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { documentGenRouter } = await import('@backend/api/routes/document-gen.routes.js');
  const { setPrismaClient } = await import('@backend/services/restack-trigger.js');
  const { prisma } = await import('@backend/config/database.js');
  setPrismaClient(prisma as never);

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: TENANT, userId: 'u-1', role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api', documentGenRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A business whose every restack criterion passes. */
function eligibleBusiness() {
  return {
    id: 'biz-1',
    legalName: 'Acme Holdings LLC',
    tenantId: TENANT,
    fundingReadinessScore: 84,
    cardApplications: [],
    fundingRounds: [{ roundNumber: 1 }],
    creditProfiles: [{ utilization: 0.2 }],
  };
}

/** Assessed, and below the threshold. */
function ineligibleBusiness() {
  return { ...eligibleBusiness(), fundingReadinessScore: 41 };
}

beforeEach(() => {
  vi.clearAllMocks();
  businessFindFirst.mockResolvedValue(eligibleBusiness());
});

function generate(context: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/documents/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_type: 'restack_opportunity_summary', context }),
  });
}

interface Body {
  success: boolean;
  data?: { text: string; context: Record<string, unknown> };
  error?: { code: string; message: string };
}

describe('the executive summary', () => {
  it('says the client is eligible only when the engine said so', async () => {
    const res = await generate({ business_id: 'biz-1' });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(200);
    expect(body.data!.text).toMatch(/you are eligible for an additional round/);
  });

  it('says NOT eligible when the engine said that, and lists the findings', async () => {
    // The case the old document could not express. It said "you are eligible"
    // to a client whose readiness score is 41.
    businessFindFirst.mockResolvedValue(ineligibleBusiness());

    const res = await generate({ business_id: 'biz-1' });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(200);
    expect(body.data!.text).toMatch(/NOT currently eligible/);
    expect(body.data!.text).toMatch(/Readiness score 41 is below threshold/);
    expect(body.data!.text).not.toMatch(/you are eligible for an additional round/);
    // And it does not tell them to schedule the round they cannot have.
    expect(body.data!.text).not.toMatch(/schedule your re-stack round/);
  });

  it('cannot be asserted by the caller', async () => {
    // A request body is not a source of verdicts about a client's credit.
    businessFindFirst.mockResolvedValue(ineligibleBusiness());

    const res = await generate({
      business_id: 'biz-1',
      eligibility: { eligible: true, reasons: ['Looks fine to me'], readinessScore: 99 },
    });
    const body = (await res.json()) as Body;

    expect(body.data!.text).toMatch(/NOT currently eligible/);
    expect(body.data!.text).not.toMatch(/Looks fine to me/);
    expect(body.data!.text).toMatch(/41\/100/);
  });

  it('refuses when no business is named', async () => {
    const res = await generate({ client_name: 'Acme Holdings LLC' });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(422);
    expect(body.error?.code).toBe('BUSINESS_ID_REQUIRED');
  });

  it('refuses when the business is not in this tenant', async () => {
    // checkRestackEligibility answers for a business it could not find, with
    // businessName 'Unknown'. A client document is not the place to discover
    // that.
    businessFindFirst.mockResolvedValue(null);

    const res = await generate({ business_id: 'other-tenant-biz' });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe('BUSINESS_NOT_FOUND');
  });
});

describe('the two favourable defaults', () => {
  it('are brackets now, like every other field', async () => {
    const res = await generate({ business_id: 'biz-1' });
    const body = (await res.json()) as Body;

    expect(body.data!.text).toMatch(/Payment History Rating: \[not supplied\]/);
    expect(body.data!.text).toMatch(/Credit score trajectory: \[not supplied\]/);
    expect(body.data!.text).not.toMatch(/Payment History Rating: Good/);
    expect(body.data!.text).not.toMatch(/Stable\/Improving/);
  });

  it('still print what the caller actually supplied', async () => {
    const res = await generate({
      business_id: 'biz-1',
      payment_rating: 'Excellent — 24 months no late payments',
      score_trend: 'Up 40 points since March',
    });
    const body = (await res.json()) as Body;

    expect(body.data!.text).toMatch(/Excellent — 24 months no late payments/);
    expect(body.data!.text).toMatch(/Up 40 points since March/);
  });
});

describe('the readiness score in the document', () => {
  it('comes from the engine, not the context', async () => {
    const res = await generate({ business_id: 'biz-1', readiness_score: 100 });
    const body = (await res.json()) as Body;

    expect(body.data!.text).toMatch(/Re-Stack Readiness Score: 84\/100/);
    expect(body.data!.text).not.toMatch(/100\/100/);
  });

  it('says "not assessed" rather than a number when nobody has scored the client', async () => {
    businessFindFirst.mockResolvedValue({
      ...eligibleBusiness(),
      fundingReadinessScore: null,
    });

    const res = await generate({ business_id: 'biz-1' });
    const body = (await res.json()) as Body;

    expect(body.data!.text).toMatch(/Re-Stack Readiness Score: \[not assessed\]\/100/);
    expect(body.data!.text).toMatch(/NOT currently eligible/);
    expect(body.data!.text).toMatch(/never been assessed/);
  });
});

describe('what the response records', () => {
  it('returns the context the document was built from, verdict included', async () => {
    const res = await generate({ business_id: 'biz-1' });
    const body = (await res.json()) as Body;

    expect(body.data!.context.eligibility).toMatchObject({ eligible: true, readinessScore: 84 });
  });
});
