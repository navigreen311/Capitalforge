// ============================================================
// CapitalForge — Section 1071 / Fair-Lending Readiness Service
//
// Responsibilities:
//   1. 1071 data capture readiness
//   2. Adverse-action reporting in 1071 format
//   3. Fair-lending monitoring dashboards
//   4. Demographic data segregation (firewalled from underwriting)
//   5. Activation trigger when deal volume hits coverage threshold
//
// CFPB Section 1071 (ECOA): Requires covered financial
// institutions to collect and report SBLA application data
// including demographic information, firewall-separated from
// the underwriting decision.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { AGGREGATE_TYPES } from '../../shared/constants/index.js';
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

// ── Section 1071 Coverage Threshold ──────────────────────────
// CFPB rule: 100+ covered applications per calendar year
// triggers mandatory reporting.

export const SECTION_1071_COVERAGE_THRESHOLD = 100;

// ── Types ─────────────────────────────────────────────────────

export type ActionTaken =
  | 'approved_and_originated'
  | 'approved_not_accepted'
  | 'denied'
  | 'withdrawn_by_applicant'
  | 'incomplete';

export type CreditPurpose =
  | 'term_loan'
  | 'line_of_credit'
  | 'business_credit_card'
  | 'merchant_cash_advance'
  | 'equipment_financing'
  | 'other';

export interface DemographicData {
  // CFPB 1071 demographic fields — collected but firewalled from underwriting
  ownerSex?:       'male' | 'female' | 'nonbinary' | 'declined_to_provide';
  ownerRace?:      string[];   // Multi-select per CFPB codes
  ownerEthnicity?: 'hispanic_or_latino' | 'not_hispanic_or_latino' | 'declined_to_provide';
  numberOfOwners?: number;
  lgbtqiOwned?:    boolean | null;
}

export interface Create1071RecordInput {
  tenantId:       string;
  businessId:     string;
  applicationId?: string;
  creditPurpose:  CreditPurpose;
  actionTaken:    ActionTaken;
  actionDate:     Date;
  adverseReasons?: string[];
  demographicData?: DemographicData;
  businessType?:  string;
}

export interface AdverseActionReport1071 {
  recordId:        string;
  applicationId:   string | null;
  actionDate:      string;
  actionTaken:     string;
  adverseReasons:  string[];
  creditPurpose:   string | null;
  businessType:    string | null;
  isFirewalled:    boolean;
  // Demographic fields are excluded unless accessed through the firewall-cleared report endpoint
}

export interface FairLendingDashboard {
  tenantId:                 string;
  reportingYear:            number;
  totalApplications:        number;
  approvalRate:             number;
  denialRate:               number;
  withdrawalRate:           number;
  applicationsByPurpose:    Record<string, number>;
  actionsByType:            Record<string, number>;
  topAdverseReasons:        Array<{ reason: string; count: number }>;
  coverageStatus:           '1071_triggered' | 'below_threshold' | 'approaching_threshold';
  coverageThreshold:        number;
  recordsWithDemographics:  number;
  demographicCompletionRate: number;
}

export interface CoverageCheckResult {
  tenantId:           string;
  year:               number;
  applicationCount:   number;
  threshold:          number;
  triggered:          boolean;
  percentToThreshold: number;
}

// ── Standard CFPB 1071 adverse action reason codes ────────────

export const CFPB_ADVERSE_REASON_CODES: Record<string, string> = {
  '01': 'Credit application incomplete',
  '02': 'Insufficient number of credit references provided',
  '03': 'Unable to verify credit references',
  '04': 'Temporary or irregular employment',
  '05': 'Unable to verify employment',
  '06': 'Length of employment',
  '07': 'Insufficient income',
  '08': 'Excessive obligations',
  '09': 'Unable to verify income',
  '10': 'Limited credit experience',
  '11': 'Poor credit performance with us',
  '12': 'Delinquent past or present credit obligations with others',
  '13': 'Collection action or judgment',
  '14': 'Garnishment or attachment',
  '15': 'Foreclosure or repossession',
  '16': 'Bankruptcy',
  '17': 'Number of recent inquiries on credit bureau report',
  '18': 'Unable to verify residence',
  '19': 'Length of residence',
  '20': 'Temporary residence',
  '21': 'Does not meet length-in-business requirements',
  '22': 'Insufficient business operating history',
  '23': 'Insufficient business revenue or cash flow',
  '24': 'Insufficient collateral',
  '25': 'Unacceptable type of collateral',
  '26': 'Insufficient cash flow',
  '27': 'Business not profitable',
  '28': 'Excessive business obligations',
};

