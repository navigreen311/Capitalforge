// ============================================================
// CapitalForge — Financial Control Routes
//
// GET    /api/financial/tax-documents          — list tax documents
// POST   /api/financial/simulate               — run funding scenario
// GET    /api/financial/hardship-cases          — list hardship cases
// POST   /api/financial/hardship-cases          — create hardship case
// PATCH  /api/financial/hardship-cases/:id      — update hardship case status
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router } from 'express';
import type { Response } from 'express';
import type { Request } from '../../types/http.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import { openHardshipCase } from '../../services/hardship.service.js';

// ── Router ────────────────────────────────────────────────────────────────────

export const financialRouter = Router({ mergeParams: true });

financialRouter.use(tenantMiddleware);

// ── Types ─────────────────────────────────────────────────────────────────────





interface SimulationInput {
  clientId: string;
  rounds: number;
  targetPerRound: number;
  timingMonths: number;
  avgApr: number;
  introAprMonths: number;
}

interface SimulationResult {
  totalCapital: number;
  costOfCapital: number;
  effectiveApr: number;
  aprExpiryMonth: number;
  creditImpactEstimate: 'minimal' | 'moderate' | 'significant';
  monthlyPayment: number;
  totalInterest: number;
  projectedPayoffMonths: number;
}

// ── Where the data comes from ─────────────────────────────────────────────────
//
// Two arrays lived here. `taxDocuments` held four 1099s for "Acme Holdings
// LLC" with EINs, file sizes and generation timestamps. `hardshipCases` held
// two clients in workout — names, debt balances, missed-payment counts,
// utilisation, assigned advisors — and POST pushed onto it while answering
// 201, so a case "created" through this API existed only in the process that
// served the request, was visible to every tenant, and was gone on restart.
//
// Hardship cases have a table, and a service that writes to it. This router
// kept its own list beside them.

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response): boolean {
  if (!req.tenant) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    };
    res.status(401).json(body);
    return false;
  }
  return true;
}

function simulateScenario(input: SimulationInput): SimulationResult {
  const totalCapital = input.rounds * input.targetPerRound;
  const effectiveApr = input.avgApr * 0.85;
  const totalInterest = totalCapital * (effectiveApr / 100) * (input.timingMonths * input.rounds / 12);
  const costOfCapital = (totalInterest / totalCapital) * 100;
  const monthlyPayment = (totalCapital + totalInterest) / (input.timingMonths * input.rounds);
  const projectedPayoffMonths = Math.ceil((totalCapital + totalInterest) / monthlyPayment);

  let creditImpactEstimate: SimulationResult['creditImpactEstimate'] = 'minimal';
  if (totalCapital > 200_000 || input.rounds > 4) creditImpactEstimate = 'significant';
  else if (totalCapital > 100_000 || input.rounds > 2) creditImpactEstimate = 'moderate';

  return {
    totalCapital,
    costOfCapital: Math.round(costOfCapital * 100) / 100,
    effectiveApr: Math.round(effectiveApr * 100) / 100,
    aprExpiryMonth: input.introAprMonths,
    creditImpactEstimate,
    monthlyPayment: Math.round(monthlyPayment),
    totalInterest: Math.round(totalInterest),
    projectedPayoffMonths,
  };
}

// ── GET /api/financial/tax-documents ──────────────────────────────────────────

financialRouter.get(
  '/tax-documents',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    // Nothing in this system generates a tax document. The four returned
    // here — 1099-INT, 1099-MISC, 1099-K and an annual fee summary, all for
    // "Acme Holdings LLC", each with a size in KB and a generation timestamp
    // — were literals, and a client shown them would believe forms had been
    // prepared and filed.
    const data = {
      documents: [] as unknown[],
      generated: false,
      why:
        'No tax document is produced by this system. There is no generator, no store, and no ' +
        'filing. Figures for a return come from the invoices and fee records, which are ' +
        'elsewhere in the API.',
    };

    logger.info('Tax documents requested', { tenantId: req.tenant?.tenantId });

    const body: ApiResponse<typeof data> = { success: true, data };
    res.status(200).json(body);
  },
);

// ── POST /api/financial/simulate ─────────────────────────────────────────────

financialRouter.post(
  '/simulate',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const input = req.body as SimulationInput;

    // Basic validation
    if (
      !input.clientId ||
      !input.rounds || input.rounds < 1 || input.rounds > 10 ||
      !input.targetPerRound || input.targetPerRound < 1000 ||
      !input.timingMonths || input.timingMonths < 1 ||
      input.avgApr === undefined || input.avgApr < 0
    ) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid simulation parameters. Provide clientId, rounds (1-10), targetPerRound (>= 1000), timingMonths (>= 1), and avgApr (>= 0).',
        },
      };
      res.status(422).json(body);
      return;
    }

    const result = simulateScenario(input);

    logger.info('Simulation executed', {
      tenantId: req.tenant?.tenantId,
      clientId: input.clientId,
      totalCapital: result.totalCapital,
      costOfCapital: result.costOfCapital,
    });

    const body: ApiResponse<{ input: SimulationInput; result: SimulationResult }> = {
      success: true,
      data: { input, result },
    };
    res.status(200).json(body);
  },
);

