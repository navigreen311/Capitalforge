// ============================================================
// CapitalForge — CRM & Revenue Analytics Service
//
// Responsibilities:
//   1. Client lifecycle pipeline: prospect → onboarding → active → graduated
//   2. Revenue tracking: fees per client, per advisor, per channel
//   3. Approval rate analytics by issuer, FICO band, industry, state
//   4. Advisor performance dashboard data
//   5. Universal timeline view per client
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';

// ── Prisma singleton ──────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── Pipeline stage constants ──────────────────────────────────

export const PIPELINE_STAGES = {
  PROSPECT:    'prospect',
  ONBOARDING:  'onboarding',
  ACTIVE:      'active',
  GRADUATED:   'graduated',
  CHURNED:     'churned',
} as const;

export type PipelineStageValue = (typeof PIPELINE_STAGES)[keyof typeof PIPELINE_STAGES];

// ── Domain Types ──────────────────────────────────────────────

export interface PipelineStageRecord {
  id: string;
  tenantId: string;
  businessId: string;
  stage: PipelineStageValue;
  enteredAt: Date;
  exitedAt?: Date | null;
  advisorId?: string | null;
  notes?: string | null;
}

export interface PipelineSummary {
  stage: PipelineStageValue;
  count: number;
  businesses: Array<{
    businessId: string;
    legalName: string;
    advisorId: string | null;
    enteredAt: Date;
    daysInStage: number;
  }>;
}

export interface RevenueByAdvisor {
  advisorId: string;
  advisorName: string;
  totalRevenue: number;
  clientCount: number;
  avgRevenuePerClient: number;
  paidInvoices: number;
  pendingInvoices: number;
}

export interface RevenueByChannel {
  channel: string;
  totalRevenue: number;
  clientCount: number;
  conversionRate: number;
}

export interface RevenueAnalytics {
  totalRevenue: number;
  totalPaid: number;
  totalPending: number;
  revenueByAdvisor: RevenueByAdvisor[];
  revenueByChannel: RevenueByChannel[];
  revenueByMonth: Array<{ month: string; revenue: number }>;
  topClients: Array<{ businessId: string; legalName: string; totalFees: number }>;
}

export interface ApprovalRateBreakdown {
  dimension: string;
  value: string;
  totalApplications: number;
  approved: number;
  declined: number;
  pending: number;
  approvalRate: number;
}

export interface ApprovalRateAnalytics {
  overall: { totalApplications: number; approved: number; approvalRate: number };
  byIssuer: ApprovalRateBreakdown[];
  byFicoBand: ApprovalRateBreakdown[];
  byIndustry: ApprovalRateBreakdown[];
  byState: ApprovalRateBreakdown[];
}

export interface AdvisorPerformance {
  advisorId: string;
  advisorName: string;
  activeClients: number;
  totalClients: number;
  graduatedClients: number;
  churnedClients: number;
  totalRevenue: number;
  avgDealSize: number;
  approvalRate: number;
  avgQaScore: number;
  qaScoreCount: number;
  pipeline: Record<PipelineStageValue, number>;
  recentActivity: TimelineEvent[];
}

export interface TimelineEvent {
  id: string;
  businessId: string;
  eventType: string;
  description: string;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}

export interface PipelineTransitionInput {
  tenantId: string;
  businessId: string;
  toStage: PipelineStageValue;
  advisorId?: string;
  notes?: string;
}

// ── FICO Band helper ──────────────────────────────────────────

function ficoBand(score: number): string {
  if (score >= 800) return '800+';
  if (score >= 750) return '750-799';
  if (score >= 700) return '700-749';
  if (score >= 650) return '650-699';
  if (score >= 600) return '600-649';
  return 'Below 600';
}

// ── CRM Service ───────────────────────────────────────────────

export class CrmService {
  private get db(): PrismaClient {
    return getPrisma();
  }

  // ── Pipeline Management ─────────────────────────────────────

  /**
   * Transition a client to a new pipeline stage.
   * Closes the current open stage record and opens a new one.
   */
  async transitionStage(input: PipelineTransitionInput): Promise<PipelineStageRecord> {
    const { tenantId, businessId, toStage, advisorId, notes } = input;

    // Verify business exists in tenant
    const business = await this.db.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new Error(`Business ${businessId} not found in tenant ${tenantId}`);
    }

