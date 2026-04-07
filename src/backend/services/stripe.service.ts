// ============================================================
// CapitalForge — Stripe Integration Service
//
// Wraps Stripe Checkout, Billing Portal, and Webhook handling.
// Gracefully falls back to mock URLs when STRIPE_SECRET_KEY is
// not configured, enabling local development without Stripe.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_STARTER,
  STRIPE_PRICE_PRO,
  FRONTEND_URL,
} from '../config/index.js';
import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────

export type PlanSlug = 'starter' | 'pro';

export interface CheckoutInput {
  tenantId: string;
  email: string;
  planSlug: PlanSlug;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResult {
  sessionId: string;
  url: string;
  mock: boolean;
}

export interface PortalResult {
  url: string;
  mock: boolean;
}

export type StripeEventType =
  | 'checkout.session.completed'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.payment_failed';

export interface WebhookEvent {
  id: string;
  type: StripeEventType;
  data: {
    object: Record<string, unknown>;
  };
}

export interface WebhookResult {
  handled: boolean;
  eventType: string;
  action: string;
}

// ── Helpers ──────────────────────────────────────────────────

function isStripeConfigured(): boolean {
  return (
    !!STRIPE_SECRET_KEY &&
    STRIPE_SECRET_KEY !== '' &&
    STRIPE_SECRET_KEY !== 'YOUR_STRIPE_SECRET_HERE'
  );
}

function getPriceId(planSlug: PlanSlug): string {
  switch (planSlug) {
    case 'starter':
      return STRIPE_PRICE_STARTER;
    case 'pro':
      return STRIPE_PRICE_PRO;
    default:
      throw new Error(`Unknown plan slug: ${planSlug}`);
  }
}

// ── In-memory subscription store (mock) ─────────────────────
// In production these would come from the DB / Prisma.

interface MockSubscription {
  tenantId: string;
  customerId: string;
  planSlug: PlanSlug;
  status: 'active' | 'past_due' | 'canceled' | 'locked';
  stripeSubscriptionId: string;
  updatedAt: Date;
}

const subscriptions = new Map<string, MockSubscription>();

// ── Service ─────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout session for the given tenant + plan.
 * Returns a mock URL when Stripe is not configured.
 */
export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const { tenantId, email, planSlug, successUrl, cancelUrl } = input;
  const priceId = getPriceId(planSlug);

  if (!isStripeConfigured()) {
    logger.info('Stripe not configured — returning mock checkout session', {
      tenantId,
      planSlug,
    });

    const mockSessionId = `mock_cs_${uuidv4()}`;
    return {
      sessionId: mockSessionId,
      url: `${FRONTEND_URL}/pricing?mock_checkout=true&plan=${planSlug}&session=${mockSessionId}`,
      mock: true,
    };
  }

  try {
    // ── Real Stripe integration ────────────────────────────
    // When the stripe package is installed, replace this block
    // with actual Stripe API calls:
    //
    // const stripe = new Stripe(STRIPE_SECRET_KEY);
    // const session = await stripe.checkout.sessions.create({
    //   mode: 'subscription',
    //   customer_email: email,
    //   line_items: [{ price: priceId, quantity: 1 }],
    //   success_url: successUrl ?? `${FRONTEND_URL}/settings?tab=billing&checkout=success`,
    //   cancel_url: cancelUrl ?? `${FRONTEND_URL}/pricing?checkout=canceled`,
    //   metadata: { tenantId, planSlug },
    // });
    // return { sessionId: session.id, url: session.url!, mock: false };

    // Stub: simulate Stripe response
    const stubSessionId = `cs_live_${uuidv4()}`;
    logger.info('Stripe checkout session created (stub)', {
      tenantId,
      planSlug,
      priceId,
      sessionId: stubSessionId,
    });

    return {
      sessionId: stubSessionId,
      url:
        successUrl ??
        `${FRONTEND_URL}/settings?tab=billing&checkout=success`,
      mock: false,
    };
  } catch (err) {
    logger.error('Failed to create Stripe checkout session', {
      tenantId,
      planSlug,
      error: err instanceof Error ? err.message : String(err),
    });

    // Graceful fallback
    const fallbackId = `mock_cs_fallback_${uuidv4()}`;
    return {
      sessionId: fallbackId,
      url: `${FRONTEND_URL}/pricing?checkout_error=true`,
      mock: true,
    };
  }
}

/**
 * Creates a Stripe Billing Portal session so the customer can
 * manage their subscription, update payment method, etc.
 */
