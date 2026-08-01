// ============================================================
// CapitalForge — Client Portal Routes
//
// Endpoints:
//   GET /api/portal/:clientId/summary — funding status, APR countdowns,
//       upcoming payments, and documents awaiting signature
//
// This is the surface a client sees about their own account, so every figure
// here is read from their records. It previously served one hardcoded sample
// client, which meant any client who reached it saw another business's
// funding totals and payment schedule presented as their own.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { Prisma } from '@prisma/client';
import { prisma as sharedPrisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';

const prisma = sharedPrisma;

export const portalRouter = Router({ mergeParams: true });

// ── Helpers ───────────────────────────────────────────────────

/** Safely extract a single string param (Express 5 params may be string | string[]). */
function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0]! : (val ?? '');
}

function getTenantId(req: Request): string {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Tenant context is missing — authentication middleware did not run.');
  }
  return tenantId;
}

function ok(res: Response, data: unknown): void {
  const body: ApiResponse = { success: true, data };
  res.status(200).json(body);
}

function err(res: Response, status: number, code: string, message: string): void {
  const body: ApiResponse = { success: false, error: { code, message } };
  res.status(status).json(body);
}

function num(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

const ACTIVE_CARD_STATUSES = new Set(['approved', 'active']);

/** Acknowledgments a funded client is expected to have signed. */
const REQUIRED_ACKNOWLEDGMENTS = [
  { type: 'product_reality', title: 'Product-Reality Acknowledgment' },
  { type: 'fee_schedule', title: 'Fee & Refund Acknowledgment' },
  { type: 'personal_guarantee', title: 'Personal Guarantee Acknowledgment' },
  { type: 'cash_advance_risk', title: 'Cash-Advance Restriction Acknowledgment' },
];

// ── GET /:clientId/summary ──────────────────────────────────

portalRouter.get(
  '/:clientId/summary',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const tenantId = getTenantId(req);

    try {
      const business = await prisma.business.findFirst({
        where: { id: clientId, tenantId },
        include: {
          cardApplications: { orderBy: { createdAt: 'desc' } },
          acknowledgments: true,
        },
      });

      if (!business) {
        err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
        return;
      }

      const activeCards = business.cardApplications.filter((a) =>
        ACTIVE_CARD_STATUSES.has(a.status),
      );

      // ── Funding status ──────────────────────────────────────
      const totalFunded = activeCards.reduce((sum, a) => sum + Number(a.creditLimit ?? 0), 0);

      // ── APR countdowns ──────────────────────────────────────
      const aprCountdowns = activeCards
        .filter((a) => a.introAprExpiry !== null)
        .map((a) => {
          const daysRemaining = daysUntil(a.introAprExpiry!);
          return {
            applicationId: a.id,
            cardName: a.cardProduct,
            issuer: a.issuer,
            introAprExpiry: a.introAprExpiry!.toISOString(),
            daysRemaining,
            currentApr: num(a.introApr),
            regularApr: num(a.regularApr),
            creditLimit: num(a.creditLimit),
            severity:
              daysRemaining <= 14 ? 'critical' : daysRemaining <= 60 ? 'warning' : 'ok',
          };
        })
        .sort((a, b) => a.daysRemaining - b.daysRemaining);

      // ── Upcoming payments ───────────────────────────────────
      // Read from the repayment schedule where one exists. A client with no
      // plan on record gets an empty list, not an invented schedule.
      const plan = await prisma.repaymentPlan.findFirst({
        where: { businessId: business.id, tenantId, status: 'active' },
        include: {
          schedules: {
            where: { status: { not: 'paid' } },
            orderBy: { dueDate: 'asc' },
            take: 10,
          },
        },
      });

      const upcomingPayments = (plan?.schedules ?? []).map((s) => ({
        id: s.id,
        issuer: s.issuer,
        dueDate: s.dueDate.toISOString(),
        daysUntilDue: daysUntil(s.dueDate),
        minimumPayment: Number(s.minimumPayment),
        recommendedPayment: num(s.recommendedPayment),
        status: s.status,
        autopayEnabled: s.autopayEnabled,
      }));

      const nextPayment = upcomingPayments[0] ?? null;

      // ── Documents awaiting signature ────────────────────────
      // Derived from the required set minus what is on file. The
      // acknowledgment table only holds signed records, so an outstanding
      // obligation has no row and has to be inferred from its absence.
      const signedTypes = new Set(business.acknowledgments.map((a) => a.acknowledgmentType));
      const unsignedDocuments = REQUIRED_ACKNOWLEDGMENTS.filter(
        (r) => !signedTypes.has(r.type),
      ).map((r) => ({
        type: r.type,
        title: r.title,
        status: 'not_signed',
      }));

      ok(res, {
        clientId: business.id,
        businessName: business.legalName,
        status: business.status,

        fundingStatus: {
          totalFunded,
          activeCards: activeCards.length,
          nextPaymentDue: nextPayment?.dueDate ?? null,
          nextPaymentAmount: nextPayment?.minimumPayment ?? null,
          // Utilisation needs live balances, which no card issuer integration
          // supplies yet. Reported as unknown rather than as a number.
          utilizationPct: null,
          totalMonthlyObligations: plan ? num(plan.monthlyPayment) : null,
        },

        aprCountdowns,
        upcomingPayments,
        unsignedDocuments,

        acknowledgmentsOnFile: business.acknowledgments.map((a) => ({
          type: a.acknowledgmentType,
          signedAt: a.signedAt.toISOString(),
          version: a.version,
        })),
      });
    } catch (error) {
      logger.error('Failed to build portal summary', { clientId, tenantId, error });
      err(res, 500, 'PORTAL_SUMMARY_FAILED', 'Unable to load the portal summary.');
    }
  },
);