    // Close any currently open stage record
    await this.db.$executeRawUnsafe(
      `UPDATE pipeline_stages SET "exitedAt" = NOW()
       WHERE "tenantId" = $1 AND "businessId" = $2 AND "exitedAt" IS NULL`,
      tenantId,
      businessId,
    );

    // Open new stage
    const newStage = await this.db.pipelineStage.create({
      data: {
        id: uuidv4(),
        tenantId,
        businessId,
        stage: toStage,
        advisorId: advisorId ?? null,
        notes: notes ?? null,
      },
    });

    logger.info('Pipeline stage transitioned', { tenantId, businessId, toStage });

    return {
      id:         newStage.id,
      tenantId:   newStage.tenantId,
      businessId: newStage.businessId,
      stage:      newStage.stage as PipelineStageValue,
      enteredAt:  newStage.enteredAt,
      exitedAt:   newStage.exitedAt ?? null,
      advisorId:  newStage.advisorId ?? null,
      notes:      newStage.notes ?? null,
    };
  }

  /**
   * Return pipeline summary grouped by stage with business details.
   */
  async getPipelineSummary(tenantId: string): Promise<PipelineSummary[]> {
    // Get all open stage records (no exitedAt) joined with businesses
    const openStages = await this.db.pipelineStage.findMany({
      where: { tenantId, exitedAt: null },
      orderBy: { enteredAt: 'asc' },
    }) as Array<{ businessId: string; stage: string; advisorId: string | null; enteredAt: Date }>;

    // Collect unique business IDs for name lookups
    const businessIds = [...new Set(openStages.map((s) => s.businessId))];
    const businesses = await this.db.business.findMany({
      where: { id: { in: businessIds }, tenantId },
      select: { id: true, legalName: true, advisorId: true },
    }) as Array<{ id: string; legalName: string; advisorId: string | null }>;
    const bizMap = new Map(businesses.map((b) => [b.id, b]));

    const now = new Date();
    const stageMap = new Map<PipelineStageValue, PipelineSummary>();

    for (const stageName of Object.values(PIPELINE_STAGES)) {
      stageMap.set(stageName, { stage: stageName, count: 0, businesses: [] });
    }

    for (const record of openStages) {
      const biz = bizMap.get(record.businessId);
      const summary = stageMap.get(record.stage as PipelineStageValue);
      if (!summary) continue;

      const daysInStage = Math.floor(
        (now.getTime() - record.enteredAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      summary.count += 1;
      summary.businesses.push({
        businessId:  record.businessId,
        legalName:   biz?.legalName ?? 'Unknown',
        advisorId:   record.advisorId ?? biz?.advisorId ?? null,
        enteredAt:   record.enteredAt,
        daysInStage,
      });
    }

    return [...stageMap.values()];
  }

  // ── Revenue Analytics ───────────────────────────────────────

  /**
   * Revenue analytics: by advisor, channel, month, and top clients.
   */
  async getRevenueAnalytics(tenantId: string, fromDate?: Date, toDate?: Date): Promise<RevenueAnalytics> {
    const dateFilter = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate   ? { lte: toDate }   : {}),
    };

    const invoices = await this.db.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['paid', 'issued', 'overdue'] },
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      },
    }) as Array<{ amount: { toString(): string }; status: string; businessId: string; createdAt: Date }>;

    const totalRevenue = invoices.reduce((sum: number, inv) => sum + Number(inv.amount), 0);
    const totalPaid    = invoices
      .filter((i) => i.status === 'paid')
      .reduce((sum: number, inv) => sum + Number(inv.amount), 0);
    const totalPending = invoices
      .filter((i) => i.status !== 'paid')
      .reduce((sum: number, inv) => sum + Number(inv.amount), 0);

    // Revenue by advisor via CommissionRecord
    const commissions = await this.db.commissionRecord.findMany({
      where: { tenantId, advisorId: { not: null } },
    }) as Array<{ amount: { toString(): string }; status: string; advisorId: string | null }>;

    const advisorIds = [...new Set(commissions.map((c) => c.advisorId!))];
    const advisorUsers = await this.db.user.findMany({
      where: { id: { in: advisorIds }, tenantId },
      select: { id: true, firstName: true, lastName: true },
    }) as Array<{ id: string; firstName: string; lastName: string }>;
    const advisorMap = new Map(advisorUsers.map((u) => [u.id, u]));

    // Group commissions per advisor
    const advisorRevMap = new Map<string, { total: number; paid: number; pending: number }>();
    for (const comm of commissions) {
      if (!comm.advisorId) continue;
      const entry = advisorRevMap.get(comm.advisorId) ?? { total: 0, paid: 0, pending: 0 };
      const amt = Number(comm.amount);
      entry.total += amt;
      if (comm.status === 'paid') entry.paid += amt;
      else entry.pending += amt;
      advisorRevMap.set(comm.advisorId, entry);
    }

    // Client counts per advisor
    const advisorClientCounts = await this.db.business.groupBy({
      by:    ['advisorId'],
      where: { tenantId, advisorId: { in: advisorIds } },
      _count: { id: true },
    }) as Array<{ advisorId: string | null; _count: { id: number } }>;
    const clientCountMap = new Map(
      advisorClientCounts.map((r) => [r.advisorId, r._count.id]),
    );

    const revenueByAdvisor: RevenueByAdvisor[] = advisorIds.map((id) => {
      const user     = advisorMap.get(id);
      const rev      = advisorRevMap.get(id) ?? { total: 0, paid: 0, pending: 0 };
      const clients  = clientCountMap.get(id) ?? 0;
      return {
        advisorId:           id,
        advisorName:         user ? `${user.firstName} ${user.lastName}` : id,
        totalRevenue:        rev.total,
        clientCount:         clients as number,
        avgRevenuePerClient: (clients as number) > 0 ? rev.total / (clients as number) : 0,
        paidInvoices:        rev.paid,
        pendingInvoices:     rev.pending,
      };
    });

    // Revenue by channel via ReferralAttribution
    const attributions = await this.db.referralAttribution.findMany({
      where: { tenantId, channel: { not: null } },
    });

    const channelMap = new Map<string, { revenue: number; clients: Set<string> }>();
    for (const attr of attributions) {
      const ch = attr.channel ?? 'unknown';
      const entry = channelMap.get(ch) ?? { revenue: 0, clients: new Set() };
      entry.revenue += Number(attr.feeAmount ?? 0);
      entry.clients.add(attr.businessId);
      channelMap.set(ch, entry);
    }

    const totalBizCount = await this.db.business.count({ where: { tenantId } });
    const revenueByChannel: RevenueByChannel[] = [...channelMap.entries()].map(([ch, data]) => ({
      channel:        ch,
      totalRevenue:   data.revenue,
      clientCount:    data.clients.size,
      conversionRate: totalBizCount > 0 ? data.clients.size / totalBizCount : 0,
    }));

    // Revenue by month (from invoices)
    const monthMap = new Map<string, number>();
    for (const inv of invoices) {
      const d   = inv.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) ?? 0) + Number(inv.amount));
    }
    const revenueByMonth = [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue }));

    // Top clients by invoice total
    const clientInvMap = new Map<string, number>();
    for (const inv of invoices) {
      clientInvMap.set(inv.businessId, (clientInvMap.get(inv.businessId) ?? 0) + Number(inv.amount));
    }

    const topClientIds = [...clientInvMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([id]) => id);

    const topClientBiz = await this.db.business.findMany({
      where: { id: { in: topClientIds }, tenantId },
      select: { id: true, legalName: true },
    }) as Array<{ id: string; legalName: string }>;
    const topClientBizMap = new Map(topClientBiz.map((b) => [b.id, b]));

    const topClients = topClientIds.map((id) => ({
      businessId: id,
      legalName:  topClientBizMap.get(id)?.legalName ?? 'Unknown',
      totalFees:  clientInvMap.get(id) ?? 0,
    }));

    return {
      totalRevenue,
      totalPaid,
      totalPending,
      revenueByAdvisor,
      revenueByChannel,
      revenueByMonth,
      topClients,
    };
  }

  // ── Approval Rate Analytics ─────────────────────────────────

  /**
   * Approval rate breakdowns by issuer, FICO band, industry, and state.
   */
  async getApprovalRateAnalytics(tenantId: string): Promise<ApprovalRateAnalytics> {
    const applications = await this.db.cardApplication.findMany({
      where: { business: { tenantId } },
      select: {
        id:        true,
        issuer:    true,
        status:    true,
        businessId: true,
        business: {
          select: {
            industry:        true,
            stateOfFormation: true,
          },
        },
      },
    }) as Array<{
      id: string;
      issuer: string;
      status: string;
      businessId: string;
      business: { industry: string | null; stateOfFormation: string | null };
    }>;

    // Fetch personal FICO scores for each unique business
    const bizIds = [...new Set(applications.map((a) => a.businessId))];
    const creditProfiles = await this.db.creditProfile.findMany({
      where: {
        businessId: { in: bizIds },
        profileType: 'personal',
        scoreType:   { in: ['fico', 'vantage'] },
      },
      orderBy: { pulledAt: 'desc' },
      select:  { businessId: true, score: true },
    }) as Array<{ businessId: string; score: number | null }>;

    // Latest score per business
    const scoreMap = new Map<string, number>();
    for (const cp of creditProfiles) {
      if (cp.score !== null && !scoreMap.has(cp.businessId)) {
        scoreMap.set(cp.businessId, cp.score);
      }
    }

    // Helper to tally counts
    function tally(
      key: string,
      dimension: string,
      status: string,
      acc: Map<string, ApprovalRateBreakdown>,
    ): void {
      const entry = acc.get(key) ?? {
        dimension,
        value:            key,
        totalApplications: 0,
        approved:         0,
        declined:         0,
        pending:          0,
        approvalRate:     0,
      };
      entry.totalApplications += 1;
      if (status === 'approved') entry.approved += 1;
      else if (status === 'declined') entry.declined += 1;
      else entry.pending += 1;
      acc.set(key, entry);
    }

    const issuerMap    = new Map<string, ApprovalRateBreakdown>();
    const ficoMap      = new Map<string, ApprovalRateBreakdown>();
    const industryMap  = new Map<string, ApprovalRateBreakdown>();
    const stateMap     = new Map<string, ApprovalRateBreakdown>();

    let totalApps = 0;
    let totalApproved = 0;

    for (const app of applications) {
      totalApps += 1;
      if (app.status === 'approved') totalApproved += 1;

      tally(app.issuer,                              'issuer',   app.status, issuerMap);
      tally(app.business.industry ?? 'Unknown',      'industry', app.status, industryMap);
      tally(app.business.stateOfFormation ?? 'UNK',  'state',    app.status, stateMap);

      const score = scoreMap.get(app.businessId);
      const band  = score !== undefined ? ficoBand(score) : 'Unknown';
      tally(band, 'fico_band', app.status, ficoMap);
    }

    function finalizeRates(map: Map<string, ApprovalRateBreakdown>): ApprovalRateBreakdown[] {
      return [...map.values()].map((entry) => ({
        ...entry,
        approvalRate: entry.totalApplications > 0
          ? entry.approved / entry.totalApplications
          : 0,
      }));
    }

    return {
      overall: {
        totalApplications: totalApps,
        approved:          totalApproved,
        approvalRate:      totalApps > 0 ? totalApproved / totalApps : 0,
      },
      byIssuer:   finalizeRates(issuerMap),
      byFicoBand: finalizeRates(ficoMap),
      byIndustry: finalizeRates(industryMap),
      byState:    finalizeRates(stateMap),
    };
  }

  // ── Advisor Performance ─────────────────────────────────────

  /**
   * Full performance dashboard data for one advisor.
   */
  async getAdvisorPerformance(advisorId: string, tenantId: string): Promise<AdvisorPerformance> {
    const advisor = await this.db.user.findFirst({
      where: { id: advisorId, tenantId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!advisor) {
      throw new Error(`Advisor ${advisorId} not found in tenant ${tenantId}`);
    }

    // Clients assigned to this advisor
    const clients = await this.db.business.findMany({
      where: { advisorId, tenantId },
      select: { id: true },
    }) as Array<{ id: string }>;
    const clientIds = clients.map((c) => c.id);

    // Pipeline stage breakdown (current open stages)
    const stageRecords = await this.db.pipelineStage.findMany({
      where: { tenantId, businessId: { in: clientIds }, exitedAt: null },
    });

    const pipeline: Record<PipelineStageValue, number> = {
      prospect:   0,
      onboarding: 0,
      active:     0,
      graduated:  0,
      churned:    0,
    };
    for (const rec of stageRecords) {
      const s = rec.stage as PipelineStageValue;
      if (s in pipeline) pipeline[s] += 1;
    }

    // Revenue: sum of commissions paid to this advisor
    const commissions = await this.db.commissionRecord.findMany({
      where: { tenantId, advisorId },
    }) as Array<{ amount: { toString(): string }; status: string }>;
    const totalRevenue = commissions.reduce((sum: number, c) => sum + Number(c.amount), 0);
    const paidCount    = commissions.filter((c) => c.status === 'paid').length;

    // Approval rate for applications on this advisor's clients
    const applications = await this.db.cardApplication.findMany({
      where:  { businessId: { in: clientIds } },
      select: { status: true },
    }) as Array<{ status: string }>;
    const appTotal    = applications.length;
    const appApproved = applications.filter((a) => a.status === 'approved').length;
    const approvalRate = appTotal > 0 ? appApproved / appTotal : 0;

    // QA scores
    const qaScores = await this.db.advisorQaScore.findMany({
      where:  { tenantId, advisorId },
      select: { overallScore: true, scoredAt: true },
      orderBy: { scoredAt: 'desc' },
      take:   100,
    }) as Array<{ overallScore: number; scoredAt: Date }>;
    const avgQaScore = qaScores.length > 0
      ? qaScores.reduce((sum: number, s) => sum + s.overallScore, 0) / qaScores.length
      : 0;

    // Recent timeline events (last 20 ledger events for advisor's clients)
    const recentEvents = await this.db.ledgerEvent.findMany({
      where:  { tenantId, aggregateId: { in: clientIds } },
      orderBy: { publishedAt: 'desc' },
      take:   20,
    }) as Array<{ id: string; aggregateId: string; eventType: string; aggregateType: string; payload: unknown; publishedAt: Date }>;

    const recentActivity: TimelineEvent[] = recentEvents.map((ev) => ({
      id:          ev.id,
      businessId:  ev.aggregateId,
      eventType:   ev.eventType,
      description: `${ev.eventType} on ${ev.aggregateType} ${ev.aggregateId}`,
      metadata:    ev.payload as Record<string, unknown>,
      occurredAt:  ev.publishedAt,
    }));

    return {
      advisorId,
      advisorName:      `${advisor.firstName} ${advisor.lastName}`,
      activeClients:    pipeline.active,
      totalClients:     clientIds.length,
      graduatedClients: pipeline.graduated,
      churnedClients:   pipeline.churned,
      totalRevenue,
      avgDealSize:      paidCount > 0 ? totalRevenue / paidCount : 0,
      approvalRate,
      avgQaScore,
      qaScoreCount:     qaScores.length,
      pipeline,
      recentActivity,
    };
  }

  // ── Universal Timeline ──────────────────────────────────────

  /**
   * Full chronological timeline for a single client.
   */
  async getClientTimeline(businessId: string, tenantId: string): Promise<TimelineEvent[]> {
    // Verify ownership
    const biz = await this.db.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!biz) throw new Error(`Business ${businessId} not found in tenant ${tenantId}`);

    const events = await this.db.ledgerEvent.findMany({
      where:  { tenantId, aggregateId: businessId },
      orderBy: { publishedAt: 'desc' },
      take:   200,
    }) as Array<{ id: string; aggregateId: string; eventType: string; payload: unknown; publishedAt: Date }>;

    return events.map((ev) => ({
      id:          ev.id,
      businessId:  ev.aggregateId,
      eventType:   ev.eventType,
      description: `${ev.eventType}`,
      metadata:    ev.payload as Record<string, unknown>,
      occurredAt:  ev.publishedAt,
    }));
  }
}
