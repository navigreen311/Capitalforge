// ============================================================
// CapitalForge — Card Stacking Optimizer Service
//
// Core AI-ranking engine that produces a prioritized, multi-round
// card application plan for a given business + credit profile.
//
// Scoring model (100 points total):
//   40 pts  Approval probability   — FICO fit, thin-file penalty
//   25 pts  APR window value       — intro 0 % APR length bonus
//   20 pts  Credit limit estimate  — expected CL relative to target
//   10 pts  Rewards value          — best effective reward rate
//    5 pts  Network diversity      — bonus for adding a new network
//
// Round planning heuristic:
//   Round 1 → hardest approvals first (highest FICO requirement).
//              Credit is cleanest before any new inquiries.
//   Round 2 → moderate approvals after inquiry velocity settles (≥30 days).
//   Round 3 → easier cards to fill remaining credit targets.
//
// Issuer rules are checked before scoring.  Ineligible cards are
// excluded from the plan but returned in `excludedCards` for
// transparency.
// ============================================================

import { getActiveCards, type CardProduct, type CardNetwork } from './card-products.js';
import {
  IssuerRulesService,
  type ApplicantProfile,
  type ExistingCard,
} from './issuer-rules.service.js';

// ============================================================
// Input types
// ============================================================

export interface PersonalCreditProfile {
  /** Current personal FICO score (300–850) */
  ficoScore: number;
  /** Total personal revolving utilization 0–1 */
  utilizationRatio: number;
  /** Number of derogatory marks (collections, charge-offs) */
  derogatoryCount: number;
  /** Number of hard inquiries in the past 12 months */
  inquiries12m: number;
  /** Total months of credit history */
  creditAgeMonths: number;
}

export interface BusinessProfile {
  /** Business entity UUID */
  businessId: string;
  /** Years the business has been in operation */
  yearsInOperation: number;
  /** Annual gross revenue (USD) */
  annualRevenue: number;
  /**
   * Target total new credit to acquire across all rounds.
   * The optimizer tries to fill this target before stopping.
   */
  targetCreditLimit: number;
}

export interface OptimizerInput {
  personalCredit: PersonalCreditProfile;
  businessProfile: BusinessProfile;
  /** Cards already held — drives rule checks and network-diversity bonus */
  existingCards: ExistingCard[];
  /**
   * Dates of all previous credit applications in the past 65 days.
   * Used for Citi and Amex velocity checks.
   */
  recentApplicationDates?: string[];
  /**
   * Card product IDs to forcibly exclude regardless of score.
   * Useful when a client has already been declined by an issuer.
   */
  excludeCardIds?: string[];
  /**
   * Optional scenario overrides for what-if simulation.
   * Keys match any numeric field of PersonalCreditProfile.
   */
  scenarioOverrides?: Partial<PersonalCreditProfile>;
}

// ============================================================
// Output types
// ============================================================

export interface ScoreBreakdown {
  approvalProbability: number;  // 0–40
  aprWindowValue: number;       // 0–25
  creditLimitValue: number;     // 0–20
  rewardsValue: number;         // 0–10
  networkDiversityBonus: number; // 0–5
  total: number;                 // 0–100
}

export interface RankedCard {
  card: CardProduct;
  score: ScoreBreakdown;
  /** Estimated approval probability 0–1 */
  approvalProbability: number;
  /** Estimated credit limit (USD) for this applicant */
  estimatedCreditLimit: number;
  /** Which application round this card belongs to (1-indexed) */
  round: number;
  /** Position within the round (1-indexed) */
  positionInRound: number;
  /** Human-readable rationale for why this card was ranked here */
  rationale: string;
}

export interface ExcludedCard {
  card: CardProduct;
  reason: string;
}

export interface StackPlan {
  /** Ordered rounds; each round is an ordered list of RankedCards */
  rounds: RankedCard[][];
  /** Flat ordered list — convenience for single-round rendering */
  allCards: RankedCard[];
  /** Cards excluded due to issuer rules or explicit exclusions */
  excludedCards: ExcludedCard[];
  /** Total estimated new credit across all recommended cards */
  totalEstimatedCredit: number;
  /** Networks represented in the plan */
  networkCoverage: CardNetwork[];
  /** Summary statistics */
  summary: {
    totalCards: number;
    totalRounds: number;
    approvalScoreAvg: number;
    targetCreditLimitMet: boolean;
  };
}

export interface OptimizerResult {
  businessId: string;
  generatedAt: string;
  input: OptimizerInput;
  plan: StackPlan;
  /** ISO timestamp until which this result is considered fresh (24 h) */
  expiresAt: string;
  /**
   * Convenience alias: rounds from the plan, each mapped to { applications }
   * for test-friendly access (e.g. result.rounds[0].applications).
   */
  rounds: Array<{ applications: RankedCard[] }>;
  /** Convenience alias for plan.totalEstimatedCredit */
  totalEstimatedCredit: number;
}

