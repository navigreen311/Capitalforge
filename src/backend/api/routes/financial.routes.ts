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
import type { Request, Response } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────────────────────

export const financialRouter = Router({ mergeParams: true });

financialRouter.use(tenantMiddleware);

// ── Types ─────────────────────────────────────────────────────────────────────

type DocType = '1099-INT' | '1099-MISC' | '1099-K' | 'annual_summary' | 'k1_schedule' | 'year_end_fee';
type DocStatus = 'generated' | 'pending' | 'processing' | 'error';

interface TaxDocument {
  id: string;
  docType: DocType;
  label: string;
  description: string;
  taxYear: number;
  businessName: string;
  ein: string;
  status: DocStatus;
  generatedAt?: string;
  fileSize?: string;
}

type HardshipFlag = 'missed_payment' | 'high_utilization' | 'income_change' | 'business_closure';
type ResolutionStatus = 'open' | 'in_negotiation' | 'resolved' | 'written_off';

interface HardshipCase {
  id: string;
  clientId: string;
  clientName: string;
  businessName: string;
  flag: HardshipFlag;
  status: ResolutionStatus;
  totalDebt: number;
  missedPayments: number;
  utilization: number;
  openedAt: string;
  lastUpdated: string;
  assignedAdvisor: string;
  workoutNotes: string;
}

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

// ── Stub data store (in-memory for now) ───────────────────────────────────────

const taxDocuments: TaxDocument[] = [
  {
    id: 'td_001', docType: '1099-INT', label: '1099-INT — Interest Income',
    description: 'Reports interest income earned on business credit lines.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-15T10:30:00Z', fileSize: '48 KB',
  },
  {
    id: 'td_002', docType: '1099-MISC', label: '1099-MISC — Miscellaneous Income',
    description: 'Referral bonuses, signup rewards, and other miscellaneous payments.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-15T10:32:00Z', fileSize: '36 KB',
  },
  {
    id: 'td_003', docType: 'annual_summary', label: 'Annual Fee & Interest Summary',
    description: 'Year-end summary of all fees, interest charges, and deductible business expenses.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-20T14:00:00Z', fileSize: '124 KB',
  },
  {
    id: 'td_004', docType: '1099-K', label: '1099-K — Payment Card Transactions',
    description: 'Reports payment card and third party network transactions.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-18T09:15:00Z', fileSize: '52 KB',
  },
];

const hardshipCases: HardshipCase[] = [
  {
    id: 'hc_001', clientId: 'arc_1', clientName: 'Carlos Mendez',
    businessName: 'Mendez Trucking LLC', flag: 'missed_payment',
    status: 'in_negotiation', totalDebt: 84_500, missedPayments: 3,
    utilization: 92, openedAt: '2026-02-15', lastUpdated: '2026-03-28',
    assignedAdvisor: 'Sarah Mitchell',
    workoutNotes: 'Client experiencing cash flow disruption due to fleet maintenance costs.',
  },
  {
    id: 'hc_002', clientId: 'arc_3', clientName: 'James Thornton',
    businessName: 'Thornton Construction Inc', flag: 'high_utilization',
    status: 'open', totalDebt: 128_700, missedPayments: 4,
    utilization: 95, openedAt: '2026-03-05', lastUpdated: '2026-03-30',
    assignedAdvisor: 'David Park',
    workoutNotes: 'High utilization across 5 cards. Construction project delayed 90 days.',
  },
];

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

    const { year } = req.query as { year?: string };
    const taxYear = year ? Number(year) : undefined;

    let filtered = taxDocuments;
    if (taxYear && !isNaN(taxYear)) {
      filtered = taxDocuments.filter((d) => d.taxYear === taxYear);
    }

    logger.info('Tax documents listed', {
      tenantId: req.tenant?.tenantId,
      year: taxYear,
      count: filtered.length,
    });

    const body: ApiResponse<TaxDocument[]> = { success: true, data: filtered };
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

financialRouter.get(
  '/hardship-cases',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const { status, flag } = req.query as { status?: string; flag?: string };

    let filtered = hardshipCases;
    if (status) {
      filtered = filtered.filter((c) => c.status === status);
    }
    if (flag) {
      filtered = filtered.filter((c) => c.flag === flag);
    }

    logger.info('Hardship cases listed', {
      tenantId: req.tenant?.tenantId,
      count: filtered.length,
    });

    const body: ApiResponse<HardshipCase[]> = { success: true, data: filtered };
    res.status(200).json(body);
  },
);

// ── POST /api/financial/hardship-cases ────────────────────────────────────────

financialRouter.post(
  '/hardship-cases',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const {
      clientId, clientName, businessName, flag, totalDebt,
      missedPayments, utilization, workoutNotes,
    } = req.body as Partial<HardshipCase>;

    if (!clientId || !clientName || !businessName || !flag) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'clientId, clientName, businessName, and flag are required.',
        },
      };
      res.status(422).json(body);
      return;
    }

    const validFlags: HardshipFlag[] = ['missed_payment', 'high_utilization', 'income_change', 'business_closure'];
    if (!validFlags.includes(flag)) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `flag must be one of: ${validFlags.join(', ')}`,
        },
      };
      res.status(422).json(body);
      return;
    }

    const now = new Date().toISOString().split('T')[0];
    const newCase: HardshipCase = {
      id: `hc_${Date.now()}`,
      clientId,
      clientName,
      businessName,
      flag,
      status: 'open',
      totalDebt: totalDebt ?? 0,
      missedPayments: missedPayments ?? 0,
      utilization: utilization ?? 0,
      openedAt: now,
      lastUpdated: now,
      assignedAdvisor: 'Unassigned',
      workoutNotes: workoutNotes ?? '',
    };

    hardshipCases.push(newCase);

    logger.info('Hardship case created', {
      tenantId: req.tenant?.tenantId,
      caseId: newCase.id,
      clientId,
      flag,
    });

    const body: ApiResponse<HardshipCase> = { success: true, data: newCase };
    res.status(201).json(body);
  },
);

// ── PATCH /api/financial/hardship-cases/:id ───────────────────────────────────

financialRouter.patch(
  '/hardship-cases/:id',
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAuth(req, res)) return;

    const caseId = req.params['id'];
    const caseIndex = hardshipCases.findIndex((c) => c.id === caseId);

    if (caseIndex === -1) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Hardship case ${caseId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    const { status, workoutNotes, assignedAdvisor } = req.body as Partial<HardshipCase>;

    if (status) {
      const validStatuses: ResolutionStatus[] = ['open', 'in_negotiation', 'resolved', 'written_off'];
      if (!validStatuses.includes(status)) {
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
      hardshipCases[caseIndex].status = status;
    }

    if (workoutNotes !== undefined) {
      hardshipCases[caseIndex].workoutNotes = workoutNotes;
    }

    if (assignedAdvisor !== undefined) {
      hardshipCases[caseIndex].assignedAdvisor = assignedAdvisor;
    }

    hardshipCases[caseIndex].lastUpdated = new Date().toISOString().split('T')[0];

    logger.info('Hardship case updated', {
      tenantId: req.tenant?.tenantId,
      caseId,
      newStatus: status,
    });

    const body: ApiResponse<HardshipCase> = { success: true, data: hardshipCases[caseIndex] };
    res.status(200).json(body);
  },
);
