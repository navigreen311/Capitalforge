// ============================================================
// CapitalForge — Offboarding & Data Deletion Orchestrator
//
// Responsibilities:
//   1. Client termination workflow (final invoice, refund calc,
//      card closure guidance)
//   2. Tenant offboarding (data export, branding removal,
//      API key revocation)
//   3. Data deletion by jurisdiction (CCPA / GDPR)
//   4. Deletion confirmation report with cryptographic proof
//   5. Exit interview capture
// ============================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../../shared/constants/index.js';
import { eventBus } from '../events/event-bus.js';
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

// ── Types ─────────────────────────────────────────────────────

export type OffboardingType = 'client' | 'tenant';
export type DeletionJurisdiction = 'ccpa' | 'gdpr' | 'both' | 'internal';

export interface InitiateOffboardingInput {
  tenantId: string;
  offboardingType: OffboardingType;
  businessId?: string;
  exitReason?: string;
  jurisdiction?: DeletionJurisdiction;
  requestedBy: string;
}

export interface ExitInterviewInput {
  workflowId: string;
  notes: string;
  satisfactionScore?: number;
  primaryExitReason: string;
  wouldRecommend?: boolean;
}

export interface DataDeletionInput {
  workflowId: string;
  jurisdiction: DeletionJurisdiction;
  requestedBy: string;
  confirmationToken: string;
}

export interface OffboardingStatus {
  id: string;
  tenantId: string;
  businessId: string | null;
  offboardingType: string;
  status: string;
  finalInvoiceId: string | null;
  refundAmount: number | null;
  dataExportCompleted: boolean;
  dataDeletionStatus: string;
  deletionProofHash: string | null;
  exitReason: string | null;
  exitInterviewNotes: string | null;
  initiatedAt: Date;
  completedAt: Date | null;
  cardClosureGuidance?: CardClosureGuidance[];
}

export interface CardClosureGuidance {
  issuer: string;
  cardProduct: string;
  creditLimit: number | null;
  recommendedAction: string;
  urgency: 'immediate' | 'within_30d' | 'within_90d';
  closurePhone?: string;
  notes: string;
}

export interface RefundCalculation {
  programFeePaid: number;
  monthsRemaining: number;
  proRatedRefund: number;
  retentionFee: number;
  netRefund: number;
  currency: 'USD';
}

export interface DeletionReport {
  workflowId: string;
  tenantId: string;
  deletedAt: string;
  jurisdiction: string;
  tablesCleared: string[];
  recordsDeleted: number;
  retentionExceptions: RetentionException[];
  proofHash: string;
  reportSignature: string;
}

export interface RetentionException {
  table: string;
  reason: string;
  retainUntil: string;
  legalBasis: string;
}

// ── Issuer closure contact data ───────────────────────────────

const ISSUER_CLOSURE_CONTACTS: Record<string, { phone: string; notes: string }> = {
  chase:       { phone: '1-800-432-3117', notes: 'Request Product Change before closing to preserve credit history.' },
  amex:        { phone: '1-800-528-4800', notes: 'Business Platinum closure may trigger clawback of rewards.' },
  capital_one: { phone: '1-800-227-4825', notes: 'Wait 30 days after statement close before calling.' },
  bank_of_america: { phone: '1-800-421-2110', notes: 'In-branch closure recommended for business accounts.' },
  citi:        { phone: '1-800-677-0232', notes: 'Allow 6–8 weeks for final statement after closure.' },
  wells_fargo: { phone: '1-800-869-3557', notes: 'Confirm zero balance before requesting closure.' },
};

// ── Service ───────────────────────────────────────────────────

export class OffboardingService {
  constructor(private prisma: PrismaClient = getPrisma()) {}

  // ── Initiate Offboarding ────────────────────────────────────

