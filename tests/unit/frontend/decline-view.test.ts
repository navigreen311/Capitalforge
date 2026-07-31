// ============================================================
// decline-view — mapping the decline recovery endpoints
//
// The board displayed seven hardcoded DeclineRecords for clients that do not
// exist, advanced stages with a setTimeout, and read a missing cooldown date
// as "Eligible Now". These pin the mapping against a real response and pin
// the two claims that must never be invented: reapply eligibility, and a win
// rate over nothing.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toDeclineRow,
  toDeclineRows,
  toReasonCategory,
  toRecoveryStage,
  toReconStatus,
  cooldownState,
  eligibleToReapply,
  toDeclineStats,
  toDeclineAnalytics,
  nextStages,
  isTerminal,
  type DeclineRow,
} from '../../../src/frontend/lib/decline-view';

const NOW = new Date('2026-04-01T00:00:00.000Z');

/** Captured from GET /api/declines. */
const REAL_RECORD = {
  id: 'seed-decline-002',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  businessId: 'seed-biz-002',
  applicationId: 'seed-app-005',
  issuer: 'US Bank',
  declineReasons: {
    primary: 'High utilization',
    card_name: 'Business Altitude Connect',
    declined_at: '2026-02-28T00:00:00.000Z',
    requested_limit: 18000,
  },
  adverseActionRaw: null,
  reconsiderationStatus: 'denied',
  reconsiderationNotes: 'Reconsideration call declined; utilization unchanged at review.',
  reapplyCooldownDate: '2026-05-29T00:00:00.000Z',
  letterGenerated: true,
  recoveryStage: 'lost',
  resolvedAt: '2026-03-14T00:00:00.000Z',
  createdAt: '2026-07-31T22:06:52.979Z',
  updatedAt: '2026-07-31T22:06:52.979Z',
  businessName: 'Meridian Wellness',
};

describe('toDeclineRow', () => {
  it('maps a real record', () => {
    expect(toDeclineRow(REAL_RECORD)).toMatchObject({
      id: 'seed-decline-002',
      businessName: 'Meridian Wellness',
      issuer: 'US Bank',
      cardProduct: 'Business Altitude Connect',
      declinedAt: '2026-02-28T00:00:00.000Z',
      requestedLimit: 18000,
      reconStatus: 'denied',
      recoveryStage: 'lost',
      letterGenerated: true,
    });
  });

  it('takes the decline date from the decline, not from the record', () => {
    // createdAt is when the row was written — for a decline logged after the
    // fact that is months later, and it is not when the client was declined.
    expect(toDeclineRow(REAL_RECORD)?.declinedAt).toBe('2026-02-28T00:00:00.000Z');
  });

  it('leaves the client name null when the id resolves to nothing', () => {
    const row = toDeclineRow({ ...REAL_RECORD, businessName: null });
    // Not '' and not 'Unknown client': the row still identifies a real
    // business id, and a blank reads as a client with no name.
    expect(row?.businessName).toBeNull();
  });

  it('leaves the requested limit null when the issuer gave no figure', () => {
    const row = toDeclineRow({
      ...REAL_RECORD,
      declineReasons: { primary: 'Internal policy' },
    });
    expect(row?.requestedLimit).toBeNull();
    expect(row?.cardProduct).toBeNull();
    expect(row?.declinedAt).toBeNull();
  });

  it('drops a record with no id rather than rendering a row that cannot be acted on', () => {
    expect(toDeclineRow({ issuer: 'Chase' })).toBeNull();
  });

  it('returns an empty list for junk rather than throwing', () => {
    expect(toDeclineRows(null)).toEqual([]);
    expect(toDeclineRows({ nope: true })).toEqual([]);
    expect(toDeclineRows('nonsense')).toEqual([]);
  });
});