// ── Service ───────────────────────────────────────────────────

export class FairLendingService {
  constructor(private prisma: PrismaClient = getPrisma()) {}

  // ── 1071 Record Creation ────────────────────────────────────

  async create1071Record(input: Create1071RecordInput): Promise<{ id: string }> {
    // Demographic data is stored in the fair_lending_records table,
    // which is separate from underwriting data (isFirewalled = true).
    const record = await this.prisma.fairLendingRecord.create({
      data: {
        tenantId:       input.tenantId,
        businessId:     input.businessId,
        applicationId:  input.applicationId ?? null,
        demographicData: input.demographicData
          ? (input.demographicData as unknown as object)
          : null,
        businessType:   input.businessType ?? null,
        creditPurpose:  input.creditPurpose,
        actionTaken:    input.actionTaken,
        actionDate:     input.actionDate,
        adverseReasons: input.adverseReasons
          ? (input.adverseReasons as unknown as object)
          : null,
        isFirewalled:   true,
      },
    });

    logger.info('1071 record created', { recordId: record.id, tenantId: input.tenantId });

    // Check if coverage threshold is now triggered
    await this.checkAndLogCoverageThreshold(input.tenantId);

    return { id: record.id };
  }

  // ── Adverse Action Report (1071 format) ─────────────────────

  async getAdverseActionReport(
    tenantId: string,
    filters: { year?: number; applicationId?: string; businessId?: string } = {},
  ): Promise<AdverseActionReport1071[]> {
    const yearStart = filters.year
      ? new Date(filters.year, 0, 1)
      : new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = filters.year
      ? new Date(filters.year + 1, 0, 1)
      : new Date(new Date().getFullYear() + 1, 0, 1);

    const records = await this.prisma.fairLendingRecord.findMany({
      where: {
        tenantId,
        actionTaken:  'denied',
        ...(filters.applicationId && { applicationId: filters.applicationId }),
        ...(filters.businessId    && { businessId:    filters.businessId }),
        actionDate: { gte: yearStart, lt: yearEnd },
      },
      orderBy: { actionDate: 'desc' },
    });

    return records.map((r) => ({
      recordId:       r.id,
      applicationId:  r.applicationId,
      actionDate:     r.actionDate?.toISOString() ?? '',
      actionTaken:    r.actionTaken ?? '',
      adverseReasons: (r.adverseReasons as string[]) ?? [],
      creditPurpose:  r.creditPurpose,
      businessType:   r.businessType,
      isFirewalled:   r.isFirewalled,
      // Demographic data intentionally excluded from standard adverse action view
    }));
  }

  // ── Dashboard ────────────────────────────────────────────────

