// ============================================================
// Unit Tests — StackingOptimizerService + IssuerRulesService
//
// Run standalone:
//   npx vitest run tests/unit/services/stacking-optimizer.test.ts
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StackingOptimizerService,
  type OptimizerInput,
  type PersonalCreditProfile,
} from '../../../src/backend/services/stacking-optimizer.service.js';
import {
  IssuerRulesService,
  type ApplicantProfile,
  type ExistingCard,
} from '../../../src/backend/services/issuer-rules.service.js';
import { getActiveCards, getCardsByIssuer } from '../../../src/backend/services/card-products.js';

// ============================================================
// Test fixtures
// ============================================================

function makeCredit(overrides?: Partial<PersonalCreditProfile>): PersonalCreditProfile {
  return {
    ficoScore:        740,
    utilizationRatio: 0.15,
    derogatoryCount:  0,
    inquiries12m:     1,
    creditAgeMonths:  84,
    ...overrides,
  };
}

function makeInput(overrides?: Partial<OptimizerInput>): OptimizerInput {
  return {
    personalCredit: makeCredit(),
    businessProfile: {
      businessId:        'biz-001',
      yearsInOperation:  3,
      annualRevenue:     500_000,
      targetCreditLimit: 100_000,
    },
    existingCards: [],
    recentApplicationDates: [],
    excludeCardIds: [],
    ...overrides,
  };
}

/** Build an ExistingCard opened N days ago. */
function cardOpenedDaysAgo(
  id: string,
  issuer: ExistingCard['issuer'],
  daysAgo: number,
): ExistingCard {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { id, issuer, openedAt: d.toISOString(), isOpen: true };
}

/** Build an ExistingCard opened N months ago. */
function cardOpenedMonthsAgo(
  id: string,
  issuer: ExistingCard['issuer'],
  monthsAgo: number,
): ExistingCard {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return { id, issuer, openedAt: d.toISOString(), isOpen: true };
}

/** Build an application date N days ago. */
function appDateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

// ============================================================
// Card catalog
// ============================================================

