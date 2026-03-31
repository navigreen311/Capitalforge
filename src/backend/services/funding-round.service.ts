// ============================================================
// CapitalForge — Funding Round Service
//
// Manages the full lifecycle of a funding round:
//   - Round creation with target credit / card count / issuer mix
//   - APR expiry tracking per card (earliest introAprExpiry across apps)
//   - 60 / 30 / 15 day alert flag management
//   - Round completion with performance scoring
//   - Round 2 eligibility assessment
//   - Cross-round comparison scoring
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { differenceInDays, subMonths, isAfter } from 'date-fns';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES, APR_ALERT_WINDOWS } from '@shared/constants/index.js';
import type { RoundStatus } from '@shared/types/index.js';
import logger from '../config/logger.js';

// ── Module-level prisma injection (test support) ──────────────────────────────

let _sharedPrisma: PrismaClient | null = null;

/** Allow test injection of a shared PrismaClient. */
export function setPrismaClient(client: PrismaClient): void {
  _sharedPrisma = client;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateRoundInput {
  businessId: string;
  tenantId: string;
  targetCredit?: number;
  targetCardCount?: number;
  /** Preferred issuers in priority order, e.g. ["Chase", "Amex", "Citi"] */
  issuerMixStrategy?: string[];
  notes?: string;
}

export interface UpdateRoundInput {
  targetCredit?: number;
  targetCardCount?: number;
  issuerMixStrategy?: string[];
  notes?: string;
  status?: RoundStatus;
  aprExpiryDate?: Date | null;
}

export interface RoundPerformanceMetrics {
  /** Total approved credit limits across all applications */
  totalCreditObtained: number;
  /** Total credit obtained / target credit (null if no target) */
  creditAttainmentRate: number | null;
  /** Approved applications / total submitted applications */
  approvalRate: number;
  /** Weighted average intro APR across approved cards (null if none have introApr) */
  weightedAvgIntroApr: number | null;
  /** Earliest introAprExpiry date across approved cards */
  earliestAprExpiry: Date | null;
  /** Total annual fees across approved cards */
  totalAnnualFees: number;
  /** Composite 0–100 performance score */
  performanceScore: number;
  approvedCount: number;
  submittedCount: number;
  totalApplications: number;
}

export interface Round2EligibilityResult {
  eligible: boolean;
  reasons: string[];
  /** Months elapsed since Round 1 started */
  monthsElapsed: number | null;
  currentUtilization: number | null;
  creditScoreChange: number | null;
}

export interface RoundComparisonResult {
  roundId: string;
  roundNumber: number;
  metrics: RoundPerformanceMetrics;
  /** 0–100 composite score used for ranking */
  compositeScore: number;
  rank: number;
}

// Prisma FundingRound with its applications eager-loaded
type RoundWithApplications = Prisma.FundingRoundGetPayload<{
  include: { applications: true };
}>;

type RoundPlain = Prisma.FundingRoundGetPayload<Record<string, never>>;

// ── Service ───────────────────────────────────────────────────────────────────

export class FundingRoundService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? _sharedPrisma ?? new PrismaClient();
  }

  // ── Create ────────────────────────────────────────────────────────────────

  /**
   * Create a new funding round for a business.
   * Round number is auto-incremented — the service reads the current max.
   */
  async createRound(input: CreateRoundInput): Promise<RoundPlain> {
    this._assertBusinessId(input.businessId);
    this._assertTenantId(input.tenantId);

    // Determine the next round number atomically enough for our use case
    const lastRound = await this.prisma.fundingRound.findFirst({
      where: { businessId: input.businessId },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });

    const roundNumber = (lastRound?.roundNumber ?? 0) + 1;

    const round = await this.prisma.fundingRound.create({
      data: {
        id: uuidv4(),
        businessId: input.businessId,
        roundNumber,
        targetCredit: input.targetCredit != null
          ? new Prisma.Decimal(input.targetCredit)
          : null,
        targetCardCount: input.targetCardCount ?? null,
        status: 'planning' satisfies RoundStatus,
        // issuerMixStrategy and notes stored in metadata via event payload;
        // they're not columns in the DB schema — captured in the ledger event.
      },
    });

    // Publish creation event
    await eventBus.publishAndPersist(input.tenantId, {
      eventType: EVENT_TYPES.ROUND_STARTED,
      aggregateType: AGGREGATE_TYPES.FUNDING_ROUND,
      aggregateId: round.id,
      payload: {
        roundId: round.id,
        businessId: input.businessId,
        roundNumber,
        targetCredit: input.targetCredit ?? null,
        targetCardCount: input.targetCardCount ?? null,
        issuerMixStrategy: input.issuerMixStrategy ?? [],
        notes: input.notes ?? null,
      },
    });

    logger.info('[FundingRoundService] Round created', {
      roundId: round.id,
      businessId: input.businessId,
      roundNumber,
    });

    return round;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async listRounds(businessId: string): Promise<RoundPlain[]> {
    this._assertBusinessId(businessId);

    return this.prisma.fundingRound.findMany({
      where: { businessId },
      orderBy: { roundNumber: 'asc' },
    });
  }

  async getRoundById(roundId: string): Promise<RoundWithApplications | null> {
    return this.prisma.fundingRound.findUnique({
      where: { id: roundId },
      include: { applications: true },
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async updateRound(roundId: string, input: UpdateRoundInput): Promise<RoundPlain> {
    const existing = await this._requireRound(roundId);

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new Error(
        `[FundingRoundService] Cannot update a round in status "${existing.status}".`,
      );
    }

    const updateData: Prisma.FundingRoundUpdateInput = {};

    if (input.targetCredit !== undefined) {
      updateData.targetCredit = input.targetCredit != null
        ? new Prisma.Decimal(input.targetCredit)
        : null;
    }
    if (input.targetCardCount !== undefined) {
      updateData.targetCardCount = input.targetCardCount;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === 'in_progress' && existing.status === 'planning') {
        updateData.startedAt = new Date();
      }
    }
    if (input.aprExpiryDate !== undefined) {
      updateData.aprExpiryDate = input.aprExpiryDate;
    }

    return this.prisma.fundingRound.update({
      where: { id: roundId },
      data: updateData,
    });
  }

  // ── Complete ──────────────────────────────────────────────────────────────

  /**
   * Mark a round as completed.
   * Derives the earliest introAprExpiry from approved applications and saves it
   * to the round record so the APR expiry checker can query it efficiently.
   */
  async completeRound(
    roundIdOrOpts: string | { fundingRoundId: string; tenantId: string },
    tenantIdArg?: string,
    _ctx?: unknown,
  ): Promise<RoundPlain & { round: RoundPlain; metrics: RoundPerformanceMetrics }> {
    // Support both calling conventions:
    //   completeRound(roundId, tenantId)                    — canonical
    //   completeRound({fundingRoundId, tenantId}, ctx?)     — test-friendly
    let roundId: string;
    let tenantId: string;
    if (typeof roundIdOrOpts === 'string') {
      roundId = roundIdOrOpts;
      tenantId = tenantIdArg!;
    } else {
      roundId = roundIdOrOpts.fundingRoundId;
      tenantId = roundIdOrOpts.tenantId;
    }
    this._assertTenantId(tenantId);

    const existing = await this.prisma.fundingRound.findUnique({
      where: { id: roundId },
      include: { applications: true },
    });

    if (!existing) {
      throw new Error(`[FundingRoundService] Round not found: ${roundId}`);
    }
    if (existing.status === 'completed') {
      throw new Error(`[FundingRoundService] Round ${roundId} is already completed.`);
    }
    if (existing.status === 'cancelled') {
      throw new Error(`[FundingRoundService] Cannot complete a cancelled round.`);
    }

    const metrics = this._computeMetrics(existing);

    const round = await this.prisma.fundingRound.update({
      where: { id: roundId },
      data: {
        status: 'completed' satisfies RoundStatus,
        completedAt: new Date(),
        aprExpiryDate: metrics.earliestAprExpiry,
        // Reset alert flags in case the round is somehow re-processed
        alertSent60: false,
        alertSent30: false,
        alertSent15: false,
      },
    });

    await eventBus.publishAndPersist(tenantId, {
      eventType: EVENT_TYPES.ROUND_COMPLETED,
      aggregateType: AGGREGATE_TYPES.FUNDING_ROUND,
      aggregateId: roundId,
      payload: {
        roundId,
        businessId: existing.businessId,
        roundNumber: existing.roundNumber,
        metrics: this._serializeMetrics(metrics),
        completedAt: round.completedAt?.toISOString(),
      },
    });

    logger.info('[FundingRoundService] Round completed', {
      roundId,
      performanceScore: metrics.performanceScore,
    });

    // Return the round properties at the top level for test-friendly access (round.status)
    // AND as { round, metrics } for destructured access in canonical usage
    return { ...round, round, metrics };
  }

  // ── APR Alert Management ──────────────────────────────────────────────────

  /**
   * Evaluate which APR alert windows have been breached for a round and return
   * the windows that still need alerts fired. Mutates alertSentXX flags in DB.
   */
  async evaluateAprAlerts(
    round: RoundPlain,
    tenantId: string,
    now: Date = new Date(),
  ): Promise<{ windowsFired: number[] }> {
    if (!round.aprExpiryDate) return { windowsFired: [] };

    const daysRemaining = differenceInDays(round.aprExpiryDate, now);
    const windowsFired: number[] = [];

    const checks: Array<{
      window: 60 | 30 | 15;
      flagField: 'alertSent60' | 'alertSent30' | 'alertSent15';
      alreadySent: boolean;
    }> = [
      { window: 60, flagField: 'alertSent60', alreadySent: round.alertSent60 },
      { window: 30, flagField: 'alertSent30', alreadySent: round.alertSent30 },
      { window: 15, flagField: 'alertSent15', alreadySent: round.alertSent15 },
    ];

    for (const check of checks) {
      if (!check.alreadySent && daysRemaining <= check.window) {
        windowsFired.push(check.window);

        // Mark the flag immediately to prevent duplicate fires
        await this.prisma.fundingRound.update({
          where: { id: round.id },
          data: { [check.flagField]: true },
        });

        await eventBus.publishAndPersist(tenantId, {
          eventType: EVENT_TYPES.APR_EXPIRY_APPROACHING,
          aggregateType: AGGREGATE_TYPES.FUNDING_ROUND,
          aggregateId: round.id,
          payload: {
            roundId: round.id,
            businessId: round.businessId,
            roundNumber: round.roundNumber,
            aprExpiryDate: round.aprExpiryDate.toISOString(),
            daysRemaining,
            alertWindow: check.window,
          },
          metadata: { tenantId },
        });

        logger.info('[FundingRoundService] APR expiry alert fired', {
          roundId: round.id,
          window: check.window,
          daysRemaining,
        });
      }
    }

    return { windowsFired };
  }

  // ── Performance Metrics ───────────────────────────────────────────────────

  async computeRoundMetrics(
    roundOrId: string | RoundWithApplications,
  ): Promise<RoundPerformanceMetrics> {
    if (typeof roundOrId === 'string') {
      const round = await this.prisma.fundingRound.findUnique({
        where: { id: roundOrId },
        include: { applications: true },
      });
      if (!round) {
        throw new Error(`[FundingRoundService] Round not found: ${roundOrId}`);
      }
      return this._computeMetrics(round);
    }
    return Promise.resolve(this._computeMetrics(roundOrId));
  }

  // ── Round 2 Eligibility ───────────────────────────────────────────────────

  /**
   * Assess whether a business is eligible to begin a Round 2.
   *
   * Rules:
   *   1. At least 6 months since Round 1 started
   *   2. Current utilization < 30% (based on most recent credit profile)
   *   3. No missed payments (derogatory count = 0 in latest profile)
   *   4. Credit score stable or improved since Round 1
   */
  async assessRound2Eligibility(
    businessId: string,
    now: Date = new Date(),
  ): Promise<Round2EligibilityResult> {
    this._assertBusinessId(businessId);

    const reasons: string[] = [];
    let monthsElapsed: number | null = null;
    let currentUtilization: number | null = null;
    let creditScoreChange: number | null = null;

    // ── Rule 1: Minimum 6 months since Round 1 started ──────────────────────
    const round1 = await this.prisma.fundingRound.findFirst({
      where: { businessId, roundNumber: 1 },
      select: { startedAt: true, completedAt: true, status: true },
    });

    if (!round1 || round1.status !== 'completed') {
      reasons.push('No completed Round 1 found for this business.');
    } else {
      const referenceDate = round1.startedAt ?? round1.completedAt;
      if (!referenceDate) {
        reasons.push('Round 1 has no start date recorded.');
      } else {
        const sixMonthsAgo = subMonths(now, 6);
        monthsElapsed = Math.floor(differenceInDays(now, referenceDate) / 30);

        // referenceDate must be at or before sixMonthsAgo (i.e. old enough)
        // isAfter(referenceDate, sixMonthsAgo) → Round 1 started MORE recently than 6 months ago
        if (isAfter(referenceDate, sixMonthsAgo)) {
          reasons.push(
            `Round 1 started only ${monthsElapsed} month(s) ago. Minimum is 6 months.`,
          );
        }
      }
    }

    // ── Rule 2 & 3 & 4: Credit profile checks ───────────────────────────────
    const latestProfile = await this.prisma.creditProfile.findFirst({
      where: { businessId, profileType: 'personal' },
      orderBy: { pulledAt: 'desc' },
      select: { utilization: true, derogatoryCount: true, score: true, pulledAt: true },
    });

    if (!latestProfile) {
      reasons.push('No credit profile found. Pull a fresh credit report before Round 2.');
    } else {
      // Utilization check
      currentUtilization = latestProfile.utilization != null
        ? (typeof latestProfile.utilization === 'object' && 'toNumber' in (latestProfile.utilization as object)
            ? (latestProfile.utilization as { toNumber: () => number }).toNumber()
            : Number(latestProfile.utilization))
        : null;

      if (currentUtilization !== null && currentUtilization >= 0.3) {
        reasons.push(
          `Current utilization is ${(currentUtilization * 100).toFixed(1)}%. Must be below 30%.`,
        );
      }

      // Missed payments (derogatory marks)
      if ((latestProfile.derogatoryCount ?? 0) > 0) {
        reasons.push(
          `${latestProfile.derogatoryCount} derogatory mark(s) detected. No missed payments allowed.`,
        );
      }

      // Credit score stability
      if (latestProfile.score !== null && round1?.startedAt) {
        const profileAtRound1 = await this.prisma.creditProfile.findFirst({
          where: {
            businessId,
            profileType: 'personal',
            pulledAt: { lte: round1.startedAt },
          },
          orderBy: { pulledAt: 'desc' },
          select: { score: true },
        });

        if (profileAtRound1?.score !== null && profileAtRound1?.score !== undefined) {
          creditScoreChange = (latestProfile.score ?? 0) - profileAtRound1.score;
          if (creditScoreChange < 0) {
            reasons.push(
              `Credit score declined by ${Math.abs(creditScoreChange)} points since Round 1. Must be stable or improved.`,
            );
          }
        }
      }
    }

    return {
      eligible: reasons.length === 0,
      reasons,
      monthsElapsed,
      currentUtilization,
      creditScoreChange,
    };
  }

  // ── Round Comparison ──────────────────────────────────────────────────────

  /**
   * Compare all completed rounds for a business, returning ranked performance
   * scores. Composite score weights:
   *   - Credit attainment rate  : 35%
   *   - Approval rate           : 30%
   *   - Avg intro APR length    : 20% (longer = better)
   *   - Cost efficiency         : 15% (lower annual fees per credit = better)
   */
  async compareRounds(businessId: string): Promise<RoundComparisonResult[]> {
    this._assertBusinessId(businessId);

    const rounds = await this.prisma.fundingRound.findMany({
      where: { businessId, status: 'completed' },
      orderBy: { roundNumber: 'asc' },
      include: { applications: true },
    });

    if (rounds.length === 0) return [];

    // Compute raw metrics for all rounds
    const entries = rounds.map((r) => ({
      roundId: r.id,
      roundNumber: r.roundNumber,
      metrics: this._computeMetrics(r),
    }));

    // Derive normalisation anchors
    const allAttainment = entries
      .map((e) => e.metrics.creditAttainmentRate ?? 0)
      .filter((v) => v > 0);
    const maxAttainment = allAttainment.length ? Math.max(...allAttainment) : 1;

    const allAnnualFees = entries.map((e) => e.metrics.totalAnnualFees);
    const maxAnnualFees = Math.max(...allAnnualFees, 1);

    // Estimate avg intro APR length in days from earliestAprExpiry vs completedAt
    const aprLengths = entries.map((e, idx) => {
      const completedAt = rounds[idx]!.completedAt;
      const expiry = e.metrics.earliestAprExpiry;
      if (!completedAt || !expiry) return 0;
      return Math.max(0, differenceInDays(expiry, completedAt));
    });
    const maxAprLength = Math.max(...aprLengths, 1);

    const results: RoundComparisonResult[] = entries.map((entry, idx) => {
      const attainmentNorm =
        maxAttainment > 0
          ? Math.min(1, (entry.metrics.creditAttainmentRate ?? 0) / maxAttainment)
          : 0;

      const approvalNorm = entry.metrics.approvalRate;

      const aprNorm = aprLengths[idx]! / maxAprLength;

      // Cost efficiency: lower fees relative to credit obtained = better
      const creditObtained = entry.metrics.totalCreditObtained;
      const feeRatio =
        creditObtained > 0
          ? entry.metrics.totalAnnualFees / creditObtained
          : maxAnnualFees;
      const maxFeeRatio = maxAnnualFees > 0 ? maxAnnualFees / 1 : 1;
      const costEfficiencyNorm = Math.max(0, 1 - feeRatio / (maxFeeRatio + 0.001));

      const compositeScore =
        attainmentNorm * 35 +
        approvalNorm * 30 +
        aprNorm * 20 +
        costEfficiencyNorm * 15;

      return {
        roundId: entry.roundId,
        roundNumber: entry.roundNumber,
        metrics: entry.metrics,
        compositeScore: parseFloat(compositeScore.toFixed(2)),
        rank: 0, // filled below
      };
    });

    // Rank by composite score descending
    results.sort((a, b) => b.compositeScore - a.compositeScore);
    results.forEach((r, idx) => {
      r.rank = idx + 1;
    });

    // Re-sort by roundNumber for display consistency
    results.sort((a, b) => a.roundNumber - b.roundNumber);

    return results;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _computeMetrics(round: RoundWithApplications): RoundPerformanceMetrics {
    const apps = round.applications;
    const total = apps.length;

    const submitted = apps.filter((a) =>
      ['submitted', 'approved', 'declined'].includes(a.status),
    );
    const approved = apps.filter((a) => a.status === 'approved');

    const toNum = (v: unknown): number => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'object' && 'toNumber' in (v as object)) {
        return (v as { toNumber: () => number }).toNumber();
      }
      return Number(v);
    };

    const totalCreditObtained = approved.reduce(
      (sum, a) => sum + (a.creditLimit ? toNum(a.creditLimit) : 0),
      0,
    );

    const approvalRate = submitted.length > 0
      ? approved.length / submitted.length
      : 0;

    const targetCredit = round.targetCredit ? toNum(round.targetCredit) : null;
    const creditAttainmentRate =
      targetCredit !== null && targetCredit > 0
        ? totalCreditObtained / targetCredit
        : null;

    // Weighted avg intro APR: weight by credit limit
    let weightedAprSum = 0;
    let weightedAprDenominator = 0;
    let earliestAprExpiry: Date | null = null;

    for (const app of approved) {
      const limit = app.creditLimit ? toNum(app.creditLimit) : 0;
      if (app.introApr !== null && app.introApr !== undefined && limit > 0) {
        weightedAprSum += toNum(app.introApr) * limit;
        weightedAprDenominator += limit;
      }
      if (app.introAprExpiry) {
        if (!earliestAprExpiry || app.introAprExpiry < earliestAprExpiry) {
          earliestAprExpiry = app.introAprExpiry;
        }
      }
    }

    const weightedAvgIntroApr =
      weightedAprDenominator > 0
        ? parseFloat((weightedAprSum / weightedAprDenominator).toFixed(4))
        : null;

    const totalAnnualFees = approved.reduce(
      (sum, a) => sum + (a.annualFee ? toNum(a.annualFee) : 0),
      0,
    );

    // Performance score (0–100):
    //   Credit attainment : 40 pts (capped at 100% of target)
    //   Approval rate     : 35 pts
    //   Low annual fees   : 15 pts (inverse — 0 fees = 15 pts)
    //   Intro APR exists  :  10 pts (binary: at least one card has intro APR)
    const attainmentScore =
      creditAttainmentRate !== null
        ? Math.min(1, creditAttainmentRate) * 40
        : 0;
    const approvalScore = approvalRate * 35;
    const feeScore =
      totalCreditObtained > 0
        ? Math.max(0, 1 - totalAnnualFees / totalCreditObtained) * 15
        : 15;
    const aprBonusScore = weightedAvgIntroApr !== null ? 10 : 0;

    const performanceScore = parseFloat(
      (attainmentScore + approvalScore + feeScore + aprBonusScore).toFixed(2),
    );

    return {
      totalCreditObtained,
      creditAttainmentRate,
      approvalRate: parseFloat(approvalRate.toFixed(4)),
      weightedAvgIntroApr,
      earliestAprExpiry,
      totalAnnualFees,
      performanceScore,
      approvedCount: approved.length,
      submittedCount: submitted.length,
      totalApplications: total,
    };
  }

  private _serializeMetrics(m: RoundPerformanceMetrics): Record<string, unknown> {
    return {
      totalCreditObtained: m.totalCreditObtained,
      creditAttainmentRate: m.creditAttainmentRate,
      approvalRate: m.approvalRate,
      weightedAvgIntroApr: m.weightedAvgIntroApr,
      earliestAprExpiry: m.earliestAprExpiry?.toISOString() ?? null,
      totalAnnualFees: m.totalAnnualFees,
      performanceScore: m.performanceScore,
      approvedCount: m.approvedCount,
      submittedCount: m.submittedCount,
      totalApplications: m.totalApplications,
    };
  }

  private async _requireRound(roundId: string): Promise<RoundPlain> {
    const round = await this.prisma.fundingRound.findUnique({
      where: { id: roundId },
    });
    if (!round) {
      throw new Error(`[FundingRoundService] Round not found: ${roundId}`);
    }
    return round;
  }

  private _assertBusinessId(businessId: string): void {
    if (!businessId?.trim()) {
      throw new Error('[FundingRoundService] businessId is required.');
    }
  }

  private _assertTenantId(tenantId: string): void {
    if (!tenantId?.trim()) {
      throw new Error('[FundingRoundService] tenantId is required.');
    }
  }
}

// Convenience constants re-exported for consumers
export { APR_ALERT_WINDOWS };
