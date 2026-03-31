// ============================================================
// CapitalForge — Cost of Capital Calculator Routes
//
// POST /api/businesses/:id/cost/calculate
//   Run a full cost-of-capital calculation for a business's
//   current card stack. Body: CostCalculationInput (minus
//   businessId and tenantId — those come from path and JWT).
//
// GET  /api/businesses/:id/cost/latest
//   Retrieve the most recent calculation result for this business.
//
// POST /api/businesses/:id/cost/compare
//   Compare the stacking strategy against alternative financing
//   products (SBA, LOC, MCA). Returns alternatives[] with APR,
//   total cost, and monthly payment for each product.
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  costCalculatorService,
  saveLatestResult,
  getLatestResult,
} from '../../services/cost-calculator.service.js';
import type { CostCalculationInput } from '../../services/cost-calculator.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────────────────────

export const costCalculatorRouter = Router({ mergeParams: true });

// All routes require a valid tenant JWT.
costCalculatorRouter.use(tenantMiddleware);

// ── POST /api/businesses/:id/cost/calculate ───────────────────────────────────

costCalculatorRouter.post(
  '/calculate',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenantId = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const rawBody = req.body as Partial<CostCalculationInput>;

    // ── Input validation ────────────────────────────────────
    const validationError = validateCalculationInput(rawBody);
    if (validationError) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: validationError },
      };
      res.status(422).json(body);
      return;
    }

    const input: CostCalculationInput = {
      ...rawBody as CostCalculationInput,
      businessId,
      tenantId,
    };

    try {
      const result = costCalculatorService.calculate(input);
      saveLatestResult(result);

      logger.info('Cost calculation completed', {
        businessId,
        tenantId,
        effectiveApr: result.breakdown.effectiveApr,
        totalCost: result.breakdown.totalCost,
        irc163jAlert: result.irc163jAlert,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Cost calculation failed', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: { code: 'CALCULATION_ERROR', message: 'Failed to compute cost of capital.' },
      };
      res.status(500).json(body);
    }
  },
);

// ── GET /api/businesses/:id/cost/latest ──────────────────────────────────────

costCalculatorRouter.get(
  '/latest',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenantId = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const result = getLatestResult(businessId);

    if (!result) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No cost calculation found for this business. Run /calculate first.',
        },
      };
      res.status(404).json(body);
      return;
    }

    logger.info('Latest cost calculation retrieved', { businessId, tenantId });

    const body: ApiResponse<typeof result> = { success: true, data: result };
    res.status(200).json(body);
  },
);

// ── POST /api/businesses/:id/cost/compare ────────────────────────────────────

costCalculatorRouter.post(
  '/compare',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenantId = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const rawBody = req.body as Partial<CompareRequest>;

    const validationError = validateCompareInput(rawBody);
    if (validationError) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: validationError },
      };
      res.status(422).json(body);
      return;
    }

    const { totalFundingObtained, projectionMonths = 12 } = rawBody as CompareRequest;

    try {
      // Reuse the full calculation's alternatives builder via a minimal input
      const minimalInput: CostCalculationInput = {
        businessId,
        tenantId,
        cards: [],
        programFee: 0,
        percentOfFundingFee: 0,
        monthlyProcessorFee: 0,
        projectionMonths,
        // Inject the explicit funding amount directly so alternatives are
        // computed against it even with an empty card stack.
      };

      // We compute alternatives by temporarily setting a synthetic balance card
      const syntheticInput: CostCalculationInput = {
        ...minimalInput,
        cards: [
          {
            id: 'synthetic',
            issuer: 'N/A',
            creditLimit: totalFundingObtained,
            currentBalance: totalFundingObtained,
            promoApr: 0,
            standardApr: 0.2499,
            promoExpiryMonth: 12,
            annualFee: 0,
            minPaymentRate: 0.02,
          },
        ],
      };

      const result = costCalculatorService.calculate(syntheticInput);

      const responsePayload = {
        businessId,
        fundingAmount: totalFundingObtained,
        projectionMonths,
        stackingCost: result.breakdown,
        alternatives: result.alternatives,
        stackingAdvantage: result.stackingAdvantage,
        recommendation: result.recommendation,
      };

      logger.info('Cost comparison completed', {
        businessId,
        tenantId,
        fundingAmount: totalFundingObtained,
      });

      const body: ApiResponse<typeof responsePayload> = {
        success: true,
        data: responsePayload,
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Cost comparison failed', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: { code: 'COMPARISON_ERROR', message: 'Failed to compute cost comparison.' },
      };
      res.status(500).json(body);
    }
  },
);

// ── Validation Helpers ────────────────────────────────────────────────────────

interface CompareRequest {
  totalFundingObtained: number;
  projectionMonths?: number;
}

function validateCalculationInput(body: Partial<CostCalculationInput>): string | null {
  if (!body.cards || !Array.isArray(body.cards) || body.cards.length === 0) {
    return 'At least one card is required in the "cards" array.';
  }

  if (typeof body.programFee !== 'number' || body.programFee < 0) {
    return '"programFee" must be a non-negative number.';
  }

  if (
    typeof body.percentOfFundingFee !== 'number' ||
    body.percentOfFundingFee < 0 ||
    body.percentOfFundingFee > 1
  ) {
    return '"percentOfFundingFee" must be a decimal between 0 and 1.';
  }

  if (typeof body.monthlyProcessorFee !== 'number' || body.monthlyProcessorFee < 0) {
    return '"monthlyProcessorFee" must be a non-negative number.';
  }

  for (const [i, card] of body.cards.entries()) {
    if (!card.id) return `Card at index ${i} is missing "id".`;
    if (typeof card.creditLimit !== 'number' || card.creditLimit <= 0) {
      return `Card ${card.id}: "creditLimit" must be a positive number.`;
    }
    if (typeof card.currentBalance !== 'number' || card.currentBalance < 0) {
      return `Card ${card.id}: "currentBalance" must be a non-negative number.`;
    }
    if (card.currentBalance > card.creditLimit) {
      return `Card ${card.id}: "currentBalance" (${card.currentBalance}) cannot exceed "creditLimit" (${card.creditLimit}).`;
    }
    if (typeof card.standardApr !== 'number' || card.standardApr < 0 || card.standardApr > 2) {
      return `Card ${card.id}: "standardApr" must be a decimal between 0 and 2.`;
    }
    if (typeof card.promoExpiryMonth !== 'number' || card.promoExpiryMonth < 0) {
      return `Card ${card.id}: "promoExpiryMonth" must be a non-negative number.`;
    }
  }

  return null;
}

function validateCompareInput(body: Partial<CompareRequest>): string | null {
  if (
    typeof body.totalFundingObtained !== 'number' ||
    body.totalFundingObtained <= 0
  ) {
    return '"totalFundingObtained" must be a positive number.';
  }

  if (
    body.projectionMonths !== undefined &&
    (typeof body.projectionMonths !== 'number' ||
      body.projectionMonths < 1 ||
      body.projectionMonths > 120)
  ) {
    return '"projectionMonths" must be an integer between 1 and 120.';
  }

  return null;
}
