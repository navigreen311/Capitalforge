// ============================================================
// CapitalForge Credit Intelligence Service
//
// Responsibilities:
//   - Stub bureau API calls (Equifax, TransUnion, Experian, D&B)
//   - Persist CreditProfile records via Prisma
//   - Calculate utilization across all open tradelines
//   - Track inquiry velocity (warn if > MAX_INQUIRY_VELOCITY_90D in 90d)
//   - Build a structured credit optimization roadmap
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';
import {
  isBureauConfigured,
  isSyntheticMode,
} from '../integrations/credit-bureaus/bureau-client.js';
import { eventBus } from '../events/event-bus.js';
import { AGGREGATE_TYPES, RISK_THRESHOLDS } from '../../shared/constants/index.js';
import type { Bureau, ScoreType, TenantContext } from '../../shared/types/index.js';
import type {
  CreditPullRequest,
  CreditProfileDto,
  OptimizationAction,
  CreditRoadmap,
  Tradeline,
} from '../../shared/validators/credit.validators.js';
import { CreditOptimizerService } from './credit-optimizer.js';

// ── Internal Types ────────────────────────────────────────────

interface BureauPullResult {
  bureau: Bureau;
  score: number | null;
  scoreType: ScoreType | null;
  utilization: number | null;
  inquiryCount: number | null;
  derogatoryCount: number | null;
  tradelines: Tradeline[];
  rawData: Record<string, unknown>;
  pulledAt: Date;
}

// ── Stubbed Bureau API Adapters ───────────────────────────────
// In production these would call real bureau APIs (Equifax Connect,
// TransUnion TruVision, Experian BIS, D&B Direct+).
//
// FAILS CLOSED, and this is the one that mattered.
//
// These generate their answers — a FICO of 650 + Math.random() * 150, a
// utilisation, an inquiry count, derogatory marks — and pullCreditProfiles
// writes the result straight into credit_profiles. So an invented score
// became a stored credit profile indistinguishable from a real pull, which
// the credit-builder page then read back as the client's Paydex or SBSS, and
// which drove the utilisation alerts and ledger events emitted just below.
//
// The identical generators in integrations/credit-bureaus/bureau-client.ts
// were gated first. That file imports nothing and reaches no one; this one is
// wired to POST /api/businesses/:id/credit/pull. The dead copy was fixed and
// the live one missed, which is the argument for gating on shared config
// rather than per-file: isBureauConfigured and isSyntheticMode are imported
// from there, so there is one answer to "may this system invent a score".

/**
 * A business score on the scale of the product it claims to be.
 *
 * Every business pull here returned a personal-FICO figure — 650 to 800 —
 * under `scoreType: 'sbss'`, a product that runs 0–300. So a pulled business
 * profile stored a score its own type could not hold, and the credit-builder
 * panel rendered it as "730/300". `validateScoreForType` has said SBSS is
 * 0–300 the whole time; nothing on this path called it.
 */
function stubSbssScore(): number {
  return 100 + Math.floor(Math.random() * 200); // SBSS: 0–300
}

/** Equifax Business Credit Risk Score: 101–992, higher is lower risk. */
function stubEquifaxBusinessRisk(): number {
  return 101 + Math.floor(Math.random() * 892);
}

function stubEquifaxPull(businessId: string, profileType: string): BureauPullResult {
  const base = 650 + Math.floor(Math.random() * 150);
  return {
    bureau: 'equifax',
    // Equifax's business product is its Business Credit Risk Score, 101–992 —
    // not SBSS, which is FICO's and runs 0–300. Writing it as `sbss` left the
    // "Equifax Business Credit ≥ 500" criterion unassessable for every client,
    // because nothing anywhere produced the score it reads.
    //
    // SBSS keeps a producer: TransUnion writes it. Every business product now
    // has exactly one — PAYDEX from D&B, Intelliscore from Experian, SBSS from
    // TransUnion, this from Equifax.
    score: profileType === 'business' ? stubEquifaxBusinessRisk() : base,
    scoreType: profileType === 'business' ? 'equifax_business_risk' : 'fico',
    utilization: parseFloat((Math.random() * 0.6).toFixed(4)),
    inquiryCount: Math.floor(Math.random() * 8),
    derogatoryCount: Math.floor(Math.random() * 3),
    tradelines: generateStubTradelines(3),
    rawData: {
      reportId: uuidv4(),
      bureau: 'equifax',
      profileType,
      businessId,
      generatedAt: new Date().toISOString(),
    },
    pulledAt: new Date(),
  };
}

