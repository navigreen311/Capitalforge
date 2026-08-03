// ============================================================
// CapitalForge — Revenue Ops & Billing Engine
//
// Responsibilities:
//   • Automatic fee calculation by deal structure type
//   • Invoice generation with itemized line-item breakdown
//   • Percent-of-funding fee trigger on card approval
//   • Commission tracking for partner / referral fees
//   • Refund and credit-note handling
//   • In-memory store (production: Prisma Invoice / CommissionRecord)
// ============================================================

import { randomUUID } from 'crypto';
import logger from '../config/logger.js';

// ── Domain Types ──────────────────────────────────────────────────────────────

export type DealStructure =
  | 'card_stacking'
  | 'credit_repair'
  | 'consulting_only'
  | 'white_label_reseller'
  | 'enterprise_managed';

export type InvoiceType =
  | 'program_fee'
  | 'percent_of_funding'
  | 'monthly_subscription'
  | 'overage'
  | 'refund'
  | 'credit_note';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'void' | 'refunded';

export type CommissionType =
  | 'referral_flat'
  | 'referral_percent'
  | 'advisor_split'
  | 'partner_override'
  | 'reseller_margin';

export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'clawed_back';

export interface LineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  metadata?: Record<string, unknown>;
}

export interface Invoice {
  id: string;
  tenantId: string;
  businessId: string;
  invoiceNumber: string;
  type: InvoiceType;
  amount: number;
  lineItems: LineItem[];
  status: InvoiceStatus;
  issuedAt: Date | null;
  dueDate: Date | null;
  paidAt: Date | null;
  stripePaymentId: string | null;
  refundedAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionRecord {
  id: string;
  tenantId: string;
  invoiceId: string | null;
  partnerId: string | null;
  advisorId: string | null;
  amount: number;
  percentage: number | null;
  type: CommissionType;
  status: CommissionStatus;
  paidAt: Date | null;
  createdAt: Date;
}

// ── Fee Configuration ─────────────────────────────────────────────────────────

export interface FeeSchedule {
  /** One-time program / brokerage fee in dollars */
  programFlatFee: number;
  /** Percent of total funding approved (0.01 = 1%) */
  percentOfFundingRate: number;
  /** Monthly subscription fee (0 if not applicable) */
  monthlySubscriptionFee: number;
  /** Overage rate per unit above plan limit */
  overageRatePerUnit: number;
}

// Per-deal-structure default fee schedules
const FEE_SCHEDULES: Record<DealStructure, FeeSchedule> = {
  card_stacking: {
    programFlatFee: 2_500,
    percentOfFundingRate: 0.03,   // 3% of approved credit
    monthlySubscriptionFee: 0,
    overageRatePerUnit: 0,
  },
  credit_repair: {
    programFlatFee: 997,
    percentOfFundingRate: 0.01,
    monthlySubscriptionFee: 149,
    overageRatePerUnit: 0,
  },
  consulting_only: {
    programFlatFee: 1_500,
    percentOfFundingRate: 0,
    monthlySubscriptionFee: 0,
    overageRatePerUnit: 0,
  },
  white_label_reseller: {
    programFlatFee: 0,
    percentOfFundingRate: 0.015,
    monthlySubscriptionFee: 499,
    overageRatePerUnit: 2.50,
  },
  enterprise_managed: {
    programFlatFee: 0,
    percentOfFundingRate: 0.02,
    monthlySubscriptionFee: 2_499,
    overageRatePerUnit: 1.00,
  },
};

// Default partner commission — can be overridden per deal
const DEFAULT_REFERRAL_PERCENT = 0.20; // 20% of program fee
const DEFAULT_ADVISOR_SPLIT_PERCENT = 0.40; // 40% of program fee

// ── Invoice Number Generator ──────────────────────────────────────────────────

let invoiceSequence = 1000;

function nextInvoiceNumber(tenantId: string): string {
  invoiceSequence += 1;
  const prefix = tenantId.slice(0, 4).toUpperCase();
  const ts = new Date().getFullYear().toString().slice(2);
  return `INV-${prefix}${ts}-${String(invoiceSequence).padStart(6, '0')}`;
}

// ── Working memory, not storage ──────────────────────────────────────────────
//
// These two Maps are not a database and never were, whatever "swap for
// Prisma calls in production" suggested. Everything in them is gone when the
// process restarts and is invisible to any other worker.
//
// Invoices no longer depend on them: the billing routes compute an invoice
// here and write the row themselves, then read, list and pay against the
// invoices table.
//
// Refunds got the same treatment. issueRefund is pure — it takes the invoice
// and the credit notes already raised against it, validates, and returns what
// to write; POST /api/invoices/:id/refund writes both rows in one
// transaction. It used to read from invoiceStore and write back into it, so a
// refund left no record and vanished on restart.
//
// Commissions are on the same footing, and an earlier version of this note
// was wrong about that: it said commission_records sat unused and that none
// of this was reachable from an API route. Both were false when written.
// GET /api/billing/commissions reads that table, POST
// /api/invoices/:id/commissions computes here and writes the row, and
// POST /api/billing/commissions/:id/resolve updates the record's status and
// records the reason in audit_logs.
//
// The commission lifecycle followed, and commissionStore is gone with it.
// approveCommission, markCommissionPaid and clawBackCommission are pure
// transitions — they take a record and return what to write — and
// POST /api/commissions/:id/{approve,pay,clawback} persist the result.
//
// Two readers went too: getCommissionsForTenant and getCommissionsForInvoice
// scanned that Map, so they returned whatever this worker had created since
// it started and called it the tenant's commissions. Nothing outside this
// file's own tests used them. GET /api/commissions reads the table.
//
// invoiceStore below is the last of these. The invoice routes compute here
// and write the row themselves, so what it holds is vestigial; the helpers
// that still read it are unused outside this file. Nothing depends on any of
// it surviving a restart.

const invoiceStore = new Map<string, Invoice>();

// ── Fee Calculation ───────────────────────────────────────────────────────────

export interface FeeCalculationInput {
  dealStructure: DealStructure;
  /** Total approved credit across all cards */
  totalApprovedCredit: number;
  /** Override schedule — any fields not provided fall back to defaults */
  customSchedule?: Partial<FeeSchedule>;
  /** Number of overage units (e.g. extra API calls above plan) */
  overageUnits?: number;
}

export interface FeeCalculationResult {
  dealStructure: DealStructure;
  schedule: FeeSchedule;
  programFlatFee: number;
  percentOfFundingFee: number;
  monthlySubscriptionFee: number;
  overageFee: number;
  totalFee: number;
  lineItems: LineItem[];
}

export function calculateFees(input: FeeCalculationInput): FeeCalculationResult {
  const base = FEE_SCHEDULES[input.dealStructure];
  const schedule: FeeSchedule = {
    programFlatFee: input.customSchedule?.programFlatFee ?? base.programFlatFee,
    percentOfFundingRate: input.customSchedule?.percentOfFundingRate ?? base.percentOfFundingRate,
    monthlySubscriptionFee:
      input.customSchedule?.monthlySubscriptionFee ?? base.monthlySubscriptionFee,
    overageRatePerUnit: input.customSchedule?.overageRatePerUnit ?? base.overageRatePerUnit,
  };

  const programFlatFee = schedule.programFlatFee;
  const percentOfFundingFee = round2(input.totalApprovedCredit * schedule.percentOfFundingRate);
  const monthlySubscriptionFee = schedule.monthlySubscriptionFee;
  const overageUnits = input.overageUnits ?? 0;
  const overageFee = round2(overageUnits * schedule.overageRatePerUnit);

  const totalFee = round2(
    programFlatFee + percentOfFundingFee + monthlySubscriptionFee + overageFee,
  );

  const lineItems: LineItem[] = [];

  if (programFlatFee > 0) {
    lineItems.push({
      description: `Program fee — ${dealStructureLabel(input.dealStructure)}`,
      quantity: 1,
      unitAmount: programFlatFee,
      totalAmount: programFlatFee,
    });
  }

  if (percentOfFundingFee > 0) {
    lineItems.push({
      description: `Percent-of-funding fee (${(schedule.percentOfFundingRate * 100).toFixed(2)}% of $${input.totalApprovedCredit.toLocaleString()})`,
      quantity: 1,
      unitAmount: percentOfFundingFee,
      totalAmount: percentOfFundingFee,
      metadata: {
        totalApprovedCredit: input.totalApprovedCredit,
        rate: schedule.percentOfFundingRate,
      },
    });
  }

  if (monthlySubscriptionFee > 0) {
    lineItems.push({
      description: 'Monthly platform subscription',
      quantity: 1,
      unitAmount: monthlySubscriptionFee,
      totalAmount: monthlySubscriptionFee,
    });
  }

  if (overageFee > 0) {
    lineItems.push({
      description: `Overage charges (${overageUnits} units @ $${schedule.overageRatePerUnit}/unit)`,
      quantity: overageUnits,
      unitAmount: schedule.overageRatePerUnit,
      totalAmount: overageFee,
    });
  }

  return {
    dealStructure: input.dealStructure,
    schedule,
    programFlatFee,
    percentOfFundingFee,
    monthlySubscriptionFee,
    overageFee,
    totalFee,
    lineItems,
  };
}

// ── Invoice Generation ────────────────────────────────────────────────────────

export interface GenerateInvoiceInput {
  tenantId: string;
  businessId: string;
  dealStructure: DealStructure;
  totalApprovedCredit: number;
  customSchedule?: Partial<FeeSchedule>;
  overageUnits?: number;
  dueDaysFromNow?: number;
}

export function generateInvoice(input: GenerateInvoiceInput): Invoice {
  const fees = calculateFees({
    dealStructure: input.dealStructure,
    totalApprovedCredit: input.totalApprovedCredit,
    customSchedule: input.customSchedule,
    overageUnits: input.overageUnits,
  });

  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + (input.dueDaysFromNow ?? 30));

