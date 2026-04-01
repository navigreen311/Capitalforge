// ============================================================
// CapitalForge Funding Round Detail Routes
//
// Mounted under: /api/funding-rounds/:roundId
//
// GET    /                — funding round detail
// GET    /repayment       — repayment cards & interest shock
// GET    /timeline        — round timeline events
// PATCH  /                — update notes/status
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';

// ── Helpers ───────────────────────────────────────────────────

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function dateOnly(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function ok(res: Response, data: unknown, meta?: Record<string, unknown>): void {
  const body: ApiResponse = { success: true, data, ...(meta ? { meta } : {}) };
  res.status(200).json(body);
}

function err(res: Response, status: number, code: string, message: string): void {
  const body: ApiResponse = { success: false, error: { code, message } };
  res.status(status).json(body);
}

// ── Mock data ────────────────────────────────────────────────

const MOCK_ROUND_DETAIL = {
  id: 'round_mh_001',
  businessId: 'biz_meridian_001',
  businessName: 'Meridian Holdings LLC',
  roundNumber: 2,
  status: 'in_progress',
  targetAmount: 350000,
  obtainedAmount: 287500,
  advisorName: 'Sarah Chen',
  startedAt: daysFromNow(-30),
  targetCloseAt: daysFromNow(60),
  notes: 'Phase 2 stack — targeting Chase + Amex',
  clientReadinessScore: 82,
  cards: [
    { id: 'card_mh_chase_001', product: 'Ink Business Preferred', issuer: 'Chase', limit: 45000, balance: 12400, utilization: 27.6, consentStatus: 'complete' },
    { id: 'card_mh_bofa_001', product: 'Business Advantage Cash', issuer: 'BofA', limit: 35000, balance: 8200, utilization: 23.4, consentStatus: 'complete' },
    { id: 'card_mh_chase_002', product: 'Ink Business Cash', issuer: 'Chase', limit: 25000, balance: 3100, utilization: 12.4, consentStatus: 'complete' },
    { id: 'card_mh_amex_001', product: 'Business Gold Card', issuer: 'American Express', limit: 150000, balance: 18500, utilization: 12.3, consentStatus: 'pending' },
  ],
  economics: {
    totalCreditObtained: 287500,
    estimatedFees: 14375,
    feePercent: 5.0,
    netToClient: 273125,
  },
  previousRounds: [
    { roundNumber: 1, status: 'completed', targetAmount: 200000, obtainedAmount: 195000, cardsApproved: 3, completedAt: daysFromNow(-90) },
  ],
};

const MOCK_REPAYMENT = {
  cards: [
    { name: 'Ink Business Preferred', issuer: 'Chase', next_due: dateOnly(5), amount: 1200, type: 'autopay', status: 'upcoming', balance: 12400, apr_post_promo: 29.99, expiry_date: dateOnly(49), days_remaining: 49 },
    { name: 'Business Advantage Cash', issuer: 'BofA', next_due: dateOnly(8), amount: 800, type: 'manual', status: 'overdue', balance: 8200, apr_post_promo: 26.99, expiry_date: dateOnly(90), days_remaining: 90 },
    { name: 'Ink Business Cash', issuer: 'Chase', next_due: dateOnly(15), amount: 400, type: 'autopay', status: 'upcoming', balance: 3100, apr_post_promo: 24.99, expiry_date: dateOnly(120), days_remaining: 120 },
    { name: 'Business Gold Card', issuer: 'American Express', next_due: dateOnly(12), amount: 1500, type: 'manual', status: 'upcoming', balance: 18500, apr_post_promo: 28.49, expiry_date: dateOnly(65), days_remaining: 65 },
  ],
  interest_shock: {
    total_balance_at_risk: 42200,
    monthly_interest: 1035,
    annual_interest: 12420,
    action_deadline: dateOnly(49),
  },
};

const MOCK_TIMELINE = [
  { id: 'fre_001', date: daysFromNow(-30), type: 'round_created', title: 'Funding round created', detail: 'Round 2 initiated — targeting $350,000 in new credit lines', actor: 'Sarah Chen' },
  { id: 'fre_002', date: daysFromNow(-25), type: 'app_drafted', title: 'Application drafted', detail: 'Ink Business Preferred application prepared for Chase submission', actor: 'Sarah Chen' },
  { id: 'fre_003', date: daysFromNow(-20), type: 'app_submitted', title: 'Application submitted', detail: 'Submitted to Chase via business portal — requested $50,000', actor: 'Sarah Chen' },
  { id: 'fre_004', date: daysFromNow(-10), type: 'app_approved', title: 'Application approved', detail: 'Chase approved Ink Business Preferred for $45,000 credit limit', actor: 'System' },
];

// ── Router ───────────────────────────────────────────────────

export const fundingRoundDetailRouter = Router({ mergeParams: true });

// GET / — funding round detail
fundingRoundDetailRouter.get('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { roundId } = req.params;
  logger.debug('GET funding round detail', { roundId });

  // TODO: replace with Prisma query when model is available
  ok(res, { ...MOCK_ROUND_DETAIL, id: roundId });
});

// GET /repayment — repayment cards & interest shock
fundingRoundDetailRouter.get('/repayment', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { roundId } = req.params;
  logger.debug('GET funding round repayment', { roundId });

  // TODO: replace with Prisma query when model is available
  ok(res, MOCK_REPAYMENT);
});

// GET /timeline — round timeline events
fundingRoundDetailRouter.get('/timeline', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { roundId } = req.params;
  logger.debug('GET funding round timeline', { roundId });

  // TODO: replace with Prisma query when model is available
  ok(res, MOCK_TIMELINE, { total: MOCK_TIMELINE.length });
});

// PATCH / — update notes/status
fundingRoundDetailRouter.patch('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { roundId } = req.params;
  const updates = req.body;

  if (!updates || Object.keys(updates).length === 0) {
    err(res, 400, 'INVALID_BODY', 'Request body must contain fields to update');
    return;
  }

  const allowedFields = ['notes', 'status'];
  const invalidFields = Object.keys(updates).filter((k) => !allowedFields.includes(k));
  if (invalidFields.length > 0) {
    err(res, 400, 'INVALID_FIELDS', `Only notes and status may be updated. Invalid: ${invalidFields.join(', ')}`);
    return;
  }

  logger.debug('PATCH funding round', { roundId, fields: Object.keys(updates) });

  // TODO: replace with Prisma update when model is available
  ok(res, { ...MOCK_ROUND_DETAIL, id: roundId, ...updates, updatedAt: new Date().toISOString() });
});