// ============================================================
// Scoring constants
// ============================================================

const WEIGHT_APPROVAL    = 40;
const WEIGHT_APR         = 25;
const WEIGHT_CREDIT_LIMIT = 20;
const WEIGHT_REWARDS     = 10;
const WEIGHT_DIVERSITY   = 5;

/** Maximum intro APR months we benchmark against (longer = max score). */
const MAX_INTRO_MONTHS = 21;

/** FICO drop per derogatory mark when estimating approval probability. */
const DEROG_FICO_PENALTY = 30;

/** FICO drop per inquiry over 3 when estimating approval probability. */
const EXCESS_INQUIRY_PENALTY = 5;

/** Number of cards per round before bumping to the next round. */
const CARDS_PER_ROUND = 3;

// ============================================================
// StackingOptimizerService
// ============================================================

export class StackingOptimizerService {
  private readonly rulesService: IssuerRulesService;

  constructor(rulesService?: IssuerRulesService) {
    this.rulesService = rulesService ?? new IssuerRulesService();
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Generate a full stack plan for the given input.
   */
  optimize(input: OptimizerInput | (Omit<OptimizerInput, 'personalCredit' | 'businessProfile'> & { personal?: PersonalCreditProfile; business?: BusinessProfile })): OptimizerResult {
    // Normalise test-friendly input format: { personal, business } → { personalCredit, businessProfile }
    const normalised = input as OptimizerInput & { personal?: PersonalCreditProfile; business?: BusinessProfile };
    const canonicalInput: OptimizerInput = {
      ...normalised,
      personalCredit: normalised.personalCredit ?? normalised.personal!,
      businessProfile: normalised.businessProfile ?? normalised.business!,
    };
    const effectiveCredit = this._applyScenario(
      canonicalInput.personalCredit,
      canonicalInput.scenarioOverrides,
    );
    const applicantProfile: ApplicantProfile = {
      existingCards: canonicalInput.existingCards,
      recentApplicationDates: canonicalInput.recentApplicationDates ?? [],
    };

    const allCards = getActiveCards();
    const existingNetworks = this._existingNetworks(canonicalInput.existingCards);
    const forcedExcludes = new Set(canonicalInput.excludeCardIds ?? []);

    const rankedCards: RankedCard[] = [];
    const excludedCards: ExcludedCard[] = [];

    // ── 1. Filter and score ────────────────────────────────────

    for (const card of allCards) {
      // Hard-coded exclusions
      if (forcedExcludes.has(card.id)) {
        excludedCards.push({ card, reason: 'Excluded by advisor or prior decline.' });
        continue;
      }

      // Issuer rule check
      const eligibility = this.rulesService.checkIssuer(
        card.issuer,
        applicantProfile,
      );

      if (!eligibility.eligible) {
        const blockReasons = eligibility.blockedBy.map((r) => r.reason).join(' | ');
        excludedCards.push({
          card,
          reason: `Issuer rule(s) violated: ${blockReasons}`,
        });
        continue;
      }

      // Score
      const approvalProb = this._approvalProbability(card, effectiveCredit);
      const estimatedCL  = this._estimateCreditLimit(card, effectiveCredit);
      const scoreBreakdown = this._scoreCard(
        card,
        approvalProb,
        estimatedCL,
        canonicalInput.businessProfile.targetCreditLimit,
        existingNetworks,
      );

      rankedCards.push({
        card,
        score: scoreBreakdown,
        approvalProbability: approvalProb,
        estimatedCreditLimit: estimatedCL,
        round: 0,         // assigned below
        positionInRound: 0,
        rationale: this._buildRationale(card, scoreBreakdown, approvalProb, estimatedCL),
      });
    }

    // ── 2. Sort by total score descending ──────────────────────

    rankedCards.sort((a, b) => b.score.total - a.score.total);

    // ── 3. Assign rounds ───────────────────────────────────────
    // Round 1: hardest approvals first (highest FICO requirement).
    // Round 2+: lower FICO requirement cards in subsequent waves.
    // Within each round, preserve the score ranking.

    this._assignRounds(rankedCards, canonicalInput.businessProfile.targetCreditLimit);

    // ── 4. Build plan ─────────────────────────────────────────

    const plan = this._buildPlan(
      rankedCards,
      excludedCards,
      canonicalInput.businessProfile.targetCreditLimit,
    );

    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      businessId: canonicalInput.businessProfile.businessId,
      generatedAt: now.toISOString(),
      input: canonicalInput,
      plan,
      expiresAt: expires.toISOString(),
      // Convenience aliases for test-friendly access
      rounds: plan.rounds.map((applications) => ({ applications })),
      totalEstimatedCredit: plan.totalEstimatedCredit,
    };
  }

