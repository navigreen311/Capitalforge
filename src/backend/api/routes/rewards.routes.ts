// ============================================================
// CapitalForge — Rewards Optimization & Card Benefits Routes
//
// Endpoints (all require valid JWT + tenant context):
//
//   GET  /api/businesses/:id/rewards/optimization
//        Spend routing recommendations: which card to use for
//        each MCC category to maximise cashback / points.
//        Query params:
//          categories (required) — comma-separated list of
//            MccCategory values, e.g. "office_supplies,gas"
//          amounts (required) — matching comma-separated annual
//            spend amounts in USD, e.g. "25000,10000"
//
//   GET  /api/businesses/:id/rewards/annual-summary
//        Annual reward value vs annual fee per card given the
//        same spend profile query params.
//
//   GET  /api/businesses/:id/benefits
//        All card benefits registered for the business.
//        Query param: cardId (optional) — filter by card.
//
//   POST /api/businesses/:id/benefits/:benefitId/utilize
//        Mark a benefit as utilized.
//        Body: { utilizedDate?: string (ISO) }
//
//   GET  /api/businesses/:id/benefits/renewal-recommendations
//        Keep vs cancel / negotiate recommendation per card.
//
//   GET  /api/businesses/:id/rewards/held-cards
//        The cards this client is on record as holding, each with
//        its earn rates where the product resolves against the rate
//        catalogue — and with the reason it did not, where it does
//        not. No routing advice; see the note on that handler.
// ============================================================

import { Router, type Response, type NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { z, type ZodError } from 'zod';
import { RewardsOptimizationService, MCC_CATEGORIES, type MccCategory, type SpendProfile } from '../../services/rewards-optimization.service.js';
import { CardBenefitsService } from '../../services/card-benefits.service.js';
import { createHeldCardsService } from '../../services/held-cards.service.js';
import { matchHeldCardToCatalog } from '../../services/held-card-catalog-match.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import logger from '../../config/logger.js';

// ── Shared service instances ──────────────────────────────────

const rewardsOptimizer = new RewardsOptimizationService();
const cardBenefits     = new CardBenefitsService();
const heldCards        = createHeldCardsService(sharedPrisma);

// ============================================================
// Validation helpers
// ============================================================

const MccCategoryEnum = z.enum(MCC_CATEGORIES);

/** Parse ?categories=a,b,c&amounts=100,200,300 into a SpendProfile */
function parseSpendQuery(
  businessId: string,
  tenantId: string,
  query: Record<string, unknown>,
): { profile: SpendProfile } | { error: string } {
  const rawCategories = typeof query['categories'] === 'string' ? query['categories'] : '';
  const rawAmounts    = typeof query['amounts']    === 'string' ? query['amounts']    : '';

  if (!rawCategories || !rawAmounts) {
    return { error: 'Query params "categories" and "amounts" are both required.' };
  }

  const categoryList = rawCategories.split(',').map((s) => s.trim());
  const amountList   = rawAmounts.split(',').map((s) => parseFloat(s.trim()));

  if (categoryList.length !== amountList.length) {
    return { error: '"categories" and "amounts" must have the same number of entries.' };
  }

  if (amountList.some((a) => isNaN(a) || a < 0)) {
    return { error: 'All "amounts" must be non-negative numbers.' };
  }

  // Validate each category label
  for (const cat of categoryList) {
    const parsed = MccCategoryEnum.safeParse(cat);
    if (!parsed.success) {
      return {
        error: `Unknown category "${cat}". Valid categories: ${MCC_CATEGORIES.join(', ')}.`,
      };
    }
  }

  return {
    profile: {
      businessId,
      tenantId,
      categories: categoryList.map((cat, i) => ({
        category:     cat as MccCategory,
        annualAmount: amountList[i]!,
      })),
    },
  };
}

const UtilizeBenefitSchema = z.object({
  utilizedDate: z.string().datetime().optional(),
});

// ============================================================
// Guard helpers (mirrors other route modules)
// ============================================================

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    };
    res.status(401).json(body);
    return;
  }
  next();
}

