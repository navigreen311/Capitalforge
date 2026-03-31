// ============================================================
// CapitalForge — Rewards Optimization Service
//
// Routes business spend to the optimal card for each MCC
// category to maximize cashback / points value. Produces:
//
//   • Per-category spend routing recommendations
//   • Annual reward value estimate per card
//   • Annual fee vs. reward value net-benefit analysis
//   • Portfolio-level spend routing map
//
// MCC Category → Reward-rate matching uses keyword heuristics
// against the CardProduct.rewardsTiers catalog entries so no
// separate mapping table is required.
// ============================================================

import {
  CARD_CATALOG,
  getActiveCards,
  type CardProduct,
  type RewardTier,
} from './card-products.js';

// ── Canonical MCC category labels ────────────────────────────

export const MCC_CATEGORIES = [
  'office_supplies',
  'phone_internet_cable',
  'gas',
  'restaurants',
  'travel',
  'shipping',
  'advertising',
  'hotels',
  'rental_cars',
  'wholesale_clubs',
  'utilities',
  'software_saas',
  'other',
] as const;

export type MccCategory = (typeof MCC_CATEGORIES)[number];

// ── Spend input ───────────────────────────────────────────────

export interface CategorySpend {
  category: MccCategory;
  /** Annual spend amount in USD */
  annualAmount: number;
}

export interface SpendProfile {
  businessId: string;
  tenantId: string;
  /** List of spend categories with annual amounts */
  categories: CategorySpend[];
}

// ── Output types ──────────────────────────────────────────────

export interface CardRewardRate {
  cardId: string;
  cardName: string;
  issuer: string;
  /** Best matching reward rate for this category (0–1 for %, or multiplier) */
  rate: number;
  unit: 'percent' | 'multiplier';
  /** Annualised value in USD (points estimated at $0.01 each) */
  annualValue: number;
  /** Whether a spend cap applies and may limit this category */
  cappedAt?: number;
}

export interface CategoryRoutingRecommendation {
  category: MccCategory;
  annualSpend: number;
  /** Cards ranked best-to-worst for this category */
  rankedCards: CardRewardRate[];
  /** The single best card for this category */
  optimalCard: CardRewardRate;
  /** Value gap between optimal and second-best (USD) */
  opportunityCost: number;
}

export interface CardAnnualSummary {
  cardId: string;
  cardName: string;
  issuer: string;
  annualFee: number;
  /** Sum of estimated rewards earned across all spend categories routed to this card */
  totalRewardValue: number;
  /** Net benefit after subtracting annual fee */
  netBenefit: number;
  /** True when net benefit exceeds zero */
  isWorthKeeping: boolean;
  /** Breakdown per category */
  categoryBreakdown: Array<{
    category: MccCategory;
    annualSpend: number;
    rewardValue: number;
  }>;
}

export interface OptimizationResult {
  businessId: string;
  generatedAt: string;
  spendProfile: SpendProfile;
  /** Per-category routing recommendations */
  categoryRecommendations: CategoryRoutingRecommendation[];
  /** Annual reward summary per card that has been designated optimal for any category */
  cardAnnualSummaries: CardAnnualSummary[];
  /** Portfolio-wide metrics */
  totals: {
    totalAnnualSpend: number;
    totalOptimalRewardValue: number;
    totalAnnualFees: number;
    netPortfolioValue: number;
  };
}

// ── Point / miles value assumption ───────────────────────────

/** Cents per point/mile (industry average travel redemption floor). */
const POINT_VALUE_USD = 0.01;

// ── Category → tier keyword mapping ─────────────────────────
//
// Each MCC category is matched to one or more keywords that
// appear in the RewardTier.category strings from the catalog.

