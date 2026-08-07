// ============================================================
// Leverage is assessed, or it is not — never fabricated
//
// `scoreRiskRegister` guards every input in its credit block with
// `!== undefined`, so an absent FICO, utilisation or business age contributes
// nothing. One line did not:
//
//   (input.existingDebt ?? 0) / Math.max(input.monthlyRevenue ?? 1, 1)
//
// Absent debt became 0, so a client whose debt nobody recorded scored as
// unleveraged. Absent revenue divided by 1, so the ratio *became the debt
// figure* — $50,000 against unrecorded revenue produced a printed finding
// reading "Debt-to-monthly-revenue 50000.0x — high leverage".
//
// The second is the dangerous one: a fabricated number in a compliance
// artefact, indistinguishable from a measured one by anybody reading it.
// ============================================================

import { describe, it, expect } from 'vitest';
import { scoreRiskRegister } from '../../../src/backend/services/compliance.service';

type Input = Parameters<typeof scoreRiskRegister>[0];

/**
 * The required identifiers, so each case states only the fields under test.
 *
 * Spread rather than cast: the first version of this file passed bare objects,
 * which vitest ran happily and `tsc` rejected for missing `businessId` and
 * `tenantId`. A cast would have silenced the compiler and left the fixture
 * free to drift from the input type.
 */
const BASE: Input = { businessId: 'biz-leverage', tenantId: 'tenant-leverage' };

/** The credit block's factor strings for a given input. */
function creditFactors(over: Partial<Input>): string[] {
  const result = scoreRiskRegister({ ...BASE, ...over });
  return result.categoryScores.find((c) => c.category === 'credit_cash_flow')?.factors ?? [];
}

function creditScore(over: Partial<Input>): number {
  const result = scoreRiskRegister({ ...BASE, ...over });
  return result.categoryScores.find((c) => c.category === 'credit_cash_flow')?.score ?? 0;
}

describe('leverage with both figures on record', () => {
  it('flags high leverage', () => {
    const factors = creditFactors({ existingDebt: 700_000, monthlyRevenue: 100_000 });
    expect(factors.some((f) => f.includes('7.0x') && f.includes('high leverage'))).toBe(true);
  });

  it('flags moderate leverage', () => {
    const factors = creditFactors({ existingDebt: 400_000, monthlyRevenue: 100_000 });
    expect(factors.some((f) => f.includes('4.0x') && f.includes('moderate leverage'))).toBe(true);
  });

  it('says nothing when leverage is comfortable', () => {
    const factors = creditFactors({ existingDebt: 50_000, monthlyRevenue: 100_000 });
    expect(factors.some((f) => f.includes('leverage'))).toBe(false);
  });
});

describe('the ratio that used to be invented', () => {
  it('does not turn unrecorded revenue into a 50000x finding', () => {
    // The exact case. `Math.max(undefined ?? 1, 1)` is 1, so the ratio was the
    // debt figure itself, cleared the > 6 threshold, added 3 to the score and
    // printed itself into the artefact.
    const factors = creditFactors({ existingDebt: 50_000 });
    expect(factors.some((f) => f.includes('50000'))).toBe(false);
    expect(factors.some((f) => f.includes('high leverage'))).toBe(false);
  });

  it('does not score unrecorded debt as unleveraged', () => {
    // The other direction, and the quieter one: absent debt became 0, so a
    // client nobody had recorded debt for looked comfortably geared.
    const factors = creditFactors({ monthlyRevenue: 100_000 });
    expect(factors.some((f) => f.includes('leverage') && !f.includes('not assessed'))).toBe(false);
  });

  it('adds no risk points either way when it cannot be assessed', () => {
    // Not assessing must not become a penalty. The absent-input behaviour of
    // every neighbouring check is to contribute nothing, and this now matches.
    const withNeither = creditScore({});
    const withRevenueOnly = creditScore({ monthlyRevenue: 100_000 });
    const withDebtOnly = creditScore({ existingDebt: 50_000 });
    expect(withRevenueOnly).toBe(withNeither);
    expect(withDebtOnly).toBe(withNeither);
  });
});

describe('what the artefact says when it could not look', () => {
  it('names the gap rather than omitting it silently', () => {
    // The neighbouring inputs drop out quietly, which is fine for a score.
    // This is read later by somebody deciding whether the assessment covered
    // what they think it covered, and "not assessed" must not look like
    // "assessed and fine".
    const factors = creditFactors({ existingDebt: 50_000 });
    expect(factors.some((f) => f.includes('Leverage not assessed'))).toBe(true);
  });

  it('distinguishes zero revenue from absent revenue', () => {
    // A business recorded as earning nothing and one whose revenue nobody
    // entered are different findings, and dividing by either is meaningless
    // for different reasons.
    const zero = creditFactors({ existingDebt: 50_000, monthlyRevenue: 0 });
    expect(zero.some((f) => f.includes('recorded as zero'))).toBe(true);

    const absent = creditFactors({ existingDebt: 50_000 });
    expect(absent.some((f) => f.includes('not on record'))).toBe(true);
  });

  it('does not divide by zero revenue', () => {
    const factors = creditFactors({ existingDebt: 50_000, monthlyRevenue: 0 });
    expect(factors.some((f) => f.includes('Infinity') || f.includes('NaN'))).toBe(false);
  });
});
