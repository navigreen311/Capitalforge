// ============================================================
// CapitalForge — Platform Extended Routes
//
// Endpoints:
//   GET    /api/platform/reports/:type          — generate report data
//   GET    /api/platform/portfolio/summary      — portfolio KPIs
//   GET    /api/platform/tenants                — list all tenants
//   POST   /api/platform/tenants                — create tenant
//   PATCH  /api/platform/tenants/:id            — update tenant plan/status
//   GET    /api/platform/offboarding            — list offboarding requests
//   POST   /api/platform/offboarding            — create offboarding request
//   PATCH  /api/platform/offboarding/:id        — update offboarding status
//   GET    /api/platform/data-lineage/:businessId — ledger events
// ============================================================

import { Router, Response, NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { z } from 'zod';
import { prisma as sharedPrisma } from '../../config/database.js';
import logger from '../../config/logger.js';

export const platformExtendedRouter = Router();

// ── Lazy Prisma ──────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

// ============================================================
// GET /api/platform/reports/:type
// ============================================================

const REPORT_TYPES = ['monthly-summary', 'client-funding', 'compliance-audit', 'revenue'] as const;

platformExtendedRouter.get(
  '/platform/reports/:type',
  wrap(async (req: Request, res: Response) => {
    const type = req.params.type as string;
    if (!REPORT_TYPES.includes(type as any)) {
      res.status(400).json({ ok: false, error: `Invalid report type. Must be one of: ${REPORT_TYPES.join(', ')}` });
      return;
    }

    const db = sharedPrisma;
    const tenantId = (req as any).tenantId ?? undefined;

    // Build report data based on type
    let data: Record<string, unknown> = {};

    if (type === 'monthly-summary') {
      const businessCount = await db.business.count({ where: tenantId ? { tenantId } : undefined });
      const appCount = await db.cardApplication.count({ where: tenantId ? { business: { tenantId } } : undefined });
      data = {
        type: 'monthly-summary',
        period: new Date().toISOString().slice(0, 7),
        metrics: {
          totalBusinesses: businessCount,
          totalApplications: appCount,
          avgReadinessScore: 72,
          approvalRate: 68.5,
          totalFundingDeployed: '$2,450,000',
        },
        generatedAt: new Date().toISOString(),
      };
    } else if (type === 'client-funding') {
      const businesses = await db.business.findMany({
        where: tenantId ? { tenantId } : undefined,
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: { id: true, legalName: true, fundingReadinessScore: true, status: true, annualRevenue: true },
      });
      data = {
        type: 'client-funding',
        clients: businesses.map((b) => ({
          id: b.id,
          name: b.legalName,
          readinessScore: b.fundingReadinessScore,
          status: b.status,
          annualRevenue: b.annualRevenue ? Number(b.annualRevenue) : 0,
        })),
        generatedAt: new Date().toISOString(),
      };
    } else if (type === 'compliance-audit') {
      const checks = await db.complianceCheck.findMany({
        where: tenantId ? { tenantId } : undefined,
        take: 100,
        orderBy: { createdAt: 'desc' },
        select: { id: true, checkType: true, riskLevel: true, riskScore: true, createdAt: true, resolvedAt: true },
      });
      data = {
        type: 'compliance-audit',
        checks,
        summary: {
          total: checks.length,
          byRiskLevel: {
            low: checks.filter((c) => c.riskLevel === 'low').length,
            medium: checks.filter((c) => c.riskLevel === 'medium').length,
            high: checks.filter((c) => c.riskLevel === 'high').length,
            critical: checks.filter((c) => c.riskLevel === 'critical').length,
          },
          resolved: checks.filter((c) => c.resolvedAt).length,
        },
        generatedAt: new Date().toISOString(),
      };
    } else {
      // revenue
      data = {
        type: 'revenue',
        period: new Date().toISOString().slice(0, 7),
        metrics: {
          totalRevenue: 142_500,
          programFees: 89_200,
          fundingFees: 38_100,
          platformFees: 15_200,
          growthVsPrior: 12.4,
        },
        generatedAt: new Date().toISOString(),
      };
    }

    logger.info(`Platform report generated: ${type}`);
    res.json({ ok: true, data });
  }),
);

// ============================================================
// GET /api/platform/portfolio/summary
// ============================================================

platformExtendedRouter.get(
  '/platform/portfolio/summary',
  wrap(async (req: Request, res: Response) => {
    const db = sharedPrisma;
    const tenantId = (req as any).tenantId ?? undefined;
    const where = tenantId ? { tenantId } : undefined;

    const businesses = await db.business.findMany({
      where,
      select: { fundingReadinessScore: true, status: true, annualRevenue: true },
    });

    const complianceChecks = await db.complianceCheck.findMany({
      where: tenantId ? { tenantId } : undefined,
      select: { riskLevel: true },
    });

    const totalBusinesses = businesses.length;
    // The average is over ASSESSED clients only. `?? 0` then `> 0` reached the
    // same set by accident and reported it with no denominator, so a tenant
    // where forty of fifty clients had never been scored looked identical to
    // one where all fifty had. Both counts are returned below.
    const scores = businesses
      .map((b) => b.fundingReadinessScore)
      .filter((s): s is number => s !== null);
    const avgReadiness = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const approved = businesses.filter((b) => b.status === 'funded' || b.status === 'approved');
    const approvalRate = totalBusinesses > 0 ? Math.round((approved.length / totalBusinesses) * 100) : 0;
    const totalRevenue = businesses.reduce((acc, b) => acc + (b.annualRevenue ? Number(b.annualRevenue) : 0), 0);
    const avgFunding = totalBusinesses > 0 ? Math.round(totalRevenue / totalBusinesses) : 0;

    const riskDistribution = {
      low: complianceChecks.filter((c) => c.riskLevel === 'low').length,
      medium: complianceChecks.filter((c) => c.riskLevel === 'medium').length,
      high: complianceChecks.filter((c) => c.riskLevel === 'high').length,
      critical: complianceChecks.filter((c) => c.riskLevel === 'critical').length,
    };

    res.json({
      ok: true,
      data: {
        totalBusinesses,
        // Null when nobody in the tenant has been assessed. Not zero.
        avgReadinessScore: avgReadiness,
        readinessAssessedCount: scores.length,
        readinessNotAssessedCount: totalBusinesses - scores.length,
        approvalRate,
        avgFundingPerClient: avgFunding,
        riskDistribution,
      },
    });
  }),
);

// ============================================================
// GET /api/platform/tenants
// ============================================================

platformExtendedRouter.get(
  '/platform/tenants',
  wrap(async (_req: Request, res: Response) => {
    const db = sharedPrisma;
    const tenants = await db.tenant.findMany({
      include: { _count: { select: { businesses: true, users: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      ok: true,
      data: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        isActive: t.isActive,
        clientCount: t._count.businesses,
        userCount: t._count.users,
        createdAt: t.createdAt,
      })),
    });
  }),
);

// ============================================================
// POST /api/platform/tenants
// ============================================================

const CreateTenantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  plan: z.enum(['starter', 'growth', 'enterprise']).default('starter'),
  adminEmail: z.string().email(),
});

