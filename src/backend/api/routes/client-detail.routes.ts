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
// GET    /credit/history          — 12-month score history
// GET    /credit/recommendations  — credit optimization tips
// GET    /repayment               — repayment schedule
// GET    /timeline                — client event timeline
// POST   /compliance/run          — trigger compliance check
// POST   /consent/request         — request re-consent
// PATCH  /                        — update business fields
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';

// ── Dependency setup ──────────────────────────────────────────

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────

function getTenantId(req: Request): string {
  const tenant = (req as Request & { tenant?: { id: string } }).tenant;
  return tenant?.id ?? 'unknown';
}

function ok(res: Response, data: unknown, meta?: Record<string, unknown>): void {
  const body: ApiResponse = { success: true, data, ...(meta ? { meta } : {}) };
  res.status(200).json(body);
}

function err(res: Response, status: number, code: string, message: string): void {
  const body: ApiResponse = { success: false, error: { code, message } };
  res.status(status).json(body);
}

// ── Mock fallback data (inline, mirrors client-mocks.ts) ──────

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

const MOCK_PROFILE = {
  id: 'biz_meridian_001',
  legalName: 'Meridian Holdings LLC',
  dba: 'Meridian Financial Services',
  ein: '82-1234567',
  entityType: 'LLC',
  stateOfFormation: 'DE',
  annualRevenue: 4800000,
  monthlyRevenue: 400000,
  industry: 'Financial Services',
  naicsCode: '523910',
  mcc: '6012',
  status: 'active',
  advisorName: 'Sarah Chen',
  fundingReadinessScore: 92,
  website: 'https://meridianholdings.example.com',
  employees: 24,
  dateOfFormation: '2019-03-15',
};

const MOCK_OWNERS = [
  { id: 'own_001', firstName: 'James', lastName: 'Harrington', ownershipPercent: 60, title: 'CEO & Managing Member', kycStatus: 'verified', kycVerifiedAt: daysFromNow(-170), personalGuarantee: true },
  { id: 'own_002', firstName: 'Patricia', lastName: 'Chen', ownershipPercent: 30, title: 'COO', kycStatus: 'verified', kycVerifiedAt: daysFromNow(-168), personalGuarantee: true },
  { id: 'own_003', firstName: 'Derek', lastName: 'Olsen', ownershipPercent: 10, title: 'CFO', kycStatus: 'pending', kycVerifiedAt: null, personalGuarantee: false },
];

const MOCK_ACKNOWLEDGMENTS = [
  { id: 'ack_001', type: 'product_reality', status: 'signed', signedAt: daysFromNow(-160), signedBy: 'James Harrington', documentUrl: '/documents/ack_product_reality_001.pdf' },
  { id: 'ack_002', type: 'fee_refund', status: 'signed', signedAt: daysFromNow(-160), signedBy: 'James Harrington', documentUrl: '/documents/ack_fee_refund_001.pdf' },
  { id: 'ack_003', type: 'personal_guarantee', status: 'signed', signedAt: daysFromNow(-155), signedBy: 'Patricia Chen', documentUrl: '/documents/ack_pg_001.pdf' },
  { id: 'ack_004', type: 'cash_advance_restriction', status: 'pending', signedAt: null, signedBy: null, documentUrl: null },
  { id: 'ack_005', type: 'data_sharing', status: 'not_sent', signedAt: null, signedBy: null, documentUrl: null },
];

const MOCK_ACH = {
  status: 'active', authorizedAmount: 25000, frequency: 'monthly', bankLast4: '6789', bankName: 'Chase Business Checking', authorizedAt: daysFromNow(-150), toleranceStatus: 'within_limit',
  debitHistory: Array.from({ length: 6 }, (_, i) => ({ id: `dbt_${String(i + 1).padStart(3, '0')}`, date: dateOnly(-(i * 15 + 5)), amount: 4200 + Math.round(Math.random() * 800), status: i === 0 ? 'pending' : 'completed', returnCode: null })),
};

