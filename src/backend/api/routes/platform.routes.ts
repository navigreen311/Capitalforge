

// ============================================================
// CapitalForge — Platform Routes
//
// Consolidates platform-level endpoints:
//
//  CRM Pipeline & Revenue
//   GET  /api/platform/crm/pipeline          — business counts by status
//   GET  /api/platform/crm/revenue           — revenue stats (MRR, ARR, etc.)
//   GET  /api/platform/crm/mrr-trend         — 6 months MRR with new_business & churn
//
//  Billing
//   POST /api/platform/billing/send-overdue-reminders — mock send, return sent_count
//
//  Admin (Tenants)
//   PATCH /api/platform/tenants/:id/feature-flags — update feature flag
//   POST  /api/platform/tenants/:id/impersonate   — mock impersonation token
//   POST  /api/platform/tenants/:id/suspend       — suspend tenant
//
//  Issuers
//   GET  /api/platform/issuers               — issuer directory data
//   GET  /api/platform/issuers/:id/detail    — velocity rules, approval criteria, decline patterns
//
//  Referrals
//   GET  /api/platform/referrals             — referral list
//   POST /api/platform/referrals             — create referral
//   POST /api/platform/referrals/:id/follow-up — log follow-up
//
//  Workflows
//   GET  /api/platform/workflows             — list workflows
//   POST /api/platform/workflows             — create workflow
//   PATCH /api/platform/workflows/:id        — update status
//   PATCH /api/platform/workflows/:id/toggle — toggle active/paused
//   GET  /api/platform/workflows/:id/history — per-workflow execution history
//   GET  /api/platform/workflows/execution-log — global recent executions
//
//  Settings
//   GET  /api/platform/settings              — get user/tenant settings
//   PATCH /api/platform/settings             — update settings
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, Response, NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { z, ZodError } from 'zod';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import {
  CREDIT_UNION_MEMBERSHIP,
  type CreditUnionIssuerId,
  type MembershipCost,
} from '../../../shared/constants/issuers.js';

// Join cost comes from the membership registry, never from a literal here.
//
// This catalogue used to carry its own joinFee per credit union -- $10 for
// Alliant, $17 for PenFed, $15 for First Tech -- none of which matched the
// registry, and all of which reached an advisor through the Issuers page.
function membershipCostFor(slug: CreditUnionIssuerId): MembershipCost {
  return CREDIT_UNION_MEMBERSHIP[slug].cost;
}


const router = Router();

// ── Helpers ──────────────────────────────────────────────────

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

function validationError(res: Response, err: ZodError) {
  const details: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    details[key] = details[key] || [];
    details[key].push(issue.message);
  }
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details },
    statusCode: 400,
  });
}

// ============================================================
// CRM Pipeline
// ============================================================

const PIPELINE_DATA = {
  stages: [
    { key: 'intake',      label: 'Intake',      count: 42, color: '#3B82F6' },
    { key: 'onboarding',  label: 'Onboarding',  count: 38, color: '#F59E0B' },
    { key: 'active',      label: 'Active',       count: 148, color: '#10B981' },
    { key: 'graduated',   label: 'Graduated',    count: 63, color: '#C9A84C' },
  ],
  totalBusinesses: 291,
  conversionRate: 72.4,
};

router.get('/crm/pipeline', (_req: Request, res: Response) => {
  logger.info('[platform] GET /crm/pipeline');
  return ok(res, PIPELINE_DATA);
});

// ============================================================
// CRM Revenue
// ============================================================