  const invoice: Invoice = {
    id: randomUUID(),
    tenantId: input.tenantId,
    businessId: input.businessId,
    invoiceNumber: nextInvoiceNumber(input.tenantId),
    type: fees.percentOfFundingFee > 0 ? 'percent_of_funding' : 'program_fee',
    amount: fees.totalFee,
    lineItems: fees.lineItems,
    status: 'issued',
    issuedAt: now,
    dueDate,
    paidAt: null,
    stripePaymentId: null,
    refundedAmount: 0,
    createdAt: now,
    updatedAt: now,
  };

  invoiceStore.set(invoice.id, invoice);

  logger.info('Invoice generated', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    tenantId: input.tenantId,
    businessId: input.businessId,
    amount: invoice.amount,
    type: invoice.type,
  });

  return invoice;
}

// ── Percent-of-Funding Trigger (card approval event) ─────────────────────────

export interface CardApprovalFeeInput {
  tenantId: string;
  businessId: string;
  cardApplicationId: string;
  approvedCreditLimit: number;
  percentOfFundingRate?: number;
}

export function triggerPercentOfFundingFee(input: CardApprovalFeeInput): Invoice {
  const rate = input.percentOfFundingRate ?? FEE_SCHEDULES['card_stacking'].percentOfFundingRate;
  const feeAmount = round2(input.approvedCreditLimit * rate);
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 14);

  const lineItems: LineItem[] = [
    {
      description: `Percent-of-funding fee on card approval — card ${input.cardApplicationId} (${(rate * 100).toFixed(2)}% of $${input.approvedCreditLimit.toLocaleString()})`,
      quantity: 1,
      unitAmount: feeAmount,
      totalAmount: feeAmount,
      metadata: {
        cardApplicationId: input.cardApplicationId,
        approvedCreditLimit: input.approvedCreditLimit,
        rate,
      },
    },
  ];

  const invoice: Invoice = {
    id: randomUUID(),
    tenantId: input.tenantId,
    businessId: input.businessId,
    invoiceNumber: nextInvoiceNumber(input.tenantId),
    type: 'percent_of_funding',
    amount: feeAmount,
    lineItems,
    status: 'issued',
    issuedAt: now,
    dueDate,
    paidAt: null,
    stripePaymentId: null,
    refundedAmount: 0,
    createdAt: now,
    updatedAt: now,
  };

  invoiceStore.set(invoice.id, invoice);

  logger.info('Percent-of-funding fee triggered on card approval', {
    invoiceId: invoice.id,
    cardApplicationId: input.cardApplicationId,
    feeAmount,
    tenantId: input.tenantId,
    businessId: input.businessId,
  });

  return invoice;
}

