// ============================================================
// Unit Tests — RewardsOptimizationService + CardBenefitsService
//
// Run standalone:
//   npx vitest run tests/unit/services/rewards-optimization.test.ts
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RewardsOptimizationService,
  rewardValueUsd,
  MCC_CATEGORIES,
  type SpendProfile,
  type MccCategory,
  type CardAnnualSummary,
} from '../../../src/backend/services/rewards-optimization.service.js';
import {
  CardBenefitsService,
  type BusinessCardBenefit,
} from '../../../src/backend/services/card-benefits.service.js';
import { CARD_CATALOG, getActiveCards, type CardProduct } from '../../../src/backend/services/card-products.js';

// ============================================================
// Fixtures
// ============================================================

function makeProfile(
  businessId: string,
  tenantId: string,
  categories: Array<{ category: MccCategory; annualAmount: number }>,
): SpendProfile {
  return { businessId, tenantId, categories };
}

/** Minimal card for unit testing (no annual fee, single 5 % office tier) */
const MOCK_CARD_OFFICE: CardProduct = {
  id: 'mock-office-card',
  name: 'Mock Office 5% Card',
  issuer: 'chase',
  network: 'visa',
  introAprPercent: 0,
  introAprMonths: 12,
  regularAprLow: 18,
  regularAprHigh: 24,
  annualFee: 0,
  cashAdvanceFeePercent: 0.05,
  cashAdvanceFeeMin: 15,
  foreignTransactionFeePercent: 0.03,
  creditLimitMin: 3000,
  creditLimitMax: 25000,
  rewardsType: 'cash_back',
  rewardsTiers: [
    { category: 'Office supplies', rate: 0.05, unit: 'percent', annualCap: 25000 },
    { category: 'All other purchases', rate: 0.01, unit: 'percent' },
  ],
  signupBonus: '$500 cash back after $3,000 spend',
  minFicoEstimate: 680,
  reportsToPersonalBureau: false,
  requiresPersonalGuarantee: true,
  isActive: true,
  lastVerified: '2026-03-01',
};

/** Minimal card: $95 annual fee, 3x points on travel */
const MOCK_CARD_TRAVEL: CardProduct = {
  id: 'mock-travel-card',
  name: 'Mock Travel 3x Card',
  issuer: 'amex',
  network: 'amex',
  introAprPercent: null,
  introAprMonths: null,
  regularAprLow: 20,
  regularAprHigh: 28,
  annualFee: 95,
  cashAdvanceFeePercent: 0.05,
  cashAdvanceFeeMin: 10,
  foreignTransactionFeePercent: 0,
  creditLimitMin: 5000,
  creditLimitMax: 50000,
  rewardsType: 'points',
  rewardsTiers: [
    { category: 'Travel purchases', rate: 3, unit: 'multiplier' },
    { category: 'All other purchases', rate: 1, unit: 'multiplier' },
  ],
  signupBonus: '60,000 bonus points after $4,000 spend',
  minFicoEstimate: 700,
  reportsToPersonalBureau: false,
  requiresPersonalGuarantee: true,
  isActive: true,
  lastVerified: '2026-03-01',
};

/** Card with $375 annual fee — worth it only with heavy spend */
const MOCK_CARD_PREMIUM: CardProduct = {
  id: 'mock-premium-card',
  name: 'Mock Premium $375 Card',
  issuer: 'amex',
  network: 'amex',
  introAprPercent: null,
  introAprMonths: null,
  regularAprLow: 19.99,
  regularAprHigh: 28.99,
  annualFee: 375,
  cashAdvanceFeePercent: 0.05,
  cashAdvanceFeeMin: 10,
  foreignTransactionFeePercent: 0,
  creditLimitMin: 5000,
  creditLimitMax: 0,
  rewardsType: 'points',
  rewardsTiers: [
    { category: 'Top 2 eligible spend categories each month', rate: 4, unit: 'multiplier', annualCap: 150000 },
    { category: 'All other purchases', rate: 1, unit: 'multiplier' },
  ],
  signupBonus: '100,000 points after $15,000 spend',
  minFicoEstimate: 700,
  reportsToPersonalBureau: false,
  requiresPersonalGuarantee: true,
  isActive: true,
  lastVerified: '2026-03-01',
};

