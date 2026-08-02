// ============================================================
// CapitalForge — Card Benefits API Routes
//
// GET  /api/card-benefits/:clientId                              — benefits on a client's cards
// POST /api/card-benefits/:cardId/benefits/:benefitId/mark-used  — record a benefit as used
// POST /api/card-benefits/:clientId/export                       — report built from those rows
//
// All three were mock. GET called a factory returning the same twelve
// benefits across three named cards — Amex Business Platinum, Chase Sapphire
// Reserve, Amex Business Gold — for any clientId, summarised as "7 of 12
// utilised" and "$2,450.00 estimated unused". mark-used wrote to a
// module-level object, so a benefit marked used came back unused after a
// restart while the API answered 200. The export produced a text report with
// those same numbers typed into it, for whichever client asked, ending in
// three action items telling somebody to use credits they do not have. That
// is a document a person could send on.
//
// card_benefits is a real table, keyed to a card application, which is keyed
// to a business, which carries the tenant. These read and write it.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';

const prisma = sharedPrisma;

export const cardBenefitsApiRouter = Router({ mergeParams: true });

// ── Helpers ──────────────────────────────────────────────────

/** Express 5 params may be string | string[]. */
function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0]! : (val ?? '');
}

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } } satisfies ApiResponse);
}

function getTenantId(req: Request): string | null {
  return req.tenant?.tenantId ?? null;
}

/** Prisma Decimal; callers want a number or nothing. */
function decimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** The window the page calls "expiring soon". */
const EXPIRING_WINDOW_DAYS = 60;

// ── GET /api/card-benefits/:clientId ─────────────────────────

