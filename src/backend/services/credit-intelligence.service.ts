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

function stubEquifaxPull(businessId: string, profileType: string): BureauPullResult {
  const base = 650 + Math.floor(Math.random() * 150);
  return {
    bureau: 'equifax',
    score: base,
    scoreType: profileType === 'business' ? 'sbss' : 'fico',
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
    score: base,
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
    score: base,
    scoreType: profileType === 'business' ? 'sbss' : 'fico',
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

        const result = callBureauApi(bureau, businessId, request.profileType);

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
            rawData: result.rawData as object,
            pulledAt: result.pulledAt,
          },
        });

        const dto = this.mapToDto(saved);
        profiles.push(dto);

        await this.checkAndEmitUtilizationAlerts(businessId, dto, ctx);

        logger.info('Credit profile stored', { businessId, bureau, profileId: saved.id });
      } catch (err) {
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
      const tradelines = (profile.tradelines as Tradeline[] | null) ?? [];

      for (const tl of tradelines) {
        if (typeof tl.creditLimit === 'number' && typeof tl.balance === 'number') {
          totalLimit += tl.creditLimit;
          totalBalance += tl.balance;
          hasData = true;
        }
      }

      // Also factor in the bureau-reported utilization if tradelines lack granularity
      if (!hasData && profile.utilization !== null) {
        return Number(profile.utilization);
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
      tradelines: (record.tradelines as Tradeline[]) ?? null,
      rawData: (record.rawData as Record<string, unknown>) ?? null,
      pulledAt: record.pulledAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
    };
  }
}