function handleZodError(err: ZodError, res: Response): void {
  res.status(422).json({
    success: false,
    error: {
      code:    'VALIDATION_ERROR',
      message: 'Invalid request body.',
      details: err.flatten().fieldErrors,
    },
  } satisfies ApiResponse);
}

function handleUnexpectedError(err: unknown, res: Response, context: string): void {
  logger.error(`[RewardsRoutes] Unexpected error in ${context}`, { err });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

// ============================================================
// Router
// ============================================================

export const rewardsRouter = Router({ mergeParams: true });

// ── GET /api/businesses/:id/rewards/optimization ─────────────
//
// Returns per-category spend routing recommendations showing
// which card earns the most rewards for each MCC category.
//
// Query: ?categories=office_supplies,gas&amounts=25000,10000

rewardsRouter.get(
  // Was '/rewards/optimization'. The handler reads req.params['id'], which
  // that path never supplies, so businessId was always undefined — and the
  // path this file documents answered 404.
  '/businesses/:id/rewards/optimization',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id']!;
    const tenant     = req.tenant!;

    if (!businessId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId path parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    const parsed = parseSpendQuery(businessId, tenant.tenantId, req.query as Record<string, unknown>);
    if ('error' in parsed) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: parsed.error },
      } satisfies ApiResponse);
      return;
    }

    try {
      const result = rewardsOptimizer.optimize(parsed.profile);

      res.status(200).json({
        success: true,
        data: {
          businessId,
          generatedAt:             result.generatedAt,
          categoryRecommendations: result.categoryRecommendations,
          totals:                  result.totals,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /rewards/optimization');
    }
  },
);

// ── GET /api/businesses/:id/rewards/annual-summary ───────────
//
// Returns a per-card annual reward vs annual fee summary,
// including net benefit and keep/worth analysis for the
// given spend profile.
//
// Query: ?categories=office_supplies,gas&amounts=25000,10000

rewardsRouter.get(
  '/businesses/:id/rewards/annual-summary',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id']!;
    const tenant     = req.tenant!;

    if (!businessId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId path parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    const parsed = parseSpendQuery(businessId, tenant.tenantId, req.query as Record<string, unknown>);
    if ('error' in parsed) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: parsed.error },
      } satisfies ApiResponse);
      return;
    }

    try {
      const result = rewardsOptimizer.optimize(parsed.profile);

      // Sort: best net benefit first
      const summaries = [...result.cardAnnualSummaries].sort(
        (a, b) => b.netBenefit - a.netBenefit,
      );

      res.status(200).json({
        success: true,
        data: {
          businessId,
          generatedAt:       result.generatedAt,
          cardAnnualSummaries: summaries,
          portfolioTotals:   result.totals,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /rewards/annual-summary');
    }
  },
);

// ── GET /api/businesses/:id/rewards/held-cards ───────────────
//
// The cards this client is on record as holding, each resolved to its
// earn rates where the product name matches the rate catalogue.
//
// What this deliberately does NOT do is rank them or name a best card
// per category. The optimisation endpoint above ranks the entire
// catalogue — every card on the market — which answers "what is the
// best business card for office supplies", a shopping question. Framed
// as advice for a named client it implies they hold cards they do not.
// Routing across the cards a client *does* hold needs per-category
// spend, and the categories on `SpendTransaction` come from
// `MCC_RISK_MAP` — a different vocabulary from the optimiser's thirteen
// `MccCategory` values. Mapping one onto the other carelessly yields
// confident routing advice computed from mis-bucketed spend, so it is
// not done here at all rather than done approximately.
//
// Every held card appears in the response. One that does not resolve
// carries `match.status === 'unmatched'` with a reason; it is never
// omitted and never given a rate.
// ─────────────────────────────────────────────────────────────
rewardsRouter.get(
  '/businesses/:id/rewards/held-cards',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id']!;
    const tenant     = req.tenant!;

    if (!businessId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId path parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    try {
      const cards = await heldCards.listForBusiness(businessId, tenant.tenantId);

      const resolved = cards.map((card) => ({
        id: card.id,
        issuer: card.issuer,
        productName: card.productName,
        openedAt: card.openedAt?.toISOString() ?? null,
        closedAt: card.closedAt?.toISOString() ?? null,
        creditLimit: card.creditLimit != null ? Number(card.creditLimit) : null,
        source: card.source,
        attestedBy: card.attestedBy,
        attestedAt: card.attestedAt.toISOString(),
        match: matchHeldCardToCatalog(card.issuer, card.productName),
      }));

      const matchedCount = resolved.filter((c) => c.match.status === 'matched').length;

      res.status(200).json({
        success: true,
        data: {
          businessId,
          heldCards: resolved,
          totalHeld: resolved.length,
          // Both counts ship so a caller renders "2 of 3 matched" rather
          // than presenting the matched ones as though they were the list.
          matchedCount,
          unmatchedCount: resolved.length - matchedCount,
          // Every rate here is an attestation resolved against a static
          // catalogue, not a rate read from an issuer. Saying so beside
          // the figures costs less than a reader assuming otherwise.
          provenance:
            'Cards are advisor-attested, not bureau-pulled. Earn rates come from the ' +
            'static rate catalogue and are not read from the issuer.',
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /rewards/held-cards');
    }
  },
);

// ── GET /api/businesses/:id/benefits ─────────────────────────
//
// Returns all card benefits registered for the business.
// Optional query: ?cardId=<slug>

rewardsRouter.get(
  '/businesses/:id/benefits',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id']!;

    if (!businessId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId path parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    const cardId = typeof req.query['cardId'] === 'string' ? req.query['cardId'] : undefined;

    try {
      // Read from card_benefits, the same rows /api/card-benefits/:clientId
      // serves and the same rows mark-used writes.
      //
      // This used to call cardBenefits.getBusinessBenefits(), which reads a
      // module-level Map that nothing has written since mark-used was rebuilt
      // against Prisma. So this endpoint returned an empty list for every
      // client, forever, and the /rewards page rendered "no benefits on record"
      // — while /card-benefits, one navigation away, listed the same client's
      // real benefits from the database.
      //
      // An empty answer from the wrong source is the worst of the three
      // possible states: it is not an error, it is not a refusal, and it is
      // indistinguishable from the truthful answer for a client who genuinely
      // has none.
      const applications = await sharedPrisma.cardApplication.findMany({
        where: {
          businessId,
          ...(cardId ? { id: cardId } : {}),
          business: { tenantId: req.tenant?.tenantId ?? '' },
        },
        select: { id: true },
      });

      const rows = applications.length
        ? await sharedPrisma.cardBenefit.findMany({
            where: { cardApplicationId: { in: applications.map((a) => a.id) } },
            orderBy: [{ expiryDate: 'asc' }, { benefitName: 'asc' }],
          })
        : [];

      const benefits = rows.map((r) => ({
        id: r.id,
        businessId,
        cardApplicationId: r.cardApplicationId,
        cardId: r.cardApplicationId,
        definitionId: '',
        benefitType: r.benefitType,
        benefitName: r.benefitName,
        // Null stays null. A benefit whose value nobody recorded is not a
        // benefit worth nothing.
        benefitValue: r.benefitValue === null ? null : Number(r.benefitValue),
        expiryDate: r.expiryDate?.toISOString() ?? null,
        utilized: r.utilized,
        utilizedDate: r.utilizedDate?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }));

      // Unused, dated, and expiring within 90 days. A benefit with no expiry
      // date on record cannot be said to be expiring, so it is not counted.
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 90);
      const alerts = benefits.filter(
        (b) => !b.utilized && b.expiryDate !== null && new Date(b.expiryDate) <= horizon,
      );

      res.status(200).json({
        success: true,
        data: {
          businessId,
          benefits,
          expiryAlerts: alerts,
          totalBenefits:    benefits.length,
          utilizedCount:    benefits.filter((b) => b.utilized).length,
          pendingAlerts:    alerts.length,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /benefits');
    }
  },
);

// ── POST /api/businesses/:id/benefits/:benefitId/utilize ─────
//
// Mark a benefit as utilized.
// Body: { utilizedDate?: string (ISO) }

rewardsRouter.post(
  '/benefits/:benefitId/utilize',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id']!;
    const benefitId  = req.params['benefitId']!;

    if (!businessId || !benefitId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId and benefitId are required.' },
      } satisfies ApiResponse);
      return;
    }

    const bodyParsed = UtilizeBenefitSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      handleZodError(bodyParsed.error, res);
      return;
    }

    try {
      const updated = cardBenefits.utilizeBenefit(businessId, benefitId, bodyParsed.data);

      if (!updated) {
        res.status(404).json({
          success: false,
          error: {
            code:    'NOT_FOUND',
            message: `Benefit ${benefitId} not found for business ${businessId}.`,
          },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: updated,
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /benefits/:benefitId/utilize');
    }
  },
);

// ── GET /api/businesses/:id/benefits/renewal-recommendations ─
//
// Returns keep / cancel / negotiate / product_change
// recommendations for each card in the business portfolio.

rewardsRouter.get(
  '/benefits/renewal-recommendations',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id']!;

    if (!businessId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId path parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    try {
      const recommendations = cardBenefits.getRenewalRecommendations(businessId);

      const summary = {
        keep:           recommendations.filter((r) => r.decision === 'keep').length,
        cancel:         recommendations.filter((r) => r.decision === 'cancel').length,
        negotiate:      recommendations.filter((r) => r.decision === 'negotiate').length,
        product_change: recommendations.filter((r) => r.decision === 'product_change').length,
        totalPotentialSavings: recommendations.reduce(
          (s, r) => s + r.potentialAnnualSavings,
          0,
        ),
      };

      res.status(200).json({
        success: true,
        data: {
          businessId,
          recommendations,
          summary,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /benefits/renewal-recommendations');
    }
  },
);

// ============================================================
// Client-Level Rewards Points & Card Management
// ============================================================

// In-memory stores for mock data

// ── GET /api/rewards/:clientId/points-balances ──────────────
//
// Refused. Nothing records a rewards balance.
//
// This returned points and cash-back balances per programme, written into the
// handler and identical for every client. A rewards balance is money the
// client believes they have — it gets redeemed, and counted against a card's
// annual fee when deciding whether to keep it — so inventing one is not a
// display placeholder.
//
// No table holds a points balance and no integration reads one from an
// issuer. Until one does, this says so.

rewardsRouter.get(
  '/:clientId/points-balances',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = Array.isArray(req.params['clientId'])
      ? req.params['clientId'][0]!
      : (req.params['clientId'] ?? '');

    logger.info('[rewards] points-balances refused — nothing records a balance', { clientId });

    res.status(501).json({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message:
          'Rewards balances are not implemented. Nothing records points or cash back for a ' +
          'client, and no issuer integration reads them. This used to answer 200 with balances ' +
          'written into the handler, the same figures for every client.',
      },
    } satisfies ApiResponse);
  },
);

// ── POST /api/rewards/:clientId/export ──────────────────────
//
// Refused. It exported the balances its own sibling refuses to report.
//
// This built a "REWARDS PORTFOLIO REPORT" naming the client and asserting
// 124,500 Amex Membership Rewards points, 89,200 Chase Ultimate Rewards points,
// $312.47 of Capital One cash back and a total estimated value of $3,206.72 —
// written into the handler, identical for every client, and followed by four
// redemption recommendations derived from them.
//
// `GET /:clientId/points-balances` above was made a 501 because nothing records
// a points balance and no issuer integration reads one. The same figures went
// on being exported from here, in the one format that leaves the building: a
// document. A balance a client reads off a report is money they believe they
// have — it gets redeemed, and it gets counted against a card's annual fee when
// deciding whether to keep the card.
//
// It also took no tenant. `clientId` came from the path and was never checked
// against the caller, so any authenticated caller could export a report naming
// any client id in any tenant. That mattered less than it sounds only because
// the figures were the same for everyone, which is not a defence.

rewardsRouter.post(
  '/:clientId/export',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = Array.isArray(req.params['clientId'])
      ? req.params['clientId'][0]!
      : (req.params['clientId'] ?? '');

    logger.info('[rewards] export refused — nothing records a balance to export', { clientId });

    res.status(501).json({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message:
          'Rewards export is not implemented. Nothing records points or cash back for a ' +
          'client, so there is no balance to export. This used to answer 200 with a report ' +
          'asserting per-programme balances and a total estimated value, the same figures ' +
          'for every client — the values its sibling GET /points-balances already refuses ' +
          'to report.',
      },
    } satisfies ApiResponse);
  },
);

// ── POST /api/cards/:id/cancel ──────────────────────────────
//
// Log a card cancellation.
// Body: { reason?: string }

rewardsRouter.post(
  '/cards/:id/cancel',
  async (req: Request, res: Response): Promise<void> => {
    // This wrote { cancelledAt, reason } into a module-level object and
    // answered 200 with status "cancelled". The card application kept whatever
    // status it had, so the card went on being listed as approved everywhere
    // else, and the cancellation was gone at the next restart.
    //
    // A card the client believes is cancelled, and the system still counts as
    // open credit, is the wrong way round for a page that totals available
    // credit.
    const cardId = Array.isArray(req.params['id']) ? req.params['id'][0]! : (req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;
    const { reason } = req.body as Record<string, unknown>;

    if (!cardId || !tenantId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'Card id and tenant context are required.' },
      } satisfies ApiResponse);
      return;
    }

    try {
      // The business gate is the tenant check: a card application belongs to a
      // business, which carries the tenant.
      const card = await sharedPrisma.cardApplication.findFirst({
        where: { id: cardId, business: { tenantId } },
        select: { id: true, status: true },
      });

      if (!card) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `No card found with id ${cardId}.` },
        } satisfies ApiResponse);
        return;
      }

      if (card.status === 'cancelled') {
        res.status(422).json({
          success: false,
          error: { code: 'ALREADY_CANCELLED', message: `Card ${cardId} is already cancelled.` },
        } satisfies ApiResponse);
        return;
      }

      const cancelReason = typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null;

      // Both writes together. A status change with no record of why, or a
      // reason with no status change, is half of what this endpoint claims.
      const [updated, audit] = await sharedPrisma.$transaction([
        sharedPrisma.cardApplication.update({
          where: { id: cardId },
          // The time as well as the fact. Without it a cancelled card cannot
          // be placed in time, so the active-applications history had no way
          // to show it as open before this moment and closed after — it could
          // only drop the card entirely.
          data: { status: 'cancelled', cancelledAt: new Date() },
        }),
        sharedPrisma.auditLog.create({
          data: {
            tenantId,
            userId: req.tenant?.userId ?? null,
            action: 'card.cancelled',
            resource: 'card_application',
            resourceId: cardId,
            // No column holds a cancellation reason, and "No reason provided"
            // was written in where none was given — a sentence nobody said.
            metadata: { reason: cancelReason, previousStatus: card.status },
          },
        }),
      ]);

      logger.info('Card cancellation recorded', { cardId, tenantId });

      res.status(200).json({
        success: true,
        data: {
          cardId: updated.id,
          status: updated.status,
          cancelledAt: audit.timestamp.toISOString(),
          reason: cancelReason,
          // Recording the cancellation is not closing the account with the
          // issuer. Nothing here contacts them.
          closedWithIssuer: false,
        },
      } satisfies ApiResponse);
    } catch (err) {
      logger.error('Failed to record card cancellation', { cardId, tenantId, err });
      res.status(500).json({
        success: false,
        error: { code: 'CANCEL_FAILED', message: 'Could not record the cancellation.' },
      } satisfies ApiResponse);
    }
  },
);

export default rewardsRouter;
