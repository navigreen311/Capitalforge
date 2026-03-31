// ============================================================
// CapitalForge — Business-Purpose Evidence Tracker
//
// Compliance basis:
//   • IRS Rev. Rul. 2004-111 — adequate contemporaneous records
//   • Treasury Reg. §1.274-5 — substantiation requirements for
//     travel, meals & entertainment deductions
//   • IRC §162 — ordinary and necessary business expense standard
//   • Visa / Mastercard commercial card network rules —
//     prohibition of personal-use spend on business card programs
//
// Capabilities:
//   1. Transaction-to-invoice matching (by amount ± tolerance and date window)
//   2. Business-purpose category tagging derived from MCC
//   3. Network-rule compliance check (flag personal-use categories)
//   4. Tax substantiation export by category and date range
// ============================================================

import { PrismaClient, SpendTransaction } from '@prisma/client';
import logger from '../config/logger.js';
import { MCC_RISK_MAP, CASH_LIKE_MCC_RANGES } from './spend-governance.service.js';

// ── Business Purpose Category Map ────────────────────────────

/**
 * Maps MCC category strings (from spend-governance) to IRS
 * Schedule C / tax substantiation categories.
 */
export const BUSINESS_PURPOSE_CATEGORIES: Record<string, BusinessPurposeCategory> = {
  technology: {
    taxCategory: 'office_expenses',
    description: 'Technology / Software / IT Services',
    isDeductible: true,
    requiresSubstantiation: false,
    scheduleC_line: 22,
  },
  office_supplies: {
    taxCategory: 'office_expenses',
    description: 'Office Supplies',
    isDeductible: true,
    requiresSubstantiation: false,
    scheduleC_line: 22,
  },
  supplies: {
    taxCategory: 'supplies',
    description: 'Business Supplies',
    isDeductible: true,
    requiresSubstantiation: false,
    scheduleC_line: 22,
  },
  travel: {
    taxCategory: 'travel',
    description: 'Business Travel (Hotel / Airfare / Car Rental)',
    isDeductible: true,
    requiresSubstantiation: true,  // IRS §274 — business purpose required
    scheduleC_line: 24,
  },
  meals_entertainment: {
    taxCategory: 'meals',
    description: 'Meals & Entertainment (50 % deductible)',
    isDeductible: true,
    requiresSubstantiation: true,  // IRS §274 — who, when, business purpose
    scheduleC_line: 24,
    limitPercent: 50,
  },
  entertainment: {
    taxCategory: 'entertainment',
    description: 'Entertainment',
    isDeductible: false,  // TCJA 2017 eliminated entertainment deduction
    requiresSubstantiation: true,
    scheduleC_line: null,
  },
  advertising: {
    taxCategory: 'advertising',
    description: 'Advertising & Marketing',
    isDeductible: true,
    requiresSubstantiation: false,
    scheduleC_line: 8,
  },
  insurance: {
    taxCategory: 'insurance',
    description: 'Business Insurance',
    isDeductible: true,
    requiresSubstantiation: false,
    scheduleC_line: 15,
  },
  medical: {
    taxCategory: 'other_expenses',
    description: 'Medical / Health Services',
    isDeductible: false,
    requiresSubstantiation: true,
    scheduleC_line: null,
  },
  retail: {
    taxCategory: 'other_expenses',
    description: 'Retail — Review Required',
    isDeductible: null,  // depends on business purpose
    requiresSubstantiation: true,
    scheduleC_line: null,
  },
  // Non-deductible / personal-use flags
  personal_likely: {
    taxCategory: 'personal_nondeductible',
    description: 'Likely Personal-Use — Review Required',
    isDeductible: false,
    requiresSubstantiation: true,
    scheduleC_line: null,
    isPersonalUse: true,
  },
  cash_advance: {
    taxCategory: 'disallowed',
    description: 'Cash Advance — Not a Deductible Expense',
    isDeductible: false,
    requiresSubstantiation: false,
    scheduleC_line: null,
    isPersonalUse: false,
    isDisallowed: true,
  },
  quasi_cash: {
    taxCategory: 'disallowed',
    description: 'Quasi-Cash / Cryptocurrency — Disallowed on Business Card',
    isDeductible: false,
    requiresSubstantiation: false,
    scheduleC_line: null,
    isPersonalUse: true,
    isDisallowed: true,
  },
  money_transfer: {
    taxCategory: 'disallowed',
    description: 'Money Transfer / Wire — Suspicious Rail',
    isDeductible: false,
    requiresSubstantiation: true,
    scheduleC_line: null,
    isDisallowed: true,
  },
  gambling: {
    taxCategory: 'personal_nondeductible',
    description: 'Gambling — Disallowed on Business Card',
    isDeductible: false,
    requiresSubstantiation: false,
    scheduleC_line: null,
    isPersonalUse: true,
    isDisallowed: true,
  },
  unknown: {
    taxCategory: 'other_expenses',
    description: 'Uncategorized — Manual Review Required',
    isDeductible: null,
    requiresSubstantiation: true,
    scheduleC_line: null,
  },
  unclassified: {
    taxCategory: 'other_expenses',
    description: 'Unclassified Merchant Category',
    isDeductible: null,
    requiresSubstantiation: true,
    scheduleC_line: null,
  },
};

