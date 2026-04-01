// ============================================================
// CapitalForge Application Detail Routes
//
// Mounted under: /api/applications/:appId
//
// GET    /                — application detail
// GET    /timeline        — application timeline events
// POST   /submit          — submit application to issuer
// PATCH  /                — update application fields
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

// ── Mock data ─────────────────────────────────────────────────

const MOCK_APPLICATION = {
  id: 'APP-0091',
  client_id: 'biz_meridian_001',
  client_name: 'Meridian Holdings LLC',
  card_product: 'Ink Business Preferred',
  issuer: 'Chase',
  round_number: 2,
  round_id: 'round_mh_001',
  requested: 50000,
  approved: 45000,
  status: 'approved',
  apr_days_remaining: 365,
  consent_status: 'complete',
  missing_consent: null,
  acknowledgment_status: 'signed',
  submitted_date: dateOnly(-10),
  approved_date: dateOnly(-3),
  declined_date: null,
  advisor: 'Sarah Chen',
  days_in_stage: 0,
  business_purpose: 'Working capital expansion',
  decline_reason: null,
  documents: [
    { id: 'doc_001', name: 'Chase Approval Letter', type: 'approval_letter', uploaded_at: daysFromNow(-3), uploaded_by: 'System', url: '/documents/app_0091_approval.pdf' },
    { id: 'doc_002', name: 'Business Financial Statement', type: 'financial_statement', uploaded_at: daysFromNow(-12), uploaded_by: 'James Harrington', url: '/documents/app_0091_financials.pdf' },
  ],
  compliance: {
    score: 95,
    status: 'pass',
    checks: [
      { name: 'TCPA Consent', status: 'pass', detail: 'Valid consent on file' },
      { name: 'E-Sign Agreement', status: 'pass', detail: 'Signed by all owners' },
      { name: 'Product Reality Acknowledgment', status: 'pass', detail: 'Signed and witnessed' },
      { name: 'State Disclosure', status: 'pass', detail: 'NY disclosure filed' },
    ],
  },
};

const MOCK_TIMELINE = [
  { id: 'evt_001', type: 'status_change', title: 'Application approved', timestamp: daysFromNow(-3), actor: 'System', detail: 'Approved for $45,000 credit limit' },
  { id: 'evt_002', type: 'review', title: 'Underwriting review completed', timestamp: daysFromNow(-5), actor: 'Marcus Reid', detail: 'Risk assessment passed — tier 1 approval' },
  { id: 'evt_003', type: 'submission', title: 'Application submitted to issuer', timestamp: daysFromNow(-10), actor: 'Sarah Chen', detail: 'Submitted via Chase business portal' },
  { id: 'evt_004', type: 'consent', title: 'All consents verified', timestamp: daysFromNow(-11), actor: 'System', detail: 'TCPA, E-Sign, and Product Reality acknowledgments confirmed' },
  { id: 'evt_005', type: 'creation', title: 'Application created', timestamp: daysFromNow(-14), actor: 'Sarah Chen', detail: 'Draft created for Round 2 — Ink Business Preferred' },
];

// ── Router ────────────────────────────────────────────────────

export const applicationDetailRouter = Router({ mergeParams: true });

// GET / — application detail
applicationDetailRouter.get('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { appId } = req.params;
  logger.debug('GET application detail', { appId });

  // TODO: replace with Prisma query when model is available
  ok(res, { ...MOCK_APPLICATION, id: appId });
});

// GET /timeline — application timeline events
applicationDetailRouter.get('/timeline', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { appId } = req.params;
  logger.debug('GET application timeline', { appId });

  // TODO: replace with Prisma query when model is available
  ok(res, MOCK_TIMELINE, { total: MOCK_TIMELINE.length });
});

// POST /submit — submit application to issuer
applicationDetailRouter.post('/submit', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { appId } = req.params;
  logger.info('POST submit application', { appId });

  // TODO: implement actual submission logic
  ok(res, {
    id: appId,
    status: 'submitted',
    submitted_date: new Date().toISOString(),
    submitted_by: 'current_user',
    message: 'Application submitted successfully',
  });
});

// PATCH / — update application fields
applicationDetailRouter.patch('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { appId } = req.params;
  const updates = req.body;

  if (!updates || Object.keys(updates).length === 0) {
    err(res, 400, 'INVALID_BODY', 'Request body must contain fields to update');
    return;
  }

  logger.debug('PATCH application', { appId, fields: Object.keys(updates) });

  // TODO: replace with Prisma update when model is available
  ok(res, { ...MOCK_APPLICATION, id: appId, ...updates, updatedAt: new Date().toISOString() });
});