// ── Invoice Payment ───────────────────────────────────────────────────────────

export interface PayInvoiceInput {
  invoiceId: string;
  stripePaymentId?: string;
  paidAt?: Date;
}

export function payInvoice(input: PayInvoiceInput): Invoice {
  const invoice = invoiceStore.get(input.invoiceId);
  if (!invoice) {
    throw new Error(`Invoice ${input.invoiceId} not found.`);
  }
  if (invoice.status === 'paid') {
    throw new Error(`Invoice ${input.invoiceId} is already paid.`);
  }
  if (invoice.status === 'void') {
    throw new Error(`Invoice ${input.invoiceId} is void and cannot be paid.`);
  }

  const updated: Invoice = {
    ...invoice,
    status: 'paid',
    paidAt: input.paidAt ?? new Date(),
    stripePaymentId: input.stripePaymentId ?? invoice.stripePaymentId,
    updatedAt: new Date(),
  };

  invoiceStore.set(invoice.id, updated);

  logger.info('Invoice paid', {
    invoiceId: invoice.id,
    amount: invoice.amount,
    stripePaymentId: updated.stripePaymentId,
  });

  return updated;
}

// ── Refund Handling ───────────────────────────────────────────────────────────

export interface RefundInput {
  /** The invoice being refunded, read by the caller. */
  originalInvoice: Invoice;
  /**
   * Sum of credit notes already issued against it. Derived by the caller from
   * the rows on record, because invoices carry no refundedAmount column.
   */
  alreadyRefunded?: number;
  refundAmount: number;
  reason: string;
  tenantId: string;
  businessId: string;
  /** Injectable for tests. */
  now?: Date;
}

