// ============================================================
// toCardRows — joining the repayment response into card rows
//
// The /repayment response arrives as three parallel lists: the intro-APR
// schedule, the payoff waterfall, and the payment calendar. The page renders
// one row per card, so they have to be joined.
//
// The join is on cardApplicationId. Issuer is not unique — a client with two
// Chase cards has two schedules identical by issuer — so matching on it would
// attach one card's payment to the other and show a due date against a card
// that has none.
// ============================================================

import { describe, it, expect } from 'vitest';
import { toCardRows, toRepaymentView } from '../../../src/frontend/lib/repayment-view';

/** Two Chase cards and one Amex, which is what makes issuer-matching wrong. */
const RESPONSE = {
  hasPlan: true,
  strategy: 'avalanche',
  totalBalance: 38500,
  totalMonthlyObligations: 2400,
  autopayPct: 67,
  cardsAtRisk: 1,
  nextPayment: null,
  paymentCalendar: [
    {
      id: 'sched-1',
      date: '2026-08-15T00:00:00.000Z',
      issuer: 'Chase',
      cardApplicationId: 'app-chase-a',
      cardProduct: 'Ink Business Preferred',
      amount: 450,
      recommendedPayment: 1400,
      status: 'upcoming',
      autopayEnabled: true,
    },
    {
      id: 'sched-2',
      date: '2026-08-22T00:00:00.000Z',
      issuer: 'American Express',
      cardApplicationId: 'app-amex',
      cardProduct: 'Blue Business Cash',
      amount: 310,
      recommendedPayment: 1000,
      status: 'upcoming',
      autopayEnabled: false,
    },
    {
      // A later payment for a card that already has an earlier one.
      id: 'sched-3',
      date: '2026-09-15T00:00:00.000Z',
      issuer: 'Chase',
      cardApplicationId: 'app-chase-a',
      cardProduct: 'Ink Business Preferred',
      amount: 450,
      recommendedPayment: 1400,
      status: 'upcoming',
      autopayEnabled: true,
    },
  ],
  aprExpirySchedule: [
    {
      applicationId: 'app-chase-a',
      issuer: 'Chase',
      cardProduct: 'Ink Business Preferred',
      expiryDate: '2026-10-12T00:00:00.000Z',
      daysRemaining: 73,
      currentApr: 0,
      postExpiryApr: 0.2124,
      creditLimit: 45000,
    },
    {
      applicationId: 'app-chase-b',
      issuer: 'Chase',
      cardProduct: 'Ink Business Cash',
      expiryDate: '2026-08-20T00:00:00.000Z',
      daysRemaining: 20,
      currentApr: 0,
      postExpiryApr: 0.1999,
      creditLimit: 20000,
    },
    {
      applicationId: 'app-amex',
      issuer: 'American Express',
      cardProduct: 'Blue Business Cash',
      expiryDate: '2026-10-12T00:00:00.000Z',
      daysRemaining: 73,
      currentApr: 0,
      postExpiryApr: 0.1849,
      creditLimit: 35000,
    },
  ],
  payoffWaterfall: [
    { applicationId: 'app-chase-b', issuer: 'Chase', cardProduct: 'Ink Business Cash', creditLimit: 20000, priority: 1, reason: 'Intro APR lapses in 20 days' },
    { applicationId: 'app-chase-a', issuer: 'Chase', cardProduct: 'Ink Business Preferred', creditLimit: 45000, priority: 2, reason: 'Intro APR lapses in 73 days' },
    { applicationId: 'app-amex', issuer: 'American Express', cardProduct: 'Blue Business Cash', creditLimit: 35000, priority: 3, reason: 'Intro APR lapses in 73 days' },
  ],
};

const rowsFor = (response: unknown) => toCardRows(toRepaymentView(response));

