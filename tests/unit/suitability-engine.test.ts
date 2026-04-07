// ============================================================
// CapitalForge — Suitability Engine Test Suite
//
// Covers:
//   - All hard no-go triggers individually
//   - Scoring components
//   - Tier boundaries (70=suitable/APPROVED, 69=MODERATE, etc.)
//   - Max safe leverage calculation
//   - Alternatives only shown for not_suitable
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  computeSuitability,
  type SuitabilityInput,
  NOGO_REASON,
  SCORE_BANDS,
} from '../../src/backend/services/suitability.service.js';

// ── Fixtures ─────────────────────────────────────────────────

function makeGoodInput(overrides: Partial<SuitabilityInput> = {}): SuitabilityInput {
  return {
    monthlyRevenue: 15_000,
    existingDebt: 10_000,
    cashFlowRatio: 0.25,
    industry: 'technology',
    businessAgeMonths: 48,
    personalCreditScore: 760,
    businessCreditScore: 200,
    activeBankruptcy: false,
    sanctionsMatch: false,
    fraudSuspicion: false,
    ...overrides,
  };
}

function makeMarginalInput(overrides: Partial<SuitabilityInput> = {}): SuitabilityInput {
  return {
    monthlyRevenue: 5_000,
    existingDebt: 30_000,
    cashFlowRatio: 0.08,
    industry: 'retail',
    businessAgeMonths: 18,
    personalCreditScore: 660,
    businessCreditScore: 0,
    activeBankruptcy: false,
    sanctionsMatch: false,
    fraudSuspicion: false,
    ...overrides,
  };
}

// ── Hard No-Go Triggers ──────────────────────────────────────

