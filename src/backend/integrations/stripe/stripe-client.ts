// ============================================================
// CapitalForge — Stripe Client
//
// Responsibilities:
//   • Thin, typed wrapper around the Stripe Node SDK
//   • Idempotency keys on every mutating call (create/cancel/refund)
//   • Maps Stripe SDK errors → AppError with semantic codes
//   • All amounts in cents (Stripe convention); callers convert from dollars
// ============================================================

import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { AppError } from '../../middleware/error-handler.js';
import { STRIPE_SECRET_KEY } from '../../config/index.js';
import logger from '../../config/logger.js';

// ── Stripe SDK singleton ──────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!_stripe) {
    if (!STRIPE_SECRET_KEY) {
      throw new AppError(500, 'STRIPE_NOT_CONFIGURED', 'STRIPE_SECRET_KEY is not set.');
    }
    _stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
      telemetry: false,
    });
  }
  return _stripe;
}

/** Override the client — test-only (inject a mock). */
export function _setStripeClient(client: Stripe): void {
  _stripe = client;
}

// ── Error mapping ─────────────────────────────────────────────────────────────

/**
 * Convert a Stripe SDK error into a domain AppError.
 *
 * Stripe error types:
 *   StripeCardError       → 402 STRIPE_CARD_ERROR
 *   StripeInvalidRequestError → 400 STRIPE_INVALID_REQUEST
 *   StripeAuthenticationError → 401 STRIPE_AUTH_ERROR
 *   StripePermissionError → 403 STRIPE_PERMISSION_ERROR
 *   StripeRateLimitError  → 429 STRIPE_RATE_LIMIT
 *   StripeConnectionError → 503 STRIPE_CONNECTION_ERROR
 *   StripeAPIError        → 502 STRIPE_API_ERROR
 */
export function mapStripeError(err: unknown): AppError {
  if (err instanceof Stripe.errors.StripeCardError) {
    return new AppError(402, 'STRIPE_CARD_ERROR', err.message, {
      stripeCode: err.code,
      declineCode: err.decline_code,
    });
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return new AppError(400, 'STRIPE_INVALID_REQUEST', err.message, {
      stripeCode: err.code,
      param: err.param,
    });
  }
  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    return new AppError(401, 'STRIPE_AUTH_ERROR', err.message);
  }
  if (err instanceof Stripe.errors.StripePermissionError) {
    return new AppError(403, 'STRIPE_PERMISSION_ERROR', err.message);
  }
  if (err instanceof Stripe.errors.StripeRateLimitError) {
    return new AppError(429, 'STRIPE_RATE_LIMIT', err.message);
  }
  if (err instanceof Stripe.errors.StripeConnectionError) {
    return new AppError(503, 'STRIPE_CONNECTION_ERROR', err.message);
  }
  if (err instanceof Stripe.errors.StripeAPIError) {
    return new AppError(502, 'STRIPE_API_ERROR', err.message, {
      stripeCode: err.code,
    });
  }
  if (err instanceof Error) {
    return new AppError(500, 'STRIPE_UNEXPECTED_ERROR', err.message);
  }
  return new AppError(500, 'STRIPE_UNEXPECTED_ERROR', 'An unexpected Stripe error occurred.');
}

// ── Helper ────────────────────────────────────────────────────────────────────

/** Generate a deterministic idempotency key scoped to an operation and entity. */
export function makeIdempotencyKey(operation: string, entityId: string): string {
  return `${operation}:${entityId}:${randomUUID()}`;
}

// ── Input / Output types ──────────────────────────────────────────────────────

