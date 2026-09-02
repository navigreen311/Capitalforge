// ============================================================
// One question, one rule set
//
// Two endpoints answered "who is ready for another round" and disagreed:
//
//                      /api/restack/eligible   /api/v1/dashboard/restack
//   readiness          >= 70                   > 70
//   recency            90d since last APP      90d since last completed ROUND
//   prior history      first round allowed     >= 1 completed round required
//   utilization        <= 40%                  not checked
//   active apps        <= 2                    not checked
//   round in progress  not checked             excluded
//
// A client scoring exactly 70 was eligible on one surface and invisible on the
// other, and neither response said which rule set had answered. The dashboard
// now presents what the service decides; the one rule the dashboard had and the
// service did not — a round already in progress — moved into the service.
//
// The rest of this file covers what the service was getting wrong on its own:
//
//   - `latestCredit?.utilization ? ... : null` treated 0 as absent, so a client
//     at 0% utilization was recorded as having no utilization data.
//   - Missing utilization SKIPPED and passed, eight lines below a readiness
//     check that blocks for exactly that reason.
//   - A business that does not exist got a 200 with `eligible: false` and a
//     `recommendedRoundNumber: 1` attached to it.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkRestackEligibility,
  scanAllForRestack,
  RestackBusinessNotFoundError,
  setPrismaClient,
} from '../../../src/backend/services/restack-trigger.js';

const TENANT = 'tenant-1';

const businessFindFirst = vi.fn();
const businessFindMany = vi.fn();
const businessCount = vi.fn();
const transaction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  setPrismaClient({
    business: {
      findFirst: businessFindFirst,
      findMany: businessFindMany,
      count: businessCount,
    },
    $transaction: transaction,
  } as never);
});

/** A business that passes every criterion. */
function healthy(over: Record<string, unknown> = {}) {
  return {
    id: 'biz-1',
    legalName: 'Acme Holdings LLC',
    tenantId: TENANT,
    fundingReadinessScore: 84,
    cardApplications: [],
    fundingRounds: [{ roundNumber: 2, status: 'completed', completedAt: new Date('2026-01-15') }],
    creditProfiles: [{ utilization: 0.2 }],
    ...over,
  };
}

describe('utilization', () => {
  it('treats 0% as the best possible reading, not as missing data', async () => {
    // `latestCredit?.utilization ? Number(...) : null` — 0 is falsy, so the
    // client with nothing on their cards was reported as having no data.
    businessFindFirst.mockResolvedValue(healthy({ creditProfiles: [{ utilization: 0 }] }));

    const result = await checkRestackEligibility('biz-1', TENANT);

    expect(result.currentUtilization).toBe(0);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain('Utilization 0% is within limit');
    expect(result.reasons.join(' ')).not.toMatch(/could not be checked/);
  });

  it('blocks when there is no credit profile, rather than skipping the check', async () => {
    // This pushed 'No utilization data available — skipping utilization check'
    // and left `eligible` untouched: missing data passed the check meant to
    // catch overextension, eight lines below a readiness check that blocks for
    // exactly this reason.
    businessFindFirst.mockResolvedValue(healthy({ creditProfiles: [] }));

    const result = await checkRestackEligibility('biz-1', TENANT);

    expect(result.currentUtilization).toBeNull();
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/Utilization could not be checked/);
  });

  it('still blocks a client over the limit', async () => {
    businessFindFirst.mockResolvedValue(healthy({ creditProfiles: [{ utilization: 0.55 }] }));

    const result = await checkRestackEligibility('biz-1', TENANT);

    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/55% exceeds 40% max/);
  });
});

describe('a round already in progress', () => {
  it('blocks — the rule the dashboard had and the service did not', async () => {
    businessFindFirst.mockResolvedValue(
      healthy({ fundingRounds: [{ roundNumber: 3, status: 'in_progress', completedAt: null }] }),
    );

    const result = await checkRestackEligibility('biz-1', TENANT);

    expect(result.roundInProgress).toBe(true);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('A funding round is already in progress');
  });

  it('counts a round still in planning', async () => {
    businessFindFirst.mockResolvedValue(
      healthy({ fundingRounds: [{ roundNumber: 3, status: 'planning', completedAt: null }] }),
    );

    expect((await checkRestackEligibility('biz-1', TENANT)).eligible).toBe(false);
  });
});