describe('toReasonCategory', () => {
  it('buckets the reasons issuers actually give', () => {
    expect(toReasonCategory('Too many recent inquiries')).toBe('too_many_inquiries');
    expect(toReasonCategory('High utilization')).toBe('high_utilization');
    expect(toReasonCategory('Thin business credit file')).toBe('insufficient_history');
    expect(toReasonCategory('5/24 rule')).toBe('velocity');
    expect(toReasonCategory('Stated income could not be verified')).toBe('income_verification');
    expect(toReasonCategory('Tax lien on personal credit')).toBe('derogatory_marks');
    expect(toReasonCategory('Declined per issuer internal policy')).toBe('internal_policy');
  });

  it('says unknown rather than guessing', () => {
    // The category drives which argument an advisor makes on the
    // reconsideration call, so a wrong bucket is worse than none.
    expect(toReasonCategory('')).toBe('unknown');
    expect(toReasonCategory(null)).toBe('unknown');
    expect(toReasonCategory('Application not approved at this time')).toBe('unknown');
  });
});

describe('toRecoveryStage / toReconStatus', () => {
  it('accepts every stage the workflow defines', () => {
    for (const s of ['new', 'letter_sent', 'recon_call_scheduled', 'won', 'lost']) {
      expect(toRecoveryStage(s)).toBe(s);
    }
  });

  it('falls back to the first stage for an unrecognised value', () => {
    expect(toRecoveryStage('who_knows')).toBe('new');
    expect(toRecoveryStage(undefined)).toBe('new');
  });

  it('falls back to pending, not approved, for an unrecognised recon status', () => {
    // Defaulting to an outcome would report a reconsideration result nobody
    // recorded.
    expect(toReconStatus('nonsense')).toBe('pending');
    expect(toReconStatus(undefined)).toBe('pending');
    expect(toReconStatus('approved')).toBe('approved');
  });
});

describe('cooldownState', () => {
  it('is unknown when no cooldown date is recorded', () => {
    // The board used to render this as "Eligible Now" — telling an advisor a
    // reapplication is safe on the strength of having no record of when it
    // would be. That costs the client a hard pull and, inside the issuer's
    // window, very likely a second decline.
    expect(cooldownState(null, NOW)).toEqual({
      status: 'unknown',
      daysRemaining: null,
      until: null,
    });
  });

  it('is unknown for an unparseable date rather than eligible', () => {
    expect(cooldownState('not a date', NOW).status).toBe('unknown');
  });

  it('is eligible once the recorded cooldown has passed', () => {
    expect(cooldownState('2026-03-01T00:00:00.000Z', NOW)).toMatchObject({
      status: 'eligible',
      daysRemaining: 0,
    });
  });

  it('counts the days left while a cooldown is running', () => {
    expect(cooldownState('2026-04-21T00:00:00.000Z', NOW)).toMatchObject({
      status: 'waiting',
      daysRemaining: 20,
    });
  });
});

