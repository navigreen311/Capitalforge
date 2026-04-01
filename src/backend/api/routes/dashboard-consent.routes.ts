// ============================================================
// CapitalForge — Dashboard Consent Routes
//
// Mounts under: /api/v1/dashboard/consent
//
// Routes:
//   GET /  — Consent status summary (missing acknowledgments,
//            expired consents, blocked applications)
//
// Provides the data that powers the ConsentAlertBanner on the
// advisor dashboard.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ──────────────────────────────

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  _prisma ??= new PrismaClient();
  return _prisma;
}

// ── Types ────────────────────────────────────────────────────

interface ConsentIssueItem {
  client_id: string;
  client_name: string;
  issue_type: 'missing_acknowledgment' | 'expired_consent' | 'blocked_application';
  details: string;
}

interface ConsentStatusSummary {
  missing_acknowledgments: number;
  expired_consents: number;
  blocked_applications: number;
  all_clear: boolean;
  items: ConsentIssueItem[];
  last_updated: string;
}

// ── Router ───────────────────────────────────────────────────

export const dashboardConsentRouter = Router();

// GET / — consent status summary
dashboardConsentRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' },
      };
      res.status(401).json(body);
      return;
    }

    const prisma = getPrisma();
    const items: ConsentIssueItem[] = [];

    // 1. Businesses missing ProductAcknowledgment (LEFT JOIN check)
    const businessesMissingAck = await prisma.business.findMany({
      where: {
        tenantId,
        acknowledgments: { none: {} },
        status: { notIn: ['closed', 'offboarding'] },
      },
      select: { id: true, legalName: true },
    });

    const missing_acknowledgments = businessesMissingAck.length;
    for (const biz of businessesMissingAck) {
      items.push({
        client_id: biz.id,
        client_name: biz.legalName,
        issue_type: 'missing_acknowledgment',
        details: 'No product acknowledgment on file',
      });
    }

    // 2. ConsentRecords with status 'revoked' or 'expired'
    const expiredOrRevokedConsents = await prisma.consentRecord.findMany({
      where: {
        tenantId,
        status: { in: ['revoked', 'expired'] },
      },
      select: {
        id: true,
        status: true,
        channel: true,
        business: { select: { id: true, legalName: true } },
      },
    });

    const expired_consents = expiredOrRevokedConsents.length;
    for (const consent of expiredOrRevokedConsents) {
      if (consent.business) {
        items.push({
          client_id: consent.business.id,
          client_name: consent.business.legalName,
          issue_type: 'expired_consent',
          details: `${consent.channel} consent ${consent.status}`,
        });
      }
    }

    // 3. CardApplications with status 'pending_consent'
    const blockedApps = await prisma.cardApplication.findMany({
      where: {
        business: { tenantId },
        status: 'pending_consent',
      },
      select: {
        id: true,
        issuer: true,
        cardProduct: true,
        business: { select: { id: true, legalName: true } },
      },
    });

    const blocked_applications = blockedApps.length;
    for (const app of blockedApps) {
      items.push({
        client_id: app.business.id,
        client_name: app.business.legalName,
        issue_type: 'blocked_application',
        details: `${app.issuer} ${app.cardProduct} awaiting consent`,
      });
    }

    const all_clear =
      missing_acknowledgments === 0 &&
      expired_consents === 0 &&
      blocked_applications === 0;

    const data: ConsentStatusSummary = {
      missing_acknowledgments,
      expired_consents,
      blocked_applications,
      all_clear,
      items,
      last_updated: new Date().toISOString(),
    };

    const body: ApiResponse<ConsentStatusSummary> = { success: true, data };
    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const body: ApiResponse = {
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    };
    res.status(500).json(body);
  }
});
