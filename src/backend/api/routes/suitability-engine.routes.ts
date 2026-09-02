// ============================================================
// CapitalForge — Suitability Engine Routes (Phase 3)
//
// Endpoint:
//   POST /api/suitability/calculate
//     Score a payload the caller supplies. It answers about that
//     payload and says so — it names no business and reads no
//     record, so nothing it returns is a claim about a client.
//
// GET /api/suitability/:businessId was deleted on 2 September.
// It resolved a real business, read two fields from it — revenue
// and formation date — and invented the rest:
//
//     creditScore = 700, utilizationRatio = 0.20,
//     debtServiceRatio = 0.15, inquiries = 1, derogatoryMarks = 0,
//     advisorConfirmedDebtServicing = true,
//     clientAcknowledgedPersonalGuarantee = true,
//     clientAcknowledgedAprRisk = true
//
// Four of the seven hard no-go triggers could therefore never fire,
// including all three that record a human having confirmed
// something, and the answer came back stamped with the businessId
// and the legal name. A fifth fired wrongly: a business with no
// dateOfFormation was reported "0 months old", which is a missing
// field rendered as a fact about the business.
//
// The assessment that is about a named client is
// POST /api/businesses/:id/suitability/check, which persists, and
// which now reads the acknowledgment records rather than being told
// about them. See suitability.service.ts.
// ============================================================

import { Router, Response } from 'express';
import type { Request } from '../../types/http.js';
import { z, ZodError } from 'zod';
import {
  calculateSuitability,
  type SuitabilityEngineInput,
} from '../../services/suitability-engine.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Validation Schema ────────────────────────────────────────

const CalculateBodySchema = z.object({
  creditScore:                        z.number().int().min(300).max(850),
  utilizationRatio:                   z.number().min(0).max(1),
  businessAgeMonths:                  z.number().int().nonnegative(),
  annualRevenue:                      z.number().nonnegative(),
  debtServiceRatio:                   z.number().min(0).max(1),
  inquiries:                          z.number().int().nonnegative(),
  derogatoryMarks:                    z.number().int().nonnegative().default(0),
  advisorConfirmedDebtServicing:      z.boolean(),
  clientAcknowledgedPersonalGuarantee: z.boolean(),
  clientAcknowledgedAprRisk:          z.boolean(),
  naicsCode:                          z.string().regex(/^\d{4}$/, 'NAICS code must be exactly 4 digits'),
});

// ── Router ───────────────────────────────────────────────────

export const suitabilityEngineRouter = Router();

// ── Helpers ──────────────────────────────────────────────────

function handleZodError(err: ZodError, res: Response): void {
  res.status(422).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body.',
      details: err.flatten().fieldErrors,
    },
  } satisfies ApiResponse);
}

function handleUnexpectedError(err: unknown, res: Response, context: string): void {
  logger.error(`[SuitabilityEngineRoutes] Unexpected error in ${context}`, { err });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

// ── POST /api/suitability/calculate ──────────────────────────

suitabilityEngineRouter.post(
  '/calculate',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CalculateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const input: SuitabilityEngineInput = parsed.data;
      const result = calculateSuitability(input);

      const body: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(body);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /calculate');
    }
  },
);

export default suitabilityEngineRouter;
