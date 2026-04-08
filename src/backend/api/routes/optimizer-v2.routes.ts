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
//   GET /api/optimizer/card-products
//     Return all card products (bank + CU) from the database.
//     Query params: ?type=business_credit&issuer=chase&active=true
//     Returns: { bankProducts, creditUnionProducts, total }
//
// All routes require a valid JWT.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import {
  runStackingOptimizer,
  type StackingOptimizerInput,
  type PrioritizationMode,
} from '../../services/stacking-optimizer.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const optimizerV2Router = Router();

// Lazy singleton — avoids instantiating Prisma in tests that don't need it
let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

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

// ── GET /api/optimizer/card-products ─────────────────────────
//
// Return all card products (bank + CU) for the frontend product catalog.
// Optional query filters: ?type=business_credit&issuer=chase&active=true

optimizerV2Router.get(
  '/card-products',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db = getPrisma();
      const { type, issuer, active } = req.query;

      // Default: only active products
      const isActive = active !== 'false';

      // ── Bank card products (from CardProduct table) ──
      const bankWhere: Record<string, unknown> = {};
      if (isActive) bankWhere.isActive = true;
      if (type && typeof type === 'string') bankWhere.cardType = type;
      if (issuer && typeof issuer === 'string') bankWhere.issuerId = issuer;

      const bankProducts = await db.cardProduct.findMany({
        where: bankWhere,
        orderBy: [{ issuerId: 'asc' }, { name: 'asc' }],
      });

      // ── Credit union products (from CreditUnionProduct table) ──
      const cuProductWhere: Record<string, unknown> = {};
      if (isActive) cuProductWhere.isActive = true;
      if (type && typeof type === 'string') cuProductWhere.productType = type;

      const creditUnionProducts = await db.creditUnionProduct.findMany({
        where: cuProductWhere,
        include: {
          creditUnion: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: [{ productType: 'asc' }, { productName: 'asc' }],
      });

      // Normalize CU products to a consistent shape for the frontend
      const normalizedCuProducts = creditUnionProducts.map((p) => ({
        id: p.id,
        source: 'credit_union' as const,
        issuer: p.creditUnion.name,
        issuerSlug: p.creditUnion.slug,
        name: p.productName,
        productType: p.productType,
        maxLimit: p.maxLimit,
        aprIntro: p.aprIntro,
        aprIntroMonths: p.aprIntroMonths,
        aprPostPromo: p.aprPostPromo,
        annualFee: p.annualFee,
        scoreMinimum: p.scoreMinimum,
        businessAgeMinimum: p.businessAgeMinimum,
        revenueMinimum: p.revenueMinimum,
        rewardsType: p.rewardsType,
        rewardsRate: p.rewardsRate,
        personalGuarantee: p.personalGuarantee,
        hardPull: p.hardPull,
        notes: p.notes,
        isActive: p.isActive,
      }));

      // Tag bank products with source
      const normalizedBankProducts = bankProducts.map((p) => ({
        ...p,
        source: 'bank' as const,
      }));

      res.status(200).json({
        success: true,
        data: {
          bankProducts: normalizedBankProducts,
          creditUnionProducts: normalizedCuProducts,
          total: normalizedBankProducts.length + normalizedCuProducts.length,
        },
      } satisfies ApiResponse);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      logger.error('[OptimizerV2] Error fetching card products', { err });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message },
      } satisfies ApiResponse);
    }
  },
);

export default optimizerV2Router;