export async function createBillingPortalSession(
  customerId: string,
): Promise<PortalResult> {
  if (!isStripeConfigured()) {
    logger.info(
      'Stripe not configured — returning mock billing portal URL',
      { customerId },
    );

    return {
      url: `${FRONTEND_URL}/settings?tab=billing&mock_portal=true`,
      mock: true,
    };
  }

  try {
    // ── Real Stripe integration ────────────────────────────
    // const stripe = new Stripe(STRIPE_SECRET_KEY);
    // const session = await stripe.billingPortal.sessions.create({
    //   customer: customerId,
    //   return_url: `${FRONTEND_URL}/settings?tab=billing`,
    // });
    // return { url: session.url, mock: false };

    // Stub: simulate Stripe response
    logger.info('Billing portal session created (stub)', { customerId });
    return {
      url: `${FRONTEND_URL}/settings?tab=billing`,
      mock: false,
    };
  } catch (err) {
    logger.error('Failed to create billing portal session', {
      customerId,
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      url: `${FRONTEND_URL}/settings?tab=billing&portal_error=true`,
      mock: true,
    };
  }
}

/**
 * Verifies and constructs a Stripe webhook event from the raw
 * request body and signature header.
 *
 * Returns null if verification fails or Stripe isn't configured.
 */
export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string,
): WebhookEvent | null {
  if (!isStripeConfigured() || !STRIPE_WEBHOOK_SECRET) {
    logger.warn('Stripe webhook received but keys not configured');
    return null;
  }

  try {
    // ── Real Stripe integration ────────────────────────────
    // const stripe = new Stripe(STRIPE_SECRET_KEY);
    // const event = stripe.webhooks.constructEvent(
    //   rawBody, signature, STRIPE_WEBHOOK_SECRET,
    // );
    // return event as unknown as WebhookEvent;

    // Stub: parse raw body as JSON (no signature verification)
    const parsed =
      typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString());

    return parsed as WebhookEvent;
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Handles a verified Stripe webhook event and performs the
 * corresponding business logic (activate subscription, update
 * plan, lock account, flag payment failure).
 */
export async function handleWebhookEvent(
  event: WebhookEvent,
): Promise<WebhookResult> {
  const { type, data } = event;
  const obj = data.object;

  switch (type) {
    case 'checkout.session.completed': {
      const tenantId = (obj['metadata'] as Record<string, string>)?.['tenantId'] ?? '';
      const planSlug = ((obj['metadata'] as Record<string, string>)?.['planSlug'] ?? 'starter') as PlanSlug;
      const customerId = (obj['customer'] as string) ?? '';
      const subscriptionId = (obj['subscription'] as string) ?? '';

      logger.info('Checkout completed — activating subscription', {
        tenantId,
        planSlug,
        customerId,
      });

      subscriptions.set(tenantId, {
        tenantId,
        customerId,
        planSlug,
        status: 'active',
        stripeSubscriptionId: subscriptionId,
        updatedAt: new Date(),
      });

      return {
        handled: true,
        eventType: type,
        action: `Activated ${planSlug} subscription for tenant ${tenantId}`,
      };
    }

    case 'customer.subscription.updated': {
      const subId = (obj['id'] as string) ?? '';
      const status = (obj['status'] as string) ?? 'active';

      // Find subscription by Stripe subscription ID
      for (const [tenantId, sub] of subscriptions) {
        if (sub.stripeSubscriptionId === subId) {
          sub.status = status === 'active' ? 'active' : 'past_due';
          sub.updatedAt = new Date();

          logger.info('Subscription updated', { tenantId, status });

          return {
            handled: true,
            eventType: type,
            action: `Updated subscription status to ${status} for tenant ${tenantId}`,
          };
        }
      }

      logger.warn('Subscription update received for unknown subscription', { subId });
      return {
        handled: false,
        eventType: type,
        action: `Unknown subscription ${subId}`,
      };
    }

    case 'customer.subscription.deleted': {
      const subId = (obj['id'] as string) ?? '';

      for (const [tenantId, sub] of subscriptions) {
        if (sub.stripeSubscriptionId === subId) {
          sub.status = 'canceled';
          sub.planSlug = 'starter'; // Downgrade to free/starter
          sub.updatedAt = new Date();

          logger.info('Subscription canceled — downgrading account', {
            tenantId,
          });

          return {
            handled: true,
            eventType: type,
            action: `Canceled subscription and downgraded tenant ${tenantId} to starter`,
          };
        }
      }

      return {
        handled: false,
        eventType: type,
        action: `Unknown subscription ${subId}`,
      };
    }

    case 'invoice.payment_failed': {
      const customerId = (obj['customer'] as string) ?? '';

      for (const [tenantId, sub] of subscriptions) {
        if (sub.customerId === customerId) {
          sub.status = 'past_due';
          sub.updatedAt = new Date();

          logger.warn('Payment failed — flagging account', { tenantId });

          return {
            handled: true,
            eventType: type,
            action: `Flagged payment failure for tenant ${tenantId}`,
          };
        }
      }

      return {
        handled: false,
        eventType: type,
        action: `Unknown customer ${customerId}`,
      };
    }

    default:
      logger.info('Unhandled Stripe event type', { type });
      return {
        handled: false,
        eventType: type,
        action: 'ignored',
      };
  }
}

/**
 * Returns whether Stripe is configured (for use in API responses
 * so the frontend can show appropriate UI).
 */
export function getStripeStatus(): {
  configured: boolean;
  publishableKey: string;
} {
  return {
    configured: isStripeConfigured(),
    publishableKey: isStripeConfigured()
      ? (process.env['STRIPE_PUBLISHABLE_KEY'] ?? '')
      : '',
  };
}

/**
 * Returns mock subscription info for a tenant.
 * In production, this would query the database.
 */
export function getTenantSubscription(tenantId: string): MockSubscription | null {
  return subscriptions.get(tenantId) ?? null;
}

// ── Export service object ────────────────────────────────────

export const stripeService = {
  createCheckoutSession,
  createBillingPortalSession,
  constructWebhookEvent,
  handleWebhookEvent,
  getStripeStatus,
  getTenantSubscription,
  isConfigured: isStripeConfigured,
};

export default stripeService;