const REVENUE_DATA = {
  mrr: 78200,
  arr: 938400,
  revenueByAdvisor: [
    { advisor: 'Sarah Chen',      revenue: 218400, clients: 32 },
    { advisor: 'Marcus Williams', revenue: 196800, clients: 28 },
    { advisor: 'Priya Nair',      revenue: 174600, clients: 25 },
    { advisor: 'James Okafor',    revenue: 152400, clients: 22 },
    { advisor: 'Derek Simmons',   revenue: 130800, clients: 19 },
  ],
  avgClientLifetimeValue: 12400,
  feeCollectionStatus: [
    { period: '2026-Q1', collected: 214600, pending: 18400, overdue: 3200, rate: 90.9 },
    { period: '2025-Q4', collected: 198200, pending: 12800, overdue: 2100, rate: 92.8 },
    { period: '2025-Q3', collected: 186400, pending: 15600, overdue: 4800, rate: 89.9 },
  ],
  cohortAnalysis: [
    { cohort: '2025-Q1', funded: 28, active: 24, graduated: 3, churned: 1, avgRevenue: 11200 },
    { cohort: '2025-Q2', funded: 34, active: 30, graduated: 2, churned: 2, avgRevenue: 12600 },
    { cohort: '2025-Q3', funded: 31, active: 29, graduated: 1, churned: 1, avgRevenue: 13100 },
    { cohort: '2025-Q4', funded: 42, active: 40, graduated: 0, churned: 2, avgRevenue: 12800 },
    { cohort: '2026-Q1', funded: 38, active: 37, graduated: 0, churned: 1, avgRevenue: 13400 },
  ],
};

router.get('/crm/revenue', (_req: Request, res: Response) => {
  logger.info('[platform] GET /crm/revenue');
  return ok(res, REVENUE_DATA);
});

// ============================================================
// CRM MRR Trend
// ============================================================

const MRR_TREND_DATA = [
  { month: '2025-11', mrr: 62400, new_business: 8200, churn: 3100 },
  { month: '2025-12', mrr: 67500, new_business: 9400, churn: 4300 },
  { month: '2026-01', mrr: 71200, new_business: 7800, churn: 4100 },
  { month: '2026-02', mrr: 74800, new_business: 8600, churn: 5000 },
  { month: '2026-03', mrr: 76500, new_business: 6200, churn: 4500 },
  { month: '2026-04', mrr: 78200, new_business: 5400, churn: 3700 },
];

router.get('/crm/mrr-trend', (_req: Request, res: Response) => {
  logger.info('[platform] GET /crm/mrr-trend');
  return ok(res, { months: MRR_TREND_DATA });
});

// ============================================================
// Billing — Send Overdue Reminders
// ============================================================

router.post('/billing/send-overdue-reminders', (_req: Request, res: Response) => {
  logger.info('[platform] POST /billing/send-overdue-reminders — refused, nothing sends them');
  // This answered 200 with "Sent N overdue payment reminders", where N came
  // from Math.random(), and sent nothing. This system can send real SMS and
  // email; a report that a client was chased for payment, when they were not,
  // is a record somebody would act on — or decline to act on.
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        'Overdue reminders are not implemented. Nothing queues or sends them, and this ' +
        'used to answer 200 reporting a random number of reminders as sent.',
    },
  } as ApiResponse);
});

// ============================================================
// Admin — Tenant Feature Flags, Impersonate, Suspend
// ============================================================

const FeatureFlagSchema = z.object({
  flag: z.string().min(1),
  enabled: z.boolean(),
});

router.patch('/tenants/:id/feature-flags', (req: Request, res: Response) => {
  const tenantId = req.params.id;
  logger.info(`[platform] PATCH /tenants/${tenantId}/feature-flags`);
  const parsed = FeatureFlagSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const { flag, enabled } = parsed.data;
  return ok(res, {
    tenantId,
    flag,
    enabled,
    updatedAt: new Date().toISOString(),
  });
});

router.post('/tenants/:id/impersonate', (req: Request, res: Response) => {
  const tenantId = req.params.id;
  logger.info(`[platform] POST /tenants/${tenantId}/impersonate`);
  const impersonation_token = `imp_${tenantId}_${Date.now().toString(36)}`;
  return ok(res, {
    impersonation_token,
    tenantId,
    expiresIn: 3600,
    message: 'Impersonation session started. Token valid for 1 hour.',
  });
});

const SuspendSchema = z.object({
  reason: z.string().min(1).optional(),
});