// ── GET /api/financial/hardship-cases ─────────────────────────────────────────
//
// From hardship_cases, scoped to the tenant. It used to filter an array held
// in the process, whose rows carried a client name, a total debt, a
// missed-payment count, a utilisation percentage and an assigned advisor —
// none of which the table has. Those are not reproduced here; what the
// record holds is what is returned.

financialRouter.get(
  '/hardship-cases',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const tenantId = req.tenant!.tenantId;
    const { status } = req.query as { status?: string };

    const rows = await sharedPrisma.hardshipCase.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const businessIds = [...new Set(rows.map((r) => r.businessId))];
    const businesses = businessIds.length === 0
      ? []
      : await sharedPrisma.business.findMany({
          where: { id: { in: businessIds }, tenantId },
          select: { id: true, legalName: true },
        });
    const nameById = new Map(businesses.map((b) => [b.id, b.legalName]));

    const data = rows.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      businessName: nameById.get(r.businessId) ?? null,
      triggerType: r.triggerType,
      severity: r.severity,
      status: r.status,
      hasPaymentPlan: r.paymentPlan !== null,
      hasSettlementOffer: r.settlementOffer !== null,
      counselorReferral: r.counselorReferral,
      openedAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      resolvedAt: r.resolvedAt === null ? null : r.resolvedAt.toISOString(),
    }));

    logger.info('Hardship cases listed', { tenantId, count: data.length });

    const body: ApiResponse<typeof data> = { success: true, data };
    res.status(200).json(body);
  },
);

// ── POST /api/financial/hardship-cases ────────────────────────────────────────
//
// Opens a real case through the hardship service, which evaluates the
// signals, writes the row and publishes hardship.opened. The previous
// version accepted a client name and a flag, pushed an object onto an array
// and answered 201 with it.

financialRouter.post(
  '/hardship-cases',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const tenantId = req.tenant!.tenantId;
    const {
      businessId, missedPaymentCount, currentUtilization, totalBalance, monthlyRevenue,
    } = req.body as {
      businessId?: string;
      missedPaymentCount?: number;
      currentUtilization?: number;
      totalBalance?: number;
      monthlyRevenue?: number;
    };

    if (typeof businessId !== 'string' || businessId.trim() === '') {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'businessId is required. A hardship case belongs to a client on record — it used ' +
            'to accept a free-text client name, which is why the cases it made could not be ' +
            'joined to anything.',
        },
      };
      res.status(422).json(body);
      return;
    }

    const business = await sharedPrisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Business not found.' },
      };
      res.status(404).json(body);
      return;
    }

    const { caseId, trigger } = await openHardshipCase(businessId, tenantId, {
      missedPaymentCount: missedPaymentCount ?? 0,
      currentUtilization: currentUtilization ?? 0,
      totalBalance: totalBalance ?? 0,
      monthlyRevenue: monthlyRevenue ?? 0,
      cards: [],
    });

    logger.info('Hardship case opened', { tenantId, caseId, businessId });

    const data = { id: caseId, businessId, ...trigger };
    const body: ApiResponse<typeof data> = { success: true, data };
    res.status(201).json(body);
  },
);

// ── PATCH /api/financial/hardship-cases/:id ───────────────────────────────────

financialRouter.patch(
  '/hardship-cases/:id',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const tenantId = req.tenant!.tenantId;
    const caseId = req.params['id'] as string;
    const { status } = req.body as { status?: string };

    const validStatuses = ['open', 'in_negotiation', 'resolved', 'written_off'];
    if (status !== undefined && !validStatuses.includes(status)) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `status must be one of: ${validStatuses.join(', ')}`,
        },
      };
      res.status(422).json(body);
      return;
    }

    // Scoped to the tenant: a case belonging to another one is reported the
    // same way one that does not exist is.
    const existing = await sharedPrisma.hardshipCase.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    if (!existing) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Hardship case ${caseId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    // Only the fields the table has. workoutNotes and assignedAdvisor were
    // accepted here and had nowhere to go.
    if (status === undefined) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Only status can be changed here. Notes and an assigned advisor were accepted ' +
            'before and stored nowhere — the table has no column for either.',
        },
      };
      res.status(422).json(body);
      return;
    }

    const updated = await sharedPrisma.hardshipCase.update({
      where: { id: caseId },
      data: {
        status,
        resolvedAt: status === 'resolved' || status === 'written_off' ? new Date() : null,
      },
    });

    logger.info('Hardship case updated', { tenantId, caseId, status });

    const data = {
      id: updated.id,
      businessId: updated.businessId,
      status: updated.status,
      severity: updated.severity,
      triggerType: updated.triggerType,
      updatedAt: updated.updatedAt.toISOString(),
      resolvedAt: updated.resolvedAt === null ? null : updated.resolvedAt.toISOString(),
    };
    const body: ApiResponse<typeof data> = { success: true, data };
    res.status(200).json(body);
  },
);