  /**
   * Simulate a what-if scenario by overriding parts of the credit profile.
   * Delegates to optimize() with the scenarioOverrides merged in.
   */
  simulate(input: OptimizerInput, overrides: Partial<PersonalCreditProfile>): OptimizerResult {
    return this.optimize({ ...input, scenarioOverrides: overrides });
  }

  // ── Private — scoring ──────────────────────────────────────

  /**
   * Estimate approval probability as a 0–1 value based on FICO fit,
   * derogatory marks, utilization, and inquiry velocity.
   */
  private _approvalProbability(
    card: CardProduct,
    credit: PersonalCreditProfile,
  ): number {
    // Base probability: how well does the FICO fit?
    const ficoGap = credit.ficoScore - card.minFicoEstimate;

    let base: number;
    if (ficoGap >= 80) {
      base = 0.95;
    } else if (ficoGap >= 50) {
      base = 0.85;
    } else if (ficoGap >= 20) {
      base = 0.70;
    } else if (ficoGap >= 0) {
      base = 0.55;
    } else if (ficoGap >= -30) {
      base = 0.30;
    } else {
      base = 0.05;
    }

    // Derogatory penalty
    const derogPenalty = Math.min(0.30, credit.derogatoryCount * 0.10);

    // Utilization penalty (> 50 % starts hurting)
    const utilPenalty = credit.utilizationRatio > 0.5
      ? Math.min(0.20, (credit.utilizationRatio - 0.5) * 0.4)
      : 0;

    // Inquiry velocity penalty (> 3 inquiries in 12 months)
    const excessInquiries = Math.max(0, credit.inquiries12m - 3);
    const inquiryPenalty = Math.min(0.15, excessInquiries * 0.03);

    const final = Math.max(0, Math.min(1, base - derogPenalty - utilPenalty - inquiryPenalty));
    return parseFloat(final.toFixed(4));
  }

  /**
   * Estimate the credit limit the issuer would grant this applicant,
   * interpolated between the card's min/max based on FICO fit.
   */
  private _estimateCreditLimit(
    card: CardProduct,
    credit: PersonalCreditProfile,
  ): number {
    if (card.creditLimitMax === 0) {
      // Charge card — no preset limit, use a generous proxy
      return 25000;
    }

    const ficoGap = credit.ficoScore - card.minFicoEstimate;
    const range = card.creditLimitMax - card.creditLimitMin;

    // Map ficoGap [0 → 100] to interpolation factor [0 → 1]
    const factor = Math.max(0, Math.min(1, ficoGap / 100));
    const estimate = card.creditLimitMin + range * factor;

    // Penalty for high utilization (issuer sees risk in overall exposure)
    const utilMultiplier = credit.utilizationRatio > 0.7 ? 0.75 : 1.0;

    return Math.round(estimate * utilMultiplier);
  }

  /**
   * Compute the score breakdown for a single card.
   */
  private _scoreCard(
    card: CardProduct,
    approvalProb: number,
    estimatedCL: number,
    targetCL: number,
    existingNetworks: Set<CardNetwork>,
  ): ScoreBreakdown {
    // ── Approval probability (0–40) ─────────────────────────
    const approvalScore = Math.round(approvalProb * WEIGHT_APPROVAL);

    // ── APR window value (0–25) ──────────────────────────────
    let aprScore: number;
    if (card.introAprPercent === 0 && card.introAprMonths !== null) {
      aprScore = Math.round((card.introAprMonths / MAX_INTRO_MONTHS) * WEIGHT_APR);
    } else {
      // No intro offer — score based on low regular APR
      const aprRange = 20; // reference: 10% = best, 30% = worst
      const normalised = Math.max(0, (30 - card.regularAprLow) / aprRange);
      aprScore = Math.round(normalised * WEIGHT_APR * 0.4); // max 40% of weight without intro
    }

    // ── Credit limit value (0–20) ────────────────────────────
    const clRatio = targetCL > 0 ? Math.min(1, estimatedCL / targetCL) : 0.5;
    const clScore = Math.round(clRatio * WEIGHT_CREDIT_LIMIT);

    // ── Rewards value (0–10) ─────────────────────────────────
    const bestRate = this._bestEffectiveRewardRate(card);
    // 5 % cash back = full score; scale linearly down to 0.5 %
    const rewardsScore = Math.round(Math.min(1, bestRate / 0.05) * WEIGHT_REWARDS);

    // ── Network diversity bonus (0–5) ─────────────────────────
    const diversityScore = !existingNetworks.has(card.network) ? WEIGHT_DIVERSITY : 0;

    const total = Math.min(
      100,
      approvalScore + aprScore + clScore + rewardsScore + diversityScore,
    );

    return {
      approvalProbability: approvalScore,
      aprWindowValue: aprScore,
      creditLimitValue: clScore,
      rewardsValue: rewardsScore,
      networkDiversityBonus: diversityScore,
      total,
    };
  }