router.post('/tenants/:id/suspend', (req: Request, res: Response) => {
  const tenantId = req.params.id;
  logger.info(`[platform] POST /tenants/${tenantId}/suspend`);
  const parsed = SuspendSchema.safeParse(req.body || {});
  if (!parsed.success) return validationError(res, parsed.error);
  return ok(res, {
    tenantId,
    status: 'suspended',
    reason: parsed.data.reason ?? 'No reason provided',
    suspendedAt: new Date().toISOString(),
  });
});

// ============================================================
// Issuers
// ============================================================

const ISSUERS_DATA = [
  {
    id: 'iss_001', name: 'Chase', logo: '🏦',
    issuerType: 'bank' as const,
    velocityRules: '2/30, 5/24 rule; no more than 2 apps per 30 days',
    approvalCriteria: 'Min 700 FICO, 1yr+ business history, $50k+ revenue',
    totalApps: 342, approved: 253, declined: 72, pending: 17,
    approvalRate: 74.0, avgCreditLimit: 28500,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: null,
  },
  {
    id: 'iss_002', name: 'Amex', logo: '💳',
    issuerType: 'bank' as const,
    velocityRules: '1/5 rule; one app per 5 days, 2/90 for charge cards',
    approvalCriteria: 'Min 680 FICO, no recent Amex closures, $25k+ revenue',
    totalApps: 298, approved: 212, declined: 68, pending: 18,
    approvalRate: 71.1, avgCreditLimit: 35000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: null,
  },
  {
    id: 'iss_003', name: 'Capital One', logo: '🏛️',
    issuerType: 'bank' as const,
    velocityRules: '1/6mo for business cards; sensitive to recent inquiries',
    approvalCriteria: 'Min 660 FICO, limited recent inquiries, $15k+ revenue',
    totalApps: 264, approved: 180, declined: 72, pending: 12,
    approvalRate: 68.2, avgCreditLimit: 22000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: null,
  },
  {
    id: 'iss_004', name: 'Citi', logo: '🏢',
    issuerType: 'bank' as const,
    velocityRules: '1/8 rule; one Citi app per 8 days, 2/65 for AA cards',
    approvalCriteria: 'Min 700 FICO, 5yr+ credit history, no Citi closures in 24mo',
    totalApps: 218, approved: 131, declined: 74, pending: 13,
    approvalRate: 60.1, avgCreditLimit: 26000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: null,
  },
  {
    id: 'iss_005', name: 'Bank of America', logo: '🏦',
    issuerType: 'bank' as const,
    velocityRules: '2/3/4 rule; 2 cards per 30 days, 3/12, 4/24',
    approvalCriteria: 'Min 700 FICO, existing BofA relationship preferred',
    totalApps: 186, approved: 121, declined: 54, pending: 11,
    approvalRate: 65.1, avgCreditLimit: 24000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: null,
  },
  {
    id: 'iss_006', name: 'US Bank', logo: '🏛️',
    issuerType: 'bank' as const,
    velocityRules: '0/6 rule for business cards; very inquiry-sensitive',
    approvalCriteria: 'Min 720 FICO, 0 new accounts in 6mo, strong existing relationship',
    totalApps: 142, approved: 77, declined: 56, pending: 9,
    approvalRate: 54.2, avgCreditLimit: 20000,
    doNotApply: true, doNotApplyReason: 'Temporarily paused — policy change under review',
    cuMeta: null,
  },
  {
    id: 'iss_007', name: 'Wells Fargo', logo: '🏦',
    issuerType: 'bank' as const,
    velocityRules: '1/12 for business cards; prefers existing customers',
    approvalCriteria: 'Min 680 FICO, WF checking account required, $25k+ deposits',
    totalApps: 158, approved: 95, declined: 52, pending: 11,
    approvalRate: 60.1, avgCreditLimit: 18000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: null,
  },
  {
    id: 'iss_008', name: 'Navy Federal Credit Union', logo: '⚓',
    issuerType: 'credit_union' as const,
    velocityRules: 'No 5/24 equivalent; lenient velocity rules for members',
    approvalCriteria: 'Military/DoD affiliation required; TransUnion pull; min 650 FICO',
    totalApps: 87, approved: 72, declined: 10, pending: 5,
    approvalRate: 82.8, avgCreditLimit: 32000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: {
      membershipRequirement: 'Active duty military, veterans, DoD civilians, and their family members',
      membershipType: 'Restricted' as const,
      membershipCost: membershipCostFor('navy_federal'),
      bureauPull: 'TransUnion',
    },
  },
  {
    id: 'iss_009', name: 'Alliant Credit Union', logo: '🏦',
    issuerType: 'credit_union' as const,
    velocityRules: 'No strict velocity rules; open membership via $10 donation',
    approvalCriteria: 'Anyone can join ($10 Foster Care to Success donation); min 660 FICO; $25k+ revenue',
    totalApps: 54, approved: 41, declined: 9, pending: 4,
    approvalRate: 75.9, avgCreditLimit: 25000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: {
      membershipRequirement: 'Open to anyone via $10 Foster Care to Success donation',
      membershipType: 'Open' as const,
      membershipCost: membershipCostFor('alliant'),
      bureauPull: 'TransUnion',
    },
  },
  {
    id: 'iss_010', name: 'PenFed Credit Union', logo: '🛡️',
    issuerType: 'credit_union' as const,
    velocityRules: 'No velocity rules; open membership via savings account',
    approvalCriteria: 'Open to anyone; Equifax + TransUnion pull; min 670 FICO',
    totalApps: 43, approved: 31, declined: 8, pending: 4,
    approvalRate: 72.1, avgCreditLimit: 22000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: {
      membershipRequirement: 'Open to anyone via $17 Voices for Americas Troops donation',
      membershipType: 'Open' as const,
      membershipCost: membershipCostFor('penfed'),
      bureauPull: 'Equifax + TransUnion',
    },
  },
  {
    id: 'iss_011', name: 'First Tech Federal Credit Union', logo: '💻',
    issuerType: 'credit_union' as const,
    velocityRules: 'No strict velocity rules; less inquiry-sensitive than banks',
    approvalCriteria: 'Tech industry or Computer History Museum member; min 680 FICO',
    totalApps: 38, approved: 28, declined: 7, pending: 3,
    approvalRate: 73.7, avgCreditLimit: 20000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: {
      membershipRequirement: 'Tech industry employees or Computer History Museum / Financial Fitness Association members ($15)',
      membershipType: 'Restricted' as const,
      membershipCost: membershipCostFor('first_tech'),
      bureauPull: 'TransUnion',
    },
  },
  {
    id: 'iss_012', name: 'DCU (Digital Federal Credit Union)', logo: '🔵',
    issuerType: 'credit_union' as const,
    velocityRules: 'Max 1 new DCU card per 6 months; primary savings account required',
    approvalCriteria: 'Open to anyone ($10 Reach Out for Schools donation); min 620 FICO; lowest APR at 13.50%',
    totalApps: 62, approved: 49, declined: 9, pending: 4,
    approvalRate: 79.0, avgCreditLimit: 28000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: {
      membershipRequirement: 'Open to anyone via $10 Reach Out for Schools donation',
      membershipType: 'Open' as const,
      membershipCost: { kind: 'unconfirmed' as const, note: 'Not in the membership registry; join cost not sourced.' },
      bureauPull: 'TransUnion',
    },
  },
  {
    id: 'iss_013', name: 'BECU (Boeing Employees Credit Union)', logo: '✈️',
    issuerType: 'credit_union' as const,
    velocityRules: 'Max 1 new BECU card per 12 months; WA state residency verified',
    approvalCriteria: 'WA state residents, Boeing employees, or BECU family members; min 630 FICO',
    totalApps: 29, approved: 21, declined: 5, pending: 3,
    approvalRate: 72.4, avgCreditLimit: 18000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: {
      membershipRequirement: 'Washington state residents, Boeing employees/retirees, or family members of existing BECU members',
      membershipType: 'Restricted' as const,
      membershipCost: membershipCostFor('becu'),
      bureauPull: 'Equifax',
    },
  },
  {
    id: 'iss_014', name: 'Lake Michigan Credit Union', logo: '🏦',
    issuerType: 'credit_union' as const,
    velocityRules: 'No strict velocity rules; open membership via $5 ALS donation',
    approvalCriteria: 'Open to anyone ($5 ALS donation); min 640 FICO; lowest APR available',
    totalApps: 21, approved: 16, declined: 3, pending: 2,
    approvalRate: 76.2, avgCreditLimit: 12000,
    doNotApply: false, doNotApplyReason: null,
    cuMeta: {
      membershipRequirement: 'Open to anyone via $5 ALS Foundation donation',
      membershipType: 'Open' as const,
      membershipCost: membershipCostFor('lake_michigan_cu'),
      bureauPull: 'Equifax',
    },
  },
];

