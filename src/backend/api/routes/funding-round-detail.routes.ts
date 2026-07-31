// ============================================================
// CapitalForge Funding Round Detail Routes
//
// Mounted under: /api/funding-rounds/:roundId
//
// GET    /                — funding round detail
// GET    /repayment       — repayment cards & interest shock
// GET    /timeline        — round timeline events
// PATCH  /                — update round fields
//
// Reads FundingRound with its applications. Progress figures are derived from
// the applications on record rather than stored, so they cannot drift from the
// rows they describe.
// ============================================================

import { Router, type Response, type NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient, Prisma } from '@prisma/client';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { AGGREGATE_TYPES } from '../../events/event-types.js';

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────

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

function num(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

const APPROVED = new Set(['approved', 'active']);

async function loadRound(roundId: string, tenantId: string) {
  return prisma.fundingRound.findFirst({
    where: { id: roundId, business: { tenantId } },
    include: {
      business: { select: { id: true, legalName: true } },
      applications: { orderBy: { createdAt: 'asc' } },
    },
  });
}

const UPDATABLE_FIELDS = new Set([
  'status',
  'targetCredit',
  'targetCardCount',
  'aprExpiryDate',
  'startedAt',
  'completedAt',
]);

const ROUND_STATUSES = new Set(['planning', 'active', 'completed', 'cancelled']);

// ── Router ────────────────────────────────────────────────────

export const fundingRoundDetailRouter = Router({ mergeParams: true });

// GET / — round detail with derived progress
fundingRoundDetailRouter.get('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { roundId } = req.params;
  const tenantId = getTenantId(req);

  try {
    const round = await loadRound(roundId, tenantId);
    if (!round) {
      err(res, 404, 'ROUND_NOT_FOUND', `No funding round found with ID "${roundId}".`);
      return;
    }

    const apps = round.applications;
    const approved = apps.filter((a) => APPROVED.has(a.status));
    const creditObtained = approved.reduce((sum, a) => sum + Number(a.creditLimit ?? 0), 0);
    const targetCredit = num(round.targetCredit);

    ok(res, {
      id: round.id,
      businessId: round.businessId,
      businessName: round.business.legalName,
      roundNumber: round.roundNumber,
      status: round.status,
      targetCredit,
      targetCardCount: round.targetCardCount,
      aprExpiryDate: round.aprExpiryDate?.toISOString() ?? null,
      aprExpiryDaysRemaining: daysUntil(round.aprExpiryDate),
      alertsSent: {
        day60: round.alertSent60,
        day30: round.alertSent30,
        day15: round.alertSent15,
      },
      startedAt: round.startedAt?.toISOString() ?? null,
      completedAt: round.completedAt?.toISOString() ?? null,
      createdAt: round.createdAt.toISOString(),
      updatedAt: round.updatedAt.toISOString(),

      // Derived from the applications actually attached to this round.
      progress: {
        applicationCount: apps.length,
        approvedCount: approved.length,
        declinedCount: apps.filter((a) => a.status === 'declined').length,
        pendingCount: apps.filter((a) => !APPROVED.has(a.status) && a.status !== 'declined').length,
        creditObtained,
        creditRemaining:
          targetCredit === null ? null : Math.max(0, targetCredit - creditObtained),
        targetProgressPct:
          targetCredit && targetCredit > 0
            ? Math.round((creditObtained / targetCredit) * 100)
            : null,
      },

      applications: apps.map((a) => ({
        id: a.id,
        issuer: a.issuer,
        cardProduct: a.cardProduct,
        status: a.status,
        creditLimit: num(a.creditLimit),
        introAprExpiry: a.introAprExpiry?.toISOString() ?? null,
        declineReason: a.declineReason,
      })),
    });
  } catch (error) {
    logger.error('Failed to load funding round detail', { roundId, tenantId, error });
    err(res, 500, 'ROUND_DETAIL_FAILED', 'Unable to load the funding round.');
  }
});

// GET /repayment — obligations and the interest shock when intro APRs lapse
fundingRoundDetailRouter.get('/repayment', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { roundId } = req.params;
  const tenantId = getTenantId(req);

  try {
    const round = await loadRound(roundId, tenantId);
    if (!round) {
      err(res, 404, 'ROUND_NOT_FOUND', `No funding round found with ID "${roundId}".`);
      return;
    }

    const approved = round.applications.filter((a) => APPROVED.has(a.status));

    const cards = approved.map((a) => {
      const limit = Number(a.creditLimit ?? 0);
      const regularApr = num(a.regularApr);
      const daysRemaining = daysUntil(a.introAprExpiry);

      return {
        applicationId: a.id,
        issuer: a.issuer,
        cardProduct: a.cardProduct,
        creditLimit: limit,
        introApr: num(a.introApr),
        introAprExpiry: a.introAprExpiry?.toISOString() ?? null,
        daysRemaining,
        regularApr,
        annualFee: num(a.annualFee),
        // The cost of carrying the full limit for a year once the intro rate
        // lapses. Null when the card has no regular APR on record — an unknown
        // is reported as unknown rather than as zero exposure.
        annualisedInterestAtRegularApr:
          regularApr === null ? null : Math.round(limit * (regularApr / 100)),
        severity:
          daysRemaining === null
            ? null
            : daysRemaining <= 14
              ? 'critical'
              : daysRemaining <= 60
                ? 'warning'
                : 'ok',
      };
    });

    const withApr = cards.filter((c) => c.annualisedInterestAtRegularApr !== null);

    ok(res, {
      roundId: round.id,
      businessId: round.businessId,
      cards,
      totals: {
        cardCount: cards.length,
        totalCreditLimit: cards.reduce((sum, c) => sum + c.creditLimit, 0),
        totalAnnualFees: cards.reduce((sum, c) => sum + (c.annualFee ?? 0), 0),
        // Only the cards whose APR is known contribute; the count says how
        // many those were, so a partial figure is not read as a complete one.
        interestShockAnnualised: withApr.reduce(
          (sum, c) => sum + (c.annualisedInterestAtRegularApr ?? 0),
          0,
        ),
        interestShockBasedOnCards: withApr.length,
        cardsMissingRegularApr: cards.length - withApr.length,
      },
      nextAprExpiry:
        cards
          .filter((c) => c.introAprExpiry !== null)
          .sort((a, b) => (a.introAprExpiry! < b.introAprExpiry! ? -1 : 1))[0] ?? null,
    });
  } catch (error) {
    logger.error('Failed to load round repayment', { roundId, tenantId, error });
    err(res, 500, 'ROUND_REPAYMENT_FAILED', 'Unable to load repayment detail.');
  }
});