  /**
   * Returns the best single effective cash-back rate (as decimal) across
   * all reward tiers, normalising points/miles to a ~1 cpp value.
   */
  private _bestEffectiveRewardRate(card: CardProduct): number {
    let best = 0;

    for (const tier of card.rewardsTiers) {
      let effectiveRate: number;

      if (tier.unit === 'percent') {
        effectiveRate = tier.rate;
      } else {
        // Points/miles: assume 1 cent per point/mile as conservative baseline
        effectiveRate = tier.rate * 0.01;
      }

      if (effectiveRate > best) best = effectiveRate;
    }

    return best;
  }

  // ── Private — round assignment ─────────────────────────────

  /**
   * Assign each card to a round.
   *
   * Strategy:
   *   Round 1 — top-scoring cards with higher FICO requirements (harder apps).
   *             Stop when CARDS_PER_ROUND slots are filled OR credit target met.
   *   Round 2 — next batch with moderate FICO requirements.
   *   Round 3 — remaining cards to fill any residual credit gap.
   *
   * Within each round cards are kept in their score-rank order (desc).
   */
  private _assignRounds(cards: RankedCard[], targetCL: number): void {
    // Segment cards by FICO difficulty tier
    const hard   = cards.filter((c) => c.card.minFicoEstimate >= 700);
    const medium = cards.filter((c) => c.card.minFicoEstimate >= 660 && c.card.minFicoEstimate < 700);
    const easy   = cards.filter((c) => c.card.minFicoEstimate < 660);

    let cumulativeCL = 0;
    let globalPosition = 0;

    const assignBatch = (batch: RankedCard[], round: number): void => {
      let position = 1;
      for (const rc of batch) {
        if (cumulativeCL >= targetCL * 1.1 && round > 1) break; // ~10% overage is fine
        rc.round = round;
        rc.positionInRound = position++;
        cumulativeCL += rc.estimatedCreditLimit;
        globalPosition++;
      }
    };

    assignBatch(hard.slice(0, CARDS_PER_ROUND), 1);
    assignBatch(medium.slice(0, CARDS_PER_ROUND), 2);
    assignBatch(easy.slice(0, CARDS_PER_ROUND), 3);

    // Anything not yet assigned (leftover hard/medium/easy) gets round 3+
    const unassigned = cards.filter((c) => c.round === 0);
    let overflow = 4;
    for (let i = 0; i < unassigned.length; i++) {
      if (i % CARDS_PER_ROUND === 0 && i > 0) overflow++;
      unassigned[i].round = overflow;
      unassigned[i].positionInRound = (i % CARDS_PER_ROUND) + 1;
    }
  }

  // ── Private — plan construction ────────────────────────────

  private _buildPlan(
    ranked: RankedCard[],
    excluded: ExcludedCard[],
    targetCL: number,
  ): StackPlan {
    // Only include cards that were assigned a round
    const inPlan = ranked.filter((c) => c.round > 0);

    // Group by round
    const roundMap = new Map<number, RankedCard[]>();
    for (const rc of inPlan) {
      if (!roundMap.has(rc.round)) roundMap.set(rc.round, []);
      roundMap.get(rc.round)!.push(rc);
    }

    // Sort each round by position
    for (const arr of roundMap.values()) {
      arr.sort((a, b) => a.positionInRound - b.positionInRound);
    }

    const sortedRoundNumbers = Array.from(roundMap.keys()).sort((a, b) => a - b);
    const rounds = sortedRoundNumbers.map((n) => roundMap.get(n)!);

    const totalEstimatedCredit = inPlan.reduce(
      (sum, rc) => sum + rc.estimatedCreditLimit,
      0,
    );

    const networks = [...new Set(inPlan.map((rc) => rc.card.network))];

    const avgApproval =
      inPlan.length > 0
        ? inPlan.reduce((s, rc) => s + rc.score.approvalProbability, 0) / inPlan.length
        : 0;

    return {
      rounds,
      allCards: inPlan,
      excludedCards: excluded,
      totalEstimatedCredit,
      networkCoverage: networks,
      summary: {
        totalCards: inPlan.length,
        totalRounds: rounds.length,
        approvalScoreAvg: parseFloat(avgApproval.toFixed(2)),
        targetCreditLimitMet: totalEstimatedCredit >= targetCL,
      },
    };
  }

  // ── Private — helpers ─────────────────────────────────────

  private _existingNetworks(cards: ExistingCard[]): Set<CardNetwork> {
    // We need the network from the catalog — look it up lazily here
    const allCards = getActiveCards();
    const cardMap = new Map(allCards.map((c) => [c.id, c]));
    const networks = new Set<CardNetwork>();

    for (const ec of cards) {
      const product = cardMap.get(ec.id);
      if (product) networks.add(product.network);
    }

    return networks;
  }

