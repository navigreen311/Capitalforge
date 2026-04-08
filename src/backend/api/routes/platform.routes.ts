// ============================================================
// CapitalForge — Platform Routes
//
// Consolidates platform-level endpoints:
//
//  CRM Pipeline & Revenue
//   GET  /api/platform/crm/pipeline     — business counts by status
//   GET  /api/platform/crm/revenue      — revenue stats (MRR, ARR, etc.)
//
//  Issuers
//   GET  /api/platform/issuers          — issuer directory data
//
//  Referrals
//   GET  /api/platform/referrals        — referral list
//   POST /api/platform/referrals        — create referral
//
//  Workflows
//   GET  /api/platform/workflows        — list workflows
//   POST /api/platform/workflows        — create workflow
//   PATCH /api/platform/workflows/:id   — toggle active/paused
//
//  Settings
//   GET  /api/platform/settings         — get user/tenant settings
//   PATCH /api/platform/settings        — update settings
//
// All routes require a valid JWT (req.tenant set by auth middleware).
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

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
// Issuers
// ============================================================

const ISSUERS_DATA = [
  {
    id: 'iss_001', name: 'Chase', logo: '🏦',
    velocityRules: '2/30, 5/24 rule; no more than 2 apps per 30 days',
    approvalCriteria: 'Min 700 FICO, 1yr+ business history, $50k+ revenue',
    totalApps: 342, approved: 253, declined: 72, pending: 17,
    approvalRate: 74.0, avgCreditLimit: 28500,
    doNotApply: false, doNotApplyReason: null,
  },
  {
    id: 'iss_002', name: 'Amex', logo: '💳',
    velocityRules: '1/5 rule; one app per 5 days, 2/90 for charge cards',
    approvalCriteria: 'Min 680 FICO, no recent Amex closures, $25k+ revenue',
    totalApps: 298, approved: 212, declined: 68, pending: 18,
    approvalRate: 71.1, avgCreditLimit: 35000,
    doNotApply: false, doNotApplyReason: null,
  },
  {
    id: 'iss_003', name: 'Capital One', logo: '🏛️',
    velocityRules: '1/6mo for business cards; sensitive to recent inquiries',
    approvalCriteria: 'Min 660 FICO, limited recent inquiries, $15k+ revenue',
    totalApps: 264, approved: 180, declined: 72, pending: 12,
    approvalRate: 68.2, avgCreditLimit: 22000,
    doNotApply: false, doNotApplyReason: null,
  },
  {
    id: 'iss_004', name: 'Citi', logo: '🏢',
    velocityRules: '1/8 rule; one Citi app per 8 days, 2/65 for AA cards',
    approvalCriteria: 'Min 700 FICO, 5yr+ credit history, no Citi closures in 24mo',
    totalApps: 218, approved: 131, declined: 74, pending: 13,
    approvalRate: 60.1, avgCreditLimit: 26000,
    doNotApply: false, doNotApplyReason: null,
  },
  {
    id: 'iss_005', name: 'Bank of America', logo: '🏦',
    velocityRules: '2/3/4 rule; 2 cards per 30 days, 3/12, 4/24',
    approvalCriteria: 'Min 700 FICO, existing BofA relationship preferred',
    totalApps: 186, approved: 121, declined: 54, pending: 11,
    approvalRate: 65.1, avgCreditLimit: 24000,
    doNotApply: false, doNotApplyReason: null,
  },
  {
    id: 'iss_006', name: 'US Bank', logo: '🏛️',
    velocityRules: '0/6 rule for business cards; very inquiry-sensitive',
    approvalCriteria: 'Min 720 FICO, 0 new accounts in 6mo, strong existing relationship',
    totalApps: 142, approved: 77, declined: 56, pending: 9,
    approvalRate: 54.2, avgCreditLimit: 20000,
    doNotApply: true, doNotApplyReason: 'Temporarily paused — policy change under review',
  },
  {
    id: 'iss_007', name: 'Wells Fargo', logo: '🏦',
    velocityRules: '1/12 for business cards; prefers existing customers',
    approvalCriteria: 'Min 680 FICO, WF checking account required, $25k+ deposits',
    totalApps: 158, approved: 95, declined: 52, pending: 11,
    approvalRate: 60.1, avgCreditLimit: 18000,
    doNotApply: false, doNotApplyReason: null,
  },
  {
    id: 'iss_008', name: 'Navy Federal Credit Union', logo: '⚓',
    velocityRules: 'No 5/24 equivalent; lenient velocity rules for members',
    approvalCriteria: 'Military/DoD affiliation required; TransUnion pull; min 650 FICO',
    totalApps: 87, approved: 72, declined: 10, pending: 5,
    approvalRate: 82.8, avgCreditLimit: 32000,
    doNotApply: false, doNotApplyReason: null,
  },
  {
    id: 'iss_009', name: 'Alliant Credit Union', logo: '🏦',
    velocityRules: 'No strict velocity rules; open membership via $5 donation',
    approvalCriteria: 'Anyone can join ($5 Foster Care donation); min 660 FICO; $25k+ revenue',
    totalApps: 54, approved: 41, declined: 9, pending: 4,
    approvalRate: 75.9, avgCreditLimit: 25000,
    doNotApply: false, doNotApplyReason: null,
  },
  {
    id: 'iss_010', name: 'PenFed Credit Union', logo: '🛡️',
    velocityRules: 'No velocity rules; open membership via savings account',
    approvalCriteria: 'Open to anyone; Equifax + TransUnion pull; min 670 FICO',
    totalApps: 43, approved: 31, declined: 8, pending: 4,
    approvalRate: 72.1, avgCreditLimit: 22000,
    doNotApply: false, doNotApplyReason: null,
  },
  {
    id: 'iss_011', name: 'First Tech Federal Credit Union', logo: '💻',
    velocityRules: 'No strict velocity rules; less inquiry-sensitive than banks',
    approvalCriteria: 'Tech industry or Computer History Museum member; min 680 FICO',
    totalApps: 38, approved: 28, declined: 7, pending: 3,
    approvalRate: 73.7, avgCreditLimit: 20000,
    doNotApply: false, doNotApplyReason: null,
  },
];

