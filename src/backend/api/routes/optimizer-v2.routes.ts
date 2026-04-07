// ============================================================
// CapitalForge — Stacking Optimizer V2 Routes (Prisma-backed)
//
// Endpoints:
//   POST /api/optimizer/run
//     Run the stacking optimizer for a business using DB card products.
//     Body: { businessId, targetAmount?, maxCards?, prioritize?,
//             excludeIssuers?, includeCreditUnions? }
//     Returns: StackingPlan
//
// All routes require a valid JWT.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  runStackingOptimizer,
  type StackingOptimizerInput,
  type PrioritizationMode,
} from '../../services/stacking-optimizer.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const optimizerV2Router = Router();

// ── Validation schema ────────────────────────────────────────

const RunOptimizerSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  targetAmount: z.number().positive().optional().default(100000),
  maxCards: z.number().int().min(1).max(20).optional().default(8),
  prioritize: z
    .enum(['max_credit', 'best_terms', 'fastest_approval', 'min_inquiries'])
    .optional()
    .default('max_credit'),
  excludeIssuers: z.array(z.string()).optional().default([]),
  includeCreditUnions: z.boolean().optional().default(false),
});

// ── POST /api/optimizer/run ──────────────────────────────────

optimizerV2Router.post(
  '/run',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RunOptimizerSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body.',
          details: parsed.error.flatten().fieldErrors,
        },
      } satisfies ApiResponse);
      return;
    }

    const input: StackingOptimizerInput = {
      businessId: parsed.data.businessId,
      targetAmount: parsed.data.targetAmount,
      maxCards: parsed.data.maxCards,
      prioritize: parsed.data.prioritize as PrioritizationMode,
      excludeIssuers: parsed.data.excludeIssuers,
      includeCreditUnions: parsed.data.includeCreditUnions,
    };

    try {
      const plan = await runStackingOptimizer(input);

      res.status(200).json({
        success: true,
        data: plan,
      } satisfies ApiResponse);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';

      // Handle "not found" from Prisma
      if (
        err instanceof Error &&
        (err.message.includes('not found') ||
          err.message.includes('NotFoundError') ||
          (err as { code?: string }).code === 'P2025')
      ) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Business not found: ${input.businessId}`,
          },
        } satisfies ApiResponse);
        return;
      }

      logger.error('[OptimizerV2] Error running optimizer', { err });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
      } satisfies ApiResponse);
    }
  },
);

export default optimizerV2Router;