  private _applyScenario(
    base: PersonalCreditProfile,
    overrides?: Partial<PersonalCreditProfile>,
  ): PersonalCreditProfile {
    if (!overrides) return base;
    return { ...base, ...overrides };
  }

  private _buildRationale(
    card: CardProduct,
    score: ScoreBreakdown,
    approvalProb: number,
    estimatedCL: number,
  ): string {
    const parts: string[] = [];

    parts.push(
      `Approval probability ${(approvalProb * 100).toFixed(0)}% (FICO requirement: ${card.minFicoEstimate}+).`,
    );

    if (card.introAprPercent === 0 && card.introAprMonths) {
      parts.push(`${card.introAprMonths}-month 0% intro APR — strong funding window.`);
    }

    parts.push(`Estimated credit limit: $${estimatedCL.toLocaleString()}.`);

    if (score.networkDiversityBonus > 0) {
      parts.push(`Network diversity bonus — adds ${card.network.toUpperCase()} to the stack.`);
    }

    if (card.annualFee === 0) {
      parts.push('No annual fee.');
    }

    return parts.join(' ');
  }
}

// Singleton convenience export
export const stackingOptimizer = new StackingOptimizerService();

// ============================================================
// Phase 2 — Prisma-backed Stacking Optimizer
//
// runStackingOptimizer() loads card products from the database
// (CardProduct model), loads client data (business, credit
// profiles, card applications), and produces a StackingPlan
// with scored recommendations, sequencing, and velocity risk.
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Phase 2 input/output types ───────────────────────────────

export type PrioritizationMode =
  | 'max_credit'
  | 'best_terms'
  | 'fastest_approval'
  | 'min_inquiries';

export interface StackingOptimizerInput {
  businessId: string;
  targetAmount?: number;
  maxCards?: number;
  prioritize?: PrioritizationMode;
  excludeIssuers?: string[];
  includeCreditUnions?: boolean;
}

export interface CardRecommendation {
  cardProductId: string;
  issuer: string;
  name: string;
  cardType: string;
  eligibilityScore: number;        // 0–100
  estimatedLimitMin: number;
  estimatedLimitMax: number;
  estimatedLimitTypical: number;
  approvalDifficulty: string;
  aprIntro: number | null;
  aprIntroMonths: number | null;
  aprPostPromo: number | null;
  annualFee: number;
  rewardsType: string | null;
  rewardsRate: number | null;
  rewardsDetails: string | null;
  welcomeBonus: string | null;
  welcomeBonusValue: number | null;
  personalGuarantee: boolean;
  bestFor: string | null;
  sequencePosition: number;        // 1-indexed order of application
  cooldownDays: number;            // days to wait before this application
  rationale: string;
  velocityRisk: 'low' | 'medium' | 'high';
}

export interface ExcludedCardInfo {
  cardProductId: string;
  issuer: string;
  name: string;
  reason: string;
}

export interface AprExpirySummary {
  cardName: string;
  introMonths: number;
  expiryEstimate: string;  // ISO date
}

export interface StackingPlan {
  businessId: string;
  generatedAt: string;
  recommendations: CardRecommendation[];
  excludedCards: ExcludedCardInfo[];
  totalEstimatedCreditMin: number;
  totalEstimatedCreditMax: number;
  totalEstimatedCreditTypical: number;
  velocityRiskScore: number;       // 0–100
  velocityRiskLevel: 'low' | 'medium' | 'high';
  aprExpirySummary: AprExpirySummary[];
  prioritizationMode: PrioritizationMode;
  cardCount: number;
}

// ── Scoring helpers ──────────────────────────────────────────

interface ApplicationContext {
  ficoScore: number;
  annualRevenue: number;
  businessAgeMonths: number;
  recentInquiries: number;
  existingCardCount: number;
  existingIssuers: Set<string>;
  recentAppDates: Date[];
}

function buildApplicationContext(
  business: {
    annualRevenue: { toNumber: () => number } | null;
    dateOfFormation: Date | null;
    cardApplications: Array<{
      issuer: string;
      status: string;
      submittedAt: Date | null;
    }>;
    creditProfiles: Array<{
      score: number | null;
      inquiryCount: number | null;
      pulledAt: Date;
    }>;
  },
): ApplicationContext {
  // Get best FICO from most recent credit profile
  const sortedProfiles = [...business.creditProfiles].sort(
    (a, b) => b.pulledAt.getTime() - a.pulledAt.getTime(),
  );
  const latestProfile = sortedProfiles[0];
  const ficoScore = latestProfile?.score ?? 680; // default assumption

  const annualRevenue = business.annualRevenue?.toNumber() ?? 0;

  // Compute business age in months
  const now = new Date();
  let businessAgeMonths = 24; // default assumption
  if (business.dateOfFormation) {
    const diffMs = now.getTime() - business.dateOfFormation.getTime();
    businessAgeMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  }

  const recentInquiries = latestProfile?.inquiryCount ?? 0;

  // Existing cards
  const activeApps = business.cardApplications.filter(
    (a) => a.status === 'approved' || a.status === 'active',
  );
  const existingIssuers = new Set(activeApps.map((a) => a.issuer.toLowerCase()));

  // Recent application dates (past 90 days)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const recentAppDates = business.cardApplications
    .filter((a) => a.submittedAt && a.submittedAt >= ninetyDaysAgo)
    .map((a) => a.submittedAt!);

  return {
    ficoScore,
    annualRevenue,
    businessAgeMonths,
    recentInquiries,
    existingCardCount: activeApps.length,
    existingIssuers,
    recentAppDates,
  };
}

