// ============================================================
// CapitalForge — Stripe Integration Test Suite
//
// Covers (18 tests):
//   Customer Creation (2)
//     • createCustomer maps inputs and embeds tenant/business metadata
//     • createCustomer propagates Stripe SDK errors as AppError
//
//   Subscription Lifecycle (3)
//     • createSubscription calls Stripe with correct priceId and metadata
//     • cancelSubscription immediately cancels by default
//     • cancelSubscription defers to period end when requested
//
//   Payment Intents (2)
//     • createPaymentIntent uses provided amount in cents and auto-idempotency key
//     • getPaymentStatus returns status from retrieved PaymentIntent
//
//   Invoice Sync (3)
//     • createStripeInvoiceFromLocal creates Stripe invoice and returns IDs
//     • createStripeInvoiceFromLocal rejects already-paid invoices
//     • reconcilePaymentStatus maps 'paid' Stripe status to local 'paid'
//
//   Webhook Processing (3)
//     • verifyWebhookSignature throws on missing signature header
//     • verifyWebhookSignature throws when secret is not configured
//     • routeStripeEvent routes invoice.paid and publishes to event bus
//
//   Refund Handling (2)
//     • syncRefund creates Stripe refund and returns updated total
//     • syncRefund throws when refund exceeds invoice balance
//
//   Idempotency (1)
//     • makeIdempotencyKey generates unique keys scoped by operation+entity
//
//   Error Mapping (2)
//     • mapStripeError converts StripeCardError → 402 AppError
//     • mapStripeError converts StripeRateLimitError → 429 AppError
// ============================================================

import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest';
import Stripe from 'stripe';

// ── Modules under test ────────────────────────────────────────────────────────

import {
  StripeClient,
  makeIdempotencyKey,
  mapStripeError,
  _setStripeClient,
} from '../../../src/backend/integrations/stripe/stripe-client.js';
import {
  verifyWebhookSignature,
  routeStripeEvent,
  STRIPE_EVENT_TYPES,
} from '../../../src/backend/integrations/stripe/stripe-webhooks.js';
import {
  StripeBillingSync,
} from '../../../src/backend/integrations/stripe/stripe-billing-sync.js';
import { AppError } from '../../../src/backend/middleware/error-handler.js';
import { EventBus, eventBus } from '../../../src/backend/events/event-bus.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Stripe Customer-like object. */
function fakeCustomer(overrides: Partial<Stripe.Customer> = {}): Stripe.Customer {
  return {
    id: 'cus_test123',
    object: 'customer',
    created: Math.floor(Date.now() / 1000),
    email: 'test@example.com',
    name: 'Test Business',
    livemode: false,
    metadata: {},
    ...overrides,
  } as Stripe.Customer;
}

/** Build a minimal Stripe Subscription-like object. */
function fakeSubscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'sub_test123',
    object: 'subscription',
    customer: 'cus_test123',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: now + 30 * 86400,
    current_period_start: now,
    canceled_at: null,
    metadata: { tenantId: 'tenant-001', businessId: 'biz-001' },
    items: { data: [{ id: 'si_test', price: { id: 'price_test' } }] } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
    livemode: false,
    ...overrides,
  } as Stripe.Subscription;
}

/** Build a minimal Stripe PaymentIntent-like object. */
function fakePaymentIntent(
  status: Stripe.PaymentIntent.Status = 'succeeded',
  overrides: Partial<Stripe.PaymentIntent> = {},
): Stripe.PaymentIntent {
  return {
    id: 'pi_test123',
    object: 'payment_intent',
    amount: 250000,
    amount_received: status === 'succeeded' ? 250000 : 0,
    currency: 'usd',
    status,
    client_secret: 'pi_test_secret',
    metadata: { tenantId: 'tenant-001', businessId: 'biz-001' },
    livemode: false,
    last_payment_error: null,
    ...overrides,
  } as unknown as Stripe.PaymentIntent;
}

