// ============================================================
// CapitalForge — Suitability Engine Routes (Phase 3)
//
// Endpoints:
//   POST /api/suitability/calculate
//     Accept a business profile payload and return a full
//     SuitabilityResult with scores, tier, no-go triggers, etc.
//
//   GET  /api/suitability/:businessId
//     Load business data from DB and compute suitability on the fly.
//
// These routes complement the existing per-business suitability
// routes at /api/businesses/:id/suitability/*.
// ============================================================

import { Router, Request, Response } from 'express';
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

// ── GET /api/suitability/:businessId ─────────────────────────

suitabilityEngineRouter.get(
  '/:businessId',
  async (req: Request, res: Response): Promise<void> => {
    const { businessId } = req.params;

    try {
      // Dynamically import Prisma to avoid circular dependency at module load time
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      // Look up the business
      const business = await prisma.business.findUnique({
        where: { id: businessId },
      });

      if (!business) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Business ${businessId} not found.`,
          },
        } satisfies ApiResponse);
        return;
      }

      // Build input from stored business data with sensible defaults
      // for fields not stored directly on the business record.
      const annualRevenue = business.annualRevenue
        ? Number(business.annualRevenue)
        : (business.monthlyRevenue ? Number(business.monthlyRevenue) * 12 : 0);

      const businessAgeMonths = business.dateOfFormation
        ? Math.max(0, Math.floor(
            (Date.now() - new Date(business.dateOfFormation).getTime()) / (30.44 * 24 * 60 * 60 * 1000),
          ))
        : 0;

      // Look for the most recent suitability check for additional data
      const latestCheck = await prisma.suitabilityCheck.findFirst({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      });

      // Try to extract score breakdown data if available
      let creditScore = 700; // default
      let utilizationRatio = 0.20;
      let debtServiceRatio = 0.15;
      let inquiries = 1;
      let derogatoryMarks = 0;

      if (latestCheck?.decisionExplanation) {
        try {
          const explanation = JSON.parse(latestCheck.decisionExplanation as string);
          // Try to infer from stored breakdown
          if (explanation.creditScore) creditScore = explanation.creditScore;
        } catch {
          // Use defaults
        }
      }

      const input: SuitabilityEngineInput = {
        creditScore,
        utilizationRatio,
        businessAgeMonths,
        annualRevenue,
        debtServiceRatio,
        inquiries,
        derogatoryMarks,
        advisorConfirmedDebtServicing: true, // default for existing businesses
        clientAcknowledgedPersonalGuarantee: true,
        clientAcknowledgedAprRisk: true,
        naicsCode: (business as Record<string, unknown>).naicsCode as string || '0000',
      };

      const result = calculateSuitability(input);

      res.status(200).json({
        success: true,
        data: {
          businessId,
          businessName: business.legalName,
          ...result,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, `GET /${businessId}`);
    }
  },
);

export default suitabilityEngineRouter;
