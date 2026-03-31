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
