// ============================================================
// CapitalForge — Plaid Integration Tests
// Covers: link token creation, token exchange, account/transaction/
// balance/identity fetch, webhook processing, retry logic,
// signature verification, error handling, response sanitization.
// 18 test cases.
// ============================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  PlaidClient,
  PlaidApiError,
  PlaidConfigError,
  resetPlaidClient,
} from '../../../src/backend/integrations/plaid/plaid-client.js';

import {
  handlePlaidWebhook,
  verifyPlaidSignature,
  isTransactionsSyncEvent,
  isItemErrorEvent,
  isInitialUpdateEvent,
} from '../../../src/backend/integrations/plaid/plaid-webhooks.js';

import type { PlaidWebhookPayload } from '../../../src/backend/integrations/plaid/index.js';

import { EventBus } from '../../../src/backend/events/event-bus.js';

// ── Env setup ─────────────────────────────────────────────────

beforeEach(() => {
  process.env.PLAID_CLIENT_ID = 'test-client-id';
  process.env.PLAID_SECRET    = 'test-secret';
  process.env.PLAID_ENV       = 'sandbox';
  resetPlaidClient();
  EventBus.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ────────────────────────────────────────────────────

/** Creates a PlaidClient with injected credentials (no env vars needed). */
function makeClient(): PlaidClient {
  return new PlaidClient({
    clientId: 'test-client-id',
    secret:   'test-secret',
    env:      'sandbox',
  });
}

/**
 * Mocks the global fetch to return a canned JSON body.
 * Returns the spy so tests can assert call arguments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockFetchOk(body: unknown): any {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockFetchError(status: number, errorBody: unknown): any {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(errorBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

// ── Fixtures ──────────────────────────────────────────────────

const ITEM_ID      = 'item_abc123';
const ACCESS_TOKEN = 'access-sandbox-abc123';

const RAW_ACCOUNTS = [
  {
    account_id:    'acct_001',
    name:          'Checking Account',
    official_name: 'Personal Checking',
    type:          'depository',
    subtype:       'checking',
    mask:          '0001',
    balances: {
      available:         1200.50,
      current:           1250.00,
      limit:             null,
      iso_currency_code: 'USD',
    },
  },
];

const RAW_TRANSACTIONS = [
  {
    transaction_id:   'txn_001',
    account_id:       'acct_001',
    amount:           42.50,
    iso_currency_code:'USD',
    date:             '2026-03-15',
    name:             'Coffee Shop',
    merchant_name:    'Blue Bottle Coffee',
    category:         ['Food and Drink', 'Restaurants', 'Coffee Shop'],
    pending:          false,
  },
];

// ============================================================
// 1. PlaidClient — createLinkToken
// ============================================================

describe('PlaidClient — createLinkToken', () => {
  it('returns a mapped link token response', async () => {
    mockFetchOk({
      link_token:  'link-sandbox-abc',
      expiration:  '2026-04-01T00:00:00Z',
      request_id:  'req-001',
    });

    const client   = makeClient();
    const response = await client.createLinkToken({
      userId:       'user-001',
      clientName:   'CapitalForge',
      products:     ['transactions'],
      countryCodes: ['US'],
      language:     'en',
    });

    expect(response.linkToken).toBe('link-sandbox-abc');
    expect(response.expiration).toBe('2026-04-01T00:00:00Z');
    expect(response.requestId).toBe('req-001');
  });

  it('includes the webhook URL in the request body when provided', async () => {
    const spy = mockFetchOk({
      link_token: 'link-sandbox-xyz',
      expiration: '2026-04-01T00:00:00Z',
      request_id: 'req-002',
    });

    const client = makeClient();
    await client.createLinkToken({
      userId:       'user-002',
      clientName:   'CapitalForge',
      products:     ['transactions'],
      countryCodes: ['US'],
      language:     'en',
      webhookUrl:   'https://api.example.com/plaid/webhook',
    });

    const [, fetchInit] = spy.mock.calls[0]!;
    const body = JSON.parse((fetchInit as RequestInit).body as string) as Record<string, unknown>;
    expect(body.webhook).toBe('https://api.example.com/plaid/webhook');
  });
});

// ============================================================
// 2. PlaidClient — exchangePublicToken
// ============================================================

describe('PlaidClient — exchangePublicToken', () => {
  it('exchanges a public token and returns access token + item ID', async () => {
    mockFetchOk({
      access_token: ACCESS_TOKEN,
      item_id:      ITEM_ID,
      request_id:   'req-003',
    });

    const client   = makeClient();
    const response = await client.exchangePublicToken('public-sandbox-token-abc');

    expect(response.accessToken).toBe(ACCESS_TOKEN);
    expect(response.itemId).toBe(ITEM_ID);
    expect(response.requestId).toBe('req-003');
  });

  it('does NOT include the public token in any logged field', async () => {
    const sanitized = PlaidClient.sanitizeForLog({
      public_token:  'public-sandbox-SENSITIVE',
      access_token:  'access-sandbox-SENSITIVE',
      client_secret: 'secret-SENSITIVE',
      item_id:       ITEM_ID,
    });

    const str = JSON.stringify(sanitized);
    expect(str).not.toContain('SENSITIVE');
    expect(str).toContain('[REDACTED]');
    expect(str).toContain(ITEM_ID); // non-sensitive fields pass through
  });
});

// ============================================================
// 3. PlaidClient — getAccounts
// ============================================================

describe('PlaidClient — getAccounts', () => {
  it('fetches and maps account data from snake_case to camelCase', async () => {
    mockFetchOk({
      accounts:   RAW_ACCOUNTS,
      item:       { item_id: ITEM_ID },
      request_id: 'req-004',
    });

    const client   = makeClient();
    const response = await client.getAccounts(ACCESS_TOKEN);

    expect(response.itemId).toBe(ITEM_ID);
    expect(response.accounts).toHaveLength(1);

    const acct = response.accounts[0]!;
    expect(acct.accountId).toBe('acct_001');
    expect(acct.officialName).toBe('Personal Checking');
    expect(acct.balances.available).toBe(1200.50);
    expect(acct.balances.isoCurrencyCode).toBe('USD');
  });
});

// ============================================================
// 4. PlaidClient — getTransactions
// ============================================================

describe('PlaidClient — getTransactions', () => {
  it('fetches transactions and maps fields correctly', async () => {
    mockFetchOk({
      accounts:           RAW_ACCOUNTS,
      transactions:       RAW_TRANSACTIONS,
      total_transactions: 1,
      item:               { item_id: ITEM_ID },
      request_id:         'req-005',
    });

    const client   = makeClient();
    const response = await client.getTransactions(ACCESS_TOKEN, '2026-01-01', '2026-03-31');

    expect(response.totalTransactions).toBe(1);
    expect(response.transactions).toHaveLength(1);

    const txn = response.transactions[0]!;
    expect(txn.transactionId).toBe('txn_001');
    expect(txn.merchantName).toBe('Blue Bottle Coffee');
    expect(txn.category).toContain('Coffee Shop');
    expect(txn.pending).toBe(false);
  });
});

// ============================================================
// 5. PlaidClient — getBalance
// ============================================================

describe('PlaidClient — getBalance', () => {
  it('returns real-time balance data for all accounts', async () => {
    mockFetchOk({
      accounts:   RAW_ACCOUNTS,
      item:       { item_id: ITEM_ID },
      request_id: 'req-006',
    });

    const client   = makeClient();
    const response = await client.getBalance(ACCESS_TOKEN);

    expect(response.accounts).toHaveLength(1);
    expect(response.accounts[0]!.balances.current).toBe(1250.00);
    expect(response.itemId).toBe(ITEM_ID);
  });
});

// ============================================================
// 6. PlaidClient — getIdentity
// ============================================================

describe('PlaidClient — getIdentity', () => {
  it('returns owner identity information for accounts', async () => {
    mockFetchOk({
      accounts: [
        {
          ...RAW_ACCOUNTS[0],
          owners: [
            {
              names:  ['Jane Smith'],
              emails: [{ data: 'jane@example.com', primary: true, type: 'primary' }],
              phone_numbers: [{ data: '+15551234567', primary: true, type: 'home' }],
              addresses: [
                {
                  data: {
                    street:      '123 Main St',
                    city:        'San Francisco',
                    region:      'CA',
                    postal_code: '94107',
                    country:     'US',
                  },
                  primary: true,
                },
              ],
            },
          ],
        },
      ],
      item:       { item_id: ITEM_ID },
      request_id: 'req-007',
    });

    const client   = makeClient();
    const response = await client.getIdentity(ACCESS_TOKEN);

    const account = response.accounts[0]!;
    expect(account.accountId).toBe('acct_001');
    expect(account.owners[0]!.names).toContain('Jane Smith');
    expect(account.owners[0]!.emails[0]!.data).toBe('jane@example.com');
    expect(account.owners[0]!.addresses[0]!.data.postalCode).toBe('94107');
  });
});

// ============================================================
// 7. Error handling — PlaidApiError on 4xx
// ============================================================

describe('PlaidClient — error handling', () => {
  it('throws PlaidApiError on a 400 INVALID_INPUT response', async () => {
    mockFetchError(400, {
      error_type:    'INVALID_INPUT',
      error_code:    'INVALID_PUBLIC_TOKEN',
      error_message: 'invalid public token',
      request_id:    'req-err-001',
    });

    const client = makeClient();
    await expect(client.exchangePublicToken('bad-token')).rejects.toThrow(PlaidApiError);
  });

  it('PlaidApiError carries statusCode, errorType, errorCode, requestId', async () => {
    mockFetchError(400, {
      error_type:    'INVALID_INPUT',
      error_code:    'INVALID_PUBLIC_TOKEN',
      error_message: 'invalid public token',
      request_id:    'req-err-002',
    });

    const client = makeClient();
    let caughtError: PlaidApiError | undefined;
    try {
      await client.exchangePublicToken('bad-token');
    } catch (err) {
      caughtError = err as PlaidApiError;
    }

    expect(caughtError).toBeInstanceOf(PlaidApiError);
    expect(caughtError!.statusCode).toBe(400);
    expect(caughtError!.errorType).toBe('INVALID_INPUT');
    expect(caughtError!.errorCode).toBe('INVALID_PUBLIC_TOKEN');
    expect(caughtError!.requestId).toBe('req-err-002');
  });
});

// ============================================================
// 8. Retry logic — exponential back-off on 5xx
// ============================================================

describe('PlaidClient — retry logic', () => {
  it('retries up to 3 times on 500 errors then throws', async () => {
    // All retries return 500
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error_type: 'API_ERROR', error_code: 'INTERNAL_SERVER_ERROR', error_message: 'oops', request_id: 'r1' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    // Speed up back-off in tests
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => { (fn as () => void)(); return 0 as unknown as ReturnType<typeof setTimeout>; });

    const client = makeClient();
    await expect(client.getBalance(ACCESS_TOKEN)).rejects.toThrow(PlaidApiError);

    // 1 original + 3 retries = 4 total fetch calls
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(4);
  });

  it('succeeds on the second attempt after an initial 500', async () => {
    const successBody = {
      accounts:   RAW_ACCOUNTS,
      item:       { item_id: ITEM_ID },
      request_id: 'req-retry-ok',
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error_type: 'API_ERROR', error_code: 'INTERNAL_SERVER_ERROR', error_message: 'first fail', request_id: 'r1' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successBody), {
          status:  200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => { (fn as () => void)(); return 0 as unknown as ReturnType<typeof setTimeout>; });

    const client   = makeClient();
    const response = await client.getBalance(ACCESS_TOKEN);
    expect(response.itemId).toBe(ITEM_ID);
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(2);
  });
});

// ============================================================
// 9. PlaidConfigError — missing env vars
// ============================================================

describe('PlaidClient — configuration validation', () => {
  it('throws PlaidConfigError when PLAID_ENV is not a recognised value', () => {
    expect(
      () => new PlaidClient({ clientId: 'id', secret: 'sec', env: 'staging' }),
    ).toThrow(PlaidConfigError);
  });
});

// ============================================================
// 10. Webhook — TRANSACTIONS_SYNC / INITIAL_UPDATE
// ============================================================

describe('Plaid Webhooks — TRANSACTIONS events', () => {
  it('handles TRANSACTIONS:INITIAL_UPDATE and routes to event bus', async () => {
    const bus     = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('plaid.*', handler);

    const payload: PlaidWebhookPayload = {
      webhook_type:     'TRANSACTIONS',
      webhook_code:     'INITIAL_UPDATE',
      item_id:          ITEM_ID,
      new_transactions: 15,
    };

    const result = await handlePlaidWebhook(
      'tenant-001',
      JSON.stringify(payload),
      payload,
      undefined,
      true, // skip sig verification
    );

    expect(result.routed).toBe(true);
    expect(result.routedTo).toBe('plaid.transactions.initial_update');
    expect(result.event.provider).toBe('plaid');
    expect(result.event.deadLettered).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('handles TRANSACTIONS:SYNC_UPDATES_AVAILABLE correctly', async () => {
    const payload: PlaidWebhookPayload = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id:      ITEM_ID,
    };

    const result = await handlePlaidWebhook('tenant-002', JSON.stringify(payload), payload, undefined, true);

    expect(result.routed).toBe(true);
    expect(result.routedTo).toBe('plaid.transactions.sync');
  });
});

// ============================================================
// 11. Webhook — ITEM_ERROR
// ============================================================

describe('Plaid Webhooks — ITEM events', () => {
  it('handles ITEM:ERROR and routes to plaid.item.error', async () => {
    const payload: PlaidWebhookPayload = {
      webhook_type: 'ITEM',
      webhook_code: 'ERROR',
      item_id:      ITEM_ID,
      error: {
        error_type:      'ITEM_ERROR',
        error_code:      'INVALID_CREDENTIALS',
        error_message:   'the provided credentials were not valid',
        display_message: 'The credentials provided were invalid.',
        request_id:      'req-item-err',
      },
    };

    const result = await handlePlaidWebhook('tenant-003', JSON.stringify(payload), payload, undefined, true);

    expect(result.routed).toBe(true);
    expect(result.routedTo).toBe('plaid.item.error');
    expect(result.event.eventType).toBe('ITEM:ERROR');
  });
});

// ============================================================
// 12. Webhook — signature verification
// ============================================================

describe('Plaid Webhooks — signature verification', () => {
  it('dead-letters the event when Plaid-Verification header is absent', async () => {
    const payload: PlaidWebhookPayload = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'DEFAULT_UPDATE',
      item_id:      ITEM_ID,
    };

    const result = await handlePlaidWebhook(
      'tenant-004',
      JSON.stringify(payload),
      payload,
      undefined,  // no header
      false,      // enforce sig verification
    );

    expect(result.event.deadLettered).toBe(true);
    expect(result.routed).toBe(false);
    expect(result.event.lastError).toMatch(/Plaid-Verification/i);
  });

  it('dead-letters the event when JWT is malformed (not 3 segments)', async () => {
    const payload: PlaidWebhookPayload = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'DEFAULT_UPDATE',
      item_id:      ITEM_ID,
    };

    const result = await handlePlaidWebhook(
      'tenant-005',
      JSON.stringify(payload),
      payload,
      'not.a.valid.jwt.at.all.extra.dots',
      false,
    );

    expect(result.event.deadLettered).toBe(true);
    expect(result.event.lastError).toMatch(/Malformed JWT/);
  });

  it('accepts a structurally valid ES256 JWT header (STUB acceptance)', async () => {
    // Craft a minimal valid-structure JWT with ES256 header
    const header  = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'key-id-1', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000) })).toString('base64url');
    const sig     = Buffer.from('fake-sig').toString('base64url');
    const jwt     = `${header}.${payload}.${sig}`;

    const webhookPayload: PlaidWebhookPayload = {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'DEFAULT_UPDATE',
      item_id:      ITEM_ID,
    };

    const verifyResult = await verifyPlaidSignature(JSON.stringify(webhookPayload), jwt);
    expect(verifyResult.valid).toBe(true);
    // Stub acknowledges it has not done cryptographic verification
    expect(verifyResult.reason).toContain('STUB');
  });

  it('rejects a JWT with a non-ES256 algorithm', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'key-id-1' })).toString('base64url');
    const jwt    = `${header}.payload.sig`;

    const result = await verifyPlaidSignature('body', jwt);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/ES256/);
  });
});

// ============================================================
// 13. Webhook type guards
// ============================================================

describe('Plaid Webhook — type guards', () => {
  it('isTransactionsSyncEvent returns true for DEFAULT_UPDATE', () => {
    const p: PlaidWebhookPayload = { webhook_type: 'TRANSACTIONS', webhook_code: 'DEFAULT_UPDATE', item_id: ITEM_ID };
    expect(isTransactionsSyncEvent(p)).toBe(true);
  });

  it('isItemErrorEvent returns true for ITEM:ERROR', () => {
    const p: PlaidWebhookPayload = { webhook_type: 'ITEM', webhook_code: 'ERROR', item_id: ITEM_ID };
    expect(isItemErrorEvent(p)).toBe(true);
  });

  it('isInitialUpdateEvent returns true for TRANSACTIONS:INITIAL_UPDATE', () => {
    const p: PlaidWebhookPayload = { webhook_type: 'TRANSACTIONS', webhook_code: 'INITIAL_UPDATE', item_id: ITEM_ID };
    expect(isInitialUpdateEvent(p)).toBe(true);
  });

  it('type guards are mutually exclusive for ITEM:ERROR', () => {
    const p: PlaidWebhookPayload = { webhook_type: 'ITEM', webhook_code: 'ERROR', item_id: ITEM_ID };
    expect(isTransactionsSyncEvent(p)).toBe(false);
    expect(isInitialUpdateEvent(p)).toBe(false);
  });
});

// ============================================================
// 14. Response sanitization
// ============================================================

describe('PlaidClient — response sanitization', () => {
  it('strips access_token and secret from nested objects', () => {
    const data = {
      item:         { item_id: 'item_xyz' },
      access_token: 'access-prod-SECRET',
      nested: {
        secret: 'another-SECRET',
        safe:   'keep-this',
      },
    };

    const sanitized = PlaidClient.sanitizeForLog(data) as Record<string, unknown>;
    expect(sanitized.access_token).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).secret).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).safe).toBe('keep-this');
    expect((sanitized.item as Record<string, unknown>).item_id).toBe('item_xyz');
  });

  it('returns non-object values unchanged', () => {
    expect(PlaidClient.sanitizeForLog('plain string')).toBe('plain string');
    expect(PlaidClient.sanitizeForLog(42)).toBe(42);
    expect(PlaidClient.sanitizeForLog(null)).toBeNull();
  });
});