/** Build a minimal Stripe Invoice-like object. */
function fakeStripeInvoice(overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
  return {
    id: 'in_test123',
    object: 'invoice',
    customer: 'cus_test123',
    status: 'open',
    amount_due: 250000,
    amount_paid: 0,
    currency: 'usd',
    due_date: Math.floor(Date.now() / 1000) + 30 * 86400,
    payment_intent: 'pi_test123',
    metadata: { tenantId: 'tenant-001', localInvoiceId: 'inv-local-001' },
    livemode: false,
    ...overrides,
  } as unknown as Stripe.Invoice;
}

/** Build a minimal Stripe Refund-like object. */
function fakeRefund(overrides: Partial<Stripe.Refund> = {}): Stripe.Refund {
  return {
    id: 're_test123',
    object: 'refund',
    amount: 50000,
    currency: 'usd',
    payment_intent: 'pi_test123',
    status: 'succeeded',
    metadata: {},
    ...overrides,
  } as Stripe.Refund;
}

/** Build a local CapitalForge Invoice fixture. */
function fakeLocalInvoice(
  overrides: Partial<{
    id: string;
    tenantId: string;
    businessId: string;
    invoiceNumber: string;
    type: string;
    amount: number;
    lineItems: Array<{ description: string; quantity: number; unitAmount: number; totalAmount: number }>;
    status: string;
    issuedAt: Date | null;
    dueDate: Date | null;
    paidAt: Date | null;
    stripePaymentId: string | null;
    refundedAmount: number;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: 'inv-local-001',
    tenantId: 'tenant-001',
    businessId: 'biz-001',
    invoiceNumber: 'INV-TEST-001',
    type: 'program_fee' as const,
    amount: 2500,
    lineItems: [{ description: 'Program Fee', quantity: 1, unitAmount: 2500, totalAmount: 2500 }],
    status: 'issued' as const,
    issuedAt: new Date(),
    dueDate: new Date(Date.now() + 30 * 86400 * 1000),
    paidAt: null,
    stripePaymentId: null,
    refundedAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Build a fake Stripe SDK mock.
 * We only stub the methods we actually call.
 */
function buildStripeMock() {
  const mock = {
    customers: {
      create: vi.fn(),
    },
    subscriptions: {
      create: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
    },
    invoices: {
      create: vi.fn(),
      finalizeInvoice: vi.fn(),
      retrieve: vi.fn(),
      list: vi.fn(),
    },
    invoiceItems: {
      create: vi.fn(),
    },
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    refunds: {
      create: vi.fn(),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  return mock;
}

// ── Test Setup ────────────────────────────────────────────────────────────────

describe('Stripe Integration', () => {
  let stripeMock: ReturnType<typeof buildStripeMock>;
  let client: StripeClient;
  let billingSync: StripeBillingSync;

  beforeEach(() => {
    // Reset singleton so each test gets a clean event bus
    EventBus.reset();

    // Build a fresh mock and inject it as the Stripe SDK client
    stripeMock = buildStripeMock();
    _setStripeClient(stripeMock as unknown as Stripe);

    client = new StripeClient();
    billingSync = new StripeBillingSync();
  });

  // ── Customer Creation ───────────────────────────────────────────────────────

  describe('createCustomer', () => {
    it('maps inputs and embeds tenantId / businessId in metadata', async () => {
      const expected = fakeCustomer({ email: 'owner@acmecorp.com', name: 'Acme Corp' });
      stripeMock.customers.create.mockResolvedValueOnce(expected);

      const result = await client.createCustomer({
        email: 'owner@acmecorp.com',
        name: 'Acme Corp',
        tenantId: 'tenant-001',
        businessId: 'biz-acme',
      });

      expect(result.id).toBe('cus_test123');
      const [params] = stripeMock.customers.create.mock.calls[0] as [Stripe.CustomerCreateParams, ...unknown[]];
      expect(params.email).toBe('owner@acmecorp.com');
      expect(params.metadata?.tenantId).toBe('tenant-001');
      expect(params.metadata?.businessId).toBe('biz-acme');
    });

    it('propagates Stripe SDK errors as AppError', async () => {
      const stripeErr = new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        message: 'No such customer',
        statusCode: 400,
        requestId: 'req_xxx',
        headers: {},
        rawType: 'invalid_request_error',
      } as unknown as Stripe.errors.StripeRawError);
      stripeMock.customers.create.mockRejectedValueOnce(stripeErr);

      await expect(
        client.createCustomer({
          email: 'bad@example.com',
          name: 'Bad',
          tenantId: 't1',
          businessId: 'b1',
        }),
      ).rejects.toMatchObject({ code: 'STRIPE_INVALID_REQUEST', statusCode: 400 });
    });
  });

  // ── Subscription Lifecycle ──────────────────────────────────────────────────

  describe('createSubscription', () => {
    it('creates subscription with correct priceId and tenant metadata', async () => {
      const expected = fakeSubscription();
      stripeMock.subscriptions.create.mockResolvedValueOnce(expected);

      const result = await client.createSubscription({
        stripeCustomerId: 'cus_test123',
        priceId: 'price_monthly_pro',
        tenantId: 'tenant-001',
        businessId: 'biz-001',
      });

      expect(result.id).toBe('sub_test123');
      const [params] = stripeMock.subscriptions.create.mock.calls[0] as [Stripe.SubscriptionCreateParams, ...unknown[]];
      expect(params.items[0]?.price).toBe('price_monthly_pro');
      expect(params.metadata?.tenantId).toBe('tenant-001');
    });
  });

  describe('cancelSubscription', () => {
    it('cancels immediately by default', async () => {
      const cancelled = fakeSubscription({ status: 'canceled' });
      stripeMock.subscriptions.cancel.mockResolvedValueOnce(cancelled);

      const result = await client.cancelSubscription({
        stripeSubscriptionId: 'sub_test123',
      });

      expect(result.status).toBe('canceled');
      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_test123');
    });

    it('sets cancel_at_period_end when cancelAt is at_period_end', async () => {
      const deferred = fakeSubscription({ cancel_at_period_end: true });
      stripeMock.subscriptions.update.mockResolvedValueOnce(deferred);

      const result = await client.cancelSubscription({
        stripeSubscriptionId: 'sub_test123',
        cancelAt: 'at_period_end',
      });

      expect(result.cancel_at_period_end).toBe(true);
      const [, params] = stripeMock.subscriptions.update.mock.calls[0] as [string, Stripe.SubscriptionUpdateParams, ...unknown[]];
      expect(params.cancel_at_period_end).toBe(true);
    });
  });

  // ── Payment Intents ─────────────────────────────────────────────────────────

  describe('createPaymentIntent', () => {
    it('creates payment intent with amount in cents', async () => {
      const expected = fakePaymentIntent('requires_payment_method');
      stripeMock.paymentIntents.create.mockResolvedValueOnce(expected);

      await client.createPaymentIntent({
        amountCents: 250000,
        currency: 'usd',
        tenantId: 'tenant-001',
        businessId: 'biz-001',
      });

      const [params] = stripeMock.paymentIntents.create.mock.calls[0] as [Stripe.PaymentIntentCreateParams, ...unknown[]];
      expect(params.amount).toBe(250000);
      expect(params.currency).toBe('usd');
      expect(params.metadata?.tenantId).toBe('tenant-001');
    });
  });

  describe('getPaymentStatus', () => {
    it('returns status from retrieved PaymentIntent', async () => {
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(fakePaymentIntent('succeeded'));

      const { status, paymentIntent } = await client.getPaymentStatus('pi_test123');

      expect(status).toBe('succeeded');
      expect(paymentIntent.id).toBe('pi_test123');
      expect(stripeMock.paymentIntents.retrieve).toHaveBeenCalledWith('pi_test123');
    });
  });

  // ── Invoice Sync ────────────────────────────────────────────────────────────

  describe('StripeBillingSync.createStripeInvoiceFromLocal', () => {
    it('creates Stripe invoice from local invoice and returns IDs', async () => {
      const invoiceShell = fakeStripeInvoice({ id: 'in_new', status: 'open' });
      const finalised = fakeStripeInvoice({
        id: 'in_new',
        status: 'open',
        payment_intent: 'pi_new456',
      });

      stripeMock.invoices.create.mockResolvedValueOnce(invoiceShell);
      stripeMock.invoiceItems.create.mockResolvedValue({});
      stripeMock.invoices.finalizeInvoice.mockResolvedValueOnce(finalised);

      const localInvoice = fakeLocalInvoice();
      const result = await billingSync.createStripeInvoiceFromLocal(
        localInvoice as unknown as import('../../../src/backend/services/revenue-ops.service.js').Invoice,
        'cus_test123',
      );

      expect(result.stripeInvoiceId).toBe('in_new');
      expect(result.stripePaymentIntentId).toBe('pi_new456');
      expect(result.localInvoiceId).toBe('inv-local-001');
      expect(stripeMock.invoices.finalizeInvoice).toHaveBeenCalledWith('in_new');
    });

    it('throws INVOICE_ALREADY_SETTLED when invoice is paid', async () => {
      const paid = fakeLocalInvoice({ status: 'paid', paidAt: new Date() });

      await expect(
        billingSync.createStripeInvoiceFromLocal(
          paid as unknown as import('../../../src/backend/services/revenue-ops.service.js').Invoice,
          'cus_test123',
        ),
      ).rejects.toMatchObject({ code: 'INVOICE_ALREADY_SETTLED', statusCode: 409 });
    });
  });

  describe('StripeBillingSync.reconcilePaymentStatus', () => {
    it("maps Stripe 'paid' status to local 'paid'", async () => {
      const paidStripeInvoice = fakeStripeInvoice({
        status: 'paid',
        payment_intent: 'pi_test123',
      });
      stripeMock.invoices.retrieve.mockResolvedValueOnce(paidStripeInvoice);
      stripeMock.paymentIntents.retrieve.mockResolvedValueOnce(fakePaymentIntent('succeeded'));

      const localInvoice = fakeLocalInvoice({ status: 'issued' });
      const result = await billingSync.reconcilePaymentStatus(
        localInvoice as unknown as import('../../../src/backend/services/revenue-ops.service.js').Invoice,
        'in_test123',
      );

      expect(result.resolvedStatus).toBe('paid');
      expect(result.reconciledAt).toBeInstanceOf(Date);
    });
  });

  // ── Webhook Processing ──────────────────────────────────────────────────────

  describe('verifyWebhookSignature', () => {
    it('throws STRIPE_SIGNATURE_MISSING when header is absent', () => {
      expect(() =>
        verifyWebhookSignature(Buffer.from('{}'), undefined, 'whsec_test'),
      ).toThrow(
        expect.objectContaining({ code: 'STRIPE_SIGNATURE_MISSING', statusCode: 400 }),
      );
    });

    it('throws STRIPE_WEBHOOK_SECRET_MISSING when no secret is configured', () => {
      // Call with an empty string secret (mirrors env not set)
      expect(() =>
        verifyWebhookSignature(Buffer.from('{}'), 't=123,v1=abc', ''),
      ).toThrow(
        expect.objectContaining({ code: 'STRIPE_WEBHOOK_SECRET_MISSING', statusCode: 500 }),
      );
    });
  });

  describe('routeStripeEvent', () => {
    it('routes invoice.paid and publishes stripe.invoice.paid to event bus', async () => {
      const publishSpy = vi.spyOn(eventBus, 'publish');

      const invoicePaidEvent: Stripe.Event = {
        id: 'evt_invoicepaid',
        object: 'event',
        type: 'invoice.paid',
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        pending_webhooks: 0,
        request: null,
        api_version: '2025-02-24.acacia',
        data: {
          object: fakeStripeInvoice({ status: 'paid' }),
        },
      } as unknown as Stripe.Event;

      const result = await routeStripeEvent(invoicePaidEvent);

      expect(result.handled).toBe(true);
      expect(result.eventType).toBe(STRIPE_EVENT_TYPES.INVOICE_PAID);
      expect(publishSpy).toHaveBeenCalledOnce();

      const [, envelope] = publishSpy.mock.calls[0] as [string, { eventType: string }];
      expect(envelope.eventType).toBe('stripe.invoice.paid');
    });
  });

  // ── Refund Handling ─────────────────────────────────────────────────────────

  describe('StripeBillingSync.syncRefund', () => {
    it('creates Stripe refund and returns updated totals', async () => {
      stripeMock.refunds.create.mockResolvedValueOnce(fakeRefund({ amount: 50000 }));

      const paid = fakeLocalInvoice({ status: 'paid', paidAt: new Date(), amount: 2500, refundedAmount: 0 });
      const result = await billingSync.syncRefund(
        paid as unknown as import('../../../src/backend/services/revenue-ops.service.js').Invoice,
        'pi_test123',
        500, // $500 refund
      );

      expect(result.stripeRefundId).toBe('re_test123');
      expect(result.refundedAmountDollars).toBe(500);
      expect(result.totalRefundedDollars).toBe(500);

      // Stripe was called with amount in cents
      const [params] = stripeMock.refunds.create.mock.calls[0] as [Stripe.RefundCreateParams, ...unknown[]];
      expect(params.amount).toBe(50000); // $500 × 100
    });

    it('throws REFUND_EXCEEDS_BALANCE when refund > invoice balance', async () => {
      const paid = fakeLocalInvoice({ status: 'paid', paidAt: new Date(), amount: 100, refundedAmount: 80 });
      await expect(
        billingSync.syncRefund(
          paid as unknown as import('../../../src/backend/services/revenue-ops.service.js').Invoice,
          'pi_test123',
          50, // $50 requested, but only $20 remaining
        ),
      ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_BALANCE', statusCode: 400 });
    });
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  describe('makeIdempotencyKey', () => {
    it('generates unique keys scoped by operation and entity', () => {
      const key1 = makeIdempotencyKey('create_customer', 'biz-001');
      const key2 = makeIdempotencyKey('create_customer', 'biz-001');
      const key3 = makeIdempotencyKey('create_subscription', 'biz-001');

      // Keys start with the operation prefix
      expect(key1).toMatch(/^create_customer:biz-001:/);
      expect(key3).toMatch(/^create_subscription:biz-001:/);

      // Each call produces a unique UUID suffix
      expect(key1).not.toBe(key2);
    });
  });

  // ── Error Mapping ───────────────────────────────────────────────────────────

  describe('mapStripeError', () => {
    it('maps StripeCardError to 402 AppError with STRIPE_CARD_ERROR code', () => {
      const raw = new Stripe.errors.StripeCardError({
        type: 'card_error',
        message: 'Your card was declined.',
        code: 'card_declined',
        decline_code: 'insufficient_funds',
        statusCode: 402,
        requestId: 'req_xyz',
        headers: {},
        rawType: 'card_error',
      } as unknown as Stripe.errors.StripeRawError);

      const err = mapStripeError(raw);
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(402);
      expect(err.code).toBe('STRIPE_CARD_ERROR');
    });

    it('maps StripeRateLimitError to 429 AppError with STRIPE_RATE_LIMIT code', () => {
      const raw = new Stripe.errors.StripeRateLimitError({
        type: 'invalid_request_error',
        message: 'Too many requests.',
        statusCode: 429,
        requestId: 'req_ratelimit',
        headers: {},
        rawType: 'invalid_request_error',
      } as unknown as Stripe.errors.StripeRawError);

      const err = mapStripeError(raw);
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('STRIPE_RATE_LIMIT');
    });
  });
});
