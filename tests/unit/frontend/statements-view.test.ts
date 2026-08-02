// ============================================================
// statements-view — anomalies come from the detector
//
// The page listed anomalies nobody detected, including a duplicate $695
// annual fee with an instruction to call Amex and escalate within five
// business days. These pin the judgments that stop that returning: an
// unreadable severity is not escalated, a missing figure is not zero, and an
// anomaly with no description is dropped rather than rendered blank.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toStatementRow,
  toStatementRows,
  toAnomalyRow,
  toAnomalyRows,
  toSeverity,
  summarise,
  formatMoney,
} from '../../../src/frontend/lib/statements-view';

/** Captured from GET /api/statements?client_id=. */
const REAL_STATEMENT = {
  id: 'f1e2d3c4-b5a6-4978-8899-aabbccddeeff',
  issuer: 'Chase',
  statementDate: '2026-03-15T00:00:00.000Z',
  closingBalance: 12450.32,
  minimumPayment: 622.52,
  dueDate: '2026-04-10T00:00:00.000Z',
  feesCharged: 95,
  interestCharged: null,
  reconciled: false,
  anomalyCount: 1,
};

describe('toStatementRow', () => {
  it('maps a real statement', () => {
    expect(toStatementRow(REAL_STATEMENT)).toMatchObject({
      id: 'f1e2d3c4-b5a6-4978-8899-aabbccddeeff',
      issuer: 'Chase',
      closingBalance: 12450.32,
      reconciled: false,
      anomalyCount: 1,
    });
  });

  it('keeps a missing figure null rather than zero', () => {
    // A closing balance of $0 is a statement that was paid off. A missing
    // one is a statement whose balance was not recorded.
    const row = toStatementRow({ ...REAL_STATEMENT, closingBalance: null, minimumPayment: null })!;
    expect(row.closingBalance).toBeNull();
    expect(row.minimumPayment).toBeNull();
    expect(formatMoney(row.closingBalance)).toBe('—');
  });

  it('drops a statement with no id', () => {
    expect(toStatementRow({ issuer: 'Chase' })).toBeNull();
  });

  it('reads the envelope, and junk as empty', () => {
    expect(toStatementRows({ statements: [REAL_STATEMENT] })).toHaveLength(1);
    expect(toStatementRows(null)).toEqual([]);
  });
});

describe('toSeverity', () => {
  it('accepts what the detector records', () => {
    for (const v of ['low', 'medium', 'high', 'critical']) {
      expect(toSeverity(v)).toBe(v);
    }
  });

  it('never escalates something it cannot read', () => {
    // An anomaly shown critical because its severity did not parse sends an
    // advisor to an issuer about a charge that may not exist.
    expect(toSeverity('URGENT')).toBe('low');
    expect(toSeverity(undefined)).toBe('low');
  });
});

describe('toAnomalyRow', () => {
  const REAL_ANOMALY = {
    type: 'fee_mismatch',
    severity: 'high',
    description: 'Annual fee of $95 charged but no annual fee is recorded for this card.',
    amount: 95,
    transactionRef: 'ANNUAL FEE',
  };

  it('maps a detected anomaly', () => {
    expect(toAnomalyRow(REAL_ANOMALY)).toEqual({
      type: 'fee_mismatch',
      severity: 'high',
      description: 'Annual fee of $95 charged but no annual fee is recorded for this card.',
      amount: 95,
      transactionRef: 'ANNUAL FEE',
    });
  });

  it('carries no remediation instruction', () => {
    // "Contact Amex commercial servicing to request reversal … escalate if
    // unresolved within 5 business days" was written into the fixture. The
    // detector produces a description, not advice.
    const row = toAnomalyRow(REAL_ANOMALY) as unknown as Record<string, unknown>;
    for (const field of ['suggestedAction', 'remediation', 'escalateAfterDays']) {
      expect(row[field]).toBeUndefined();
    }
  });

  it('drops an anomaly with no description', () => {
    expect(toAnomalyRow({ type: 'fee_mismatch', severity: 'high' })).toBeNull();
  });

  it('flattens the per-statement reports', () => {
    const rows = toAnomalyRows({
      reports: [
        { statementId: 'st-1', anomalies: [REAL_ANOMALY, REAL_ANOMALY] },
        { statementId: 'st-2', anomalies: [] },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].statementId).toBe('st-1');
  });

  it('returns nothing for junk', () => {
    expect(toAnomalyRows(null)).toEqual([]);
    expect(toAnomalyRows({ reports: 'nope' })).toEqual([]);
  });
});

describe('summarise', () => {
  const row = (over: Record<string, unknown>) => toStatementRow({ ...REAL_STATEMENT, ...over })!;

  it('counts statements, reconciliation and anomalies', () => {
    const s = summarise([
      row({ id: 'a', reconciled: true, anomalyCount: 0 }),
      row({ id: 'b', reconciled: false, anomalyCount: 2 }),
    ]);
    expect(s).toMatchObject({ statements: 2, reconciled: 1, withAnomalies: 1 });
    expect(s.totalClosingBalance).toBeCloseTo(24900.64, 2);
  });

  it('reports no total when no statement carries a balance', () => {
    const s = summarise([row({ id: 'a', closingBalance: null })]);
    expect(s.totalClosingBalance).toBeNull();
  });

  it('handles an empty list', () => {
    expect(summarise([])).toEqual({
      statements: 0,
      reconciled: 0,
      withAnomalies: 0,
      totalClosingBalance: null,
    });
  });
});
