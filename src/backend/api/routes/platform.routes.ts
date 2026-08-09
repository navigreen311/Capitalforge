

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
import { randomBytes } from 'node:crypto';
import { parseIssuer } from '../../../shared/constants/issuers.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
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


import { createTenantStatusService } from '../../services/tenant-status.service.js';

const tenantStatus = createTenantStatusService(sharedPrisma);

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
  const tenantId = req.params.id!;
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
  const tenantId = req.params.id!;
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

// ── Tenant suspension ────────────────────────────────────────
//
// This answered 200 with `{ status: 'suspended', suspendedAt: <now> }` and
// wrote nothing. An operator suspended a tenant, saw a confirmation with a
// timestamp, and the tenant kept working. It then refused with a 501 while the
// enforcement it needed did not exist.
//
// Both directions are real now, and enforced at login, at token refresh and on
// every authenticated request — see tenant-status.service, which also records
// why the middleware check is cached rather than read per request.
//
// `unsuspend` exists because a one-way access control is its own defect. Its
// absence is what hid the original mock: nobody could try to undo a suspension
// and discover that suspending had done nothing.
router.post('/tenants/:id/suspend', async (req: Request, res: Response) => {
  const tenantId = req.params.id!;
  const parsed = SuspendSchema.safeParse(req.body || {});
  if (!parsed.success) return validationError(res, parsed.error);

  const actor = req.tenant?.userId ?? 'unknown';

  try {
    await tenantStatus.suspend(tenantId, actor, parsed.data.reason ?? null);
  } catch {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Tenant ${tenantId} was not found.` },
    } as ApiResponse);
  }

  const tenant = await sharedPrisma.tenant.findUnique({ where: { id: tenantId } });

  // Read back rather than echoing the request: the response describes the row,
  // which is the thing the old version could not do.
  return ok(res, {
    tenantId,
    status: 'suspended',
    suspendedAt: tenant?.suspendedAt?.toISOString() ?? null,
    suspendedBy: tenant?.suspendedBy ?? null,
    reason: tenant?.suspendedReason ?? null,
  });
});

router.post('/tenants/:id/unsuspend', async (req: Request, res: Response) => {
  const tenantId = req.params.id!;
  const actor = req.tenant?.userId ?? 'unknown';

  try {
    await tenantStatus.unsuspend(tenantId, actor);
  } catch {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Tenant ${tenantId} was not found.` },
    } as ApiResponse);
  }

  const tenant = await sharedPrisma.tenant.findUnique({ where: { id: tenantId } });
  return ok(res, {
    tenantId,
    status: tenant?.isActive === true ? 'active' : 'suspended',
    suspendedAt: tenant?.suspendedAt?.toISOString() ?? null,
  });
});

// ============================================================
// Issuers
// ============================================================