router.get('/issuers', (_req: Request, res: Response) => {
  logger.info('[platform] GET /issuers');
  return ok(res, ISSUERS_DATA);
});

router.get('/issuers/:id/detail', (req: Request, res: Response) => {
  const issuerId = req.params.id;
  logger.info(`[platform] GET /issuers/${issuerId}/detail`);
  const issuer = ISSUERS_DATA.find(i => i.id === issuerId);
  if (!issuer) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Issuer not found' },
      statusCode: 404,
    });
  }
  const declinePatterns = [
    { reason: 'Too many recent inquiries', percentage: 34.2, count: Math.round(issuer.declined * 0.342) },
    { reason: 'Insufficient credit history', percentage: 22.8, count: Math.round(issuer.declined * 0.228) },
    { reason: 'High utilization ratio', percentage: 18.5, count: Math.round(issuer.declined * 0.185) },
    { reason: 'Too many new accounts', percentage: 14.1, count: Math.round(issuer.declined * 0.141) },
    { reason: 'Other / undisclosed', percentage: 10.4, count: Math.round(issuer.declined * 0.104) },
  ];
  return ok(res, {
    ...issuer,
    velocityRules: issuer.velocityRules,
    approvalCriteria: issuer.approvalCriteria,
    declinePatterns,
  });
});

