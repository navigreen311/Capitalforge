// ============================================================
// CapitalForge — Repayment Command Center Routes
//
// POST /api/businesses/:id/repayment/plan
//   Create a repayment plan (avalanche or snowball).
//
// GET  /api/businesses/:id/repayment/plan
//   Retrieve the current active repayment plan for a business.
//
// GET  /api/businesses/:id/repayment/schedule
//   Return all payment schedule entries for the business.
//
// PUT  /api/repayment/schedule/:id/paid
//   Record an actual payment against a scheduled entry.
//
// GET  /api/businesses/:id/repayment/forecast
//   Generate interest-shock forecast and refinancing options.
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  repaymentService,
} from '../../services/repayment.service.js';
import type {
  CreateRepaymentPlanInput,
  CardDebt,
  RecordPaymentInput,
} from '../../services/repayment.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Routers ───────────────────────────────────────────────────────────────────

/** Business-scoped routes — mounted at /api/businesses/:id/repayment */
export const repaymentRouter = Router({ mergeParams: true });
repaymentRouter.use(tenantMiddleware);

/** Schedule-level routes — mounted at /api/repayment (no business scoping) */
export const repaymentScheduleRouter = Router({ mergeParams: true });
repaymentScheduleRouter.use(tenantMiddleware);

// ── POST /api/businesses/:id/repayment/plan ───────────────────────────────────

repaymentRouter.post(
  '/plan',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = String(req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const rawBody = req.body as Partial<CreateRepaymentPlanInput>;
    const validationError = validateCreatePlanInput(rawBody);
    if (validationError) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: validationError },
      };
      res.status(422).json(body);
      return;
    }

    const input: CreateRepaymentPlanInput = {
      ...(rawBody as CreateRepaymentPlanInput),
      businessId,
      tenantId,
    };

    try {
      const plan = repaymentService.createPlan(input);

      logger.info('Repayment plan created', {
        businessId,
        tenantId,
        strategy: plan.strategy,
        totalBalance: plan.totalBalance,
        cardCount: plan.prioritisedCards.length,
        interestShockDate: plan.interestShockDate,
      });

      const body: ApiResponse<typeof plan> = { success: true, data: plan };
      res.status(201).json(body);
    } catch (err) {
      logger.error('Repayment plan creation failed', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: { code: 'PLAN_CREATION_ERROR', message: 'Failed to create repayment plan.' },
      };
      res.status(500).json(body);
    }
  },
);

// ── GET /api/businesses/:id/repayment/plan ────────────────────────────────────

repaymentRouter.get(
  '/plan',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = String(req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const plan = repaymentService.getLatestPlan(businessId);

    if (!plan) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No active repayment plan found for this business. Create one via POST /repayment/plan.',
        },
      };
      res.status(404).json(body);
      return;
    }

    logger.info('Repayment plan retrieved', { businessId, tenantId, strategy: plan.strategy });

    const body: ApiResponse<typeof plan> = { success: true, data: plan };
    res.status(200).json(body);
  },
);

// ── GET /api/businesses/:id/repayment/schedule ────────────────────────────────

repaymentRouter.get(
  '/schedule',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = String(req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const schedules = repaymentService.getAllSchedulesForBusiness(businessId);

    logger.info('Payment schedule retrieved', {
      businessId,
      tenantId,
      entryCount: schedules.length,
    });

    const body: ApiResponse<typeof schedules> = { success: true, data: schedules };
    res.status(200).json(body);
  },
);

// ── PUT /api/repayment/schedule/:id/paid ─────────────────────────────────────