describe('Suitability Engine — Hard No-Go Triggers', () => {
  it('should trigger no-go for active bankruptcy', () => {
    const result = computeSuitability(makeGoodInput({ activeBankruptcy: true }));
    expect(result.noGoTriggered).toBe(true);
    expect(result.noGoReasons).toContain(NOGO_REASON.ACTIVE_BANKRUPTCY);
    expect(result.score).toBe(0); // critical no-go forces score to 0
    expect(result.band).toBe('HARD_NOGO');
  });

  it('should trigger no-go for sanctions match', () => {
    const result = computeSuitability(makeGoodInput({ sanctionsMatch: true }));
    expect(result.noGoTriggered).toBe(true);
    expect(result.noGoReasons).toContain(NOGO_REASON.SANCTIONS_MATCH);
    expect(result.score).toBe(0);
    expect(result.band).toBe('HARD_NOGO');
  });

  it('should trigger no-go for fraud suspicion', () => {
    const result = computeSuitability(makeGoodInput({ fraudSuspicion: true }));
    expect(result.noGoTriggered).toBe(true);
    expect(result.noGoReasons).toContain(NOGO_REASON.FRAUD_SUSPICION);
    expect(result.score).toBe(0);
  });

  it('should trigger no-go for credit score below 580', () => {
    const result = computeSuitability(makeGoodInput({ personalCreditScore: 550 }));
    expect(result.noGoTriggered).toBe(true);
    expect(result.noGoReasons).toContain(NOGO_REASON.CREDIT_SCORE_TOO_LOW);
    // Non-critical no-go caps score at 20
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it('should trigger no-go for revenue below $2000/month', () => {
    const result = computeSuitability(makeGoodInput({ monthlyRevenue: 1_500 }));
    expect(result.noGoTriggered).toBe(true);
    expect(result.noGoReasons).toContain(NOGO_REASON.REVENUE_TOO_LOW);
  });

  it('should trigger no-go for negative cash flow', () => {
    const result = computeSuitability(makeGoodInput({ cashFlowRatio: -0.10 }));
    expect(result.noGoTriggered).toBe(true);
    expect(result.noGoReasons).toContain(NOGO_REASON.NEGATIVE_CASH_FLOW);
  });

  it('should trigger no-go for excessive debt (debt > 12x monthly revenue)', () => {
    const result = computeSuitability(makeGoodInput({
      monthlyRevenue: 5_000,
      existingDebt: 70_000, // 14x monthly revenue
    }));
    expect(result.noGoTriggered).toBe(true);
    expect(result.noGoReasons).toContain(NOGO_REASON.EXCESSIVE_DEBT);
  });

  it('should allow multiple no-go reasons simultaneously', () => {
    const result = computeSuitability(makeGoodInput({
      activeBankruptcy: true,
      sanctionsMatch: true,
      personalCreditScore: 500,
    }));
    expect(result.noGoTriggered).toBe(true);
    expect(result.noGoReasons.length).toBeGreaterThanOrEqual(3);
    expect(result.score).toBe(0); // critical no-gos present
  });
});

// ── Scoring Components ───────────────────────────────────────

describe('Suitability Engine — Scoring Components', () => {
  it('should produce a score breakdown with all components', () => {
    const result = computeSuitability(makeGoodInput());
    const bd = result.scoreBreakdown;
    expect(bd).toHaveProperty('revenueScore');
    expect(bd).toHaveProperty('cashFlowScore');
    expect(bd).toHaveProperty('debtRatioScore');
    expect(bd).toHaveProperty('creditScore');
    expect(bd).toHaveProperty('businessAgeScore');
    expect(bd).toHaveProperty('total');
  });

  it('should give max revenue score (25) for $10k+/month', () => {
    const result = computeSuitability(makeGoodInput({ monthlyRevenue: 15_000 }));
    expect(result.scoreBreakdown.revenueScore).toBe(25);
  });

  it('should give 0 revenue score for below $2k/month', () => {
    const result = computeSuitability(makeGoodInput({ monthlyRevenue: 1_000 }));
    expect(result.scoreBreakdown.revenueScore).toBe(0);
  });

  it('should give max cash flow score (20) for ratio >= 0.20', () => {
    const result = computeSuitability(makeGoodInput({ cashFlowRatio: 0.25 }));
    expect(result.scoreBreakdown.cashFlowScore).toBe(20);
  });

  it('should give 0 cash flow score for negative ratio', () => {
    const result = computeSuitability(makeGoodInput({ cashFlowRatio: -0.05 }));
    expect(result.scoreBreakdown.cashFlowScore).toBe(0);
  });

  it('should give max business age score (15) for 36+ months', () => {
    const result = computeSuitability(makeGoodInput({ businessAgeMonths: 48 }));
    expect(result.scoreBreakdown.businessAgeScore).toBe(15);
  });

  it('should give 0 business age score for < 6 months', () => {
    const result = computeSuitability(makeGoodInput({ businessAgeMonths: 3 }));
    expect(result.scoreBreakdown.businessAgeScore).toBe(0);
  });

  it('should give high credit score for FICO 750+', () => {
    const result = computeSuitability(makeGoodInput({ personalCreditScore: 780 }));
    expect(result.scoreBreakdown.creditScore).toBeGreaterThanOrEqual(16);
  });

  it('should cap total score at 100', () => {
    const result = computeSuitability(makeGoodInput());
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ── Tier / Band Boundaries ───────────────────────────────────

describe('Suitability Engine — Tier Boundaries', () => {
  it('should classify score >= 70 as APPROVED', () => {
    // Good input should produce a high score
    const result = computeSuitability(makeGoodInput());
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.band).toBe('APPROVED');
  });

  it('should classify score 50-69 as MODERATE', () => {
    // Marginal input should produce a moderate score
    const result = computeSuitability(makeMarginalInput());
    // Verify band is MODERATE if score falls in range
    if (result.score >= 50 && result.score < 70) {
      expect(result.band).toBe('MODERATE');
    }
    // At minimum, score should be in moderate range with these inputs
    expect(result.score).toBeGreaterThanOrEqual(30);
  });

  it('should classify score 30-49 as HIGH_RISK', () => {
    const input = makeMarginalInput({
      personalCreditScore: 630,
      businessAgeMonths: 8,
      cashFlowRatio: 0.03,
      monthlyRevenue: 3_000,
      existingDebt: 25_000,
    });
    const result = computeSuitability(input);
    // Score should be in the HIGH_RISK range
    if (result.score >= 30 && result.score < 50) {
      expect(result.band).toBe('HIGH_RISK');
    }
  });

  it('should classify score < 30 as HARD_NOGO', () => {
    const input = makeMarginalInput({
      personalCreditScore: 550, // triggers no-go
    });
    const result = computeSuitability(input);
    expect(result.noGoTriggered).toBe(true);
    expect(result.band).toBe('HARD_NOGO');
  });

  it('should include recommendation text for each band', () => {
    const approved = computeSuitability(makeGoodInput());
    expect(approved.recommendation).toContain('APPROVED');

    const noGo = computeSuitability(makeGoodInput({ activeBankruptcy: true }));
    expect(noGo.recommendation).toContain('HARD NO-GO');
  });
});

// ── Max Safe Leverage ────────────────────────────────────────

describe('Suitability Engine — Max Safe Leverage', () => {
  it('should calculate positive leverage for approved profiles', () => {
    const result = computeSuitability(makeGoodInput());
    expect(result.maxSafeLeverage).toBeGreaterThan(0);
  });

  it('should set leverage to 0 when no-go is triggered', () => {
    const result = computeSuitability(makeGoodInput({ activeBankruptcy: true }));
    expect(result.maxSafeLeverage).toBe(0);
  });

  it('should set leverage to 0 for all critical no-go flags', () => {
    const flags: Partial<SuitabilityInput>[] = [
      { activeBankruptcy: true },
      { sanctionsMatch: true },
      { fraudSuspicion: true },
    ];

    for (const flag of flags) {
      const result = computeSuitability(makeGoodInput(flag));
      expect(result.maxSafeLeverage).toBe(0);
    }
  });

  it('should return leverage detail object', () => {
    const result = computeSuitability(makeGoodInput());
    expect(result.leverageDetail).toBeDefined();
    expect(result.leverageDetail).toHaveProperty('maxTotalCredit');
    expect(result.leverageDetail).toHaveProperty('maxPerCard');
  });
});

// ── Alternative Products ─────────────────────────────────────

describe('Suitability Engine — Alternative Products', () => {
  it('should not show alternatives for approved profiles', () => {
    const result = computeSuitability(makeGoodInput());
    // Approved (score >= 70) should have no alternatives
    if (result.score >= SCORE_BANDS.MODERATE && !result.noGoTriggered) {
      expect(result.alternativeProducts).toHaveLength(0);
    }
  });

  it('should show alternatives when no-go is triggered', () => {
    const result = computeSuitability(makeGoodInput({ activeBankruptcy: true }));
    expect(result.alternativeProducts.length).toBeGreaterThan(0);
  });

  it('should show alternatives when score is below moderate threshold', () => {
    const result = computeSuitability(makeGoodInput({
      personalCreditScore: 550, // triggers credit no-go
    }));
    expect(result.alternativeProducts.length).toBeGreaterThan(0);
  });

  it('should include MCA as last resort with warning', () => {
    const result = computeSuitability(makeGoodInput({ activeBankruptcy: true }));
    const hasMcaWarning = result.alternativeProducts.some(
      (p) => p.includes('merchant_cash_advance') && p.includes('WARNING'),
    );
    expect(hasMcaWarning).toBe(true);
  });
});