// ── Application counts by issuer ─────────────────────────────
//
// This tenant's own book. Counts only — no rates below MIN_DECIDED_FOR_RATE,
// and no average limit at all until approvedCreditLimit has been captured for
// long enough to mean something.
//
// CardApplication.issuer is free text, not a foreign key, so it is resolved
// through parseIssuer — which returns null rather than guessing, and whose own
// doc records why: "the habit of defaulting is what put a 30-day cooldown on
// issuers nobody had looked up." The resolved registry id joins Issuer.registryId.
//
// Two ways an application can fail to land on an issuer, kept apart because
// they are different facts:
//
//   unmatched      — parseIssuer returned null; the string names nothing the
//                    registry knows.
//   notInDirectory — resolved to a real registry id with no Issuer row. e.g.
//                    an application against Discover, which is a known issuer
//                    nobody has entered.
//
// Collapsing them would hide the second, which is the actionable one. Neither
// is dropped: the response carries counted = placed + unmatched + notInDirectory
// so the page can state the arithmetic rather than leaving a short total to be
// noticed.
router.get('/issuers/application-counts', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [apps, issuers] = await Promise.all([
      sharedPrisma.cardApplication.findMany({
        select: { issuer: true, status: true },
      }),
      sharedPrisma.issuer.findMany({ select: { registryId: true, slug: true } }),
    ]);

    const bySlug = new Map<string, { applications: number; approved: number; declined: number; pending: number }>();
    const registryToSlug = new Map<string, string>();
    for (const i of issuers) {
      if (i.registryId !== null) registryToSlug.set(i.registryId, i.slug);
    }

    const unmatched = new Map<string, number>();
    const notInDirectory = new Map<string, number>();

    for (const app of apps) {
      const identity = parseIssuer(app.issuer);
      if (identity === null) {
        unmatched.set(app.issuer, (unmatched.get(app.issuer) ?? 0) + 1);
        continue;
      }
      const slug = registryToSlug.get(identity.id);
      if (slug === undefined) {
        notInDirectory.set(identity.id, (notInDirectory.get(identity.id) ?? 0) + 1);
        continue;
      }
      const row = bySlug.get(slug) ?? { applications: 0, approved: 0, declined: 0, pending: 0 };
      row.applications += 1;
      if (app.status === 'approved') row.approved += 1;
      else if (app.status === 'declined') row.declined += 1;
      else row.pending += 1;
      bySlug.set(slug, row);
    }

    const placed = [...bySlug.values()].reduce((n, r) => n + r.applications, 0);
    const unmatchedTotal = [...unmatched.values()].reduce((n, c) => n + c, 0);
    const notInDirectoryTotal = [...notInDirectory.values()].reduce((n, c) => n + c, 0);

    return ok(res, {
      /**
       * Below this many DECIDED applications for an issuer, no percentage is
       * shown — not greyed, not asterisked, absent. At n < 20 a single decision
       * moves the rate five points or more, which reads as signal and is not.
       * An advisor reading counts loses nothing; an advisor steered by a rate
       * built on four decisions costs a client an inquiry.
       */
      minDecidedForRate: 20,
      byIssuer: [...bySlug.entries()].map(([slug, r]) => ({ slug, ...r })),
      unmatched: [...unmatched.entries()].map(([issuer, count]) => ({ issuer, count })),
      notInDirectory: [...notInDirectory.entries()].map(([registryId, count]) => ({ registryId, count })),
      totals: {
        counted: apps.length,
        placed,
        unmatched: unmatchedTotal,
        notInDirectory: notInDirectoryTotal,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ── Issuer directory ─────────────────────────────────────────
//
// Reads the issuers and issuer_rules tables. It used to return ISSUERS_DATA,
// a literal of fourteen issuers carrying totalApps, approved, declined,
// pending, approvalRate, avgCreditLimit and an approvalTrend sparkline — 1,942
// applications in total, against seven CardApplication rows in the entire
// database. None of those figures described this tenant, or any tenant.
//
// They are gone rather than recomputed. What is left is reference data about
// the issuers themselves: what each one's rules are, and where each rule came
// from. issuer_rules already records sourceUrl and lastVerified per rule, so a
// rule can state its citation and when it was last checked — which is the
// opposite of what this endpoint was doing.
//
// The /issuers/:id/detail endpoint went with it. Nothing called it, and it
// manufactured declinePatterns by multiplying fixed percentages against the
// invented decline count.
router.get('/issuers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const issuers = await sharedPrisma.issuer.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        rules: {
          where: { isActive: true },
          orderBy: [{ severity: 'asc' }, { name: 'asc' }],
        },
      },
    });

    logger.info('[platform] GET /issuers', { count: issuers.length });

    return ok(res, issuers.map((i) => ({
      id: i.id,
      name: i.name,
      slug: i.slug,
      // 'bank' | 'credit_union' | 'fintech' — the column is free text, so it
      // is passed through rather than narrowed to the two the page used to
      // assume.
      issuerType: i.type,
      logoUrl: i.logoUrl,
      phoneRecon: i.phoneRecon,
      notes: i.notes,
      rules: i.rules.map((r) => ({
        id: r.id,
        ruleType: r.ruleType,
        name: r.name,
        description: r.description,
        value: r.value,
        periodDays: r.periodDays,
        severity: r.severity,
        // The provenance pair. A rule with neither is still shown — it is in
        // the table and an advisor may rely on it — but the page says so
        // rather than leaving the gap to be read as verified.
        sourceUrl: r.sourceUrl,
        sourceNote: r.sourceNote,
        lastVerified: r.lastVerified ? r.lastVerified.toISOString() : null,
      })),
    })));
  } catch (err) {
    return next(err);
  }
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

