// ============================================================
// Held cards — the form's write path, against a real database
//
// `held-cards-two-readers.test.ts` proves the two readers agree about what is
// on the record. It says nothing about how anything gets there, and until now
// nothing did: the optimizer form collected cards and sent them only on the
// run request, so a card typed in one session was invisible to the next and to
// the 5/24 panel. "One record, two readers" held for anything recorded and not
// for anything merely typed.
//
// These assertions cover the route that closes that gap. Every one re-reads
// the row from the database rather than trusting the response body — a route
// that answered 200 and wrote nothing is exactly the shape this codebase has
// shipped before.
//
// Runs against the database the CI integration job provisions.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PrismaClient } from '@prisma/client';

const SUFFIX = `hcr-${process.pid}-${Date.now()}`;
const ADVISOR = `advisor-${SUFFIX}`;

let tenantId: string;
let otherTenantId: string;
let businessId: string;
let otherTenantBusinessId: string;

// Auth is stubbed so these assertions are about the route's own behaviour.
// What is *not* stubbed is where the attestor comes from: the route reads it
// from this context, and one of the tests below proves a payload cannot
// override it.
vi.mock('../../src/backend/middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (req: any, _res: any, next: any) => {
    req.tenant = { tenantId, userId: ADVISOR, permissions: ['business:read', 'business:write'] };
    next();
  },
}));

vi.mock('../../src/backend/middleware/rbac.middleware.js', () => ({
  requirePermissions: () => (_req: any, _res: any, next: any) => next(),
}));

const prisma = new PrismaClient();
let server: Server;
let base: string;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  return { status: res.status, body: (await res.json()) as any };
}

