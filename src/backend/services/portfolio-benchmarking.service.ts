// ============================================================
// CapitalForge — Portfolio Benchmarking Engine
//
// Responsibilities:
//   1. Approval rate benchmarking by issuer/industry/FICO/state
//   2. Promo survival rate (% who repay before APR kicks in)
//   3. Complaint rate by vendor/advisor/channel
//   4. Profitability analysis by cohort
//   5. Portfolio risk heatmap data
// ============================================================

import { PrismaClient } from '@prisma/client';
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

// ── Domain Types ──────────────────────────────────────────────

export interface BenchmarkDataPoint {
  label: string;
  approvalRate: number;
  sampleSize: number;
  approvedCount: number;
  declinedCount: number;
}

export interface ApprovalBenchmarks {
  byIssuer:   BenchmarkDataPoint[];
  byIndustry: BenchmarkDataPoint[];
  byFicoBand: BenchmarkDataPoint[];
  byState:    BenchmarkDataPoint[];
  asOf:       Date;
}

export interface PromoSurvivalRate {
  issuer:           string;
  totalRounds:      number;
  repaidBeforeApr:  number;
  survivalRate:     number;
  avgDaysToRepay:   number;
  avgFundingAmount: number;
}

export interface ComplaintRateItem {
  dimension:    string;
  value:        string;
  totalClients: number;
  complaints:   number;
  rate:         number;
}

export interface ComplaintRateSummary {
  byVendor:  ComplaintRateItem[];
  byAdvisor: ComplaintRateItem[];
  byChannel: ComplaintRateItem[];
}

export interface CohortProfitability {
  cohortKey:         string;   // e.g. "2025-Q1"
  clientCount:       number;
  totalRevenue:      number;
  totalFees:         number;
  netProfit:         number;
  avgRevenuePerClient: number;
  approvalRate:      number;
  churnRate:         number;
}

export interface RiskHeatmapCell {
  issuer:       string;
  ficoBand:     string;
  approvalRate: number;
  complaintRate: number;
  promoSurvivalRate: number;
  riskScore:    number;   // 0–100; higher = more risk
  sampleSize:   number;
}

export interface PortfolioRiskHeatmap {
  cells:    RiskHeatmapCell[];
  issuers:  string[];
  ficoBands: string[];
  asOf:     Date;
}

// ── FICO band helper ──────────────────────────────────────────

function ficoBand(score: number): string {
  if (score >= 800) return '800+';
  if (score >= 750) return '750-799';
  if (score >= 700) return '700-749';
  if (score >= 650) return '650-699';
  if (score >= 600) return '600-649';
  return 'Below 600';
}

// ── Quarter key helper ────────────────────────────────────────

