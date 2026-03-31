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

const connections = new Map<string, IntegrationConnection>();
const webhookLog  = new Map<string, WebhookEvent>();

// ── Helpers ──────────────────────────────────────────────────

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
    // STUB — replace with: const res = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const connection: IntegrationConnection = {
      id:                uuidv4(),
      tenantId,
      provider:          'plaid',
      status:            'connected',
      accessToken:       `plaid_access_stub_${uuidv4()}`,
      externalAccountId: `plaid_item_${uuidv4()}`,
      scopes:            ['transactions', 'identity', 'balance'],
      connectedAt:       new Date(),
      metadata:          { publicToken },
    };
    connections.set(connectionKey(tenantId, 'plaid'), connection);
    return connection;
  },

  async disconnect(tenantId: string): Promise<void> {
    const key  = connectionKey(tenantId, 'plaid');
    const conn = connections.get(key);
    if (!conn) throw new Error('Plaid integration not found');
    // STUB — replace with: await plaidClient.itemRemove({ access_token: conn.accessToken })
    conn.status         = 'disconnected';
    conn.disconnectedAt = new Date();
    connections.set(key, conn);
  },

  async sync(tenantId: string): Promise<SyncResult> {
    const conn = connections.get(connectionKey(tenantId, 'plaid'));
    if (!conn || conn.status !== 'connected') {
      return { provider: 'plaid', recordsSynced: 0, errors: ['Not connected'], syncedAt: new Date() };
    }
    // STUB — replace with: await plaidClient.transactionsGet({ access_token, start_date, end_date })
    conn.lastSyncedAt = new Date();
    return { provider: 'plaid', recordsSynced: 150, errors: [], syncedAt: new Date() };
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
    // STUB — replace with: OAuthClient.createToken(oauthCode)
    const connection: IntegrationConnection = {
      id:                uuidv4(),
      tenantId,
      provider:          'quickbooks',
      status:            'connected',
      accessToken:       `qbo_access_stub_${uuidv4()}`,
      refreshToken:      `qbo_refresh_stub_${uuidv4()}`,
      externalAccountId: realmId,
      scopes:            ['com.intuit.quickbooks.accounting'],
      connectedAt:       new Date(),
      metadata:          { oauthCode, realmId },
    };
    connections.set(connectionKey(tenantId, 'quickbooks'), connection);
    return connection;
  },

  async disconnect(tenantId: string): Promise<void> {
    const key  = connectionKey(tenantId, 'quickbooks');
    const conn = connections.get(key);
    if (!conn) throw new Error('QuickBooks integration not found');
    // STUB — revoke token via OAuthClient.revoke()
    conn.status         = 'disconnected';
    conn.disconnectedAt = new Date();
    connections.set(key, conn);
  },

  async sync(tenantId: string): Promise<SyncResult> {
    const conn = connections.get(connectionKey(tenantId, 'quickbooks'));
    if (!conn || conn.status !== 'connected') {
      return { provider: 'quickbooks', recordsSynced: 0, errors: ['Not connected'], syncedAt: new Date() };
    }
    // STUB — fetch Chart of Accounts, P&L, Balance Sheet from QBO API
    conn.lastSyncedAt = new Date();
    return { provider: 'quickbooks', recordsSynced: 48, errors: [], syncedAt: new Date() };
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
    // STUB — replace with: xeroClient.apiCallback(callbackUrl, {})
    const connection: IntegrationConnection = {
      id:                uuidv4(),
      tenantId,
      provider:          'xero',
      status:            'connected',
      accessToken:       `xero_access_stub_${uuidv4()}`,
      refreshToken:      `xero_refresh_stub_${uuidv4()}`,
      externalAccountId: xeroTenantId,
      scopes:            ['accounting.reports.read', 'accounting.transactions'],
      connectedAt:       new Date(),
      metadata:          { oauthCode, xeroTenantId },
    };
    connections.set(connectionKey(tenantId, 'xero'), connection);
    return connection;
  },

  async disconnect(tenantId: string): Promise<void> {
    const key  = connectionKey(tenantId, 'xero');
    const conn = connections.get(key);
    if (!conn) throw new Error('Xero integration not found');
    conn.status         = 'disconnected';
    conn.disconnectedAt = new Date();
    connections.set(key, conn);
  },

  async sync(tenantId: string): Promise<SyncResult> {
    const conn = connections.get(connectionKey(tenantId, 'xero'));
    if (!conn || conn.status !== 'connected') {
      return { provider: 'xero', recordsSynced: 0, errors: ['Not connected'], syncedAt: new Date() };
    }
    // STUB — fetch Profit & Loss, invoices, bank transactions
    conn.lastSyncedAt = new Date();
    return { provider: 'xero', recordsSynced: 32, errors: [], syncedAt: new Date() };
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
    // STUB — replace with: docusignClient.requestJWTUserToken() or auth code exchange
    const connection: IntegrationConnection = {
      id:                uuidv4(),
      tenantId,
      provider:          'docusign',
      status:            'connected',
      accessToken:       `ds_access_stub_${uuidv4()}`,
      refreshToken:      `ds_refresh_stub_${uuidv4()}`,
      externalAccountId: accountId,
      scopes:            ['signature', 'extended'],
      connectedAt:       new Date(),
      metadata:          { oauthCode, accountId },
    };
    connections.set(connectionKey(tenantId, 'docusign'), connection);
    return connection;
  },

  async disconnect(tenantId: string): Promise<void> {
    const key  = connectionKey(tenantId, 'docusign');
    const conn = connections.get(key);
    if (!conn) throw new Error('DocuSign integration not found');
    conn.status         = 'disconnected';
    conn.disconnectedAt = new Date();
    connections.set(key, conn);
  },

  async sync(tenantId: string): Promise<SyncResult> {
    const conn = connections.get(connectionKey(tenantId, 'docusign'));
    if (!conn || conn.status !== 'connected') {
      return { provider: 'docusign', recordsSynced: 0, errors: ['Not connected'], syncedAt: new Date() };
    }
    // STUB — pull completed envelopes, update document vault refs
    conn.lastSyncedAt = new Date();
    return { provider: 'docusign', recordsSynced: 7, errors: [], syncedAt: new Date() };
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
    // STUB — in production validate keys via Stripe.accounts.retrieve()
    const connection: IntegrationConnection = {
      id:                uuidv4(),
      tenantId,
      provider:          'stripe',
      status:            'connected',
      accessToken:       secretKey, // encrypted at rest
      connectedAt:       new Date(),
      metadata:          { publishableKey },
    };
    connections.set(connectionKey(tenantId, 'stripe'), connection);
    return connection;
  },

  async disconnect(tenantId: string): Promise<void> {
    const key  = connectionKey(tenantId, 'stripe');
    const conn = connections.get(key);
    if (!conn) throw new Error('Stripe integration not found');
    conn.status         = 'disconnected';
    conn.disconnectedAt = new Date();
    connections.set(key, conn);
  },

  async sync(tenantId: string): Promise<SyncResult> {
    const conn = connections.get(connectionKey(tenantId, 'stripe'));
    if (!conn || conn.status !== 'connected') {
      return { provider: 'stripe', recordsSynced: 0, errors: ['Not connected'], syncedAt: new Date() };
    }
    // STUB — sync invoices, charges, subscriptions
    conn.lastSyncedAt = new Date();
    return { provider: 'stripe', recordsSynced: 22, errors: [], syncedAt: new Date() };
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
  tenantId: string,
  provider: IntegrationProvider,
): IntegrationConnection | undefined {
  return connections.get(connectionKey(tenantId, provider));
}

export function listConnections(tenantId: string): IntegrationConnection[] {
  return Array.from(connections.values()).filter((c) => c.tenantId === tenantId);
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