// ============================================================
// Referrals
// ============================================================


// ── Referrals ────────────────────────────────────────────────
//
// Five advisor referrals lived here — Sarah Chen, Marcus Williams, Priya
// Nair — with referral links under app.capitalforge.io, conversion dates and
// commissions of $1,500 and $2,200. POST pushed a sixth onto the array and
// answered 201 with a link, so an advisor could be shown a referral link
// that resolved to nothing and a commission nobody owed.
//
// referral_attributions exists, but it is a different thing: it attributes a
// business to a source with a fee, and has no advisor link, no commission
// and no conversion. Advisor referral links have no table, so nothing here
// invents one.

router.get('/referrals', (_req: Request, res: Response) => {
  logger.info('[platform] GET /referrals');
  return ok(res, {
    referrals: [],
    total: 0,
    tracking: {
      available: false,
      why:
        'Advisor referral tracking is not implemented. No table holds a referral link, its ' +
        'conversions or a commission, and the five listed here were literals.',
    },
  });
});

router.post('/referrals', (_req: Request, res: Response) => {
  logger.info('[platform] POST /referrals — refused, nothing stores a referral');
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        'Referral creation is not implemented. This answered 201 with a referral link that ' +
        'resolved to nothing, held in memory until the process restarted.',
    },
  } as ApiResponse);
});

// ============================================================
// Referral Follow-Up
// ============================================================


router.post('/referrals/:id/follow-up', (_req: Request, res: Response) => {
  logger.info('[platform] POST /referrals/:id/follow-up — refused, nothing stores a follow-up');
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        'Logging a follow-up is not implemented. It used to answer 201 with a generated id and ' +
        'loggedBy "current_user", against a referral that only existed in memory.',
    },
  } as ApiResponse);
});

// ============================================================
// Workflows
// ============================================================