function scoreCard(
  card: {
    scoreMinimum: number;
    revenueMinimum: { toNumber: () => number };
    businessAgeMinimum: number;
    creditLimitTypical: number;
    aprIntro: { toNumber: () => number } | null;
    aprIntroMonths: number | null;
    aprPostPromo: { toNumber: () => number } | null;
    annualFee: { toNumber: () => number };
    approvalDifficulty: string;
  },
  ctx: ApplicationContext,
): number {
  let score = 0;

  // 1. Credit score match (0–35 pts)
  const ficoGap = ctx.ficoScore - card.scoreMinimum;
  if (ficoGap >= 80) score += 35;
  else if (ficoGap >= 50) score += 30;
  else if (ficoGap >= 20) score += 22;
  else if (ficoGap >= 0) score += 15;
  else if (ficoGap >= -20) score += 5;
  // else: 0

  // 2. Business age match (0–15 pts)
  const ageGap = ctx.businessAgeMonths - card.businessAgeMinimum;
  if (ageGap >= 24) score += 15;
  else if (ageGap >= 12) score += 12;
  else if (ageGap >= 6) score += 8;
  else if (ageGap >= 0) score += 5;
  // else: 0

  // 3. Revenue match (0–15 pts)
  const revMin = card.revenueMinimum.toNumber();
  if (revMin <= 0 || ctx.annualRevenue >= revMin * 2) score += 15;
  else if (ctx.annualRevenue >= revMin * 1.5) score += 12;
  else if (ctx.annualRevenue >= revMin) score += 8;
  else if (ctx.annualRevenue >= revMin * 0.8) score += 3;

  // 4. Velocity risk (0–20 pts, higher = less risk)
  const recentAppsCount = ctx.recentAppDates.length;
  if (recentAppsCount === 0) score += 20;
  else if (recentAppsCount <= 1) score += 15;
  else if (recentAppsCount <= 2) score += 10;
  else if (recentAppsCount <= 3) score += 5;

  // 5. Intro APR bonus (0–10 pts)
  if (card.aprIntro !== null && card.aprIntro.toNumber() === 0 && card.aprIntroMonths) {
    score += Math.min(10, Math.round((card.aprIntroMonths / 15) * 10));
  }

  // 6. Approval difficulty adjustment (0–5 pts)
  const difficultyBonus: Record<string, number> = {
    easy: 5,
    moderate: 3,
    hard: 1,
    very_hard: 0,
  };
  score += difficultyBonus[card.approvalDifficulty] ?? 2;

  return Math.min(100, Math.max(0, score));
}

function getVelocityRisk(
  ctx: ApplicationContext,
  sequencePosition: number,
): 'low' | 'medium' | 'high' {
  const totalApps = ctx.recentAppDates.length + sequencePosition;
  if (totalApps <= 2) return 'low';
  if (totalApps <= 4) return 'medium';
  return 'high';
}

function getCooldownDays(
  issuer: string,
  sequencePosition: number,
  _ctx: ApplicationContext,
): number {
  if (sequencePosition === 1) return 0;

  // Issuer-specific cooldowns
  const issuerCooldowns: Record<string, number> = {
    chase: 30,
    amex: 90,     // 2/90 velocity
    citi: 8,      // 1/8 rule
    capital_one: 180,
    bank_of_america: 60,
    us_bank: 30,
    wells_fargo: 30,
    discover: 30,
    td_bank: 30,
    pnc: 30,
  };

  const baseCooldown = issuerCooldowns[issuer.toLowerCase()] ?? 30;

  // Add extra buffer for later positions
  if (sequencePosition > 4) return baseCooldown + 30;
  if (sequencePosition > 2) return baseCooldown + 14;
  return baseCooldown;
}

