// ============================================================
// POST /statements/disputes — a dispute nothing records is refused
//
// This answered 201 with `id: "disp-<timestamp>"`, `status: 'open'` and
// `estimatedResolution: '5-10 business days'`, and pushed the dispute onto a
// module-level array. Nothing read it, nothing persisted it, it emptied on
// restart, and no `statement_disputes` table exists. It never read
// `req.tenant` either: no tenant scoping and no check that the statement was
// the caller's.
//
// Its two neighbours — anomaly dismissal and investigation steps — were
// converted to 501 for exactly this. This one survived that sweep because a
// 201 with an id in it looks like it worked.
//
// A billing-error dispute is the one record in this module with a statutory
// clock on it.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({ $on: vi.fn() })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

vi.mock('@backend/config/database.js', () => ({
  prisma: { statementRecord: { findFirst: vi.fn() }, $on: vi.fn() },
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { statementsRouter } = await import('@backend/api/routes/statements.routes.js');

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: 'tenant-1', userId: 'u-1', role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api/statements', statementsRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function fileDispute(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/statements/disputes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface Body {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}

describe('filing a statement dispute', () => {
  it('is refused, not accepted into memory', async () => {
    const res = await fileDispute({
      statementId: 'stmt-1',
      clientId: 'biz-1',
      reason: 'Charge not recognised',
      amount: 347.89,
    });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(501);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('NOT_IMPLEMENTED');
  });

  it('issues no dispute id and no resolution estimate', async () => {
    // The three fields that made a dispute nobody filed look filed. Asserted
    // on the payload, not the raw text: the refusal message quotes them as
    // history, which is the point of the message.
    const res = await fileDispute({ statementId: 'stmt-1', reason: 'x', amount: 1 });
    const body = (await res.json()) as Body;

    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body.data ?? {})).not.toMatch(/disp-/);
    expect(body.error?.message).toMatch(/used to answer 201/i);
  });

  it('says why, rather than validating the body first', async () => {
    // A 422 about a missing `amount` reads as "fix your payload and it will
    // file". Nothing will file it.
    const res = await fileDispute({});
    const body = (await res.json()) as Body;

    expect(res.status).toBe(501);
    expect(body.error?.message).toMatch(/no table records one/i);
  });
});