// GET /timeline — ledger events for the round and its applications
fundingRoundDetailRouter.get('/timeline', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { roundId } = req.params;
  const tenantId = getTenantId(req);

  try {
    const round = await loadRound(roundId, tenantId);
    if (!round) {
      err(res, 404, 'ROUND_NOT_FOUND', `No funding round found with ID "${roundId}".`);
      return;
    }

    // A round's history includes what happened to its applications, so both
    // aggregates are collected rather than just the round itself.
    const applicationIds = round.applications.map((a) => a.id);
    const events = await prisma.ledgerEvent.findMany({
      where: {
        tenantId,
        OR: [
          { aggregateType: AGGREGATE_TYPES.FUNDING_ROUND, aggregateId: roundId },
          ...(applicationIds.length
            ? [{ aggregateType: AGGREGATE_TYPES.APPLICATION, aggregateId: { in: applicationIds } }]
            : []),
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: 200,
    });

    const timeline = events.map((event) => {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      return {
        id: event.id,
        type: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        timestamp: event.publishedAt.toISOString(),
        actor: typeof payload['createdBy'] === 'string' ? (payload['createdBy'] as string) : 'System',
        detail: payload,
      };
    });

    ok(res, timeline, { total: timeline.length });
  } catch (error) {
    logger.error('Failed to load round timeline', { roundId, tenantId, error });
    err(res, 500, 'ROUND_TIMELINE_FAILED', 'Unable to load the round timeline.');
  }
});

// PATCH / — update round fields
fundingRoundDetailRouter.patch('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { roundId } = req.params;
  const tenantId = getTenantId(req);
  const updates = (req.body ?? {}) as Record<string, unknown>;

  if (Object.keys(updates).length === 0) {
    err(res, 400, 'INVALID_BODY', 'Request body must contain fields to update');
    return;
  }

  const rejected = Object.keys(updates).filter((k) => !UPDATABLE_FIELDS.has(k));
  if (rejected.length > 0) {
    err(res, 400, 'FIELD_NOT_UPDATABLE', `These fields cannot be updated: ${rejected.join(', ')}.`);
    return;
  }

  if (typeof updates['status'] === 'string' && !ROUND_STATUSES.has(updates['status'])) {
    err(
      res,
      400,
      'INVALID_STATUS',
      `Status must be one of: ${[...ROUND_STATUSES].join(', ')}.`,
    );
    return;
  }

  try {
    const round = await loadRound(roundId, tenantId);
    if (!round) {
      err(res, 404, 'ROUND_NOT_FOUND', `No funding round found with ID "${roundId}".`);
      return;
    }

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        data[key] = null;
      } else if (key === 'targetCredit') {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          err(res, 400, 'INVALID_FIELD', 'targetCredit must be a number.');
          return;
        }
        data[key] = new Prisma.Decimal(parsed);
      } else if (key === 'targetCardCount') {
        const parsed = Number(value);
        if (!Number.isInteger(parsed)) {
          err(res, 400, 'INVALID_FIELD', 'targetCardCount must be an integer.');
          return;
        }
        data[key] = parsed;
      } else if (key === 'aprExpiryDate' || key === 'startedAt' || key === 'completedAt') {
        const parsed = new Date(value as string);
        if (isNaN(parsed.getTime())) {
          err(res, 400, 'INVALID_FIELD', `"${key}" must be a valid date.`);
          return;
        }
        data[key] = parsed;
      } else {
        data[key] = value;
      }
    }

    const updated = await prisma.fundingRound.update({ where: { id: roundId }, data });
    logger.info('Funding round updated', { roundId, tenantId, fields: Object.keys(data) });

    ok(res, {
      id: updated.id,
      businessId: updated.businessId,
      roundNumber: updated.roundNumber,
      status: updated.status,
      targetCredit: num(updated.targetCredit),
      targetCardCount: updated.targetCardCount,
      aprExpiryDate: updated.aprExpiryDate?.toISOString() ?? null,
      startedAt: updated.startedAt?.toISOString() ?? null,
      completedAt: updated.completedAt?.toISOString() ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error('Failed to update funding round', { roundId, tenantId, error });
    err(res, 500, 'ROUND_UPDATE_FAILED', 'Unable to update the funding round.');
  }
});