function stubTransUnionPull(businessId: string, profileType: string): BureauPullResult {
  const base = 640 + Math.floor(Math.random() * 160);
  return {
    bureau: 'transunion',
    score: profileType === 'business' ? stubSbssScore() : base,
    scoreType: profileType === 'business' ? 'sbss' : 'fico',
    utilization: parseFloat((Math.random() * 0.55).toFixed(4)),
    inquiryCount: Math.floor(Math.random() * 7),
    derogatoryCount: Math.floor(Math.random() * 2),
    tradelines: generateStubTradelines(4),
    rawData: {
      reportId: uuidv4(),
      bureau: 'transunion',
      profileType,
      businessId,
      generatedAt: new Date().toISOString(),
    },
    pulledAt: new Date(),
  };
}

function stubExperianPull(businessId: string, profileType: string): BureauPullResult {
  const base = 660 + Math.floor(Math.random() * 140);
  return {
    bureau: 'experian',
    // Experian's business product is Intelliscore Plus, 1–100 — not SBSS,
    // which is FICO's and runs 0–300. Writing it as `sbss` is what left the
    // Experian Business card unfillable: the panel reads `intelliscore`, and
    // no code path produced that string.
    score: profileType === 'business' ? 1 + Math.floor(Math.random() * 100) : base,
    scoreType: profileType === 'business' ? 'intelliscore' : 'fico',
    utilization: parseFloat((Math.random() * 0.65).toFixed(4)),
    inquiryCount: Math.floor(Math.random() * 9),
    derogatoryCount: Math.floor(Math.random() * 2),
    tradelines: generateStubTradelines(5),
    rawData: {
      reportId: uuidv4(),
      bureau: 'experian',
      profileType,
      businessId,
      generatedAt: new Date().toISOString(),
    },
    pulledAt: new Date(),
  };
}

function stubDnbPull(businessId: string, _profileType: string): BureauPullResult {
  // D&B uses Paydex (0–100) for payment history
  return {
    bureau: 'dnb',
    score: 60 + Math.floor(Math.random() * 40),
    scoreType: 'paydex',
    utilization: null, // D&B does not model utilization the same way
    inquiryCount: Math.floor(Math.random() * 4),
    derogatoryCount: Math.floor(Math.random() * 2),
    tradelines: generateStubTradelines(6),
    rawData: {
      reportId: uuidv4(),
      bureau: 'dnb',
      businessId,
      generatedAt: new Date().toISOString(),
      dunsNumber: `${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0')}`,
    },
    pulledAt: new Date(),
  };
}

function generateStubTradelines(count: number): Tradeline[] {
  const types = ['revolving', 'installment', 'mortgage', 'auto', 'business_line'];
  return Array.from({ length: count }, (_, i) => ({
    creditor: `Stub Creditor ${i + 1}`,
    accountType: types[i % types.length],
    creditLimit: 5_000 + i * 2_500,
    balance: Math.floor(Math.random() * 5_000),
    paymentStatus: Math.random() > 0.15 ? 'current' : '30_days_late',
    openedAt: new Date(Date.now() - (i + 1) * 180 * 24 * 60 * 60 * 1000).toISOString(),
    closedAt: undefined,
    isDerogatory: Math.random() < 0.1,
  }));
}

/**
 * Thrown when a pull is attempted with no way to make one.
 *
 * Its own class so the route can answer 503 — the request was fine, the
 * integration is not available — rather than the generic 500 that a bare
 * Error would produce.
 */
