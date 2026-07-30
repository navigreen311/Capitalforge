// ============================================================
// CapitalForge Client Detail Routes
//
// Mounted under: /api/clients/:clientId
//
// GET    /                        — client profile
// GET    /owners                  — business owners
// GET    /acknowledgments         — product acknowledgments
// GET    /ach-authorization       — ACH authorization status
// GET    /credit/business         — business credit scores
// GET    /credit/history          — 12-month score history      [STUB]
// GET    /credit/recommendations  — credit optimization tips    [STUB]
// GET    /repayment               — repayment schedule          [STUB]
// GET    /timeline                — client event timeline
// GET    /compliance              — compliance checks
// GET    /documents               — documents for this business
// POST   /compliance/run          — trigger compliance check    [STUB]
// POST   /consent/request         — request re-consent          [STUB]
// PATCH  /                        — update business fields
//
// Endpoints marked [STUB] have no implementation behind them and return
// sample data flagged via `meta.stub` — see ./_stub-response.ts.
// ============================================================

import { Router, type Response, type NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient } from '@prisma/client';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { okStub, registerStub } from './_stub-response.js';

// ── Dependency setup ──────────────────────────────────────────

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────

/**
 * The tenant is taken from the verified access token only.
 *
 * This previously read `tenant.id` — a field TenantContext does not have (it
 * is `tenantId`) — and fell back to the literal string 'unknown'. Every query
 * in this module therefore filtered on tenantId = 'unknown', matched nothing,
 * and fell through to the sample data below. The mock path was not a
 * fallback for rare failures; it was the only path this module ever took.
 */
function getTenantId(req: Request): string {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Tenant context is missing — authentication middleware did not run.');
  }
  return tenantId;
}

function ok(res: Response, data: unknown, meta?: Record<string, unknown>): void {
  const body: ApiResponse = { success: true, data, ...(meta ? { meta } : {}) };
  res.status(200).json(body);
}

function err(res: Response, status: number, code: string, message: string): void {
  const body: ApiResponse = { success: false, error: { code, message } };
  res.status(status).json(body);
}

/** Prisma raises P2025 when an update/delete targets a row that is not there. */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2025';
}

/**
 * Compliance score derived from the checks actually on record.
 *
 * ComplianceCheck carries `riskScore` (higher = worse), so the score is its
 * inverse, averaged. Returns null when no check has a score: "we cannot tell"
 * is a real answer, and is safer here than the hardcoded 78 this endpoint
 * used to report regardless of input, or a 0 that would read as total failure.
 */
function scoreFromChecks(checks: { riskScore: number | null }[]): number | null {
  const scored = checks
    .map((c) => c.riskScore)
    .filter((n): n is number => typeof n === 'number');
  if (scored.length === 0) return null;
  const averageRisk = scored.reduce((sum, n) => sum + n, 0) / scored.length;
  return Math.max(0, Math.min(100, Math.round(100 - averageRisk)));
}

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

// ── Sample payloads for the endpoints that are still stubs ────
// These are reached only through okStub(), which flags them in the response.

registerStub('client.credit.history', 'No Prisma model for historical score snapshots yet.');
registerStub('client.credit.recommendations', 'Requires the credit-optimization pipeline.');
registerStub('client.repayment', 'Requires aggregation across card/payment sources.');
registerStub('client.compliance.run', 'Does not start a compliance run; no job runner wired.');
registerStub('client.consent.request', 'Does not send anything; no email/SMS provider wired.');

const STUB_CREDIT_HISTORY = {
  months: Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (11 - i));
    return { month: d.toISOString().slice(0, 7), experian: 680 + i * 5, equifax: 695 + i * 4, transunion: 670 + i * 6 };
  }),
};

const STUB_RECOMMENDATIONS = [
  { id: 'rec_001', priority: 'high', title: 'Reduce credit utilization below 30%', estimatedPointImpact: { min: 25, max: 40 } },
  { id: 'rec_002', priority: 'high', title: 'Dispute inaccurate late payment on Experian', estimatedPointImpact: { min: 15, max: 20 } },
  { id: 'rec_003', priority: 'medium', title: 'Add authorized user on a seasoned card', estimatedPointImpact: { min: 10, max: 15 } },
];