const MOCK_BIZ_CREDIT = {
  scores: [
    { bureau: 'dnb_paydex', score: 80, maxScore: 100, pullDate: daysFromNow(-14), tradelines: 12, paymentRating: 'Prompt' },
    { bureau: 'experian_business', score: 68, maxScore: 100, pullDate: daysFromNow(-14), tradelines: 9, paymentRating: 'Mostly Prompt' },
    { bureau: 'fico_sbss', score: 210, maxScore: 300, pullDate: daysFromNow(-14), tradelines: 15, paymentRating: 'Satisfactory' },
  ],
};

const MOCK_CREDIT_HISTORY = {
  months: Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (11 - i));
    return { month: d.toISOString().slice(0, 7), experian: 680 + i * 5, equifax: 695 + i * 4, transunion: 670 + i * 6 };
  }),
};

const MOCK_RECOMMENDATIONS = [
  { id: 'rec_001', priority: 'high', title: 'Reduce credit utilization below 30%', estimatedPointImpact: { min: 25, max: 40 } },
  { id: 'rec_002', priority: 'high', title: 'Dispute inaccurate late payment on Experian', estimatedPointImpact: { min: 15, max: 20 } },
  { id: 'rec_003', priority: 'medium', title: 'Add authorized user on a seasoned card', estimatedPointImpact: { min: 10, max: 15 } },
];

const MOCK_REPAYMENT = {
  nextPayment: { date: dateOnly(3), amount: 8750, cards: 3, autopay: true },
  totalMonthlyObligations: 34200,
  autopayPct: 72,
  cardsAtRisk: 1,
  paymentCalendar: Array.from({ length: 30 }, (_, i) => ({ date: dateOnly(i), amount: i % 3 === 0 ? 0 : 2500 + Math.round(Math.random() * 3000), cardCount: i % 3 === 0 ? 0 : 1 + Math.floor(Math.random() * 3) })),
  aprExpirySchedule: [
    { issuer: 'Chase', cardLast4: '4821', expiryDate: dateOnly(5), currentApr: 0, postExpiryApr: 24.99, creditLimit: 75000 },
    { issuer: 'American Express', cardLast4: '9173', expiryDate: dateOnly(22), currentApr: 0, postExpiryApr: 21.99, creditLimit: 150000 },
  ],
  payoffWaterfall: [
    { issuer: 'Chase', cardLast4: '4821', balance: 62000, minimumPayment: 1240, suggestedPayment: 5000, priority: 1, reason: 'APR expiry in 5 days' },
    { issuer: 'American Express', cardLast4: '9173', balance: 95000, minimumPayment: 1900, suggestedPayment: 2500, priority: 2, reason: '0% APR for 22 more days' },
  ],
};

const MOCK_TIMELINE = [
  { id: 'evt_001', type: 'application', title: 'Round 2 Application Submitted', timestamp: daysFromNow(-2), actor: 'Sarah Chen' },
  { id: 'evt_002', type: 'consent', title: 'TCPA Acknowledgment Signed', timestamp: daysFromNow(-3), actor: 'James Harrington' },
  { id: 'evt_003', type: 'payment', title: 'Autopay Processed — Chase ****4821', timestamp: daysFromNow(-5), actor: 'System' },
  { id: 'evt_004', type: 'call', title: 'APR Expiry Outreach Call', timestamp: daysFromNow(-7), actor: 'Sarah Chen' },
  { id: 'evt_005', type: 'document', title: 'Bank Statement Uploaded', timestamp: daysFromNow(-8), actor: 'James Harrington' },
  { id: 'evt_006', type: 'compliance', title: 'NY Disclosure Filed', timestamp: daysFromNow(-10), actor: 'System' },
];

const MOCK_COMPLIANCE = {
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
    const business = await prisma.business.findFirst({
      where: { id: clientId, tenantId },
    });
    if (business) { ok(res, business); return; }
  } catch (error) {
    logger.warn('Prisma query failed for client profile, returning mock', { clientId, error });
  }

  ok(res, { ...MOCK_PROFILE, id: clientId });
});

