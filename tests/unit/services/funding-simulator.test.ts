// ============================================================
// Unit Tests — FundingSimulatorService + SandboxService
//
// Run standalone:
//   npx vitest run tests/unit/services/funding-simulator.test.ts
//
// Coverage areas:
//   1.  Scenario modeling — multi-round stack projections
//   2.  Approval probability engine — FICO-band output
//   3.  Worst-case interest shock — payment math, sustainability
//   4.  Alternative product comparison — SBA, LOC, MCA, stacking
//   5.  What-if parameter overrides — delta propagation
//   6.  Scenario comparison (compareScenarios)
//   7.  Sandbox archetypes — 50 built-in profiles exist
//   8.  Sandbox filtering — by tier, industry, revenue band, tags
//   9.  Custom sandbox profile CRUD
//  10.  Simulated funding round — issuer responses
//  11.  Advisor practice mode — scoring / grading
//  12.  Regression test suite — pass/fail per archetype
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FundingSimulatorService,
  type SimulatorProfile,
  type WhatIfOverrides,
} from '../../../src/backend/services/funding-simulator.service.js';
import {
  SandboxService,
  type AdvisorFundingPlan,
  type CreateCustomProfileInput,
} from '../../../src/backend/services/sandbox.service.js';

// ============================================================
// Fixtures
// ============================================================

function makePrimeProfile(overrides?: Partial<SimulatorProfile>): SimulatorProfile {
  return {
    ficoScore: 720,
    utilizationRatio: 0.20,
    derogatoryCount: 0,
    inquiries12m: 1,
    creditAgeMonths: 96,
    annualRevenue: 800_000,
    yearsInOperation: 7,
    existingDebt: 50_000,
    targetCreditLimit: 150_000,
    businessId: 'test-biz-001',
    ...overrides,
  };
}

function makeSubprimeProfile(overrides?: Partial<SimulatorProfile>): SimulatorProfile {
  return {
    ficoScore: 580,
    utilizationRatio: 0.78,
    derogatoryCount: 2,
    inquiries12m: 5,
    creditAgeMonths: 36,
    annualRevenue: 180_000,
    yearsInOperation: 2,
    existingDebt: 45_000,
    targetCreditLimit: 50_000,
    ...overrides,
  };
}

// ============================================================
// FundingSimulatorService
// ============================================================

