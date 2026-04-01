// ============================================================
// CapitalForge — Stripe Webhook Handler
//
// Responsibilities:
//   • Verify incoming Stripe webhook signatures (STRIPE_WEBHOOK_SECRET)
//   • Deserialise and type-narrow each event
//   • Route each event to the domain event bus
//   • Update local Invoice records on payment lifecycle transitions
//
// Supported events:
//   invoice.paid
//   invoice.payment_failed
//   customer.subscription.updated
//   customer.subscription.deleted
//   payment_intent.succeeded
//   payment_intent.payment_failed
// ============================================================

import Stripe from 'stripe';
import { Request, Response } from 'express';
import { AppError } from '../../middleware/error-handler.js';
import { eventBus } from '../../events/event-bus.js';
import { getStripeClient, mapStripeError } from './stripe-client.js';
import logger from '../../config/logger.js';

// ── Config ────────────────────────────────────────────────────────────────────

const STRIPE_WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';

// ── Supported event names ─────────────────────────────────────────────────────

export const STRIPE_EVENT_TYPES = {
  INVOICE_PAID: 'invoice.paid',
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
  SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
  SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
  PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded',
  PAYMENT_INTENT_FAILED: 'payment_intent.payment_failed',
} as const;

export type StripeEventType = (typeof STRIPE_EVENT_TYPES)[keyof typeof STRIPE_EVENT_TYPES];

// ── Invoice status update shape ───────────────────────────────────────────────
// Represents an in-memory patch applied to CapitalForge Invoice records.
// In production this is a Prisma update; here we publish to the event bus so
// downstream services can apply the change.

export interface InvoiceStatusUpdate {
  localInvoiceId: string;
  stripeInvoiceId: string;
  newStatus: 'paid' | 'payment_failed' | 'void';
  stripePaymentIntentId: string | null;
  paidAt: Date | null;
}

export interface SubscriptionUpdate {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  canceledAt: Date | null;
  metadata: Stripe.Metadata;
}

export interface WebhookProcessResult {
  eventId: string;
  eventType: string;
  handled: boolean;
  detail?: string;
}

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Verify the Stripe-Signature header and return the parsed event.
 * Throws AppError(400) if signature is missing or invalid.
 * Throws AppError(500) if STRIPE_WEBHOOK_SECRET is not configured.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  webhookSecret?: string,
): Stripe.Event {
  const secret = webhookSecret ?? STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppError(
      500,
      'STRIPE_WEBHOOK_SECRET_MISSING',
      'STRIPE_WEBHOOK_SECRET is not configured.',
    );
  }
  if (!signatureHeader) {
    throw new AppError(400, 'STRIPE_SIGNATURE_MISSING', 'Missing Stripe-Signature header.');
  }
  try {
    return getStripeClient().webhooks.constructEvent(rawBody, signatureHeader, secret);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
      throw new AppError(
        400,
        'STRIPE_SIGNATURE_INVALID',
        'Webhook signature verification failed.',
        { message: err.message },
      );
    }
    throw mapStripeError(err);
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────────

async function handleInvoicePaid(event: Stripe.Event): Promise<WebhookProcessResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const localInvoiceId = invoice.metadata?.localInvoiceId ?? '';
  const tenantId = invoice.metadata?.tenantId ?? 'unknown';

  const update: InvoiceStatusUpdate = {
    localInvoiceId,
    stripeInvoiceId: invoice.id,
    newStatus: 'paid',
    stripePaymentIntentId:
      typeof invoice.payment_intent === 'string'
        ? invoice.payment_intent
        : (invoice.payment_intent?.id ?? null),
    paidAt: new Date(),
  };

  logger.info('[StripeWebhooks] invoice.paid', {
    stripeInvoiceId: invoice.id,
    localInvoiceId,
    tenantId,
  });

  await eventBus.publish(tenantId, {
    eventType: 'stripe.invoice.paid',
    aggregateType: 'invoice',
    aggregateId: localInvoiceId || invoice.id,
    payload: { update, stripeEvent: { id: event.id, type: event.type } },
  });

  return { eventId: event.id, eventType: event.type, handled: true };
}

async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<WebhookProcessResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const localInvoiceId = invoice.metadata?.localInvoiceId ?? '';
  const tenantId = invoice.metadata?.tenantId ?? 'unknown';

  const update: InvoiceStatusUpdate = {
    localInvoiceId,
    stripeInvoiceId: invoice.id,
    newStatus: 'payment_failed',
    stripePaymentIntentId:
      typeof invoice.payment_intent === 'string'
        ? invoice.payment_intent
        : (invoice.payment_intent?.id ?? null),
    paidAt: null,
  };

  logger.warn('[StripeWebhooks] invoice.payment_failed', {
    stripeInvoiceId: invoice.id,
    localInvoiceId,
    tenantId,
  });

  await eventBus.publish(tenantId, {
    eventType: 'stripe.invoice.payment_failed',
    aggregateType: 'invoice',
    aggregateId: localInvoiceId || invoice.id,
    payload: { update, stripeEvent: { id: event.id, type: event.type } },
  });

  return { eventId: event.id, eventType: event.type, handled: true };
}