const CATEGORY_KEYWORDS: Record<MccCategory, string[]> = {
  office_supplies:     ['office'],
  phone_internet_cable:['phone', 'internet', 'cable', 'cell'],
  gas:                 ['gas'],
  restaurants:         ['restaurant', 'dining', 'food'],
  travel:              ['travel'],
  shipping:            ['shipping'],
  advertising:         ['ad'],
  hotels:              ['hotel'],
  rental_cars:         ['rental car', 'rental'],
  wholesale_clubs:     ['costco', 'wholesale', 'club'],
  utilities:           ['utilit', 'recurring'],
  software_saas:       ['software', 'saas', 'subscription'],
  other:               [],
};

// ── Internal helpers ─────────────────────────────────────────

/**
 * Find the best matching RewardTier for a given MCC category.
 * Falls back to the "all purchases" / generic tier when no
 * category-specific match is found.
 */
function bestTierForCategory(
  tiers: ReadonlyArray<RewardTier>,
  category: MccCategory,
): RewardTier {
  const keywords = CATEGORY_KEYWORDS[category];

  // 1. Try an explicit keyword match (case-insensitive)
  if (keywords.length > 0) {
    for (const tier of tiers) {
      const label = tier.category.toLowerCase();
      if (keywords.some((kw) => label.includes(kw))) {
        return tier;
      }
    }
  }

  // 2. Fall back to the lowest-rate "all purchases" tier
  const allPurchase = tiers
    .filter((t) =>
      t.category.toLowerCase().includes('all') ||
      t.category.toLowerCase().includes('other') ||
      t.category.toLowerCase().includes('all purchases'),
    )
    .sort((a, b) => b.rate - a.rate)[0];

  if (allPurchase) return allPurchase;

  // 3. Last resort: lowest rate tier in the list
  return [...tiers].sort((a, b) => a.rate - b.rate)[0]!;
}

/**
 * Convert a reward rate + annual spend into USD value.
 * Points/miles are valued at POINT_VALUE_USD per unit.
 */
export function rewardValueUsd(rate: number, unit: 'percent' | 'multiplier', annualSpend: number): number {
  if (unit === 'percent') {
    // rate is already a decimal (e.g. 0.05 = 5 %)
    return annualSpend * rate;
  }
  // multiplier: earn <rate> points per dollar; each point = POINT_VALUE_USD
  return annualSpend * rate * POINT_VALUE_USD;
}

/**
 * Build a CardRewardRate for a card + MCC category + annual spend.
 */
function cardRateForCategory(
  card: CardProduct,
  category: MccCategory,
  annualSpend: number,
): CardRewardRate {
  const tier = bestTierForCategory(card.rewardsTiers, category);
  const effectiveSpend = tier.annualCap
    ? Math.min(annualSpend, tier.annualCap)
    : annualSpend;

  return {
    cardId:      card.id,
    cardName:    card.name,
    issuer:      card.issuer,
    rate:        tier.rate,
    unit:        tier.unit,
    annualValue: rewardValueUsd(tier.rate, tier.unit, effectiveSpend),
    cappedAt:    tier.annualCap,
  };
}

// ── Service class ─────────────────────────────────────────────

export class RewardsOptimizationService {

  private readonly cards: ReadonlyArray<CardProduct>;

  constructor(cards: ReadonlyArray<CardProduct> = getActiveCards()) {
    this.cards = cards;
  }

  // ── Core: category routing ──────────────────────────────────

  /**
   * For a single spend category, rank all active cards by
   * estimated annual reward value and return the full ranking
   * plus the single optimal card.
   */
  rankCardsForCategory(
    category: MccCategory,
    annualSpend: number,
  ): CategoryRoutingRecommendation {
    const rankedCards = this.cards
      .map((card) => cardRateForCategory(card, category, annualSpend))
      .sort((a, b) => b.annualValue - a.annualValue);

    const optimalCard = rankedCards[0]!;
    const secondBest  = rankedCards[1];
    const opportunityCost = secondBest
      ? optimalCard.annualValue - secondBest.annualValue
      : 0;

    return { category, annualSpend, rankedCards, optimalCard, opportunityCost };
  }

