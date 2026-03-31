// ============================================================
// CapitalForge — Hardship & Re-Stack Routes
//
// Endpoints:
//   POST /api/businesses/:id/hardship              — open hardship case
//   GET  /api/businesses/:id/hardship              — list cases
//   PUT  /api/hardship/:id                         — update case
//   POST /api/hardship/:id/payment-plan            — attach payment plan
//   POST /api/hardship/:id/settlement              — attach settlement offer
//   GET  /api/businesses/:id/restack/readiness     — score readiness
//   POST /api/businesses/:id/restack/trigger       — fire outreach trigger
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import {
  detectHardshipTrigger,
  openHardshipCase,
  createPaymentPlan,
  attachPaymentPlan,
  calculateSettlementOffer,
  attachSettlementOffer,
  buildCardClosureSequence,
  attachCardClosureSequence,
  generateCounselorReferral,
  attachCounselorReferral,
  listHardshipCases,
  updateHardshipCase,
  type HardshipTriggerInput,
  type CardSummary,
  type Severity,
} from '../../services/hardship.service.js';
import {
  evaluateRestackReadiness,
  buildOutreachTrigger,
  recordRestackConversion,
  type RestackReadinessInput,
} from '../../services/auto-restack.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const hardshipRouter = Router({ mergeParams: true });

// ── Auth helpers ──────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    } satisfies ApiResponse);
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
  logger.error(`[HardshipRoutes] Unexpected error in ${context}`, { err });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

// ── Validation Schemas ────────────────────────────────────────

const CardSummarySchema = z.object({
  cardApplicationId: z.string().min(1),
  issuer:            z.string().min(1),
  balance:           z.number().nonnegative(),
  creditLimit:       z.number().positive(),
  annualFee:         z.number().nonnegative(),
  regularApr:        z.number().nonnegative(),
  introAprExpiry:    z.string().datetime().nullable().optional(),
});

const OpenHardshipSchema = z.object({
  missedPaymentCount:  z.number().int().nonnegative(),
  currentUtilization:  z.number().min(0).max(1),
  totalBalance:        z.number().nonnegative(),
  monthlyRevenue:      z.number().positive(),
  cards:               z.array(CardSummarySchema).min(1, 'At least one card is required'),
});