// GET /owners
clientDetailRouter.get('/owners', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client owners', { clientId, tenantId });
    const owners = await prisma.businessOwner.findMany({
      where: { businessId: clientId },
    });
    if (owners.length > 0) { ok(res, owners, { total: owners.length }); return; }
  } catch (error) {
    logger.warn('Prisma query failed for owners, returning mock', { clientId, error });
  }

  ok(res, MOCK_OWNERS, { total: MOCK_OWNERS.length });
});

// GET /acknowledgments
clientDetailRouter.get('/acknowledgments', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client acknowledgments', { clientId, tenantId });
    const acks = await prisma.productAcknowledgment.findMany({
      where: { businessId: clientId },
    });
    if (acks.length > 0) { ok(res, acks, { total: acks.length }); return; }
  } catch (error) {
    logger.warn('Prisma query failed for acknowledgments, returning mock', { clientId, error });
  }

  ok(res, MOCK_ACKNOWLEDGMENTS, { total: MOCK_ACKNOWLEDGMENTS.length });
});

// GET /ach-authorization
clientDetailRouter.get('/ach-authorization', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET ACH authorization', { clientId, tenantId });
    const ach = await prisma.achAuthorization.findFirst({
      where: { businessId: clientId },
    });
    if (ach) { ok(res, ach); return; }
  } catch (error) {
    logger.warn('Prisma query failed for ACH authorization, returning mock', { clientId, error });
  }

  ok(res, MOCK_ACH);
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
    if (profiles.length > 0) { ok(res, profiles); return; }
  } catch (error) {
    logger.warn('Prisma query failed for business credit, returning mock', { clientId, error });
  }

  ok(res, MOCK_BIZ_CREDIT);
});

// GET /credit/history
clientDetailRouter.get('/credit/history', async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  // No Prisma model for historical score snapshots yet — return mock
  ok(res, MOCK_CREDIT_HISTORY);
});

// GET /credit/recommendations
clientDetailRouter.get('/credit/recommendations', async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  // AI-generated recommendations — mock until ML pipeline is wired
  ok(res, MOCK_RECOMMENDATIONS, { total: MOCK_RECOMMENDATIONS.length });
});

// GET /repayment
clientDetailRouter.get('/repayment', async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  // Aggregated from multiple card/payment sources — mock for now
  ok(res, MOCK_REPAYMENT);
});

// GET /timeline
clientDetailRouter.get('/timeline', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);

  try {
    logger.debug('GET client timeline', { clientId, tenantId });
    const events = await prisma.ledgerEvent.findMany({
      where: { businessId: clientId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (events.length > 0) { ok(res, events, { total: events.length }); return; }
  } catch (error) {
    logger.warn('Prisma query failed for timeline, returning mock', { clientId, error });
  }

  ok(res, MOCK_TIMELINE, { total: MOCK_TIMELINE.length });
});

// POST /compliance/run
clientDetailRouter.post('/compliance/run', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);
  logger.info('POST compliance run triggered', { clientId, tenantId });

  // Mock response — in production this would kick off async compliance checks
  ok(res, {
    ...MOCK_COMPLIANCE,
    runId: `run_${Date.now()}`,
    triggeredAt: new Date().toISOString(),
    status: 'completed',
  });
});

// POST /consent/request
clientDetailRouter.post('/consent/request', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { clientId } = req.params;
  const tenantId = getTenantId(req);
  const { consentType, recipientEmail } = req.body ?? {};
  logger.info('POST consent request', { clientId, tenantId, consentType });

  // Mock response — in production this sends an email/SMS
  ok(res, {
    requestId: `cr_${Date.now()}`,
    clientId,
    consentType: consentType ?? 'general',
    recipientEmail: recipientEmail ?? 'client@example.com',
    status: 'sent',
    sentAt: new Date().toISOString(),
    expiresAt: daysFromNow(7),
  });
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
    const updated = await prisma.business.update({
      where: { id: clientId },
      data: updates,
    });
    ok(res, updated);
    return;
  } catch (error) {
    logger.warn('Prisma update failed for client profile, returning mock', { clientId, error });
  }

  ok(res, { ...MOCK_PROFILE, id: clientId, ...updates, updatedAt: new Date().toISOString() });
});