describe('the round figures the dashboard needs', () => {
  it('come from the service rather than a second query', async () => {
    const result = await (async () => {
      businessFindFirst.mockResolvedValue(healthy());
      return checkRestackEligibility('biz-1', TENANT);
    })();

    expect(result.currentRoundNumber).toBe(2);
    expect(result.recommendedRoundNumber).toBe(3);
    expect(result.lastCompletedRoundAt).toBe(new Date('2026-01-15').toISOString());
  });

  it('report no last-funded date when a completed round has no timestamp', async () => {
    // The dashboard's inline copy treated a missing `completedAt` as passing
    // its ninety-day test, so a round completed yesterday without one was
    // offered as a 90-day-old opportunity.
    businessFindFirst.mockResolvedValue(
      healthy({ fundingRounds: [{ roundNumber: 1, status: 'completed', completedAt: null }] }),
    );

    const result = await checkRestackEligibility('biz-1', TENANT);

    expect(result.lastCompletedRoundAt).toBeNull();
  });

  it('report round 0 for a client with no funding history', async () => {
    businessFindFirst.mockResolvedValue(healthy({ fundingRounds: [] }));

    const result = await checkRestackEligibility('biz-1', TENANT);

    expect(result.currentRoundNumber).toBe(0);
    expect(result.recommendedRoundNumber).toBe(1);
  });
});

describe('a business that does not exist', () => {
  it('throws rather than answering about it', async () => {
    // This returned `{ businessName: 'Unknown', eligible: false, reasons:
    // ['Business not found'], recommendedRoundNumber: 1 }` and the route
    // answered 200 — a recommendation for a business that is not there, and no
    // way for a caller to tell that from "checked and not eligible".
    businessFindFirst.mockResolvedValue(null);

    await expect(checkRestackEligibility('nope', TENANT)).rejects.toBeInstanceOf(
      RestackBusinessNotFoundError,
    );
  });

  it('is read within the calling tenant', async () => {
    businessFindFirst.mockResolvedValue(null);

    await checkRestackEligibility('other-tenant-biz', TENANT).catch(() => undefined);

    const [{ where }] = businessFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ id: 'other-tenant-biz', tenantId: TENANT });
  });
});

describe('the scan', () => {
  it('reports what it looked at, not only what it found', async () => {
    // `total: eligible.length` alone reads as "three out of everybody". The
    // pre-filter excludes clients with no readiness assessment — Prisma's
    // `gte` drops NULLs — so it is three out of whoever has been scored, and
    // nothing said how many had not.
    businessFindMany.mockResolvedValue([{ id: 'biz-1', tenantId: TENANT }]);
    businessCount.mockResolvedValueOnce(45).mockResolvedValueOnce(40);
    businessFindFirst.mockResolvedValue(healthy());

    const scan = await scanAllForRestack(TENANT);

    expect(scan.results).toHaveLength(1);
    expect(scan.activeCount).toBe(45);
    expect(scan.candidateCount).toBe(1);
    expect(scan.notAssessedCount).toBe(40);
  });

  it('skips a business that disappears mid-scan rather than failing entirely', async () => {
    businessFindMany.mockResolvedValue([
      { id: 'biz-gone', tenantId: TENANT },
      { id: 'biz-1', tenantId: TENANT },
    ]);
    businessCount.mockResolvedValue(2);
    businessFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(healthy());

    const scan = await scanAllForRestack(TENANT);

    expect(scan.results).toHaveLength(1);
    expect(scan.results[0]!.businessId).toBe('biz-1');
  });

  it('scopes every query to the tenant', async () => {
    businessFindMany.mockResolvedValue([]);
    businessCount.mockResolvedValue(0);

    await scanAllForRestack(TENANT);

    const [{ where }] = businessFindMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ tenantId: TENANT, status: 'active' });
  });
});