router.get('/issuers', (_req: Request, res: Response) => {
  logger.info('[platform] GET /issuers');
  return ok(res, ISSUERS_DATA);
});

// ============================================================
// Referrals
// ============================================================

interface PlatformReferral {
  id: string;
  advisorId: string;
  advisorName: string;
  referralLink: string;
  source: string;
  referredDate: string;
  status: 'pending' | 'converted' | 'expired' | 'active';
  conversionDate?: string;
  commission: number;
}

let referralIdCounter = 6;
const REFERRALS_DATA: PlatformReferral[] = [
  { id: 'pref_001', advisorId: 'adv_1', advisorName: 'Sarah Chen', referralLink: 'https://app.capitalforge.io/r/sarah-chen', source: 'Email Campaign', referredDate: '2026-03-15', status: 'converted', conversionDate: '2026-03-20', commission: 1500 },
  { id: 'pref_002', advisorId: 'adv_2', advisorName: 'Marcus Williams', referralLink: 'https://app.capitalforge.io/r/marcus-w', source: 'LinkedIn', referredDate: '2026-03-18', status: 'converted', conversionDate: '2026-03-25', commission: 2200 },
  { id: 'pref_003', advisorId: 'adv_1', advisorName: 'Sarah Chen', referralLink: 'https://app.capitalforge.io/r/sarah-chen', source: 'Webinar', referredDate: '2026-03-22', status: 'pending', commission: 0 },
  { id: 'pref_004', advisorId: 'adv_3', advisorName: 'Priya Nair', referralLink: 'https://app.capitalforge.io/r/priya-n', source: 'Partner Referral', referredDate: '2026-03-28', status: 'active', commission: 0 },
  { id: 'pref_005', advisorId: 'adv_4', advisorName: 'James Okafor', referralLink: 'https://app.capitalforge.io/r/james-o', source: 'Direct Link', referredDate: '2026-04-01', status: 'expired', commission: 0 },
];

router.get('/referrals', (_req: Request, res: Response) => {
  logger.info('[platform] GET /referrals');
  const commissionStructure = [
    { tier: 'Standard', rate: '2.0%', minReferrals: 0, maxReferrals: 10 },
    { tier: 'Silver', rate: '2.5%', minReferrals: 11, maxReferrals: 25 },
    { tier: 'Gold', rate: '3.0%', minReferrals: 26, maxReferrals: 50 },
    { tier: 'Platinum', rate: '3.5%', minReferrals: 51, maxReferrals: null },
  ];
  const leaderboard = [
    { advisorName: 'Sarah Chen', totalReferrals: 18, conversions: 14, totalCommission: 8400 },
    { advisorName: 'Marcus Williams', totalReferrals: 15, conversions: 11, totalCommission: 7200 },
    { advisorName: 'Priya Nair', totalReferrals: 12, conversions: 9, totalCommission: 5600 },
    { advisorName: 'James Okafor', totalReferrals: 10, conversions: 7, totalCommission: 4200 },
    { advisorName: 'Derek Simmons', totalReferrals: 8, conversions: 5, totalCommission: 3100 },
  ];
  return ok(res, { referrals: REFERRALS_DATA, commissionStructure, leaderboard });
});