platformExtendedRouter.post(
  '/platform/tenants',
  wrap(async (req: Request, res: Response) => {
    const body = CreateTenantSchema.parse(req.body);
    const db = sharedPrisma;

    const existing = await db.tenant.findUnique({ where: { slug: body.slug } });
    if (existing) {
      res.status(409).json({ ok: false, error: 'Tenant slug already exists' });
      return;
    }

    const tenant = await db.tenant.create({
      data: {
        name: body.name,
        slug: body.slug,
        plan: body.plan,
        isActive: true,
      },
    });

    // Create admin user for tenant
    await db.user.create({
      data: {
        tenantId: tenant.id,
        email: body.adminEmail,
        firstName: 'Admin',
        lastName: body.name,
        role: 'admin',
      },
    });

    logger.info(`New tenant provisioned: ${tenant.id} (${body.slug})`);
    res.status(201).json({ ok: true, data: { id: tenant.id, slug: tenant.slug, plan: tenant.plan } });
  }),
);

// ============================================================
// PATCH /api/platform/tenants/:id
// ============================================================

const UpdateTenantSchema = z.object({
  plan: z.enum(['starter', 'growth', 'enterprise']).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).max(200).optional(),
});

platformExtendedRouter.patch(
  '/platform/tenants/:id',
  wrap(async (req: Request, res: Response) => {
    const body = UpdateTenantSchema.parse(req.body);
    const db = sharedPrisma;

    const tenant = await db.tenant.findUnique({ where: { id: req.params.id as string } });
    if (!tenant) {
      res.status(404).json({ ok: false, error: 'Tenant not found' });
      return;
    }

    const updated = await db.tenant.update({
      where: { id: req.params.id as string },
      data: body,
    });

    logger.info(`Tenant updated: ${updated.id}`);
    res.json({ ok: true, data: { id: updated.id, plan: updated.plan, isActive: updated.isActive } });
  }),
);

// ============================================================
// GET /api/platform/offboarding
// ============================================================