const UpdateHardshipSchema = z.object({
  status:            z.enum(['open', 'payment_plan', 'settlement', 'closed', 'referred']).optional(),
  counselorReferral: z.string().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field must be provided' });

const PaymentPlanSchema = z.object({
  monthlyRevenue: z.number().positive(),
  severity:       z.enum(['minor', 'serious', 'critical']),
  cards:          z.array(CardSummarySchema).min(1),
});

const SettlementSchema = z.object({
  totalBalance: z.number().positive(),
  severity:     z.enum(['minor', 'serious', 'critical']),
});

const RestackReadinessSchema = z.object({
  onTimePaymentMonths:          z.number().int().nonnegative(),
  missedPaymentsSinceHardship:  z.number().int().nonnegative(),
  currentUtilization:           z.number().min(0).max(1),
  baselineUtilization:          z.number().min(0).max(1),
  currentCreditScore:           z.number().int().min(300).max(850),
  baselineCreditScore:          z.number().int().min(300).max(850),
  monthsSinceLastEvent:         z.number().int().nonnegative(),
  activeHardshipCase:           z.boolean(),
  advisorId:                    z.string().nullable().optional(),
});

const RestackTriggerSchema = z.object({
  score:          z.number().int().min(0).max(100),
  band:           z.enum(['not_ready', 'building', 'approaching', 'ready', 'optimal']),
  advisorId:      z.string().nullable().optional(),
  fundingRoundId: z.string().optional(),
  revenueAmount:  z.number().nonnegative().optional(),
  triggerId:      z.string().optional(),
});

// ── POST /api/businesses/:id/hardship ─────────────────────────

hardshipRouter.post(
  '/businesses/:id/hardship',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'] as string;
    const tenant     = req.tenant!;

    const parsed = OpenHardshipSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    const { cards, ...rest } = parsed.data;
    const input: HardshipTriggerInput = {
      ...rest,
      cards: cards.map((c) => ({
        ...c,
        introAprExpiry: c.introAprExpiry ? new Date(c.introAprExpiry) : null,
      })),
    };

    // Detect trigger before persisting
    const trigger = detectHardshipTrigger(input);

    if (!trigger.shouldOpenCase) {
      res.status(200).json({
        success: true,
        data: {
          opened:  false,
          trigger,
          message: 'No hardship thresholds breached. No case opened.',
        },
      } satisfies ApiResponse);
      return;
    }

    try {
      const { caseId } = await openHardshipCase(businessId, tenant.tenantId, input);

      // Optionally attach closure sequence in the same call
      const closureSequence = buildCardClosureSequence(input.cards);
      await attachCardClosureSequence(caseId, tenant.tenantId, closureSequence);

      res.status(201).json({
        success: true,
        data: {
          caseId,
          opened:  true,
          trigger,
          closureSequence,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /businesses/:id/hardship');
    }
  },
);

// ── GET /api/businesses/:id/hardship ──────────────────────────

hardshipRouter.get(
  '/businesses/:id/hardship',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'] as string;

    try {
      const cases = await listHardshipCases(businessId);

      res.status(200).json({
        success: true,
        data:    cases,
        meta:    { total: cases.length },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /businesses/:id/hardship');
    }
  },
);

// ── PUT /api/hardship/:id ─────────────────────────────────────

hardshipRouter.put(
  '/hardship/:id',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const caseId = req.params['id'] as string;

    const parsed = UpdateHardshipSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    try {
      const updated = await updateHardshipCase(caseId, parsed.data);

      res.status(200).json({ success: true, data: updated } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'PUT /hardship/:id');
    }
  },
);

// ── POST /api/hardship/:id/payment-plan ───────────────────────

hardshipRouter.post(
  '/hardship/:id/payment-plan',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const caseId = req.params['id'] as string;
    const tenant = req.tenant!;

    const parsed = PaymentPlanSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    const { monthlyRevenue, severity, cards } = parsed.data;
    const cardSummaries: CardSummary[] = cards.map((c) => ({
      ...c,
      introAprExpiry: c.introAprExpiry ? new Date(c.introAprExpiry) : null,
    }));

    try {
      const plan = createPaymentPlan(cardSummaries, monthlyRevenue, severity as Severity);
      await attachPaymentPlan(caseId, tenant.tenantId, plan);

      res.status(200).json({ success: true, data: plan } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /hardship/:id/payment-plan');
    }
  },
);

// ── POST /api/hardship/:id/settlement ────────────────────────

hardshipRouter.post(
  '/hardship/:id/settlement',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const caseId = req.params['id'] as string;
    const tenant = req.tenant!;

    const parsed = SettlementSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    const { totalBalance, severity } = parsed.data;

    try {
      const offer = calculateSettlementOffer(totalBalance, severity as Severity);
      await attachSettlementOffer(caseId, tenant.tenantId, offer);

      res.status(200).json({ success: true, data: offer } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /hardship/:id/settlement');
    }
  },
);

// ── GET /api/businesses/:id/restack/readiness ────────────────

hardshipRouter.get(
  '/businesses/:id/restack/readiness',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'] as string;
    const tenant     = req.tenant!;

    // Accept readiness input as query params (GET) or fall back to body
    const rawInput = Object.keys(req.query).length > 0 ? req.query : req.body;

    // Coerce numeric query string values
    const coerced = {
      onTimePaymentMonths:         Number(rawInput['onTimePaymentMonths']         ?? 0),
      missedPaymentsSinceHardship: Number(rawInput['missedPaymentsSinceHardship'] ?? 0),
      currentUtilization:          Number(rawInput['currentUtilization']          ?? 0),
      baselineUtilization:         Number(rawInput['baselineUtilization']         ?? 0),
      currentCreditScore:          Number(rawInput['currentCreditScore']          ?? 620),
      baselineCreditScore:         Number(rawInput['baselineCreditScore']         ?? 620),
      monthsSinceLastEvent:        Number(rawInput['monthsSinceLastEvent']        ?? 0),
      activeHardshipCase:          rawInput['activeHardshipCase'] === 'true' || rawInput['activeHardshipCase'] === true,
      advisorId:                   (rawInput['advisorId'] as string | undefined) ?? null,
    };

    const parsed = RestackReadinessSchema.safeParse(coerced);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    const { advisorId, ...restackInput } = parsed.data;

    try {
      const result = await evaluateRestackReadiness(
        businessId,
        tenant.tenantId,
        advisorId ?? null,
        restackInput as RestackReadinessInput,
      );

      res.status(200).json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /businesses/:id/restack/readiness');
    }
  },
);

// ── POST /api/businesses/:id/restack/trigger ─────────────────

hardshipRouter.post(
  '/businesses/:id/restack/trigger',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'] as string;
    const tenant     = req.tenant!;

    const parsed = RestackTriggerSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    const { score, band, advisorId, fundingRoundId, revenueAmount, triggerId } = parsed.data;

    try {
      // Build the outreach trigger
      const outreachTrigger = buildOutreachTrigger(businessId, advisorId ?? null, score, band);

      // If conversion data is provided, record attribution
      let conversion = null;
      if (fundingRoundId && revenueAmount !== undefined && triggerId) {
        conversion = await recordRestackConversion(
          businessId,
          tenant.tenantId,
          triggerId,
          fundingRoundId,
          revenueAmount,
        );
      }

      res.status(201).json({
        success: true,
        data: {
          outreachTrigger,
          conversion,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /businesses/:id/restack/trigger');
    }
  },
);

export default hardshipRouter;