function quarterKey(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}-Q${q}`;
}

// ── Benchmarking Service ──────────────────────────────────────

export class PortfolioBenchmarkingService {
  private get db(): PrismaClient {
    return getPrisma();
  }

  // ── Approval Rate Benchmarks ────────────────────────────────

  async getApprovalBenchmarks(tenantId: string): Promise<ApprovalBenchmarks> {
    const applications = await this.db.cardApplication.findMany({
      where: { business: { tenantId } },
      select: {
        id:         true,
        issuer:     true,
        status:     true,
        businessId: true,
        business: {
          select: {
            industry:         true,
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

    // Latest personal FICO per business
    const bizIds = [...new Set(applications.map((a) => a.businessId))];
    const profiles = await this.db.creditProfile.findMany({
      where: {
        businessId:  { in: bizIds },
        profileType: 'personal',
        scoreType:   { in: ['fico', 'vantage'] },
      },
      orderBy: { pulledAt: 'desc' },
      select:  { businessId: true, score: true },
    }) as Array<{ businessId: string; score: number | null }>;
    const scoreMap = new Map<string, number>();
    for (const p of profiles) {
      if (p.score !== null && !scoreMap.has(p.businessId)) {
        scoreMap.set(p.businessId, p.score);
      }
    }

    // Accumulator helpers
    type Bucket = { approved: number; total: number };
    const byIssuer    = new Map<string, Bucket>();
    const byIndustry  = new Map<string, Bucket>();
    const byFicoBand  = new Map<string, Bucket>();
    const byState     = new Map<string, Bucket>();

    function bump(map: Map<string, Bucket>, key: string, approved: boolean): void {
      const b = map.get(key) ?? { approved: 0, total: 0 };
      b.total += 1;
      if (approved) b.approved += 1;
      map.set(key, b);
    }

    for (const app of applications) {
      const isApproved = app.status === 'approved';
      bump(byIssuer,   app.issuer,                              isApproved);
      bump(byIndustry, app.business.industry ?? 'Unknown',      isApproved);
      bump(byState,    app.business.stateOfFormation ?? 'UNK',  isApproved);

      const score = scoreMap.get(app.businessId);
      bump(byFicoBand, score !== undefined ? ficoBand(score) : 'Unknown', isApproved);
    }

    function toPoints(map: Map<string, Bucket>): BenchmarkDataPoint[] {
      return [...map.entries()].map(([label, b]) => ({
        label,
        approvalRate:  b.total > 0 ? b.approved / b.total : 0,
        sampleSize:    b.total,
        approvedCount: b.approved,
        declinedCount: b.total - b.approved,
      }));
    }

    return {
      byIssuer:   toPoints(byIssuer),
      byIndustry: toPoints(byIndustry),
      byFicoBand: toPoints(byFicoBand),
      byState:    toPoints(byState),
      asOf:       new Date(),
    };
  }

  // ── Promo Survival Rate ─────────────────────────────────────

  /**
   * % of clients who fully repaid balances before the promo APR expiry.
   * Uses FundingRound + RepaymentPlan data.
   */
  async getPromoSurvivalRates(tenantId: string): Promise<PromoSurvivalRate[]> {
    const rounds = await this.db.fundingRound.findMany({
      where: {
        business: { tenantId },
        status:   'completed',
        aprExpiryDate: { not: null },
      },
      include: {
        applications: {
          select: {
            id:             true,
            issuer:         true,
            creditLimit:    true,
            introAprExpiry: true,
            status:         true,
          },
        },
        business: { select: { tenantId: true } },
      },
    }) as Array<{
      businessId:    string;
      startedAt:     Date | null;
      aprExpiryDate: Date | null;
      completedAt:   Date | null;
      business:      { tenantId: string };
      applications:  Array<{
        id: string;
        issuer: string;
        creditLimit: { toString(): string } | null;
        introAprExpiry: Date | null;
        status: string;
      }>;
    }>;

    // Repayment plans per business
    const bizIds = [...new Set(rounds.map((r) => r.businessId))];
    const repaymentPlans = await this.db.repaymentPlan.findMany({
      where: {
        tenantId,
        businessId: { in: bizIds },
      },
      select: {
        businessId:         true,
        status:             true,
        interestShockDate:  true,
        totalBalance:       true,
        schedules: {
          where:  { status: 'paid' },
          select: { paidAt: true, actualPayment: true },
          orderBy: { paidAt: 'asc' },
        },
      },
    });

    const repayMap = new Map<string, typeof repaymentPlans[0][]>();
    for (const rp of repaymentPlans) {
      const arr = repayMap.get(rp.businessId) ?? [];
      arr.push(rp);
      repayMap.set(rp.businessId, arr);
    }

    // Group by issuer
    const issuerMap = new Map<
      string,
      { total: number; repaid: number; daysSum: number; fundingSum: number }
    >();

    for (const round of rounds) {
      for (const app of round.applications) {
        if (app.status !== 'approved') continue;
        const key   = app.issuer;
        const entry = issuerMap.get(key) ?? { total: 0, repaid: 0, daysSum: 0, fundingSum: 0 };
        entry.total += 1;
        entry.fundingSum += Number(app.creditLimit ?? 0);

        // Check if there's a repayment plan completed before promo expiry
        const plans = repayMap.get(round.businessId) ?? [];
        const expiryDate = app.introAprExpiry ?? round.aprExpiryDate;

        if (expiryDate) {
          const completedBeforeExpiry = plans.some((plan) => {
            if (plan.status !== 'active') return false;
            const lastPaid = plan.schedules.at(-1)?.paidAt;
            return lastPaid && lastPaid < expiryDate;
          });

          if (completedBeforeExpiry) {
            entry.repaid += 1;
            // Estimate days to repay from first payment
            const firstPaid = plans
              .flatMap((p) => p.schedules)
              .map((s) => s.paidAt)
              .filter(Boolean)
              .sort()[0];
            if (firstPaid && round.startedAt) {
              entry.daysSum += Math.floor(
                (firstPaid!.getTime() - round.startedAt.getTime()) / (1000 * 60 * 60 * 24),
              );
            }
          }
        }

        issuerMap.set(key, entry);
      }
    }

    return [...issuerMap.entries()].map(([issuer, data]) => ({
      issuer,
      totalRounds:      data.total,
      repaidBeforeApr:  data.repaid,
      survivalRate:     data.total > 0 ? data.repaid / data.total : 0,
      avgDaysToRepay:   data.repaid > 0 ? data.daysSum / data.repaid : 0,
      avgFundingAmount: data.total > 0  ? data.fundingSum / data.total : 0,
    }));
  }

  // ── Complaint Rate ──────────────────────────────────────────

  async getComplaintRates(tenantId: string): Promise<ComplaintRateSummary> {
    const complaints = await this.db.complaint.findMany({
      where: { tenantId },
      select: {
        id:         true,
        businessId: true,
        source:     true,
        assignedTo: true,
      },
    }) as Array<{ id: string; businessId: string | null; source: string; assignedTo: string | null }>;

    // Total clients per advisor
    const advisorCounts = await this.db.business.groupBy({
      by:    ['advisorId'],
      where: { tenantId, advisorId: { not: null } },
      _count: { id: true },
    }) as Array<{ advisorId: string | null; _count: { id: number } }>;
    const advisorClientMap = new Map(
      advisorCounts.map((r) => [r.advisorId!, r._count.id]),
    );

    // Complaints per advisor
    const advisorComplaintMap = new Map<string, number>();
    for (const c of complaints) {
      if (c.assignedTo) {
        advisorComplaintMap.set(
          c.assignedTo,
          (advisorComplaintMap.get(c.assignedTo) ?? 0) + 1,
        );
      }
    }

    // Channel complaints from source field
    const channelComplaintMap = new Map<string, number>();
    const channelClientMap    = new Map<string, number>();
    for (const c of complaints) {
      channelComplaintMap.set(c.source, (channelComplaintMap.get(c.source) ?? 0) + 1);
    }

    // Channel client counts from referral attributions
    const attributions = await this.db.referralAttribution.findMany({
      where:  { tenantId, channel: { not: null } },
      select: { channel: true, businessId: true },
    }) as Array<{ channel: string | null; businessId: string }>;
    for (const attr of attributions) {
      const ch = attr.channel!;
      channelClientMap.set(ch, (channelClientMap.get(ch) ?? 0) + 1);
    }

    // Vendor complaint rates via partner names
    const partners = await this.db.partner.findMany({
      where:  { tenantId },
      select: { id: true, name: true },
    }) as Array<{ id: string; name: string }>;

    // We approximate vendor complaints by matching complaint source to partner names
    const vendorComplaintMap = new Map<string, { complaints: number; clients: number }>();
    for (const partner of partners) {
      const relatedComplaints = complaints.filter(
        (c) => c.source.toLowerCase().includes(partner.name.toLowerCase()),
      ).length;

      vendorComplaintMap.set(partner.name, {
        complaints: relatedComplaints,
        clients:    1, // placeholder; production would join referral data
      });
    }

    const byVendor: ComplaintRateItem[] = [...vendorComplaintMap.entries()].map(
      ([name, data]) => ({
        dimension:    'vendor',
        value:        name,
        totalClients: data.clients,
        complaints:   data.complaints,
        rate:         data.clients > 0 ? data.complaints / data.clients : 0,
      }),
    );

    const totalClients = await this.db.business.count({ where: { tenantId } });

    const byAdvisor: ComplaintRateItem[] = [...advisorComplaintMap.entries()].map(
      ([advisorId, count]) => ({
        dimension:    'advisor',
        value:        advisorId,
        totalClients: advisorClientMap.get(advisorId) ?? 0,
        complaints:   count,
        rate:         (advisorClientMap.get(advisorId) ?? 0) > 0
          ? count / advisorClientMap.get(advisorId)!
          : 0,
      }),
    );

    const byChannel: ComplaintRateItem[] = [...channelComplaintMap.entries()].map(
      ([ch, count]) => ({
        dimension:    'channel',
        value:        ch,
        totalClients: channelClientMap.get(ch) ?? 0,
        complaints:   count,
        rate:         (channelClientMap.get(ch) ?? 0) > 0
          ? count / channelClientMap.get(ch)!
          : 0,
      }),
    );

    return { byVendor, byAdvisor, byChannel };
  }

  // ── Cohort Profitability ────────────────────────────────────

  async getCohortProfitability(tenantId: string): Promise<CohortProfitability[]> {
    const businesses = await this.db.business.findMany({
      where:  { tenantId },
      select: { id: true, createdAt: true },
    }) as Array<{ id: string; createdAt: Date }>;

    // Group businesses by quarter cohort
    const cohortBizMap = new Map<string, string[]>();
    for (const biz of businesses) {
      const key = quarterKey(biz.createdAt);
      const arr = cohortBizMap.get(key) ?? [];
      arr.push(biz.id);
      cohortBizMap.set(key, arr);
    }

    const results: CohortProfitability[] = [];

    for (const [cohortKey, bizIds] of cohortBizMap.entries()) {
      // Revenue from invoices
      const invoices = await this.db.invoice.findMany({
        where:  { tenantId, businessId: { in: bizIds } },
        select: { amount: true, status: true },
      }) as Array<{ amount: { toString(): string }; status: string }>;

      const totalRevenue = invoices
        .filter((i: { status: string }) => i.status === 'paid')
        .reduce((sum: number, i: { amount: { toString(): string } }) => sum + Number(i.amount), 0);

      // Cost: sum of cost calculations program fees
      const costCalcs = await this.db.costCalculation.findMany({
        where:  { businessId: { in: bizIds } },
        select: { programFees: true, totalCost: true },
      }) as Array<{ programFees: { toString(): string }; totalCost: { toString(): string } }>;
      const totalFees = costCalcs.reduce((sum: number, c) => sum + Number(c.programFees), 0);
      const netProfit  = totalRevenue - totalFees;

      // Approval rate
      const applications = await this.db.cardApplication.findMany({
        where:  { businessId: { in: bizIds } },
        select: { status: true },
      }) as Array<{ status: string }>;
      const appTotal    = applications.length;
      const appApproved = applications.filter((a: { status: string }) => a.status === 'approved').length;

      // Churn rate: businesses in 'churned' stage
      const churnedCount = await this.db.pipelineStage.count({
        where: { tenantId, businessId: { in: bizIds }, stage: 'churned', exitedAt: null },
      });

      results.push({
        cohortKey,
        clientCount:           bizIds.length,
        totalRevenue,
        totalFees,
        netProfit,
        avgRevenuePerClient:   bizIds.length > 0 ? totalRevenue / bizIds.length : 0,
        approvalRate:          appTotal > 0 ? appApproved / appTotal : 0,
        churnRate:             bizIds.length > 0 ? churnedCount / bizIds.length : 0,
      });
    }

    return results.sort((a, b) => a.cohortKey.localeCompare(b.cohortKey));
  }

  // ── Portfolio Risk Heatmap ──────────────────────────────────

  async getPortfolioRiskHeatmap(tenantId: string): Promise<PortfolioRiskHeatmap> {
    const applications = await this.db.cardApplication.findMany({
      where: { business: { tenantId } },
      select: {
        id:         true,
        issuer:     true,
        status:     true,
        businessId: true,
      },
    }) as Array<{ id: string; issuer: string; status: string; businessId: string }>;

    const bizIds = [...new Set(applications.map((a) => a.businessId))];

    // FICO scores
    const profiles = await this.db.creditProfile.findMany({
      where: {
        businessId:  { in: bizIds },
        profileType: 'personal',
        scoreType:   { in: ['fico', 'vantage'] },
      },
      orderBy: { pulledAt: 'desc' },
      select:  { businessId: true, score: true },
    }) as Array<{ businessId: string; score: number | null }>;
    const scoreMap = new Map<string, number>();
    for (const p of profiles) {
      if (p.score !== null && !scoreMap.has(p.businessId)) {
        scoreMap.set(p.businessId, p.score);
      }
    }

    // Complaints per business
    const complaints = await this.db.complaint.findMany({
      where:  { tenantId, businessId: { not: null } },
      select: { businessId: true },
    });
    const bizComplaintMap = new Map<string, number>();
    for (const c of complaints) {
      if (c.businessId) {
        bizComplaintMap.set(c.businessId, (bizComplaintMap.get(c.businessId) ?? 0) + 1);
      }
    }

    // Promo survival approximation via funding rounds
    const fundingRounds = await this.db.fundingRound.findMany({
      where: { business: { tenantId }, aprExpiryDate: { not: null } },
      select: {
        businessId:   true,
        completedAt:  true,
        aprExpiryDate: true,
      },
    });
    const bizPromoMap = new Map<string, { total: number; survived: number }>();
    for (const r of fundingRounds) {
      const entry = bizPromoMap.get(r.businessId) ?? { total: 0, survived: 0 };
      entry.total += 1;
      if (r.completedAt && r.aprExpiryDate && r.completedAt < r.aprExpiryDate) {
        entry.survived += 1;
      }
      bizPromoMap.set(r.businessId, entry);
    }

    // Build cell map: issuer × ficoBand
    type CellData = {
      approved:      number;
      total:         number;
      complaints:    number;
      promoSurvived: number;
      promoTotal:    number;
    };

    const cellMap = new Map<string, CellData>();

    for (const app of applications) {
      const score = scoreMap.get(app.businessId);
      const band  = score !== undefined ? ficoBand(score) : 'Unknown';
      const key   = `${app.issuer}|||${band}`;

      const cell = cellMap.get(key) ?? {
        approved: 0, total: 0, complaints: 0, promoSurvived: 0, promoTotal: 0,
      };
      cell.total += 1;
      if (app.status === 'approved') cell.approved += 1;
      cell.complaints += bizComplaintMap.get(app.businessId) ?? 0;

      const promo = bizPromoMap.get(app.businessId);
      if (promo) {
        cell.promoTotal    += promo.total;
        cell.promoSurvived += promo.survived;
      }

      cellMap.set(key, cell);
    }

    const issuersSet   = new Set<string>();
    const ficoBandsSet = new Set<string>();

    const cells: RiskHeatmapCell[] = [...cellMap.entries()].map(([key, data]) => {
      const [issuer, ficoBand] = key.split('|||');
      issuersSet.add(issuer);
      ficoBandsSet.add(ficoBand);

      const approvalRate      = data.total > 0 ? data.approved / data.total : 0;
      const complaintRate     = data.total > 0 ? data.complaints / data.total : 0;
      const promoSurvivalRate = data.promoTotal > 0 ? data.promoSurvived / data.promoTotal : 0;

      // Risk score: lower approval = higher risk, higher complaint rate = higher risk,
      // lower promo survival = higher risk
      const riskScore = Math.min(
        100,
        Math.round(
          (1 - approvalRate) * 40 +
          complaintRate * 30 +
          (1 - promoSurvivalRate) * 30,
        ),
      );

      return {
        issuer,
        ficoBand,
        approvalRate,
        complaintRate,
        promoSurvivalRate,
        riskScore,
        sampleSize: data.total,
      };
    });

    return {
      cells,
      issuers:   [...issuersSet].sort(),
      ficoBands: [...ficoBandsSet].sort(),
      asOf:      new Date(),
    };
  }
}