export interface CreateCustomerInput {
  email: string;
  name: string;
  /** Internal CapitalForge tenant ID — stored in Stripe metadata */
  tenantId: string;
  /** Internal CapitalForge business ID — stored in Stripe metadata */
  businessId: string;
  phone?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionInput {
  stripeCustomerId: string;
  /** Stripe Price ID from the product catalogue */
  priceId: string;
  tenantId: string;
  businessId: string;
  /** Trial period in days (optional) */
  trialDays?: number;
  metadata?: Record<string, string>;
  /** Caller-supplied idempotency key; auto-generated if omitted */
  idempotencyKey?: string;
}

export interface CreateInvoiceInput {
  stripeCustomerId: string;
  /** ISO 4217 currency code (default: 'usd') */
  currency?: string;
  /** Array of line items to add before finalising */
  lineItems: Array<{
    description: string;
    /** Amount in cents */
    amountCents: number;
    quantity?: number;
  }>;
  /** Days until invoice is due (default: 30) */
  daysUntilDue?: number;
  tenantId: string;
  localInvoiceId: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface CreatePaymentIntentInput {
  /** Amount in cents */
  amountCents: number;
  currency?: string;
  stripeCustomerId?: string;
  description?: string;
  tenantId: string;
  businessId: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface CancelSubscriptionInput {
  stripeSubscriptionId: string;
  /** 'immediately' (default) or 'at_period_end' */
  cancelAt?: 'immediately' | 'at_period_end';
  idempotencyKey?: string;
}

export interface CreateRefundInput {
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  /** Amount in cents; omit to refund full charge */
  amountCents?: number;
  reason?: Stripe.RefundCreateParams.Reason;
  tenantId: string;
  localInvoiceId?: string;
  idempotencyKey?: string;
}

export interface ListInvoicesInput {
  stripeCustomerId: string;
  /** Max number of invoices to return (default: 20, Stripe max: 100) */
  limit?: number;
  /** Pagination cursor — last invoice ID from previous page */
  startingAfter?: string;
}

// ── StripeClient ──────────────────────────────────────────────────────────────

export class StripeClient {
  private get stripe(): Stripe {
    return getStripeClient();
  }

  // ── Customers ───────────────────────────────────────────────────────────────

  async createCustomer(input: CreateCustomerInput): Promise<Stripe.Customer> {
    const idempotencyKey = makeIdempotencyKey('create_customer', input.businessId);
    logger.debug('[StripeClient] createCustomer', {
      businessId: input.businessId,
      tenantId: input.tenantId,
    });
    try {
      return await this.stripe.customers.create(
        {
          email: input.email,
          name: input.name,
          phone: input.phone,
          description: input.description,
          metadata: {
            tenantId: input.tenantId,
            businessId: input.businessId,
            ...input.metadata,
          },
        },
        { idempotencyKey },
      );
    } catch (err) {
      throw mapStripeError(err);
    }
  }

  // ── Subscriptions ────────────────────────────────────────────────────────────

  async createSubscription(input: CreateSubscriptionInput): Promise<Stripe.Subscription> {
    const idempotencyKey =
      input.idempotencyKey ??
      makeIdempotencyKey('create_subscription', input.stripeCustomerId);
    logger.debug('[StripeClient] createSubscription', {
      customerId: input.stripeCustomerId,
      priceId: input.priceId,
      tenantId: input.tenantId,
    });
    try {
      return await this.stripe.subscriptions.create(
        {
          customer: input.stripeCustomerId,
          items: [{ price: input.priceId }],
          trial_period_days: input.trialDays,
          metadata: {
            tenantId: input.tenantId,
            businessId: input.businessId,
            ...input.metadata,
          },
          expand: ['latest_invoice.payment_intent'],
        },
        { idempotencyKey },
      );
    } catch (err) {
      throw mapStripeError(err);
    }
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<Stripe.Subscription> {
    const idempotencyKey =
      input.idempotencyKey ??
      makeIdempotencyKey('cancel_subscription', input.stripeSubscriptionId);
    logger.debug('[StripeClient] cancelSubscription', {
      subscriptionId: input.stripeSubscriptionId,
      cancelAt: input.cancelAt,
    });
    try {
      if (input.cancelAt === 'at_period_end') {
        return await this.stripe.subscriptions.update(
          input.stripeSubscriptionId,
          { cancel_at_period_end: true },
          { idempotencyKey },
        );
      }
      return await this.stripe.subscriptions.cancel(input.stripeSubscriptionId);
    } catch (err) {
      throw mapStripeError(err);
    }
  }

  // ── Invoices ──────────────────────────────────────────────────────────────────

  async createInvoice(input: CreateInvoiceInput): Promise<Stripe.Invoice> {
    const idempotencyKey =
      input.idempotencyKey ??
      makeIdempotencyKey('create_invoice', input.localInvoiceId);
    logger.debug('[StripeClient] createInvoice', {
      customerId: input.stripeCustomerId,
      localInvoiceId: input.localInvoiceId,
      tenantId: input.tenantId,
    });
    try {
      // 1. Create the invoice shell
      const invoice = await this.stripe.invoices.create(
        {
          customer: input.stripeCustomerId,
          currency: input.currency ?? 'usd',
          days_until_due: input.daysUntilDue ?? 30,
          collection_method: 'send_invoice',
          metadata: {
            tenantId: input.tenantId,
            localInvoiceId: input.localInvoiceId,
            ...input.metadata,
          },
        },
        { idempotencyKey },
      );

      // 2. Attach line items
      for (const item of input.lineItems) {
        await this.stripe.invoiceItems.create({
          customer: input.stripeCustomerId,
          invoice: invoice.id,
          amount: item.amountCents,
          currency: input.currency ?? 'usd',
          description: item.description,
          quantity: item.quantity ?? 1,
        });
      }

      // 3. Finalise so it becomes payable
      return await this.stripe.invoices.finalizeInvoice(invoice.id);
    } catch (err) {
      throw mapStripeError(err);
    }
  }

  async listInvoices(input: ListInvoicesInput): Promise<Stripe.ApiList<Stripe.Invoice>> {
    logger.debug('[StripeClient] listInvoices', {
      customerId: input.stripeCustomerId,
    });
    try {
      return await this.stripe.invoices.list({
        customer: input.stripeCustomerId,
        limit: Math.min(input.limit ?? 20, 100),
        starting_after: input.startingAfter,
      });
    } catch (err) {
      throw mapStripeError(err);
    }
  }

  // ── Payment Intents ───────────────────────────────────────────────────────────

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<Stripe.PaymentIntent> {
    const idempotencyKey =
      input.idempotencyKey ??
      makeIdempotencyKey('create_payment_intent', input.businessId);
    logger.debug('[StripeClient] createPaymentIntent', {
      amountCents: input.amountCents,
      currency: input.currency ?? 'usd',
      tenantId: input.tenantId,
    });
    try {
      return await this.stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency ?? 'usd',
          customer: input.stripeCustomerId,
          description: input.description,
          automatic_payment_methods: { enabled: true },
          metadata: {
            tenantId: input.tenantId,
            businessId: input.businessId,
            ...input.metadata,
          },
        },
        { idempotencyKey },
      );
    } catch (err) {
      throw mapStripeError(err);
    }
  }

  async getPaymentStatus(
    paymentIntentId: string,
  ): Promise<{ status: Stripe.PaymentIntent.Status; paymentIntent: Stripe.PaymentIntent }> {
    logger.debug('[StripeClient] getPaymentStatus', { paymentIntentId });
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return { status: paymentIntent.status, paymentIntent };
    } catch (err) {
      throw mapStripeError(err);
    }
  }