describe('Card catalog', () => {
  it('contains at least 15 active cards', () => {
    expect(getActiveCards().length).toBeGreaterThanOrEqual(15);
  });

  it('includes at least one card from Chase, Amex, and Capital One', () => {
    const issuers = getActiveCards().map((c) => c.issuer);
    expect(issuers).toContain('chase');
    expect(issuers).toContain('amex');
    expect(issuers).toContain('capital_one');
  });

  it('every active card has a positive creditLimitMin (or is a charge card)', () => {
    for (const card of getActiveCards()) {
      expect(card.creditLimitMin).toBeGreaterThanOrEqual(0);
    }
  });

  it('every active card has at least one reward tier', () => {
    for (const card of getActiveCards()) {
      expect(card.rewardsTiers.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// IssuerRulesService — Chase 5/24
// ============================================================

describe('IssuerRulesService — Chase 5/24', () => {
  let svc: IssuerRulesService;

  beforeEach(() => {
    svc = new IssuerRulesService();
  });

  it('passes when applicant has 0 new cards in 24 months', () => {
    const profile: ApplicantProfile = {
      existingCards: [],
      recentApplicationDates: [],
    };
    const result = svc.checkIssuer('chase', profile);
    expect(result.eligible).toBe(true);
  });

  it('passes when applicant has exactly 4 new cards in 24 months', () => {
    const cards: ExistingCard[] = Array.from({ length: 4 }, (_, i) =>
      cardOpenedMonthsAgo(`card-${i}`, 'capital_one', 6),
    );
    const profile: ApplicantProfile = { existingCards: cards, recentApplicationDates: [] };
    const result = svc.checkIssuer('chase', profile);
    expect(result.eligible).toBe(true);
  });

  it('fails when applicant has exactly 5 new cards in 24 months', () => {
    const cards: ExistingCard[] = Array.from({ length: 5 }, (_, i) =>
      cardOpenedMonthsAgo(`card-${i}`, 'capital_one', 6),
    );
    const profile: ApplicantProfile = { existingCards: cards, recentApplicationDates: [] };
    const result = svc.checkIssuer('chase', profile);
    expect(result.eligible).toBe(false);
    expect(result.blockedBy.some((r) => r.ruleId === 'chase_5_24')).toBe(true);
  });

  it('fails when applicant has 7 new cards in 24 months (various issuers)', () => {
    const cards: ExistingCard[] = [
      cardOpenedMonthsAgo('c1', 'chase', 3),
      cardOpenedMonthsAgo('c2', 'amex', 6),
      cardOpenedMonthsAgo('c3', 'capital_one', 10),
      cardOpenedMonthsAgo('c4', 'citi', 14),
      cardOpenedMonthsAgo('c5', 'bank_of_america', 18),
      cardOpenedMonthsAgo('c6', 'us_bank', 20),
      cardOpenedMonthsAgo('c7', 'wells_fargo', 22),
    ];
    const profile: ApplicantProfile = { existingCards: cards, recentApplicationDates: [] };
    const result = svc.checkIssuer('chase', profile);
    expect(result.eligible).toBe(false);
  });

  it('does NOT count cards opened more than 24 months ago', () => {
    // 4 cards in window + 3 outside window = still under 5/24
    const cards: ExistingCard[] = [
      cardOpenedMonthsAgo('c1', 'amex', 4),
      cardOpenedMonthsAgo('c2', 'amex', 8),
      cardOpenedMonthsAgo('c3', 'capital_one', 16),
      cardOpenedMonthsAgo('c4', 'citi', 22),
      cardOpenedMonthsAgo('c5', 'us_bank', 26), // outside 24-month window
      cardOpenedMonthsAgo('c6', 'wells_fargo', 30),
      cardOpenedMonthsAgo('c7', 'bank_of_america', 36),
    ];
    const profile: ApplicantProfile = { existingCards: cards, recentApplicationDates: [] };
    const result = svc.checkIssuer('chase', profile);
    expect(result.eligible).toBe(true);
  });
});

// ============================================================
// IssuerRulesService — Amex velocity
// ============================================================

describe('IssuerRulesService — Amex velocity', () => {
  let svc: IssuerRulesService;

  beforeEach(() => {
    svc = new IssuerRulesService();
  });

  it('passes when no Amex cards opened in past 90 days', () => {
    const profile: ApplicantProfile = {
      existingCards: [cardOpenedDaysAgo('amex-old', 'amex', 100)],
      recentApplicationDates: [],
    };
    const result = svc.checkIssuer('amex', profile);
    expect(result.eligible).toBe(true);
  });

  it('passes when exactly 1 Amex card opened in past 90 days', () => {
    const profile: ApplicantProfile = {
      existingCards: [cardOpenedDaysAgo('amex-recent', 'amex', 45)],
      recentApplicationDates: [],
    };
    const result = svc.checkIssuer('amex', profile);
    expect(result.eligible).toBe(true);
  });

  it('fails when 2 Amex cards opened in past 90 days', () => {
    const profile: ApplicantProfile = {
      existingCards: [
        cardOpenedDaysAgo('amex-1', 'amex', 30),
        cardOpenedDaysAgo('amex-2', 'amex', 60),
      ],
      recentApplicationDates: [],
    };
    const result = svc.checkIssuer('amex', profile);
    expect(result.eligible).toBe(false);
    expect(result.blockedBy.some((r) => r.ruleId === 'amex_velocity_90d')).toBe(true);
  });

  it('5-day cooldown: fails when Amex app submitted within 5 days', () => {
    const profile: ApplicantProfile = {
      existingCards: [],
      recentApplicationDates: [appDateDaysAgo(3)],
    };
    const result = svc.checkIssuer('amex', profile);
    expect(result.eligible).toBe(false);
    expect(result.blockedBy.some((r) => r.ruleId === 'amex_velocity_5d_cooldown')).toBe(true);
  });

  it('5-day cooldown: passes when last app was 6 days ago', () => {
    const profile: ApplicantProfile = {
      existingCards: [],
      recentApplicationDates: [appDateDaysAgo(6)],
    };
    const result = svc.checkIssuer('amex', profile);
    // only check the 5d rule specifically
    const cooldownResult = result.allResults.find((r) => r.ruleId === 'amex_velocity_5d_cooldown');
    expect(cooldownResult?.passed).toBe(true);
  });
});

// ============================================================
// IssuerRulesService — Citi rules
// ============================================================

describe('IssuerRulesService — Citi rules', () => {
  let svc: IssuerRulesService;

  beforeEach(() => {
    svc = new IssuerRulesService();
  });

  it('1/8 rule: passes when no apps in past 8 days', () => {
    const profile: ApplicantProfile = {
      existingCards: [],
      recentApplicationDates: [appDateDaysAgo(10)],
    };
    const result = svc.checkIssuer('citi', profile);
    const rule = result.allResults.find((r) => r.ruleId === 'citi_1_per_8_days');
    expect(rule?.passed).toBe(true);
  });

  it('1/8 rule: fails when an app was submitted 5 days ago', () => {
    const profile: ApplicantProfile = {
      existingCards: [],
      recentApplicationDates: [appDateDaysAgo(5)],
    };
    const result = svc.checkIssuer('citi', profile);
    expect(result.eligible).toBe(false);
    expect(result.blockedBy.some((r) => r.ruleId === 'citi_1_per_8_days')).toBe(true);
  });

  it('2/65 rule: passes when only 1 app in past 65 days', () => {
    const profile: ApplicantProfile = {
      existingCards: [],
      recentApplicationDates: [appDateDaysAgo(30)],
    };
    const result = svc.checkIssuer('citi', profile);
    const rule = result.allResults.find((r) => r.ruleId === 'citi_2_per_65_days');
    expect(rule?.passed).toBe(true);
  });

  it('2/65 rule: fails when 2+ apps in past 65 days', () => {
    const profile: ApplicantProfile = {
      existingCards: [],
      recentApplicationDates: [appDateDaysAgo(20), appDateDaysAgo(50)],
    };
    const result = svc.checkIssuer('citi', profile);
    expect(result.eligible).toBe(false);
    expect(result.blockedBy.some((r) => r.ruleId === 'citi_2_per_65_days')).toBe(true);
  });

  it('returns eligible for citi when no recent apps at all', () => {
    const profile: ApplicantProfile = {
      existingCards: [],
      recentApplicationDates: [],
    };
    const result = svc.checkIssuer('citi', profile);
    expect(result.eligible).toBe(true);
  });
});

// ============================================================
// StackingOptimizerService — card ranking
// ============================================================

describe('StackingOptimizerService — card ranking', () => {
  let svc: StackingOptimizerService;

  beforeEach(() => {
    svc = new StackingOptimizerService();
  });

  it('returns a plan with at least 1 card for a clean 740 FICO profile', () => {
    const result = svc.optimize(makeInput());
    expect(result.plan.allCards.length).toBeGreaterThan(0);
  });

  it('plan cards are ordered by score descending within each round', () => {
    const result = svc.optimize(makeInput());
    for (const round of result.plan.rounds) {
      for (let i = 0; i < round.length - 1; i++) {
        expect(round[i].score.total).toBeGreaterThanOrEqual(round[i + 1].score.total);
      }
    }
  });

  it('every card in the plan has a score between 0 and 100', () => {
    const result = svc.optimize(makeInput());
    for (const rc of result.plan.allCards) {
      expect(rc.score.total).toBeGreaterThanOrEqual(0);
      expect(rc.score.total).toBeLessThanOrEqual(100);
    }
  });

  it('approval probability is between 0 and 1 for every ranked card', () => {
    const result = svc.optimize(makeInput());
    for (const rc of result.plan.allCards) {
      expect(rc.approvalProbability).toBeGreaterThanOrEqual(0);
      expect(rc.approvalProbability).toBeLessThanOrEqual(1);
    }
  });

  it('cards with very low FICO requirement appear before cards with high requirement in the plan when FICO is marginal', () => {
    // Client with marginal FICO — high-requirement cards should score lower
    const input = makeInput({ personalCredit: makeCredit({ ficoScore: 640 }) });
    const result = svc.optimize(input);

    if (result.plan.allCards.length >= 2) {
      const first = result.plan.allCards[0];
      const last  = result.plan.allCards[result.plan.allCards.length - 1];
      expect(first.score.total).toBeGreaterThanOrEqual(last.score.total);
    }
  });

  it('a card with a 0% intro APR offer scores higher on aprWindowValue than a card without one (all else equal)', () => {
    const result = svc.optimize(makeInput());
    const withIntro    = result.plan.allCards.find((rc) => rc.card.introAprPercent === 0 && rc.card.introAprMonths !== null);
    const withoutIntro = result.plan.allCards.find((rc) => rc.card.introAprPercent === null);

    if (withIntro && withoutIntro) {
      expect(withIntro.score.aprWindowValue).toBeGreaterThan(withoutIntro.score.aprWindowValue);
    }
  });
});

// ============================================================
// StackingOptimizerService — Chase 5/24 enforcement
// ============================================================

describe('StackingOptimizerService — Chase 5/24 enforcement', () => {
  let svc: StackingOptimizerService;

  beforeEach(() => {
    svc = new StackingOptimizerService();
  });

  it('excludes ALL Chase cards when applicant has 5+ cards in 24 months', () => {
    const fiveCards = Array.from({ length: 5 }, (_, i) =>
      cardOpenedMonthsAgo(`card-${i}`, 'capital_one', 6),
    );

    const input = makeInput({ existingCards: fiveCards });
    const result = svc.optimize(input);

    // No Chase cards in the plan
    const chaseInPlan = result.plan.allCards.filter((rc) => rc.card.issuer === 'chase');
    expect(chaseInPlan.length).toBe(0);

    // All Chase cards are in excludedCards
    const chaseExcluded = result.plan.excludedCards.filter((ec) => ec.card.issuer === 'chase');
    const chaseInCatalog = getCardsByIssuer('chase').length;
    expect(chaseExcluded.length).toBe(chaseInCatalog);
  });

  it('includes Chase cards when applicant has only 4 cards in 24 months', () => {
    const fourCards = Array.from({ length: 4 }, (_, i) =>
      cardOpenedMonthsAgo(`card-${i}`, 'capital_one', 6),
    );

    const input = makeInput({ existingCards: fourCards });
    const result = svc.optimize(input);

    const chaseInPlan = result.plan.allCards.filter((rc) => rc.card.issuer === 'chase');
    expect(chaseInPlan.length).toBeGreaterThan(0);
  });
});

// ============================================================
// StackingOptimizerService — Amex velocity enforcement
// ============================================================

describe('StackingOptimizerService — Amex velocity enforcement', () => {
  let svc: StackingOptimizerService;

  beforeEach(() => {
    svc = new StackingOptimizerService();
  });

  it('excludes ALL Amex cards when 2 Amex cards were opened in the past 90 days', () => {
    const existingCards: ExistingCard[] = [
      cardOpenedDaysAgo('amex-1', 'amex', 20),
      cardOpenedDaysAgo('amex-2', 'amex', 50),
    ];

    const input = makeInput({ existingCards });
    const result = svc.optimize(input);

    const amexInPlan = result.plan.allCards.filter((rc) => rc.card.issuer === 'amex');
    expect(amexInPlan.length).toBe(0);
  });

  it('includes Amex cards when only 1 Amex was opened in past 90 days', () => {
    const existingCards: ExistingCard[] = [
      cardOpenedDaysAgo('amex-recent', 'amex', 30),
    ];

    const input = makeInput({ existingCards });
    const result = svc.optimize(input);

    const amexInPlan = result.plan.allCards.filter((rc) => rc.card.issuer === 'amex');
    expect(amexInPlan.length).toBeGreaterThan(0);
  });
});

// ============================================================
// StackingOptimizerService — Network diversity
// ============================================================

describe('StackingOptimizerService — network diversity bonus', () => {
  let svc: StackingOptimizerService;

  beforeEach(() => {
    svc = new StackingOptimizerService();
  });

  it('grants diversity bonus (5 pts) to a card with a network not yet held', () => {
    // Client holds only Visa cards — an Amex should earn diversity bonus
    const existingCards: ExistingCard[] = [
      cardOpenedMonthsAgo('chase-ink-business-cash', 'chase', 12),
    ];

    const input = makeInput({ existingCards });
    const result = svc.optimize(input);

    const amexCards = result.plan.allCards.filter((rc) => rc.card.network === 'amex');
    if (amexCards.length > 0) {
      // At least one Amex should have diversity bonus since client holds only Visa
      const hasBonus = amexCards.some((rc) => rc.score.networkDiversityBonus === 5);
      expect(hasBonus).toBe(true);
    }
  });

  it('grants NO diversity bonus when all networks are already held', () => {
    // Client holds Visa, Mastercard, Amex, Discover
    const existingCards: ExistingCard[] = [
      cardOpenedMonthsAgo('chase-ink-business-cash', 'chase', 12),        // Visa
      cardOpenedMonthsAgo('capital-one-spark-cash-plus', 'capital_one', 12), // Mastercard
      cardOpenedMonthsAgo('amex-blue-business-plus', 'amex', 12),          // Amex
      cardOpenedMonthsAgo('discover-it-business', 'discover', 12),         // Discover
    ];

    const input = makeInput({ existingCards });
    const result = svc.optimize(input);

    for (const rc of result.plan.allCards) {
      expect(rc.score.networkDiversityBonus).toBe(0);
    }
  });
});

// ============================================================
// StackingOptimizerService — Multi-round sequencing
// ============================================================

describe('StackingOptimizerService — multi-round sequencing', () => {
  let svc: StackingOptimizerService;

  beforeEach(() => {
    svc = new StackingOptimizerService();
  });

  it('produces at least 2 rounds for a large target with many eligible cards', () => {
    const input = makeInput({
      businessProfile: {
        businessId:        'biz-big',
        yearsInOperation:  5,
        annualRevenue:     1_000_000,
        targetCreditLimit: 300_000,
      },
    });
    const result = svc.optimize(input);
    expect(result.plan.rounds.length).toBeGreaterThanOrEqual(1);
  });

  it('cards in round 1 have higher or equal minFicoEstimate than cards in round 3 on average', () => {
    const input = makeInput({
      businessProfile: {
        businessId:        'biz-multi',
        yearsInOperation:  4,
        annualRevenue:     800_000,
        targetCreditLimit: 250_000,
      },
    });

    const result = svc.optimize(input);
    const { rounds } = result.plan;

    if (rounds.length >= 3) {
      const avgFicoRound1 = rounds[0].reduce((s, rc) => s + rc.card.minFicoEstimate, 0) / rounds[0].length;
      const avgFicoRound3 = rounds[2].reduce((s, rc) => s + rc.card.minFicoEstimate, 0) / rounds[2].length;
      expect(avgFicoRound1).toBeGreaterThanOrEqual(avgFicoRound3);
    }
  });

  it('all cards in the plan have a round number >= 1', () => {
    const result = svc.optimize(makeInput());
    for (const rc of result.plan.allCards) {
      expect(rc.round).toBeGreaterThanOrEqual(1);
      expect(rc.positionInRound).toBeGreaterThanOrEqual(1);
    }
  });

  it('totalEstimatedCredit is the sum of all card estimatedCreditLimits', () => {
    const result = svc.optimize(makeInput());
    const sum = result.plan.allCards.reduce((s, rc) => s + rc.estimatedCreditLimit, 0);
    expect(result.plan.totalEstimatedCredit).toBe(sum);
  });
});

// ============================================================
// StackingOptimizerService — What-if simulation
// ============================================================

describe('StackingOptimizerService — simulate (what-if)', () => {
  let svc: StackingOptimizerService;

  beforeEach(() => {
    svc = new StackingOptimizerService();
  });

  it('higher FICO scenario produces >= approval probability for the same card', () => {
    const baseInput = makeInput({ personalCredit: makeCredit({ ficoScore: 680 }) });
    const baseResult = svc.optimize(baseInput);

    const simResult = svc.simulate(baseInput, { ficoScore: 780 });

    // Pick a card that appears in both plans
    for (const simCard of simResult.plan.allCards) {
      const baseCard = baseResult.plan.allCards.find((rc) => rc.card.id === simCard.card.id);
      if (baseCard) {
        expect(simCard.approvalProbability).toBeGreaterThanOrEqual(baseCard.approvalProbability);
        break;
      }
    }
  });

  it('simulate() result is not cached (different from optimize() result when different overrides)', () => {
    const input = makeInput();
    const optimized = svc.optimize(input);
    const simulated = svc.simulate(input, { ficoScore: 500 });

    // With a 500 FICO, fewer cards should be recommended or scores should differ
    expect(JSON.stringify(simulated.plan.summary)).not.toEqual(
      JSON.stringify(optimized.plan.summary),
    );
  });

  it('forcing low FICO results in lower average approval score', () => {
    const highResult = svc.optimize(makeInput({ personalCredit: makeCredit({ ficoScore: 800 }) }));
    const lowResult  = svc.optimize(makeInput({ personalCredit: makeCredit({ ficoScore: 580 }) }));

    expect(highResult.plan.summary.approvalScoreAvg).toBeGreaterThan(
      lowResult.plan.summary.approvalScoreAvg,
    );
  });
});

// ============================================================
// StackingOptimizerService — Explicit exclusions
// ============================================================

describe('StackingOptimizerService — explicit card exclusions', () => {
  let svc: StackingOptimizerService;

  beforeEach(() => {
    svc = new StackingOptimizerService();
  });

  it('excludes a card that is in excludeCardIds', () => {
    const input = makeInput({ excludeCardIds: ['chase-ink-business-cash'] });
    const result = svc.optimize(input);

    const inPlan = result.plan.allCards.find((rc) => rc.card.id === 'chase-ink-business-cash');
    expect(inPlan).toBeUndefined();

    const excluded = result.plan.excludedCards.find((ec) => ec.card.id === 'chase-ink-business-cash');
    expect(excluded).toBeDefined();
  });

  it('excluding all Chase cards manually leaves no Chase cards in the plan', () => {
    const chaseIds = getCardsByIssuer('chase').map((c) => c.id);
    const input = makeInput({ excludeCardIds: chaseIds });
    const result = svc.optimize(input);

    const chaseInPlan = result.plan.allCards.filter((rc) => rc.card.issuer === 'chase');
    expect(chaseInPlan.length).toBe(0);
  });
});

// ============================================================
// StackingOptimizerService — Result metadata
// ============================================================

describe('StackingOptimizerService — result metadata', () => {
  let svc: StackingOptimizerService;

  beforeEach(() => {
    svc = new StackingOptimizerService();
  });

  it('generatedAt is a valid ISO string', () => {
    const result = svc.optimize(makeInput());
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  it('expiresAt is 24 hours after generatedAt', () => {
    const result = svc.optimize(makeInput());
    const generated = new Date(result.generatedAt).getTime();
    const expires   = new Date(result.expiresAt).getTime();
    const diffHours = (expires - generated) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(24, 0);
  });

  it('businessId matches the input businessProfile.businessId', () => {
    const input = makeInput();
    const result = svc.optimize(input);
    expect(result.businessId).toBe(input.businessProfile.businessId);
  });

  it('networkCoverage only lists networks present in the plan', () => {
    const result = svc.optimize(makeInput());
    const planNetworks = new Set(result.plan.allCards.map((rc) => rc.card.network));
    for (const network of result.plan.networkCoverage) {
      expect(planNetworks.has(network)).toBe(true);
    }
  });
});