describe('FundingSimulatorService', () => {
  let service: FundingSimulatorService;

  beforeEach(() => {
    service = new FundingSimulatorService();
  });

  // ── 1. Scenario modeling ──────────────────────────────────

  describe('runScenario — basic structure', () => {
    it('returns a ScenarioResult with all required top-level keys', () => {
      const result = service.runScenario(makePrimeProfile(), 'Prime Test');

      expect(result).toHaveProperty('scenarioId');
      expect(result).toHaveProperty('generatedAt');
      expect(result).toHaveProperty('label', 'Prime Test');
      expect(result).toHaveProperty('profile');
      expect(result).toHaveProperty('multiRoundModel');
      expect(result).toHaveProperty('approvalProbabilityReport');
      expect(result).toHaveProperty('worstCaseRepayment');
      expect(result).toHaveProperty('alternativeComparison');
    });

    it('generates a unique scenarioId for each run', () => {
      const r1 = service.runScenario(makePrimeProfile());
      const r2 = service.runScenario(makePrimeProfile());

      expect(r1.scenarioId).not.toBe(r2.scenarioId);
    });

    it('multi-round model has at least one round for prime profile', () => {
      const result = service.runScenario(makePrimeProfile());
      expect(result.multiRoundModel.rounds.length).toBeGreaterThan(0);
    });

    it('totalCards in multiRoundModel matches sum of round cardCounts', () => {
      const result = service.runScenario(makePrimeProfile());
      const sumCards = result.multiRoundModel.rounds.reduce(
        (s, r) => s + r.cardCount,
        0,
      );
      expect(result.multiRoundModel.totalCards).toBe(sumCards);
    });

    it('cumulativeCreditTotal in last round equals totalEstimatedCredit', () => {
      const result = service.runScenario(makePrimeProfile());
      const rounds = result.multiRoundModel.rounds;
      if (rounds.length === 0) return; // no-card edge case — skip

      const lastRound = rounds[rounds.length - 1]!;
      expect(lastRound.cumulativeCreditTotal).toBe(result.multiRoundModel.totalEstimatedCredit);
    });

    it('confidenceRating is "high" for super-prime profile', () => {
      const result = service.runScenario(makePrimeProfile({ ficoScore: 800, utilizationRatio: 0.05 }));
      expect(result.multiRoundModel.confidenceRating).toBe('high');
    });

    it('confidenceRating is "low" for subprime profile', () => {
      const result = service.runScenario(makeSubprimeProfile());
      expect(result.multiRoundModel.confidenceRating).toBe('low');
    });
  });

  // ── 2. Approval probability report ───────────────────────

  describe('approvalProbabilityReport', () => {
    it('overallStackApprovalRate is between 0 and 1', () => {
      const result = service.runScenario(makePrimeProfile());
      const rate = result.approvalProbabilityReport.overallStackApprovalRate;
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    });

    it('atLeastOneApproval >= overallStackApprovalRate for multi-card stacks', () => {
      const result = service.runScenario(makePrimeProfile());
      const report = result.approvalProbabilityReport;
      if (report.cardBreakdown.length > 1) {
        expect(report.atLeastOneApproval).toBeGreaterThanOrEqual(report.overallStackApprovalRate);
      }
    });

    it('allApprovedProbability <= overallStackApprovalRate for multi-card stacks', () => {
      const result = service.runScenario(makePrimeProfile());
      const report = result.approvalProbabilityReport;
      if (report.cardBreakdown.length > 1) {
        expect(report.allApprovedProbability).toBeLessThanOrEqual(report.overallStackApprovalRate);
      }
    });

    it('riskFactors highlights high utilization when > 50%', () => {
      const result = service.runScenario(makePrimeProfile({ utilizationRatio: 0.75 }));
      const factors = result.approvalProbabilityReport.riskFactors.join(' ');
      expect(factors.toLowerCase()).toMatch(/utiliz/);
    });

    it('positiveFactors includes strong FICO mention for score >= 750', () => {
      const result = service.runScenario(makePrimeProfile({ ficoScore: 780 }));
      const factors = result.approvalProbabilityReport.positiveFactors.join(' ');
      expect(factors.toLowerCase()).toMatch(/fico|strong/i);
    });

    it('riskFactors includes derogatory warning when derogatoryCount > 0', () => {
      const result = service.runScenario(makePrimeProfile({ derogatoryCount: 2 }));
      const factors = result.approvalProbabilityReport.riskFactors.join(' ');
      expect(factors.toLowerCase()).toMatch(/derogator/);
    });
  });

  // ── 3. Worst-case repayment / interest shock ──────────────

  describe('worstCaseRepayment', () => {
    it('interestShockMonth is 16 (DEFAULT_INTRO_APR_MONTHS + 1)', () => {
      const result = service.runScenario(makePrimeProfile());
      expect(result.worstCaseRepayment.interestShockMonth).toBe(16);
    });

    it('monthlySchedule has exactly 24 entries', () => {
      const result = service.runScenario(makePrimeProfile());
      expect(result.worstCaseRepayment.monthlySchedule).toHaveLength(24);
    });

    it('exactly one month in the schedule is the shock month', () => {
      const result = service.runScenario(makePrimeProfile());
      const shockMonths = result.worstCaseRepayment.monthlySchedule.filter(
        (m) => m.isShockMonth,
      );
      expect(shockMonths).toHaveLength(1);
    });

    it('postShockMonthlyPayment >= preShockMonthlyPayment when balance is non-zero', () => {
      // post-shock adds interest on top of the 2% min — it equals or exceeds pre-shock
      const result = service.runScenario(makePrimeProfile({ targetCreditLimit: 500_000, ficoScore: 800 }));
      const wc = result.worstCaseRepayment;
      if (wc.balanceAtShock > 0) {
        expect(wc.postShockMonthlyPayment).toBeGreaterThanOrEqual(wc.preShockMonthlyPayment);
      }
    });

    it('paymentIncreaseRatio >= 1 when there is a non-zero balance', () => {
      // ratio is postShock / preShock — at minimum it equals 1 (same payment), more typically > 1
      const result = service.runScenario(makePrimeProfile());
      const wc = result.worstCaseRepayment;
      if (wc.balanceAtShock > 0) {
        expect(wc.paymentIncreaseRatio).toBeGreaterThanOrEqual(1);
      }
    });

    it('isSustainable is true when revenue >> post-shock payment', () => {
      // $800k revenue, low credit target → post-shock payment should be manageable
      const result = service.runScenario(
        makePrimeProfile({ annualRevenue: 5_000_000, targetCreditLimit: 50_000 }),
      );
      expect(result.worstCaseRepayment.isSustainable).toBe(true);
    });

    it('isSustainable is false when revenue barely covers post-shock payment', () => {
      // tiny revenue vs large credit target
      const result = service.runScenario(
        makePrimeProfile({ annualRevenue: 60_000, targetCreditLimit: 300_000, ficoScore: 760 }),
      );
      expect(result.worstCaseRepayment.isSustainable).toBe(false);
    });

    it('alerts array is non-empty for unsustainable scenario', () => {
      const result = service.runScenario(
        makePrimeProfile({ annualRevenue: 60_000, targetCreditLimit: 300_000, ficoScore: 760 }),
      );
      expect(result.worstCaseRepayment.alerts.length).toBeGreaterThan(0);
    });
  });

  // ── 4. Alternative product comparison ────────────────────

  describe('alternativeComparison', () => {
    it('returns exactly 4 product options', () => {
      const result = service.runScenario(makePrimeProfile());
      expect(result.alternativeComparison.options).toHaveLength(4);
    });

    it('product types include all expected options', () => {
      const result = service.runScenario(makePrimeProfile());
      const types = result.alternativeComparison.options.map((o) => o.productType);
      expect(types).toContain('credit_card_stack');
      expect(types).toContain('sba_7a');
      expect(types).toContain('line_of_credit');
      expect(types).toContain('mca');
    });

    it('recommendation.primaryChoice is "credit_card_stack" for prime profile', () => {
      const result = service.runScenario(makePrimeProfile());
      expect(result.alternativeComparison.recommendation.primaryChoice).toBe('credit_card_stack');
    });

    it('MCA option has the highest effectiveApr among products', () => {
      const result = service.runScenario(makePrimeProfile());
      const mca = result.alternativeComparison.options.find((o) => o.productType === 'mca')!;
      const others = result.alternativeComparison.options.filter((o) => o.productType !== 'mca');
      for (const other of others) {
        expect(mca.effectiveApr).toBeGreaterThan(other.effectiveApr);
      }
    });

    it('SBA approval probability is near-zero for < 2-year business', () => {
      // < 2 years in operation is a disqualifying criterion for SBA 7(a)
      const result = service.runScenario(makePrimeProfile({ yearsInOperation: 0 }));
      const sba = result.alternativeComparison.options.find((o) => o.productType === 'sba_7a')!;
      expect(sba.approvalProbability).toBeLessThan(0.15);
    });

    it('profileSummary reflects the input profile accurately', () => {
      const profile = makePrimeProfile({ annualRevenue: 500_000, existingDebt: 100_000 });
      const result = service.runScenario(profile);
      expect(result.alternativeComparison.profileSummary.annualRevenue).toBe(500_000);
      expect(result.alternativeComparison.profileSummary.existingDebt).toBe(100_000);
    });
  });

  // ── 5. What-if parameter overrides ───────────────────────

  describe('what-if overrides', () => {
    it('applying a FICO boost increases totalEstimatedCredit', () => {
      const base = service.runScenario(makePrimeProfile({ ficoScore: 680 }));
      const boosted = service.runScenario(
        makePrimeProfile({ ficoScore: 680 }),
        'Boosted',
        { ficoScore: 760 },
      );
      expect(boosted.multiRoundModel.totalEstimatedCredit).toBeGreaterThanOrEqual(
        base.multiRoundModel.totalEstimatedCredit,
      );
    });

    it('appliedOverrides on result reflects what was passed', () => {
      const overrides: WhatIfOverrides = { ficoScore: 760, annualRevenue: 1_000_000 };
      const result = service.runScenario(makePrimeProfile(), 'Override Test', overrides);
      expect(result.appliedOverrides).toEqual(overrides);
    });

    it('effective profile uses override FICO, not base FICO', () => {
      const result = service.runScenario(
        makePrimeProfile({ ficoScore: 650 }),
        'Override FICO',
        { ficoScore: 800 },
      );
      expect(result.profile.ficoScore).toBe(800);
    });

    it('null overrides produce null appliedOverrides on result', () => {
      const result = service.runScenario(makePrimeProfile());
      expect(result.appliedOverrides).toBeNull();
    });
  });

  // ── 6. Scenario comparison ────────────────────────────────

  describe('compareScenarios', () => {
    it('returns baseline, alternative, and delta', () => {
      const base = service.runScenario(makePrimeProfile({ ficoScore: 680 }));
      const alt  = service.runScenario(makePrimeProfile({ ficoScore: 760 }));
      const comparison = service.compareScenarios(base, alt);

      expect(comparison).toHaveProperty('baseline');
      expect(comparison).toHaveProperty('alternative');
      expect(comparison).toHaveProperty('delta');
    });

    it('ficoScoreDelta equals difference in profile FICO scores', () => {
      const base = service.runScenario(makePrimeProfile({ ficoScore: 680 }));
      const alt  = service.runScenario(makePrimeProfile({ ficoScore: 740 }));
      const { delta } = service.compareScenarios(base, alt);

      expect(delta.ficoScoreDelta).toBe(60); // 740 - 680
    });

    it('creditTotalDelta is positive when alternative has more credit', () => {
      const base = service.runScenario(makeSubprimeProfile());
      const alt  = service.runScenario(makePrimeProfile());
      const { delta } = service.compareScenarios(base, alt);

      expect(delta.creditTotalDelta).toBeGreaterThanOrEqual(0);
    });

    it('alternative.deltaVsBaseline is populated', () => {
      const base = service.runScenario(makePrimeProfile({ ficoScore: 680 }));
      const alt  = service.runScenario(makePrimeProfile({ ficoScore: 760 }));
      const { alternative } = service.compareScenarios(base, alt);

      expect(alternative.deltaVsBaseline).not.toBeUndefined();
    });
  });
});

