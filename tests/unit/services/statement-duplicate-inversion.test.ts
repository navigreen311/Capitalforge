// ============================================================
// The module stopped deleting what it exists to find
//
// The pipeline is: normalize → dedupe → detect. The deduper removed rows on
// `date|amount|description`, and the duplicate-charge detector then looked for
// duplicates in what was left, keyed on `description|amount` with no date.
//
// So the canonical duplicate — same day, same amount, same merchant, the one a
// cardholder disputes — was deleted one step before the check that exists to
// find it, surviving as the string "1 duplicate transaction(s) removed".
// What could still fire was the same description and amount on different
// dates: two identical subscription renewals, two identical fuel stops. True
// positives removed, false positives reported, both at `high`.
//
// It reached the arithmetic too. The issuer's closing balance still contained
// the deleted row, so the expected balance came out low by exactly its amount
// and a real double charge was reported as a `balance_mismatch` — critical
// over $50 — attributed to nothing.
//
// These tests run the whole pipeline, because every part of this was correct
// in isolation.
// ============================================================

import { describe, it, expect } from 'vitest';
import { StatementNormalizer } from '../../../src/backend/services/statement-normalizer.js';
import { StatementReconciliationService } from '../../../src/backend/services/statement-reconciliation.service.js';

const normalizer = new StatementNormalizer();
const service = new StatementReconciliationService(
  {} as never,
  { publishAndPersist: async () => null } as never,
);

/** A statement whose issuer charged $250 twice on the same day. */
function doubleCharged() {
  return normalizer.normalize({
    issuer: 'Chase',
    statementDate: '2026-01-31',
    dueDate: '2026-02-25',
    previousBalance: 2000,
    // 2000 + 250 + 250 = 2500. The issuer billed both.
    closingBalance: 2500,
    minimumPayment: 25,
    interestCharged: 0,
    feesCharged: 0,
    transactions: [
      { description: 'Costco Wholesale', amount: 250, transactionDate: '2026-01-10' },
      { description: 'Costco Wholesale', amount: 250, transactionDate: '2026-01-10' },
    ],
  });
}

describe('a same-day double charge', () => {
  it('survives normalization instead of being counted and dropped', () => {
    const normalized = doubleCharged();

    // Still collapsed out of the arithmetic set — that has not changed.
    expect(normalized.transactions).toHaveLength(1);
    // But carried, rather than discarded.
    expect(normalized.removedDuplicates).toHaveLength(1);
    expect(normalized.removedDuplicates[0]!.amount).toBe(250);
  });

  it('is reported as a duplicate-charge candidate', () => {
    const anomalies = service.detectFeeAnomalies(doubleCharged());
    const dup = anomalies.find((a) => a.type === 'duplicate_charge');

    expect(dup).toBeDefined();
    expect(dup?.severity).toBe('high');
    // The excess. The other $250 is a purchase the client made.
    expect(dup?.amount).toBe(250);
  });

  it('is not reported instead as a phantom balance mismatch', () => {
    // Before: expected = 2000 + 250 = 2250 against a reported 2500, delta 250,
    // 'critical', described as a balance discrepancy of unknown origin. The
    // duplicate was the entire explanation and nothing said so.
    const anomalies = service.detectBalanceMismatch(doubleCharged());
    const mismatch = anomalies.find((a) => a.type === 'balance_mismatch');

    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).not.toBe('critical');
    expect(mismatch?.description).toMatch(/may be off by \$250\.00/);
    expect(mismatch?.description).toMatch(/duplicate-charge candidates/);
  });
});

describe('a statement that reconciles', () => {
  it('reports no mismatch and no duplicate', () => {
    const normalized = normalizer.normalize({
      issuer: 'Chase',
      statementDate: '2026-01-31',
      previousBalance: 2000,
      closingBalance: 2250,
      minimumPayment: 25,
      interestCharged: 0,
      feesCharged: 0,
      transactions: [
        { description: 'Costco Wholesale', amount: 250, transactionDate: '2026-01-10' },
      ],
    });

    expect(normalized.removedDuplicates).toEqual([]);
    expect(service.detectBalanceMismatch(normalized)).toEqual([]);
    expect(
      service.detectFeeAnomalies(normalized).filter((a) => a.type === 'duplicate_charge'),
    ).toEqual([]);
  });
});

describe('the fee spike, which has no prior period', () => {
  it('compares a fee against the other fees on the same statement', () => {
    const normalized = normalizer.normalize({
      issuer: 'Chase',
      statementDate: '2026-01-31',
      transactions: [
        { description: 'Late Fee', amount: 39, transactionDate: '2026-01-05' },
        { description: 'Late Fee', amount: 39, transactionDate: '2026-01-12' },
        { description: 'Returned Payment Fee', amount: 300, transactionDate: '2026-01-20' },
      ],
    });

    const spikes = service.detectFeeAnomalies(normalized).filter((a) => a.type === 'fee_spike');

    // Two identical $39 fees used to be filtered out together by
    // `filter(a => a !== amount)`, so each was compared against an average
    // neither was in. Leaving out one BY POSITION, $39 against an average of
    // (39 + 300) / 2 = $169.50 is not a spike; $300 against (39 + 39) / 2 =
    // $39 is.
    expect(spikes).toHaveLength(1);
    expect(spikes[0]!.amount).toBe(300);
    expect(spikes[0]!.description).toMatch(/other fees on this statement/i);
    // And says outright that it is not the prior-period comparison the file
    // header used to claim, since that is what a reader expects of a "spike".
    expect(spikes[0]!.description).toMatch(/not a prior-period average/i);
  });
});
