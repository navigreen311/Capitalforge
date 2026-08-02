// ============================================================
// client-roster-view — three pages, three real endpoints
//
// /clients, /applications and /funding-rounds each held their own literals
// while populated endpoints sat behind them. These pin the mapping and the
// one judgment that matters across all three: an absent figure is null, not
// zero — a readiness score of 0 is a client assessed as unready, and a
// credit limit of 0 is a card approved for nothing.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toClientRow,
  toClientRows,
  toApplicationRow,
  toApplicationRows,
  toRoundRow,
  toRoundRows,
  formatMoney,
  humanise,
} from '../../../src/frontend/lib/client-roster-view';

/** Captured from GET /api/clients. */
const REAL_CLIENT = {
  id: 'seed-biz-001',
  businessName: 'Apex Digital Solutions LLC',
  status: 'active',
  advisorName: 'Marcus Whitfield',
  fundingReadinessScore: 88,
  lastActivityAt: '2026-08-01T17:11:20.889Z',
  entityType: 'llc',
  state: 'DE',
  consentStatus: 'pending',
};

/** Captured from GET /api/businesses/:id/applications. */
const REAL_APPLICATION = {
  id: 'seed-app-006',
  businessId: 'seed-biz-001',
  issuer: 'Citi',
  cardProduct: 'Citi Business Platinum',
  status: 'approved',
  creditLimit: 15000,
  submittedAt: '2026-01-11T00:00:00.000Z',
  decidedAt: '2026-02-05T00:00:00.000Z',
  declineReason: null,
};

/** Captured from GET /api/funding-rounds — Decimals arrive as strings. */
const REAL_ROUND = {
  id: 'b5fc505b-cbf0-436f-a4e7-73a741c761eb',
  businessId: 'seed-biz-002',
  roundNumber: 1,
  targetCredit: '75000',
  targetCardCount: 3,
  status: 'planning',
  startedAt: null,
  completedAt: null,
};

describe('toClientRow', () => {
  it('maps a real client', () => {
    expect(toClientRow(REAL_CLIENT)).toMatchObject({
      id: 'seed-biz-001',
      businessName: 'Apex Digital Solutions LLC',
      fundingReadinessScore: 88,
      state: 'DE',
    });
  });

  it('keeps an unassessed readiness score null, not zero', () => {
    const row = toClientRow({ ...REAL_CLIENT, fundingReadinessScore: null })!;
    expect(row.fundingReadinessScore).toBeNull();
  });

  it('drops a client with no id or name', () => {
    expect(toClientRow({ businessName: 'Acme' })).toBeNull();
    expect(toClientRow({ id: 'b1' })).toBeNull();
  });

  it('reads the envelope', () => {
    expect(toClientRows({ data: [REAL_CLIENT] })).toHaveLength(1);
    expect(toClientRows(null)).toEqual([]);
  });
});

describe('toApplicationRow', () => {
  it('maps a real application', () => {
    expect(toApplicationRow(REAL_APPLICATION)).toMatchObject({
      id: 'seed-app-006',
      issuer: 'Citi',
      status: 'approved',
      creditLimit: 15000,
    });
  });

  it('keeps an undecided credit limit null rather than zero', () => {
    // A limit of $0 is an approval for nothing. A missing one is an
    // application that has not been decided.
    const row = toApplicationRow({ ...REAL_APPLICATION, creditLimit: null })!;
    expect(row.creditLimit).toBeNull();
    expect(formatMoney(row.creditLimit)).toBe('—');
  });

  it('keeps a recorded decline reason, and no invented one', () => {
    const declined = toApplicationRow({
      ...REAL_APPLICATION,
      status: 'declined',
      declineReason: 'Too many recent inquiries',
    })!;
    expect(declined.declineReason).toBe('Too many recent inquiries');
    expect(toApplicationRow(REAL_APPLICATION)!.declineReason).toBeNull();
  });

  it('reads the envelope', () => {
    expect(toApplicationRows({ data: [REAL_APPLICATION] })).toHaveLength(1);
    expect(toApplicationRows(undefined)).toEqual([]);
  });
});

describe('toRoundRow', () => {
  it('maps a real round, including a Decimal sent as a string', () => {
    expect(toRoundRow(REAL_ROUND)).toMatchObject({
      id: 'b5fc505b-cbf0-436f-a4e7-73a741c761eb',
      roundNumber: 1,
      targetCredit: 75000,
      status: 'planning',
    });
  });

  it('keeps a missing target null', () => {
    expect(toRoundRow({ ...REAL_ROUND, targetCredit: null })!.targetCredit).toBeNull();
  });

  it('drops a round with no id', () => {
    expect(toRoundRow({ businessId: 'b1' })).toBeNull();
  });

  it('reads the envelope', () => {
    expect(toRoundRows({ data: [REAL_ROUND] })).toHaveLength(1);
    expect(toRoundRows('nope')).toEqual([]);
  });
});

describe('formatMoney and humanise', () => {
  it('renders a missing figure as an em dash', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(15000)).toBe('$15,000');
  });

  it('turns API keys into words', () => {
    expect(humanise('in_progress')).toBe('In progress');
  });
});