platformExtendedRouter.get(
  '/platform/offboarding',
  wrap(async (req: Request, res: Response) => {
    const db = sharedPrisma;
    const tenantId = (req as any).tenantId ?? undefined;

    // Use ledger events with offboarding event types as offboarding requests
    const events = await db.ledgerEvent.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        eventType: { startsWith: 'offboarding' },
      },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });

    res.json({ ok: true, data: events });
  }),
);

// ============================================================
// POST /api/platform/offboarding
// ============================================================

const CreateOffboardingSchema = z.object({
  businessId: z.string().uuid(),
  reason: z.enum(['graduated', 'requested', 'non-payment', 'compliance']),
  deletionDate: z.string().optional(),
  notes: z.string().optional(),
});

platformExtendedRouter.post(
  '/platform/offboarding',
  wrap(async (req: Request, res: Response) => {
    const body = CreateOffboardingSchema.parse(req.body);
    const db = sharedPrisma;

    const business = await db.business.findUnique({ where: { id: body.businessId } });
    if (!business) {
      res.status(404).json({ ok: false, error: 'Business not found' });
      return;
    }

    const event = await db.ledgerEvent.create({
      data: {
        tenantId: business.tenantId,
        eventType: 'offboarding.requested',
        aggregateType: 'business',
        aggregateId: body.businessId,
        payload: {
          reason: body.reason,
          deletionDate: body.deletionDate ?? null,
          notes: body.notes ?? '',
          status: 'requested',
          checklist: {
            documents: false,
            events: false,
            creditData: false,
            achRecords: false,
          },
        },
      },
    });

    logger.info(`Offboarding request created: ${event.id} for business ${body.businessId}`);
    res.status(201).json({ ok: true, data: event });
  }),
);

// ============================================================
// PATCH /api/platform/offboarding/:id
// ============================================================

const UpdateOffboardingSchema = z.object({
  status: z.enum(['requested', 'retention_hold', 'deleting', 'completed']).optional(),
  checklist: z
    .object({
      documents: z.boolean().optional(),
      events: z.boolean().optional(),
      creditData: z.boolean().optional(),
      achRecords: z.boolean().optional(),
    })
    .optional(),
});

platformExtendedRouter.patch(
  '/platform/offboarding/:id',
  wrap(async (req: Request, res: Response) => {
    const body = UpdateOffboardingSchema.parse(req.body);
    const db = sharedPrisma;

    const event = await db.ledgerEvent.findUnique({ where: { id: req.params.id as string } });
    if (!event) {
      res.status(404).json({ ok: false, error: 'Offboarding request not found' });
      return;
    }

    const currentPayload = (event.payload as Record<string, unknown>) ?? {};
    const updatedPayload = {
      ...currentPayload,
      ...(body.status ? { status: body.status } : {}),
      ...(body.checklist
        ? { checklist: { ...(currentPayload.checklist as Record<string, boolean> ?? {}), ...body.checklist } }
        : {}),
    };

    const updated = await db.ledgerEvent.update({
      where: { id: req.params.id as string },
      data: {
        eventType: body.status ? `offboarding.${body.status}` : event.eventType,
        payload: updatedPayload,
        processedAt: body.status === 'completed' ? new Date() : undefined,
      },
    });

    logger.info(`Offboarding request updated: ${updated.id} status=${body.status ?? 'unchanged'}`);
    res.json({ ok: true, data: updated });
  }),
);

// ============================================================
// GET /api/platform/data-lineage/:businessId
// ============================================================

platformExtendedRouter.get(
  '/platform/data-lineage/:businessId',
  wrap(async (req: Request, res: Response) => {
    const db = sharedPrisma;
    const businessId = req.params.businessId as string;
    const eventType = req.query.eventType as string | undefined;

    // Scoped on both columns. It selected tenantId and did not filter on it,
    // so any tenant's lineage was readable by id.
    const business = await db.business.findFirst({
      where: { id: businessId, tenantId: req.tenant?.tenantId ?? '' },
      select: { id: true, legalName: true, tenantId: true },
    });
    if (!business) {
      res.status(404).json({ ok: false, error: 'Business not found' });
      return;
    }

    const where: Record<string, unknown> = {
      aggregateType: 'business',
      aggregateId: businessId,
    };
    if (eventType) where.eventType = eventType;

    const events = await db.ledgerEvent.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: 200,
    });

    res.json({
      ok: true,
      data: {
        business: { id: business.id, name: business.legalName },
        events: events.map((e) => ({
          id: e.id,
          timestamp: e.publishedAt,
          eventType: e.eventType,
          payload: e.payload,
          metadata: e.metadata,
          version: e.version,
        })),
        totalEvents: events.length,
      },
    });
  }),
);
