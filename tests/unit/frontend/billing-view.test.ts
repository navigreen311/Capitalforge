// ============================================================
// billing-view — overdue is computed, not asserted
//
// The page listed invoices with a status written in, one of them "overdue" —
// a claim that a named client owes $9,750 and has not paid. These pin that
// overdue follows from a due date and the absence of a payment, and that a
// missing amount is not zero.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toInvoiceRow,
  toInvoiceRows,
  isOverdue,
  summarise,
  formatMoney,
} from '../../../src/frontend/lib/billing-view';

const NOW = new Date('2026-08-01T00:00:00.000Z');

/** Captured from GET /api/businesses/:id/invoices. */
const REAL_INVOICE = {
  id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d',
  businessId: 'seed-biz-001',
  invoiceNumber: 'INV-2026-0001',
  type: 'program_fee',
  amount: 4500,
  feeBreakdown: { lineItems: [] },
  status: 'issued',
  issuedAt: '2026-07-01T00:00:00.000Z',
  dueDate: '2026-07-31T00:00:00.000Z',
  paidAt: null,
  stripePaymentId: null,
};

describe('toInvoiceRow', () => {
  it('maps a real invoice', () => {
    expect(toInvoiceRow(REAL_INVOICE)).toMatchObject({
      id: '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d',
      invoiceNumber: 'INV-2026-0001',
      amount: 4500,
      status: 'issued',
    });
  });

  it('keeps a missing amount null rather than zero', () => {
    // A $0 invoice is an invoice for nothing. A missing amount is one whose
    // total was not recorded.
    const row = toInvoiceRow({ ...REAL_INVOICE, amount: null })!;
    expect(row.amount).toBeNull();
    expect(formatMoney(row.amount)).toBe('—');
  });

  it('drops an invoice with no id or number', () => {
    expect(toInvoiceRow({ invoiceNumber: 'INV-1' })).toBeNull();
    expect(toInvoiceRow({ id: 'i1' })).toBeNull();
  });

  it('reads the envelope, and junk as empty', () => {
    expect(toInvoiceRows({ data: [REAL_INVOICE] })).toHaveLength(1);
    expect(toInvoiceRows(null)).toEqual([]);
  });
});

describe('isOverdue', () => {
  const row = (over: Record<string, unknown>) => toInvoiceRow({ ...REAL_INVOICE, ...over })!;

  it('is true when the due date has passed and nothing is paid', () => {
    expect(isOverdue(row({ dueDate: '2026-07-31T00:00:00.000Z' }), NOW)).toBe(true);
  });

  it('is false when the due date is ahead', () => {
    expect(isOverdue(row({ dueDate: '2026-09-01T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('is false once paid, whatever the date', () => {
    expect(isOverdue(row({ paidAt: '2026-07-15T00:00:00.000Z' }), NOW)).toBe(false);
    expect(isOverdue(row({ status: 'paid' }), NOW)).toBe(false);
  });

  it('is null with no usable due date — not overdue and not on time', () => {
    // "Overdue" was a string in the fixtures. Here it is a consequence, and
    // where the consequence cannot be drawn it says nothing.
    expect(isOverdue(row({ dueDate: null }), NOW)).toBeNull();
    expect(isOverdue(row({ dueDate: 'whenever' }), NOW)).toBeNull();
  });
});

describe('summarise', () => {
  const row = (over: Record<string, unknown>) => toInvoiceRow({ ...REAL_INVOICE, ...over })!;

  it('counts paid and overdue, and totals what is outstanding', () => {
    const s = summarise(
      [
        row({ id: 'a', amount: 1000, dueDate: '2026-07-01T00:00:00.000Z' }),
        row({ id: 'b', amount: 2000, dueDate: '2026-09-01T00:00:00.000Z' }),
        row({ id: 'c', amount: 500, paidAt: '2026-07-20T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(s).toMatchObject({ invoices: 3, paid: 1, overdue: 1 });
    expect(s.outstandingAmount).toBe(3000);
  });

  it('reports no outstanding total when no unpaid invoice carries an amount', () => {
    const s = summarise([row({ id: 'a', amount: null })], NOW);
    expect(s.outstandingAmount).toBeNull();
  });

  it('handles an empty list', () => {
    expect(summarise([], NOW)).toEqual({
      invoices: 0,
      paid: 0,
      overdue: 0,
      outstandingAmount: null,
    });
  });
});
