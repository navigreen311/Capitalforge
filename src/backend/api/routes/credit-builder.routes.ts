// ============================================================
// CapitalForge — Business Credit Builder
//
// Endpoints:
//   GET  /api/credit-builder/:clientId/scores             — latest bureau scores
//   GET  /api/credit-builder/:clientId/score-history      — movement over pulls
//   GET  /api/credit-builder/:clientId/tradelines         — vendor tradelines
//   POST /api/credit-builder/:clientId/tradelines         — open a tradeline
//   POST /api/credit-builder/:clientId/tradeline-disputes — dispute a tradeline
//
// Tradelines and disputes are persisted. They previously lived in two
// process-memory objects, so anything a client added disappeared on the next
// restart while the API reported it as created.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient, Prisma } from '@prisma/client';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';

const prisma = new PrismaClient();

export const creditBuilderRouter = Router({ mergeParams: true });

// ── Helpers ──────────────────────────────────────────────────

/** Safely extract a single string param (Express 5 params may be string | string[]). */
function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0]! : (val ?? '');
}

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

function created(res: Response, data: unknown): void {
  const body: ApiResponse = { success: true, data };
  res.status(201).json(body);
}

function err(res: Response, status: number, code: string, message: string): void {
  const body: ApiResponse = { success: false, error: { code, message } };
  res.status(status).json(body);
}

function num(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

/** Confirms the client exists and belongs to the caller's tenant. */
async function assertClient(clientId: string, tenantId: string): Promise<boolean> {
  const business = await prisma.business.findFirst({
    where: { id: clientId, tenantId },
    select: { id: true },
  });
  return business !== null;
}

/**
 * Rating bands per business-credit score type.
 *
 * These scales differ — PAYDEX runs 0–100, FICO SBSS 0–300 — so one set of
 * thresholds cannot describe them all. A score type with no band defined
 * returns null rather than being forced onto the wrong scale.
 */
const SCORE_BANDS: Record<string, { max: number; bands: [number, string][] }> = {
  paydex: { max: 100, bands: [[80, 'Low risk'], [50, 'Medium risk'], [0, 'High risk']] },
  intelliscore: { max: 100, bands: [[76, 'Low risk'], [51, 'Medium risk'], [0, 'High risk']] },
  sbss: { max: 300, bands: [[180, 'Low risk'], [140, 'Medium risk'], [0, 'High risk']] },
};

function ratingFor(scoreType: string | null, score: number | null): string | null {
  if (score === null || !scoreType) return null;
  const spec = SCORE_BANDS[scoreType.toLowerCase()];
  if (!spec) return null;
  return spec.bands.find(([threshold]) => score >= threshold)?.[1] ?? null;
}

function rangeFor(scoreType: string | null): string | null {
  if (!scoreType) return null;
  const spec = SCORE_BANDS[scoreType.toLowerCase()];
  return spec ? `0-${spec.max}` : null;
}

const TRADELINE_STATUSES = new Set(['open', 'closed', 'delinquent']);

// ── GET /scores ──────────────────────────────────────────────

creditBuilderRouter.get(
  '/:clientId/scores',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const tenantId = getTenantId(req);

    try {
      if (!(await assertClient(clientId, tenantId))) {
        err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
        return;
      }

      const profiles = await prisma.creditProfile.findMany({
        where: { businessId: clientId, profileType: 'business' },
        orderBy: { pulledAt: 'desc' },
      });

      // The most recent pull per bureau. Older pulls stay available through
      // /score-history rather than being blended into a single figure.
      const latestByBureau = new Map<string, (typeof profiles)[number]>();
      for (const p of profiles) {
        if (!latestByBureau.has(p.bureau)) latestByBureau.set(p.bureau, p);
      }

      const scores = [...latestByBureau.values()].map((p) => ({
        bureau: p.bureau,
        scoreType: p.scoreType,
        score: p.score,
        range: rangeFor(p.scoreType),
        rating: ratingFor(p.scoreType, p.score),
        utilization: num(p.utilization),
        pulledAt: p.pulledAt.toISOString(),
      }));

      ok(res, { clientId, asOf: new Date().toISOString(), scores }, { total: scores.length });
    } catch (error) {
      logger.error('Failed to load credit-builder scores', { clientId, tenantId, error });
      err(res, 500, 'CREDIT_BUILDER_SCORES_FAILED', 'Unable to load credit scores.');
    }
  },
);

// ── GET /score-history ───────────────────────────────────────

creditBuilderRouter.get(
  '/:clientId/score-history',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const tenantId = getTenantId(req);

    try {
      if (!(await assertClient(clientId, tenantId))) {
        err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
        return;
      }

      const profiles = await prisma.creditProfile.findMany({
        where: { businessId: clientId, profileType: 'business' },
        orderBy: { pulledAt: 'asc' },
      });

      // One row per month, keyed by score type. Months with no pull are absent
      // rather than interpolated — this used to synthesise a smooth six-month
      // curve with a fresh random jitter on every request.
      const byMonth = new Map<string, Record<string, number | null>>();
      for (const p of profiles) {
        const month = p.pulledAt.toISOString().slice(0, 7);
        const entry = byMonth.get(month) ?? {};
        if (p.scoreType) entry[p.scoreType] = p.score;
        byMonth.set(month, entry);
      }

      const months = [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, scores]) => ({ month, ...scores }));

      ok(res, { clientId, months, pullCount: profiles.length }, { total: months.length });
    } catch (error) {
      logger.error('Failed to load credit-builder history', { clientId, tenantId, error });
      err(res, 500, 'CREDIT_BUILDER_HISTORY_FAILED', 'Unable to load score history.');
    }
  },
);

