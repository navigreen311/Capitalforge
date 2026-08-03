// ============================================================
// CapitalForge — Integration Layer Service
// Plaid, QuickBooks/Xero, DocuSign, Stripe — connect/disconnect/sync/webhook
// All external calls are stubbed; replace with real SDK calls.
// ============================================================

import { v4 as uuidv4 } from 'uuid';

// ── Types ────────────────────────────────────────────────────

export type IntegrationProvider =
  | 'plaid'
  | 'quickbooks'
  | 'xero'
  | 'docusign'
  | 'stripe';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'pending';

export interface IntegrationConnection {
  id: string;
  tenantId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  accessToken?: string;         // encrypted at rest in production
  refreshToken?: string;
  externalAccountId?: string;
  scopes?: string[];
  connectedAt?: Date;
  disconnectedAt?: Date;
  lastSyncedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface WebhookEvent {
  id: string;
  provider: IntegrationProvider;
  eventType: string;
  payload: Record<string, unknown>;
  receivedAt: Date;
  processedAt?: Date;
  attempts: number;
  lastError?: string;
  deadLettered: boolean;
}

export interface SyncResult {
  provider: IntegrationProvider;
  recordsSynced: number;
  errors: string[];
  syncedAt: Date;
}

// ── In-memory store (replace with DB / cache in production) ──

const webhookLog  = new Map<string, WebhookEvent>();

// ── Helpers ──────────────────────────────────────────────────

/**
 * Thrown by every operation that would need to talk to a provider.
 *
 * Nothing in this file contacts Plaid, QuickBooks, Xero, DocuSign or Stripe.
 * Each connect() built an IntegrationConnection with an access token of the
 * form `plaid_access_stub_<uuid>`, marked it connected, and put it in a Map;
 * each sync() returned a fixed record count — 150 transactions for Plaid, 48
 * for QuickBooks, 32 for Xero, 7 for DocuSign, 22 for Stripe — for records it
 * had never fetched.
 *
 * So an operator could connect an integration, be told it worked, be told a
 * hundred and fifty transactions had synced, and have none of it be true or
 * survive a restart. There is no integration table in this schema either, so
 * the Map was the only record there was.
 *
 * These refuse now. The provider modules keep their shape and their STUB
 * comments naming the real SDK call to make, because that scaffolding is the
 * useful part; what is gone is answering as though the call had been made.
 */
export class IntegrationNotImplementedError extends Error {
  constructor(
    public readonly provider: IntegrationProvider,
    public readonly operation: string,
  ) {
    super(
      `${operation} is not implemented for ${provider}. Nothing in this system contacts the ` +
        'provider, exchanges a token, or fetches records, and no table records an integration ' +
        `connection. This used to answer as though ${provider} were connected.`,
    );
    this.name = 'IntegrationNotImplementedError';
  }
}

/** One refusal, so five providers cannot drift apart. */
function refuse(provider: IntegrationProvider, operation: string): never {
  throw new IntegrationNotImplementedError(provider, operation);
}

function connectionKey(tenantId: string, provider: IntegrationProvider) {
  return `${tenantId}:${provider}`;
}

// ============================================================
// PLAID — Bank Verification & Cash Flow
// ============================================================

export const plaid = {
  /**
   * Exchange a public token (from Plaid Link) for persistent access.
   * In production: call plaid.itemPublicTokenExchange().
   */
  async connect(tenantId: string, publicToken: string): Promise<IntegrationConnection> {
    refuse('plaid', 'Connecting');
  },

  async disconnect(tenantId: string): Promise<void> {
    refuse('plaid', 'Disconnecting');
  },

  async sync(tenantId: string): Promise<SyncResult> {
    refuse('plaid', 'Syncing');
  },

  async handleWebhook(tenantId: string, payload: Record<string, unknown>): Promise<WebhookEvent> {
    const event: WebhookEvent = {
      id:           uuidv4(),
      provider:     'plaid',
      eventType:    String(payload['webhook_type'] ?? 'UNKNOWN'),
      payload,
      receivedAt:   new Date(),
      processedAt:  new Date(),
      attempts:     1,
      deadLettered: false,
    };
    // STUB — route by webhook_type: TRANSACTIONS, AUTH, IDENTITY, etc.
    webhookLog.set(event.id, event);
    return event;
  },
};

// ============================================================
// QUICKBOOKS — Accounting Sync
// ============================================================

export const quickbooks = {
  async connect(tenantId: string, oauthCode: string, realmId: string): Promise<IntegrationConnection> {
    refuse('quickbooks', 'Connecting');
  },

  async disconnect(tenantId: string): Promise<void> {
    refuse('quickbooks', 'Disconnecting');
  },

  async sync(tenantId: string): Promise<SyncResult> {
    refuse('quickbooks', 'Syncing');
  },

  async handleWebhook(tenantId: string, payload: Record<string, unknown>): Promise<WebhookEvent> {
    const event: WebhookEvent = {
      id:           uuidv4(),
      provider:     'quickbooks',
      eventType:    String(payload['eventNotifications'] ?? 'data_change'),
      payload,
      receivedAt:   new Date(),
      processedAt:  new Date(),
      attempts:     1,
      deadLettered: false,
    };
    webhookLog.set(event.id, event);
    return event;
  },
};

// ============================================================
// XERO — Accounting Sync (alternative to QBO)
// ============================================================

export const xero = {
  async connect(tenantId: string, oauthCode: string, xeroTenantId: string): Promise<IntegrationConnection> {
    refuse('xero', 'Connecting');
  },

  async disconnect(tenantId: string): Promise<void> {
    refuse('xero', 'Disconnecting');
  },

  async sync(tenantId: string): Promise<SyncResult> {
    refuse('xero', 'Syncing');
  },

  async handleWebhook(tenantId: string, payload: Record<string, unknown>): Promise<WebhookEvent> {
    const event: WebhookEvent = {
      id:           uuidv4(),
      provider:     'xero',
      eventType:    String((payload['events'] as unknown[])?.[0] ?? 'unknown'),
      payload,
      receivedAt:   new Date(),
      processedAt:  new Date(),
      attempts:     1,
      deadLettered: false,
    };
    webhookLog.set(event.id, event);
    return event;
  },
};

// ============================================================
// DOCUSIGN — E-Signatures
// ============================================================

export const docusign = {
  async connect(tenantId: string, oauthCode: string, accountId: string): Promise<IntegrationConnection> {
    refuse('docusign', 'Connecting');
  },

  async disconnect(tenantId: string): Promise<void> {
    refuse('docusign', 'Disconnecting');
  },

  async sync(tenantId: string): Promise<SyncResult> {
    refuse('docusign', 'Syncing');
  },

  async handleWebhook(tenantId: string, payload: Record<string, unknown>): Promise<WebhookEvent> {
    const event: WebhookEvent = {
      id:           uuidv4(),
      provider:     'docusign',
      eventType:    String(payload['event'] ?? 'envelope_update'),
      payload,
      receivedAt:   new Date(),
      processedAt:  new Date(),
      attempts:     1,
      deadLettered: false,
    };
    webhookLog.set(event.id, event);
    return event;
  },
};

// ============================================================
// STRIPE — Billing & Payments
// ============================================================

export const stripe = {
  async connect(tenantId: string, publishableKey: string, secretKey: string): Promise<IntegrationConnection> {
    refuse('stripe', 'Connecting');
  },

  async disconnect(tenantId: string): Promise<void> {
    refuse('stripe', 'Disconnecting');
  },

  async sync(tenantId: string): Promise<SyncResult> {
    refuse('stripe', 'Syncing');
  },

  async handleWebhook(tenantId: string, payload: Record<string, unknown>, signature: string): Promise<WebhookEvent> {
    // STUB — replace with: stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    const event: WebhookEvent = {
      id:           uuidv4(),
      provider:     'stripe',
      eventType:    String(payload['type'] ?? 'unknown'),
      payload,
      receivedAt:   new Date(),
      processedAt:  new Date(),
      attempts:     1,
      deadLettered: false,
      lastError:    signature ? undefined : 'Missing signature',
    };
    webhookLog.set(event.id, event);
    return event;
  },
};

