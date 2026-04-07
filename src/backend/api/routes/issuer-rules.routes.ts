// ============================================================
// CapitalForge — Issuer Rules Engine Routes
//
// Endpoints:
//   GET  /api/issuers                         — list all active issuers with rules
//   GET  /api/issuers/:id                     — single issuer with rules
//   GET  /api/issuers/:id/eligibility         — check eligibility for a business
//   GET  /api/credit-unions                   — list credit unions with products
//   GET  /api/credit-unions/:id               — single credit union with products
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { IssuerRulesEngine, EligibilityContext } from '../../services/issuer-rules-engine.js';
import logger from '../../config/logger.js';

export const issuerRulesRouter = Router();

// Lazy singleton — avoids instantiating Prisma in tests that don't need it
let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

// ── Helpers ──────────────────────────────────────────────────

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

function notFound(res: Response, message: string) {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message },
  });
}

function serverError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('[issuer-rules] Server error', { error: message });
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
  });
}

// ============================================================
// GET /api/issuers — List all active issuers with rules
// ============================================================

issuerRulesRouter.get('/issuers', async (_req: Request, res: Response) => {
  try {
    logger.info('[issuer-rules] GET /issuers');

    const issuers = await getPrisma().issuer.findMany({
      where: { isActive: true },
      include: {
        rules: {
          where: { isActive: true },
          orderBy: { severity: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return ok(res, {
      issuers,
      total: issuers.length,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// GET /api/issuers/:id — Single issuer with rules
// ============================================================

issuerRulesRouter.get('/issuers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    logger.info('[issuer-rules] GET /issuers/:id', { id });

    const issuer = await getPrisma().issuer.findUnique({
      where: { id },
      include: {
        rules: {
          where: { isActive: true },
          orderBy: { severity: 'asc' },
        },
      },
    });

    if (!issuer) {
      return notFound(res, `Issuer not found: ${id}`);
    }

    return ok(res, issuer);
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// GET /api/issuers/:id/eligibility?businessId=X
// Check eligibility for a business against an issuer's rules
// ============================================================

issuerRulesRouter.get(
  '/issuers/:id/eligibility',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { businessId } = req.query;
      logger.info('[issuer-rules] GET /issuers/:id/eligibility', { id, businessId });

      const db = getPrisma();
      const engine = new IssuerRulesEngine(db);

      // Build context from business data if businessId is provided
      let context: EligibilityContext;

      if (businessId && typeof businessId === 'string') {
        context = await buildContextFromBusiness(db, businessId, id);
      } else {
        // Return a default context check (useful for testing / UI previews)
        context = getDefaultContext();
      }

      const result = await engine.checkIssuerEligibility(id, context);
      return ok(res, result);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return notFound(res, err.message);
      }
      return serverError(res, err);
    }
  },
);

// ============================================================
// GET /api/credit-unions — List credit unions with products
// ============================================================

issuerRulesRouter.get('/credit-unions', async (_req: Request, res: Response) => {
  try {
    logger.info('[issuer-rules] GET /credit-unions');

    const creditUnions = await getPrisma().creditUnion.findMany({
      where: { isActive: true },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { productType: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return ok(res, {
      creditUnions,
      total: creditUnions.length,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// GET /api/credit-unions/:id — Single credit union with products
// ============================================================

issuerRulesRouter.get('/credit-unions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    logger.info('[issuer-rules] GET /credit-unions/:id', { id });

    const creditUnion = await getPrisma().creditUnion.findUnique({
      where: { id },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { productType: 'asc' },
        },
      },
    });

    if (!creditUnion) {
      return notFound(res, `Credit union not found: ${id}`);
    }

    return ok(res, creditUnion);
  } catch (err) {
    return serverError(res, err);
  }
});

// ============================================================
// Context Builders
// ============================================================

/**
 * Build an EligibilityContext from a business's stored data.
 * Pulls credit profiles, card applications, and business metadata.
 */
async function buildContextFromBusiness(
  db: PrismaClient,
  businessId: string,
  issuerId: string,
): Promise<EligibilityContext> {
  const business = await db.business.findUnique({
    where: { id: businessId },
    include: {
      creditProfiles: {
        orderBy: { pulledAt: 'desc' },
        take: 1,
      },
      cardApplications: true,
    },
  });

  if (!business) {
    throw new Error(`Business not found: ${businessId}`);
  }

  // Get the issuer name for matching card applications
  const issuer = await db.issuer.findUnique({ where: { id: issuerId } });
  const issuerName = issuer?.name ?? '';

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const twentyFourMonthsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);

  const latestCredit = business.creditProfiles[0] ?? null;

  // Count cards opened in the past 24 months (any issuer)
  const newCardsLast24Months = business.cardApplications.filter(
    (app) =>
      app.status === 'approved' &&
      app.decidedAt &&
      app.decidedAt > twentyFourMonthsAgo,
  ).length;

  // Count applications to this specific issuer
  const issuerApps = business.cardApplications.filter(
    (app) => app.issuer.toLowerCase() === issuerName.toLowerCase(),
  );
  const issuerAppsInPeriod = issuerApps.filter(
    (app) => app.submittedAt && app.submittedAt > sixMonthsAgo,
  ).length;

  // Most recent app to this issuer
  const lastIssuerApp = issuerApps
    .filter((app) => app.submittedAt)
    .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0))[0];

  // Most recent decline from this issuer
  const lastDecline = issuerApps
    .filter((app) => app.status === 'declined' && app.decidedAt)
    .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))[0];

  // Count inquiries (approximated from total applications)
  const inquiriesLast6Months = business.cardApplications.filter(
    (app) => app.submittedAt && app.submittedAt > sixMonthsAgo,
  ).length;
  const inquiriesLast12Months = business.cardApplications.filter(
    (app) => app.submittedAt && app.submittedAt > twelveMonthsAgo,
  ).length;

  // Open cards with this issuer
  const openCardsWithIssuer = issuerApps.filter(
    (app) => app.status === 'approved',
  ).length;

  // Total recent apps
  const totalAppsInPeriod = business.cardApplications.filter(
    (app) => app.submittedAt && app.submittedAt > sixMonthsAgo,
  ).length;

  // Business age in months
  let businessAgeMonths: number | null = null;
  if (business.dateOfFormation) {
    const formation = new Date(business.dateOfFormation);
    businessAgeMonths =
      (now.getFullYear() - formation.getFullYear()) * 12 +
      (now.getMonth() - formation.getMonth());
  }

  // Previously held products with this issuer
  const previousProducts = issuerApps
    .filter((app) => app.status === 'approved')
    .map((app) => app.cardProduct);

  return {
    newCardsLast24Months,
    issuerAppsInPeriod,
    lastApplicationDate: lastIssuerApp?.submittedAt?.toISOString() ?? null,
    lastDeclineDate: lastDecline?.decidedAt?.toISOString() ?? null,
    creditScore: latestCredit?.score ?? null,
    inquiriesLast6Months,
    inquiriesLast12Months,
    utilization: latestCredit?.utilization ? Number(latestCredit.utilization) : null,
    businessAgeMonths,
    annualRevenue: business.annualRevenue ? Number(business.annualRevenue) : null,
    openCardsWithIssuer,
    hasExistingRelationship: openCardsWithIssuer > 0,
    totalAppsInPeriod,
    previousProducts,
  };
}

/**
 * Default context for testing / when no business ID is provided.
 */
function getDefaultContext(): EligibilityContext {
  return {
    newCardsLast24Months: 0,
    issuerAppsInPeriod: 0,
    lastApplicationDate: null,
    lastDeclineDate: null,
    creditScore: 750,
    inquiriesLast6Months: 0,
    inquiriesLast12Months: 0,
    utilization: 0.15,
    businessAgeMonths: 24,
    annualRevenue: 500000,
    openCardsWithIssuer: 0,
    hasExistingRelationship: false,
    totalAppsInPeriod: 0,
    previousProducts: [],
  };
}
