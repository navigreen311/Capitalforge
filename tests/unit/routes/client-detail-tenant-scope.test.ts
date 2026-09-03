// ============================================================
// /clients/:clientId/* — the client has to be this tenant's
//
// Seventeen handlers hang off this router. Each called `getTenantId(req)` and
// then filtered on `businessId` alone, so a valid token plus another tenant's
// business id returned that business's beneficial owners — names, ownership
// percentages, dates of birth, addresses — its ACH authorisation, and both
// credit profiles.
//
// Five siblings in the same file DID carry `tenantId` in the same query, so the
// idiom was known and applied unevenly. That is the failure mode a per-handler
// fix leaves in place: correctness that depends on each handler remembering.
//
// The guard is on the router, so these assertions are about the sub-routes
// never being reached at all — not about what they would have filtered.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const OWN = 'tenant-own';
const OTHER = 'tenant-other';
const OWN_CLIENT = 'biz-own-001';
const OTHER_CLIENT = 'biz-other-001';

const BUSINESSES = [
  { id: OWN_CLIENT, tenantId: OWN },
  { id: OTHER_CLIENT, tenantId: OTHER },
];

const businessFindFirst = vi.fn();
const ownerFindMany = vi.fn();
const creditFindFirst = vi.fn();
const ledgerFindMany = vi.fn();
const achFindFirst = vi.fn();

// The router requires business:read as of 2026-09-02. This test is about the
// tenancy boundary, not the permission gate, so the gate is stubbed open —
// otherwise a permission failure would masquerade as a scoping pass.
vi.mock('@backend/middleware/rbac.middleware.js', () => ({
  requirePermissions: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    business: { findFirst: businessFindFirst },
    businessOwner: { findMany: ownerFindMany },
    creditProfile: { findFirst: creditFindFirst, findMany: vi.fn().mockResolvedValue([]) },
    ledgerEvent: { findMany: ledgerFindMany },
    achAuthorization: { findFirst: achFindFirst },
    productAcknowledgment: { findMany: vi.fn().mockResolvedValue([]) },
    $on: vi.fn(),
  })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

let server: Server;
let baseUrl: string;
let caller: { tenantId: string; userId: string } | undefined;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { clientDetailRouter } = await import('@backend/api/routes/client-detail.routes.js');
  const { requireOwnedBusiness } = await import(
    '@backend/middleware/business-ownership.middleware.js'
  );

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = caller;
    next();
  });
  // Composed the way api/routes/index.ts composes it: the guard is on the
  // mount, not inside the router, so the test has to mount it the same way or
  // it is asserting against a shape that does not ship.
  app.use('/api/clients/:clientId', requireOwnedBusiness('clientId'));
  app.use('/api/clients/:clientId', clientDetailRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  caller = { tenantId: OWN, userId: 'user-1' };
  businessFindFirst.mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
    Promise.resolve(
      BUSINESSES.find((b) => b.id === where.id && b.tenantId === where.tenantId) ?? null,
    ),
  );
  ownerFindMany.mockResolvedValue([{ id: 'own-1', firstName: 'Jane', ssnEncrypted: 'x' }]);
  creditFindFirst.mockResolvedValue({ id: 'cp-1', score: 762 });
  ledgerFindMany.mockResolvedValue([{ id: 'ev-1', payload: {} }]);
  achFindFirst.mockResolvedValue({ id: 'ach-1' });
});

/** The sub-routes that were reading on businessId alone. */
const EXPOSED = ['owners', 'ach-authorization', 'credit/business', 'credit/personal', 'timeline'];

describe("GET /clients/:clientId/* for another tenant's client", () => {
  for (const path of EXPOSED) {
    it(`refuses /${path} and never queries for it`, async () => {
      const res = await fetch(`${baseUrl}/api/clients/${OTHER_CLIENT}/${path}`);
      const body = (await res.json()) as { error?: { code: string } };

      expect(res.status).toBe(404);
      expect(body.error?.code).toBe('NOT_FOUND');

      // The point of a router guard: the handler is never entered, so the
      // sensitive read is not merely filtered — it does not happen.
      expect(ownerFindMany).not.toHaveBeenCalled();
      expect(creditFindFirst).not.toHaveBeenCalled();
      expect(ledgerFindMany).not.toHaveBeenCalled();
      expect(achFindFirst).not.toHaveBeenCalled();
    });
  }

  it('answers the same for a client that does not exist', async () => {
    const mine = await fetch(`${baseUrl}/api/clients/${OTHER_CLIENT}/owners`);
    const missing = await fetch(`${baseUrl}/api/clients/no-such-client/owners`);

    expect(mine.status).toBe(missing.status);
    expect(((await mine.json()) as { error?: { code: string } }).error?.code).toBe(
      ((await missing.json()) as { error?: { code: string } }).error?.code,
    );
  });
});

describe("GET /clients/:clientId/* for the caller's own client", () => {
  it('still reaches the handler', async () => {
    const res = await fetch(`${baseUrl}/api/clients/${OWN_CLIENT}/owners`);

    expect(res.status).toBe(200);
    expect(ownerFindMany).toHaveBeenCalledTimes(1);
  });

  it('refuses when there is no tenant context at all', async () => {
    caller = undefined;
    const res = await fetch(`${baseUrl}/api/clients/${OWN_CLIENT}/owners`);

    expect(res.status).toBe(401);
    expect(ownerFindMany).not.toHaveBeenCalled();
  });
});
