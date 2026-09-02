// ============================================================
// The APR expiry letter names cards that exist
//
// It opened, unconditionally, with "one or more of your business credit cards
// have 0% introductory APR periods expiring soon" — to a client, from a
// generator that had read no cards. When `expiring_cards` was absent the body
// read "Your card introductory APR period is expiring soon. Please contact
// your advisor for details.": an URGENT letter about a card nobody had looked
// up, and the last entry in KNOWN_FABRICATED.
//
// The cards come from `card_applications` now. Two things that read as absent
// but are not the same as absent:
//
//   - a card with an intro APR and NO recorded expiry date is listed in its own
//     section rather than dropped, because "we do not know when this ends" is
//     the thing the client most needs to hear;
//   - a balance is shown only where a statement carrying that card was
//     imported. `card_applications` has no balance column, so no balance is
//     not zero owed, and the letter says so.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const TENANT = 'tenant-1';

const applicationFindMany = vi.fn();
const statementFindMany = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({ $on: vi.fn() })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

vi.mock('@backend/config/database.js', () => ({
  prisma: {
    cardApplication: { findMany: applicationFindMany },
    statementRecord: { findMany: statementFindMany },
    consentRecord: { findMany: vi.fn().mockResolvedValue([]) },
    business: { findFirst: vi.fn() },
    $on: vi.fn(),
  },
}));

vi.mock('@backend/middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { documentGenRouter } = await import('@backend/api/routes/document-gen.routes.js');

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: TENANT, userId: 'u-1', role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api', documentGenRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  applicationFindMany.mockResolvedValue([
    {
      id: 'app-1',
      issuer: 'Chase',
      cardProduct: 'Ink Business Preferred',
      introAprExpiry: in30Days,
      regularApr: 24.99,
    },
  ]);
  statementFindMany.mockResolvedValue([]);
});

interface Body {
  data?: { text: string };
  error?: { code: string; message: string };
}

async function letter(context: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/documents/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_type: 'apr_expiry_warning_letter', context }),
  });
  const body = (await res.json()) as Body;
  return { status: res.status, text: body.data?.text ?? '', error: body.error };
}

describe('the cards in the letter', () => {
  it('are read from the applications on file', async () => {
    const { status, text } = await letter({ business_id: 'biz-1', client_name: 'Acme' });

    expect(status).toBe(200);
    expect(text).toMatch(/Ink Business Preferred \(Chase\)/);
    expect(text).toMatch(/30 days/);
    expect(text).toMatch(/then 24\.99% APR/);
  });

  it('are scoped through the business to the calling tenant', async () => {
    await letter({ business_id: 'biz-1' });

    const [{ where }] = applicationFindMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ businessId: 'biz-1', business: { tenantId: TENANT } });
    // A cancelled card is not an expiring card.
    expect(where.cancelledAt).toBeNull();
  });

  it('cannot be supplied by the caller', async () => {
    await letter({
      business_id: 'biz-1',
      expiring_cards: [{ cardProduct: 'Invented Card', issuer: 'Nobody' }],
    });

    const { text } = await letter({
      business_id: 'biz-1',
      expiring_cards: [{ cardProduct: 'Invented Card', issuer: 'Nobody' }],
    });

    expect(text).not.toMatch(/Invented Card/);
    expect(text).toMatch(/Ink Business Preferred/);
  });
});

describe('a client with nothing expiring', () => {
  it('gets no letter at all', async () => {
    // An URGENT letter about cards that are not expiring is the document this
    // endpoint exists not to produce.
    applicationFindMany.mockResolvedValue([]);

    const { status, error } = await letter({ business_id: 'biz-1' });

    expect(status).toBe(422);
    expect(error?.code).toBe('DOCUMENT_CONTEXT_REQUIRED');
    expect(error?.message).toMatch(/no card on file/i);
  });

  it('is not asked for by a caller who names no business', async () => {
    const { status, error } = await letter({ client_name: 'Acme' });

    expect(status).toBe(422);
    expect(error?.code).toBe('BUSINESS_ID_REQUIRED');
    expect(applicationFindMany).not.toHaveBeenCalled();
  });
});

describe('what is recorded and what is not', () => {
  it('says a balance is not recorded rather than printing a figure', async () => {
    const { text } = await letter({ business_id: 'biz-1' });

    expect(text).toMatch(/balance not recorded/);
    expect(text).toMatch(/not a card with nothing owed on it/);
  });

  it('shows the balance from the statement carrying that card', async () => {
    statementFindMany.mockResolvedValue([
      {
        cardApplicationId: 'app-1',
        closingBalance: 12450.32,
        statementDate: new Date('2026-08-31'),
      },
    ]);

    const { text } = await letter({ business_id: 'biz-1' });

    expect(text).toMatch(/balance \$12,450\.32 as of 2026-08-31/);
  });

  it('lists a card whose expiry date nobody recorded, in its own section', async () => {
    applicationFindMany.mockResolvedValue([
      {
        id: 'app-2',
        issuer: 'Amex',
        cardProduct: 'Business Gold',
        introAprExpiry: null,
        regularApr: null,
      },
    ]);

    const { text } = await letter({ business_id: 'biz-1' });

    expect(text).toMatch(/introductory APR recorded with no end date/);
    expect(text).toMatch(/Business Gold \(Amex\): expiry date not recorded/);
    expect(text).toMatch(/rate after expiry not recorded/);
    // And the opening does not claim a countdown it does not have.
    expect(text).not.toMatch(/of your business credit card/);
  });

  it('counts correctly when more than one card is ending', async () => {
    applicationFindMany.mockResolvedValue([
      { id: 'a', issuer: 'Chase', cardProduct: 'Ink', introAprExpiry: in30Days, regularApr: null },
      { id: 'b', issuer: 'Amex', cardProduct: 'Gold', introAprExpiry: in30Days, regularApr: null },
    ]);

    const { text } = await letter({ business_id: 'biz-1' });

    expect(text).toMatch(/2 of your business credit cards have introductory APR period ending/);
  });
});
