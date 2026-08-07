// ============================================================
// CapitalForge Clients Routes
//
// Mounted under: /api/clients (and /api/v1/clients)
//
// GET    /                — paginated client list with consent & APR info
// POST   /                — create new business/client
// ============================================================

import { Router, type Response, type NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { isValidTimezone } from '../../services/timezone.js';

// ── Dependency setup ──────────────────────────────────────────

const prisma = sharedPrisma;

// ── Helpers ───────────────────────────────────────────────────

/**
 * The tenant is taken from the verified access token only.
 *
 * This previously read `tenant.id` — a field TenantContext does not have (it
 * is `tenantId`) — so it always fell through to a caller-supplied
 * X-Tenant-Id header, or to the literal string 'default'. Both let a caller
 * choose which tenant's data to read.
 */
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

// ── Router ────────────────────────────────────────────────────

export const clientsRouter = Router();

// GET / — paginated client list with consent status & APR badge
clientsRouter.get('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const tenantId = getTenantId(req);
  const {
    page = '1',
    pageSize = '25',
    search,
    status,
    sortBy = 'fundingReadinessScore',
    sortDir = 'desc',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));

  try {
    logger.debug('GET clients list', { tenantId, page: pageNum, pageSize: size, search, status });

    // Attempt Prisma query
    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { legalName: { contains: search } },
        { dba: { contains: search } },
      ];
    }

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        include: {
          advisor: { select: { firstName: true, lastName: true } },
          consentRecords: { where: { status: 'active' }, select: { channel: true } },
          cardApplications: {
            where: { introAprExpiry: { not: null } },
            select: { introAprExpiry: true },
            orderBy: { introAprExpiry: 'asc' },
            take: 1,
          },
        },
        orderBy: { [sortBy === 'businessName' ? 'legalName' : sortBy === 'lastActivityAt' ? 'updatedAt' : 'fundingReadinessScore']: sortDir === 'asc' ? 'asc' : 'desc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
      prisma.business.count({ where }),
    ]);

    const rows = businesses.map((biz) => {
        const advisorName = biz.advisor
          ? `${biz.advisor.firstName} ${biz.advisor.lastName}`
          : 'Unassigned';

        // Consent status summary
        const activeChannels = new Set(biz.consentRecords.map((c) => c.channel));
        const requiredChannels = ['voice', 'sms', 'email', 'document'];
        const consentComplete = requiredChannels.every((ch) => activeChannels.has(ch));
        const consentStatus = consentComplete
          ? 'complete'
          : activeChannels.size > 0
            ? 'pending'
            : 'blocked';

        // APR alert
        let aprAlert: { days: number; tier: 'critical' | 'warning' } | null = null;
        if (biz.cardApplications.length > 0 && biz.cardApplications[0]!.introAprExpiry) {
          const daysLeft = Math.ceil(
            (new Date(biz.cardApplications[0]!.introAprExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          );
          if (daysLeft > 0 && daysLeft <= 90) {
            aprAlert = { days: daysLeft, tier: daysLeft <= 30 ? 'critical' : 'warning' };
          }
        }

        return {
          id: biz.id,
          businessName: biz.legalName,
          status: biz.status,
          advisorName,
          fundingReadinessScore: biz.fundingReadinessScore ?? 0,
          lastActivityAt: biz.updatedAt.toISOString(),
          entityType: biz.entityType,
          state: biz.stateOfFormation ?? '',
          aprAlert,
          consentStatus,
        };
      });

    // An empty tenant is a legitimate answer — return the empty page rather
    // than substituting sample clients, which previously made a brand-new or
    // a broken tenant look identical to a populated one.
    ok(res, rows, { total, page: pageNum, pageSize: size, totalPages: Math.ceil(total / size) });
  } catch (error) {
    // Previously this fell through to hardcoded sample clients, so a database
    // outage was indistinguishable from a healthy tenant. Surface it instead.
    logger.error('Prisma query failed for clients list', { tenantId, error });
    err(res, 500, 'CLIENT_LIST_FAILED', 'Unable to load clients.');
  }
});

// POST / — create new business/client
clientsRouter.post('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const tenantId = getTenantId(req);
  const body = req.body;

  if (!body || !body.legalName || !body.entityType) {
    err(res, 400, 'INVALID_BODY', 'legalName and entityType are required');
    return;
  }

  if (body.timezone !== undefined && body.timezone !== null) {
    if (typeof body.timezone !== 'string' || !isValidTimezone(body.timezone)) {
      err(
        res,
        422,
        'INVALID_TIMEZONE',
        'timezone must be an IANA name such as "America/Chicago".',
      );
      return;
    }
  }

  try {
    logger.info('POST create client', { tenantId, legalName: body.legalName });
    const business = await prisma.business.create({
      data: {
        tenantId,
        legalName: body.legalName,
        dba: body.dba ?? null,
        ein: body.ein ?? null,
        entityType: body.entityType,
        stateOfFormation: body.stateOfFormation ?? null,
        industry: body.industry ?? null,
        annualRevenue: body.annualRevenue ?? null,
        monthlyRevenue: body.monthlyRevenue ?? null,
        // Accepted at creation because a client with neither is unreachable
        // for outreach: SMS needs a number, and quiet hours need a timezone.
        // Both were silently dropped here, so every client created through
        // the API could never be messaged until someone patched it.
        phoneNumber: body.phoneNumber ?? null,
        timezone: body.timezone ?? null,
        status: 'intake',
      },
    });
    created(res, business);
  } catch (error) {
    // This previously answered 201 Created with a fabricated `biz_<timestamp>`
    // id when the write failed. The caller recorded a client that does not
    // exist, and every subsequent request for that id 404'd. A failed write
    // must report as a failed write.
    logger.error('Prisma create failed for client', { tenantId, error });
    err(res, 500, 'CLIENT_CREATE_FAILED', 'Unable to create the client.');
  }
});
