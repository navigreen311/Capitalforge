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

import { prisma as sharedPrisma } from '../config/database.js';
import logger from '../config/logger.js';
import {
  CREDIT_UNION_MEMBERSHIP,
  isCreditUnionIssuer,
  isCreditUnionIssuerName,
  parseIssuer,
  type CreditUnionIssuerId,
} from '../../shared/constants/issuers.js';

const prisma = sharedPrisma;

// ── Phase 2 input/output types ───────────────────────────────

export type PrioritizationMode =
  | 'max_credit'
  | 'best_terms'
  | 'fastest_approval'
  | 'min_inquiries';

// ── Input provenance ─────────────────────────────────────────
//
// A plan used to be computed from whatever the database happened to hold,
// falling back to constants written into this file: FICO 680, business age 24
// months, zero inquiries. Nothing said so. An advisor who typed a FICO of 745
// into the form got a plan built on 680 and no indication the number had been
// ignored, because the form was never sent.
//
// Every input now carries where it came from, and any value that fell back to
// a constant is named on the plan so the output can say it is an estimate.

export type InputSource =
  /** Typed into the optimizer form by the advisor for this run. */
  | 'advisor_entered'
  /** Read from a credit bureau pull on the client's record. */
  | 'bureau_pull'
  /** Read from the client record, but not from a bureau (revenue, formation date). */
  | 'client_record'
  /** Nothing supplied it. A constant in this file was used. */
  | 'assumed_default';

export interface ResolvedInput<T> {
  value: T;
  source: InputSource;
  /** When the source is a bureau pull: when that pull happened. */
  pulledAt?: string;
  /** Human-readable field name, for the banner and the "Inputs Used" panel. */
  label: string;
  /**
   * Where a single source label would misrepresent the value.
   *
   * Existing cards come from two places at once — the form and the client's
   * approved applications — and naming only one of them made a true number
   * look like a contradiction against the exclusion it drove.
   */
  detail?: string;
  /**
   * Whether this value reached the scorer at all.
   *
   * Six inputs are collected, transmitted, accepted by the request schema and
   * never read: the three business credit scores, employee count, the 24-month
   * inquiry figure, and derogatory marks. Reporting them beside the five that
   * do decide the plan made the panel vouch for them — and for derogatory
   * marks it did so as `advisor_entered`, which states outright that a value
   * the advisor supplied was used. A provenance panel that vouches for an
   * unused input is worse than none, because it turns a quiet omission into an
   * explicit false claim.
   *
   * Carried on the record rather than derived at render, so a plan read in six
   * months still says which of its inputs were decorative — the set will change
   * as fields are wired, and a plan should report the system that produced it
   * rather than the system reading it.
   */
  influencesPlan: boolean;
}

export interface InputProvenance {
  ficoScore: ResolvedInput<number>;
  annualRevenue: ResolvedInput<number>;
  businessAgeMonths: ResolvedInput<number>;
  recentInquiries: ResolvedInput<number>;
  derogatoryMarks: ResolvedInput<number>;
  existingCardCount: ResolvedInput<number>;
  /**
   * Inputs the form collects that the scorer does not read.
   *
   * Present so the panel can show them rather than omit them: an advisor who
   * typed a PAYDEX of 72 will look for it, and finding nothing is its own kind
   * of confusion. Every entry here has influencesPlan false.
   */
  collectedNotUsed: ResolvedInput<number | null>[];
  /** Labels of every input that fell back to a constant. */
  assumedDefaults: string[];
  /** True when the plan rests on at least one assumed value. */
  hasAssumedDefaults: boolean;
}

/** A card the client already holds, as reported by the form. */
export interface SuppliedExistingCard {
  /** Card product id where the form knows it; otherwise null. */
  cardProductId?: string | null;
  issuer?: string | null;
  name?: string | null;
  creditLimit?: number | null;
}

/**
 * Profile values supplied by the advisor for this run.
 *
 * Every field is optional. A field that is absent falls back to the client
 * record, and then to a constant — and the plan records which of the three
 * actually supplied it.
 */
export interface SuppliedProfile {
  ficoScore?: number | null;
  annualRevenue?: number | null;
  businessAgeMonths?: number | null;
  inquiries6mo?: number | null;
  inquiries12mo?: number | null;
  inquiries24mo?: number | null;
  derogatoryMarks?: number | null;
  employees?: number | null;
  dnbPaydex?: number | null;
  experianBis?: number | null;
  ficoSbss?: number | null;
}