// Advisor referral links are a `Referral` row now, distinct from
// `ReferralAttribution` — that attributes an existing business to a source
// with a fee; this is the other direction, a link an advisor hands out and
// what came of it.

const ReferralCreateSchema = z.object({
  referredName: z.string().min(1).optional(),
  referredEmail: z.string().email().optional(),
});

const FollowUpSchema = z.object({
  channel: z.string().min(1),
  note: z.string().max(2000).optional(),
});

/**
 * A URL-safe code for the public link.
 *
 * Not derived from the referrer's id or the referred party's email: the code
 * appears in a link that gets forwarded, and a code that decodes to somebody's
 * address discloses it to everyone the link reaches.
 */
function referralCode(): string {
  return randomBytes(9).toString('base64url');
}

router.get('/referrals', tenantMiddleware, async (req: Request, res: Response) => {
  const { tenantId } = req.tenant!;
  const referrals = await sharedPrisma.referral.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: { followUps: { orderBy: { loggedAt: 'desc' } } },
  });

  return ok(res, {
    referrals,
    total: referrals.length,
    tracking: {
      available: true,
      // Conversion is recorded when somebody sets it; nothing watches for a
      // referred party signing up on their own. Said plainly so a zero here
      // reads as "none recorded" rather than "none happened".
      note:
        'Conversions are recorded when an advisor marks one. Nothing detects a referred '
        + 'party becoming a client on its own, so a conversion count is a floor.',
    },
  });
});

router.post('/referrals', tenantMiddleware, async (req: Request, res: Response) => {
  const { tenantId, userId } = req.tenant!;

  const parsed = ReferralCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'A referred email must be a valid address.' },
    } as ApiResponse);
  }

  const referral = await sharedPrisma.referral.create({
    data: {
      tenantId,
      // The signed-in advisor owns the link, not whoever the payload names.
      referrerUserId: userId,
      code: referralCode(),
      referredName: parsed.data.referredName ?? null,
      referredEmail: parsed.data.referredEmail ?? null,
    },
  });

  logger.info('[platform] Referral created', { referralId: referral.id, tenantId });
  return res.status(201).json({ success: true, data: { referral } } as ApiResponse);
});

router.post('/referrals/:id/follow-up', tenantMiddleware, async (req: Request, res: Response) => {
  const { tenantId, userId } = req.tenant!;

  const parsed = FollowUpSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'A follow-up needs a channel.' },
    } as ApiResponse);
  }

  const referral = await sharedPrisma.referral.findFirst({
    where: { id: req.params['id']!, tenantId },
  });
  if (!referral) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'No referral with that id is on record.' },
    } as ApiResponse);
  }

  const followUp = await sharedPrisma.referralFollowUp.create({
    data: {
      referralId: referral.id,
      tenantId,
      channel: parsed.data.channel,
      note: parsed.data.note ?? null,
      // Was the literal string "current_user". A log naming whoever the
      // caller says it names is not a log.
      loggedBy: userId,
    },
  });

  return res.status(201).json({ success: true, data: { followUp } } as ApiResponse);
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
  const integrationId = req.params.id!;
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
  const integrationId = req.params.id!;
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
