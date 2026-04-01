// ============================================================
// CapitalForge — Stripe Billing Sync
//
// Responsibilities:
//   • Bridge between CapitalForge Invoice records (revenue-ops) and
//     Stripe Invoices / Charges
//   • createStripeInvoiceFromLocal — push a local invoice to Stripe and
//     record the resulting Stripe IDs back on the local record
//   • reconcilePaymentStatus — pull the current Stripe payment state and
//     sync it back to the local invoice status
//   • syncRefund — issue a Stripe refund and update the local refundedAmount
//
// Domain:
//   All monetary values in the CapitalForge Invoice domain are in dollars.
//   Stripe requires cents — this module converts at the boundary.
// ============================================================

import { AppError } from '../../middleware/error-handler.js';
import {
  Invoice,
  InvoiceStatus,
} from '../../services/revenue-ops.service.js';
import { stripeClient, getStripeClient, mapStripeError } from './stripe-client.js';
import logger from '../../config/logger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert dollars (float) to Stripe cents (integer). */
function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

// ── Input / Output types ──────────────────────────────────────────────────────

export interface SyncInvoiceResult {
  localInvoiceId: string;
  stripeInvoiceId: string;
  stripeCustomerId: string;
  stripePaymentIntentId: string | null;
  syncedAt: Date;
}

export interface ReconcileResult {
  localInvoiceId: string;
  stripeInvoiceId: string;
  /** Resolved status to write back to the local invoice */
  resolvedStatus: InvoiceStatus;
  /** Stripe payment intent status, if present */
  stripePaymentStatus: string | null;
  reconciledAt: Date;
}

export interface RefundSyncResult {
  localInvoiceId: string;
  stripeRefundId: string;
  refundedAmountDollars: number;
  /** Total cumulative refunded amount after this refund */
  totalRefundedDollars: number;
  syncedAt: Date;
}

// ── StripeBillingSync ──────────────────────────────────────────────────────────

export class StripeBillingSync {
  /**
   * Push a local CapitalForge Invoice to Stripe.
   *
   * Rules:
   *   - Invoice must be in 'issued' or 'draft' status.
   *   - Invoice must have a stripeCustomerId embedded in its metadata or
   *     supplied via the `stripeCustomerId` override parameter.
   *   - Converts dollar amounts to cents at the Stripe boundary.
   *   - Returns the Stripe invoice / payment intent IDs so the caller can
   *     persist them back on the local record.
   */
  async createStripeInvoiceFromLocal(
    invoice: Invoice,
    stripeCustomerId: string,
    idempotencyKey?: string,
  ): Promise<SyncInvoiceResult> {
    if (invoice.status === 'paid' || invoice.status === 'void') {
      throw new AppError(
        409,
        'INVOICE_ALREADY_SETTLED',
        `Invoice ${invoice.id} is already ${invoice.status} and cannot be pushed to Stripe.`,
      );
    }

    logger.info('[StripeBillingSync] createStripeInvoiceFromLocal', {
      localInvoiceId: invoice.id,
      tenantId: invoice.tenantId,
      amount: invoice.amount,
    });

    const lineItems = invoice.lineItems.length > 0
      ? invoice.lineItems.map((li) => ({
          description: li.description,
          amountCents: toCents(li.totalAmount),
          quantity: li.quantity,
        }))
      : [
          {
            description: `Invoice ${invoice.invoiceNumber}`,
            amountCents: toCents(invoice.amount),
            quantity: 1,
          },
        ];

    const stripeInvoice = await stripeClient.createInvoice({
      stripeCustomerId,
      lineItems,
      daysUntilDue: invoice.dueDate
        ? Math.max(
            1,
            Math.ceil(
              (invoice.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            ),
          )
        : 30,
      tenantId: invoice.tenantId,
      localInvoiceId: invoice.id,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.type,
        businessId: invoice.businessId,
      },
      idempotencyKey,
    });

    const paymentIntentId =
      typeof stripeInvoice.payment_intent === 'string'
        ? stripeInvoice.payment_intent
        : (stripeInvoice.payment_intent?.id ?? null);

    return {
      localInvoiceId: invoice.id,
      stripeInvoiceId: stripeInvoice.id,
      stripeCustomerId,
      stripePaymentIntentId: paymentIntentId,
      syncedAt: new Date(),
    };
  }