export interface StackingOptimizerInput {
  businessId: string;
  targetAmount?: number;
  maxCards?: number;
  prioritize?: PrioritizationMode;
  excludeIssuers?: string[];
  includeCreditUnions?: boolean;
  /** Values typed into the optimizer form. Take precedence over the record. */
  profile?: SuppliedProfile;
  /** Cards the form says the client already holds. */
  existingCards?: SuppliedExistingCard[];
  /** What the advisor recorded about credit union standing. */
  creditUnionEligibility?: CreditUnionEligibility;
  /**
   * Most credit union cards to recommend. Separate from `maxCards` because
   * each is a membership and a hard pull, not just another application.
   */
  maxCreditUnionCards?: number;
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
  /** Whether cooldownDays reflects a published issuer rule or a bare default. */
  cooldownSource: CooldownSource;
  /**
   * For credit union cards: whether the client can actually apply.
   * Absent for bank cards, which have no membership requirement.
   */
  membership?: MembershipAssessment;
  /** How this card is treated by Chase 5/24. */
  velocityTreatment: VelocityTreatment;
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

/**
 * How a recommended card is treated by Chase 5/24.
 *
 * Reported per card because the exemption fires per card, and because three
 * situations otherwise look identical on the output: a credit union card
 * counted (the bug this replaces), a credit union card exempted (correct), and
 * a card no rule looked at. An exemption that shows up only as a smaller number
 * is indistinguishable from cards being skipped.
 */
export type VelocityTreatment =
  /** A bank card. Counts towards the five. */
  | 'counts_toward_5_24'
  /** A credit union card. Does not count — the reason to reach for one. */
  | 'exempt_from_5_24'
  /** The issuer could not be identified, so no treatment was decided. */
  | 'not_evaluated';

export interface VelocitySummary {
  /** Cards in this plan that Chase will see. */
  cardsCountingToward524: number;
  /** Cards exempted. Zero here with credit unions in the plan means the
   *  exemption is not firing — the check that distinguishes it from skipping. */
  cardsExemptFrom524: number;
  /** Cards no rule evaluated. Must not read as cards that passed. */
  cardsNotEvaluated: number;
  /** Slots left under 5/24 before this plan. */
  chase524HeadroomBefore: number;
  /**
   * Slots left after it. Negative when the plan goes past the limit.
   *
   * Deliberately signed. This was clamped at zero, so a plan seventeen cards
   * deep against a limit of five reported "0" — technically true and badly
   * understated, reading as "at the limit" rather than "twelve past it and not
   * executable as sequenced".
   */
  chase524HeadroomAfter: number;
  /** Cards past the Chase limit. Zero when the plan fits. */
  chase524Overage: number;
  /** True when the plan cannot be executed as sequenced under 5/24. */
  exceedsChase524: boolean;
  /** Bank cards opened in the trailing 24 months, from the client's record. */
  existingBankCardsInWindow: number;
  /** Credit union cards in that window, excluded from the count above. */
  existingCreditUnionCardsInWindow: number;
}

export interface CapacityBreakdown {
  /** What was asked for. A goal, not a ceiling. */
  targetAmount: number;
  /** Typical estimated credit from bank cards. */
  bankEstimatedCredit: number;
  /** Typical estimated credit from credit union cards. */
  creditUnionEstimatedCredit: number;
  /** Unmet by banks alone. Zero when the banks reached the target. */
  shortfallAfterBanks: number;
  /** Still unmet once credit unions are counted. */
  remainingShortfall: number;
  /** Whether credit unions were considered at all. */
  creditUnionsIncluded: boolean;
  /** The separate cap on credit union cards. */
  creditUnionCardLimit: number;
  bankCardCount: number;
  creditUnionCardCount: number;
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
  /** What each input was, and where it came from. */
  inputProvenance: InputProvenance;
  /** How the plan sits against Chase 5/24, and which cards are exempt. */
  velocitySummary: VelocitySummary;
  /**
   * How far the plan gets towards the target, and on whose capacity.
   *
   * The single `totalEstimatedCredit*` figures blend banks and credit unions,
   * which hides the question the advisor is actually asking: did the banks
   * cover it, and if not, what closes the gap.
   */
  capacity: CapacityBreakdown;
}

// ── Scoring helpers ──────────────────────────────────────────

interface ApplicationContext {
  ficoScore: number;
  annualRevenue: number;
  businessAgeMonths: number;
  recentInquiries: number;
  existingCardCount: number;
  /**
   * Products the client already holds, as normalised identity keys.
   *
   * This was `existingIssuers`, a set of issuer names — and nothing in the
   * filter loop ever read it. A client holding a Chase Ink Preferred was
   * recommended a Chase Ink Preferred.
   */
  heldProductKeys: Set<string>;
  /** Bank cards approved in the trailing 24 months. Drives Chase 5/24. */
  bankCardsInWindow: number;
  /** Credit union cards in that window. Excluded from 5/24 by the exemption. */
  creditUnionCardsInWindow: number;
  recentAppDates: Date[];
}

/**
 * The constants this file falls back to when nothing supplies a value.
 *
 * They were previously written inline as `?? 680`, `?? 24`, `?? 0`, which made
 * a plan built on assumptions indistinguishable from one built on a credit
 * pull. Named here so they can be recorded on the plan and shown to the
 * person reading it.
 */
/** Chase 5/24: five cards in twenty-four months. */
const CHASE_524_LIMIT = 5;

const ASSUMED = {
  ficoScore: 680,
  annualRevenue: 0,
  businessAgeMonths: 24,
  recentInquiries: 0,
  derogatoryMarks: 0,
} as const;

/**
 * Pick a value by precedence and record which source supplied it.
 *
 * advisor_entered → the record → the constant. A supplied value of `0` is a
 * real answer and must win over the record, so this tests for null/undefined
 * rather than falsiness.
 */
function resolveInput(args: {
  label: string;
  supplied: number | null | undefined;
  recorded: number | null | undefined;
  recordedSource: Extract<InputSource, 'bureau_pull' | 'client_record'>;
  pulledAt?: Date | null;
  fallback: number;
}): ResolvedInput<number> {
  const { label, supplied, recorded, recordedSource, pulledAt, fallback } = args;

  if (supplied !== null && supplied !== undefined && Number.isFinite(supplied)) {
    return { value: supplied, source: 'advisor_entered', label, influencesPlan: true };
  }
  if (recorded !== null && recorded !== undefined && Number.isFinite(recorded)) {
    return {
      value: recorded,
      source: recordedSource,
      label,
      influencesPlan: true,
      ...(recordedSource === 'bureau_pull' && pulledAt
        ? { pulledAt: pulledAt.toISOString() }
        : {}),
    };
  }
  return { value: fallback, source: 'assumed_default', label, influencesPlan: true };
}

// ── Credit union membership ──────────────────────────────────

export type MembershipStatus =
  /** The client is already a member. */
  | 'member'
  /** Not a member, but a route to joining exists. Joining is a prerequisite. */
  | 'eligibility_path'
  /** Nothing on file says whether they qualify. Not the same as eligible. */
  | 'unknown'
  /** A requirement exists and the client demonstrably does not meet it. */
  | 'ineligible';

export interface MembershipAssessment {
  status: MembershipStatus;
  /** Shown with the recommendation. Says what joining requires. */
  detail: string;
  /**
   * Whether joining is a formality or a qualification.
   *
   * "Requires joining first" covered both a $5 donation and having served in
   * the military, which are not the same fact to carry to a client. An advisor
   * can act on the first in the meeting; the second decides whether the card
   * is available at all.
   */
  gate?: 'open_enrollment' | 'qualification_required';
  /** Approximate cost of joining, where enrollment is open. */
  joinCost?: number;
}

/** What the advisor told us about the client's credit union standing. */
export interface CreditUnionEligibility {
  /** Two-letter state of residence. */
  state?: string | null;
  militaryStatus?: 'active' | 'retired' | 'veteran' | 'family' | 'none' | null;
  employer?: string | null;
  techIndustry?: boolean | null;
  /** Issuer ids of credit unions the client already belongs to. */
  existingMemberships?: string[] | null;
}

/**
 * Decide whether a credit union card can be applied for.
 *
 * The rule this enforces: an advisor must never carry a recommendation to a
 * client and find it requires a membership they cannot get. So a card is only
 * recommended when the client is a member, or when a specific route to joining
 * is named alongside it.
 *
 * Absent information is reported as unknown rather than resolved in the card's
 * favour, for the same reason an assumed FICO is labelled rather than trusted.
 */
export function assessMembership(
  issuerId: CreditUnionIssuerId,
  eligibility?: CreditUnionEligibility,
): MembershipAssessment {
  const path = CREDIT_UNION_MEMBERSHIP[issuerId];
  if (!path) {
    return {
      status: 'unknown',
      detail: 'No membership requirement is recorded for this credit union. Verify before presenting.',
    };
  }

  // Through the parse boundary rather than a hand-rolled replace. The frontend
  // list spells these with hyphens and without the `_cu` suffix, so
  // `lake-michigan` normalised to `lake_michigan` and matched no issuer — a
  // client who was already a member was told to join.
  const memberships = new Set(
    (eligibility?.existingMemberships ?? [])
      .map((m) => parseIssuer(m)?.id)
      .filter((id): id is NonNullable<typeof id> => id !== undefined),
  );
  if (memberships.has(issuerId)) {
    return { status: 'member', detail: 'Client is already a member.' };
  }

  switch (path.kind) {
    case 'open':
      // Anyone can join, so the path is certain — but it is still a step the
      // client has to take before applying.
      return {
        status: 'eligibility_path',
        gate: 'open_enrollment',
        joinCost: path.cost,
        detail: path.description,
      };

    case 'state': {
      const state = eligibility?.state?.trim().toUpperCase();
      if (!state) {
        return {
          status: 'unknown',
          detail: `Membership depends on state of residence, which is not recorded. ${path.description}`,
        };
      }
      if (state !== path.state) {
        return {
          status: 'ineligible',
          detail: `Client is in ${state}. ${path.description}`,
        };
      }
      return {
        status: 'eligibility_path',
        gate: 'qualification_required',
        detail: `Client qualifies on ${state} residency. ${path.description}`,
      };
    }

    case 'industry': {
      if (eligibility?.techIndustry === true) {
        return {
          status: 'eligibility_path',
          gate: 'qualification_required',
          detail: `Client qualifies on technology-industry employment. ${path.description}`,
        };
      }
      if (eligibility?.techIndustry === false) {
        // The association route stays open to anyone, so this is not a refusal.
        return {
          // The association route is open to anyone, so this is enrollment at
          // a price rather than a qualification the client must already meet.
          status: 'eligibility_path',
          gate: 'open_enrollment',
          joinCost: path.cost,
          detail: `Not in the technology industry, so joining goes via the association route. ${path.description}`,
        };
      }
      return {
        status: 'unknown',
        detail: `Membership depends on industry or association, neither recorded. ${path.description}`,
      };
    }

    case 'military': {
      const status = eligibility?.militaryStatus;
      if (!status) {
        return {
          status: 'unknown',
          detail: `Membership depends on military affiliation, which is not recorded. ${path.description}`,
        };
      }
      if (status === 'none') {
        return {
          status: 'ineligible',
          detail: `No military affiliation recorded for this client. ${path.description}`,
        };
      }
      return {
        status: 'eligibility_path',
        gate: 'qualification_required',
        detail: `Client qualifies on ${status} military affiliation. ${path.description}`,
      };
    }
  }
}

// ── Matching a product the client already holds ──────────────
//
// Three sources name the same card three ways. `CardProduct.name` is the full
// product name ("Chase Ink Business Preferred"). `CardApplication` splits it
// into `issuer` ("Chase") and `cardProduct` ("Ink Business Preferred"). The
// optimizer form sends the display name. Comparing any two of those directly
// misses, so each is reduced to the same normalised key.

function normaliseProductName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Every key a stored application could match a catalogue product by. */
function heldKeysForApplication(issuer: string, cardProduct: string): string[] {
  const product = normaliseProductName(cardProduct);
  const withIssuer = normaliseProductName(`${issuer} ${cardProduct}`);
  return [product, withIssuer].filter(Boolean);
}

/** Every key a form-supplied card could match a catalogue product by. */
function heldKeysForSuppliedCard(card: SuppliedExistingCard): string[] {
  const keys: string[] = [];
  if (card.cardProductId) keys.push(`id:${card.cardProductId.trim().toLowerCase()}`);
  if (card.name) {
    keys.push(normaliseProductName(card.name));
    if (card.issuer) keys.push(normaliseProductName(`${card.issuer} ${card.name}`));
  }
  return keys.filter(Boolean);
}

/** True when this catalogue product is one the client already holds. */
function isHeldProduct(
  card: { id: string; issuerId: string; name: string },
  held: Set<string>,
): boolean {
  if (held.has(`id:${card.id.toLowerCase()}`)) return true;
  if (held.has(normaliseProductName(card.name))) return true;
  // The catalogue name usually leads with the issuer; an application's
  // cardProduct usually does not. Compare with the issuer stripped too.
  const issuerWords = card.issuerId.split('_').join(' ');
  const withoutIssuer = card.name.toLowerCase().replace(issuerWords, '');
  return held.has(normaliseProductName(withoutIssuer));
}

/**
 * How many distinct products the client holds across both sources.
 *
 * Deduplicated, because the same card can arrive twice — ticked on the form and
 * present as an approved application — and reporting two would overstate what
 * the exclusion is acting on.
 */
function countDistinctHeldProducts(
  activeApps: Array<{ issuer: string; cardProduct: string }>,
  supplied?: SuppliedExistingCard[],
): number {
  const seen = new Set<string>();
  for (const a of activeApps) seen.add(normaliseProductName(a.cardProduct));
  for (const card of supplied ?? []) {
    if (card.name) seen.add(normaliseProductName(card.name));
    else if (card.cardProductId) seen.add(`id:${card.cardProductId.toLowerCase()}`);
  }
  return seen.size;
}

function buildApplicationContext(
  business: {
    annualRevenue: { toNumber: () => number } | null;
    dateOfFormation: Date | null;
    cardApplications: Array<{
      issuer: string;
      cardProduct: string;
      status: string;
      submittedAt: Date | null;
    }>;
    creditProfiles: Array<{
      score: number | null;
      inquiryCount: number | null;
      derogatoryCount?: number | null;
      pulledAt: Date;
    }>;
  },
  supplied?: SuppliedProfile,
  suppliedExistingCards?: SuppliedExistingCard[],
): ApplicationContext & { provenance: InputProvenance } {
  // Get best FICO from most recent credit profile
  const sortedProfiles = [...business.creditProfiles].sort(
    (a, b) => b.pulledAt.getTime() - a.pulledAt.getTime(),
  );
  const latestProfile = sortedProfiles[0];

  // Each of these used to be a bare `?? constant`. The constant is still the
  // last resort, but it is now recorded rather than silently substituted —
  // see `resolveInput`.
  const ficoResolved = resolveInput({
    label: 'FICO score',
    supplied: supplied?.ficoScore,
    recorded: latestProfile?.score ?? null,
    recordedSource: 'bureau_pull',
    pulledAt: latestProfile?.pulledAt,
    fallback: ASSUMED.ficoScore,
  });
  const ficoScore = ficoResolved.value;

  const revenueResolved = resolveInput({
    label: 'Annual revenue',
    supplied: supplied?.annualRevenue,
    recorded: business.annualRevenue?.toNumber() ?? null,
    recordedSource: 'client_record',
    fallback: ASSUMED.annualRevenue,
  });
  const annualRevenue = revenueResolved.value;

  // Compute business age in months
  const now = new Date();
  let recordedAgeMonths: number | null = null;
  if (business.dateOfFormation) {
    const diffMs = now.getTime() - business.dateOfFormation.getTime();
    recordedAgeMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  }
  const ageResolved = resolveInput({
    label: 'Business age',
    supplied: supplied?.businessAgeMonths,
    recorded: recordedAgeMonths,
    recordedSource: 'client_record',
    fallback: ASSUMED.businessAgeMonths,
  });
  const businessAgeMonths = ageResolved.value;

  // The form collects three windows; the scorer wants recent inquiries, so
  // the 12-month figure is what it means. 6-month is used when 12 is absent
  // rather than treating a partial answer as none.
  const inquiriesResolved = resolveInput({
    label: 'Inquiry history',
    supplied: supplied?.inquiries12mo ?? supplied?.inquiries6mo,
    recorded: latestProfile?.inquiryCount ?? null,
    recordedSource: 'bureau_pull',
    pulledAt: latestProfile?.pulledAt,
    fallback: ASSUMED.recentInquiries,
  });
  const recentInquiries = inquiriesResolved.value;

  // Collected, reported, and not read by the scorer. Marked rather than hidden:
  // the field exists, an advisor fills it in, and the panel should say what
  // became of it.
  const derogResolved = resolveInput({
    label: 'Derogatory marks',
    supplied: supplied?.derogatoryMarks,
    recorded: latestProfile?.derogatoryCount ?? null,
    recordedSource: 'bureau_pull',
    pulledAt: latestProfile?.pulledAt,
    fallback: ASSUMED.derogatoryMarks,
  });

  // Existing cards
  const activeApps = business.cardApplications.filter(
    (a) => a.status === 'approved' || a.status === 'active',
  );
  // Approved or active applications are cards the client holds. Drafts are
  // not: a draft is an intention, and excluding on it would hide a product the
  // client has not got.
  const heldProductKeys = new Set<string>();
  for (const a of activeApps) {
    for (const key of heldKeysForApplication(a.issuer, a.cardProduct)) {
      heldProductKeys.add(key);
    }
  }
  // Cards the advisor ticked on the form. The client holds these whether or
  // not an application record exists — most predate this system.
  for (const card of suppliedExistingCards ?? []) {
    for (const key of heldKeysForSuppliedCard(card)) heldProductKeys.add(key);
  }

  // Recent application dates (past 90 days)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const recentAppDates = business.cardApplications
    .filter((a) => a.submittedAt && a.submittedAt >= ninetyDaysAgo)
    .map((a) => a.submittedAt!);

  // Chase 5/24 counts cards opened in the trailing 24 months, from every bank.
  // Credit union applications are exempt — the whole strategic reason to reach
  // for one once bank velocity is spent. Counting them was the inverse of the
  // rule; see docs/gaps.md 1b.
  const twentyFourMonthsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
  const approvedInWindow = business.cardApplications.filter(
    (a) =>
      (a.status === 'approved' || a.status === 'active') &&
      a.submittedAt !== null &&
      a.submittedAt >= twentyFourMonthsAgo,
  );
  const creditUnionCardsInWindow = approvedInWindow.filter((a) =>
    isCreditUnionIssuerName(a.issuer),
  ).length;
  const bankCardsInWindow = approvedInWindow.length - creditUnionCardsInWindow;

  // Report the union the exclusion actually used, not one half of it.
  //
  // This said "Existing cards: 0 [client_record]" — the count of approved
  // applications — while the filter loop excluded a card the advisor had ticked
  // on the form. Both were true and the pair read as a contradiction: the panel
  // that exists so inputs can be trusted was producing exactly the confusion it
  // was built to prevent.
  //
  // The number is now the distinct products the exclusion will act on, and the
  // sources are named. `advisor_entered` when the form supplied any, because
  // that is the input an advisor would look for and not find.
  const suppliedCount = (suppliedExistingCards ?? []).length;
  const heldProductCount = countDistinctHeldProducts(activeApps, suppliedExistingCards);
  const existingCountResolved: ResolvedInput<number> = {
    influencesPlan: true,
    label: 'Existing cards',
    value: heldProductCount,
    source: suppliedCount > 0 ? 'advisor_entered' : 'client_record',
    detail:
      suppliedCount > 0 && activeApps.length > 0
        ? `${suppliedCount} entered on the form, ${activeApps.length} from approved applications`
        : suppliedCount > 0
          ? `${suppliedCount} entered on the form; no approved applications on record`
          : `${activeApps.length} from approved applications; none entered on the form`,
  };

  const fields = [
    ficoResolved,
    revenueResolved,
    ageResolved,
    inquiriesResolved,
    derogResolved,
    existingCountResolved,
  ];
  // Only inputs that actually decide the plan can make it an estimate.
  // Derogatory marks falls back to a default like the others, but the scorer
  // never reads it — listing it in the banner would say the plan rests on an
  // assumption it does not use, and a banner that overstates is one people
  // learn to skip.
  const assumedDefaults = fields
    .filter((f) => f.source === 'assumed_default' && f.label !== 'Derogatory marks')
    .map((f) => f.label);

  // The scorer reads ficoScore, annualRevenue, businessAgeMonths,
  // recentInquiries and the held-product set. Everything else the form sends
  // is recorded here so the panel can show it as collected-and-unused rather
  // than omit it, which would leave an advisor looking for a value they typed.
  const collectedNotUsed: ResolvedInput<number | null>[] = [
    { label: 'D&B PAYDEX', value: supplied?.dnbPaydex ?? null },
    { label: 'Experian Intelliscore', value: supplied?.experianBis ?? null },
    { label: 'FICO SBSS', value: supplied?.ficoSbss ?? null },
    { label: 'Employees', value: supplied?.employees ?? null },
    { label: 'Inquiries (24 months)', value: supplied?.inquiries24mo ?? null },
  ].map((f) => ({
    ...f,
    source: (f.value === null ? 'client_record' : 'advisor_entered') as InputSource,
    influencesPlan: false,
  }));

  const provenance: InputProvenance = {
    ficoScore: ficoResolved,
    annualRevenue: revenueResolved,
    businessAgeMonths: ageResolved,
    recentInquiries: inquiriesResolved,
    // The scorer does not read this one. Reported as advisor_entered before
    // this flag existed, which stated that a value the advisor supplied had
    // been used.
    derogatoryMarks: { ...derogResolved, influencesPlan: false },
    existingCardCount: existingCountResolved,
    collectedNotUsed,
    assumedDefaults,
    hasAssumedDefaults: assumedDefaults.length > 0,
  };

  return {
    ficoScore,
    annualRevenue,
    businessAgeMonths,
    recentInquiries,
    existingCardCount: activeApps.length,
    heldProductKeys,
    bankCardsInWindow,
    creditUnionCardsInWindow,
    recentAppDates,
    provenance,
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

/**
 * Days to wait before applying, and whether that number is researched.
 *
 * The unresearched ones used to be indistinguishable: every issuer without an
 * entry fell to `?? 30` and was presented exactly like Amex's 90-day 2/90
 * rule. Thirty days for an issuer nobody has looked up is a guess, and a plan
 * should say which of its waits are guesses — the same reason the input
 * provenance panel exists.
 */
export type CooldownSource = 'issuer_rule' | 'unresearched_default';

/** Used when no published velocity rule is on file for the issuer. */
const UNRESEARCHED_COOLDOWN_DAYS = 30;

const ISSUER_COOLDOWNS: Record<string, { days: number; source: CooldownSource }> = {
  // Researched: each reflects a published issuer rule.
  chase:           { days: 30,  source: 'issuer_rule' },  // 2/30 alongside 5/24
  amex:            { days: 90,  source: 'issuer_rule' },  // 2/90 velocity
  citi:            { days: 8,   source: 'issuer_rule' },  // 1/8 rule
  capital_one:     { days: 180, source: 'issuer_rule' },  // one card per 6 months
  bank_of_america: { days: 60,  source: 'issuer_rule' },  // 2/3/4 rule

  // No published velocity rule found for these. The number is the default,
  // and it is marked so the plan can say so rather than implying research
  // that has not happened.
  us_bank:          { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
  wells_fargo:      { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
  discover:         { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
  td_bank:          { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
  pnc:              { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },

  // Credit unions. Listed so they are visibly accounted for rather than
  // absent — but none of their product notes states a velocity rule, only
  // membership eligibility and APR ranges, so none of these is researched.
  alliant:          { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
  becu:             { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
  first_tech:       { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
  lake_michigan_cu: { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
  navy_federal:     { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
  penfed:           { days: UNRESEARCHED_COOLDOWN_DAYS, source: 'unresearched_default' },
};

/**
 * Issuers the cooldown table has an entry for. Exported for the registry
 * completeness test — a missing entry is not an error at runtime, it silently
 * becomes an unresearched 30-day default.
 */
export const ISSUER_COOLDOWN_IDS: readonly string[] = Object.keys(ISSUER_COOLDOWNS);

function getCooldown(
  issuer: string,
  sequencePosition: number,
  _ctx: ApplicationContext,
): { days: number; source: CooldownSource } {
  // The first application waits for nothing, so there is nothing to research.
  if (sequencePosition === 1) return { days: 0, source: 'issuer_rule' };

  const entry = ISSUER_COOLDOWNS[issuer.toLowerCase()] ?? {
    days: UNRESEARCHED_COOLDOWN_DAYS,
    source: 'unresearched_default' as const,
  };

  // Add extra buffer for later positions
  let days = entry.days;
  if (sequencePosition > 4) days = entry.days + 30;
  else if (sequencePosition > 2) days = entry.days + 14;

  return { days, source: entry.source };
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
    includeCreditUnions = false,
    creditUnionEligibility,
    maxCreditUnionCards = 3,
  } = input;

  // 1. Load client data
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: {
      creditProfiles: { orderBy: { pulledAt: 'desc' }, take: 5 },
      cardApplications: true,
    },
  });

  // 2. Build application context, recording where each input came from
  const ctx = buildApplicationContext(business, input.profile, input.existingCards);

  // 3. Load all active card products
  const loadedCards = await prisma.cardProduct.findMany({
    where: { isActive: true },
  });

  // 3b. One row per product, whatever the table holds.
  //
  // Twelve products were duplicated under two ids because the seed derived the
  // primary key from the issuer spelling and two lists spelled it differently.
  // The optimizer returned one of them at rank 1 and rank 2 of the same plan,
  // scored differently, and summed both into the total estimated credit —
  // inflating it by a card that did not exist.
  //
  // The data is now clean and `@@unique([issuerId, name])` stops it recurring.
  // This stays because a plan that recommends the same card twice is wrong in a
  // way that is hard to notice and expensive to act on: the fix belongs where
  // the plan is built, not only where the rows are written.
  const seenProducts = new Set<string>();
  const allCards = loadedCards.filter((card) => {
    const identity = `${card.issuerId.trim().toLowerCase()}::${card.name.trim().toLowerCase()}`;
    if (seenProducts.has(identity)) return false;
    seenProducts.add(identity);
    return true;
  });

  if (allCards.length !== loadedCards.length) {
    logger.warn('[StackingOptimizer] Duplicate card products in catalogue', {
      loaded: loadedCards.length,
      afterDedup: allCards.length,
    });
  }

  // 4. Score, filter, and rank
  const excludeSet = new Set(excludeIssuers.map((i) => i.toLowerCase()));
  const recommendations: CardRecommendation[] = [];
  const excludedCards: ExcludedCardInfo[] = [];
  const membershipByCardId = new Map<string, MembershipAssessment>();

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

    // Already held.
    //
    // Recommending a product the client is already carrying is the clearest
    // possible sign the plan was not built from their position. It also
    // inflates the total estimated credit by a limit they already have.
    if (isHeldProduct(card, ctx.heldProductKeys)) {
      excludedCards.push({
        cardProductId: card.id,
        issuer: card.issuerId,
        name: card.name,
        reason: 'The client already holds this card.',
      });
      continue;
    }

    // Credit unions: only when asked for, and never as though membership
    // were a given.
    // Parsed, not compared. `card.issuerId` is a database string; past this
    // point it is an identity whose kind and id the type system knows.
    const issuerIdentity = parseIssuer(card.issuerId);
    if (issuerIdentity?.kind === 'credit_union') {
      if (!includeCreditUnions) {
        excludedCards.push({
          cardProductId: card.id,
          issuer: card.issuerId,
          name: card.name,
          reason: 'Credit unions are not included in this plan.',
        });
        continue;
      }
      const membership = assessMembership(issuerIdentity.id, creditUnionEligibility);
      if (membership.status === 'ineligible') {
        excludedCards.push({
          cardProductId: card.id,
          issuer: card.issuerId,
          name: card.name,
          reason: membership.detail,
        });
        continue;
      }
      membershipByCardId.set(card.id, membership);
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
      cooldownSource: 'issuer_rule' as CooldownSource,
      velocityTreatment: 'not_evaluated' as VelocityTreatment,
      rationale: '',
      velocityRisk: 'low',
    });
  }

  // 5. Sort by prioritization mode
  const sorted = sortByPrioritization(recommendations, prioritize);

  // 6. Select cards in two passes, and assign sequencing
  //
  // Banks first, to the target. Credit unions afterwards, against whatever the
  // banks left unmet.
  //
  // One pass bounded by a single cap could not do this. Credit union limits are
  // smaller, so those cards sort last under every prioritisation mode, and the
  // loop reached the target and stopped before it got to them — at a realistic
  // target they were unreachable. That inverts why they exist: a client turns
  // to a credit union *because* bank capacity is exhausted, so the cards that
  // extend the stack were exactly the ones being cut.
  //
  // The two passes are also why the plan reports a bank total and a credit
  // union total rather than one blended figure. "$125,000" says nothing about
  // whether the banks fell short, and the shortfall is the thing an advisor is
  // reasoning about.
  const bankPool = sorted.filter((r) => !isCreditUnionIssuer(r.issuer.toLowerCase()));
  const cuPool = sorted.filter((r) => isCreditUnionIssuer(r.issuer.toLowerCase()));

  const finalRecs: CardRecommendation[] = [];
  let bankCredit = 0;
  let creditUnionCredit = 0;

  /** Sequencing, cooldown and rationale are the same whichever pass selected it. */
  const admit = (rec: CardRecommendation): void => {
    const seqPos = finalRecs.length + 1;
    rec.sequencePosition = seqPos;
    const cooldown = getCooldown(rec.issuer, seqPos, ctx);
    rec.cooldownDays = cooldown.days;
    rec.cooldownSource = cooldown.source;
    rec.velocityRisk = getVelocityRisk(ctx, seqPos);
    rec.rationale = buildRationale(rec, ctx);
    const membership = membershipByCardId.get(rec.cardProductId);
    if (membership) rec.membership = membership;

    // Chase 5/24 treatment, decided from the parsed identity rather than a
    // string comparison. `not_evaluated` is kept distinct from "passed": an
    // issuer we cannot name is one no rule looked at, and that must not read
    // as a clean result.
    const identity = parseIssuer(rec.issuer);
    rec.velocityTreatment =
      identity === null
        ? 'not_evaluated'
        : identity.kind === 'credit_union'
          ? 'exempt_from_5_24'
          : 'counts_toward_5_24';

    finalRecs.push(rec);
  };

  // Pass 1 — banks, to the target. targetAmount is a goal, not a ceiling: the
  // 10% buffer overshoots rather than stopping short of it.
  for (const rec of bankPool.slice(0, maxCards)) {
    admit(rec);
    bankCredit += rec.estimatedLimitTypical;
    if (targetAmount > 0 && bankCredit >= targetAmount * 1.1) break;
  }

  const shortfallAfterBanks = Math.max(0, targetAmount - bankCredit);

  // Pass 2 — credit unions, against the shortfall, and separately bounded.
  //
  // Each credit union card is a membership and a hard pull. "Extend the stack"
  // and "join six credit unions" are different recommendations, so the count is
  // capped independently of maxCards rather than sharing its budget.
  if (includeCreditUnions) {
    for (const rec of cuPool.slice(0, maxCreditUnionCards)) {
      admit(rec);
      creditUnionCredit += rec.estimatedLimitTypical;

      // Stop once the gap is closed — but only when there was a gap. Credit
      // unions are considered whenever they are enabled, not only when the
      // banks fall short: Alliant and PenFed cost $5 to join and can beat a
      // marginal bank card on terms, and gating them behind a shortfall would
      // hide the better option from a client who happened to reach target.
      // Extending the stack is the main case, not the only one.
      if (shortfallAfterBanks > 0 && creditUnionCredit >= shortfallAfterBanks) break;
    }
  }

  const remainingShortfall = Math.max(
    0,
    targetAmount - (bankCredit + creditUnionCredit),
  );

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
    inputProvenance: ctx.provenance,
    velocitySummary: (() => {
      const counting = finalRecs.filter((r) => r.velocityTreatment === 'counts_toward_5_24').length;
      const exempt = finalRecs.filter((r) => r.velocityTreatment === 'exempt_from_5_24').length;
      const notEvaluated = finalRecs.filter((r) => r.velocityTreatment === 'not_evaluated').length;
      const headroomBefore = Math.max(0, CHASE_524_LIMIT - ctx.bankCardsInWindow);
      return {
        cardsCountingToward524: counting,
        cardsExemptFrom524: exempt,
        cardsNotEvaluated: notEvaluated,
        chase524HeadroomBefore: headroomBefore,
        // Credit union cards are absent from `counting`, so this is unchanged
        // by adding them. That equality is the positive signal the exemption
        // fired, and it only means anything read beside cardsExemptFrom524:
        // headroom is equally unchanged when the cards were silently skipped.
        // Signed, not clamped: how far past the limit matters more than the
        // fact of being past it.
        chase524HeadroomAfter: headroomBefore - counting,
        chase524Overage: Math.max(0, counting - headroomBefore),
        exceedsChase524: counting > headroomBefore,
        existingBankCardsInWindow: ctx.bankCardsInWindow,
        existingCreditUnionCardsInWindow: ctx.creditUnionCardsInWindow,
      };
    })(),
    capacity: {
      targetAmount,
      bankEstimatedCredit: bankCredit,
      creditUnionEstimatedCredit: creditUnionCredit,
      shortfallAfterBanks,
      remainingShortfall,
      creditUnionsIncluded: includeCreditUnions,
      creditUnionCardLimit: maxCreditUnionCards,
      bankCardCount: finalRecs.filter((r) => !isCreditUnionIssuer(r.issuer.toLowerCase())).length,
      creditUnionCardCount: finalRecs.filter((r) => isCreditUnionIssuer(r.issuer.toLowerCase())).length,
    },
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