function sortByPrioritization(
  recs: CardRecommendation[],
  mode: PrioritizationMode,
): CardRecommendation[] {
  const sorted = [...recs];

  switch (mode) {
    case 'max_credit':
      sorted.sort((a, b) => b.estimatedLimitTypical - a.estimatedLimitTypical);
      break;
    case 'best_terms':
      sorted.sort((a, b) => {
        // Prefer 0% intro APR, then longer intro period, then lower post-promo
        const aIntro = a.aprIntro === 0 ? 1 : 0;
        const bIntro = b.aprIntro === 0 ? 1 : 0;
        if (aIntro !== bIntro) return bIntro - aIntro;
        if ((a.aprIntroMonths ?? 0) !== (b.aprIntroMonths ?? 0))
          return (b.aprIntroMonths ?? 0) - (a.aprIntroMonths ?? 0);
        return (a.aprPostPromo ?? 99) - (b.aprPostPromo ?? 99);
      });
      break;
    case 'fastest_approval':
      sorted.sort((a, b) => {
        const difficultyOrder: Record<string, number> = {
          easy: 0,
          moderate: 1,
          hard: 2,
          very_hard: 3,
        };
        return (difficultyOrder[a.approvalDifficulty] ?? 2) -
               (difficultyOrder[b.approvalDifficulty] ?? 2);
      });
      break;
    case 'min_inquiries':
      // Prefer cards from issuers already held (no new inquiry needed)
      // then by eligibility score descending
      sorted.sort((a, b) => b.eligibilityScore - a.eligibilityScore);
      break;
  }

  return sorted;
}

// ── Main function ────────────────────────────────────────────

export async function runStackingOptimizer(
  input: StackingOptimizerInput,
): Promise<StackingPlan> {
  const {
    businessId,
    targetAmount = 100000,
    maxCards = 8,
    prioritize = 'max_credit',
    excludeIssuers = [],
    includeCreditUnions: _includeCreditUnions = false,
  } = input;

  // 1. Load client data
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: {
      creditProfiles: { orderBy: { pulledAt: 'desc' }, take: 5 },
      cardApplications: true,
    },
  });

  // 2. Build application context
  const ctx = buildApplicationContext(business);

  // 3. Load all active card products
  const allCards = await prisma.cardProduct.findMany({
    where: { isActive: true },
  });

  // 4. Score, filter, and rank
  const excludeSet = new Set(excludeIssuers.map((i) => i.toLowerCase()));
  const recommendations: CardRecommendation[] = [];
  const excludedCards: ExcludedCardInfo[] = [];

  for (const card of allCards) {
    const issuerLower = card.issuerId.toLowerCase();

    // Excluded issuers
    if (excludeSet.has(issuerLower)) {
      excludedCards.push({
        cardProductId: card.id,
        issuer: card.issuerId,
        name: card.name,
        reason: `Issuer "${card.issuerId}" excluded by request.`,
      });
      continue;
    }

    // Score minimum check
    if (ctx.ficoScore < card.scoreMinimum - 30) {
      excludedCards.push({
        cardProductId: card.id,
        issuer: card.issuerId,
        name: card.name,
        reason: `FICO score ${ctx.ficoScore} is below minimum requirement ${card.scoreMinimum}.`,
      });
      continue;
    }

    // Revenue minimum check
    const revMin = card.revenueMinimum.toNumber();
    if (revMin > 0 && ctx.annualRevenue < revMin * 0.5) {
      excludedCards.push({
        cardProductId: card.id,
        issuer: card.issuerId,
        name: card.name,
        reason: `Annual revenue $${ctx.annualRevenue.toLocaleString()} is significantly below minimum $${revMin.toLocaleString()}.`,
      });
      continue;
    }

    // Business age check
    if (card.businessAgeMinimum > 0 && ctx.businessAgeMonths < card.businessAgeMinimum * 0.5) {
      excludedCards.push({
        cardProductId: card.id,
        issuer: card.issuerId,
        name: card.name,
        reason: `Business age ${ctx.businessAgeMonths} months is below minimum ${card.businessAgeMinimum} months.`,
      });
      continue;
    }

    const eligibilityScore = scoreCard(card, ctx);

    recommendations.push({
      cardProductId: card.id,
      issuer: card.issuerId,
      name: card.name,
      cardType: card.cardType,
      eligibilityScore,
      estimatedLimitMin: card.creditLimitMin,
      estimatedLimitMax: card.creditLimitMax,
      estimatedLimitTypical: card.creditLimitTypical,
      approvalDifficulty: card.approvalDifficulty,
      aprIntro: card.aprIntro?.toNumber() ?? null,
      aprIntroMonths: card.aprIntroMonths,
      aprPostPromo: card.aprPostPromo?.toNumber() ?? null,
      annualFee: card.annualFee.toNumber(),
      rewardsType: card.rewardsType,
      rewardsRate: card.rewardsRate?.toNumber() ?? null,
      rewardsDetails: card.rewardsDetails,
      welcomeBonus: card.welcomeBonus,
      welcomeBonusValue: card.welcomeBonusValue?.toNumber() ?? null,
      personalGuarantee: card.personalGuarantee,
      bestFor: card.bestFor,
      sequencePosition: 0,
      cooldownDays: 0,
      rationale: '',
      velocityRisk: 'low',
    });
  }

  // 5. Sort by prioritization mode
  const sorted = sortByPrioritization(recommendations, prioritize);

  // 6. Select top N and assign sequencing
  const topN = sorted.slice(0, maxCards);
  let cumulativeCredit = 0;
  const finalRecs: CardRecommendation[] = [];

  for (let i = 0; i < topN.length; i++) {
    const rec = topN[i];
    const seqPos = i + 1;

    rec.sequencePosition = seqPos;
    rec.cooldownDays = getCooldownDays(rec.issuer, seqPos, ctx);
    rec.velocityRisk = getVelocityRisk(ctx, seqPos);
    rec.rationale = buildRationale(rec, ctx);

    finalRecs.push(rec);
    cumulativeCredit += rec.estimatedLimitTypical;

    // Stop if we've exceeded target (with 10% buffer)
    if (targetAmount > 0 && cumulativeCredit >= targetAmount * 1.1) break;
  }

  // 7. Compute velocity risk score
  const velocityRiskScore = computeVelocityRiskScore(ctx, finalRecs.length);
  const velocityRiskLevel: 'low' | 'medium' | 'high' =
    velocityRiskScore <= 30 ? 'low' : velocityRiskScore <= 60 ? 'medium' : 'high';

  // 8. APR expiry summary
  const aprExpirySummary: AprExpirySummary[] = [];
  const now = new Date();
  let cumulativeCooldown = 0;
  for (const rec of finalRecs) {
    if (rec.aprIntro !== null && rec.aprIntro === 0 && rec.aprIntroMonths) {
      cumulativeCooldown += rec.cooldownDays;
      const applicationDate = new Date(now.getTime() + cumulativeCooldown * 24 * 60 * 60 * 1000);
      const expiryDate = new Date(applicationDate);
      expiryDate.setMonth(expiryDate.getMonth() + rec.aprIntroMonths);

      aprExpirySummary.push({
        cardName: rec.name,
        introMonths: rec.aprIntroMonths,
        expiryEstimate: expiryDate.toISOString(),
      });
    }
  }

  return {
    businessId,
    generatedAt: now.toISOString(),
    recommendations: finalRecs,
    excludedCards,
    totalEstimatedCreditMin: finalRecs.reduce((s, r) => s + r.estimatedLimitMin, 0),
    totalEstimatedCreditMax: finalRecs.reduce((s, r) => s + r.estimatedLimitMax, 0),
    totalEstimatedCreditTypical: finalRecs.reduce((s, r) => s + r.estimatedLimitTypical, 0),
    velocityRiskScore,
    velocityRiskLevel,
    aprExpirySummary,
    prioritizationMode: prioritize,
    cardCount: finalRecs.length,
  };
}

