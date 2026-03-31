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

// ── In-memory stores (swap for Prisma calls in production) ───────────────────

const invoiceStore = new Map<string, Invoice>();
const commissionStore = new Map<string, CommissionRecord>();

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
  originalInvoiceId: string;
  refundAmount: number;
  reason: string;
  tenantId: string;
  businessId: string;
}

export interface RefundResult {
  creditNote: Invoice;
  originalInvoice: Invoice;
  refundedAmount: number;
}

export function issueRefund(input: RefundInput): RefundResult {
  const original = invoiceStore.get(input.originalInvoiceId);
  if (!original) {
    throw new Error(`Invoice ${input.originalInvoiceId} not found.`);
  }
  if (original.status !== 'paid') {
    throw new Error(`Refunds can only be issued against paid invoices. Current status: ${original.status}.`);
  }

  const alreadyRefunded = original.refundedAmount ?? 0;
  const maxRefundable = round2(original.amount - alreadyRefunded);

  if (input.refundAmount <= 0) {
    throw new Error('Refund amount must be positive.');
  }
  if (input.refundAmount > maxRefundable) {
    throw new Error(
      `Refund amount $${input.refundAmount} exceeds refundable balance $${maxRefundable} on invoice ${original.invoiceNumber}.`,
    );
  }

  const now = new Date();

  const creditNote: Invoice = {
    id: randomUUID(),
    tenantId: input.tenantId,
    businessId: input.businessId,
    invoiceNumber: nextInvoiceNumber(input.tenantId),
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
    refundedAmount: round2(alreadyRefunded + input.refundAmount),
    status: round2(alreadyRefunded + input.refundAmount) >= original.amount ? 'refunded' : 'paid',
    updatedAt: now,
  };

  invoiceStore.set(creditNote.id, creditNote);
  invoiceStore.set(original.id, updatedOriginal);

  logger.info('Refund / credit note issued', {
    creditNoteId: creditNote.id,
    originalInvoiceId: original.id,
    refundAmount: input.refundAmount,
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

  commissionStore.set(record.id, record);

  logger.info('Commission record created', {
    commissionId: record.id,
    type: record.type,
    amount: record.amount,
    tenantId: input.tenantId,
  });

  return record;
}

export function approveCommission(commissionId: string): CommissionRecord {
  const rec = commissionStore.get(commissionId);
  if (!rec) throw new Error(`Commission ${commissionId} not found.`);
  if (rec.status !== 'pending') {
    throw new Error(`Commission ${commissionId} is not in pending state (current: ${rec.status}).`);
  }

  const updated: CommissionRecord = { ...rec, status: 'approved' };
  commissionStore.set(commissionId, updated);
  return updated;
}

export function markCommissionPaid(commissionId: string, paidAt?: Date): CommissionRecord {
  const rec = commissionStore.get(commissionId);
  if (!rec) throw new Error(`Commission ${commissionId} not found.`);

  const updated: CommissionRecord = {
    ...rec,
    status: 'paid',
    paidAt: paidAt ?? new Date(),
  };
  commissionStore.set(commissionId, updated);
  return updated;
}

export function clawBackCommission(commissionId: string): CommissionRecord {
  const rec = commissionStore.get(commissionId);
  if (!rec) throw new Error(`Commission ${commissionId} not found.`);

  const updated: CommissionRecord = { ...rec, status: 'clawed_back' };
  commissionStore.set(commissionId, updated);

  logger.warn('Commission clawed back', {
    commissionId,
    amount: rec.amount,
    tenantId: rec.tenantId,
  });

  return updated;
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

export function getCommissionsForTenant(tenantId: string): CommissionRecord[] {
  const results: CommissionRecord[] = [];
  for (const rec of commissionStore.values()) {
    if (rec.tenantId === tenantId) results.push(rec);
  }
  return results;
}

export function getCommissionsForInvoice(invoiceId: string): CommissionRecord[] {
  const results: CommissionRecord[] = [];
  for (const rec of commissionStore.values()) {
    if (rec.invoiceId === invoiceId) results.push(rec);
  }
  return results;
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
  getCommissionsForTenant,
  getCommissionsForInvoice,
  getFeeSchedule: (ds: DealStructure): FeeSchedule => ({ ...FEE_SCHEDULES[ds] }),
};
