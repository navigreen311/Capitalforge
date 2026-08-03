// ============================================================
// GET /api/v1/dashboard/recent-applications
//
// The dashboard's Recent Applications widget called this endpoint and it did
// not exist. Not a regression — there was no router file and no entry in the
// dashboard's SUB_ROUTES list, so it had been answering 404 for as long as the
// widget had been asking. The landing page rendered "Something went wrong" in
// that panel on every visit.
//
// The whole browser suite passed throughout. Nothing asserted on this widget,
// and a component that catches its own fetch error and renders an error state
// is invisible to tests that only assert what a page does show. It was found
// by opening the page and reading it.
//
// Applications are real rows, so this reads them.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import logger from '../../config/logger.js';

export const dashboardRecentApplicationsRouter = Router();

/** How many the widget shows before its own filters narrow them. */
const RECENT_LIMIT = 25;

/** The widget's badge vocabulary. Anything unmapped stays as recorded. */
function badgeStatus(status: string): string {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'declined':
      return 'declined';
    case 'submitted':
      return 'pending';
    case 'draft':
      return 'draft';
    default:
      return status;
  }
}

const money = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
};

dashboardRecentApplicationsRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Tenant context is required.' },
      };
      res.status(401).json(body);
      return;
    }

    try {
      const rows = await sharedPrisma.cardApplication.findMany({
        where: { business: { tenantId } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
        select: {
          id: true,
          status: true,
          issuer: true,
          cardProduct: true,
          creditLimit: true,
          submittedAt: true,
          createdAt: true,
          fundingRoundId: true,
          business: { select: { id: true, legalName: true } },
          fundingRound: { select: { id: true, roundNumber: true } },
        },
      });

      // Consent is per business, and the widget shows it per application.
      const businessIds = [...new Set(rows.map((r) => r.business.id))];
      const consents = businessIds.length
        ? await sharedPrisma.consentRecord.findMany({
            where: { businessId: { in: businessIds }, revokedAt: null },
            select: { businessId: true, consentType: true },
          })
        : [];

      const consentsByBusiness = new Map<string, Set<string>>();
      for (const c of consents) {
        // businessId is nullable: a consent record can exist without a client
        // matched to it, and those cannot be attributed to an application.
        if (c.businessId === null) continue;
        const set = consentsByBusiness.get(c.businessId) ?? new Set<string>();
        set.add(c.consentType);
        consentsByBusiness.set(c.businessId, set);
      }

      const applications = rows.map((row) => {
        const held = consentsByBusiness.get(row.business.id) ?? new Set<string>();

        // Three states, and "none on record" is not "refused". A client who
        // has given nothing and a client who has given some are different
        // situations, and neither is a client who has declined.
        const consent =
          held.size === 0 ? 'missing' : held.size >= 2 ? 'complete' : 'partial';

        return {
          id: row.id,
          clientId: row.business.id,
          clientName: row.business.legalName,
          type: `${row.issuer} ${row.cardProduct}`.trim(),
          // The limit on the row. There is no separate approved-limit column,
          // so an application that has not been decided shows what was asked
          // for; one with nothing recorded shows a dash rather than zero.
          amount: money(row.creditLimit),
          status: badgeStatus(row.status),
          // Null for a draft. Falling back to createdAt would put a date under
          // a column headed "Submitted" for an application that has not been
          // submitted, and 48 of the 58 applications on record are drafts.
          submitted: row.submittedAt === null ? null : row.submittedAt.toISOString(),
          created: row.createdAt.toISOString(),
          round:
            row.fundingRound === null ? 'Unassigned' : `Round ${row.fundingRound.roundNumber}`,
          roundId: row.fundingRoundId ?? '',
          consent,
          consentTooltip:
            consent === 'missing'
              ? 'No consent record on file for this client.'
              : consent === 'partial'
                ? `${held.size} consent record on file.`
                : undefined,
        };
      });

      const total = await sharedPrisma.cardApplication.count({
        where: { business: { tenantId } },
      });

      const data = { applications, total };
      const body: ApiResponse<typeof data> = { success: true, data };
      res.status(200).json(body);
    } catch (error) {
      logger.error('Failed to read recent applications', { tenantId, error });
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'RECENT_APPLICATIONS_FAILED',
          message: 'Could not read recent applications.',
        },
      };
      res.status(500).json(body);
    }
  },
);

export default dashboardRecentApplicationsRouter;