const CreateReferralSchema = z.object({
  advisorId: z.string().min(1),
  advisorName: z.string().min(1),
  source: z.string().min(1),
});

router.post('/referrals', (req: Request, res: Response) => {
  logger.info('[platform] POST /referrals');
  const parsed = CreateReferralSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const { advisorId, advisorName, source } = parsed.data;
  const slug = advisorName.toLowerCase().replace(/\s+/g, '-');
  const newRef: PlatformReferral = {
    id: `pref_${String(++referralIdCounter).padStart(3, '0')}`,
    advisorId,
    advisorName,
    referralLink: `https://app.capitalforge.io/r/${slug}`,
    source,
    referredDate: new Date().toISOString().slice(0, 10),
    status: 'pending',
    commission: 0,
  };
  REFERRALS_DATA.push(newRef);
  return res.status(201).json({ success: true, data: newRef } as ApiResponse<PlatformReferral>);
});

// ============================================================
// Workflows
// ============================================================

interface PlatformWorkflow {
  id: string;
  name: string;
  trigger: string;
  condition: string;
  action: string;
  status: 'active' | 'paused';
  lastTriggered: string | null;
  createdAt: string;
}

let workflowIdCounter = 5;
const WORKFLOWS_DATA: PlatformWorkflow[] = [
  {
    id: 'pwf_001', name: 'APR Expiry Alert',
    trigger: 'APR expires in 30 days', condition: 'Card has promotional APR',
    action: 'Create action queue item', status: 'active',
    lastTriggered: '2026-04-05T09:15:00Z', createdAt: '2025-11-01',
  },
  {
    id: 'pwf_002', name: 'Restack Ready Flag',
    trigger: 'Readiness score recalculated', condition: 'Readiness score > 75',
    action: 'Flag as restack ready', status: 'active',
    lastTriggered: '2026-04-06T14:30:00Z', createdAt: '2025-11-15',
  },
  {
    id: 'pwf_003', name: 'Decline Recovery',
    trigger: 'Application declined', condition: 'Decline reason is not fraud',
    action: 'Generate reconsideration letter draft', status: 'active',
    lastTriggered: '2026-04-04T11:00:00Z', createdAt: '2025-12-01',
  },
  {
    id: 'pwf_004', name: 'Unsigned Acknowledgment Reminder',
    trigger: 'Acknowledgment unsigned for 7 days', condition: 'Business is active',
    action: 'Send reminder email to client', status: 'paused',
    lastTriggered: '2026-03-28T16:45:00Z', createdAt: '2026-01-10',
  },
];

router.get('/workflows', (_req: Request, res: Response) => {
  logger.info('[platform] GET /workflows');
  return ok(res, WORKFLOWS_DATA);
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().min(1),
  condition: z.string().min(1),
  action: z.string().min(1),
});

router.post('/workflows', (req: Request, res: Response) => {
  logger.info('[platform] POST /workflows');
  const parsed = CreateWorkflowSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const newWf: PlatformWorkflow = {
    id: `pwf_${String(++workflowIdCounter).padStart(3, '0')}`,
    ...parsed.data,
    status: 'active',
    lastTriggered: null,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  WORKFLOWS_DATA.push(newWf);
  return res.status(201).json({ success: true, data: newWf } as ApiResponse<PlatformWorkflow>);
});

router.patch('/workflows/:id', (req: Request, res: Response) => {
  logger.info(`[platform] PATCH /workflows/${req.params.id}`);
  const wf = WORKFLOWS_DATA.find(w => w.id === req.params.id);
  if (!wf) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found' }, statusCode: 404 });
  }
  if (req.body.status && (req.body.status === 'active' || req.body.status === 'paused')) {
    wf.status = req.body.status;
  }
  return ok(res, wf);
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
// Export
// ============================================================

export { router as platformRouter };