/** Personal-use categories that violate commercial card network rules. */
export const PERSONAL_USE_CATEGORIES = new Set([
  'personal_likely',
  'cash_advance',
  'quasi_cash',
  'money_transfer',
  'gambling',
]);

// ── Types ─────────────────────────────────────────────────────

export interface BusinessPurposeCategory {
  taxCategory: string;
  description: string;
  isDeductible: boolean | null;
  requiresSubstantiation: boolean;
  scheduleC_line: number | null;
  limitPercent?: number;       // e.g. 50 for meals
  isPersonalUse?: boolean;
  isDisallowed?: boolean;
}

export interface TagTransactionInput {
  transactionId: string;
  tenantId: string;
  businessId: string;
  businessPurpose: string;
  evidenceDocId?: string;
}

export interface TaggedTransaction extends SpendTransaction {
  purposeCategory: BusinessPurposeCategory | null;
  networkRuleViolation: boolean;
  networkRuleViolationReason: string | null;
}

export interface InvoiceMatchInput {
  tenantId: string;
  businessId: string;
  transactionId: string;
  /** The invoice reference number or document vault ID to match against */
  invoiceRef: string;
  /** Acceptable amount difference in dollars (default: 1.00) */
  amountTolerance?: number;
  /** Acceptable date difference in days (default: 5) */
  dateTolerance?: number;
}

export interface InvoiceMatchResult {
  matched: boolean;
  transactionId: string;
  invoiceRef: string;
  matchConfidence: 'exact' | 'fuzzy' | 'none';
  discrepancies: string[];
}

export interface NetworkRuleCheckResult {
  transactionId: string;
  isCompliant: boolean;
  violations: string[];
  category: string | null;
}

export interface TaxExportLine {
  transactionId: string;
  transactionDate: string;
  merchantName: string | null;
  mcc: string | null;
  mccCategory: string | null;
  amount: number;
  businessPurpose: string | null;
  taxCategory: string;
  scheduleC_line: number | null;
  isDeductible: boolean | null;
  deductibleAmount: number | null;
  requiresSubstantiation: boolean;
  evidenceDocId: string | null;
  flagged: boolean;
  flagReason: string | null;
}

export interface TaxExportResult {
  businessId: string;
  exportedAt: string;
  periodStart: string;
  periodEnd: string;
  lines: TaxExportLine[];
  summary: TaxExportSummary;
}

export interface TaxExportSummary {
  totalTransactions: number;
  totalAmount: number;
  deductibleAmount: number;
  nonDeductibleAmount: number;
  requiresSubstantiationCount: number;
  missingEvidenceCount: number;
  byCategory: Record<string, CategorySummary>;
}

export interface CategorySummary {
  count: number;
  totalAmount: number;
  deductibleAmount: number;
  taxCategory: string;
  scheduleC_line: number | null;
}

// ── Service ───────────────────────────────────────────────────

