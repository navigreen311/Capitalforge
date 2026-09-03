// ============================================================
// The ownership guard, and the mount order it depends on
//
// Two halves, because the guard is only as good as where it is installed and
// almost no test reaches it: suites mount their router directly rather than
// through `apiRouter`, so a guard that stopped being wired would break nothing
// in this suite and everything in production.
//
// So the second half asserts the wiring by reading `index.ts` as text, the way
// a registration-parity check does. It cannot be fooled by a router that
// happens to be scoped internally.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const businessFindFirst = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    business: { findFirst: businessFindFirst },
    $on: vi.fn(),
  })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

// Static import: vi.mock above is hoisted, so the mocked client is in place
// before the module is evaluated. Top-level await would make this file an ES
// module under a CommonJS tsconfig.
import { requireOwnedBusiness } from '../../../src/backend/middleware/business-ownership.middleware.js';

function ctx(params: Record<string, string>, tenantId?: string) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn();
  const req = { params, tenant: tenantId ? { tenantId } : undefined } as never;
  return { req, res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  businessFindFirst.mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
    Promise.resolve(where.id === 'biz-1' && where.tenantId === 'ten-1' ? { id: 'biz-1' } : null),
  );
});

describe('requireOwnedBusiness', () => {
  it('passes a business that belongs to the caller', async () => {
    const { req, res, next } = ctx({ id: 'biz-1' }, 'ten-1');
    await requireOwnedBusiness('id')(req, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("refuses another tenant's business as not found", async () => {
    const { req, res, next } = ctx({ id: 'biz-1' }, 'ten-other');
    await requireOwnedBusiness('id')(req, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('answers a business that does not exist identically', async () => {
    const other = ctx({ id: 'biz-1' }, 'ten-other');
    const missing = ctx({ id: 'no-such' }, 'ten-1');
    await requireOwnedBusiness('id')(other.req, other.res as never, other.next);
    await requireOwnedBusiness('id')(missing.req, missing.res as never, missing.next);

    // Different answers here tell an unauthorised caller which ids are real.
    expect(other.res.statusCode).toBe(missing.res.statusCode);
    expect(JSON.stringify(other.res.body).replace('biz-1', 'X')).toBe(
      JSON.stringify(missing.res.body).replace('no-such', 'X'),
    );
  });

  it('refuses rather than passing through when there is no tenant context', async () => {
    const { req, res, next } = ctx({ id: 'biz-1' });
    await requireOwnedBusiness('id')(req, res as never, next);

    // Passing through would turn a misordered mount into an open route.
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('fails closed when the check itself cannot be evaluated', async () => {
    businessFindFirst.mockRejectedValue(new Error('connection reset'));
    const { req, res, next } = ctx({ id: 'biz-1' }, 'ten-1');
    await requireOwnedBusiness('id')(req, res as never, next);

    // Failing open here would serve another tenant's data on a database hiccup.
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it('reads the parameter it was told to read', async () => {
    const { req, res, next } = ctx({ clientId: 'biz-1', id: 'something-else' }, 'ten-1');
    await requireOwnedBusiness('clientId')(req, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(businessFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'biz-1', tenantId: 'ten-1' } }),
    );
  });
});

describe('the mount table wires the guard ahead of what it protects', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/backend/api/routes/index.ts'),
    'utf8',
  );

  it('installs the guard on every business-scoped prefix', () => {
    expect(source).toContain("apiRouter.use('/businesses/:id', requireOwnedBusiness('id'))");
    expect(source).toContain(
      "apiRouter.use('/clients/:clientId', requireOwnedBusiness('clientId'))",
    );
    expect(source).toContain(
      "apiRouter.use('/v1/clients/:clientId', requireOwnedBusiness('clientId'))",
    );
  });

  it('installs it BEFORE the first router mounted under those prefixes', () => {
    const guard = source.indexOf("requireOwnedBusiness('id')");
    // Express runs middleware in registration order, so a guard registered after
    // the router it protects is a guard that never runs for it.
    for (const mount of [
      "apiRouter.use('/businesses', onboardingRouter)",
      "apiRouter.use('/businesses/:id/consent', consentRouter)",
      "apiRouter.use('/businesses/:id', graduationRouter)",
      "apiRouter.use('/clients/:clientId', clientDetailRouter)",
    ]) {
      const at = source.indexOf(mount);
      expect(at, `${mount} is not mounted`).toBeGreaterThan(-1);
      expect(guard, `guard must precede ${mount}`).toBeLessThan(at);
    }
  });

  it("covers a router mounted at '/' that declares /businesses/:id in its own path", async () => {
    // The six cross-tenant reads this guard closed live in routers mounted at
    // '/', not under a business prefix — funding-round declares
    // `/businesses/:id/rounds` itself. Express matches `use` against the request
    // PATH, not against which router will serve it, so the prefix still applies.
    // Asserted rather than reasoned about: if it were false, those six reads
    // would still be open and the comment in index.ts would say otherwise.
    const express = (await import('express')).default;
    const app = express();
    app.use((req: any, _res: unknown, next: () => void) => {
      req.tenant = { tenantId: 'ten-other' };
      next();
    });
    app.use('/businesses/:id', requireOwnedBusiness('id'));

    const handler = vi.fn((_req: unknown, res: any) => res.status(200).json({ ok: true }));
    const late = express.Router();
    late.get('/businesses/:id/rounds', handler);
    app.use('/', late);

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://localhost:${port}/businesses/biz-1/rounds`);
      expect(res.status).toBe(404);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('does not gate POST /businesses, which creates the business', () => {
    // '/businesses/:id' cannot match a path with no second segment. Asserted so
    // that widening the prefix to '/businesses' later fails here rather than in
    // production, where it would make creating a client impossible.
    expect(source).not.toContain("apiRouter.use('/businesses', requireOwnedBusiness");
  });
});
