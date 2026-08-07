// ============================================================
// CapitalForge — Notification Routes
//
//   GET /api/notifications        — what currently needs attention
//   GET /api/notifications/count  — how many
//
// What was here before: a module-level array of ten invented notifications
// — "Apex Ventures promotional APR expires in 12 days", "Sam Delgado flagged
// for missing KYC documentation", "Brightline Corp SBA 7(a) $750K approved
// by underwriting". The global auth gate meant a token was needed, but the
// router had no tenant context of its own, so every authenticated caller of
// every tenant got the same ten. POST /:id/read and /read-all mutated that
// shared array, so one caller marking an item read changed what every other
// caller saw, and a restart undid it.
//
// The bell sat in the header of every page showing "4 unread" against it.
//
// Each item now comes from a row that exists, in the caller's tenant, with
// the record's own timestamp and a link to the page that shows it:
//
//   intro APR expiring        card_applications.introAprExpiry
//   invoice due or overdue    invoices.dueDate where unpaid
//   complaint open            complaints.status
//   regulatory alert new      regulatory_alerts.status
//   consent revoked           consent_records.status
//   deletion outstanding      offboarding_workflows.dataDeletionStatus
//
// There is no read state, and no way to mark one read. Nothing in the schema
// records that a person has seen a notification, and inventing it in memory
// is what the previous version did. So the count is of things outstanding,
// not of things unseen, and it goes down when the underlying record is dealt
// with rather than when somebody dismisses it.
// ============================================================

import { Router, Response } from 'express';
import type { Request } from '../../types/http.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import logger from '../../config/logger.js';

export const notificationsRouter = Router();

export type NotificationType =
  | 'apr_expiry'
  | 'invoice_due'
  | 'complaint'
  | 'regulatory'
  | 'consent'
  | 'offboarding';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

export interface Notification {
  id: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  description: string;
  /** The record's own date. Null when the row carries none. */
  occurredAt: string | null;
  href: string;
}

/** How far ahead an intro APR or an invoice counts as needing attention. */
const HORIZON_DAYS = 45;

/** Per-source cap, so one noisy table cannot crowd out the others. */
const PER_SOURCE = 25;

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

function fail(res: Response, status: number, code: string, message: string) {
  const body: ApiResponse = { success: false, error: { code, message } };
  return res.status(status).json(body);
}

function daysUntil(date: Date, now: Date): number {
  return Math.round((date.getTime() - now.getTime()) / 86_400_000);
}

function money(amount: unknown): string {
  const n = Number(amount);
  return Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
    : 'an unrecorded amount';
}

/**
 * Everything currently outstanding for a tenant.
 *
 * Six queries, each scoped to the tenant and each bounded. Nothing is
 * invented: a notification exists only because a row does.
 */