  /**
   * Reconcile a local invoice's payment status against its Stripe invoice.
   *
   * Maps Stripe invoice statuses to CapitalForge InvoiceStatus:
   *   'paid'   → 'paid'
   *   'void'   → 'void'
   *   'open'   + past due date → 'overdue'
   *   'open'   + not past due  → current status (no change)
   *   'draft'  → current status (not yet finalised; no change)
   *   'uncollectible' → 'overdue'
   */
  async reconcilePaymentStatus(
    invoice: Invoice,
    stripeInvoiceId: string,
  ): Promise<ReconcileResult> {
    logger.info('[StripeBillingSync] reconcilePaymentStatus', {
      localInvoiceId: invoice.id,
      stripeInvoiceId,
    });

    const stripeInvoice = await this._retrieveStripeInvoice(stripeInvoiceId);

    let resolvedStatus: InvoiceStatus = invoice.status;
    let stripePaymentStatus: string | null = null;

    // Resolve payment intent status for open invoices
    if (stripeInvoice.payment_intent) {
      const piId =
        typeof stripeInvoice.payment_intent === 'string'
          ? stripeInvoice.payment_intent
          : stripeInvoice.payment_intent.id;
      const { status } = await stripeClient.getPaymentStatus(piId);
      stripePaymentStatus = status;
    }

    switch (stripeInvoice.status) {
      case 'paid':
        resolvedStatus = 'paid';
        break;
      case 'void':
        resolvedStatus = 'void';
        break;
      case 'uncollectible':
        resolvedStatus = 'overdue';
        break;
      case 'open': {
        const dueMs = stripeInvoice.due_date ? stripeInvoice.due_date * 1000 : null;
        if (dueMs !== null && dueMs < Date.now()) {
          resolvedStatus = 'overdue';
        }
        // stripePaymentStatus already captured above
        if (stripePaymentStatus === 'succeeded') {
          resolvedStatus = 'paid';
        }
        break;
      }
      default:
        // 'draft' — leave status unchanged
        break;
    }

    return {
      localInvoiceId: invoice.id,
      stripeInvoiceId,
      resolvedStatus,
      stripePaymentStatus,
      reconciledAt: new Date(),
    };
  }

  /**
   * Issue a Stripe refund for an already-paid invoice and return updated
   * refund totals so the caller can persist them.
   *
   * Validates:
   *   - Invoice must be in 'paid' status.
   *   - Requested refund must not exceed the net refundable amount
   *     (amount − already refunded).
   */
  async syncRefund(
    invoice: Invoice,
    stripePaymentIntentId: string,
    refundAmountDollars: number,
    idempotencyKey?: string,
  ): Promise<RefundSyncResult> {
    if (invoice.status !== 'paid') {
      throw new AppError(
        409,
        'INVOICE_NOT_PAID',
        `Cannot refund invoice ${invoice.id} — status is '${invoice.status}', expected 'paid'.`,
      );
    }

    const netRefundable = invoice.amount - invoice.refundedAmount;
    if (refundAmountDollars > netRefundable) {
      throw new AppError(
        400,
        'REFUND_EXCEEDS_BALANCE',
        `Requested refund of $${refundAmountDollars.toFixed(2)} exceeds the refundable balance of $${netRefundable.toFixed(2)} on invoice ${invoice.id}.`,
        { requestedDollars: refundAmountDollars, refundableDollars: netRefundable },
      );
    }

    logger.info('[StripeBillingSync] syncRefund', {
      localInvoiceId: invoice.id,
      paymentIntentId: stripePaymentIntentId,
      refundAmountDollars,
    });

    const stripeRefund = await stripeClient.createRefund({
      stripePaymentIntentId,
      amountCents: toCents(refundAmountDollars),
      reason: 'requested_by_customer',
      tenantId: invoice.tenantId,
      localInvoiceId: invoice.id,
      idempotencyKey,
    });

    const totalRefundedDollars = invoice.refundedAmount + refundAmountDollars;

    return {
      localInvoiceId: invoice.id,
      stripeRefundId: stripeRefund.id,
      refundedAmountDollars: refundAmountDollars,
      totalRefundedDollars,
      syncedAt: new Date(),
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _retrieveStripeInvoice(stripeInvoiceId: string) {
    try {
      return await getStripeClient().invoices.retrieve(stripeInvoiceId, {
        expand: ['payment_intent'],
      });
    } catch (err) {
      throw mapStripeError(err);
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const stripeBillingSync = new StripeBillingSync();
