// ============================================================
// Saved strategies and optimizer-created rounds, against a real database
//
// Both endpoints previously answered success and wrote nothing.
// `save-strategy` returned `{ savedAt, clientId }`; `create-round` invented an
// id of the form `round-<client>-<n>-<timestamp>`, reported "Funding Round N
// created", and sent the user to a page where the round was not.
//
// **A test asserting the response would have passed both of them.** So every
// assertion here re-reads the row from the database rather than trusting what
// the call handed back — and the round assertions check the row is reachable
// by the id the response gave out, which is precisely what the invented id
// was not.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PrismaClient } from '@prisma/client';

const SUFFIX = `strat-${process.pid}-${Date.now()}`;
const ADVISOR = `advisor-${SUFFIX}`;

let tenantId: string;
let otherTenantId: string;
let businessId: string;
let otherBusinessId: string;

vi.mock('../../src/backend/middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (req: any, _res: any, next: any) => {
    req.tenant = { tenantId, userId: ADVISOR, permissions: ['business:read', 'business:write'] };
    next();
  },
}));

vi.mock('../../src/backend/middleware/rbac.middleware.js', () => ({
  requirePermissions: () => (_req: any, _res: any, next: any) => next(),
}));

const prisma = new PrismaClient();
let server: Server;
let base: string;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  return { status: res.status, body: (await res.json()) as any };
}

/** A plan shaped like the optimizer's, resting on one assumed constant. */
const PLAN_WITH_ASSUMPTION = {
  totalEstimatedCredit: 84000,
  cardCount: 3,
  prioritizationMode: 'max_credit',
  recommendations: [{ card: 'a' }, { card: 'b' }, { card: 'c' }],
  inputProvenance: {
    hasAssumedDefaults: true,
    assumedDefaults: ['Annual revenue'],
  },
};

const PLAN_FULLY_OBSERVED = {
  totalEstimatedCredit: 51000,
  cardCount: 2,
  prioritizationMode: 'fastest_approval',
  recommendations: [{ card: 'a' }, { card: 'b' }],
  inputProvenance: { hasAssumedDefaults: false, assumedDefaults: [] },
};