// ── Workflows ────────────────────────────────────────────────
//
// Four workflows lived in an array here and POST pushed a fifth onto it, so
// a rule "created" through this API ran nothing, was visible to every tenant
// and was gone on restart. Toggling one flipped a field in that array and
// answered 200.
//
// workflow_rules is the table for this: name, conditions, actions, priority,
// isActive, triggerEvent, per tenant. These endpoints use it.
//
// Two things the table does not hold, and which are therefore not reported:
// when a rule last fired, and any execution history. Nothing in this system
// executes a workflow rule, so there is nothing to record.

interface WorkflowShape {
  id: string;
  name: string;
  trigger: string | null;
  condition: string;
  action: string;
  status: 'active' | 'paused';
  priority: number;
  createdAt: string;
  updatedAt: string;
}

function toWorkflowShape(row: {
  id: string;
  name: string;
  triggerEvent: string | null;
  conditions: unknown;
  actions: unknown;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): WorkflowShape {
  const conditions = (row.conditions ?? {}) as { expression?: unknown };
  const actions = (row.actions ?? {}) as { description?: unknown };
  return {
    id: row.id,
    name: row.name,
    trigger: row.triggerEvent,
    condition: typeof conditions.expression === 'string' ? conditions.expression : '',
    action: typeof actions.description === 'string' ? actions.description : '',
    status: row.isActive ? 'active' : 'paused',
    priority: row.priority,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get('/workflows', async (req: Request, res: Response) => {
  logger.info('[platform] GET /workflows');
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' },
    } as ApiResponse);
  }

  const rows = await sharedPrisma.workflowRule.findMany({
    where: { tenantId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });

  return ok(res, {
    workflows: rows.map(toWorkflowShape),
    total: rows.length,
    execution: {
      runs: false,
      why: 'Nothing executes these rules yet, so none of them has ever fired.',
    },
  });
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().min(1),
  condition: z.string().min(1),
  action: z.string().min(1),
  priority: z.number().int().min(0).max(100).optional(),
});

router.post('/workflows', async (req: Request, res: Response) => {
  logger.info('[platform] POST /workflows');
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' },
    } as ApiResponse);
  }

  const parsed = CreateWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { name, trigger, condition, action, priority } = parsed.data;
  const row = await sharedPrisma.workflowRule.create({
    data: {
      tenantId,
      name,
      triggerEvent: trigger,
      conditions: { expression: condition },
      actions: { description: action },
      priority: priority ?? 0,
      isActive: true,
    },
  });

  // Saved, and it will not run — the row is a rule nothing executes yet.
  return res.status(201).json({
    success: true,
    data: { ...toWorkflowShape(row), willRun: false },
  } as ApiResponse<WorkflowShape & { willRun: boolean }>);
});

async function setWorkflowActive(
  req: Request,
  res: Response,
  next: (current: boolean) => boolean,
) {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' },
    } as ApiResponse);
  }

  const id = req.params.id as string;
  // Scoped: another tenant's rule is reported as one that does not exist.
  const existing = await sharedPrisma.workflowRule.findFirst({
    where: { id, tenantId },
  });
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Workflow not found' },
      statusCode: 404,
    });
  }

  const updated = await sharedPrisma.workflowRule.update({
    where: { id },
    data: { isActive: next(existing.isActive) },
  });

  return ok(res, {
    ...toWorkflowShape(updated),
    previousStatus: existing.isActive ? 'active' : 'paused',
  });
}

router.patch('/workflows/:id', async (req: Request, res: Response) => {
  logger.info(`[platform] PATCH /workflows/${req.params.id}`);
  const requested = (req.body as { status?: string }).status;
  if (requested !== 'active' && requested !== 'paused') {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'status must be "active" or "paused".' },
    } as ApiResponse);
  }
  return setWorkflowActive(req, res, () => requested === 'active');
});

router.patch('/workflows/:id/toggle', async (req: Request, res: Response) => {
  logger.info(`[platform] PATCH /workflows/${req.params.id}/toggle`);
  return setWorkflowActive(req, res, (current) => !current);
});