/** What is on the rows, not what the call returned. */
async function readBack(id = businessId) {
  return prisma.heldCard.findMany({ where: { businessId: id }, orderBy: { issuer: 'asc' } });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `Held Cards Route ${SUFFIX}`, slug: `hcr-${SUFFIX}` },
  });
  tenantId = tenant.id;

  const other = await prisma.tenant.create({
    data: { name: `Other ${SUFFIX}`, slug: `hcr-other-${SUFFIX}` },
  });
  otherTenantId = other.id;

  businessId = (
    await prisma.business.create({
      data: { tenantId, legalName: `Route Co ${SUFFIX}`, entityType: 'llc' },
    })
  ).id;

  otherTenantBusinessId = (
    await prisma.business.create({
      data: { tenantId: otherTenantId, legalName: `Other Co ${SUFFIX}`, entityType: 'llc' },
    })
  ).id;

  const { heldCardsRouter } = await import('../../src/backend/api/routes/held-cards.routes.js');
  const app = express();
  app.use(express.json());
  app.use(heldCardsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await prisma.heldCard.deleteMany({ where: { businessId: { in: [businessId, otherTenantBusinessId] } } });
  await prisma.business.deleteMany({ where: { id: { in: [businessId, otherTenantBusinessId] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('what the form saves is what the record holds', () => {
  it('starts empty', async () => {
    const { status, body } = await api(`/clients/${businessId}/held-cards`);
    expect(status).toBe(200);
    expect(body.data.cards).toHaveLength(0);
  });

  it('writes the rows, not just a 200', async () => {
    const { status, body } = await api(`/clients/${businessId}/held-cards`, {
      method: 'POST',
      body: JSON.stringify({
        cards: [
          {
            issuer: 'Chase',
            productName: 'Ink Business Preferred',
            openedAt: '2025-03-01T00:00:00.000Z',
            creditLimit: 25000,
          },
          { issuer: 'Amex', productName: 'Business Gold', openedAt: null },
        ],
      }),
    });

    expect(status).toBe(200);
    expect(body.data.written).toBe(2);

    // The assertion that matters.
    const rows = await readBack();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.issuer)).toEqual(['Amex', 'Chase']);
    expect(rows.find((r) => r.issuer === 'Chase')!.creditLimit?.toString()).toBe('25000');
  });

  it('keeps an undated card as undated rather than inventing a date', async () => {
    // The gap the form leaves open on purpose: a client often knows they hold
    // a card without recalling the month. Substituting today's date here would
    // count it against 5/24 as confidently as a real one.
    const amex = (await readBack()).find((r) => r.issuer === 'Amex')!;
    expect(amex.openedAt).toBeNull();
  });

  it('attributes the attestation to the session, not the payload', async () => {
    await api(`/clients/${businessId}/held-cards`, {
      method: 'POST',
      body: JSON.stringify({
        cards: [
          {
            issuer: 'Chase',
            productName: 'Ink Business Cash',
            // A caller naming its own attestor. An attestation that names
            // whoever the request says it names is not an attestation.
            attestedBy: 'somebody-else',
          },
        ],
      }),
    });

    const rows = await readBack();
    expect(rows.every((r) => r.attestedBy === ADVISOR)).toBe(true);
    expect(rows.every((r) => r.source === 'advisor_attested')).toBe(true);
  });

  it('replaces rather than accumulates, so a removed card is removed', async () => {
    // The direction that does not exist without `replace`. An add-only save is
    // the enable-without-disable shape found three times in this codebase; a
    // client who closed a card would keep counting it against 5/24 forever.
    const rows = await readBack();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.productName).toBe('Ink Business Cash');
  });

  it('saving an empty list clears the record', async () => {
    const { status } = await api(`/clients/${businessId}/held-cards`, {
      method: 'POST',
      body: JSON.stringify({ cards: [] }),
    });
    expect(status).toBe(200);
    expect(await readBack()).toHaveLength(0);
  });
});

describe('what this endpoint returns can be sent straight back to it', () => {
  // The optimizer reads this list, keeps the cards its own catalogue cannot
  // show, and posts them back untouched on save — deliberately, because the
  // save replaces the record and dropping them would delete cards on behalf
  // of an advisor who was never shown them.
  //
  // That round trip was broken from the day it was written. `creditLimit` is
  // a Prisma Decimal, so the GET returned "25000" as a string while the POST
  // schema wants a number; the save 400'd with "Invalid held-card list" for
  // any client holding an unrepresented card with a limit on it.
  //
  // Nothing caught it because `held_cards` was empty in every tenant. With no
  // rows nothing is ever unrepresented, the branch never ran, and the tests
  // above only ever posted numbers they had written themselves — never the
  // strings this endpoint hands out. The first seeded rows hit it at once.
  //
  // Asserted as a round trip rather than as a type, so it still fails if the
  // two sides drift apart again for some other reason.
  it('round-trips its own GET payload through POST', async () => {
    await api(`/clients/${businessId}/held-cards`, {
      method: 'POST',
      body: JSON.stringify({
        cards: [
          {
            issuer: 'Chase',
            productName: 'Ink Business Cash',
            openedAt: '2025-01-09T00:00:00.000Z',
            creditLimit: 25000,
          },
        ],
      }),
    });

    const read = await api(`/clients/${businessId}/held-cards`);
    expect(read.status).toBe(200);

    const asReturned = read.body.data.cards as Array<Record<string, unknown>>;
    expect(asReturned).toHaveLength(1);

    // A numeric column must not leave the API as a string.
    expect(typeof asReturned[0]!['creditLimit']).toBe('number');

    const replay = await api(`/clients/${businessId}/held-cards`, {
      method: 'POST',
      body: JSON.stringify({
        cards: asReturned.map((c) => ({
          issuer: c['issuer'],
          productName: c['productName'] ?? undefined,
          openedAt: c['openedAt'] ?? null,
          creditLimit: c['creditLimit'] ?? null,
        })),
        replace: true,
      }),
    });

    expect(replay.status, 'the GET payload must be valid input to the POST').toBe(200);
    expect(replay.body.data.written).toBe(1);

    const rows = await readBack();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.creditLimit?.toString()).toBe('25000');
  });
});

describe('refusals', () => {
  it('rejects a malformed card without touching the record', async () => {
    await api(`/clients/${businessId}/held-cards`, {
      method: 'POST',
      body: JSON.stringify({ cards: [{ issuer: 'Chase' }] }),
    });
    const before = await readBack();

    const { status } = await api(`/clients/${businessId}/held-cards`, {
      method: 'POST',
      body: JSON.stringify({ cards: [{ issuer: '' }] }),
    });

    expect(status).toBe(400);
    // A rejected save must not have deleted what was there: the delete and the
    // insert are one transaction, and validation happens before either.
    expect(await readBack()).toHaveLength(before.length);
  });

  it('will not read or write another tenant’s client', async () => {
    expect((await api(`/clients/${otherTenantBusinessId}/held-cards`)).status).toBe(404);

    const { status } = await api(`/clients/${otherTenantBusinessId}/held-cards`, {
      method: 'POST',
      body: JSON.stringify({ cards: [{ issuer: 'Chase' }] }),
    });
    expect(status).toBe(404);
    expect(await readBack(otherTenantBusinessId)).toHaveLength(0);
  });

  it('answers 404 for a card that is not on this client’s record', async () => {
    const { status } = await api(`/clients/${businessId}/held-cards/not-a-real-id`, {
      method: 'DELETE',
    });
    expect(status).toBe(404);
  });
});
