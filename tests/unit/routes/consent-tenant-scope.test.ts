// ============================================================
// /api/businesses/:id/consent — the business has to be this tenant's
//
// tenantId came from the verified JWT, which is correct, and businessId came
// from the URL, which was never checked against it. `ConsentRecord.businessId`
// is a real foreign key to Business — global, not tenant-scoped — so a caller
// could record consent under its own tenantId against another tenant's
// business and Prisma would accept the row.
//
// The read paths were never exposed the same way: getConsentStatuses and
// exportAudit filter on tenantId AND businessId, so a cross-tenant read comes
// back empty. It was the write that had nothing holding the two together, and a
// consent record is the one row in this system whose whole job is to say a
// specific person agreed to something.
//
// The second failure in the same place: an unknown businessId reached the FK
// and came back as 500 INTERNAL_ERROR "Failed to record consent grant" — the
// same response a database outage produces. A caller could not tell a typo from
// an outage, and neither could a log.
//
// The service-level suite has a `tenant isolation` describe, and it cannot
// cover any of this: ConsentService takes tenantId as a parameter, so it is
// scoped by construction. The hole was one layer up.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const OWN = 'tenant-own';
const OTHER = 'tenant-other';
const OWN_BUSINESS = 'biz-own-001';
const OTHER_BUSINESS = 'biz-other-001';

const BUSINESSES = [
  { id: OWN_BUSINESS, tenantId: OWN },
  { id: OTHER_BUSINESS, tenantId: OTHER },
];

const businessFindFirst = vi.fn();
const consentCreate = vi.fn();
const consentFindMany = vi.fn();
const consentUpdate = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    business: { findFirst: businessFindFirst },
    consentRecord: {
      create: consentCreate,
      findMany: consentFindMany,
      update: consentUpdate,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    $on: vi.fn(),
  })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

// The router applies the real tenant middleware, which authenticates from
// headers and answers 401 before a handler runs. What is under test is the
// scoping applied to an already-authenticated caller.
vi.mock('@backend/middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let server: Server;
let baseUrl: string;
let caller: { tenantId: string; userId: string };

beforeAll(async () => {
  const express = (await import('express')).default;
  const consentRouter = (await import('@backend/api/routes/consent.routes.js'))
    .default as unknown as import('express').Router;

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = caller;
    next();
  });
  app.use('/api/businesses/:id/consent', consentRouter);

  server = app.listen(0);
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  caller = { tenantId: OWN, userId: 'user-1' };

  // The ownership predicate: a business is found only when BOTH the id and the
  // tenantId match, which is exactly what the production query asks for.
  businessFindFirst.mockImplementation(
    ({ where }: { where: { id: string; tenantId: string } }) =>
      Promise.resolve(
        BUSINESSES.find((b) => b.id === where.id && b.tenantId === where.tenantId) ?? null,
      ),
  );
  consentCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'record-1',
      grantedAt: new Date(),
      revokedAt: null,
      revocationReason: null,
      ...data,
    }),
  );
  consentFindMany.mockResolvedValue([]);
});

interface Body {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

function grant(businessId: string) {
  return fetch(`${baseUrl}/api/businesses/${businessId}/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'sms', consentType: 'tcpa' }),
  });
}

describe('POST /api/businesses/:id/consent', () => {
  it("records consent for the caller's own business", async () => {
    const res = await grant(OWN_BUSINESS);

    expect(res.status).toBe(201);
    expect(consentCreate).toHaveBeenCalledTimes(1);
  });

  it("refuses a business belonging to another tenant, and writes nothing", async () => {
    const res = await grant(OTHER_BUSINESS);
    const body = (await res.json()) as Body;

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe('NOT_FOUND');
    // The assertion that matters. A 404 with a row already written would be a
    // refusal in the response and a consent record in the ledger.
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it('answers 404 for a business that does not exist, not 500', async () => {
    const res = await grant('biz-does-not-exist');
    const body = (await res.json()) as Body;

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe('NOT_FOUND');
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it('does not distinguish "not yours" from "does not exist"', async () => {
    // Different answers here would tell an unauthorised caller which business
    // IDs are real.
    const other = (await (await grant(OTHER_BUSINESS)).json()) as Body;
    const missing = (await (await grant('biz-does-not-exist')).json()) as Body;

    expect(other.error?.code).toBe(missing.error?.code);
  });
});

describe('DELETE /api/businesses/:id/consent/:channel', () => {
  function revoke(businessId: string) {
    return fetch(`${baseUrl}/api/businesses/${businessId}/consent/sms`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revocationReason: 'client request' }),
    });
  }

  it("revokes on the caller's own business", async () => {
    const res = await revoke(OWN_BUSINESS);
    expect(res.status).toBe(200);
  });

  it("refuses another tenant's business rather than reporting revokedCount 0", async () => {
    // Before the ownership check this answered 200 {revokedCount: 0}, because
    // revokeConsent filters on tenantId and simply matched nothing. Success with
    // a zero count is indistinguishable from "already revoked", so a caller
    // pointed at the wrong business had no way to find out.
    const res = await revoke(OTHER_BUSINESS);
    const body = (await res.json()) as Body;

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe('NOT_FOUND');
    expect(consentFindMany).not.toHaveBeenCalled();
  });
});
