// ============================================================
// One record, two readers
//
// Held cards reached the stacking optimizer only on the request payload, and
// reached the 5/24 path not at all. So the two surfaces answered from
// different data about the same client: the optimizer from what an advisor
// had typed into that run's form, the issuer-rules path from nothing — which
// is how "5 of 5 slots open" appeared beside an Inputs Used panel listing a
// held Chase card.
//
// Both read `HeldCard` now. These assert the agreement, and the thing the
// table buys that a request payload cannot: an opening date, so a card can be
// placed in the window instead of merely widening the answer to "at most N".
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createHeldCardsService,
  tallyHeldCardsForFiveTwentyFour,
} from '../../src/backend/services/held-cards.service';

const prisma = new PrismaClient();
const heldCards = createHeldCardsService(prisma);

const SUFFIX = `two-${process.pid}-${Date.now()}`;
const ADVISOR = `advisor-${SUFFIX}`;

let tenantId: string;
let businessId: string;

/** Two years back from now, as both readers compute it. */
const windowStart = () => new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `Two Readers ${SUFFIX}`, slug: `two-readers-${SUFFIX}` },
  });
  tenantId = tenant.id;

  const business = await prisma.business.create({
    data: { tenantId, legalName: `Two Readers Co ${SUFFIX}`, entityType: 'llc' },
  });
  businessId = business.id;
});

afterAll(async () => {
  await prisma.heldCard.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('a card recorded once is visible to both readers', () => {
  it('starts with nothing on record', async () => {
    expect(await heldCards.listForBusiness(businessId, tenantId)).toHaveLength(0);
  });

  it('records a dated Chase card and counts it', async () => {
    await heldCards.record({
      tenantId,
      businessId,
      issuer: 'Chase',
      productName: 'Ink Business Preferred',
      openedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      attestedBy: ADVISOR,
    });

    // The issuer-rules reader.
    const tally = await heldCards.tallyForBusiness(businessId, tenantId, windowStart());
    expect(tally.counted).toBe(1);
    expect(tally.unplaceable).toBe(0);
  });

  it('gives the optimizer the same rows the 5/24 path reads', async () => {
    // The optimizer loads `business.heldCards` and runs the same tally. Both
    // readers, one record — so the two panels cannot disagree about how many
    // cards the client holds.
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: { heldCards: true },
    });

    const optimizerView = tallyHeldCardsForFiveTwentyFour(
      business.heldCards.map((c) => ({ issuer: c.issuer, openedAt: c.openedAt })),
      windowStart(),
    );
    const issuerRulesView = await heldCards.tallyForBusiness(
      businessId,
      tenantId,
      windowStart(),
    );

    expect(optimizerView).toEqual(issuerRulesView);
  });

  it('records the attestation, because this is a claim and not a measurement', async () => {
    const [card] = await heldCards.listForBusiness(businessId, tenantId);
    expect(card!.attestedBy).toBe(ADVISOR);
    expect(card!.source).toBe('advisor_attested');
    expect(card!.attestedAt).not.toBeNull();
  });
});

describe('what the table buys that a request payload cannot', () => {
  it('an undated card is unplaceable rather than counted or dropped', async () => {
    // The form has no date field, so a card arriving only on the request can
    // never be placed. On the record it can be — and when it is not, that is
    // reported rather than smoothed over.
    await heldCards.record({
      tenantId,
      businessId,
      issuer: 'Amex',
      openedAt: null,
      attestedBy: ADVISOR,
    });

    const tally = await heldCards.tallyForBusiness(businessId, tenantId, windowStart());
    expect(tally.counted).toBe(1); // still just the Chase card
    expect(tally.unplaceable).toBe(1); // the Amex one
  });

  it('a credit-union card is excluded from both readers alike', async () => {
    await heldCards.record({
      tenantId,
      businessId,
      issuer: 'Alliant Credit Union',
      openedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      attestedBy: ADVISOR,
    });

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: { heldCards: true },
    });

    const optimizerView = tallyHeldCardsForFiveTwentyFour(
      business.heldCards.map((c) => ({ issuer: c.issuer, openedAt: c.openedAt })),
      windowStart(),
    );
    const issuerRulesView = await heldCards.tallyForBusiness(
      businessId,
      tenantId,
      windowStart(),
    );

    expect(optimizerView.creditUnionExcluded).toBe(1);
    // The agreement is the point: one exemption rule, applied once, read twice.
    expect(optimizerView).toEqual(issuerRulesView);
  });

  it('removing a card removes it for both', async () => {
    const cards = await heldCards.listForBusiness(businessId, tenantId);
    const amex = cards.find((c) => c.issuer === 'Amex')!;

    expect(await heldCards.remove(amex.id, tenantId)).toBe(true);

    const tally = await heldCards.tallyForBusiness(businessId, tenantId, windowStart());
    expect(tally.unplaceable).toBe(0);
  });

  it('will not remove a card belonging to another tenant', async () => {
    const [card] = await heldCards.listForBusiness(businessId, tenantId);
    expect(await heldCards.remove(card!.id, `not-${tenantId}`)).toBe(false);
    expect(await heldCards.listForBusiness(businessId, tenantId)).toHaveLength(2);
  });
});
