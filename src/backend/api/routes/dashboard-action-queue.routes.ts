// ============================================================
// CapitalForge — Dashboard Action Queue Routes
//
// Aggregates priority tasks across multiple compliance and
// application subsystems into a single actionable queue.
//
// Endpoints:
//   GET /api/dashboard/action-queue — aggregated priority tasks
//
// All routes require authentication. The tenantId is sourced from
// the verified JWT (req.tenant).
// ============================================================

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router setup ─────────────────────────────────────────────

export const dashboardActionQueueRouter = Router();

// ── Lazy Prisma ──────────────────────────────────────────────

let prisma: PrismaClient | null = null;
function db(): PrismaClient {
  prisma ??= new PrismaClient();
  return prisma;
}

// ── Types ────────────────────────────────────────────────────

type Priority = 'critical' | 'high' | 'medium';

interface ActionTask {
  id: string;
  priority: Priority;
  type: string;
  client_name: string;
  client_id: string;
  description: string;
  due_date: string | null;
  action_url: string;
  action_label: string;
}

interface ActionQueueResponse {
  total_count: number;
  tasks: ActionTask[];
  last_updated: string;
}

// ── Priority sort weight ─────────────────────────────────────

const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

// ── Route ────────────────────────────────────────────────────

dashboardActionQueueRouter.get('/', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    };
    res.status(401).json(body);
    return;
  }

  const { tenantId } = tenant;

  try {
    const tasks: ActionTask[] = [];

    // ── 1. Pending-consent CardApplications ────────────────
    const pendingConsentApps = await db().cardApplication.findMany({
      where: {
        business: { tenantId },
        status: 'pending_consent',
      },
      include: { business: { select: { id: true, legalName: true } } },
    });

    for (const app of pendingConsentApps) {
      tasks.push({
        id: `ca-consent-${app.id}`,
        priority: 'high',
        type: 'pending_consent',
        client_name: app.business.legalName,
        client_id: app.business.id,
        description: `${app.cardProduct} application awaiting client consent`,
        due_date: app.createdAt.toISOString(),
        action_url: `/applications/${app.id}/consent`,
        action_label: 'Capture Consent',
      });
    }

    // ── 2. Missing ProductAcknowledgments ──────────────────
    // Businesses with active applications but no acknowledgments
    const businessesWithApps = await db().business.findMany({
      where: {
        tenantId,
        cardApplications: { some: { status: { in: ['submitted', 'pending_consent', 'draft'] } } },
      },
      select: {
        id: true,
        legalName: true,
        cardApplications: {
          where: { status: { in: ['submitted', 'pending_consent', 'draft'] } },
          select: { id: true },
        },
      },
    });

    const ackBusinessIds = await db().productAcknowledgment.findMany({
      where: {
        businessId: { in: businessesWithApps.map((b) => b.id) },
      },
      select: { businessId: true },
    });

    const ackSet = new Set(ackBusinessIds.map((a) => a.businessId));

    for (const biz of businessesWithApps) {
      if (!ackSet.has(biz.id)) {
        tasks.push({
          id: `ack-missing-${biz.id}`,
          priority: 'high',
          type: 'missing_acknowledgment',
          client_name: biz.legalName,
          client_id: biz.id,
          description: 'Product acknowledgment required before application can proceed',
          due_date: null,
          action_url: `/clients/${biz.id}/acknowledgments`,
          action_label: 'Send Acknowledgment',
        });
      }
    }

    // ── 3. Expired ConsentRecords ──────────────────────────
    const expiredConsents = await db().consentRecord.findMany({
      where: {
        tenantId,
        status: 'expired',
      },
      include: {
        business: { select: { id: true, legalName: true } },
      },
    });

    for (const consent of expiredConsents) {
      tasks.push({
        id: `consent-expired-${consent.id}`,
        priority: 'critical',
        type: 'expired_consent',
        client_name: consent.business?.legalName ?? 'Unknown Client',
        client_id: consent.businessId ?? '',
        description: `${consent.consentType} consent (${consent.channel}) has expired — renewal required`,
        due_date: consent.grantedAt.toISOString(),
        action_url: `/clients/${consent.businessId}/consent`,
        action_label: 'Renew Consent',
      });
    }

    // ── 4. Unresolved ComplianceChecks ─────────────────────
    const unresolvedChecks = await db().complianceCheck.findMany({
      where: {
        tenantId,
        resolvedAt: null,
        riskLevel: { in: ['high', 'critical'] },
      },
      include: {
        business: { select: { id: true, legalName: true } },
      },
    });

    for (const check of unresolvedChecks) {
      tasks.push({
        id: `compliance-${check.id}`,
        priority: check.riskLevel === 'critical' ? 'critical' : 'high',
        type: 'unresolved_compliance',
        client_name: check.business?.legalName ?? 'Tenant-level',
        client_id: check.businessId ?? '',
        description: `${check.checkType} compliance check flagged ${check.riskLevel} risk — unresolved`,
        due_date: check.createdAt.toISOString(),
        action_url: check.businessId
          ? `/clients/${check.businessId}/compliance/${check.id}`
          : `/compliance/${check.id}`,
        action_label: 'Resolve Finding',
      });
    }

    // ── 5. APR Expiry Triggers ─────────────────────────────
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const aprExpiringApps = await db().cardApplication.findMany({
      where: {
        business: { tenantId },
        introAprExpiry: { lte: thirtyDaysFromNow, gte: new Date() },
        status: { notIn: ['declined', 'closed'] },
      },
      include: { business: { select: { id: true, legalName: true } } },
    });

    for (const app of aprExpiringApps) {
      const daysLeft = Math.ceil(
        (app.introAprExpiry!.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      tasks.push({
        id: `apr-expiry-${app.id}`,
        priority: daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : 'medium',
        type: 'apr_expiry',
        client_name: app.business.legalName,
        client_id: app.business.id,
        description: `Intro APR expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — restack opportunity`,
        due_date: app.introAprExpiry!.toISOString(),
        action_url: `/applications/${app.id}/restack`,
        action_label: 'Review Restack',
      });
    }

    // ── 6. Pending DealCommitteeReview ─────────────────────
    const pendingReviews = await db().dealCommitteeReview.findMany({
      where: {
        tenantId,
        status: { in: ['pending', 'escalated', 'in_review'] },
      },
      include: {
        // DealCommitteeReview has businessId but no explicit relation in schema,
        // so we manually look up the business
      },
    });

    // Batch-fetch business names for deal reviews
    const reviewBusinessIds = pendingReviews.map((r) => r.businessId);
    const reviewBusinesses = await db().business.findMany({
      where: { id: { in: reviewBusinessIds } },
      select: { id: true, legalName: true },
    });
    const bizMap = new Map(reviewBusinesses.map((b) => [b.id, b.legalName]));

    for (const review of pendingReviews) {
      tasks.push({
        id: `deal-review-${review.id}`,
        priority: review.status === 'escalated' ? 'critical' : 'high',
        type: 'pending_deal_review',
        client_name: bizMap.get(review.businessId) ?? 'Unknown',
        client_id: review.businessId,
        description: `Deal committee review (${review.riskTier} risk) — ${review.status}`,
        due_date: review.createdAt.toISOString(),
        action_url: `/deal-reviews/${review.id}`,
        action_label: 'Review Deal',
      });
    }

    // ── Sort: priority desc, due_date asc ──────────────────

    tasks.sort((a, b) => {
      const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (pw !== 0) return pw;
      // Nulls sort last
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    const responseData: ActionQueueResponse = {
      total_count: tasks.length,
      tasks,
      last_updated: new Date().toISOString(),
    };

    const body: ApiResponse<ActionQueueResponse> = {
      success: true,
      data: responseData,
    };

    res.json(body);
  } catch (err) {
    logger.error({ err }, 'Failed to build action queue');
    const body: ApiResponse = {
      success: false,
      error: {
        code: 'ACTION_QUEUE_ERROR',
        message: 'Unable to load action queue. Please try again.',
      },
    };
    res.status(500).json(body);
  }
});
