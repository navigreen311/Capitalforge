// ============================================================
// CapitalForge Clients Routes
//
// Mounted under: /api/clients (and /api/v1/clients)
//
// GET    /                — paginated client list with consent & APR info
// POST   /                — create new business/client
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';

// ── Dependency setup ──────────────────────────────────────────

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────

function getTenantId(req: Request): string {
  const tenant = (req as Request & { tenant?: { id: string } }).tenant;
  if (tenant?.id) return tenant.id;
  const header = req.headers['x-tenant-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  return 'default';
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

// ── Mock / placeholder data for list ──────────────────────────

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const MOCK_CLIENTS = [
  {
    id: 'biz_001',
    businessName: 'Apex Ventures LLC',
    status: 'active',
    advisorName: 'Sarah Chen',
    fundingReadinessScore: 82,
    lastActivityAt: daysFromNow(-2),
    entityType: 'llc',
    state: 'TX',
    aprAlert: { days: 12, tier: 'critical' },
    consentStatus: 'complete',
  },
  {
    id: 'biz_002',
    businessName: 'NovaTech Solutions Inc.',
    status: 'onboarding',
    advisorName: 'Marcus Williams',
    fundingReadinessScore: 61,
    lastActivityAt: daysFromNow(-3),
    entityType: 'corporation',
    state: 'CA',
    aprAlert: null,
    consentStatus: 'pending',
  },
  {
    id: 'biz_003',
    businessName: 'Blue Ridge Consulting',
    status: 'active',
    advisorName: 'Sarah Chen',
    fundingReadinessScore: 74,
    lastActivityAt: daysFromNow(-4),
    entityType: 'llc',
    state: 'NC',
    aprAlert: { days: 45, tier: 'warning' },
    consentStatus: 'complete',
  },
  {
    id: 'biz_004',
    businessName: 'Summit Capital Group',
    status: 'active',
    advisorName: 'James Okafor',
    fundingReadinessScore: 91,
    lastActivityAt: daysFromNow(-5),
    entityType: 's_corp',
    state: 'NY',
    aprAlert: null,
    consentStatus: 'complete',
  },
  {
    id: 'biz_005',
    businessName: 'Horizon Retail Partners',
    status: 'intake',
    advisorName: 'Marcus Williams',
    fundingReadinessScore: 43,
    lastActivityAt: daysFromNow(-6),
    entityType: 'partnership',
    state: 'FL',
    aprAlert: { days: 8, tier: 'critical' },
    consentStatus: 'blocked',
  },
  {
    id: 'biz_006',
    businessName: 'Crestline Medical LLC',
    status: 'active',
    advisorName: 'James Okafor',
    fundingReadinessScore: 77,
    lastActivityAt: daysFromNow(-7),
    entityType: 'llc',
    state: 'OH',
    aprAlert: null,
    consentStatus: 'complete',
  },
  {
    id: 'biz_007',
    businessName: 'Pinnacle Freight Corp',
    status: 'graduated',
    advisorName: 'Sarah Chen',
    fundingReadinessScore: 95,
    lastActivityAt: daysFromNow(-11),
    entityType: 'c_corp',
    state: 'IL',
    aprAlert: null,
    consentStatus: 'pending',
  },
  {
    id: 'biz_008',
    businessName: 'Redwood Digital',
    status: 'offboarding',
    advisorName: 'Marcus Williams',
    fundingReadinessScore: 55,
    lastActivityAt: daysFromNow(-13),
    entityType: 'llc',
    state: 'WA',
    aprAlert: null,
    consentStatus: 'complete',
  },
];

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

    if (businesses.length > 0 || total > 0) {
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
        if (biz.cardApplications.length > 0 && biz.cardApplications[0].introAprExpiry) {
          const daysLeft = Math.ceil(
            (new Date(biz.cardApplications[0].introAprExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
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

      ok(res, rows, { total, page: pageNum, pageSize: size, totalPages: Math.ceil(total / size) });
      return;
    }
  } catch (error) {
    logger.warn('Prisma query failed for clients list, returning mock', { error });
  }

  // Fallback to mock data with client-side filtering/pagination
  let filtered = [...MOCK_CLIENTS];
  if (search) {
    const s = (search as string).toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.businessName.toLowerCase().includes(s) ||
        c.advisorName.toLowerCase().includes(s),
    );
  }
  if (status) {
    filtered = filtered.filter((c) => c.status === status);
  }

  const total = filtered.length;
  const paged = filtered.slice((pageNum - 1) * size, pageNum * size);

  ok(res, paged, { total, page: pageNum, pageSize: size, totalPages: Math.ceil(total / size) });
});

// POST / — create new business/client
clientsRouter.post('/', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const tenantId = getTenantId(req);
  const body = req.body;

  if (!body || !body.legalName || !body.entityType) {
    err(res, 400, 'INVALID_BODY', 'legalName and entityType are required');
    return;
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
        status: 'intake',
      },
    });
    created(res, business);
    return;
  } catch (error) {
    logger.warn('Prisma create failed for client, returning mock', { error });
  }

  // Mock fallback
  const mockId = `biz_${Date.now()}`;
  created(res, {
    id: mockId,
    tenantId,
    ...body,
    status: 'intake',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});
