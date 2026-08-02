// ============================================================
// funding-round-detail-view — one round, not the same round every time
//
// The page was a single literal: round FR-018 for Apex Ventures LLC, three
// cards, $150,000 targeted and $105,000 obtained, rendered for every id
// including ids that do not exist. It survived four passes because the sweep
// that finds these skips dynamic segments — it cannot visit a route that
// needs an id, so the one page with fixtures was the one it could not reach.
//
// These pin the two judgments the mapper carries: nothing renders until a
// round has actually been read, and an absent figure stays absent.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toFundingRoundDetail,
  aprDaysRemaining,
  EMPTY_ROUND,
} from '../../../src/frontend/lib/funding-round-detail-view';

/** Shaped as GET /api/funding-rounds/:roundId returns it. */
const RESPONSE = {
  success: true,
  data: {
    id: 'seed-round-001',
    businessId: 'seed-biz-001',
    businessName: 'Apex Digital Solutions LLC',
    roundNumber: 2,
    status: 'in_progress',
    targetCredit: 150000,
    targetCardCount: 3,
    aprExpiryDate: '2026-10-12T00:00:00.000Z',
    aprExpiryDaysRemaining: 71,
    startedAt: '2026-01-15T00:00:00.000Z',
    completedAt: null,
    progress: {
      applicationCount: 2,
      approvedCount: 2,
      declinedCount: 0,
      pendingCount: 0,
      creditObtained: 80000,
      creditRemaining: 70000,
      targetProgressPct: 53,
    },
    applications: [
      {
        id: 'seed-app-001',
        issuer: 'Chase',
        cardProduct: 'Ink Business Preferred',
        status: 'approved',
        creditLimit: '45000',
        introAprExpiry: '2026-10-12T00:00:00.000Z',
        declineReason: null,
      },
      {
        id: 'seed-app-002',
        issuer: 'American Express',
        cardProduct: 'Blue Business Cash',
        status: 'approved',
        creditLimit: '35000',
        introAprExpiry: null,
        declineReason: null,
      },
    ],
  },
};

describe('toFundingRoundDetail', () => {
  it('maps the round and its applications', () => {
    const view = toFundingRoundDetail(RESPONSE);
    expect(view.id).toBe('seed-round-001');
    expect(view.businessName).toBe('Apex Digital Solutions LLC');
    expect(view.applications).toHaveLength(2);
    expect(view.progress.creditObtained).toBe(80000);
    expect(view.loaded).toBe(true);
  });

  it('reads a Decimal credit limit that arrived as a string', () => {
    const view = toFundingRoundDetail(RESPONSE);
    expect(view.applications[0]?.creditLimit).toBe(45000);
  });

  it('does not render a round it has not read', () => {
    // The whole defect: the page drew FR-018 for any id, including one that
    // answers 404. Without an id in the body there is no round.
    expect(toFundingRoundDetail(undefined)).toEqual(EMPTY_ROUND);
    expect(toFundingRoundDetail({})).toEqual(EMPTY_ROUND);
    expect(
      toFundingRoundDetail({ success: false, error: { code: 'ROUND_NOT_FOUND' } }).loaded,
    ).toBe(false);
  });

  it('leaves an unrecorded target null rather than zero', () => {
    const view = toFundingRoundDetail({
      data: {
        id: 'r1',
        businessName: 'Some Co',
        progress: { creditObtained: 0, creditRemaining: null, targetProgressPct: null },
        applications: [],
      },
    });
    // A target of 0 says the round is raising nothing; no target says nobody
    // set one.
    expect(view.targetCredit).toBeNull();
    expect(view.progress.creditRemaining).toBeNull();
    expect(view.progress.targetProgressPct).toBeNull();
  });

  it('keeps a card with no recorded limit null', () => {
    const view = toFundingRoundDetail({
      data: {
        id: 'r1',
        businessName: 'Some Co',
        applications: [{ id: 'a1', issuer: 'Chase', cardProduct: 'Ink', status: 'draft' }],
      },
    });
    expect(view.applications[0]?.creditLimit).toBeNull();
  });

  it('drops an application with no id rather than inventing one', () => {
    const view = toFundingRoundDetail({
      data: { id: 'r1', businessName: 'Co', applications: [{ issuer: 'Chase' }, { id: 'ok' }] },
    });
    expect(view.applications).toHaveLength(1);
    expect(view.applications[0]?.id).toBe('ok');
  });
});

describe('aprDaysRemaining', () => {
  it('counts the days to the expiry', () => {
    const now = new Date('2026-08-02T00:00:00.000Z');
    expect(aprDaysRemaining('2026-08-12T00:00:00.000Z', now)).toBe(10);
  });

  it('is negative once the intro rate has lapsed', () => {
    const now = new Date('2026-08-02T00:00:00.000Z');
    expect(aprDaysRemaining('2026-07-30T00:00:00.000Z', now)).toBeLessThan(0);
  });

  it('is null without an expiry date', () => {
    // The fixture carried aprDaysLeft next to each card, so the count could
    // disagree with the date beside it. Deriving one from the other removes
    // that possibility.
    expect(aprDaysRemaining(null)).toBeNull();
    expect(aprDaysRemaining('not a date')).toBeNull();
  });
});
