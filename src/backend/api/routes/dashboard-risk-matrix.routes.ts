// ============================================================
// CapitalForge — Dashboard Risk Matrix Routes
//
// GET /api/v1/dashboard/risk-matrix  — tenant-scoped portfolio
// risk heatmap data across five risk dimensions × four severity
// levels (low / medium / high / critical).
// ============================================================

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ─────────────────────────────────────────────

let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

// ── Helper: extract tenantId from authenticated request ─────────────────────

function getTenantId(req: Request): string {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Authentication context missing.');
  }
  return tenantId;
}

// ── Types ───────────────────────────────────────────────────────────────────

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface SeverityBucket {
  count: number;
  client_ids: string[];
}

type RiskRow = Record<Severity, SeverityBucket>;

interface CriticalClient {
  id: string;
  name: string;
  risk_type: string;
  detail: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function emptyRow(): RiskRow {
  return {
    low: { count: 0, client_ids: [] },
    medium: { count: 0, client_ids: [] },
    high: { count: 0, client_ids: [] },
    critical: { count: 0, client_ids: [] },
  };
}

function pushClient(row: RiskRow, severity: Severity, clientId: string): void {
  row[severity].count += 1;
  if (!row[severity].client_ids.includes(clientId)) {
    row[severity].client_ids.push(clientId);
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

export const dashboardRiskMatrixRouter = Router();

// GET / — Risk matrix for the current tenant
dashboardRiskMatrixRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const db = getPrisma();

      const now = new Date();

      // ── Parallel data fetch ──────────────────────────────────────────
      const [
        cardApplications,
        creditProfiles,
        missedPayments,
        hardshipCases,
        achAuthorizations,
        businessLookup,
      ] = await Promise.all([
        // APR expiry risk: approved cards with intro APR expiring
        db.cardApplication.findMany({
          where: {
            business: { tenantId },
            status: 'approved',
            introAprExpiry: { not: null },
          },
          select: {
            id: true,
            businessId: true,
            introAprExpiry: true,
            introApr: true,
            regularApr: true,
            creditLimit: true,
          },
        }),

        // Utilization spikes
        db.creditProfile.findMany({
          where: {
            business: { tenantId },
            utilization: { not: null },
          },
          select: {
            id: true,
            businessId: true,
            utilization: true,
          },
        }),

        // Missed payments: past-due payment schedules
        db.paymentSchedule.findMany({
          where: {
            repaymentPlan: { tenantId },
            status: 'missed',
          },
          select: {
            id: true,
            repaymentPlan: {
              select: { businessId: true },
            },
            dueDate: true,
            minimumPayment: true,
          },
        }),

        // Hardship flags
        db.hardshipCase.findMany({
          where: {
            tenantId,
            status: { in: ['open', 'in_review'] },
          },
          select: {
            id: true,
            businessId: true,
            severity: true,
            triggerType: true,
          },
        }),

        // Processor risk: flagged or suspended ACH authorizations
        db.achAuthorization.findMany({
          where: {
            business: { tenantId },
            status: { in: ['active', 'suspended'] },
          },
          select: {
            id: true,
            businessId: true,
            processorName: true,
            status: true,
            debitEvents: {
              where: { flagged: true },
              select: { id: true, flagReason: true },
            },
          },
        }),

        // Business name lookup
        db.business.findMany({
          where: { tenantId },
          select: { id: true, legalName: true },
        }),
      ]);

      const nameMap = new Map(businessLookup.map((b) => [b.id, b.legalName]));
      const getName = (id: string) => nameMap.get(id) ?? 'Unknown';

      // ── Build matrix rows ────────────────────────────────────────────

      const aprExpiry = emptyRow();
      const utilizationSpike = emptyRow();
      const missedPayment = emptyRow();
      const hardshipFlag = emptyRow();
      const processorRisk = emptyRow();
      const criticalClients: CriticalClient[] = [];

      // --- APR expiry risk ---
      for (const app of cardApplications) {
        if (!app.introAprExpiry) continue;
        const daysUntilExpiry = Math.ceil(
          (app.introAprExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        let severity: Severity;
        let detail: string;

        if (daysUntilExpiry <= 0) {
          severity = 'critical';
          detail = `Intro APR expired ${Math.abs(daysUntilExpiry)} days ago`;
        } else if (daysUntilExpiry <= 30) {
          severity = 'high';
          detail = `Intro APR expires in ${daysUntilExpiry} days`;
        } else if (daysUntilExpiry <= 90) {
          severity = 'medium';
          detail = `Intro APR expires in ${daysUntilExpiry} days`;
        } else {
          severity = 'low';
          detail = `Intro APR expires in ${daysUntilExpiry} days`;
        }

        pushClient(aprExpiry, severity, app.businessId);
        if (severity === 'critical') {
          criticalClients.push({
            id: app.businessId,
            name: getName(app.businessId),
            risk_type: 'apr_expiry',
            detail,
          });
        }
      }

      // --- Utilization spikes ---
      for (const profile of creditProfiles) {
        const util = Number(profile.utilization ?? 0);

        let severity: Severity;
        let detail: string;

        if (util >= 90) {
          severity = 'critical';
          detail = `Utilization at ${util}%`;
        } else if (util >= 75) {
          severity = 'high';
          detail = `Utilization at ${util}%`;
        } else if (util >= 50) {
          severity = 'medium';
          detail = `Utilization at ${util}%`;
        } else {
          severity = 'low';
          detail = `Utilization at ${util}%`;
        }

        pushClient(utilizationSpike, severity, profile.businessId);
        if (severity === 'critical') {
          criticalClients.push({
            id: profile.businessId,
            name: getName(profile.businessId),
            risk_type: 'utilization_spike',
            detail,
          });
        }
      }

      // --- Missed payments ---
      for (const sched of missedPayments) {
        const bizId = sched.repaymentPlan.businessId;
        const daysPastDue = Math.ceil(
          (now.getTime() - sched.dueDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        let severity: Severity;
        let detail: string;

        if (daysPastDue >= 90) {
          severity = 'critical';
          detail = `Payment ${daysPastDue} days past due`;
        } else if (daysPastDue >= 60) {
          severity = 'high';
          detail = `Payment ${daysPastDue} days past due`;
        } else if (daysPastDue >= 30) {
          severity = 'medium';
          detail = `Payment ${daysPastDue} days past due`;
        } else {
          severity = 'low';
          detail = `Payment ${daysPastDue} days past due`;
        }

        pushClient(missedPayment, severity, bizId);
        if (severity === 'critical') {
          criticalClients.push({
            id: bizId,
            name: getName(bizId),
            risk_type: 'missed_payment',
            detail,
          });
        }
      }

      // --- Hardship flags ---
      for (const hc of hardshipCases) {
        // Map existing severity field to our severity levels
        let severity: Severity;
        const hcSeverity = hc.severity.toLowerCase();

        if (hcSeverity === 'critical') {
          severity = 'critical';
        } else if (hcSeverity === 'high') {
          severity = 'high';
        } else if (hcSeverity === 'medium') {
          severity = 'medium';
        } else {
          severity = 'low';
        }

        const detail = `Hardship: ${hc.triggerType} (${hc.severity})`;

        pushClient(hardshipFlag, severity, hc.businessId);
        if (severity === 'critical') {
          criticalClients.push({
            id: hc.businessId,
            name: getName(hc.businessId),
            risk_type: 'hardship_flag',
            detail,
          });
        }
      }

      // --- Processor risk ---
      for (const auth of achAuthorizations) {
        const flaggedCount = auth.debitEvents.length;

        let severity: Severity;
        let detail: string;

        if (auth.status === 'suspended') {
          severity = 'critical';
          detail = `Processor ${auth.processorName} suspended`;
        } else if (flaggedCount >= 3) {
          severity = 'high';
          detail = `${flaggedCount} flagged debits on ${auth.processorName}`;
        } else if (flaggedCount >= 1) {
          severity = 'medium';
          detail = `${flaggedCount} flagged debit(s) on ${auth.processorName}`;
        } else {
          severity = 'low';
          detail = `Active processor: ${auth.processorName}`;
        }

        pushClient(processorRisk, severity, auth.businessId);
        if (severity === 'critical') {
          criticalClients.push({
            id: auth.businessId,
            name: getName(auth.businessId),
            risk_type: 'processor_risk',
            detail,
          });
        }
      }

      // ── Deduplicate critical clients ─────────────────────────────────
      const seen = new Set<string>();
      const uniqueCritical = criticalClients.filter((c) => {
        const key = `${c.id}:${c.risk_type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const criticalCount =
        aprExpiry.critical.count +
        utilizationSpike.critical.count +
        missedPayment.critical.count +
        hardshipFlag.critical.count +
        processorRisk.critical.count;

      // ── Build response ───────────────────────────────────────────────
      const body: ApiResponse = {
        success: true,
        data: {
          matrix: {
            apr_expiry: aprExpiry,
            utilization_spike: utilizationSpike,
            missed_payment: missedPayment,
            hardship_flag: hardshipFlag,
            processor_risk: processorRisk,
          },
          critical_count: criticalCount,
          critical_clients: uniqueCritical,
          last_updated: now.toISOString(),
        },
      };

      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'RISK_MATRIX_FETCH_FAILED',
          message,
        },
      };
      res.status(500).json(body);
    }
  },
);