  async getDashboard(tenantId: string, year?: number): Promise<FairLendingDashboard> {
    const reportingYear = year ?? new Date().getFullYear();
    const yearStart = new Date(reportingYear, 0, 1);
    const yearEnd   = new Date(reportingYear + 1, 0, 1);

    const records = await this.prisma.fairLendingRecord.findMany({
      where: {
        tenantId,
        createdAt: { gte: yearStart, lt: yearEnd },
      },
    });

    const total = records.length;
    const actionCounts = records.reduce(
      (acc, r) => {
        const key = r.actionTaken ?? 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const purposeCounts = records.reduce(
      (acc, r) => {
        const key = r.creditPurpose ?? 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Tally adverse reasons
    const adverseReasonCounts: Record<string, number> = {};
    for (const r of records) {
      if (r.adverseReasons) {
        const reasons = r.adverseReasons as string[];
        for (const reason of reasons) {
          adverseReasonCounts[reason] = (adverseReasonCounts[reason] ?? 0) + 1;
        }
      }
    }
    const topAdverseReasons = Object.entries(adverseReasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));

    const approved   = (actionCounts['approved_and_originated'] ?? 0) + (actionCounts['approved_not_accepted'] ?? 0);
    const denied     = actionCounts['denied'] ?? 0;
    const withdrawn  = actionCounts['withdrawn_by_applicant'] ?? 0;

    const approvalRate   = total > 0 ? Math.round((approved  / total) * 1000) / 10 : 0;
    const denialRate     = total > 0 ? Math.round((denied    / total) * 1000) / 10 : 0;
    const withdrawalRate = total > 0 ? Math.round((withdrawn / total) * 1000) / 10 : 0;

    const recordsWithDemographics = records.filter((r) => r.demographicData !== null).length;
    const demographicCompletionRate = total > 0
      ? Math.round((recordsWithDemographics / total) * 1000) / 10
      : 0;

    let coverageStatus: FairLendingDashboard['coverageStatus'];
    if (total >= SECTION_1071_COVERAGE_THRESHOLD) {
      coverageStatus = '1071_triggered';
    } else if (total >= SECTION_1071_COVERAGE_THRESHOLD * 0.8) {
      coverageStatus = 'approaching_threshold';
    } else {
      coverageStatus = 'below_threshold';
    }

    return {
      tenantId,
      reportingYear,
      totalApplications: total,
      approvalRate,
      denialRate,
      withdrawalRate,
      applicationsByPurpose: purposeCounts,
      actionsByType:         actionCounts,
      topAdverseReasons,
      coverageStatus,
      coverageThreshold:     SECTION_1071_COVERAGE_THRESHOLD,
      recordsWithDemographics,
      demographicCompletionRate,
    };
  }

  // ── Coverage Threshold Check ─────────────────────────────────

  async checkCoverageThreshold(tenantId: string, year?: number): Promise<CoverageCheckResult> {
    const reportingYear = year ?? new Date().getFullYear();
    const yearStart = new Date(reportingYear, 0, 1);
    const yearEnd   = new Date(reportingYear + 1, 0, 1);

    const count = await this.prisma.fairLendingRecord.count({
      where: { tenantId, createdAt: { gte: yearStart, lt: yearEnd } },
    });

    const triggered          = count >= SECTION_1071_COVERAGE_THRESHOLD;
    const percentToThreshold = Math.min(100, Math.round((count / SECTION_1071_COVERAGE_THRESHOLD) * 100));

    return {
      tenantId,
      year:               reportingYear,
      applicationCount:   count,
      threshold:          SECTION_1071_COVERAGE_THRESHOLD,
      triggered,
      percentToThreshold,
    };
  }

  // ── Demographic access (firewall-cleared endpoint) ───────────
  // This should only be accessible by compliance officers with explicit permission.

  async getDemographicData(
    tenantId: string,
    recordId: string,
    requestingUserId: string,
  ): Promise<DemographicData | null> {
    const record = await this.prisma.fairLendingRecord.findFirst({
      where: { id: recordId, tenantId, isFirewalled: true },
    });
    if (!record) throw new Error(`Fair lending record ${recordId} not found.`);

    // Audit the demographic data access
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId:     requestingUserId,
        action:     'fair_lending.demographic_accessed',
        resource:   'fair_lending_record',
        resourceId: recordId,
        metadata:   { reason: 'compliance_review' },
      },
    });

    logger.warn('Demographic data accessed via firewall-cleared endpoint', {
      tenantId,
      recordId,
      requestingUserId,
    });

    return record.demographicData as DemographicData | null;
  }

  // ── Private helpers ──────────────────────────────────────────

  private async checkAndLogCoverageThreshold(tenantId: string): Promise<void> {
    const result = await this.checkCoverageThreshold(tenantId);
    if (result.triggered && result.applicationCount === SECTION_1071_COVERAGE_THRESHOLD) {
      logger.warn('Section 1071 coverage threshold reached — mandatory reporting now required', {
        tenantId,
        applicationCount: result.applicationCount,
      });

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action:     'fair_lending.1071_threshold_reached',
          resource:   'tenant',
          resourceId: tenantId,
          metadata:   {
            applicationCount: result.applicationCount,
            threshold:        SECTION_1071_COVERAGE_THRESHOLD,
          },
        },
      });
    } else if (result.percentToThreshold >= 80 && result.percentToThreshold < 100) {
      logger.info('Section 1071 coverage threshold approaching', {
        tenantId,
        percentToThreshold: result.percentToThreshold,
      });
    }
  }
}