function computeVelocityRiskScore(ctx: ApplicationContext, newCardCount: number): number {
  let score = 0;

  // Base risk from recent applications
  score += ctx.recentAppDates.length * 12;

  // Risk from new applications planned
  score += newCardCount * 8;

  // High inquiry count penalty
  if (ctx.recentInquiries > 5) score += 15;
  else if (ctx.recentInquiries > 3) score += 8;

  // Existing card count (more cards = more issuer scrutiny)
  if (ctx.existingCardCount > 6) score += 10;
  else if (ctx.existingCardCount > 3) score += 5;

  return Math.min(100, Math.max(0, score));
}

function buildRationale(rec: CardRecommendation, ctx: ApplicationContext): string {
  const parts: string[] = [];

  // Score alignment
  if (rec.eligibilityScore >= 80) {
    parts.push('Strong eligibility match for your profile.');
  } else if (rec.eligibilityScore >= 60) {
    parts.push('Good eligibility match with moderate approval odds.');
  } else {
    parts.push('Marginal match — consider strengthening profile before applying.');
  }

  // APR window
  if (rec.aprIntro === 0 && rec.aprIntroMonths) {
    parts.push(`${rec.aprIntroMonths}-month 0% intro APR provides a solid funding window.`);
  }

  // Credit limit
  if (rec.estimatedLimitTypical > 0) {
    parts.push(`Typical credit limit: $${rec.estimatedLimitTypical.toLocaleString()}.`);
  }

  // Velocity warning
  if (rec.velocityRisk === 'high') {
    parts.push('High velocity risk — space this application at least 30 days from prior apps.');
  } else if (rec.velocityRisk === 'medium') {
    parts.push('Moderate velocity risk — monitor inquiry count.');
  }

  // Sequencing
  if (rec.cooldownDays > 0) {
    parts.push(`Wait ${rec.cooldownDays} days after the previous application before applying.`);
  }

  return parts.join(' ');
}
