// ============================================================
// The eligibility answer is written down
//
// `GET /issuers/:id/eligibility` computed an answer and discarded it. The
// context is rebuilt from live data on every call, so re-running the same URL
// next week produces a different answer with no trace of the earlier one —
// and this is the answer a placement strategy is built on.
//
// What is lost is not mainly the verdict. `unevaluatedRules` and `caveats`
// are the volatile part: a rule blocking today because nobody recorded its
// threshold evaluates normally once somebody does, and a held card attested
// next month silently improves the past. So when a client is declined, nobody
// can show what the system said or on what basis.
//
// `AiDecisionLog` has held this shape all along. `AI_MODULE_SOURCES` names
// nine modules and none of them wrote a row; the only writer was an admin
// endpoint a human posts to by hand. See docs/gaps.md §7b.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const issuerFindUnique = vi.fn();
const businessFindFirst = vi.fn();
const decisionCreate = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({ $on: vi.fn() })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

vi.mock('@backend/config/database.js', () => ({
  prisma: {
    issuer: { findUnique: issuerFindUnique },
    business: { findFirst: businessFindFirst },
    aiDecisionLog: { create: decisionCreate },
    $on: vi.fn(),
  },
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { issuerRulesRouter } = await import('@backend/api/routes/issuer-rules.routes.js');
  const { setPrismaClient } = await import('@backend/services/decision-explainability.service.js');
  const { prisma } = await import('@backend/config/database.js');
  setPrismaClient(prisma as never);

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: 'tenant-1', userId: 'u-1', role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api', issuerRulesRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  decisionCreate.mockResolvedValue({ id: 'log-1' });
  issuerFindUnique.mockResolvedValue({
    id: 'chase',
    name: 'Chase',
    rules: [
      {
        id: 'rule-1',
        ruleName: 'Chase 5/24',
        ruleType: 'velocity_max_apps_per_period',
        severity: 'hard',
        description: 'Five cards in twenty-four months',
        isActive: true,
        // Deliberately unconfigured: `unevaluatedRules` is the part of the
        // answer that stops being true once somebody records the threshold,
        // which is exactly why it has to be written down at the time.
        value: null,
        periodDays: 365,
      },
    ],
  });
  businessFindFirst.mockResolvedValue({
    id: 'biz-1',
    tenantId: 'tenant-1',
    creditProfiles: [],
    cardApplications: [],
    heldCards: [],
  });
});

function decisionRow() {
  const [{ data }] = decisionCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
  return data;
}

describe('an eligibility answer about a business', () => {
  it('is recorded, with the businessId the reader filters on', async () => {
    const res = await fetch(`${baseUrl}/api/issuers/chase/eligibility?businessId=biz-1`);

    expect(res.status).toBe(200);
    expect(decisionCreate).toHaveBeenCalledTimes(1);

    const data = decisionRow();
    expect(data.tenantId).toBe('tenant-1');
    expect(data.moduleSource).toBe('issuer_eligibility');
    // `getBusinessDecisionExplanations` runs a JSONB path query on
    // output.businessId. Omit it and the row is written and never found again.
    expect((data.output as Record<string, unknown>).businessId).toBe('biz-1');
  });

  it('keeps the part of the answer that stops being true', async () => {
    await fetch(`${baseUrl}/api/issuers/chase/eligibility?businessId=biz-1`);

    const output = decisionRow().output as Record<string, unknown>;
    expect(output).toHaveProperty('unevaluatedRules');
    expect(output).toHaveProperty('caveats');
    expect(output).toHaveProperty('eligible');
    expect((output.unevaluatedRules as unknown[]).length).toBeGreaterThan(0);
  });

  it('hashes the context rather than storing a second copy of it', async () => {
    await fetch(`${baseUrl}/api/issuers/chase/eligibility?businessId=biz-1`);

    const data = decisionRow();
    expect(data.inputHash).toMatch(/^[a-f0-9]{64}$/);
    // No confidence and no model version: this is rule evaluation, and a
    // confidence figure invented for it would be the fabrication this log
    // exists to catch.
    expect(data.confidence).toBeNull();
    expect(data.modelVersion).toBeNull();
  });

  it('returns the id of the row, so the answer can be produced later', async () => {
    const res = await fetch(`${baseUrl}/api/issuers/chase/eligibility?businessId=biz-1`);
    const body = (await res.json()) as { data?: { decisionLogId?: string | null } };

    expect(body.data?.decisionLogId).toBe('log-1');
  });
});

describe('a preview with no business named', () => {
  it('is not recorded as a decision about anybody', async () => {
    // The default context exists for UI previews. Logging one would fill the
    // record a compliance officer reads with probes.
    const res = await fetch(`${baseUrl}/api/issuers/chase/eligibility`);

    expect(res.status).toBe(200);
    expect(decisionCreate).not.toHaveBeenCalled();
  });
});

describe('when the decision cannot be written', () => {
  it('still answers, and says the answer was not recorded', async () => {
    // Said out loud rather than swallowed. A decision the system failed to
    // record is a fact about this answer, and the caller is the only one in a
    // position to ask for it again.
    decisionCreate.mockRejectedValue(new Error('ledger unavailable'));

    const res = await fetch(`${baseUrl}/api/issuers/chase/eligibility?businessId=biz-1`);
    const body = (await res.json()) as {
      data?: { decisionLogId?: string | null; decisionNotRecorded?: string | null };
    };

    expect(res.status).toBe(200);
    expect(body.data?.decisionLogId).toBeNull();
    expect(body.data?.decisionNotRecorded).toMatch(/not written to the decision log/i);
  });
});