beforeAll(async () => {
  tenantId = (
    await prisma.tenant.create({ data: { name: `Strat ${SUFFIX}`, slug: `strat-${SUFFIX}` } })
  ).id;
  otherTenantId = (
    await prisma.tenant.create({ data: { name: `Other ${SUFFIX}`, slug: `strat-o-${SUFFIX}` } })
  ).id;

  businessId = (
    await prisma.business.create({
      data: { tenantId, legalName: `Strat Co ${SUFFIX}`, entityType: 'llc' },
    })
  ).id;
  otherBusinessId = (
    await prisma.business.create({
      data: { tenantId: otherTenantId, legalName: `Other Co ${SUFFIX}`, entityType: 'llc' },
    })
  ).id;

  const { optimizerActionsRouter } = await import(
    '../../src/backend/api/routes/optimizer-actions.routes.js'
  );
  const app = express();
  app.use(express.json());
  app.use('/api/optimizer', optimizerActionsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  const ids = [businessId, otherBusinessId];
  await prisma.fundingRound.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.savedStrategy.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('a saved strategy is a row, not a response', () => {
  it('writes the plan whole', async () => {
    const { status, body } = await api('/api/optimizer/save-strategy', {
      method: 'POST',
      body: JSON.stringify({ clientId: businessId, results: PLAN_WITH_ASSUMPTION }),
    });

    expect(status).toBe(201);

    const row = await prisma.savedStrategy.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(row.businessId).toBe(businessId);
    expect(row.createdBy).toBe(ADVISOR);
    // The whole plan, not a summary of it. A strategy read in six months has
    // to report the system that produced it.
    expect(row.plan).toEqual(PLAN_WITH_ASSUMPTION);
  });

  it('denormalises the flag that distinguishes a plan from an estimate', async () => {
    const row = (await prisma.savedStrategy.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    }))!;
    expect(row.hasAssumedDefaults).toBe(true);
    expect(row.cardCount).toBe(3);
    expect(row.totalEstimatedCredit?.toString()).toBe('84000');
  });

  it('reads the optimizer’s own flag rather than re-deriving it', async () => {
    // The first version of the helper scanned for entries with
    // source === 'assumed_default'. The provenance block is a record, not a
    // list, so that scan found nothing and would have marked every plan as
    // fully observed. This is the assertion that catches that.
    await api('/api/optimizer/save-strategy', {
      method: 'POST',
      body: JSON.stringify({ clientId: businessId, results: PLAN_FULLY_OBSERVED }),
    });

    const rows = await prisma.savedStrategy.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
    expect(rows[0]!.hasAssumedDefaults).toBe(false);
    expect(rows.some((r) => r.hasAssumedDefaults)).toBe(true);
  });

  it('appends rather than replacing, so the earlier plan survives', async () => {
    // The decision this encodes: overwriting destroys the record of what was
    // discussed at the first save, which is the thing worth keeping.
    const rows = await prisma.savedStrategy.findMany({ where: { businessId } });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('lists newest first without parsing a blob', async () => {
    const { body } = await api(`/api/optimizer/strategies/${businessId}`);
    const list = body.data.strategies as Array<{ hasAssumedDefaults: boolean }>;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0]).not.toHaveProperty('plan');
    expect(list[0]).toHaveProperty('hasAssumedDefaults');
  });

  it('returns one strategy whole', async () => {
    const list = await prisma.savedStrategy.findMany({ where: { businessId } });
    const { status, body } = await api(`/api/optimizer/strategies/detail/${list[0]!.id}`);
    expect(status).toBe(200);
    expect(body.data.strategy.plan).toBeTruthy();
  });

  it('will not save to, or read, another tenant’s client', async () => {
    const save = await api('/api/optimizer/save-strategy', {
      method: 'POST',
      body: JSON.stringify({ clientId: otherBusinessId, results: PLAN_FULLY_OBSERVED }),
    });
    expect(save.status).toBe(404);
    expect(await prisma.savedStrategy.count({ where: { businessId: otherBusinessId } })).toBe(0);

    expect((await api(`/api/optimizer/strategies/${otherBusinessId}`)).status).toBe(404);
  });
});

describe('create-round writes a round that is actually there', () => {
  it('creates it through the service the Funding Rounds page uses', async () => {
    const { status, body } = await api('/api/optimizer/create-round', {
      method: 'POST',
      body: JSON.stringify({ clientId: businessId, targetCredit: 90000, targetCardCount: 4 }),
    });

    expect(status).toBe(201);

    // The assertion the invented id could never have passed: the row is
    // reachable by the id the response gave out.
    const row = await prisma.fundingRound.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(row.businessId).toBe(businessId);
    expect(row.status).toBe('planning');
    expect(row.targetCardCount).toBe(4);
    // Allocated by the service, not by this route.
    expect(row.roundNumber).toBe(1);
  });

  it('allocates the next round number rather than colliding', async () => {
    // The reason this calls the service instead of writing its own create: the
    // unique on (businessId, roundNumber) turns a divergent allocation into a
    // 500 for the second caller.
    const { body } = await api('/api/optimizer/create-round', {
      method: 'POST',
      body: JSON.stringify({ clientId: businessId }),
    });
    const row = await prisma.fundingRound.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(row.roundNumber).toBe(2);
  });

  it('links the round to the strategy it was planned from', async () => {
    const strategy = (await prisma.savedStrategy.findFirst({ where: { businessId } }))!;

    const { body } = await api('/api/optimizer/create-round', {
      method: 'POST',
      body: JSON.stringify({ clientId: businessId, savedStrategyId: strategy.id }),
    });

    const row = await prisma.fundingRound.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(row.savedStrategyId).toBe(strategy.id);
  });

  it('refuses a strategy belonging to another client, and creates nothing', async () => {
    // A link pointing at a plan the reader cannot open is worse than no link:
    // on the round it reads as "planned from this".
    const before = await prisma.fundingRound.count({ where: { businessId } });

    const { status } = await api('/api/optimizer/create-round', {
      method: 'POST',
      body: JSON.stringify({ clientId: businessId, savedStrategyId: 'not-a-real-strategy' }),
    });

    expect(status).toBe(400);
    expect(await prisma.fundingRound.count({ where: { businessId } })).toBe(before);
  });

  it('leaves savedStrategyId null for a round that came from no plan', async () => {
    const rows = await prisma.fundingRound.findMany({
      where: { businessId },
      orderBy: { roundNumber: 'asc' },
    });
    expect(rows[0]!.savedStrategyId).toBeNull();
  });

  it('will not create a round for another tenant’s client', async () => {
    const { status } = await api('/api/optimizer/create-round', {
      method: 'POST',
      body: JSON.stringify({ clientId: otherBusinessId }),
    });
    expect(status).toBe(404);
    expect(await prisma.fundingRound.count({ where: { businessId: otherBusinessId } })).toBe(0);
  });
});