export class BureauNotConfiguredError extends Error {
  constructor(public readonly bureau: string, message: string) {
    super(message);
    this.name = 'BureauNotConfiguredError';
  }
}

/** Throws unless this bureau can be reached, or generated data is permitted. */
function assertPullAllowed(bureau: Bureau): void {
  if (isBureauConfigured(bureau)) return;
  if (isSyntheticMode()) return;

  throw new BureauNotConfiguredError(
    bureau,
    `No credentials are configured for ${bureau}, so no credit data can be pulled. This ` +
      'service generates its figures and writes them to credit_profiles, where nothing ' +
      'downstream can tell them from a real pull. Configure the bureau, or set ' +
      'BUREAU_MODE=synthetic to allow generated profiles, which are recorded as synthetic.',
  );
}

function callBureauApi(
  bureau: Bureau,
  businessId: string,
  profileType: string,
): BureauPullResult {
  switch (bureau) {
    case 'equifax':
      return stubEquifaxPull(businessId, profileType);
    case 'transunion':
      return stubTransUnionPull(businessId, profileType);
    case 'experian':
      return stubExperianPull(businessId, profileType);
    case 'dnb':
      return stubDnbPull(businessId, profileType);
  }
}

// ── Event Constants ───────────────────────────────────────────

const CREDIT_EVENTS = {
  CREDIT_PULLED: 'credit.pulled',
  INQUIRY_VELOCITY_BREACH: 'credit.inquiry_velocity.breach',
  UTILIZATION_WARNING: 'credit.utilization.warning',
  UTILIZATION_CRITICAL: 'credit.utilization.critical',
} as const;

// ── Service ───────────────────────────────────────────────────

/**
 * The tradelines on a credit profile, when there are any.
 *
 * `tradelines` is a Json column and has been written two ways: an array of
 * per-account records, which is what the type says, and a summary object like
 * `{ accounts: 18, avgAge: 9.4, revolving: 6 }`, which is what the seeded
 * profiles carry. Every reader cast it to Tradeline[] and iterated, so a
 * summary object reached `for...of` and threw "tradelines is not iterable" —
 * a 500 on the credit roadmap endpoint.
 *
 * A summary carries no per-account balance or limit, so it yields nothing to
 * iterate. Callers that aggregate over it then report null, meaning unknown,
 * which is the honest answer: the figures they need were never stored.
 */
export function toTradelines(value: unknown): Tradeline[] {
  return Array.isArray(value) ? (value as Tradeline[]) : [];
}

export class CreditIntelligenceService {
  private readonly optimizer: CreditOptimizerService;

  constructor(private readonly prisma: PrismaClient) {
    this.optimizer = new CreditOptimizerService();
  }

  // ── Pull & Store ────────────────────────────────────────────