describe('toCardRows — joining payments to cards', () => {
  it('returns one row per card on the APR schedule', () => {
    expect(rowsFor(RESPONSE).map((r) => r.applicationId)).toEqual([
      'app-chase-b',
      'app-chase-a',
      'app-amex',
    ]);
  });

  it('orders by payoff priority, not by the order cards arrived', () => {
    expect(rowsFor(RESPONSE).map((r) => r.priority)).toEqual([1, 2, 3]);
  });

  it('attaches each payment to its own card, not to the issuer', () => {
    const rows = rowsFor(RESPONSE);
    const chaseA = rows.find((r) => r.applicationId === 'app-chase-a');
    const chaseB = rows.find((r) => r.applicationId === 'app-chase-b');

    expect(chaseA?.nextPayment?.id).toBe('sched-1');
    // The other Chase card has no schedule. Matching on issuer would have
    // handed it sched-1 and shown a payment it does not have.
    expect(chaseB?.nextPayment).toBeNull();
  });

  it('takes the soonest payment when a card has several', () => {
    const chaseA = rowsFor(RESPONSE).find((r) => r.applicationId === 'app-chase-a');
    expect(chaseA?.nextPayment?.id).toBe('sched-1');
    expect(chaseA?.nextPayment?.date).toBe('2026-08-15T00:00:00.000Z');
  });

  it('carries the card figures through unchanged', () => {
    const amex = rowsFor(RESPONSE).find((r) => r.applicationId === 'app-amex');
    expect(amex).toMatchObject({
      issuer: 'American Express',
      cardProduct: 'Blue Business Cash',
      creditLimit: 35000,
      introApr: 0,
      postExpiryApr: 0.1849,
      daysRemaining: 73,
    });
  });

  it('grades urgency by days remaining: <=14 critical, <=60 warning, else ok', () => {
    const rows = rowsFor(RESPONSE);
    // 20 days out — pressing, but not yet critical.
    expect(rows.find((r) => r.applicationId === 'app-chase-b')?.severity).toBe('warning');
    // 73 days out.
    expect(rows.find((r) => r.applicationId === 'app-amex')?.severity).toBe('ok');
  });

  it('marks a card at the 14-day boundary critical', () => {
    const rows = rowsFor({
      ...RESPONSE,
      aprExpirySchedule: [{ ...RESPONSE.aprExpirySchedule[1], daysRemaining: 14 }],
    });
    expect(rows[0].severity).toBe('critical');
  });

  it('treats an already-lapsed card as critical rather than wrapping to ok', () => {
    const rows = rowsFor({
      ...RESPONSE,
      aprExpirySchedule: [{ ...RESPONSE.aprExpirySchedule[1], daysRemaining: -5 }],
    });
    expect(rows[0].severity).toBe('critical');
  });

  it('never reports a balance, since none is supplied', () => {
    // Guards the reason the balance columns were dropped: if a balance field
    // reappears here it will be a fabricated one until an issuer feed exists.
    for (const row of rowsFor(RESPONSE)) {
      expect(row).not.toHaveProperty('balance');
      expect(row).not.toHaveProperty('utilization');
      expect(row).not.toHaveProperty('payoffMonths');
    }
  });
});

describe('toCardRows — partial and empty responses', () => {
  it('returns an empty list when no cards carry an intro APR', () => {
    expect(rowsFor({ ...RESPONSE, aprExpirySchedule: [] })).toEqual([]);
  });

  it('keeps a card absent from the waterfall, sorted last', () => {
    const rows = rowsFor({
      ...RESPONSE,
      payoffWaterfall: RESPONSE.payoffWaterfall.filter((p) => p.applicationId !== 'app-amex'),
    });

    // Null priority must not sort first, which is what an unguarded null does.
    expect(rows[rows.length - 1].applicationId).toBe('app-amex');
    expect(rows[rows.length - 1].priority).toBeNull();
  });

  it('leaves nextPayment null when a schedule carries no card link', () => {
    const rows = rowsFor({
      ...RESPONSE,
      paymentCalendar: RESPONSE.paymentCalendar.map((p) => ({ ...p, cardApplicationId: null })),
    });

    expect(rows.every((r) => r.nextPayment === null)).toBe(true);
  });

  it('leaves nextPayment null when the payment points at an unknown card', () => {
    const rows = rowsFor({
      ...RESPONSE,
      paymentCalendar: [{ ...RESPONSE.paymentCalendar[0], cardApplicationId: 'app-not-here' }],
    });

    expect(rows.every((r) => r.nextPayment === null)).toBe(true);
  });

  it('survives a response with nothing in it', () => {
    expect(rowsFor({})).toEqual([]);
  });
});