export interface RefundResult {
  creditNote: Invoice;
  originalInvoice: Invoice;
  refundedAmount: number;
}

/**
 * Compute a credit note against an invoice that has been paid.
 *
 * This used to read the original out of invoiceStore, build the credit note,
 * and write both back into that Map — so a refund issued through this service
 * left no record anywhere, disappeared on restart, and was invisible to every
 * other worker. Nothing called it, which is the only reason that did no harm.
 *
 * It is pure now, on the same split the invoice path already uses: the
 * service computes and validates, and the caller writes the rows. The
 * original invoice is passed in rather than looked up, and `alreadyRefunded`
 * comes from the credit notes on record against it.
 */
export function issueRefund(input: RefundInput): RefundResult {
  const original = input.originalInvoice;

  if (original.status !== 'paid') {
    throw new Error(
      `Refunds can only be issued against paid invoices. Current status: ${original.status}.`,
    );
  }

  const alreadyRefunded = round2(input.alreadyRefunded ?? 0);
  const maxRefundable = round2(original.amount - alreadyRefunded);

  if (input.refundAmount <= 0) {
    throw new Error('Refund amount must be positive.');
  }
  if (input.refundAmount > maxRefundable) {
    throw new Error(
      `Refund amount $${input.refundAmount} exceeds refundable balance $${maxRefundable} on invoice ${original.invoiceNumber}.`,
    );
  }

  const now = input.now ?? new Date();
  const refundedAfter = round2(alreadyRefunded + input.refundAmount);

  const creditNote: Invoice = {
    // The caller assigns the real id and number when it writes the row, the
    // same way generated invoices work. These stand in until then.
    id: randomUUID(),
    tenantId: input.tenantId,
    businessId: input.businessId,
    invoiceNumber: '',
    type: 'credit_note',
    amount: -input.refundAmount,
    lineItems: [
      {
        description: `Credit note for refund — ref ${original.invoiceNumber}: ${input.reason}`,
        quantity: 1,
        unitAmount: -input.refundAmount,
        totalAmount: -input.refundAmount,
        metadata: { originalInvoiceId: original.id, reason: input.reason },
      },
    ],
    status: 'paid',
    issuedAt: now,
    dueDate: now,
    paidAt: now,
    stripePaymentId: null,
    refundedAmount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const updatedOriginal: Invoice = {
    ...original,
    refundedAmount: refundedAfter,
    // Fully refunded once the credit notes reach the invoice total; partial
    // refunds leave it paid.
    status: refundedAfter >= original.amount ? 'refunded' : 'paid',
    updatedAt: now,
  };

  logger.info('Refund / credit note computed', {
    originalInvoiceId: original.id,
    refundAmount: input.refundAmount,
    refundedAfter,
    reason: input.reason,
  });

  return {
    creditNote,
    originalInvoice: updatedOriginal,
    refundedAmount: input.refundAmount,
  };
}

// ── Commission Tracking ───────────────────────────────────────────────────────

export interface CreateCommissionInput {
  tenantId: string;
  invoiceId?: string;
  partnerId?: string;
  advisorId?: string;
  type: CommissionType;
  /** Explicit dollar amount (mutually exclusive with percentage + baseAmount) */
  amount?: number;
  /** Percentage as decimal (e.g. 0.20 = 20%) — requires baseAmount */
  percentage?: number;
  /** Base amount to compute percentage on */
  baseAmount?: number;
}

export function createCommission(input: CreateCommissionInput): CommissionRecord {
  if (!input.partnerId && !input.advisorId) {
    throw new Error('Commission requires either partnerId or advisorId.');
  }

  let amount: number;
  let percentage: number | null = null;

  if (input.amount !== undefined) {
    amount = round2(input.amount);
  } else if (input.percentage !== undefined && input.baseAmount !== undefined) {
    percentage = input.percentage;
    amount = round2(input.baseAmount * input.percentage);
  } else {
    throw new Error('Provide either amount or (percentage + baseAmount).');
  }

  const record: CommissionRecord = {
    id: randomUUID(),
    tenantId: input.tenantId,
    invoiceId: input.invoiceId ?? null,
    partnerId: input.partnerId ?? null,
    advisorId: input.advisorId ?? null,
    amount,
    percentage,
    type: input.type,
    status: 'pending',
    paidAt: null,
    createdAt: new Date(),
  };


  logger.info('Commission record created', {
    commissionId: record.id,
    type: record.type,
    amount: record.amount,
    tenantId: input.tenantId,
  });

  return record;
}

/**
 * The commission lifecycle, as pure transitions.
 *
 * These read a record out of commissionStore, mutated it, and put it back —
 * so an approval, a payment or a clawback lived in one worker's memory until
 * the process restarted, while commission_records held whatever it had held
 * before. No route called them, which is the only reason that did no harm.
 *
 * They take the record and return what to write, on the same split the
 * invoice and refund paths use. The caller reads the row and persists the
 * result.
 *
 * markCommissionPaid used to check nothing at all: it would pay a commission
 * nobody had approved, and pay one that had already been clawed back. The
 * transitions are stated now, because "which states can follow this one" is
 * the whole content of a lifecycle.
 */

/** Thrown when a transition is not allowed from the record's current state. */
export class CommissionTransitionError extends Error {
  constructor(
    public readonly commissionId: string,
    public readonly from: CommissionStatus,
    public readonly to: CommissionStatus,
    message: string,
  ) {
    super(message);
    this.name = 'CommissionTransitionError';
  }
}

export function approveCommission(record: CommissionRecord): CommissionRecord {
  if (record.status !== 'pending') {
    throw new CommissionTransitionError(
      record.id,
      record.status,
      'approved',
      `Commission ${record.id} is not pending (current: ${record.status}), so there is nothing to approve.`,
    );
  }

  return { ...record, status: 'approved' };
}

export function markCommissionPaid(
  record: CommissionRecord,
  paidAt: Date = new Date(),
): CommissionRecord {
  // Approval first. Paying an unapproved commission is money out of the door
  // on nobody's authority, and this used to allow it — along with paying one
  // that had already been clawed back.
  if (record.status !== 'approved') {
    throw new CommissionTransitionError(
      record.id,
      record.status,
      'paid',
      record.status === 'pending'
        ? `Commission ${record.id} has not been approved, so it cannot be paid.`
        : `Commission ${record.id} is ${record.status}, so it cannot be paid.`,
    );
  }

  return { ...record, status: 'paid', paidAt };
}

export function clawBackCommission(record: CommissionRecord): CommissionRecord {
  // Only from paid. A clawback reclaims money that went out; withdrawing one
  // that was never paid is a cancellation, which is a different act and has
  // no state here. Refusing is better than quietly recording the wrong one.
  if (record.status !== 'paid') {
    throw new CommissionTransitionError(
      record.id,
      record.status,
      'clawed_back',
      `Commission ${record.id} is ${record.status} and was never paid, so there is nothing to claw back.`,
    );
  }

  logger.warn('Commission clawed back', {
    commissionId: record.id,
    amount: record.amount,
    tenantId: record.tenantId,
  });

  return { ...record, status: 'clawed_back' };
}

// ── Auto-commission on invoice ────────────────────────────────────────────────

export interface AutoCommissionInput {
  tenantId: string;
  invoiceId: string;
  invoiceAmount: number;
  partnerId?: string;
  advisorId?: string;
  partnerPercent?: number;
  advisorPercent?: number;
}

export function autoGenerateCommissions(input: AutoCommissionInput): CommissionRecord[] {
  const records: CommissionRecord[] = [];

  if (input.partnerId) {
    records.push(
      createCommission({
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        partnerId: input.partnerId,
        type: 'referral_percent',
        percentage: input.partnerPercent ?? DEFAULT_REFERRAL_PERCENT,
        baseAmount: input.invoiceAmount,
      }),
    );
  }

  if (input.advisorId) {
    records.push(
      createCommission({
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        advisorId: input.advisorId,
        type: 'advisor_split',
        percentage: input.advisorPercent ?? DEFAULT_ADVISOR_SPLIT_PERCENT,
        baseAmount: input.invoiceAmount,
      }),
    );
  }

  return records;
}

// ── Store Accessors ───────────────────────────────────────────────────────────

export function getInvoice(invoiceId: string): Invoice | undefined {
  return invoiceStore.get(invoiceId);
}

export function getInvoicesForBusiness(
  tenantId: string,
  businessId: string,
): Invoice[] {
  const results: Invoice[] = [];
  for (const inv of invoiceStore.values()) {
    if (inv.tenantId === tenantId && inv.businessId === businessId) {
      results.push(inv);
    }
  }
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}



// ── Utilities ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dealStructureLabel(ds: DealStructure): string {
  const labels: Record<DealStructure, string> = {
    card_stacking: 'Card Stacking Program',
    credit_repair: 'Credit Repair Program',
    consulting_only: 'Consulting Engagement',
    white_label_reseller: 'White-Label Reseller',
    enterprise_managed: 'Enterprise Managed Service',
  };
  return labels[ds];
}

// ── Service Singleton ─────────────────────────────────────────────────────────

export const revenueOpsService = {
  calculateFees,
  generateInvoice,
  triggerPercentOfFundingFee,
  payInvoice,
  issueRefund,
  createCommission,
  approveCommission,
  markCommissionPaid,
  clawBackCommission,
  autoGenerateCommissions,
  getInvoice,
  getInvoicesForBusiness,
  getFeeSchedule: (ds: DealStructure): FeeSchedule => ({ ...FEE_SCHEDULES[ds] }),
};