// ── Workflow execution history ───────────────────────────────
//
// Five executions per workflow were generated here from the id — timestamps
// in April 2026, durations in milliseconds, "Action completed" and one
// "Target entity not found" for realism. No workflow has ever run.

router.get('/workflows/:id/history', async (req: Request, res: Response) => {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' },
    } as ApiResponse);
  }

  const id = req.params.id as string;
  const wf = await sharedPrisma.workflowRule.findFirst({ where: { id, tenantId } });
  if (!wf) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Workflow not found' },
      statusCode: 404,
    });
  }

  return ok(res, {
    workflowId: id,
    workflowName: wf.name,
    executions: [],
    execution: {
      runs: false,
      why:
        'Nothing executes workflow rules, and no table records an execution. The five runs ' +
        'listed here were generated from the workflow id on each request.',
    },
  });
});

// ── Workflow Execution Log (global recent executions) ────────

router.get('/workflows/execution-log', (_req: Request, res: Response) => {
  logger.info('[platform] GET /workflows/execution-log');
  const recentExecutions = [
    { id: 'exec_global_001', workflowId: 'pwf_001', workflowName: 'APR Expiry Alert', triggeredAt: '2026-04-06T14:30:00Z', status: 'success' as const, durationMs: 245 },
    { id: 'exec_global_002', workflowId: 'pwf_002', workflowName: 'Restack Ready Flag', triggeredAt: '2026-04-06T12:00:00Z', status: 'success' as const, durationMs: 312 },
    { id: 'exec_global_003', workflowId: 'pwf_003', workflowName: 'Decline Recovery', triggeredAt: '2026-04-05T09:15:00Z', status: 'failure' as const, durationMs: 1024 },
    { id: 'exec_global_004', workflowId: 'pwf_001', workflowName: 'APR Expiry Alert', triggeredAt: '2026-04-05T08:00:00Z', status: 'success' as const, durationMs: 189 },
    { id: 'exec_global_005', workflowId: 'pwf_004', workflowName: 'Unsigned Acknowledgment Reminder', triggeredAt: '2026-04-04T16:45:00Z', status: 'skipped' as const, durationMs: 12 },
    { id: 'exec_global_006', workflowId: 'pwf_002', workflowName: 'Restack Ready Flag', triggeredAt: '2026-04-04T11:00:00Z', status: 'success' as const, durationMs: 278 },
  ];
  return ok(res, { recentExecutions });
});

// ============================================================
// Settings
// ============================================================

const SETTINGS_DATA = {
  profile: {
    name: 'Jonathan Wright',
    email: 'jonathan@capitalforge.io',
    phone: '+1 (555) 234-5678',
    timezone: 'America/New_York',
  },
  firm: {
    name: 'CapitalForge Advisory Group',
    logoUrl: null,
    address: '123 Finance District, Suite 400, New York, NY 10005',
  },
  notifications: {
    newApplication: true,
    applicationApproved: true,
    applicationDeclined: true,
    paymentReceived: true,
    aprExpiry: true,
    complianceAlert: true,
    weeklyDigest: false,
    marketingUpdates: false,
  },
  team: [
    { id: 'u_001', name: 'Jonathan Wright', email: 'jonathan@capitalforge.io', role: 'admin' },
    { id: 'u_002', name: 'Sarah Chen', email: 'sarah@capitalforge.io', role: 'advisor' },
    { id: 'u_003', name: 'Marcus Williams', email: 'marcus@capitalforge.io', role: 'advisor' },
    { id: 'u_004', name: 'Priya Nair', email: 'priya@capitalforge.io', role: 'advisor' },
    { id: 'u_005', name: 'James Okafor', email: 'james@capitalforge.io', role: 'compliance_officer' },
  ],
  security: {
    twoFactorEnabled: false,
    lastPasswordChange: '2026-02-15',
  },
  api: {
    key: 'cf_live_****************************3x7k',
    createdAt: '2025-10-01',
    lastUsed: '2026-04-06',
  },
};

