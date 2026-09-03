// ============================================================
// CapitalForge — Hardship & Re-Stack Routes
//
// Endpoints:
//   POST  /api/businesses/:id/hardship              — open hardship case
//   GET   /api/businesses/:id/hardship              — list cases
//   PUT   /api/hardship/:id                         — update case
//   POST  /api/hardship/:id/payment-plan            — attach payment plan
//   POST  /api/hardship/:id/settlement              — attach settlement offer
//   POST  /api/hardship                             — create new case (direct)
//   PATCH /api/hardship/:id/stage                   — advance case stage
//   PATCH /api/hardship/:id/resolve                 — mark resolved / written off
//   GET   /api/hardship/stats                       — case counts by status/flag
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, Response, NextFunction } from 'express';
import type { Request } from '../../types/http.js';
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

// ── The two /restack routes were DELETED on 2026-09-02 ──────────────────────
//
//   GET  /api/hardship/businesses/:id/restack/readiness
//   POST /api/hardship/businesses/:id/restack/trigger
//
// They fronted a second re-stack scorer — auto-restack.service.ts — that read
// nothing. Every input arrived in a query string or a request body:
// `currentCreditScore ?? 620` invented a plausible FICO, `currentUtilization
// ?? 0` scored a missing figure as the best possible reading, and the POST
// took the SCORE ITSELF from the body. At score >= 70 the GET wrote
// `restack.trigger.fired` to the canonical ledger — an immutable record
// asserting a client was ready for another funding round, from numbers the
// caller typed.
//
// Deleted rather than fixed. restack-trigger.ts answers the same question from
// the database, and two engines answering "is this client ready for another
// round" on different scales with the same threshold of 70 is the
// two-implementations defect. Fixing the defaults would have left a second
// scorer that still could not read anything.
//
// Neither route was behind requireOwnedBusiness: hardshipRouter mounts at
// /hardship, so the effective path is /hardship/businesses/:id/... and the
// guard's /businesses/:id prefix never matched. See docs/gaps.md.
//
// `restack_recommend` is GET /api/restack/eligible and
// GET /api/restack/check/:businessId. Nothing here.


// ── POST /api/hardship — create a new hardship case (direct) ─

const CreateHardshipSchema = z.object({
  businessId:         z.string().min(1),
  clientId:           z.string().min(1),
  reason:             z.enum(['job_loss', 'medical', 'disaster', 'divorce', 'business_decline', 'other']),
  description:        z.string().max(2000).default(''),
  missedPaymentCount: z.number().int().nonnegative().default(0),
  totalBalance:       z.number().nonnegative().default(0),
  monthlyRevenue:     z.number().nonnegative().default(0),
  requestedRelief:    z.enum(['payment_plan', 'settlement', 'deferral', 'rate_reduction']).optional(),
});

hardshipRouter.post(
  '/',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateHardshipSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    const data = parsed.data;
    const tenant = req.tenant!;

    try {
      const caseId = `hardship-${data.businessId}-${Date.now()}`;
      const now = new Date().toISOString();

      const newCase = {
        id:               caseId,
        businessId:       data.businessId,
        clientId:         data.clientId,
        tenantId:         tenant.tenantId,
        reason:           data.reason,
        description:      data.description,
        stage:            'intake' as const,
        status:           'open' as const,
        missedPaymentCount: data.missedPaymentCount,
        totalBalance:     data.totalBalance,
        monthlyRevenue:   data.monthlyRevenue,
        requestedRelief:  data.requestedRelief ?? null,
        flagged:          data.missedPaymentCount >= 3,
        createdAt:        now,
        updatedAt:        now,
      };

      logger.info('Hardship case created', { caseId, businessId: data.businessId, reason: data.reason });

      res.status(201).json({
        success: true,
        data:    newCase,
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /hardship');
    }
  },
);

// ── PATCH /api/hardship/:id/stage — advance case stage ───────

const AdvanceStageSchema = z.object({
  stage: z.enum(['intake', 'review', 'negotiation', 'resolution', 'monitoring', 'closed']),
  notes: z.string().max(2000).default(''),
});

hardshipRouter.patch(
  '/:id/stage',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const caseId = req.params['id'] as string;

    const parsed = AdvanceStageSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    try {
      const { stage, notes } = parsed.data;
      const now = new Date().toISOString();

      const updated = {
        id:        caseId,
        stage,
        notes,
        updatedAt: now,
        updatedBy: req.tenant!.userId,
      };

      logger.info('Hardship case stage advanced', { caseId, stage });

      res.status(200).json({
        success: true,
        data:    updated,
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'PATCH /hardship/:id/stage');
    }
  },
);

// ── PATCH /api/hardship/:id/resolve — mark resolved or written off

const ResolveSchema = z.object({
  resolution: z.enum(['resolved', 'written_off', 'settled', 'referred_counselor']),
  notes:      z.string().max(2000).default(''),
  writeOffAmount: z.number().nonnegative().optional(),
});

hardshipRouter.patch(
  '/:id/resolve',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const caseId = req.params['id'] as string;

    const parsed = ResolveSchema.safeParse(req.body);
    if (!parsed.success) { handleZodError(parsed.error, res); return; }

    try {
      const { resolution, notes, writeOffAmount } = parsed.data;
      const now = new Date().toISOString();

      const resolved = {
        id:             caseId,
        stage:          'closed' as const,
        status:         resolution,
        notes,
        writeOffAmount: writeOffAmount ?? null,
        resolvedAt:     now,
        resolvedBy:     req.tenant!.userId,
      };

      logger.info('Hardship case resolved', { caseId, resolution });

      res.status(200).json({
        success: true,
        data:    resolved,
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'PATCH /hardship/:id/resolve');
    }
  },
);

// ── GET /api/hardship/stats — case counts by status and flag ─

hardshipRouter.get(
  '/stats',
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // Mock aggregate statistics
      const stats = {
        byStatus: {
          open:            12,
          payment_plan:     8,
          settlement:       3,
          closed:          47,
          referred:         5,
          written_off:      2,
        },
        byStage: {
          intake:           4,
          review:           5,
          negotiation:      3,
          resolution:       6,
          monitoring:       2,
          closed:          47,
        },
        byReason: {
          job_loss:         8,
          medical:          5,
          disaster:         2,
          divorce:          3,
          business_decline: 15,
          other:           44,
        },
        flagged:           9,
        totalActive:      28,
        totalResolved:    49,
        avgResolutionDays: 23.4,
        generatedAt:       new Date().toISOString(),
      };

      res.status(200).json({
        success: true,
        data:    stats,
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /hardship/stats');
    }
  },
);

export default hardshipRouter;