  // ── Refunds ───────────────────────────────────────────────────────────────────

  async createRefund(input: CreateRefundInput): Promise<Stripe.Refund> {
    if (!input.stripePaymentIntentId && !input.stripeChargeId) {
      throw new AppError(
        400,
        'STRIPE_REFUND_MISSING_TARGET',
        'Either stripePaymentIntentId or stripeChargeId is required for a refund.',
      );
    }
    const refundTarget = input.stripePaymentIntentId ?? input.stripeChargeId!;
    const idempotencyKey =
      input.idempotencyKey ?? makeIdempotencyKey('create_refund', refundTarget);
    logger.debug('[StripeClient] createRefund', {
      paymentIntentId: input.stripePaymentIntentId,
      chargeId: input.stripeChargeId,
      amountCents: input.amountCents,
      tenantId: input.tenantId,
    });
    try {
      return await this.stripe.refunds.create(
        {
          payment_intent: input.stripePaymentIntentId,
          charge: input.stripeChargeId,
          amount: input.amountCents,
          reason: input.reason,
          metadata: {
            tenantId: input.tenantId,
            ...(input.localInvoiceId ? { localInvoiceId: input.localInvoiceId } : {}),
          },
        },
        { idempotencyKey },
      );
    } catch (err) {
      throw mapStripeError(err);
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const stripeClient = new StripeClient();