// ============================================================
// Generic helpers
// ============================================================

export function getConnection(
  _tenantId?: string,
  _provider?: IntegrationProvider,
): IntegrationConnection | undefined {
  // Always undefined. Nothing can connect, so nothing is connected — this
  // used to read a Map holding whatever the current worker had faked since it
  // started.
  return undefined;
}

export function listConnections(_tenantId?: string): IntegrationConnection[] {
  // Always empty, for the same reason. GET /api/integrations returned the
  // connections this worker had faked, so two workers disagreed about what
  // was connected and a restart disconnected everything.
  return [];
}

export function getWebhookEvent(id: string): WebhookEvent | undefined {
  return webhookLog.get(id);
}

export function listDeadLettered(): WebhookEvent[] {
  return Array.from(webhookLog.values()).filter((e) => e.deadLettered);
}

export function markDeadLettered(eventId: string, error: string): void {
  const event = webhookLog.get(eventId);
  if (event) {
    event.deadLettered = true;
    event.lastError    = error;
    event.attempts    += 1;
    webhookLog.set(eventId, event);
  }
}

export const integrationLayerService = {
  plaid,
  quickbooks,
  xero,
  docusign,
  stripe,
  getConnection,
  listConnections,
  getWebhookEvent,
  listDeadLettered,
  markDeadLettered,
};
