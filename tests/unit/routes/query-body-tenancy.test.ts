// ============================================================
// A business id is a business id wherever it arrives
//
// `requireOwnedBusiness` verifies `req.params`. check-route-tenancy read path
// parameters. Both covered the shape we happened to look at first, and three
// handlers took a business id another way:
//
//   GET  /credit-unions/:slug/eligibility?businessId=X   — query
//   POST /credit-unions/:slug/membership/verify          — body
//   POST /documents/upload                               — body, written
//
// The first two ran `findUnique({ where: { id: businessId } })` with no tenant
// filter and returned the business's legal name, state of formation, revenue
// and credit score. The third wrote the id into a row beside the caller's own
// tenantId, which asserts a tenant rather than checking one.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const TENANT = 'tenant-1';

const businessFindFirst = vi.fn();
const businessFindUnique = vi.fn();
const creditUnionFindUnique = vi.fn();
const productFindMany = vi.fn();
const creditProfileFindMany = vi.fn();
const documentCreate = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({ $on: vi.fn() })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

vi.mock('@backend/config/database.js', () => ({
  prisma: {
    business: { findFirst: businessFindFirst, findUnique: businessFindUnique },
    creditUnion: { findUnique: creditUnionFindUnique },
    creditUnionProduct: { findMany: productFindMany },
    creditProfile: { findMany: creditProfileFindMany },
    document: { create: documentCreate },
    $on: vi.fn(),
  },
}));

vi.mock('@backend/middleware/auth.middleware.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('@backend/middleware/rbac.middleware.js', () => ({
  requirePermissions: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { creditUnionRouter } = await import('@backend/api/routes/credit-union.routes.js');
  const { documentRouter } = await import('@backend/api/routes/document.routes.js');

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: TENANT, userId: 'u-1', role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api/credit-unions', creditUnionRouter);
  app.use('/api', documentRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  creditUnionFindUnique.mockResolvedValue({
    id: 'cu-1',
    name: 'Lake Michigan',
    slug: 'lake-michigan',
    membershipCriteria: '',
    openMembership: true,
  });
  productFindMany.mockResolvedValue([]);
  creditProfileFindMany.mockResolvedValue([]);
  documentCreate.mockResolvedValue({ id: 'doc-1', title: 'x.pdf' });
});

describe('GET /credit-unions/:slug/eligibility?businessId=', () => {
  it('reads the business within the calling tenant', async () => {
    businessFindFirst.mockResolvedValue(null);

    const res = await fetch(
      `${baseUrl}/api/credit-unions/lake-michigan/eligibility?businessId=other-tenant-biz`,
    );

    expect(res.status).toBe(404);
    const [{ where }] = businessFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ id: 'other-tenant-biz', tenantId: TENANT });
    // The unscoped lookup is gone, not merely supplemented.
    expect(businessFindUnique).not.toHaveBeenCalled();
  });

  it('does not leak the business name, revenue or score of another tenant', async () => {
    businessFindFirst.mockResolvedValue(null);

    const res = await fetch(
      `${baseUrl}/api/credit-unions/lake-michigan/eligibility?businessId=other-tenant-biz`,
    );
    const text = await res.text();

    expect(res.status).toBe(404);
    expect(text).not.toMatch(/annualRevenue|creditScore|legalName/);
    expect(creditProfileFindMany).not.toHaveBeenCalled();
  });

  it('still answers product requirements when no business is named', async () => {
    // The businessId is optional here, and that path reads nothing per-business.
    const res = await fetch(`${baseUrl}/api/credit-unions/lake-michigan/eligibility`);

    expect(res.status).toBe(200);
    expect(businessFindFirst).not.toHaveBeenCalled();
  });
});

describe('POST /credit-unions/:slug/membership/verify', () => {
  it('reads the business within the calling tenant', async () => {
    businessFindFirst.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/api/credit-unions/lake-michigan/membership/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: 'other-tenant-biz' }),
    });
    const text = await res.text();

    expect(res.status).toBe(404);
    const [{ where }] = businessFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ id: 'other-tenant-biz', tenantId: TENANT });
    // The legal name used to come back inside joinInstructions.message.
    expect(text).not.toMatch(/joinInstructions/);
  });
});

describe('POST /documents/upload', () => {
  it('refuses a businessId that is not in this tenant', async () => {
    // Naming tenantId in the same `data` asserts a tenant; it does not check
    // that the business belongs to it.
    businessFindFirst.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/api/documents/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'bank-statement.pdf',
        documentType: 'statement',
        businessId: 'other-tenant-biz',
      }),
    });

    expect(res.status).toBe(400);
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it('refuses rather than filing the document unattached', async () => {
    // Nulling the id silently is how a document goes missing from the vault it
    // was uploaded to: the caller named a business and meant it.
    businessFindFirst.mockResolvedValue(null);

    await fetch(`${baseUrl}/api/documents/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'x.pdf', documentType: 'statement', businessId: 'nope' }),
    });

    expect(documentCreate).not.toHaveBeenCalled();
  });

  it('files it when the business belongs to the caller', async () => {
    businessFindFirst.mockResolvedValue({ id: 'biz-1' });

    const res = await fetch(`${baseUrl}/api/documents/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'x.pdf', documentType: 'statement', businessId: 'biz-1' }),
    });

    expect(res.status).toBe(201);
    const [{ data }] = documentCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.businessId).toBe('biz-1');
  });

  it('still accepts an upload with no business named', async () => {
    const res = await fetch(`${baseUrl}/api/documents/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'x.pdf', documentType: 'statement' }),
    });

    expect(res.status).toBe(201);
    expect(businessFindFirst).not.toHaveBeenCalled();
    const [{ data }] = documentCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.businessId).toBeNull();
  });
});