async function collect(tenantId: string, now: Date): Promise<Notification[]> {
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const db = sharedPrisma;

  const [aprs, invoices, complaints, alerts, consents, offboardings] = await Promise.all([
    db.cardApplication.findMany({
      where: {
        business: { tenantId },
        status: 'approved',
        introAprExpiry: { not: null, lte: horizon },
      },
      select: {
        id: true, issuer: true, cardProduct: true, introAprExpiry: true,
        business: { select: { legalName: true } },
      },
      orderBy: { introAprExpiry: 'asc' },
      take: PER_SOURCE,
    }),
    db.invoice.findMany({
      where: {
        tenantId,
        status: { notIn: ['paid', 'void', 'cancelled'] },
        dueDate: { not: null, lte: horizon },
      },
      select: { id: true, invoiceNumber: true, amount: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
      take: PER_SOURCE,
    }),
    db.complaint.findMany({
      where: { tenantId, status: { in: ['open', 'investigating', 'escalated'] } },
      select: { id: true, category: true, severity: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE,
    }),
    db.regulatoryAlert.findMany({
      where: { tenantId, status: 'new' },
      select: { id: true, title: true, source: true, impactScore: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE,
    }),
    db.consentRecord.findMany({
      where: { tenantId, status: 'revoked' },
      select: { id: true, channel: true, consentType: true, revokedAt: true },
      orderBy: { revokedAt: 'desc' },
      take: PER_SOURCE,
    }),
    db.offboardingWorkflow.findMany({
      where: { tenantId, dataDeletionStatus: { in: ['pending', 'in_progress'] } },
      select: { id: true, offboardingType: true, dataDeletionStatus: true, initiatedAt: true },
      orderBy: { initiatedAt: 'desc' },
      take: PER_SOURCE,
    }),
  ]);

  const items: Notification[] = [];

  for (const a of aprs) {
    const left = daysUntil(a.introAprExpiry as Date, now);
    items.push({
      id: `apr:${a.id}`,
      type: 'apr_expiry',
      // Past its date is worse than approaching it.
      severity: left < 0 ? 'CRITICAL' : left <= 14 ? 'HIGH' : 'MEDIUM',
      title: `Intro APR — ${a.business.legalName}`,
      description:
        `${a.issuer} ${a.cardProduct} intro rate ` +
        (left < 0 ? `ended ${Math.abs(left)} days ago.` : `ends in ${left} days.`),
      occurredAt: (a.introAprExpiry as Date).toISOString(),
      href: '/applications',
    });
  }

  for (const inv of invoices) {
    const left = daysUntil(inv.dueDate as Date, now);
    items.push({
      id: `invoice:${inv.id}`,
      type: 'invoice_due',
      severity: left < 0 ? 'HIGH' : 'MEDIUM',
      title: `Invoice ${inv.invoiceNumber}`,
      description:
        `${money(inv.amount)} ` +
        (left < 0 ? `overdue by ${Math.abs(left)} days.` : `due in ${left} days.`),
      occurredAt: (inv.dueDate as Date).toISOString(),
      href: '/billing',
    });
  }

  for (const c of complaints) {
    items.push({
      id: `complaint:${c.id}`,
      type: 'complaint',
      severity: c.severity === 'critical' ? 'CRITICAL' : c.severity === 'high' ? 'HIGH' : 'MEDIUM',
      title: `Complaint — ${c.category}`,
      description: `${c.status} since it was logged.`,
      occurredAt: c.createdAt.toISOString(),
      href: '/complaints',
    });
  }

  for (const a of alerts) {
    items.push({
      id: `regulatory:${a.id}`,
      type: 'regulatory',
      // An unscored alert is not a moderate one.
      //
      // This read `(a.impactScore ?? 0) >= 70`, so a regulatory alert nobody
      // had assessed was presented as assessed-and-MEDIUM. `impactScore` is
      // nullable; the collapse hid the difference between "we judged this
      // moderate" and "nobody has judged it".
      //
      // Unscored sorts as HIGH rather than MEDIUM: an unreviewed regulatory
      // alert is the one that most needs looking at, and under-stating it is
      // the failure that costs something.
      severity: a.impactScore === null || a.impactScore >= 70 ? 'HIGH' : 'MEDIUM',
      title: a.title,
      description:
        a.impactScore === null
          ? `${a.source} — not yet reviewed, and no impact score is on record.`
          : `${a.source} — not yet reviewed.`,
      occurredAt: a.createdAt.toISOString(),
      href: '/regulatory',
    });
  }

  for (const c of consents) {
    items.push({
      id: `consent:${c.id}`,
      type: 'consent',
      // Contacting someone who revoked consent is the expensive mistake here.
      severity: 'HIGH',
      title: `Consent revoked — ${c.consentType}`,
      description: `${c.channel} consent is no longer held.`,
      occurredAt: c.revokedAt === null ? null : c.revokedAt.toISOString(),
      href: '/consent',
    });
  }

  for (const w of offboardings) {
    items.push({
      id: `offboarding:${w.id}`,
      type: 'offboarding',
      severity: 'MEDIUM',
      title: `Offboarding — deletion ${w.dataDeletionStatus.replace(/_/g, ' ')}`,
      description: `${w.offboardingType} offboarding, data not yet deleted.`,
      occurredAt: w.initiatedAt.toISOString(),
      href: '/offboarding',
    });
  }

  const rank: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 };
  items.sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    // Undated last, rather than sorting as the epoch.
    if (a.occurredAt === null) return b.occurredAt === null ? 0 : 1;
    if (b.occurredAt === null) return -1;
    return b.occurredAt.localeCompare(a.occurredAt);
  });

  return items;
}

// ── GET /api/notifications ───────────────────────────────────

notificationsRouter.get(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      fail(res, 400, 'INVALID_PARAMS', 'Tenant context is required.');
      return;
    }

    try {
      const limit = Math.min(Number(req.query['limit']) || 25, 100);
      const items = await collect(tenantId, new Date());
      ok(res, { notifications: items.slice(0, limit), total: items.length });
    } catch (err) {
      logger.error('[notifications] list failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      fail(res, 500, 'INTERNAL_ERROR', 'Could not read what needs attention.');
    }
  },
);

// ── GET /api/notifications/count ─────────────────────────────

notificationsRouter.get(
  '/count',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      fail(res, 400, 'INVALID_PARAMS', 'Tenant context is required.');
      return;
    }

    try {
      const items = await collect(tenantId, new Date());
      // Outstanding, not unread: nothing records who has seen what.
      ok(res, { outstanding: items.length });
    } catch (err) {
      logger.error('[notifications] count failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      fail(res, 500, 'INTERNAL_ERROR', 'Could not count what needs attention.');
    }
  },
);

export default notificationsRouter;