  /**
   * Trigger a fresh bureau pull for the given business.
   * Calls (stubbed) bureau APIs, persists each CreditProfile,
   * checks utilization and inquiry velocity thresholds,
   * and emits ledger events.
   */
  async pullCreditProfiles(
    businessId: string,
    request: CreditPullRequest,
    ctx: TenantContext,
  ): Promise<CreditProfileDto[]> {
    logger.info('Credit pull initiated', { businessId, bureaus: request.bureaus, ctx });

    // Verify business belongs to the tenant
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId: ctx.tenantId },
    });

    if (!business) {
      throw new Error(`Business ${businessId} not found for tenant ${ctx.tenantId}`);
    }

    const profiles: CreditProfileDto[] = [];

    for (const bureau of request.bureaus) {
      try {
        // Optionally return cached data if within TTL
        if (request.useCache) {
          const cached = await this.findCachedProfile(
            businessId,
            bureau,
            request.profileType,
            request.cacheTtlHours,
          );
          if (cached) {
            profiles.push(cached);
            continue;
          }
        }

        // Before anything is generated or written. Inside the per-bureau
        // loop rather than around it, because each bureau is configured
        // separately: one being unavailable should not stop the others.
        assertPullAllowed(bureau);

        const result = callBureauApi(bureau, businessId, request.profileType);

        // Whether these figures were pulled or generated, recorded on the row
        // itself. rawData is the record of what the bureau returned, so it is
        // where the answer to "did a bureau return anything" belongs — by the
        // time the credit-builder page reads this score back, the request
        // that produced it is long gone.
        const synthetic = !isBureauConfigured(bureau);

        const saved = await this.prisma.creditProfile.create({
          data: {
            businessId,
            profileType: request.profileType,
            bureau,
            score: result.score,
            scoreType: result.scoreType,
            utilization: result.utilization !== null ? result.utilization : null,
            inquiryCount: result.inquiryCount,
            derogatoryCount: result.derogatoryCount,
            tradelines: result.tradelines as object[],
            rawData: { ...(result.rawData as object), synthetic },
            pulledAt: result.pulledAt,
          },
        });

        if (synthetic) {
          logger.warn('Synthetic credit profile stored', {
            businessId,
            bureau,
            profileId: saved.id,
          });
        }

        const dto = this.mapToDto(saved);
        profiles.push(dto);

        await this.checkAndEmitUtilizationAlerts(businessId, dto, ctx);

        logger.info('Credit profile stored', { businessId, bureau, profileId: saved.id });
      } catch (err) {
        // Not configured is not a bureau failing: continuing would return an
        // empty list and look like a clean pull that found nothing, which is
        // the shape of answer this whole change exists to prevent.
        if (err instanceof BureauNotConfiguredError) throw err;

        logger.error('Bureau pull failed', { businessId, bureau, err });
        // Continue to next bureau rather than failing the entire operation
      }
    }

    // Check inquiry velocity across all personal bureaus after pull
    await this.checkInquiryVelocity(businessId, ctx);

    // Emit aggregate event
    await eventBus.publish(ctx.tenantId, {
      eventType: CREDIT_EVENTS.CREDIT_PULLED,
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId: businessId,
      payload: {
        bureausPulled: profiles.map((p) => p.bureau),
        profileType: request.profileType,
        profileCount: profiles.length,
      },
      metadata: { userId: ctx.userId },
    });

    return profiles;
  }

  // ── Query ────────────────────────────────────────────────────

  /**
   * Retrieve all credit profiles for a business, ordered by pulledAt DESC.
   */
  async getCreditProfiles(
    businessId: string,
    ctx: TenantContext,
  ): Promise<CreditProfileDto[]> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId: ctx.tenantId },
    });

    if (!business) {
      throw new Error(`Business ${businessId} not found for tenant ${ctx.tenantId}`);
    }

    const profiles = await this.prisma.creditProfile.findMany({
      where: { businessId },
      orderBy: { pulledAt: 'desc' },
    });

    return profiles.map((p) => this.mapToDto(p));
  }

  // ── Utilization ──────────────────────────────────────────────

  /**
   * Calculate aggregate utilization across all tradelines from the most
   * recent profile per bureau for a business.
   *
   * utilization = totalBalance / totalCreditLimit
   */
  async calculateAggregateUtilization(businessId: string): Promise<number | null> {
    // Get the most recent profile per bureau
    const latestProfiles = await this.prisma.creditProfile.findMany({
      where: { businessId },
      orderBy: { pulledAt: 'desc' },
      distinct: ['bureau'],
    });

    let totalLimit = 0;
    let totalBalance = 0;
    let hasData = false;

    for (const profile of latestProfiles) {
      const tradelines = toTradelines(profile.tradelines);

      for (const tl of tradelines) {
        if (typeof tl.creditLimit === 'number' && typeof tl.balance === 'number') {
          totalLimit += tl.creditLimit;
          totalBalance += tl.balance;
          hasData = true;
        }
      }

      // Also factor in the bureau-reported utilization if tradelines lack granularity
      if (!hasData && profile.utilization !== null) {
        const util = profile.utilization;
        return typeof util === 'object' && util !== null && 'toNumber' in (util as object)
          ? (util as { toNumber: () => number }).toNumber()
          : Number(util);
      }
    }

    if (!hasData || totalLimit === 0) return null;

    return parseFloat((totalBalance / totalLimit).toFixed(4));
  }

  // ── Inquiry Velocity ─────────────────────────────────────────

  /**
   * Count total inquiries across all bureaus in the past 90 days.
   * Returns the count and whether the threshold is breached.
   */
  async getInquiryVelocity(businessId: string): Promise<{
    count: number;
    breached: boolean;
    windowDays: number;
  }> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 90);

    const profiles = await this.prisma.creditProfile.findMany({
      where: {
        businessId,
        pulledAt: { gte: windowStart },
      },
      select: { inquiryCount: true },
    });

    const total = profiles.reduce((sum, p) => sum + (p.inquiryCount ?? 0), 0);

    return {
      count: total,
      breached: total > RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D,
      windowDays: 90,
    };
  }

  // ── Optimization Roadmap ─────────────────────────────────────

  /**
   * Build a full credit optimization roadmap for the business.
   * Delegates scoring logic to CreditOptimizerService.
   */
  async generateOptimizationRoadmap(
    businessId: string,
    ctx: TenantContext,
  ): Promise<CreditRoadmap> {
    const profiles = await this.getCreditProfiles(businessId, ctx);

    if (profiles.length === 0) {
      return this.buildEmptyRoadmap(businessId);
    }

    const utilization = await this.calculateAggregateUtilization(businessId);
    const velocityResult = await this.getInquiryVelocity(businessId);
    const actions = this.optimizer.generateActions(profiles, utilization, velocityResult.count);
    const nextPullDate = this.optimizer.recommendNextPullDate(profiles, velocityResult);

    const highestFico = this.getHighestScore(profiles, 'fico');
    const highestSbss = this.getHighestScore(profiles, 'sbss');

    let utilizationRisk: 'none' | 'warning' | 'critical' = 'none';
    if (utilization !== null) {
      if (utilization >= RISK_THRESHOLDS.MAX_UTILIZATION_CRITICAL) {
        utilizationRisk = 'critical';
      } else if (utilization >= RISK_THRESHOLDS.MAX_UTILIZATION_WARN) {
        utilizationRisk = 'warning';
      }
    }

    return {
      businessId,
      generatedAt: new Date().toISOString(),
      currentScoreSummary: {
        highestFico,
        highestSbss,
        averageUtilization: utilization,
        totalInquiries90d: velocityResult.count,
        inquiryVelocityRisk: velocityResult.breached,
        utilizationRisk,
      },
      actions,
      nextRecommendedPullDate: nextPullDate,
    };
  }

  // ── Private Helpers ───────────────────────────────────────────

  private async findCachedProfile(
    businessId: string,
    bureau: Bureau,
    profileType: string,
    ttlHours: number,
  ): Promise<CreditProfileDto | null> {
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);

    const cached = await this.prisma.creditProfile.findFirst({
      where: {
        businessId,
        bureau,
        profileType,
        pulledAt: { gte: cutoff },
      },
      orderBy: { pulledAt: 'desc' },
    });

    return cached ? this.mapToDto(cached) : null;
  }

  private async checkAndEmitUtilizationAlerts(
    businessId: string,
    profile: CreditProfileDto,
    ctx: TenantContext,
  ): Promise<void> {
    if (profile.utilization === null) return;

    const u = profile.utilization;

    if (u >= RISK_THRESHOLDS.MAX_UTILIZATION_CRITICAL) {
      await eventBus.publish(ctx.tenantId, {
        eventType: CREDIT_EVENTS.UTILIZATION_CRITICAL,
        aggregateType: AGGREGATE_TYPES.BUSINESS,
        aggregateId: businessId,
        payload: {
          bureau: profile.bureau,
          utilization: u,
          threshold: RISK_THRESHOLDS.MAX_UTILIZATION_CRITICAL,
        },
      });
      logger.warn('CRITICAL utilization threshold breached', { businessId, bureau: profile.bureau, utilization: u });
    } else if (u >= RISK_THRESHOLDS.MAX_UTILIZATION_WARN) {
      await eventBus.publish(ctx.tenantId, {
        eventType: CREDIT_EVENTS.UTILIZATION_WARNING,
        aggregateType: AGGREGATE_TYPES.BUSINESS,
        aggregateId: businessId,
        payload: {
          bureau: profile.bureau,
          utilization: u,
          threshold: RISK_THRESHOLDS.MAX_UTILIZATION_WARN,
        },
      });
      logger.warn('Utilization warning threshold breached', { businessId, bureau: profile.bureau, utilization: u });
    }
  }

  private async checkInquiryVelocity(
    businessId: string,
    ctx: TenantContext,
  ): Promise<void> {
    const velocity = await this.getInquiryVelocity(businessId);

    if (velocity.breached) {
      await eventBus.publish(ctx.tenantId, {
        eventType: CREDIT_EVENTS.INQUIRY_VELOCITY_BREACH,
        aggregateType: AGGREGATE_TYPES.BUSINESS,
        aggregateId: businessId,
        payload: {
          inquiryCount: velocity.count,
          maxAllowed: RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D,
          windowDays: velocity.windowDays,
        },
      });
      logger.warn('Inquiry velocity threshold breached', {
        businessId,
        inquiryCount: velocity.count,
        max: RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D,
      });
    }
  }

  private getHighestScore(
    profiles: CreditProfileDto[],
    scoreType: ScoreType,
  ): number | null {
    const scores = profiles
      .filter((p) => p.scoreType === scoreType && p.score !== null)
      .map((p) => p.score as number);

    return scores.length > 0 ? Math.max(...scores) : null;
  }

  private buildEmptyRoadmap(businessId: string): CreditRoadmap {
    return {
      businessId,
      generatedAt: new Date().toISOString(),
      currentScoreSummary: {
        highestFico: null,
        highestSbss: null,
        averageUtilization: null,
        totalInquiries90d: 0,
        inquiryVelocityRisk: false,
        utilizationRisk: 'none',
      },
      actions: [
        {
          priority: 1,
          category: 'tradeline',
          title: 'Pull Initial Credit Reports',
          description:
            'No credit profiles on file. Initiate a multi-bureau pull to establish a baseline before generating optimization recommendations.',
          estimatedScoreImpact: 0,
          estimatedTimeframeDays: 1,
          actionable: true,
        },
      ],
      nextRecommendedPullDate: new Date().toISOString(),
    };
  }

  // ── DTO Mapper ────────────────────────────────────────────────

  private mapToDto(record: {
    id: string;
    businessId: string;
    profileType: string;
    bureau: string;
    score: number | null;
    scoreType: string | null;
    utilization: { toNumber(): number } | number | null;
    inquiryCount: number | null;
    derogatoryCount: number | null;
    tradelines: unknown;
    rawData: unknown;
    pulledAt: Date;
    createdAt: Date;
  }): CreditProfileDto {
    return {
      id: record.id,
      businessId: record.businessId,
      profileType: record.profileType as 'personal' | 'business',
      bureau: record.bureau as Bureau,
      score: record.score,
      scoreType: (record.scoreType as ScoreType) ?? null,
      utilization:
        record.utilization !== null
          ? typeof record.utilization === 'object'
            ? record.utilization.toNumber()
            : record.utilization
          : null,
      inquiryCount: record.inquiryCount,
      derogatoryCount: record.derogatoryCount,
      // Passed through as stored, narrowed rather than cast. This column
      // holds either an array of tradelines or a summary object, and
      // flattening one into the other here would hide which a caller has.
      tradelines: Array.isArray(record.tradelines)
        ? (record.tradelines as Tradeline[])
        : typeof record.tradelines === 'object' && record.tradelines !== null
          ? (record.tradelines as Record<string, unknown>)
          : null,
      rawData: (record.rawData as Record<string, unknown>) ?? null,
      pulledAt: record.pulledAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
    };
  }
}
