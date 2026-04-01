// ============================================================
// CapitalForge — Stripe Integration Barrel Export
// ============================================================

// Client
export {
  StripeClient,
  stripeClient,
  getStripeClient,
  mapStripeError,
  makeIdempotencyKey,
  _setStripeClient,
} from './stripe-client.js';

export type {
  CreateCustomerInput,
  CreateSubscriptionInput,
  CreateInvoiceInput,
  CreatePaymentIntentInput,
  CancelSubscriptionInput,
  CreateRefundInput,
  ListInvoicesInput,
} from './stripe-client.js';

// Webhooks
export {
  STRIPE_EVENT_TYPES,
  verifyWebhookSignature,
  routeStripeEvent,
  stripeWebhookHandler,
} from './stripe-webhooks.js';

export type {
  StripeEventType,
  InvoiceStatusUpdate,
  SubscriptionUpdate,
  WebhookProcessResult,
} from './stripe-webhooks.js';

// Billing Sync
export {
  StripeBillingSync,
  stripeBillingSync,
} from './stripe-billing-sync.js';

export type {
  SyncInvoiceResult,
  ReconcileResult,
  RefundSyncResult,
} from './stripe-billing-sync.js';
