// ============================================================
// The recommendation says why, not just which
//
// Two defects, filed as issue #66.
//
// 1. The rationale was one template asserting the chosen product "offers the
//    highest suitability score (N/100)". `_pickBestProduct` overrides the
//    ranking for a business under 600 FICO and under a year old, and on that
//    path the sentence was false about data in the same object — a real run
//    emitted "Merchant Cash Advance offers the highest suitability score
//    (30/100)" while card stacking sat at 60. MCA carries a ~98% effective
//    APR, so that is where a fabricated justification does the most harm.
//
// 2. suitabilityScore saturates at 100 and ties broke on the order the options
//    were built, so three products at the cap reported a single winner with
//    nothing to say a tie had happened. A scoring function that cannot
//    separate its top options is not choosing between them, it is ordering
//    them — and the caller could not tell which had occurred.
//
// The profiles below are the ones that surfaced both. Their scores are real
// output from runScenario, not fixtures.
// ============================================================

import { describe, it, expect } from 'vitest';
import { fundingSimulator, type SimulatorProfile } from '../../../src/backend/services/funding-simulator.service';

const STRONG: SimulatorProfile = {
  ficoScore: 720, utilizationRatio: 0.25, derogatoryCount: 0, inquiries12m: 2,
  creditAgeMonths: 96, annualRevenue: 850_000, yearsInOperation: 6,
  existingDebt: 120_000, targetCreditLimit: 150_000,
};

/** FICO under 600 and under a year — the override fires AND agrees with the scores. */
const DISTRESSED: SimulatorProfile = {
  ficoScore: 560, utilizationRatio: 0.85, derogatoryCount: 3, inquiries12m: 9,
  creditAgeMonths: 14, annualRevenue: 120_000, yearsInOperation: 0.5,
  existingDebt: 60_000, targetCreditLimit: 50_000,
};

/** The override fires and CONTRADICTS the scores. This is the case #66 is about. */
const EDGE: SimulatorProfile = {
  ficoScore: 599, utilizationRatio: 0.6, derogatoryCount: 1, inquiries12m: 4,
  creditAgeMonths: 30, annualRevenue: 90_000, yearsInOperation: 0.5,
  existingDebt: 40_000, targetCreditLimit: 40_000,
};

function recommend(profile: SimulatorProfile) {
  return fundingSimulator.runScenario(profile, undefined, 'test').alternativeComparison;
}

describe('a tie is reported as a tie', () => {
  it('names the products sharing the top score', () => {
    const { recommendation, options } = recommend(STRONG);

    const top = Math.max(...options.map((o) => o.suitabilityScore));
    const atTop = options.filter((o) => o.suitabilityScore === top);
    expect(atTop.length).toBeGreaterThan(1); // the precondition this test needs

    expect(recommendation.basis).toBe('tie');
    if (recommendation.basis !== 'tie') throw new Error('expected a tie');
    expect(recommendation.tiedWith.length).toBe(atTop.length - 1);
  });

  it('does not claim the highest score when the score is shared', () => {
    const { recommendation } = recommend(STRONG);
    // The exact phrase the old template produced.
    expect(recommendation.rationale).not.toMatch(/highest suitability score/i);
    expect(recommendation.rationale).toMatch(/does not separate them/i);
  });
});

describe('an override is reported as a rule, not a ranking', () => {
  it('names what outscored the pick', () => {
    const { recommendation, options } = recommend(EDGE);

    expect(recommendation.basis).toBe('override');
    if (recommendation.basis !== 'override') throw new Error('expected an override');

    const chosen = options.find((o) => o.productType === recommendation.primaryChoice);
    expect(chosen).toBeDefined();
    // The defect in one assertion: the pick is not the top scorer.
    for (const t of recommendation.outscoredBy) {
      const other = options.find((o) => o.productType === t);
      expect(other!.suitabilityScore).toBeGreaterThan(chosen!.suitabilityScore);
    }
    expect(recommendation.outscoredBy.length).toBeGreaterThan(0);
  });

  it('never claims the highest score on the override path', () => {
    const { recommendation } = recommend(EDGE);
    expect(recommendation.rationale).not.toMatch(/highest suitability score/i);
    expect(recommendation.rationale).toMatch(/by rule, not by score/i);
  });

  it('states the rule that fired', () => {
    const { recommendation } = recommend(EDGE);
    if (recommendation.basis !== 'override') throw new Error('expected an override');
    expect(recommendation.overrideReason).toMatch(/below 600/i);
  });
});

describe('a rule that agrees with the ranking is not an override', () => {
  // The override fires here too — FICO 560, half a year — but MCA genuinely
  // tops the scores. Reporting it as an override would overstate in the other
  // direction, which is the same fault as the original claim.
  it('reports ranking when the rule and the scores agree', () => {
    const { recommendation, options } = recommend(DISTRESSED);

    expect(recommendation.basis).toBe('ranking');
    const chosen = options.find((o) => o.productType === recommendation.primaryChoice)!;
    const top = Math.max(...options.map((o) => o.suitabilityScore));
    expect(chosen.suitabilityScore).toBe(top);
  });

  it('may claim the highest score, because here it is true', () => {
    const { recommendation } = recommend(DISTRESSED);
    expect(recommendation.rationale).toMatch(/highest suitability score/i);
  });
});

describe('every basis is reachable and the union is exhaustive', () => {
  it('produces all three across the three profiles', () => {
    const seen = [STRONG, DISTRESSED, EDGE].map((p) => recommend(p).recommendation.basis);
    expect([...seen].sort()).toEqual(['override', 'ranking', 'tie']);
  });
});