export class BusinessPurposeEvidenceService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Category Tagging ─────────────────────────────────────────

  /**
   * Resolve the business-purpose category for a transaction
   * based on its MCC category string (as set by SpendGovernanceService).
   */
  resolvePurposeCategory(mccCategory: string | null | undefined): BusinessPurposeCategory | null {
    if (!mccCategory) return null;
    return BUSINESS_PURPOSE_CATEGORIES[mccCategory] ?? BUSINESS_PURPOSE_CATEGORIES['unclassified'];
  }

  /**
   * Update the businessPurpose and optional evidenceDocId on a
   * transaction record.  Returns the updated transaction with its
   * resolved category and network-rule compliance status.
   */
  async tagTransaction(input: TagTransactionInput): Promise<TaggedTransaction> {
    const svc = logger.child({
      service: 'BusinessPurposeEvidenceService',
      tenantId: input.tenantId,
      transactionId: input.transactionId,
    });

    // Verify ownership
    const tx = await this.prisma.spendTransaction.findFirst({
      where: {
        id: input.transactionId,
        businessId: input.businessId,
        tenantId: input.tenantId,
      },
    });
    if (!tx) {
      throw new Error(
        `Transaction ${input.transactionId} not found for business ${input.businessId}.`,
      );
    }

    if (!input.businessPurpose.trim()) {
      throw new Error('businessPurpose cannot be empty.');
    }

    const updated = await this.prisma.spendTransaction.update({
      where: { id: input.transactionId },
      data: {
        businessPurpose: input.businessPurpose.trim(),
        evidenceDocId: input.evidenceDocId ?? tx.evidenceDocId,
      },
    });

    const purposeCategory = this.resolvePurposeCategory(updated.mccCategory);
    const networkCheck = this.checkNetworkRuleCompliance(updated);

    svc.info('Transaction tagged with business purpose', {
      transactionId: input.transactionId,
      taxCategory: purposeCategory?.taxCategory,
      isCompliant: networkCheck.isCompliant,
    });

    return {
      ...updated,
      purposeCategory,
      networkRuleViolation: !networkCheck.isCompliant,
      networkRuleViolationReason:
        networkCheck.violations.length > 0
          ? networkCheck.violations.join(' | ')
          : null,
    };
  }

  // ── Invoice Matching ─────────────────────────────────────────

  /**
   * Attempt to match a transaction to an invoice.
   *
   * Matching strategy:
   *   1. Look up the invoice document in the vault by invoiceRef.
   *   2. If the invoice metadata includes an amount and date, compare
   *      against the transaction within the specified tolerances.
   *   3. Return confidence level: exact | fuzzy | none.
   *
   * Note: Full invoice parsing requires document vault integration.
   * This implementation matches by vault document reference and
   * performs structural validation; amount/date matching is applied
   * when invoice metadata is available via the document's metadata field.
   */
  async matchTransactionToInvoice(
    input: InvoiceMatchInput,
  ): Promise<InvoiceMatchResult> {
    const amountTolerance = input.amountTolerance ?? 1.0;
    const dateTolerance = input.dateTolerance ?? 5; // days

    // Verify transaction ownership
    const tx = await this.prisma.spendTransaction.findFirst({
      where: {
        id: input.transactionId,
        businessId: input.businessId,
        tenantId: input.tenantId,
      },
    });
    if (!tx) {
      throw new Error(
        `Transaction ${input.transactionId} not found for business ${input.businessId}.`,
      );
    }

    // Look up the invoice document in the vault
    const invoiceDoc = await this.prisma.document.findFirst({
      where: {
        tenantId: input.tenantId,
        businessId: input.businessId,
        OR: [
          { id: input.invoiceRef },
          { storageKey: input.invoiceRef },
        ],
      },
    });

    const discrepancies: string[] = [];

    if (!invoiceDoc) {
      return {
        matched: false,
        transactionId: input.transactionId,
        invoiceRef: input.invoiceRef,
        matchConfidence: 'none',
        discrepancies: [`Invoice document "${input.invoiceRef}" not found in vault.`],
      };
    }

    // If the document has metadata with amount/date, compare
    const meta = invoiceDoc.metadata as Record<string, unknown> | null;
    let matchConfidence: InvoiceMatchResult['matchConfidence'] = 'fuzzy';

    if (meta) {
      const invoiceAmount = typeof meta['amount'] === 'number' ? meta['amount'] : null;
      const invoiceDateRaw = typeof meta['date'] === 'string' ? meta['date'] : null;

      if (invoiceAmount !== null) {
        const txAmount = Number(tx.amount);
        const diff = Math.abs(txAmount - invoiceAmount);
        if (diff === 0) {
          matchConfidence = 'exact';
        } else if (diff <= amountTolerance) {
          discrepancies.push(
            `Amount difference: transaction $${txAmount.toFixed(2)} vs invoice $${invoiceAmount.toFixed(2)} (within tolerance).`,
          );
        } else {
          discrepancies.push(
            `Amount mismatch: transaction $${txAmount.toFixed(2)} vs invoice $${invoiceAmount.toFixed(2)} (exceeds $${amountTolerance} tolerance).`,
          );
          matchConfidence = 'none';
        }
      }

      if (invoiceDateRaw) {
        const invoiceDate = new Date(invoiceDateRaw);
        const txDate = new Date(tx.transactionDate);
        const daysDiff =
          Math.abs(txDate.getTime() - invoiceDate.getTime()) / 86_400_000;

        if (daysDiff > dateTolerance) {
          discrepancies.push(
            `Date mismatch: transaction ${txDate.toISOString().slice(0, 10)} vs invoice ${invoiceDate.toISOString().slice(0, 10)} (${daysDiff.toFixed(0)} days apart, tolerance: ${dateTolerance}).`,
          );
          if (matchConfidence === 'exact') matchConfidence = 'fuzzy';
        }
      }
    }

    // Link the evidence document to the transaction
    await this.prisma.spendTransaction.update({
      where: { id: input.transactionId },
      data: { evidenceDocId: invoiceDoc.id },
    });

    return {
      matched: matchConfidence !== 'none',
      transactionId: input.transactionId,
      invoiceRef: input.invoiceRef,
      matchConfidence,
      discrepancies,
    };
  }

  // ── Network-Rule Compliance Check ────────────────────────────

  /**
   * Check whether a transaction complies with Visa/Mastercard
   * commercial card network rules.
   *
   * Violations:
   *   1. Cash-like MCC on a business card
   *   2. Personal-use category (groceries, entertainment, etc.)
   *   3. Gambling MCC
   *   4. Suspicious payment-rail MCC (crypto, P2P, wire)
   */
  checkNetworkRuleCompliance(tx: SpendTransaction): NetworkRuleCheckResult {
    const violations: string[] = [];

    if (tx.isCashLike) {
      violations.push(
        `MCC ${tx.mcc ?? 'unknown'} (${tx.mccCategory ?? 'cash-like'}) violates ` +
        `Visa/Mastercard commercial card rules — cash advances prohibited on business programs.`,
      );
    }

    if (tx.mccCategory && PERSONAL_USE_CATEGORIES.has(tx.mccCategory) && !tx.isCashLike) {
      violations.push(
        `Category "${tx.mccCategory}" indicates potential personal-use spend — ` +
        `prohibited under commercial card network rules without documented business purpose.`,
      );
    }

    // Amount threshold for personal-use grocery/retail without substantiation
    if (
      tx.mccCategory === 'personal_likely' &&
      Number(tx.amount) > 200 &&
      !tx.businessPurpose
    ) {
      violations.push(
        `Large personal-likely transaction ($${Number(tx.amount).toFixed(2)}) lacks ` +
        `required business-purpose documentation.`,
      );
    }

    return {
      transactionId: tx.id,
      isCompliant: violations.length === 0,
      violations,
      category: tx.mccCategory,
    };
  }

  /**
   * Batch check all transactions for a business over a period and
   * return those with network-rule violations.
   */
  async getNetworkRuleViolations(
    tenantId: string,
    businessId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<NetworkRuleCheckResult[]> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new Error(`Business ${businessId} not found for tenant ${tenantId}.`);
    }

    const where: Record<string, unknown> = {
      tenantId,
      businessId,
      OR: [
        { isCashLike: true },
        { mccCategory: { in: Array.from(PERSONAL_USE_CATEGORIES) } },
      ],
    };

    if (startDate || endDate) {
      const dateRange: Record<string, Date> = {};
      if (startDate) dateRange['gte'] = new Date(startDate);
      if (endDate) dateRange['lte'] = new Date(endDate);
      where['transactionDate'] = dateRange;
    }

    const transactions = await this.prisma.spendTransaction.findMany({
      where: where as Parameters<typeof this.prisma.spendTransaction.findMany>[0]['where'],
      orderBy: { transactionDate: 'desc' },
    });

    return transactions.map((tx) => this.checkNetworkRuleCompliance(tx));
  }

  // ── Tax Substantiation Export ────────────────────────────────

  /**
   * Generate a tax substantiation export for a business over a date range.
   *
   * Output structure mirrors IRS Schedule C line items and includes:
   *   • Per-transaction detail: date, merchant, MCC, amount, purpose,
   *     deductibility, Schedule C line, evidence document reference
   *   • Aggregate summary by tax category
   *   • Flag for records missing evidence documentation
   *
   * The export JSON can be handed directly to the business's accountant
   * or imported into tax-prep software.
   */
  async exportTaxSubstantiation(
    tenantId: string,
    businessId: string,
    startDate: string,
    endDate: string,
  ): Promise<TaxExportResult> {
    const svc = logger.child({
      service: 'BusinessPurposeEvidenceService',
      tenantId,
      businessId,
    });

    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new Error(`Business ${businessId} not found for tenant ${tenantId}.`);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('startDate and endDate must be valid ISO date strings.');
    }
    if (start > end) {
      throw new Error('startDate must be before endDate.');
    }

    const transactions = await this.prisma.spendTransaction.findMany({
      where: {
        tenantId,
        businessId,
        transactionDate: { gte: start, lte: end },
      },
      orderBy: { transactionDate: 'asc' },
    });

    svc.info('Generating tax substantiation export', {
      transactionCount: transactions.length,
      startDate,
      endDate,
    });

    const lines: TaxExportLine[] = [];
    const categoryAccumulator: Record<string, CategorySummary> = {};

    let totalDeductible = 0;
    let totalNonDeductible = 0;
    let requiresSubstantiationCount = 0;
    let missingEvidenceCount = 0;

    for (const tx of transactions) {
      const category = this.resolvePurposeCategory(tx.mccCategory);
      const taxCategory = category?.taxCategory ?? 'other_expenses';
      const scheduleC_line = category?.scheduleC_line ?? null;
      const isDeductible = category?.isDeductible ?? null;
      const requiresSub = category?.requiresSubstantiation ?? false;

      // Calculate deductible amount (apply limit % where applicable)
      const amount = Number(tx.amount);
      let deductibleAmount: number | null = null;

      if (isDeductible === true) {
        const limit = category?.limitPercent;
        deductibleAmount = limit != null ? amount * (limit / 100) : amount;
        totalDeductible += deductibleAmount;
      } else if (isDeductible === false) {
        totalNonDeductible += amount;
      }

      if (requiresSub) requiresSubstantiationCount++;
      if (requiresSub && !tx.evidenceDocId && !tx.businessPurpose) {
        missingEvidenceCount++;
      }

      // Accumulate category summary
      if (!categoryAccumulator[taxCategory]) {
        categoryAccumulator[taxCategory] = {
          count: 0,
          totalAmount: 0,
          deductibleAmount: 0,
          taxCategory,
          scheduleC_line,
        };
      }
      categoryAccumulator[taxCategory].count++;
      categoryAccumulator[taxCategory].totalAmount += amount;
      if (deductibleAmount != null) {
        categoryAccumulator[taxCategory].deductibleAmount += deductibleAmount;
      }

      lines.push({
        transactionId: tx.id,
        transactionDate: tx.transactionDate.toISOString().slice(0, 10),
        merchantName: tx.merchantName,
        mcc: tx.mcc,
        mccCategory: tx.mccCategory,
        amount,
        businessPurpose: tx.businessPurpose,
        taxCategory,
        scheduleC_line,
        isDeductible,
        deductibleAmount,
        requiresSubstantiation: requiresSub,
        evidenceDocId: tx.evidenceDocId,
        flagged: tx.flagged,
        flagReason: tx.flagReason,
      });
    }

    const totalAmount = transactions.reduce((s, t) => s + Number(t.amount), 0);

    return {
      businessId,
      exportedAt: new Date().toISOString(),
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      lines,
      summary: {
        totalTransactions: transactions.length,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        deductibleAmount: parseFloat(totalDeductible.toFixed(2)),
        nonDeductibleAmount: parseFloat(totalNonDeductible.toFixed(2)),
        requiresSubstantiationCount,
        missingEvidenceCount,
        byCategory: categoryAccumulator,
      },
    };
  }
}