cardBenefitsApiRouter.get(
  '/:clientId',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const tenantId = getTenantId(req);

    if (!clientId) {
      fail(res, 400, 'MISSING_PARAM', 'clientId is required.');
      return;
    }
    if (tenantId === null) {
      fail(res, 401, 'UNAUTHORIZED', 'Authentication required.');
      return;
    }

    try {
      // The business lookup is the tenant check: benefits hang off card
      // applications, which hang off a business, which carries the tenant.
      const business = await prisma.business.findFirst({
        where: { id: clientId, tenantId },
        select: { id: true },
      });
      if (!business) {
        fail(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
        return;
      }

      const applications = await prisma.cardApplication.findMany({
        where: { businessId: clientId },
        select: { id: true, issuer: true, cardProduct: true, status: true, annualFee: true },
        orderBy: { createdAt: 'desc' },
      });

      const benefits = applications.length
        ? await prisma.cardBenefit.findMany({
            where: { cardApplicationId: { in: applications.map((a) => a.id) } },
            orderBy: [{ expiryDate: 'asc' }, { benefitName: 'asc' }],
          })
        : [];

      const now = Date.now();

      const cards = applications.map((app) => ({
        cardId: app.id,
        issuer: app.issuer,
        product: app.cardProduct,
        status: app.status,
        annualFee: decimal(app.annualFee),
        benefits: benefits
          .filter((b) => b.cardApplicationId === app.id)
          .map((b) => ({
            benefitId: b.id,
            name: b.benefitName,
            type: b.benefitType,
            // Null, not 0. A benefit with no value recorded is not a benefit
            // worth nothing, and these get totalled.
            value: decimal(b.benefitValue),
            expiresAt: b.expiryDate?.toISOString() ?? null,
            utilized: b.utilized,
            utilizedDate: b.utilizedDate?.toISOString() ?? null,
          })),
      }));

      const all = cards.flatMap((c) => c.benefits);
      const utilized = all.filter((b) => b.utilized);
      const unusedWithValue = all.filter((b) => !b.utilized && b.value !== null);
      const valued = all.filter((b) => b.value !== null);

      const expiring = all
        .filter((b) => !b.utilized && b.expiresAt !== null)
        .map((b) => ({
          ...b,
          daysRemaining: Math.ceil((new Date(b.expiresAt!).getTime() - now) / DAY_MS),
        }))
        .filter((b) => b.daysRemaining >= 0 && b.daysRemaining <= EXPIRING_WINDOW_DAYS);

      res.status(200).json({
        success: true,
        data: {
          clientId,
          summary: {
            totalBenefits: all.length,
            utilized: utilized.length,
            expiringSoon: expiring.length,
            // Null when nothing carries a value, so the page can say "not
            // recorded" rather than "$0 left on the table".
            estimatedUnusedValue: unusedWithValue.length
              ? unusedWithValue.reduce((sum, b) => sum + (b.value ?? 0), 0)
              : null,
            // How many benefits that money figure covers, so a partial answer
            // is not read as a complete one.
            valuedBenefits: valued.length,
          },
          expiring,
          cards,
        },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to load card benefits', { clientId, tenantId, error });
      fail(res, 500, 'CARD_BENEFITS_READ_FAILED', 'Could not read card benefits.');
    }
  },
);

// ── POST /api/card-benefits/:cardId/benefits/:benefitId/mark-used ─

cardBenefitsApiRouter.post(
  '/:cardId/benefits/:benefitId/mark-used',
  async (req: Request, res: Response): Promise<void> => {
    const cardId = param(req, 'cardId');
    const benefitId = param(req, 'benefitId');
    const tenantId = getTenantId(req);

    if (!cardId || !benefitId) {
      fail(res, 400, 'MISSING_PARAM', 'cardId and benefitId are required.');
      return;
    }
    if (tenantId === null) {
      fail(res, 401, 'UNAUTHORIZED', 'Authentication required.');
      return;
    }

    try {
      // card_benefits carries a bare cardApplicationId with no relation on the
      // model, so the tenant cannot be reached in one query. Establish the
      // card's tenant first, then look the benefit up under that card:
      // updating by benefit id alone would let any tenant mark any benefit
      // used.
      const card = await prisma.cardApplication.findFirst({
        where: { id: cardId, business: { tenantId } },
        select: { id: true },
      });

      if (!card) {
        // Same answer as an unknown benefit, so this does not reveal which
        // card ids exist on other tenants.
        fail(res, 404, 'BENEFIT_NOT_FOUND', 'No such benefit on that card.');
        return;
      }

      const benefit = await prisma.cardBenefit.findFirst({
        where: { id: benefitId, cardApplicationId: cardId },
        select: { id: true, utilized: true, utilizedDate: true },
      });

      if (!benefit) {
        fail(res, 404, 'BENEFIT_NOT_FOUND', 'No such benefit on that card.');
        return;
      }

      const updated = await prisma.cardBenefit.update({
        where: { id: benefit.id },
        // Keeps the original date if it was already used, so re-marking does
        // not rewrite when it happened.
        data: { utilized: true, utilizedDate: benefit.utilizedDate ?? new Date() },
        select: { id: true, utilized: true, utilizedDate: true },
      });

      logger.info('Card benefit marked used', { cardId, benefitId, tenantId });

      res.status(200).json({
        success: true,
        data: {
          benefitId: updated.id,
          utilized: updated.utilized,
          utilizedDate: updated.utilizedDate?.toISOString() ?? null,
        },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to mark card benefit used', { cardId, benefitId, tenantId, error });
      fail(res, 500, 'BENEFIT_UPDATE_FAILED', 'Could not record the benefit as used.');
    }
  },
);

// ── POST /api/card-benefits/:clientId/export ─────────────────

cardBenefitsApiRouter.post(
  '/:clientId/export',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const tenantId = getTenantId(req);

    if (!clientId) {
      fail(res, 400, 'MISSING_PARAM', 'clientId is required.');
      return;
    }
    if (tenantId === null) {
      fail(res, 401, 'UNAUTHORIZED', 'Authentication required.');
      return;
    }

    try {
      const business = await prisma.business.findFirst({
        where: { id: clientId, tenantId },
        select: { id: true, legalName: true },
      });
      if (!business) {
        fail(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
        return;
      }

      const applications = await prisma.cardApplication.findMany({
        where: { businessId: clientId },
        select: { id: true, issuer: true, cardProduct: true, annualFee: true },
        orderBy: { createdAt: 'desc' },
      });

      const benefits = applications.length
        ? await prisma.cardBenefit.findMany({
            where: { cardApplicationId: { in: applications.map((a) => a.id) } },
            orderBy: [{ benefitName: 'asc' }],
          })
        : [];

      const money = (n: number): string => `$${n.toFixed(2)}`;
      const lines: string[] = [
        'CARD BENEFITS REPORT',
        `Client: ${business.legalName}`,
        `Generated: ${new Date().toISOString()}`,
        '='.repeat(50),
        '',
      ];

      if (benefits.length === 0) {
        // An empty report says so. The previous one filled this space with a
        // twelve-benefit summary regardless of what was on file.
        lines.push('No card benefits are recorded for this client.');
      } else {
        const used = benefits.filter((b) => b.utilized);
        const valued = benefits.filter((b) => b.benefitValue !== null);
        const unusedValue = benefits
          .filter((b) => !b.utilized && b.benefitValue !== null)
          .reduce((sum, b) => sum + (decimal(b.benefitValue) ?? 0), 0);

        lines.push(
          'Benefit Utilization Summary:',
          `  Total Benefits:   ${benefits.length}`,
          `  Utilized:         ${used.length}`,
          valued.length === 0
            ? '  Unused Value:     not recorded (no benefit carries a value)'
            : `  Unused Value:     ${money(unusedValue)} across ${valued.length} of ${benefits.length} benefits`,
          '',
          'Cards:',
        );

        for (const app of applications) {
          const own = benefits.filter((b) => b.cardApplicationId === app.id);
          const fee = decimal(app.annualFee);
          lines.push(
            `  ${app.issuer} ${app.cardProduct}${fee === null ? '' : ` (${money(fee)}/yr)`}`,
          );
          if (own.length === 0) {
            lines.push('    - no benefits recorded');
            continue;
          }
          for (const b of own) {
            const value = decimal(b.benefitValue);
            lines.push(
              `    - ${b.benefitName}: ${value === null ? 'value not recorded' : money(value)}` +
                `  [${b.utilized ? 'USED' : 'PENDING'}]`,
            );
          }
        }
      }

      logger.info('Card benefits report exported', { clientId, tenantId });

      res.status(200).json({
        success: true,
        data: {
          clientId,
          format: 'text',
          report: lines.join('\n'),
          generatedAt: new Date().toISOString(),
        },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to export card benefits', { clientId, tenantId, error });
      fail(res, 500, 'CARD_BENEFITS_EXPORT_FAILED', 'Could not build the report.');
    }
  },
);