router.get('/settings', (_req: Request, res: Response) => {
  logger.info('[platform] GET /settings');
  return ok(res, SETTINGS_DATA);
});

const UpdateSettingsSchema = z.object({
  profile: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
  firm: z.object({
    name: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
  notifications: z.record(z.boolean()).optional(),
  security: z.object({
    twoFactorEnabled: z.boolean().optional(),
  }).optional(),
}).partial();

router.patch('/settings', (req: Request, res: Response) => {
  logger.info('[platform] PATCH /settings');
  const parsed = UpdateSettingsSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const updates = parsed.data;
  if (updates.profile) Object.assign(SETTINGS_DATA.profile, updates.profile);
  if (updates.firm) Object.assign(SETTINGS_DATA.firm, updates.firm);
  if (updates.notifications) Object.assign(SETTINGS_DATA.notifications, updates.notifications);
  if (updates.security) Object.assign(SETTINGS_DATA.security, updates.security);

  return ok(res, SETTINGS_DATA);
});

// ============================================================
// Settings — Profile & Firm (granular PATCH)
// ============================================================

const ProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
});

router.patch('/settings/profile', (req: Request, res: Response) => {
  logger.info('[platform] PATCH /settings/profile');
  const parsed = ProfileSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  Object.assign(SETTINGS_DATA.profile, parsed.data);
  return ok(res, { profile: SETTINGS_DATA.profile, updatedAt: new Date().toISOString() });
});

const FirmSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  logoUrl: z.string().url().nullable().optional(),
});

router.patch('/settings/firm', (req: Request, res: Response) => {
  logger.info('[platform] PATCH /settings/firm');
  const parsed = FirmSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  Object.assign(SETTINGS_DATA.firm, parsed.data);
  return ok(res, { firm: SETTINGS_DATA.firm, updatedAt: new Date().toISOString() });
});

// ============================================================
// Integrations — Connect & Test
// ============================================================

// Refused, because nothing connects and nothing records that it did.
//
// POST /integrations/:id/connect answered 200 with "Integration <id>
// connected successfully" after writing { id, status: 'connected',
// connectedAt } into INTEGRATIONS_STORE, a module-level object. No
// credentials were exchanged, no OAuth flow ran, nothing was contacted — the
// endpoint took any id at all and reported it connected. The record was gone
// at the next restart and invisible to every other worker meanwhile, so a
// second worker would tell the same operator the integration was not
// connected.
//
// There is no integration table anywhere in this schema. The separate
// integration layer under /api/integrations keeps its connections in a Map
// too, so nothing in this system persists one.
//
// Telling somebody an integration is live is the claim they act on before
// wondering why no data is flowing.

router.post('/integrations/:id/connect', (req: Request, res: Response) => {
  const integrationId = req.params.id;
  logger.info(`[platform] POST /integrations/${integrationId}/connect — refused, nothing connects`);

  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        `Connecting ${integrationId} is not implemented. No credentials are exchanged and no ` +
        'provider is contacted, and nothing in this schema records an integration connection. ' +
        'This used to answer 200 reporting the integration connected, from a value held in ' +
        'process memory until the next restart.',
    },
  } as ApiResponse);
});

router.post('/integrations/:id/test', (req: Request, res: Response) => {
  const integrationId = req.params.id;
  logger.info(`[platform] POST /integrations/${integrationId}/test — refused, nothing is contacted`);

  // This reported healthy: true with a latency between 20ms and 170ms from
  // Math.random(), having contacted nothing. An integration health check that
  // always passes is worse than none: it is the check somebody relies on to
  // tell them a connection has broken.
  //
  // It also required the connect endpoint above to have been called first, so
  // it read a memory flag and called that a connection test.
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        `Connection testing is not implemented for ${integrationId}. Nothing contacts the ` +
        'integration, and this used to answer 200 reporting it healthy with an invented latency.',
    },
  } as ApiResponse);
});

// ============================================================
// Export
// ============================================================

export { router as platformRouter };
