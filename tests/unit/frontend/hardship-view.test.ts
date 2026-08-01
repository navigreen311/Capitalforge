// ============================================================
// hardship-view — the cases come from the record
//
// The page held two clients in workout and generated a settlement offer for
// them from multipliers of an invented balance. These pin what the mapper
// may carry: what the table holds, and nothing derived from a debt figure
// the system does not have.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toHardshipRow,
  toHardshipRows,
  summarise,
  humanise,
} from '../../../src/frontend/lib/hardship-view';

/** Captured from GET /api/financial/hardship-cases. */
const REAL_ROW = {
  id: '6f0a1b2c-3d4e-4f50-9a1b-2c3d4e5f6071',
  businessId: 'seed-biz-002',
  businessName: 'Meridian Health & Wellness S Corp',
  triggerType: 'missed_payments',
  severity: 'critical',
  status: 'open',
  hasPaymentPlan: false,
  hasSettlementOffer: false,
  counselorReferral: null,
  openedAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
  resolvedAt: null,
};

describe('toHardshipRow', () => {
  it('maps a real case', () => {
    expect(toHardshipRow(REAL_ROW)).toMatchObject({
      id: '6f0a1b2c-3d4e-4f50-9a1b-2c3d4e5f6071',
      businessId: 'seed-biz-002',
      businessName: 'Meridian Health & Wellness S Corp',
      severity: 'critical',
      status: 'open',
      hasPaymentPlan: false,
    });
  });

  it('carries no debt, missed payments, utilisation or advisor', () => {
    // The page showed all four per client — $84,500, 3, 92%, Sarah Mitchell
    // — and the table has a column for none of them.
    const row = toHardshipRow(REAL_ROW) as unknown as Record<string, unknown>;
    for (const invented of [
      'totalDebt', 'missedPayments', 'utilization', 'assignedAdvisor', 'clientName',
    ]) {
      expect(row[invented]).toBeUndefined();
    }
  });

  it('reports only whether a plan or offer is attached, not its terms', () => {
    const row = toHardshipRow({ ...REAL_ROW, hasPaymentPlan: true, hasSettlementOffer: true })!;
    expect(row.hasPaymentPlan).toBe(true);
    expect(row.hasSettlementOffer).toBe(true);
    const asRecord = row as unknown as Record<string, unknown>;
    expect(asRecord['settlementAmount']).toBeUndefined();
    expect(asRecord['monthlyPayment']).toBeUndefined();
  });

  it('drops a case with no id or no business', () => {
    expect(toHardshipRow({ businessId: 'b1' })).toBeNull();
    expect(toHardshipRow({ id: 'c1' })).toBeNull();
  });

  it('keeps an unresolved business name null rather than guessing', () => {
    expect(toHardshipRow({ ...REAL_ROW, businessName: null })?.businessName).toBeNull();
  });

  it('reads the envelope, and junk as empty', () => {
    expect(toHardshipRows({ data: [REAL_ROW] })).toHaveLength(1);
    expect(toHardshipRows(null)).toEqual([]);
  });
});

describe('summarise', () => {
  const row = (over: Record<string, unknown>) => toHardshipRow({ ...REAL_ROW, ...over })!;

  it('counts by status and severity', () => {
    const s = summarise([
      row({ id: 'a', status: 'open', severity: 'critical' }),
      row({ id: 'b', status: 'in_negotiation', severity: 'serious', hasPaymentPlan: true }),
      row({ id: 'c', status: 'resolved', severity: 'minor' }),
      row({ id: 'd', status: 'written_off', severity: 'critical' }),
    ]);
    expect(s).toEqual({ total: 4, open: 2, resolved: 2, critical: 2, withPlan: 1 });
  });

  it('handles an empty list', () => {
    expect(summarise([])).toEqual({ total: 0, open: 0, resolved: 0, critical: 0, withPlan: 0 });
  });
});

describe('humanise', () => {
  it('turns API keys into words', () => {
    expect(humanise('missed_payments')).toBe('Missed payments');
    expect(humanise('in_negotiation')).toBe('In negotiation');
  });
});