async function handleSubscriptionUpdated(event: Stripe.Event): Promise<WebhookProcessResult> {
  const sub = event.data.object as Stripe.Subscription;
  const tenantId = sub.metadata?.tenantId ?? 'unknown';

  const update: SubscriptionUpdate = {
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    metadata: sub.metadata,
  };

  logger.info('[StripeWebhooks] customer.subscription.updated', {
    subscriptionId: sub.id,
    status: sub.status,
    tenantId,
  });

  await eventBus.publish(tenantId, {
    eventType: 'stripe.subscription.updated',
    aggregateType: 'subscription',
    aggregateId: sub.id,
    payload: { update, stripeEvent: { id: event.id, type: event.type } },
  });

  return { eventId: event.id, eventType: event.type, handled: true };
}

async function handleSubscriptionDeleted(event: Stripe.Event): Promise<WebhookProcessResult> {
  const sub = event.data.object as Stripe.Subscription;
  const tenantId = sub.metadata?.tenantId ?? 'unknown';

  const update: SubscriptionUpdate = {
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    metadata: sub.metadata,
  };

  logger.info('[StripeWebhooks] customer.subscription.deleted', {
    subscriptionId: sub.id,
    tenantId,
  });

  await eventBus.publish(tenantId, {
    eventType: 'stripe.subscription.deleted',
    aggregateType: 'subscription',
    aggregateId: sub.id,
    payload: { update, stripeEvent: { id: event.id, type: event.type } },
  });

  return { eventId: event.id, eventType: event.type, handled: true };
}

async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<WebhookProcessResult> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const tenantId = pi.metadata?.tenantId ?? 'unknown';

  logger.info('[StripeWebhooks] payment_intent.succeeded', {
    paymentIntentId: pi.id,
    amountReceived: pi.amount_received,
    tenantId,
  });

  await eventBus.publish(tenantId, {
    eventType: 'stripe.payment_intent.succeeded',
    aggregateType: 'payment_intent',
    aggregateId: pi.id,
    payload: {
      paymentIntentId: pi.id,
      amountCents: pi.amount_received,
      currency: pi.currency,
      metadata: pi.metadata,
      stripeEvent: { id: event.id, type: event.type },
    },
  });

  return { eventId: event.id, eventType: event.type, handled: true };
}

async function handlePaymentIntentFailed(event: Stripe.Event): Promise<WebhookProcessResult> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const tenantId = pi.metadata?.tenantId ?? 'unknown';

  logger.warn('[StripeWebhooks] payment_intent.payment_failed', {
    paymentIntentId: pi.id,
    lastPaymentError: pi.last_payment_error?.message,
    tenantId,
  });

  await eventBus.publish(tenantId, {
    eventType: 'stripe.payment_intent.failed',
    aggregateType: 'payment_intent',
    aggregateId: pi.id,
    payload: {
      paymentIntentId: pi.id,
      failureMessage: pi.last_payment_error?.message ?? 'Payment failed',
      failureCode: pi.last_payment_error?.code,
      metadata: pi.metadata,
      stripeEvent: { id: event.id, type: event.type },
    },
  });

  return { eventId: event.id, eventType: event.type, handled: true };
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Route a verified Stripe event to the appropriate handler.
 * Returns a result object so callers can log/respond without knowing internals.
 */
export async function routeStripeEvent(event: Stripe.Event): Promise<WebhookProcessResult> {
  switch (event.type) {
    case STRIPE_EVENT_TYPES.INVOICE_PAID:
      return handleInvoicePaid(event);
    case STRIPE_EVENT_TYPES.INVOICE_PAYMENT_FAILED:
      return handleInvoicePaymentFailed(event);
    case STRIPE_EVENT_TYPES.SUBSCRIPTION_UPDATED:
      return handleSubscriptionUpdated(event);
    case STRIPE_EVENT_TYPES.SUBSCRIPTION_DELETED:
      return handleSubscriptionDeleted(event);
    case STRIPE_EVENT_TYPES.PAYMENT_INTENT_SUCCEEDED:
      return handlePaymentIntentSucceeded(event);
    case STRIPE_EVENT_TYPES.PAYMENT_INTENT_FAILED:
      return handlePaymentIntentFailed(event);
    default:
      logger.debug('[StripeWebhooks] unhandled event type', { type: event.type, id: event.id });
      return {
        eventId: event.id,
        eventType: event.type,
        handled: false,
        detail: 'Event type not handled',
      };
  }
}

// ── Express route handler ─────────────────────────────────────────────────────

/**
 * Express middleware for the POST /webhooks/stripe endpoint.
 *
 * Requirements:
 *   • The route must be registered BEFORE express.json() so the raw body is preserved.
 *   • Express must be configured with `express.raw({ type: 'application/json' })` on
 *     this route (or globally for the webhooks path).
 *
 * Example registration:
 *   app.post(
 *     '/webhooks/stripe',
 *     express.raw({ type: 'application/json' }),
 *     stripeWebhookHandler,
 *   );
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers['stripe-signature'] as string | undefined;

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(req.body as Buffer, signature);
  } catch (err) {
    const appErr = err instanceof AppError ? err : new AppError(400, 'WEBHOOK_ERROR', String(err));
    logger.warn('[StripeWebhooks] signature verification failed', {
      code: appErr.code,
      message: appErr.message,
    });
    res.status(appErr.statusCode).json({ error: appErr.message });
    return;
  }

  try {
    const result = await routeStripeEvent(event);
    res.status(200).json({ received: true, ...result });
  } catch (err) {
    logger.error('[StripeWebhooks] handler error', { eventId: event.id, err });
    res.status(500).json({ error: 'Internal webhook processing error' });
  }
}