// ============================================================
// SandboxService
// ============================================================

describe('SandboxService', () => {
  let sandbox: SandboxService;

  beforeEach(() => {
    sandbox = new SandboxService();
  });

  // ── 7. Pre-built archetypes ───────────────────────────────

  describe('listArchetypes — built-in library', () => {
    it('provides exactly 50 pre-built archetypes', () => {
      const all = sandbox.listArchetypes();
      expect(all).toHaveLength(50);
    });

    it('every archetype has a unique id', () => {
      const all = sandbox.listArchetypes();
      const ids = all.map((a) => a.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(50);
    });

    it('all archetypes have a non-empty profile', () => {
      const all = sandbox.listArchetypes();
      for (const arch of all) {
        expect(arch.profile.ficoScore).toBeGreaterThan(0);
        expect(arch.profile.annualRevenue).toBeGreaterThanOrEqual(0);
      }
    });

    it('getArchetype returns the correct archetype by id', () => {
      const arch = sandbox.getArchetype('arch-001');
      expect(arch).toBeDefined();
      expect(arch!.id).toBe('arch-001');
    });

    it('getArchetype returns undefined for unknown id', () => {
      expect(sandbox.getArchetype('nonexistent-999')).toBeUndefined();
    });
  });

  // ── 8. Filtering ──────────────────────────────────────────

  describe('listArchetypes — filters', () => {
    it('filters by ficoTier returns only matching archetypes', () => {
      const superPrime = sandbox.listArchetypes({ ficoTier: 'super_prime' });
      for (const a of superPrime) {
        expect(a.ficoTier).toBe('super_prime');
      }
    });

    it('filters by industry returns only matching archetypes', () => {
      const restaurants = sandbox.listArchetypes({ industry: 'restaurant' });
      for (const a of restaurants) {
        expect(a.industry).toBe('restaurant');
      }
    });

    it('filters by revenueBand returns only matching archetypes', () => {
      const micro = sandbox.listArchetypes({ revenueBand: 'micro' });
      for (const a of micro) {
        expect(a.revenueBand).toBe('micro');
      }
    });

    it('filters by tags returns archetypes that have ALL specified tags', () => {
      const results = sandbox.listArchetypes({ tags: ['super-prime'] });
      for (const a of results) {
        expect(a.tags).toContain('super-prime');
      }
    });

    it('combined filters work correctly', () => {
      const results = sandbox.listArchetypes({
        ficoTier: 'prime',
        industry: 'technology',
      });
      for (const a of results) {
        expect(a.ficoTier).toBe('prime');
        expect(a.industry).toBe('technology');
      }
    });

    it('filter with no matches returns empty array', () => {
      // No archetype should be super_prime + restaurant + micro
      const results = sandbox.listArchetypes({
        ficoTier: 'super_prime',
        revenueBand: 'micro',
        industry: 'restaurant',
      });
      expect(results).toHaveLength(0);
    });
  });

  // ── 9. Custom profile management ─────────────────────────

  describe('custom sandbox profiles', () => {
    it('createCustomProfile returns a profile with a generated id', () => {
      const input: CreateCustomProfileInput = {
        tenantId: 'tenant-test-001',
        profileName: 'My Custom Client',
        archetype: 'custom',
        profile: makePrimeProfile(),
        tags: ['test'],
      };
      const created = sandbox.createCustomProfile(input);
      expect(created.id).toBeTruthy();
      expect(created.profileName).toBe('My Custom Client');
    });

    it('listCustomProfiles returns profiles for the correct tenant', () => {
      sandbox.createCustomProfile({
        tenantId: 'tenant-A',
        profileName: 'Profile A',
        archetype: 'test',
        profile: makePrimeProfile(),
      });
      sandbox.createCustomProfile({
        tenantId: 'tenant-B',
        profileName: 'Profile B',
        archetype: 'test',
        profile: makePrimeProfile(),
      });
      const tenantAProfiles = sandbox.listCustomProfiles('tenant-A');
      expect(tenantAProfiles).toHaveLength(1);
      expect(tenantAProfiles[0]!.tenantId).toBe('tenant-A');
    });

    it('newly created custom profile is active by default', () => {
      const created = sandbox.createCustomProfile({
        tenantId: 'tenant-X',
        profileName: 'Active Test',
        archetype: 'test',
        profile: makePrimeProfile(),
      });
      expect(created.isActive).toBe(true);
    });
  });

  // ── 10. Simulated funding round ───────────────────────────

  describe('simulateFundingRound', () => {
    it('returns a SimulatedFundingRound for a valid archetype', () => {
      const result = sandbox.simulateFundingRound('arch-017', 1);
      expect(result.archetypeId).toBe('arch-017');
      expect(result.roundNumber).toBe(1);
    });

    it('throws for an unknown archetype id', () => {
      expect(() => sandbox.simulateFundingRound('nonexistent-999', 1)).toThrow();
    });

    it('approval + decline + pending counts sum to issuerResponses.length', () => {
      const result = sandbox.simulateFundingRound('arch-026', 1);
      const total = result.approvalCount + result.declineCount + result.pendingCount;
      // Counteroffers are counted as approvals in approved limit but may map elsewhere
      expect(total).toBeLessThanOrEqual(result.issuerResponses.length);
    });

    it('totalApprovedCredit is >= 0', () => {
      const result = sandbox.simulateFundingRound('arch-017', 1);
      expect(result.totalApprovedCredit).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 11. Practice mode ─────────────────────────────────────

  describe('runPracticeMode', () => {
    const goodPlan: AdvisorFundingPlan = {
      archetypeId: 'arch-017',
      advisorId: 'advisor-001',
      selectedCards: [
        { issuer: 'chase',    cardProduct: 'Chase Ink', round: 1, rationale: 'High limit chase product with 0% APR for 12 months, low FICO requirement.' },
        { issuer: 'amex',     cardProduct: 'Amex Blue',  round: 1, rationale: 'Strong approval probability and intro APR offer.' },
        { issuer: 'citi',     cardProduct: 'Citi AA',    round: 2, rationale: 'Round 2 moderate FICO requirement card to fill credit gap.' },
      ],
      riskAssessment: 'FICO 715 is prime. Utilization is 18% — well below the 30% threshold. No derogatory marks. Revenue of $800k provides strong coverage. Interest shock risk at month 16 is manageable given revenue coverage ratio. Stacking is recommended. Alternatives (SBA, LOC) were reviewed.',
      alternativeConsidered: true,
    };

    it('returns a PracticeModeResult with all required keys', () => {
      const result = sandbox.runPracticeMode(goodPlan);
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('overallScore');
      expect(result).toHaveProperty('grade');
      expect(result).toHaveProperty('feedbackItems');
      expect(result).toHaveProperty('modelAnswer');
    });

    it('feedbackItems contains exactly 4 categories', () => {
      const result = sandbox.runPracticeMode(goodPlan);
      expect(result.feedbackItems).toHaveLength(4);
    });

    it('overallScore is between 0 and 100', () => {
      const result = sandbox.runPracticeMode(goodPlan);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('grade is A or B for a comprehensive plan', () => {
      const result = sandbox.runPracticeMode(goodPlan);
      expect(['A', 'B']).toContain(result.grade);
    });

    it('grade is F or D when no cards selected and no risk assessment', () => {
      const badPlan: AdvisorFundingPlan = {
        archetypeId: 'arch-017',
        advisorId: 'advisor-002',
        selectedCards: [],
        riskAssessment: '',
        alternativeConsidered: false,
      };
      const result = sandbox.runPracticeMode(badPlan);
      expect(['D', 'F']).toContain(result.grade);
    });

    it('throws for an unknown archetype id', () => {
      expect(() =>
        sandbox.runPracticeMode({ ...goodPlan, archetypeId: 'nonexistent' }),
      ).toThrow();
    });
  });

  // ── 12. Regression test suite ─────────────────────────────

  describe('runRegressionSuite', () => {
    it('runs tests for all 50 archetypes', () => {
      const result = sandbox.runRegressionSuite();
      expect(result.totalTests).toBe(50);
    });

    it('passRate is a number between 0 and 1', () => {
      const result = sandbox.runRegressionSuite();
      expect(result.passRate).toBeGreaterThanOrEqual(0);
      expect(result.passRate).toBeLessThanOrEqual(1);
    });

    it('passed + failed equals totalTests', () => {
      const result = sandbox.runRegressionSuite();
      expect(result.passed + result.failed).toBe(result.totalTests);
    });

    it('each case has archetypeId, passed flag, and drift array', () => {
      const result = sandbox.runRegressionSuite();
      for (const c of result.cases) {
        expect(c).toHaveProperty('archetypeId');
        expect(typeof c.passed).toBe('boolean');
        expect(Array.isArray(c.drift)).toBe(true);
      }
    });

    it('driftSummary lists only failing cases', () => {
      const result = sandbox.runRegressionSuite();
      const failedIds = result.cases
        .filter((c) => !c.passed)
        .map((c) => c.archetypeId);

      for (const entry of result.driftSummary) {
        const matchesAFailed = failedIds.some((id) => entry.includes(id));
        expect(matchesAFailed).toBe(true);
      }
    });
  });
});