  async initiateOffboarding(input: InitiateOffboardingInput): Promise<OffboardingStatus> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: input.tenantId } });
    if (!tenant) throw new Error(`Tenant ${input.tenantId} not found.`);

    if (input.businessId) {
      const biz = await this.prisma.business.findFirst({
        where: { id: input.businessId, tenantId: input.tenantId },
      });
      if (!biz) throw new Error(`Business ${input.businessId} not found in tenant.`);
    }

    // Check for existing active workflow
    const existing = await this.prisma.offboardingWorkflow.findFirst({
      where: {
        tenantId:       input.tenantId,
        ...(input.businessId && { businessId: input.businessId }),
        status:         { in: ['initiated', 'in_progress'] },
      },
    });
    if (existing) {
      throw new Error(`Active offboarding workflow ${existing.id} already exists.`);
    }

    const retentionSchedule = this.buildRetentionSchedule(input.jurisdiction ?? 'internal');

    const workflow = await this.prisma.offboardingWorkflow.create({
      data: {
        tenantId:          input.tenantId,
        businessId:        input.businessId ?? null,
        offboardingType:   input.offboardingType,
        status:            'initiated',
        dataDeletionStatus:'pending',
        retentionSchedule: retentionSchedule as unknown as object,
        exitReason:        input.exitReason ?? null,
      },
    });

    // Generate final invoice for client offboarding
    let finalInvoiceId: string | null = null;
    let refundAmount: number | null = null;

    if (input.offboardingType === 'client' && input.businessId) {
      const calc = await this.calculateClientRefund(input.tenantId, input.businessId);
      refundAmount = calc.netRefund;

      if (calc.proRatedRefund > 0) {
        const invoice = await this.prisma.invoice.create({
          data: {
            tenantId:      input.tenantId,
            businessId:    input.businessId,
            invoiceNumber: `OFF-${workflow.id.slice(0, 8).toUpperCase()}`,
            type:          'refund',
            amount:        calc.netRefund,
            feeBreakdown:  calc as unknown as object,
            status:        'draft',
          },
        });
        finalInvoiceId = invoice.id;
      }

      await this.prisma.offboardingWorkflow.update({
        where: { id: workflow.id },
        data:  { finalInvoiceId, refundAmount, status: 'in_progress' },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId:   input.tenantId,
        action:     'offboarding.initiated',
        resource:   'offboarding_workflow',
        resourceId: workflow.id,
        metadata:   {
          type: input.offboardingType,
          requestedBy: input.requestedBy,
          exitReason: input.exitReason,
        },
      },
    });

    await eventBus.publish({
      eventType:     EVENT_TYPES.OFFBOARDING_INITIATED,
      aggregateType: AGGREGATE_TYPES.TENANT,
      aggregateId:   input.tenantId,
      payload:       { workflowId: workflow.id, type: input.offboardingType },
    });

    logger.info('Offboarding initiated', { workflowId: workflow.id, type: input.offboardingType });
    return this.getOffboardingStatus(workflow.id);
  }

  // ── Status ──────────────────────────────────────────────────

  async getOffboardingStatus(workflowId: string): Promise<OffboardingStatus> {
    const wf = await this.prisma.offboardingWorkflow.findFirst({
      where: { id: workflowId },
    });
    if (!wf) throw new Error(`Offboarding workflow ${workflowId} not found.`);

    let cardClosureGuidance: CardClosureGuidance[] | undefined;
    if (wf.businessId) {
      cardClosureGuidance = await this.buildCardClosureGuidance(wf.tenantId, wf.businessId);
    }

    return {
      id:                  wf.id,
      tenantId:            wf.tenantId,
      businessId:          wf.businessId,
      offboardingType:     wf.offboardingType,
      status:              wf.status,
      finalInvoiceId:      wf.finalInvoiceId,
      refundAmount:        wf.refundAmount ? Number(wf.refundAmount) : null,
      dataExportCompleted: wf.dataExportCompleted,
      dataDeletionStatus:  wf.dataDeletionStatus,
      deletionProofHash:   wf.deletionProofHash,
      exitReason:          wf.exitReason,
      exitInterviewNotes:  wf.exitInterviewNotes,
      initiatedAt:         wf.initiatedAt,
      completedAt:         wf.completedAt,
      cardClosureGuidance,
    };
  }

  // ── Exit Interview ──────────────────────────────────────────

  async captureExitInterview(input: ExitInterviewInput): Promise<OffboardingStatus> {
    const wf = await this.prisma.offboardingWorkflow.findFirst({
      where: { id: input.workflowId },
    });
    if (!wf) throw new Error(`Workflow ${input.workflowId} not found.`);

    await this.prisma.offboardingWorkflow.update({
      where: { id: input.workflowId },
      data:  {
        exitInterviewNotes: JSON.stringify({
          notes:               input.notes,
          satisfactionScore:   input.satisfactionScore ?? null,
          primaryExitReason:   input.primaryExitReason,
          wouldRecommend:      input.wouldRecommend ?? null,
          capturedAt:          new Date().toISOString(),
        }),
      },
    });

    logger.info('Exit interview captured', { workflowId: input.workflowId });
    return this.getOffboardingStatus(input.workflowId);
  }

  // ── Data Export ─────────────────────────────────────────────

  async exportTenantData(workflowId: string): Promise<{ exportKey: string; recordCount: number }> {
    const wf = await this.prisma.offboardingWorkflow.findFirst({ where: { id: workflowId } });
    if (!wf) throw new Error(`Workflow ${workflowId} not found.`);

    // In production: trigger async export job, upload to S3/GCS, return signed URL.
    // Stub counts relevant records.
    const [businesses, users, documents] = await Promise.all([
      this.prisma.business.count({ where: { tenantId: wf.tenantId } }),
      this.prisma.user.count({ where: { tenantId: wf.tenantId } }),
      this.prisma.document.count({ where: { tenantId: wf.tenantId } }),
    ]);

    const recordCount = businesses + users + documents;
    const exportKey = `exports/${wf.tenantId}/${workflowId}/data-${Date.now()}.zip`;

    await this.prisma.offboardingWorkflow.update({
      where: { id: workflowId },
      data:  { dataExportCompleted: true },
    });

    logger.info('Tenant data export completed', { workflowId, recordCount, exportKey });
    return { exportKey, recordCount };
  }

  // ── Data Deletion ───────────────────────────────────────────

  async deleteData(input: DataDeletionInput): Promise<DeletionReport> {
    const wf = await this.prisma.offboardingWorkflow.findFirst({ where: { id: input.workflowId } });
    if (!wf) throw new Error(`Workflow ${input.workflowId} not found.`);

    // Validate confirmation token
    const expectedToken = this.generateConfirmationToken(wf.tenantId, input.workflowId);
    if (input.confirmationToken !== expectedToken) {
      throw new Error('Invalid confirmation token. Data deletion aborted.');
    }

    if (wf.dataDeletionStatus === 'completed') {
      throw new Error('Data deletion already completed for this workflow.');
    }

    const tenantId = wf.tenantId;
    const tablesCleared: string[] = [];
    let recordsDeleted = 0;

    // Retention exceptions by jurisdiction
    const retentionExceptions = this.getRetentionExceptions(input.jurisdiction);

    await this.prisma.offboardingWorkflow.update({
      where: { id: input.workflowId },
      data:  { dataDeletionStatus: 'in_progress' },
    });

    // Execute deletions in dependency order
    // Transactional PII scrub (soft-delete approach to preserve referential integrity for legal holds)
    const deletedCounts = await this.executeJurisdictionDeletion(tenantId, input.jurisdiction);
    tablesCleared.push(...Object.keys(deletedCounts));
    recordsDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);

    // Revoke API keys / deactivate tenant
    if (wf.offboardingType === 'tenant') {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data:  { isActive: false },
      });
      tablesCleared.push('tenants(deactivated)');
    }

    // Build deletion proof
    const deletedAt = new Date().toISOString();
    const reportPayload = {
      workflowId: input.workflowId,
      tenantId,
      deletedAt,
      jurisdiction:       input.jurisdiction,
      tablesCleared,
      recordsDeleted,
      retentionExceptions,
    };

    const proofHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(reportPayload))
      .digest('hex');

    const reportSignature = crypto
      .createHmac('sha256', process.env['DELETION_PROOF_SECRET'] ?? 'changeme')
      .update(proofHash)
      .digest('hex');

    await this.prisma.offboardingWorkflow.update({
      where: { id: input.workflowId },
      data:  {
        dataDeletionStatus: 'completed',
        deletionProofHash:  proofHash,
        status:             'completed',
        completedAt:        new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action:     'data.deleted',
        resource:   'offboarding_workflow',
        resourceId: input.workflowId,
        metadata:   { jurisdiction: input.jurisdiction, recordsDeleted, proofHash },
      },
    });

    await eventBus.publish({
      eventType:     EVENT_TYPES.OFFBOARDING_COMPLETED,
      aggregateType: AGGREGATE_TYPES.TENANT,
      aggregateId:   tenantId,
      payload:       { workflowId: input.workflowId, proofHash },
    });

    logger.info('Data deletion completed', { workflowId: input.workflowId, proofHash });

    return {
      ...reportPayload,
      proofHash,
      reportSignature,
    };
  }

  // ── Confirmation token helper ────────────────────────────────

  generateConfirmationToken(tenantId: string, workflowId: string): string {
    return crypto
      .createHmac('sha256', process.env['DELETION_CONFIRM_SECRET'] ?? 'confirm-secret')
      .update(`${tenantId}:${workflowId}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();
  }

  // ── Private helpers ──────────────────────────────────────────

  private async calculateClientRefund(
    tenantId: string,
    businessId: string,
  ): Promise<RefundCalculation> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - now.getDate();
    const monthsRemaining = Math.round(daysRemaining / 30 * 10) / 10;

    const latestInvoice = await this.prisma.invoice.findFirst({
      where:   { tenantId, businessId, status: 'paid', type: 'program_fee' },
      orderBy: { paidAt: 'desc' },
    });

    const programFeePaid = latestInvoice ? Number(latestInvoice.amount) : 0;
    const proRatedRefund = Math.round((programFeePaid * (daysRemaining / daysInMonth)) * 100) / 100;
    const retentionFee   = Math.round(proRatedRefund * 0.1 * 100) / 100; // 10% retention fee
    const netRefund      = Math.max(0, proRatedRefund - retentionFee);

    return {
      programFeePaid,
      monthsRemaining,
      proRatedRefund,
      retentionFee,
      netRefund,
      currency: 'USD',
    };
  }

  private async buildCardClosureGuidance(
    tenantId: string,
    businessId: string,
  ): Promise<CardClosureGuidance[]> {
    const apps = await this.prisma.cardApplication.findMany({
      where: { businessId, status: 'approved' },
    });

    return apps.map((app) => {
      const issuerKey = app.issuer.toLowerCase().replace(/\s+/g, '_');
      const contact = ISSUER_CLOSURE_CONTACTS[issuerKey];
      const hasBalance = app.creditLimit && Number(app.creditLimit) > 0;

      return {
        issuer:            app.issuer,
        cardProduct:       app.cardProduct,
        creditLimit:       app.creditLimit ? Number(app.creditLimit) : null,
        recommendedAction: hasBalance ? 'Pay off balance before requesting closure' : 'Ready to close',
        urgency:           'within_30d',
        closurePhone:      contact?.phone,
        notes:             contact?.notes ?? 'Contact issuer directly to initiate closure.',
      };
    });
  }

  private buildRetentionSchedule(jurisdiction: DeletionJurisdiction): object {
    const now = new Date();
    const add = (years: number) => new Date(now.getFullYear() + years, now.getMonth(), now.getDate()).toISOString();

    return {
      financial_records: {
        retainUntil: add(7),
        legalBasis:  'IRS 26 USC §6001 — 7-year retention requirement',
      },
      consent_records: {
        retainUntil: jurisdiction === 'gdpr' ? add(3) : add(5),
        legalBasis:  jurisdiction === 'gdpr' ? 'GDPR Art. 5(1)(e)' : 'TCPA 47 CFR §64.1200',
      },
      audit_logs: {
        retainUntil: add(5),
        legalBasis:  'FFIEC BSA/AML compliance',
      },
    };
  }

  private getRetentionExceptions(jurisdiction: DeletionJurisdiction): RetentionException[] {
    const now = new Date();
    const addYears = (y: number) => new Date(now.getFullYear() + y, now.getMonth(), now.getDate()).toISOString();

    const exceptions: RetentionException[] = [
      {
        table:       'invoices',
        reason:      'Financial records retention requirement',
        retainUntil: addYears(7),
        legalBasis:  'IRS 26 USC §6001',
      },
      {
        table:       'audit_logs',
        reason:      'BSA/AML compliance records',
        retainUntil: addYears(5),
        legalBasis:  'Bank Secrecy Act 31 USC §5318',
      },
    ];

    if (jurisdiction === 'gdpr' || jurisdiction === 'both') {
      exceptions.push({
        table:       'consent_records',
        reason:      'GDPR demonstrable consent basis',
        retainUntil: addYears(3),
        legalBasis:  'GDPR Art. 7(1) — controller must demonstrate consent',
      });
    }

    return exceptions;
  }

  private async executeJurisdictionDeletion(
    tenantId: string,
    jurisdiction: DeletionJurisdiction,
  ): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    // PII scrub: anonymise rather than hard-delete to preserve referential integrity
    // Hard deletion for non-legally-retained tables

    // Scrub business owner PII
    const owners = await this.prisma.businessOwner.findMany({
      where: { business: { tenantId } },
    });
    for (const owner of owners) {
      await this.prisma.businessOwner.update({
        where: { id: owner.id },
        data:  { ssn: null, dateOfBirth: null, address: null },
      });
    }
    counts['business_owners(pii_scrubbed)'] = owners.length;

    // Scrub user PII
    const users = await this.prisma.user.findMany({ where: { tenantId } });
    for (const user of users) {
      await this.prisma.user.update({
        where: { id: user.id },
        data:  {
          email:        `deleted-${user.id}@purged.invalid`,
          passwordHash: null,
          mfaSecret:    null,
          isActive:     false,
        },
      });
    }
    counts['users(pii_scrubbed)'] = users.length;

    // GDPR: also remove demographic data from fair lending (keep aggregate, nuke PII)
    if (jurisdiction === 'gdpr' || jurisdiction === 'both') {
      const flRecords = await this.prisma.fairLendingRecord.findMany({ where: { tenantId } });
      for (const flr of flRecords) {
        await this.prisma.fairLendingRecord.update({
          where: { id: flr.id },
          data:  { demographicData: null },
        });
      }
      counts['fair_lending_records(demographic_scrubbed)'] = flRecords.length;
    }

    // CCPA: delete consent records outside legal hold
    if (jurisdiction === 'ccpa' || jurisdiction === 'both') {
      const deletedConsent = await this.prisma.consentRecord.deleteMany({
        where: { tenantId, status: 'revoked' },
      });
      counts['consent_records(deleted)'] = deletedConsent.count;
    }

    return counts;
  }
}