const STUB_REPAYMENT = {
  nextPayment: { date: dateOnly(3), amount: 8750, cards: 3, autopay: true },
  totalMonthlyObligations: 34200,
  autopayPct: 72,
  cardsAtRisk: 1,
  paymentCalendar: Array.from({ length: 30 }, (_, i) => ({ date: dateOnly(i), amount: i % 3 === 0 ? 0 : 2500, cardCount: i % 3 === 0 ? 0 : 2 })),
  aprExpirySchedule: [
    { issuer: 'Chase', cardLast4: '4821', expiryDate: dateOnly(5), currentApr: 0, postExpiryApr: 24.99, creditLimit: 75000 },
    { issuer: 'American Express', cardLast4: '9173', expiryDate: dateOnly(22), currentApr: 0, postExpiryApr: 21.99, creditLimit: 150000 },
  ],
  payoffWaterfall: [
    { issuer: 'Chase', cardLast4: '4821', balance: 62000, minimumPayment: 1240, suggestedPayment: 5000, priority: 1, reason: 'APR expiry in 5 days' },
    { issuer: 'American Express', cardLast4: '9173', balance: 95000, minimumPayment: 1900, suggestedPayment: 2500, priority: 2, reason: '0% APR for 22 more days' },
  ],
};

const STUB_COMPLIANCE_RUN = {
  complianceScore: 78, maxScore: 100, overallStatus: 'needs_attention',
  checks: [
    { id: 'chk_001', name: 'KYC — All Owners Verified', status: 'warning', detail: '2 of 3 owners verified' },
    { id: 'chk_002', name: 'TCPA Consent Active', status: 'pass', detail: 'Valid consent on file' },
    { id: 'chk_003', name: 'Cash Advance Restriction', status: 'fail', detail: 'Not yet signed' },
  ],
};

// ── Router ────────────────────────────────────────────────────

export const clientDetailRouter = Router({ mergeParams: true });

// GET / — client profile
clientDetailRouter.get('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client profile', { clientId, tenantId });
    const business = await prisma.business.findFirst({ where: { id: clientId, tenantId } });
    if (!business) {
      err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
      return;
    }
    ok(res, business);
  } catch (error) {
    logger.error('Prisma query failed for client profile', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_PROFILE_FAILED', 'Unable to load the client profile.');
  }
});

// GET /owners
clientDetailRouter.get('/owners', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client owners', { clientId, tenantId });
    const owners = await prisma.businessOwner.findMany({ where: { businessId: clientId } });
    // No owners on file is a real answer, and the UI needs to show it as such.
    ok(res, owners, { total: owners.length });
  } catch (error) {
    logger.error('Prisma query failed for owners', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_OWNERS_FAILED', 'Unable to load business owners.');
  }
});

// GET /acknowledgments
clientDetailRouter.get('/acknowledgments', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client acknowledgments', { clientId, tenantId });
    const acks = await prisma.productAcknowledgment.findMany({ where: { businessId: clientId } });
    ok(res, acks, { total: acks.length });
  } catch (error) {
    logger.error('Prisma query failed for acknowledgments', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_ACKNOWLEDGMENTS_FAILED', 'Unable to load acknowledgments.');
  }
});

// GET /ach-authorization
clientDetailRouter.get('/ach-authorization', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET ACH authorization', { clientId, tenantId });
    const ach = await prisma.achAuthorization.findFirst({ where: { businessId: clientId } });
    if (!ach) {
      // Reporting a fabricated "active" authorization for a client who never
      // signed one is a compliance problem, not a cosmetic one.
      err(res, 404, 'ACH_AUTHORIZATION_NOT_FOUND', 'No ACH authorization on file for this client.');
      return;
    }
    ok(res, ach);
  } catch (error) {
    logger.error('Prisma query failed for ACH authorization', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_ACH_FAILED', 'Unable to load the ACH authorization.');
  }
});

// GET /credit/business
clientDetailRouter.get('/credit/business', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET business credit', { clientId, tenantId });
    const profiles = await prisma.creditProfile.findMany({
      where: { businessId: clientId, profileType: 'business' },
    });
    ok(res, { scores: profiles }, { total: profiles.length });
  } catch (error) {
    logger.error('Prisma query failed for business credit', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_CREDIT_FAILED', 'Unable to load business credit.');
  }
});

