// ============================================================
// GET /issuers/:id/eligibility — a missing issuer is typed, not string-matched
//
// The catch used to read:
//
//   if (err instanceof Error && err.message.includes('not found')) 404
//
// against a bare `new Error('Issuer not found: ...')`. Any other failure whose
// message happened to contain those two words — a Prisma "Record to update not
// found", a fetch "host not found" — became a 404 saying the issuer does not
// exist, to somebody deciding where to place a client. The same hazard was
// removed from the dossier route; this is the other copy.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const issuerFindUnique = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({ $on: vi.fn() })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

vi.mock('@backend/config/database.js', () => ({
  prisma: {
    issuer: { findUnique: issuerFindUnique },
    cardApplication: { findMany: vi.fn().mockResolvedValue([]) },
    $on: vi.fn(),
  },
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { issuerRulesRouter } = await import('@backend/api/routes/issuer-rules.routes.js');

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: 'tenant-1', userId: 'u-1', role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api', issuerRulesRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => vi.clearAllMocks());

describe('an issuer that does not exist', () => {
  it('is a 404', async () => {
    issuerFindUnique.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/api/issuers/nope/eligibility`);
    expect(res.status).toBe(404);
  });
});

describe('a genuine failure whose message happens to say "not found"', () => {
  it('is a 500, not a 404 claiming the issuer does not exist', async () => {
    // The failure this route could not tell apart. The issuer exists; the
    // query for it broke. Reporting that as "no such issuer" sends an advisor
    // to look for a data-entry mistake that was never made, and reads as a
    // settled fact about the issuer rather than an outage.
    issuerFindUnique.mockRejectedValue(
      new Error('Record to update not found: connection terminated'),
    );

    const res = await fetch(`${baseUrl}/api/issuers/chase/eligibility`);
    const body = (await res.json()) as { error?: { message?: string } };

    expect(res.status).toBe(500);
    expect(body.error?.message ?? '').not.toMatch(/Issuer not found/);
  });
});