// ── GET /tradelines ──────────────────────────────────────────

creditBuilderRouter.get(
  '/:clientId/tradelines',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const tenantId = getTenantId(req);

    try {
      if (!(await assertClient(clientId, tenantId))) {
        err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
        return;
      }

      const tradelines = await prisma.vendorTradeline.findMany({
        where: { businessId: clientId, tenantId },
        include: { disputes: { orderBy: { filedAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });

      ok(
        res,
        {
          clientId,
          tradelines: tradelines.map((t) => ({
            id: t.id,
            vendor: t.vendor,
            creditLimit: num(t.creditLimit),
            balance: Number(t.balance),
            status: t.status,
            reportsTo: t.reportsTo ?? [],
            openedDate: t.openedDate?.toISOString() ?? null,
            disputes: t.disputes.map((d) => ({
              id: d.id,
              reason: d.reason,
              status: d.status,
              filedAt: d.filedAt.toISOString(),
              resolvedAt: d.resolvedAt?.toISOString() ?? null,
            })),
          })),
        },
        { total: tradelines.length },
      );
    } catch (error) {
      logger.error('Failed to load tradelines', { clientId, tenantId, error });
      err(res, 500, 'CREDIT_BUILDER_TRADELINES_FAILED', 'Unable to load tradelines.');
    }
  },
);

// ── POST /tradelines ─────────────────────────────────────────

creditBuilderRouter.post(
  '/:clientId/tradelines',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const tenantId = getTenantId(req);
    const { vendor, creditLimit, reportsTo, openedDate, status } = req.body as Record<string, unknown>;

    if (!vendor || typeof vendor !== 'string' || !vendor.trim()) {
      err(res, 422, 'VALIDATION_ERROR', 'vendor (string) is required.');
      return;
    }

    if (status !== undefined && (typeof status !== 'string' || !TRADELINE_STATUSES.has(status))) {
      err(res, 422, 'VALIDATION_ERROR', `status must be one of: ${[...TRADELINE_STATUSES].join(', ')}.`);
      return;
    }

    try {
      if (!(await assertClient(clientId, tenantId))) {
        err(res, 404, 'CLIENT_NOT_FOUND', `No client found with ID "${clientId}".`);
        return;
      }

      const tradeline = await prisma.vendorTradeline.create({
        data: {
          tenantId,
          businessId: clientId,
          vendor: vendor.trim(),
          creditLimit: typeof creditLimit === 'number' ? new Prisma.Decimal(creditLimit) : null,
          status: typeof status === 'string' ? status : 'open',
          reportsTo: Array.isArray(reportsTo)
            ? (reportsTo as Prisma.InputJsonValue)
            : Prisma.DbNull,
          openedDate: typeof openedDate === 'string' ? new Date(openedDate) : new Date(),
        },
      });

      logger.info('Vendor tradeline created', { clientId, tenantId, tradelineId: tradeline.id });

      created(res, {
        id: tradeline.id,
        vendor: tradeline.vendor,
        creditLimit: num(tradeline.creditLimit),
        balance: Number(tradeline.balance),
        status: tradeline.status,
        reportsTo: tradeline.reportsTo ?? [],
        openedDate: tradeline.openedDate?.toISOString() ?? null,
      });
    } catch (error) {
      logger.error('Failed to create tradeline', { clientId, tenantId, error });
      err(res, 500, 'TRADELINE_CREATE_FAILED', 'Unable to create the tradeline.');
    }
  },
);

// ── POST /tradeline-disputes ─────────────────────────────────

creditBuilderRouter.post(
  '/:clientId/tradeline-disputes',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const tenantId = getTenantId(req);
    const { tradelineId, reason } = req.body as Record<string, unknown>;

    if (!tradelineId || typeof tradelineId !== 'string') {
      err(res, 422, 'VALIDATION_ERROR', 'tradelineId (string) is required.');
      return;
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      err(res, 422, 'VALIDATION_ERROR', 'reason (string) is required.');
      return;
    }

    try {
      // The tradeline must belong to this client and tenant. Without this a
      // caller could file a dispute against another tenant's tradeline by id.
      const tradeline = await prisma.vendorTradeline.findFirst({
        where: { id: tradelineId, businessId: clientId, tenantId },
        select: { id: true },
      });

      if (!tradeline) {
        err(res, 404, 'TRADELINE_NOT_FOUND', `No tradeline "${tradelineId}" for this client.`);
        return;
      }

      const dispute = await prisma.tradelineDispute.create({
        data: { tenantId, tradelineId, reason: reason.trim() },
      });

      logger.info('Tradeline dispute filed', { clientId, tenantId, disputeId: dispute.id });

      created(res, {
        id: dispute.id,
        tradelineId: dispute.tradelineId,
        reason: dispute.reason,
        status: dispute.status,
        filedAt: dispute.filedAt.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to file tradeline dispute', { clientId, tenantId, error });
      err(res, 500, 'DISPUTE_CREATE_FAILED', 'Unable to file the dispute.');
    }
  },
);
