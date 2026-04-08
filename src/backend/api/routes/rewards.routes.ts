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
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z, type ZodError } from 'zod';
import { RewardsOptimizationService, MCC_CATEGORIES, type MccCategory, type SpendProfile } from '../../services/rewards-optimization.service.js';
import { CardBenefitsService } from '../../services/card-benefits.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

// ── Shared service instances ──────────────────────────────────

const rewardsOptimizer = new RewardsOptimizationService();
const cardBenefits     = new CardBenefitsService();

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
  '/rewards/optimization',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
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
  '/rewards/annual-summary',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
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

// ── GET /api/businesses/:id/benefits ─────────────────────────
//
// Returns all card benefits registered for the business.
// Optional query: ?cardId=<slug>

rewardsRouter.get(
  '/benefits',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];

    if (!businessId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId path parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    const cardId = typeof req.query['cardId'] === 'string' ? req.query['cardId'] : undefined;

    try {
      const benefits = cardBenefits.getBusinessBenefits(businessId, cardId);
      const alerts   = cardBenefits.getExpiryAlerts(businessId);

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
    const businessId = req.params['id'];
    const benefitId  = req.params['benefitId'];

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
    const businessId = req.params['id'];

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
const cancelledCards: Record<string, { cancelledAt: string; reason: string }> = {};

// ── GET /api/rewards/:clientId/points-balances ──────────────
//
// Returns mock points / cash-back balances across reward programs.

rewardsRouter.get(
  '/:clientId/points-balances',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = Array.isArray(req.params['clientId']) ? req.params['clientId'][0]! : (req.params['clientId'] ?? '');

    logger.debug('GET rewards points-balances', { clientId });

    res.status(200).json({
      success: true,
      data: {
        clientId,
        asOf: new Date().toISOString(),
        balances: [
          {
            program: 'American Express Membership Rewards',
            shortName: 'Amex MR',
            points: 124500,
            estimatedValue: 1556.25,
            valueCentsPerPoint: 1.25,
          },
          {
            program: 'Chase Ultimate Rewards',
            shortName: 'Chase UR',
            points: 89200,
            estimatedValue: 1338.00,
            valueCentsPerPoint: 1.50,
          },
          {
            program: 'Capital One Cash Rewards',
            shortName: 'CapOne Cash',
            points: 0,
            cashBack: 312.47,
            estimatedValue: 312.47,
            valueCentsPerPoint: null,
          },
        ],
        totalEstimatedValue: 3206.72,
      },
    } satisfies ApiResponse);
  },
);

// ── POST /api/rewards/:clientId/export ──────────────────────
//
// Export a mock text rewards summary report.

rewardsRouter.post(
  '/:clientId/export',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = Array.isArray(req.params['clientId']) ? req.params['clientId'][0]! : (req.params['clientId'] ?? '');

    logger.info('Rewards report exported', { clientId });

    const report = [
      'REWARDS PORTFOLIO REPORT',
      `Client: ${clientId}`,
      `Generated: ${new Date().toISOString()}`,
      '='.repeat(50),
      '',
      'Program Balances:',
      '  Amex Membership Rewards:   124,500 pts  (~$1,556.25)',
      '  Chase Ultimate Rewards:     89,200 pts  (~$1,338.00)',
      '  Capital One Cash Rewards:   $312.47 cash back',
      '',
      'Total Estimated Value: $3,206.72',
      '',
      'Recommendations:',
      '  - Transfer 50,000 Amex MR to Delta SkyMiles for 1.4 cpp value',
      '  - Redeem Chase UR via Pay Yourself Back for 1.5 cpp',
      '  - Request Capital One cash-back statement credit',
      '',
      'END OF REPORT',
    ].join('\n');

    res.status(200).json({
      success: true,
      data: {
        clientId,
        format: 'text',
        report,
        generatedAt: new Date().toISOString(),
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
    const cardId = Array.isArray(req.params['id']) ? req.params['id'][0]! : (req.params['id'] ?? '');
    const { reason } = req.body as Record<string, unknown>;

    const cancellation = {
      cancelledAt: new Date().toISOString(),
      reason: typeof reason === 'string' ? reason : 'No reason provided',
    };

    cancelledCards[cardId] = cancellation;

    logger.info('Card cancellation logged', { cardId, reason: cancellation.reason });

    res.status(200).json({
      success: true,
      data: {
        cardId,
        ...cancellation,
        status: 'cancelled',
      },
    } satisfies ApiResponse);
  },
);

export default rewardsRouter;