describe('eligibleToReapply', () => {
  const row = (over: Partial<DeclineRow>): DeclineRow =>
    ({ ...(toDeclineRow(REAL_RECORD) as DeclineRow), ...over });

  it('counts only declines with a cooldown that has demonstrably passed', () => {
    const rows = [
      row({ id: 'a', recoveryStage: 'new', reapplyCooldownDate: '2026-03-01T00:00:00.000Z' }),
      row({ id: 'b', recoveryStage: 'new', reapplyCooldownDate: '2026-06-01T00:00:00.000Z' }),
      // No date on file — unknown, so it is not counted as eligible.
      row({ id: 'c', recoveryStage: 'new', reapplyCooldownDate: null }),
    ];
    expect(eligibleToReapply(rows, NOW).map((r) => r.id)).toEqual(['a']);
  });

  it('does not offer a reapplication on a decline already resolved', () => {
    const rows = [
      row({ id: 'won', recoveryStage: 'won', reapplyCooldownDate: '2026-03-01T00:00:00.000Z' }),
      row({ id: 'lost', recoveryStage: 'lost', reapplyCooldownDate: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(eligibleToReapply(rows, NOW)).toEqual([]);
  });
});

describe('toDeclineStats', () => {
  const REAL_STATS = {
    totalDeclines: 3,
    stageCounts: { new: 0, letter_sent: 1, won: 1, lost: 1 },
    winRate: 50,
    wonCount: 1,
    lostCount: 1,
    avgRecoveryDays: 18,
    avgRecoveryBasedOn: 2,
  };

  it('maps a real stats response', () => {
    expect(toDeclineStats(REAL_STATS)).toMatchObject({
      totalDeclines: 3,
      winRate: 50,
      avgRecoveryDays: 18,
      avgRecoveryBasedOn: 2,
    });
  });

  it('fills every stage, so a stage absent from the response reads as zero', () => {
    expect(toDeclineStats(REAL_STATS)?.stageCounts.recon_call_scheduled).toBe(0);
  });

  it('has no win rate until something has been resolved', () => {
    const stats = toDeclineStats({ ...REAL_STATS, wonCount: 0, lostCount: 0, winRate: 0 });
    // Guarded on this side too: 0% reads as never winning a reconsideration.
    expect(stats?.winRate).toBeNull();
  });

  it('has no average recovery time when the API reports none', () => {
    const stats = toDeclineStats({ ...REAL_STATS, avgRecoveryDays: null, avgRecoveryBasedOn: 0 });
    expect(stats?.avgRecoveryDays).toBeNull();
    expect(stats?.avgRecoveryBasedOn).toBe(0);
  });

  it('returns null for a response it cannot read', () => {
    expect(toDeclineStats(null)).toBeNull();
    expect(toDeclineStats({ error: 'nope' })).toBeNull();
  });
});

describe('toDeclineAnalytics', () => {
  const REAL_ANALYTICS = {
    totalDeclines: 3,
    reasonBreakdown: [
      { reason: 'Too many recent inquiries', total: 1, won: 0, lost: 0, winRate: null },
      { reason: 'Thin business credit file', total: 1, won: 1, lost: 0, winRate: 100 },
    ],
    issuerBreakdown: [{ issuer: 'Citi', total: 1, won: 1, lost: 0, winRate: 100 }],
  };

  it('maps a real analytics response', () => {
    const a = toDeclineAnalytics(REAL_ANALYTICS);
    expect(a?.totalDeclines).toBe(3);
    expect(a?.byReason).toHaveLength(2);
    expect(a?.byIssuer[0]).toMatchObject({ label: 'Citi', winRate: 100, resolved: 1 });
  });

  it('keeps a null win rate null and says nothing is resolved', () => {
    const a = toDeclineAnalytics(REAL_ANALYTICS);
    expect(a?.byReason[0]).toMatchObject({ winRate: null, resolved: 0 });
  });

  it('drops a breakdown row with no label rather than charting a blank bar', () => {
    const a = toDeclineAnalytics({
      totalDeclines: 1,
      reasonBreakdown: [{ total: 4, won: 1, lost: 1, winRate: 50 }],
      issuerBreakdown: [],
    });
    expect(a?.byReason).toEqual([]);
  });

  it('returns null for a response it cannot read', () => {
    expect(toDeclineAnalytics(undefined)).toBeNull();
  });
});

describe('nextStages', () => {
  it('offers the next stage plus both outcomes', () => {
    expect(nextStages('new')).toEqual(['letter_sent', 'won', 'lost']);
    expect(nextStages('recon_call_scheduled')).toEqual([
      'recon_call_completed',
      'won',
      'lost',
    ]);
  });

  it('offers only the outcomes at the last stage before resolution', () => {
    expect(nextStages('reapplied')).toEqual(['won', 'lost']);
  });

  it('offers nothing once resolved', () => {
    // Resolving stamps resolvedAt and, for a win, approves the underlying
    // application. Offering a move out would imply that undoes it.
    expect(nextStages('won')).toEqual([]);
    expect(nextStages('lost')).toEqual([]);
    expect(isTerminal('won')).toBe(true);
    expect(isTerminal('new')).toBe(false);
  });
});
