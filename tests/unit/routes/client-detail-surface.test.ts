// ============================================================
// What the client surface will and will not write, and who it can email
//
//   - `PATCH /` accepted `fundingReadinessScore` — a computed assessment that
//     `restack_recommend` gates on, and whose null-vs-zero distinction three
//     separate fixes protected. A module that lets a caller set its own inputs
//     is not assessing anything.
//   - It also accepted `advisorId` and `status`: reassigning a client and
//     changing their status, riding on the same grant as reading a name.
//   - `POST /consent/request` asserted `business.owners[0]!` on a state this
//     same router calls valid — GET /owners returns [] and says so.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const TENANT = 'tenant-1';
const CLIENT = 'biz-1';

const businessFindFirst = vi.fn();
const businessUpdateMany = vi.fn();
const sendMail = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({ $on: vi.fn() })),
  Prisma: { DbNull: Symbol('DbNull'), Decimal: Number },
}));

vi.mock('@backend/config/database.js', () => ({
  prisma: {
    business: {
      findFirst: businessFindFirst,
      updateMany: businessUpdateMany,
    },
    businessOwner: { findMany: vi.fn().mockResolvedValue([]) },
    $on: vi.fn(),
  },
}));

vi.mock('@backend/services/email.service.js', () => ({
  emailService: { send: sendMail, sendMail },
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { clientDetailRouter } = await import('@backend/api/routes/client-detail.routes.js');

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: TENANT, userId: 'u-1', role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api/clients/:clientId', clientDetailRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  businessFindFirst.mockResolvedValue({ id: CLIENT, tenantId: TENANT, legalName: 'Acme', owners: [] });
  businessUpdateMany.mockResolvedValue({ count: 1 });
});

function patch(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/clients/${CLIENT}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('fields PATCH will not write', () => {
  // Asserted on the RESPONSE, not on the absence of a call. "updateMany was
  // not called with this field" passes just as well when the request failed
  // for an unrelated reason, which is the cardinality-blind shape
  // check-test-claims exists to catch.
  it('refuses fundingReadinessScore, by name', async () => {
    // restack_recommend gates on this. A caller that can set it is setting the
    // input to its own assessment.
    const res = await patch({ fundingReadinessScore: 99 });
    const body = (await res.json()) as { error?: { code: string; message: string } };

    expect(res.status).toBe(400);
    expect(body.error?.message).toContain('fundingReadinessScore');
    expect(businessUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses advisorId and status, by name', async () => {
    const res = await patch({ advisorId: 'someone-else', status: 'offboarded' });
    const body = (await res.json()) as { error?: { message: string } };

    expect(res.status).toBe(400);
    expect(body.error?.message).toContain('advisorId');
    expect(body.error?.message).toContain('status');
    expect(businessUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses the whole request rather than silently dropping the field', async () => {
    // A PATCH that writes legalName and quietly ignores fundingReadinessScore
    // reports success for a change that did not happen.
    const res = await patch({ legalName: 'New Name', fundingReadinessScore: 99 });

    expect(res.status).toBe(400);
    expect(businessUpdateMany).not.toHaveBeenCalled();
  });

  it('still writes the profile fields the edit form sends', async () => {
    const res = await patch({ legalName: 'Acme Holdings LLC', industry: 'Retail' });

    expect(res.status).toBe(200);
    const [{ data }] = businessUpdateMany.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data).toMatchObject({ legalName: 'Acme Holdings LLC', industry: 'Retail' });
  });
});

describe('a consent request for a client with no owners', () => {
  it('refuses instead of crashing', async () => {
    // `business.owners[0]!` on a state GET /owners calls valid.
    const res = await fetch(`${baseUrl}/api/clients/${CLIENT}/consent/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'email' }),
    });
    const body = (await res.json()) as { error?: { code: string } };

    expect(res.status).toBe(422);
    expect(body.error?.code).toBe('NO_OWNER_ON_FILE');
    expect(sendMail).not.toHaveBeenCalled();
  });
});