repaymentScheduleRouter.put(
  '/schedule/:id/paid',
  async (req: Request, res: Response): Promise<void> => {
    const scheduleId = String(req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;

    if (!scheduleId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Schedule ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const rawBody = req.body as Partial<{ actualPayment: number; paidAt: string }>;
    if (typeof rawBody.actualPayment !== 'number' || rawBody.actualPayment < 0) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '"actualPayment" must be a non-negative number.',
        },
      };
      res.status(422).json(body);
      return;
    }

    const input: RecordPaymentInput = {
      scheduleId,
      actualPayment: rawBody.actualPayment,
      paidAt: rawBody.paidAt ? new Date(rawBody.paidAt) : undefined,
    };

    try {
      const result = repaymentService.recordPayment(input);

      logger.info('Payment recorded', {
        scheduleId,
        tenantId,
        actualPayment: result.actualPayment,
        status: result.status,
        underpayment: result.underpayment,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNotFound = msg.includes('not found');

      logger.warn('Payment recording failed', { scheduleId, tenantId, error: msg });

      const body: ApiResponse = {
        success: false,
        error: {
          code: isNotFound ? 'NOT_FOUND' : 'PAYMENT_RECORD_ERROR',
          message: isNotFound
            ? `Schedule entry ${scheduleId} not found.`
            : 'Failed to record payment.',
        },
      };
      res.status(isNotFound ? 404 : 500).json(body);
    }
  },
);

// ── GET /api/businesses/:id/repayment/forecast ────────────────────────────────

repaymentRouter.get(
  '/forecast',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = String(req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    // Cards may be passed in query body or sourced from existing plan
    const plan = repaymentService.getLatestPlan(businessId);

    if (!plan) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No repayment plan found. Create a plan first so the service has card data.',
        },
      };
      res.status(404).json(body);
      return;
    }

    try {
      const forecast = repaymentService.forecastInterestShock(businessId, plan.prioritisedCards);
      const transferFeePct = parseFloat(String(req.query['transferFeePct'] ?? '0.03'));
      const transferApr = parseFloat(String(req.query['transferApr'] ?? '0'));
      const projectionMonths = parseInt(String(req.query['projectionMonths'] ?? '12'), 10);

      const refinancing = repaymentService.buildRefinancingPlan(
        businessId,
        plan.prioritisedCards,
        isNaN(transferApr) ? 0 : transferApr,
        isNaN(transferFeePct) ? 0.03 : transferFeePct,
        isNaN(projectionMonths) ? 12 : projectionMonths,
      );

      const autopay = repaymentService.checkAutopayStatus(plan.prioritisedCards);

      const payload = {
        interestShockForecast: forecast,
        refinancingPlan: refinancing,
        autopayStatus: autopay,
      };

      logger.info('Interest shock forecast generated', {
        businessId,
        tenantId,
        shockCardsCount: forecast.cards.length,
        totalMonthlyExposure: forecast.totalMonthlyShockExposure,
      });

      const body: ApiResponse<typeof payload> = { success: true, data: payload };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Interest shock forecast failed', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: { code: 'FORECAST_ERROR', message: 'Failed to generate interest shock forecast.' },
      };
      res.status(500).json(body);
    }
  },
);

// ── Validation ────────────────────────────────────────────────────────────────

function validateCreatePlanInput(body: Partial<CreateRepaymentPlanInput>): string | null {
  if (!body.cards || !Array.isArray(body.cards) || body.cards.length === 0) {
    return '"cards" must be a non-empty array.';
  }

  if (
    typeof body.monthlyPaymentBudget !== 'number' ||
    body.monthlyPaymentBudget <= 0
  ) {
    return '"monthlyPaymentBudget" must be a positive number.';
  }

  if (body.strategy !== 'avalanche' && body.strategy !== 'snowball') {
    return '"strategy" must be "avalanche" or "snowball".';
  }

  if (
    body.projectionMonths !== undefined &&
    (typeof body.projectionMonths !== 'number' ||
      body.projectionMonths < 1 ||
      body.projectionMonths > 360)
  ) {
    return '"projectionMonths" must be an integer between 1 and 360.';
  }

  for (const [i, card] of (body.cards as Partial<CardDebt>[]).entries()) {
    if (!card.cardApplicationId) return `Card at index ${i} is missing "cardApplicationId".`;
    if (!card.issuer) return `Card at index ${i} is missing "issuer".`;
    if (typeof card.currentBalance !== 'number' || card.currentBalance < 0) {
      return `Card ${card.cardApplicationId}: "currentBalance" must be a non-negative number.`;
    }
    if (typeof card.regularApr !== 'number' || card.regularApr < 0 || card.regularApr > 2) {
      return `Card ${card.cardApplicationId}: "regularApr" must be a decimal between 0 and 2.`;
    }
    if (typeof card.introApr !== 'number' || card.introApr < 0) {
      return `Card ${card.cardApplicationId}: "introApr" must be a non-negative number.`;
    }
    if (typeof card.minimumPayment !== 'number' || card.minimumPayment < 0) {
      return `Card ${card.cardApplicationId}: "minimumPayment" must be a non-negative number.`;
    }
  }

  return null;
}