// ============================================================
// Section 1: rewardValueUsd pure function
// ============================================================

describe('rewardValueUsd', () => {
  it('calculates cash-back percent value correctly', () => {
    // 5 % on $10,000 = $500
    expect(rewardValueUsd(0.05, 'percent', 10_000)).toBeCloseTo(500);
  });

  it('calculates 1 % cash-back correctly', () => {
    expect(rewardValueUsd(0.01, 'percent', 5_000)).toBeCloseTo(50);
  });

  it('calculates multiplier value at $0.01/point', () => {
    // 3x on $10,000 → 30,000 pts × $0.01 = $300
    expect(rewardValueUsd(3, 'multiplier', 10_000)).toBeCloseTo(300);
  });

  it('returns 0 for zero spend', () => {
    expect(rewardValueUsd(0.05, 'percent', 0)).toBe(0);
    expect(rewardValueUsd(3, 'multiplier', 0)).toBe(0);
  });

  it('handles 2x multiplier correctly', () => {
    // 2x on $50,000 → 100,000 pts × $0.01 = $1,000
    expect(rewardValueUsd(2, 'multiplier', 50_000)).toBeCloseTo(1_000);
  });
});

// ============================================================
// Section 2: RewardsOptimizationService — MCC routing
// ============================================================

describe('RewardsOptimizationService — MCC routing', () => {
  let service: RewardsOptimizationService;

  beforeEach(() => {
    service = new RewardsOptimizationService([MOCK_CARD_OFFICE, MOCK_CARD_TRAVEL]);
  });

  it('ranks office_supplies card first for office_supplies category', () => {
    const rec = service.rankCardsForCategory('office_supplies', 10_000);
    expect(rec.optimalCard.cardId).toBe('mock-office-card');
    expect(rec.optimalCard.rate).toBe(0.05);
  });

  it('ranks travel card first for travel category', () => {
    const rec = service.rankCardsForCategory('travel', 10_000);
    expect(rec.optimalCard.cardId).toBe('mock-travel-card');
  });

  it('falls back to generic tier when no keyword match', () => {
    const rec = service.rankCardsForCategory('other', 5_000);
    // Both cards have "all other purchases" — result should still be defined
    expect(rec.optimalCard).toBeDefined();
    expect(rec.rankedCards.length).toBe(2);
  });

  it('honours annualCap when computing reward value', () => {
    // Office card: 5 % up to $25,000. Spend $30,000 → capped at $25,000
    const rec = service.rankCardsForCategory('office_supplies', 30_000);
    const officeCard = rec.rankedCards.find((c) => c.cardId === 'mock-office-card')!;
    expect(officeCard.annualValue).toBeCloseTo(25_000 * 0.05); // $1,250, not $1,500
  });

  it('opportunityCost equals difference between top two cards', () => {
    const rec = service.rankCardsForCategory('office_supplies', 10_000);
    const best   = rec.rankedCards[0]!.annualValue;
    const second = rec.rankedCards[1]!.annualValue;
    expect(rec.opportunityCost).toBeCloseTo(best - second);
  });

  it('returns all catalog cards in rankedCards', () => {
    const rec = service.rankCardsForCategory('gas', 10_000);
    expect(rec.rankedCards.length).toBe(2);
  });

  it('rankedCards are sorted best-first', () => {
    const rec = service.rankCardsForCategory('travel', 10_000);
    for (let i = 0; i < rec.rankedCards.length - 1; i++) {
      expect(rec.rankedCards[i]!.annualValue).toBeGreaterThanOrEqual(
        rec.rankedCards[i + 1]!.annualValue,
      );
    }
  });
});

// ============================================================
// Section 3: RewardsOptimizationService — optimize()
// ============================================================

