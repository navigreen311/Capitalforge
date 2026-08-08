// ============================================================
// Verdict derivation for the simulator result view.
//
// The score sets here are real output from
// fundingSimulator.runScenario, not invented fixtures — three profiles
// run against the service while designing this view. They are the cases
// the UI has to tell apart, and two of them were only visible by
// running it.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  deriveVerdict,
  rankedOptions,
  aprShare,
  money,
  percent,
  ratio,
  NOT_REPORTED,
  type AlternativeComparison,
  type ProductOption,
  type ProductType,
} from '../../../src/frontend/lib/simulator-result';

function option(productType: ProductType, suitabilityScore: number, effectiveApr = 0.2): ProductOption {
  return {
    productType,
    productName: productType,
    estimatedAmount: 50_000,
    effectiveApr,
    approvalTimelineDays: 10,
    approvalProbability: 0.5,
    estimatedMonthlyPayment: 1_000,
    totalCost24m: 24_000,
    pros: [],
    cons: [],
    suitabilityScore,
  };
}

function comparison(options: ProductOption[], primaryChoice: ProductType): AlternativeComparison {
  return {
    profileSummary: { ficoScore: 700, annualRevenue: 500_000, existingDebt: 0, debtServiceRatio: 0 },
    options,
    recommendation: { primaryChoice, rationale: 'unused by the derivation', warnings: [] },
  };
}

describe('deriveVerdict', () => {
  // Real output, strong profile: FICO 720, 6 years, $850k revenue.
  // Three products sit at the cap and the service reports one winner.
  it('reports a tie when the top score is shared', () => {
    const options = [
      option('credit_card_stack', 100),
      option('sba_7a', 100),
      option('line_of_credit', 100),
      option('mca', 15),
    ];
    const verdict = deriveVerdict(comparison(options, 'credit_card_stack'));

    expect(verdict?.kind).toBe('tied');
    if (verdict?.kind !== 'tied') throw new Error('expected a tie');
    expect(verdict.chosen.productType).toBe('credit_card_stack');
    expect(verdict.tiedWith.map((o) => o.productType).sort()).toEqual(['line_of_credit', 'sba_7a']);
  });

  // Real output, edge profile: FICO 599, 0.5 years, $90k revenue.
  // _pickBestProduct forces MCA under 600 FICO and under a year, so the
  // pick is not the top score — while the rationale string still claims
  // it is. This is the case the view must not repeat.
  it('reports an override when the chosen option is outscored', () => {
    const options = [
      option('credit_card_stack', 60),
      option('sba_7a', 20),
      option('line_of_credit', 45),
      option('mca', 30),
    ];
    const verdict = deriveVerdict(comparison(options, 'mca'));

    expect(verdict?.kind).toBe('overridden');
    if (verdict?.kind !== 'overridden') throw new Error('expected an override');
    expect(verdict.chosen.suitabilityScore).toBe(30);
    expect(verdict.outscoredBy.map((o) => o.productType).sort()).toEqual([
      'credit_card_stack',
      'line_of_credit',
    ]);
  });

  // Real output, distressed profile: FICO 560, 0.5 years, $120k revenue.
  // The override fires here too, but MCA genuinely tops the scores, so
  // there is no contradiction to report.
  it('reports a clear verdict when the override and the scores agree', () => {
    const options = [
      option('credit_card_stack', 60),
      option('sba_7a', 20),
      option('line_of_credit', 45),
      option('mca', 65),
    ];
    const verdict = deriveVerdict(comparison(options, 'mca'));

    expect(verdict?.kind).toBe('clear');
    expect(verdict?.chosen.productType).toBe('mca');
  });

  it('returns null when the recommendation names an option that is absent', () => {
    const options = [option('credit_card_stack', 60)];
    expect(deriveVerdict(comparison(options, 'sba_7a'))).toBeNull();
  });
});

describe('rankedOptions', () => {
  // The demotion must follow the scores, not the product type — the same
  // product sits last on one profile and first on another.
  it('sinks a merchant cash advance on a strong profile', () => {
    const options = [option('credit_card_stack', 100), option('mca', 15), option('sba_7a', 100)];
    expect(rankedOptions(options)[2]?.productType).toBe('mca');
  });

  it('raises the same product to the top on a distressed profile', () => {
    const options = [option('credit_card_stack', 60), option('mca', 65), option('sba_7a', 20)];
    expect(rankedOptions(options)[0]?.productType).toBe('mca');
  });

  it('does not mutate the array it was given', () => {
    const options = [option('credit_card_stack', 10), option('mca', 90)];
    rankedOptions(options);
    expect(options[0]?.productType).toBe('credit_card_stack');
  });
});

describe('aprShare', () => {
  it('scales against the largest rate in the set', () => {
    const mca = option('mca', 15, 0.98);
    const sba = option('sba_7a', 100, 0.115);
    const options = [mca, sba];

    expect(aprShare(mca, options)).toBe(1);
    const share = aprShare(sba, options);
    expect(share).not.toBeNull();
    expect(share).toBeCloseTo(0.115 / 0.98, 5);
  });

  it('returns null rather than zero when there is nothing to scale against', () => {
    const flat = [option('mca', 15, 0), option('sba_7a', 100, 0)];
    // Zero would draw an empty bar, which reads as a rate of nothing.
    expect(aprShare(flat[0]!, flat)).toBeNull();
  });
});

describe('formatters', () => {
  it('render a marker rather than a number when a value is missing', () => {
    for (const f of [money, percent, ratio]) {
      expect(f(null)).toBe(NOT_REPORTED);
      expect(f(undefined)).toBe(NOT_REPORTED);
      expect(f(Number.NaN)).toBe(NOT_REPORTED);
      expect(f(Number.POSITIVE_INFINITY)).toBe(NOT_REPORTED);
    }
  });

  it('render a real zero as zero', () => {
    // A missing value and a value of zero must not look the same.
    expect(money(0)).toBe('$0');
    expect(percent(0)).toBe('0%');
    expect(money(0)).not.toBe(NOT_REPORTED);
  });

  it('formats the figures this view actually shows', () => {
    expect(percent(0.98)).toBe('98%');
    expect(percent(0.115, 2)).toBe('11.50%');
    expect(money(120_000)).toBe('$120,000');
    expect(ratio(7.1)).toBe('7.10×');
  });
});
