// ============================================================
// /api/admin/tenants — a tenant_admin administers one tenant, not the platform
//
// These routes took the :id straight from the URL and handed it to the
// service, and listTenants filtered on plan and isActive but never on tenant.
// requireAdminRole admits tenant_admin as well as super_admin, so an
// administrator of any one tenant could list every tenant on the platform —
// names, slugs, plans, monthly prices — and read the usage of any other by
// guessing or harvesting an id.
//
// Development seeds a single tenant, so a list that ignored scoping returned
// exactly what a scoped one would have. Nothing looked wrong.
//
// A second tenant is what makes the difference visible, so these run with two.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';

const OWN = 'tenant-own';
const OTHER = 'tenant-other';

const TENANTS = [
  { id: OWN, name: 'Demo Advisors', slug: 'demo', plan: 'growth', brandConfig: null, isActive: true, createdAt: new Date('2026-01-01') },
  { id: OTHER, name: 'Rival Capital', slug: 'rival', plan: 'enterprise', brandConfig: null, isActive: true, createdAt: new Date('2026-01-02') },
];

const findMany = vi.fn();
const count = vi.fn();
const findFirst = vi.fn();
const usageFindMany = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    tenant: { findMany, count, findFirst },
    tenantPlan: { findFirst: vi.fn().mockResolvedValue(null) },
    usageMeter: { findMany: usageFindMany },
    // The shared client attaches log listeners when it is built.
    $on: vi.fn(),
  })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

// The router mounts the real tenant middleware per route, which authenticates
// from headers and answers 401 before any handler runs. The subject here is
// the scoping the handlers apply to an already-authenticated caller, so this
// stands the middleware down and `caller` below plays the signed-in user.
vi.mock('@backend/middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('@backend/services/compliance.service.js', () => ({
  ComplianceService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@backend/services/email.service.js', () => ({
  emailService: { sendConsentRequest: vi.fn(), getMode: vi.fn() },
}));

let server: Server;
let baseUrl: string;
/** Mutated per test to stand in for whoever is signed in. */
let caller: { tenantId: string; role: string; permissions: string[] };

beforeAll(async () => {
  const express = (await import('express')).default;
  const { adminRouter } = await import('@backend/api/routes/admin.routes.js');

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = caller;
    next();
  });
  app.use('/api', adminRouter);
  // The router's own error handler is not mounted here, so surface the status
  // the handlers threw rather than letting express default everything to 500.
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode ?? err.status ?? 500).json({
      success: false,
      error: { code: err.code ?? 'ERROR', message: err.message },
    });
  });

  server = app.listen(0);
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

interface ListBody {
  success: boolean;
  data?: { tenants: { id: string }[]; total: number };
  error?: { code: string; message: string };
}

function asTenantAdmin() {
  caller = { tenantId: OWN, role: 'tenant_admin', permissions: ['admin:tenant'] };
}

function asSuperAdmin() {
  caller = { tenantId: OWN, role: 'super_admin', permissions: ['admin:tenant'] };
}

describe('GET /api/admin/tenants', () => {
  it('gives a tenant_admin only their own tenant', async () => {
    asTenantAdmin();
    // The query is what matters: the filter has to reach the database, not be
    // applied to the page afterwards, or `total` still counts the platform.
    findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(TENANTS.filter((t) => !where['id'] || t.id === where['id'])),
    );
    count.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(TENANTS.filter((t) => !where['id'] || t.id === where['id']).length),
    );
    findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(TENANTS.find((t) => t.id === where.id) ?? null),
    );

    const body = (await fetch(`${baseUrl}/api/admin/tenants`).then((r) => r.json())) as ListBody;

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: OWN } }));
    expect(body.data?.tenants.map((t) => t.id)).toEqual([OWN]);
    expect(body.data?.total, 'the count is scoped too').toBe(1);
  });

  it('gives a super_admin the platform', async () => {
    asSuperAdmin();
    findMany.mockResolvedValue(TENANTS);
    count.mockResolvedValue(TENANTS.length);
    findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(TENANTS.find((t) => t.id === where.id) ?? null),
    );

    const body = (await fetch(`${baseUrl}/api/admin/tenants`).then((r) => r.json())) as ListBody;

    // No id filter: spanning tenants is what this role is for.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(body.data?.tenants).toHaveLength(2);
  });
});

describe("reaching another tenant by id", () => {
  it('answers 404 for a tenant_admin reading another tenant usage', async () => {
    asTenantAdmin();
    usageFindMany.mockResolvedValue([{ metricName: 'api_calls', metricValue: 999 }]);

    const res = await fetch(`${baseUrl}/api/admin/tenants/${OTHER}/usage`);

    // 404 rather than 403: a refusal that distinguishes "not yours" from "not
    // there" confirms the id exists to whoever is guessing.
    expect(res.status).toBe(404);
    expect(usageFindMany, 'the query never runs').not.toHaveBeenCalled();
  });

  it('still reads its own usage', async () => {
    asTenantAdmin();
    usageFindMany.mockResolvedValue([{ metricName: 'api_calls', metricValue: 12 }]);

    const res = await fetch(`${baseUrl}/api/admin/tenants/${OWN}/usage`);

    expect(res.status).toBe(200);
    expect(usageFindMany).toHaveBeenCalled();
  });

  it('refuses a tenant_admin updating another tenant', async () => {
    asTenantAdmin();
    const res = await fetch(`${baseUrl}/api/admin/tenants/${OTHER}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed By A Stranger' }),
    });

    expect(res.status).toBe(404);
  });

  it('refuses a tenant_admin flipping another tenant feature flags', async () => {
    asTenantAdmin();
    const res = await fetch(`${baseUrl}/api/admin/tenants/${OTHER}/flags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags: { apiAccess: true } }),
    });

    expect(res.status).toBe(404);
  });

  it('lets a super_admin reach another tenant', async () => {
    asSuperAdmin();
    usageFindMany.mockResolvedValue([{ metricName: 'api_calls', metricValue: 999 }]);

    const res = await fetch(`${baseUrl}/api/admin/tenants/${OTHER}/usage`);

    expect(res.status).toBe(200);
  });
});