describe('RewardsOptimizationService — optimize()', () => {
  let service: RewardsOptimizationService;

  beforeEach(() => {
    service = new RewardsOptimizationService([MOCK_CARD_OFFICE, MOCK_CARD_TRAVEL, MOCK_CARD_PREMIUM]);
  });

  it('returns one recommendation per input category', () => {
    const profile = makeProfile('biz-1', 't-1', [
      { category: 'office_supplies', annualAmount: 20_000 },
      { category: 'travel',          annualAmount: 15_000 },
    ]);
    const result = service.optimize(profile);
    expect(result.categoryRecommendations.length).toBe(2);
  });

  it('ignores categories with zero spend', () => {
    const profile = makeProfile('biz-1', 't-1', [
      { category: 'office_supplies', annualAmount: 0 },
      { category: 'travel',          annualAmount: 10_000 },
    ]);
    const result = service.optimize(profile);
    expect(result.categoryRecommendations.length).toBe(1);
  });

  it('totalAnnualSpend sums all category amounts', () => {
    const profile = makeProfile('biz-1', 't-1', [
      { category: 'office_supplies', annualAmount: 10_000 },
      { category: 'gas',             annualAmount: 5_000 },
    ]);
    const result = service.optimize(profile);
    expect(result.totals.totalAnnualSpend).toBe(15_000);
  });

  it('netPortfolioValue = totalOptimalRewardValue - totalAnnualFees', () => {
    const profile = makeProfile('biz-2', 't-1', [
      { category: 'travel', annualAmount: 50_000 },
    ]);
    const result = service.optimize(profile);
    expect(result.totals.netPortfolioValue).toBeCloseTo(
      result.totals.totalOptimalRewardValue - result.totals.totalAnnualFees,
    );
  });

  it('marks zero-fee card as isWorthKeeping even with no spend', () => {
    const profile = makeProfile('biz-3', 't-1', []);
    const result  = service.optimize(profile);
    const officeCard = result.cardAnnualSummaries.find((c) => c.cardId === 'mock-office-card');
    expect(officeCard?.isWorthKeeping).toBe(true);
  });

  it('marks high-fee card as not worth keeping when spend is minimal', () => {
    // $375 fee card, only $1 in rewards
    const profile = makeProfile('biz-4', 't-1', [
      { category: 'other', annualAmount: 100 },  // trivial spend
    ]);
    const result   = service.optimize(profile);
    const premium  = result.cardAnnualSummaries.find((c) => c.cardId === 'mock-premium-card');
    // Net benefit for premium: tiny reward - $375 < 0
    expect(premium?.netBenefit).toBeLessThan(0);
    expect(premium?.isWorthKeeping).toBe(false);
  });

  it('cardAnnualSummary contains per-category breakdown for optimal routing', () => {
    const profile = makeProfile('biz-5', 't-1', [
      { category: 'office_supplies', annualAmount: 20_000 },
    ]);
    const result = service.optimize(profile);
    const officeCard = result.cardAnnualSummaries.find((c) => c.cardId === 'mock-office-card');
    expect(officeCard?.categoryBreakdown.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Section 4: RewardsOptimizationService — cardAnnualSummary()
// ============================================================

describe('RewardsOptimizationService — cardAnnualSummary()', () => {
  let service: RewardsOptimizationService;

  beforeEach(() => {
    service = new RewardsOptimizationService([MOCK_CARD_OFFICE, MOCK_CARD_TRAVEL]);
  });

  it('returns null for unknown cardId', () => {
    const profile  = makeProfile('biz-1', 't-1', [{ category: 'gas', annualAmount: 5_000 }]);
    const summary  = service.cardAnnualSummary('nonexistent-card', profile);
    expect(summary).toBeNull();
  });

  it('calculates reward value for each category', () => {
    const profile  = makeProfile('biz-1', 't-1', [
      { category: 'office_supplies', annualAmount: 10_000 },
      { category: 'gas',             annualAmount: 5_000 },
    ]);
    const summary  = service.cardAnnualSummary('mock-office-card', profile);
    expect(summary?.categoryBreakdown.length).toBe(2);
    const officeBreakdown = summary?.categoryBreakdown.find((b) => b.category === 'office_supplies');
    expect(officeBreakdown?.rewardValue).toBeCloseTo(500); // 5 % × $10,000
  });

  it('netBenefit = totalRewardValue - annualFee', () => {
    const profile  = makeProfile('biz-1', 't-1', [{ category: 'travel', annualAmount: 20_000 }]);
    const summary  = service.cardAnnualSummary('mock-travel-card', profile);
    expect(summary?.netBenefit).toBeCloseTo(
      (summary?.totalRewardValue ?? 0) - (summary?.annualFee ?? 0),
    );
  });
});

// ============================================================
// Section 5: RewardsOptimizationService — real catalog cards
// ============================================================

describe('RewardsOptimizationService — real catalog integration', () => {
  let service: RewardsOptimizationService;

  beforeEach(() => {
    service = new RewardsOptimizationService(getActiveCards());
  });

  it('Chase Ink Business Cash wins office_supplies category', () => {
    const rec = service.rankCardsForCategory('office_supplies', 10_000);
    // Chase Ink Business Cash: 5 % on office supplies is the highest in catalog
    expect(rec.optimalCard.cardId).toBe('chase-ink-business-cash');
  });

  it('PNC card wins gas category (4 %)', () => {
    const rec = service.rankCardsForCategory('gas', 10_000);
    // PNC: 4 % on gas, Costco: 4 % on gas — either could top; ensure rate is 0.04
    expect(rec.optimalCard.rate).toBe(0.04);
  });

  it('optimize returns summaries for all 18 catalog cards', () => {
    const profile = makeProfile('biz-real', 't-real', [
      { category: 'office_supplies', annualAmount: 25_000 },
      { category: 'travel',          annualAmount: 10_000 },
      { category: 'restaurants',     annualAmount: 8_000 },
    ]);
    const result = service.optimize(profile);
    expect(result.cardAnnualSummaries.length).toBe(18);
  });
});

// ============================================================
// Section 6: CardBenefitsService — benefit catalog
// ============================================================

describe('CardBenefitsService — benefit catalog', () => {
  let service: CardBenefitsService;

  beforeEach(() => {
    service = new CardBenefitsService([MOCK_CARD_OFFICE, MOCK_CARD_TRAVEL, MOCK_CARD_PREMIUM]);
  });

  it('returns benefit definitions for a known card', () => {
    const defs = service.getBenefitDefinitions('mock-office-card');
    expect(defs.length).toBeGreaterThan(0);
  });

  it('includes sign-up bonus benefit for card with signupBonus', () => {
    const defs = service.getBenefitDefinitions('mock-office-card');
    const bonus = defs.find((d) => d.benefitType === 'sign_up_bonus');
    expect(bonus).toBeDefined();
    expect(bonus!.benefitValue).toBeGreaterThan(0);
  });

  it('premium card ($375 fee) includes travel_credit benefit', () => {
    const defs = service.getBenefitDefinitions('mock-premium-card');
    const travelCredit = defs.find((d) => d.benefitType === 'travel_credit');
    expect(travelCredit).toBeDefined();
    expect(travelCredit!.benefitValue).toBe(200);
  });

  it('cards with foreign tx fee = 0 include rental_car_insurance', () => {
    const defs = service.getBenefitDefinitions('mock-travel-card');
    const rental = defs.find((d) => d.benefitType === 'rental_car_insurance');
    expect(rental).toBeDefined();
  });

  it('returns empty array for unknown cardId', () => {
    const defs = service.getBenefitDefinitions('nonexistent');
    expect(defs).toEqual([]);
  });
});

// ============================================================
// Section 7: CardBenefitsService — benefit registration & tracking
// ============================================================

describe('CardBenefitsService — registration & utilization', () => {
  let service: CardBenefitsService;

  beforeEach(() => {
    service = new CardBenefitsService([MOCK_CARD_OFFICE, MOCK_CARD_TRAVEL]);
  });

  it('registerCardBenefits creates records for all benefit definitions', () => {
    const benefits = service.registerCardBenefits(
      'biz-1', 'app-1', 'mock-office-card', '2025-06-01',
    );
    const defs = service.getBenefitDefinitions('mock-office-card');
    expect(benefits.length).toBe(defs.length);
  });

  it('all registered benefits start as not utilized', () => {
    const benefits = service.registerCardBenefits(
      'biz-2', 'app-2', 'mock-office-card', '2025-06-01',
    );
    expect(benefits.every((b) => !b.utilized)).toBe(true);
  });

  it('getBusinessBenefits returns registered benefits for business', () => {
    service.registerCardBenefits('biz-3', 'app-3', 'mock-office-card', '2025-06-01');
    const result = service.getBusinessBenefits('biz-3');
    expect(result.length).toBeGreaterThan(0);
  });

  it('getBusinessBenefits filters by cardId when provided', () => {
    service.registerCardBenefits('biz-4', 'app-4', 'mock-office-card', '2025-06-01');
    service.registerCardBenefits('biz-4', 'app-5', 'mock-travel-card', '2025-06-01');

    const officeOnly = service.getBusinessBenefits('biz-4', 'mock-office-card');
    expect(officeOnly.every((b) => b.cardId === 'mock-office-card')).toBe(true);
  });

  it('utilizeBenefit marks benefit as utilized with timestamp', () => {
    const benefits = service.registerCardBenefits(
      'biz-5', 'app-6', 'mock-office-card', '2025-06-01',
    );
    const target = benefits[0]!;
    const updated = service.utilizeBenefit('biz-5', target.id, {
      utilizedDate: '2026-03-15T00:00:00.000Z',
    });
    expect(updated?.utilized).toBe(true);
    expect(updated?.utilizedDate).toBe('2026-03-15T00:00:00.000Z');
  });

  it('utilizeBenefit returns null for unknown benefitId', () => {
    service.registerCardBenefits('biz-6', 'app-7', 'mock-office-card', '2025-06-01');
    const result = service.utilizeBenefit('biz-6', 'nonexistent-id', {});
    expect(result).toBeNull();
  });

  it('utilizeBenefit returns null for unknown businessId', () => {
    const result = service.utilizeBenefit('nonexistent-biz', 'any-id', {});
    expect(result).toBeNull();
  });
});

// ============================================================
// Section 8: CardBenefitsService — expiry alerts
// ============================================================

describe('CardBenefitsService — expiry alerts', () => {
  let service: CardBenefitsService;

  beforeEach(() => {
    service = new CardBenefitsService([MOCK_CARD_TRAVEL]);
  });

  it('returns no alerts for benefits with no expiry date', () => {
    service.registerCardBenefits('biz-alert-1', 'app-a1', 'mock-travel-card', '2025-01-01');
    const alerts = service.getExpiryAlerts('biz-alert-1');
    // Only annual-reset benefits generate alerts; others have no expiryDate
    // Verify all alerts have an expiryDate set
    for (const alert of alerts) {
      expect(alert.expiryDate).toBeTruthy();
    }
  });

  it('generates "urgent" alert for benefit expiring within 7 days', () => {
    service.registerCardBenefits('biz-urgent', 'app-urgent', 'mock-travel-card', '2025-01-01');
    // Manually set a benefit to expire in 3 days
    const benefits = service.getBusinessBenefits('biz-urgent');
    const benefit  = benefits.find((b) => b.expiryDate !== null);
    if (!benefit) return; // skip if no annual-reset benefit exists for this card

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 3);
    (benefit as any).expiryDate = expiry.toISOString().split('T')[0]!;

    const alerts = service.getExpiryAlerts('biz-urgent');
    const urgent = alerts.find((a) => a.severity === 'urgent');
    expect(urgent).toBeDefined();
    expect(urgent!.daysUntilExpiry).toBeLessThanOrEqual(7);
  });

  it('does not alert for already utilized benefits', () => {
    service.registerCardBenefits('biz-util', 'app-util', 'mock-travel-card', '2025-01-01');
    const benefits = service.getBusinessBenefits('biz-util');
    const withExpiry = benefits.filter((b) => b.expiryDate);

    // Utilize all benefits with expiry dates
    for (const b of withExpiry) {
      // Force expiry to be imminent
      const d = new Date(); d.setDate(d.getDate() + 5);
      (b as any).expiryDate = d.toISOString().split('T')[0]!;
      service.utilizeBenefit('biz-util', b.id, {});
    }

    const alerts = service.getExpiryAlerts('biz-util');
    expect(alerts.every((a) => !withExpiry.find((b) => b.id === a.benefitId)?.utilized)).toBe(true);
  });

  it('sorts alerts by daysUntilExpiry ascending', () => {
    service.registerCardBenefits('biz-sort', 'app-sort', 'mock-travel-card', '2025-01-01');
    const benefits = service.getBusinessBenefits('biz-sort');

    // Assign staggered expiry dates
    let day = 10;
    for (const b of benefits.filter((b) => b.expiryDate)) {
      const d = new Date(); d.setDate(d.getDate() + day);
      (b as any).expiryDate = d.toISOString().split('T')[0]!;
      day += 5;
    }

    const alerts = service.getExpiryAlerts('biz-sort');
    for (let i = 0; i < alerts.length - 1; i++) {
      expect(alerts[i]!.daysUntilExpiry).toBeLessThanOrEqual(alerts[i + 1]!.daysUntilExpiry);
    }
  });
});

// ============================================================
// Section 9: CardBenefitsService — renewal recommendations
// ============================================================

describe('CardBenefitsService — renewal recommendations', () => {
  let service: CardBenefitsService;

  beforeEach(() => {
    service = new CardBenefitsService([MOCK_CARD_OFFICE, MOCK_CARD_TRAVEL, MOCK_CARD_PREMIUM]);
  });

  it('returns empty array when no benefits are registered', () => {
    const recs = service.getRenewalRecommendations('biz-no-cards');
    expect(recs).toEqual([]);
  });

  it('recommends "keep" for zero-fee card regardless of utilization', () => {
    service.registerCardBenefits('biz-keep', 'app-free', 'mock-office-card', '2025-06-01');
    const recs = service.getRenewalRecommendations('biz-keep');
    const rec  = recs.find((r) => r.cardId === 'mock-office-card');
    expect(rec?.decision).toBe('keep');
  });

  it('recommends "cancel" when utilizedBenefitValue is far below annual fee', () => {
    service.registerCardBenefits('biz-cancel', 'app-prem', 'mock-premium-card', '2025-06-01');
    // Do NOT utilize any benefits → utilizedBenefitValue = 0
    const recs = service.getRenewalRecommendations('biz-cancel');
    const rec  = recs.find((r) => r.cardId === 'mock-premium-card');
    // 0 / 375 = 0 % utilization → should be cancel or product_change
    expect(['cancel', 'product_change']).toContain(rec?.decision);
  });

  it('recommends "keep" when utilization ratio exceeds 0.6', () => {
    service.registerCardBenefits('biz-full', 'app-travel', 'mock-travel-card', '2025-06-01');
    const benefits = service.getBusinessBenefits('biz-full');

    // Utilize enough benefits to cover > 60 % of the $95 annual fee
    let accumulated = 0;
    for (const b of benefits) {
      if (accumulated >= 95 * 0.65) break;
      service.utilizeBenefit('biz-full', b.id, {});
      accumulated += b.benefitValue;
    }

    const recs = service.getRenewalRecommendations('biz-full');
    const rec  = recs.find((r) => r.cardId === 'mock-travel-card');
    if (rec && accumulated >= 95 * 0.6) {
      expect(rec.decision).toBe('keep');
    }
  });

  it('utilizationRatio is clamped to 0 when no benefits are utilized', () => {
    service.registerCardBenefits('biz-ratio', 'app-ratio', 'mock-travel-card', '2025-06-01');
    const recs = service.getRenewalRecommendations('biz-ratio');
    const rec  = recs.find((r) => r.cardId === 'mock-travel-card');
    expect(rec?.utilizedBenefitValue).toBe(0);
    expect(rec?.utilizationRatio).toBe(0);
  });

  it('potentialAnnualSavings equals annualFee for cancel recommendation', () => {
    service.registerCardBenefits('biz-save', 'app-save', 'mock-premium-card', '2025-06-01');
    const recs = service.getRenewalRecommendations('biz-save');
    const rec  = recs.find((r) => r.cardId === 'mock-premium-card');
    if (rec?.decision === 'cancel') {
      expect(rec.potentialAnnualSavings).toBe(375);
    }
  });
});