// GET /credit/history — STUB
clientDetailRouter.get('/credit/history', async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  okStub(res, STUB_CREDIT_HISTORY, 'client.credit.history');
});

// GET /credit/recommendations — STUB
clientDetailRouter.get('/credit/recommendations', async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  okStub(res, STUB_RECOMMENDATIONS, 'client.credit.recommendations', { total: STUB_RECOMMENDATIONS.length });
});

// GET /repayment — STUB
clientDetailRouter.get('/repayment', async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  okStub(res, STUB_REPAYMENT, 'client.repayment');
});

// GET /timeline
clientDetailRouter.get('/timeline', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client timeline', { clientId, tenantId });
    const events = await prisma.ledgerEvent.findMany({
      where: { aggregateId: clientId },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    ok(res, events, { total: events.length });
  } catch (error) {
    logger.error('Prisma query failed for timeline', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_TIMELINE_FAILED', 'Unable to load the client timeline.');
  }
});

// GET /compliance — compliance checks for this business
clientDetailRouter.get('/compliance', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client compliance', { clientId, tenantId });
    const checks = await prisma.complianceCheck.findMany({
      where: { businessId: clientId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, { complianceScore: scoreFromChecks(checks), maxScore: 100, checks }, { total: checks.length });
  } catch (error) {
    logger.error('Prisma query failed for compliance', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_COMPLIANCE_FAILED', 'Unable to load compliance checks.');
  }
});

// GET /compliance/status — alias for compliance status
clientDetailRouter.get('/compliance/status', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client compliance status', { clientId, tenantId });
    const checks = await prisma.complianceCheck.findMany({
      where: { businessId: clientId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, { complianceScore: scoreFromChecks(checks), maxScore: 100, checks });
  } catch (error) {
    logger.error('Prisma query failed for compliance status', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_COMPLIANCE_STATUS_FAILED', 'Unable to load compliance status.');
  }
});

// GET /documents — documents for this business
clientDetailRouter.get('/documents', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client documents', { clientId, tenantId });
    const docs = await prisma.document.findMany({
      where: { businessId: clientId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, docs, { total: docs.length });
  } catch (error) {
    logger.error('Prisma query failed for documents', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_DOCUMENTS_FAILED', 'Unable to load documents.');
  }
});

// POST /compliance/run — STUB (starts nothing)
clientDetailRouter.post('/compliance/run', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);
  logger.info('POST compliance run requested against stub endpoint', { clientId, tenantId });

  okStub(res, {
    ...STUB_COMPLIANCE_RUN,
    runId: `run_${Date.now()}`,
    triggeredAt: new Date().toISOString(),
    status: 'completed',
  }, 'client.compliance.run');
});

// POST /consent/request — STUB (sends nothing)
clientDetailRouter.post('/consent/request', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);
  const { consentType, recipientEmail } = req.body ?? {};
  logger.info('POST consent request against stub endpoint', { clientId, tenantId, consentType });

  // `status: 'sent'` below is sample data — nothing is dispatched. The stub
  // markers are what stop this from reading as a real consent request.
  okStub(res, {
    requestId: `cr_${Date.now()}`,
    clientId,
    consentType: consentType ?? 'general',
    recipientEmail: recipientEmail ?? null,
    status: 'sent',
    sentAt: new Date().toISOString(),
    expiresAt: daysFromNow(7),
  }, 'client.consent.request');
});

// PATCH / — update business fields
clientDetailRouter.patch('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);
  const updates = req.body;

  if (!updates || Object.keys(updates).length === 0) {
    err(res, 400, 'INVALID_BODY', 'Request body must contain fields to update');
    return;
  }

  try {
    logger.debug('PATCH client profile', { clientId, tenantId, fields: Object.keys(updates) });
    const updated = await prisma.business.update({ where: { id: clientId }, data: updates });
    ok(res, updated);
  } catch (error) {
    if (isNotFound(error)) {
      err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
      return;
    }
    // This previously echoed the caller's own edits back as if they had been
    // persisted, so a failed update looked like a successful one.
    logger.error('Prisma update failed for client profile', { clientId, tenantId, error });
    err(res, 500, 'CLIENT_UPDATE_FAILED', 'Unable to update the client.');
  }
});
