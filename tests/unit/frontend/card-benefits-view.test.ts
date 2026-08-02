// ============================================================
// card-benefits-view — a benefit with no value is not worth nothing
//
// Both the page and the endpoint behind it were mock: three named cards and
// twelve benefits returned for any client, summarised as "$2,450 estimated
// unused". card_benefits is a real table, and what it holds is uneven —
// benefits with no value recorded, and benefits with no expiry.
//
// The page totals these into "unused value", so the distinction between a
// null and a zero is the whole point of this mapper.
// ============================================================

import { describe, it, expect } from 'vitest';
import { toCardBenefitsView, EMPTY_VIEW } from '../../../src/frontend/lib/card-benefits-view';

/** Shaped as GET /api/card-benefits/:clientId returns it. */
const RESPONSE = {
  success: true,
  data: {
    clientId: 'biz-1',
    summary: {
      totalBenefits: 3,
      utilized: 1,
      expiringSoon: 1,
      estimatedUnusedValue: 300,
      valuedBenefits: 2,
    },
    expiring: [
      {
        benefitId: 'b-1',
        name: 'Travel Credit',
        type: 'travel_credit',
        value: 300,
        expiresAt: '2026-09-01T00:00:00.000Z',
        utilized: false,
        utilizedDate: null,
        daysRemaining: 30,
      },
    ],
    cards: [
      {
        cardId: 'card-1',
        issuer: 'Chase',
        product: 'Ink Business Preferred',
        status: 'approved',
        annualFee: 95,
        benefits: [
          {
            benefitId: 'b-1',
            name: 'Travel Credit',
            type: 'travel_credit',
            value: 300,
            expiresAt: '2026-09-01T00:00:00.000Z',
            utilized: false,
            utilizedDate: null,
          },
          {
            benefitId: 'b-2',
            name: 'Global Entry Reimbursement',
            type: 'fee_credit',
            value: 100,
            expiresAt: '2026-09-30T00:00:00.000Z',
            utilized: true,
            utilizedDate: '2026-04-14T00:00:00.000Z',
          },
          {
            benefitId: 'b-3',
            name: 'Cell Phone Protection',
            type: 'insurance',
            value: null,
            expiresAt: null,
            utilized: false,
            utilizedDate: null,
          },
        ],
      },
    ],
  },
};

describe('toCardBenefitsView', () => {
  it('maps cards and their benefits', () => {
    const view = toCardBenefitsView(RESPONSE);
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0]?.benefits).toHaveLength(3);
    expect(view.cards[0]?.annualFee).toBe(95);
    expect(view.loaded).toBe(true);
  });

  it('keeps a benefit with no recorded value as null', () => {
    const view = toCardBenefitsView(RESPONSE);
    const protection = view.cards[0]?.benefits.find((b) => b.benefitId === 'b-3');
    // The page prints "not recorded" for this. As 0 it would read as a
    // benefit worth nothing, and would silently join the unused-value total.
    expect(protection?.value).toBeNull();
    expect(protection?.expiresAt).toBeNull();
  });

  it('carries the unused-value total and how much of the set it covers', () => {
    const view = toCardBenefitsView(RESPONSE);
    expect(view.summary.estimatedUnusedValue).toBe(300);
    // 2 of 3 benefits carry a value, so the money figure is partial and the
    // page says so rather than implying it covers everything.
    expect(view.summary.valuedBenefits).toBe(2);
    expect(view.summary.totalBenefits).toBe(3);
  });

  it('leaves the unused value null when nothing unused carries one', () => {
    const view = toCardBenefitsView({
      data: {
        summary: { totalBenefits: 1, utilized: 0, expiringSoon: 0, estimatedUnusedValue: null, valuedBenefits: 0 },
        expiring: [],
        cards: [
          {
            cardId: 'c',
            issuer: 'Chase',
            product: 'Ink',
            status: 'approved',
            annualFee: null,
            benefits: [
              { benefitId: 'b', name: 'Protection', type: 'insurance', value: null, expiresAt: null, utilized: false, utilizedDate: null },
            ],
          },
        ],
      },
    });
    // Not 0 — that states the client is leaving nothing on the table.
    expect(view.summary.estimatedUnusedValue).toBeNull();
  });

  it('is not loaded when nothing has been read', () => {
    // loaded distinguishes "no cards" from "no answer yet", which the page
    // needs before it prints any figure at all.
    expect(toCardBenefitsView(undefined)).toEqual(EMPTY_VIEW);
    expect(toCardBenefitsView({})).toEqual(EMPTY_VIEW);
    expect(toCardBenefitsView(null).loaded).toBe(false);
  });

  it('is loaded, and empty, for a client with no cards', () => {
    const view = toCardBenefitsView({ data: { cards: [], expiring: [], summary: {} } });
    expect(view.loaded).toBe(true);
    expect(view.cards).toEqual([]);
  });

  it('drops a card or benefit with no id rather than inventing one', () => {
    const view = toCardBenefitsView({
      data: {
        cards: [
          { issuer: 'No Id Bank' },
          { cardId: 'c1', benefits: [{ name: 'Nameless' }, { benefitId: 'ok', name: 'Real' }] },
        ],
      },
    });
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0]?.benefits).toHaveLength(1);
  });
});