  // ── Core: full spend profile optimization ──────────────────

  /**
   * Process an entire SpendProfile and produce routing
   * recommendations for every category plus annual summaries.
   */
  optimize(profile: SpendProfile): OptimizationResult {
    const categoryRecommendations: CategoryRoutingRecommendation[] = profile.categories
      .filter((c) => c.annualAmount > 0)
      .map((c) => this.rankCardsForCategory(c.category, c.annualAmount));

    // Build per-card annual summaries aggregating all categories
    // where the card is optimal.
    const summaryMap = new Map<string, CardAnnualSummary>();

    // Seed summaries for every card in catalog so annual-fee cards
    // that win no category still show a net-negative result.
    for (const card of this.cards) {
      summaryMap.set(card.id, {
        cardId:            card.id,
        cardName:          card.name,
        issuer:            card.issuer,
        annualFee:         card.annualFee,
        totalRewardValue:  0,
        netBenefit:        -card.annualFee,
        isWorthKeeping:    card.annualFee === 0,
        categoryBreakdown: [],
      });
    }

    for (const rec of categoryRecommendations) {
      const { optimalCard, category, annualSpend } = rec;
      const summary = summaryMap.get(optimalCard.cardId)!;
      summary.totalRewardValue += optimalCard.annualValue;
      summary.categoryBreakdown.push({
        category,
        annualSpend,
        rewardValue: optimalCard.annualValue,
      });
    }

    // Recompute net benefit after aggregating all categories
    for (const summary of summaryMap.values()) {
      summary.netBenefit     = summary.totalRewardValue - summary.annualFee;
      summary.isWorthKeeping = summary.netBenefit > 0 || summary.annualFee === 0;
    }

    const cardAnnualSummaries = [...summaryMap.values()];

    // Portfolio totals
    const totalAnnualSpend = profile.categories.reduce((s, c) => s + c.annualAmount, 0);
    const totalOptimalRewardValue = categoryRecommendations.reduce(
      (s, r) => s + r.optimalCard.annualValue,
      0,
    );
    const totalAnnualFees = cardAnnualSummaries.reduce(
      (s, c) => s + c.annualFee,
      0,
    );

    return {
      businessId:              profile.businessId,
      generatedAt:             new Date().toISOString(),
      spendProfile:            profile,
      categoryRecommendations,
      cardAnnualSummaries,
      totals: {
        totalAnnualSpend,
        totalOptimalRewardValue,
        totalAnnualFees,
        netPortfolioValue: totalOptimalRewardValue - totalAnnualFees,
      },
    };
  }

  // ── Convenience: annual summary for a single card ──────────

  /**
   * Return the annual reward vs fee summary for one card given
   * a spend profile. Useful for single-card keep/cancel analysis.
   */
  cardAnnualSummary(cardId: string, profile: SpendProfile): CardAnnualSummary | null {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return null;

    const breakdown: CardAnnualSummary['categoryBreakdown'] = [];
    let totalRewardValue = 0;

    for (const { category, annualAmount } of profile.categories) {
      const cr = cardRateForCategory(card, category, annualAmount);
      totalRewardValue += cr.annualValue;
      breakdown.push({ category, annualSpend: annualAmount, rewardValue: cr.annualValue });
    }

    const netBenefit = totalRewardValue - card.annualFee;
    return {
      cardId:           card.id,
      cardName:         card.name,
      issuer:           card.issuer,
      annualFee:        card.annualFee,
      totalRewardValue,
      netBenefit,
      isWorthKeeping:   netBenefit > 0 || card.annualFee === 0,
      categoryBreakdown: breakdown,
    };
  }

  // ── Utility: look up a card from the catalog ───────────────

  getCard(cardId: string): CardProduct | undefined {
    return this.cards.find((c) => c.id === cardId);
  }
}

export default RewardsOptimizationService;
