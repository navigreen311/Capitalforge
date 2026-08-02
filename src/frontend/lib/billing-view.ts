// ============================================================
// CapitalForge — Billing mapping
//
// /billing listed invoices as literals — CF-2026-0041 to Apex Ventures LLC
// for $18,500 issued, CF-2026-0040 to NovaTech Solutions for $9,750 marked
// overdue, CF-2026-0039 to Horizon Retail for $42,000 — beside commissions
// owed to named partners and a usage meter reading 87,400 of 100,000 API
// calls on an Enterprise plan.
//
// An overdue invoice is a claim that someone owes money and has not paid.
//
//   GET /api/businesses/:id/invoices — the invoices, from the table
//
// The fee calculation behind an invoice is real: a fee schedule per deal
// structure, line items, a total. What was missing was that the result was
// kept in a Map held by the API process, so an invoice existed until the
// server restarted. It is written to the invoices table now, and this maps
// what comes back.
// ============================================================

export interface InvoiceRow {
  id: string;
  businessId: string;
  invoiceNumber: string;
  type: string;
  /** Null when the record carries no amount. Never zero as a stand-in. */
  amount: number | null;
  status: string;
  issuedAt: string | null;
  dueDate: string | null;
  paidAt: string | null;
  stripePaymentId: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toInvoiceRow(row: unknown): InvoiceRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  const invoiceNumber = str(r['invoiceNumber']);
  if (id === null || invoiceNumber === null) return null;

  return {
    id,
    businessId: str(r['businessId']) ?? '',
    invoiceNumber,
    type: str(r['type']) ?? 'unknown',
    amount: num(r['amount']),
    status: str(r['status']) ?? 'draft',
    issuedAt: str(r['issuedAt']),
    dueDate: str(r['dueDate']),
    paidAt: str(r['paidAt']),
    stripePaymentId: str(r['stripePaymentId']),
  };
}

export function toInvoiceRows(data: unknown): InvoiceRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['data'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toInvoiceRow(row))
    .filter((row): row is InvoiceRow => row !== null);
}

/**
 * Whether an invoice is past its due date and unpaid.
 *
 * Computed from the record's own dates rather than read from a status
 * string. "Overdue" was written into the fixtures; here it is the
 * consequence of a due date having passed with no payment recorded.
 *
 * Null when there is no due date — not overdue, and not on time either.
 */
export function isOverdue(row: InvoiceRow, now: Date): boolean | null {
  if (row.paidAt !== null || row.status === 'paid') return false;
  if (row.dueDate === null) return null;
  const due = new Date(row.dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return due.getTime() < now.getTime();
}

export interface BillingSummary {
  invoices: number;
  paid: number;
  overdue: number;
  /** Null when no invoice carries an amount, rather than a total of zero. */
  outstandingAmount: number | null;
}

export function summarise(rows: InvoiceRow[], now: Date): BillingSummary {
  const unpaid = rows.filter((r) => r.paidAt === null && r.status !== 'paid');
  const withAmount = unpaid.filter((r) => r.amount !== null);

  return {
    invoices: rows.length,
    paid: rows.filter((r) => r.paidAt !== null || r.status === 'paid').length,
    overdue: rows.filter((r) => isOverdue(r, now) === true).length,
    outstandingAmount:
      withAmount.length === 0
        ? null
        : withAmount.reduce((sum, r) => sum + (r.amount ?? 0), 0),
  };
}

export function formatMoney(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
