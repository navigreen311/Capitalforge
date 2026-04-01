// ============================================================
// CapitalForge — Plaid Client Wrapper
// Production-ready HTTP wrapper for the Plaid API.
//
// Environment variables required:
//   PLAID_CLIENT_ID  — Plaid application client ID
//   PLAID_SECRET     — Plaid secret for the active environment
//   PLAID_ENV        — One of: sandbox | development | production
//
// All requests are retried up to MAX_RETRIES times with
// exponential back-off.  Raw tokens are scrubbed from logs.
// ============================================================

import { v4 as uuidv4 } from 'uuid';

// ── Constants ─────────────────────────────────────────────────

const MAX_RETRIES   = 3;
const BASE_DELAY_MS = 300;  // doubles each retry: 300, 600, 1200

const PLAID_BASE_URLS: Record<string, string> = {
  sandbox:     'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production:  'https://production.plaid.com',
};

// ── Plaid domain types ─────────────────────────────────────────

export interface PlaidLinkTokenCreateRequest {
  /** CapitalForge tenant / user identifier */
  userId:        string;
  clientName:    string;
  products:      string[];
  countryCodes:  string[];
  language:      string;
  webhookUrl?:   string;
}

export interface PlaidLinkTokenResponse {
  linkToken:  string;
  expiration: string;
  requestId:  string;
}

export interface PlaidTokenExchangeResponse {
  accessToken: string;
  itemId:      string;
  requestId:   string;
}

export interface PlaidAccount {
  accountId:    string;
  name:         string;
  officialName: string | null;
  type:         string;
  subtype:      string | null;
  mask:         string | null;
  balances: {
    available: number | null;
    current:   number | null;
    limit:     number | null;
    isoCurrencyCode: string | null;
  };
}

export interface PlaidAccountsResponse {
  accounts:  PlaidAccount[];
  itemId:    string;
  requestId: string;
}

export interface PlaidTransaction {
  transactionId:   string;
  accountId:       string;
  amount:          number;
  isoCurrencyCode: string | null;
  date:            string;
  name:            string;
  merchantName:    string | null;
  category:        string[];
  pending:         boolean;
}

export interface PlaidTransactionsResponse {
  transactions: PlaidTransaction[];
  totalTransactions: number;
  accounts:     PlaidAccount[];
  itemId:       string;
  requestId:    string;
}

export interface PlaidBalanceResponse {
  accounts:  PlaidAccount[];
  itemId:    string;
  requestId: string;
}

export interface PlaidIdentityResponse {
  accounts:  Array<
    PlaidAccount & {
      owners: Array<{
        names:          string[];
        emails:         Array<{ data: string; primary: boolean; type: string }>;
        phoneNumbers:   Array<{ data: string; primary: boolean; type: string }>;
        addresses:      Array<{
          data: {
            street:      string;
            city:        string;
            region:      string;
            postalCode:  string;
            country:     string;
          };
          primary: boolean;
        }>;
      }>;
    }
  >;
  itemId:    string;
  requestId: string;
}

// ── Internal helpers ───────────────────────────────────────────

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new PlaidConfigError(`Missing required env var: ${name}`);
  return value;
}

/** Replaces any value that looks like a Plaid token/secret in log output. */
function sanitizeForLog(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;

  const SENSITIVE_KEYS = new Set([
    'access_token',
    'accessToken',
    'public_token',
    'publicToken',
    'client_secret',
    'secret',
    'PLAID_SECRET',
  ]);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    sanitized[key] = SENSITIVE_KEYS.has(key)
      ? '[REDACTED]'
      : sanitizeForLog(value);
  }
  return sanitized;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Custom error types ─────────────────────────────────────────

export class PlaidConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaidConfigError';
  }
}

export class PlaidApiError extends Error {
  public readonly statusCode: number;
  public readonly errorType:  string;
  public readonly errorCode:  string;
  public readonly requestId:  string;

  constructor(opts: {
    message:    string;
    statusCode: number;
    errorType:  string;
    errorCode:  string;
    requestId:  string;
  }) {
    super(opts.message);
    this.name       = 'PlaidApiError';
    this.statusCode = opts.statusCode;
    this.errorType  = opts.errorType;
    this.errorCode  = opts.errorCode;
    this.requestId  = opts.requestId;
  }
}

// ── PlaidClient ────────────────────────────────────────────────

export class PlaidClient {
  private readonly clientId: string;
  private readonly secret:   string;
  private readonly baseUrl:  string;

  constructor(opts?: { clientId?: string; secret?: string; env?: string }) {
    const env      = opts?.env      ?? getEnv('PLAID_ENV');
    this.clientId  = opts?.clientId ?? getEnv('PLAID_CLIENT_ID');
    this.secret    = opts?.secret   ?? getEnv('PLAID_SECRET');
    this.baseUrl   = PLAID_BASE_URLS[env];

    if (!this.baseUrl) {
      throw new PlaidConfigError(
        `Unknown PLAID_ENV "${env}". Must be one of: ${Object.keys(PLAID_BASE_URLS).join(', ')}`,
      );
    }
  }

  // ── Private request machinery ──────────────────────────────

  /**
   * Core POST helper.  Retries on network failures and 5xx responses
   * with exponential back-off.  Authentication headers are injected
   * here and never logged.
   */
  private async request<T>(
    endpoint: string,
    body: Record<string, unknown>,
    attempt = 1,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const requestBody = {
      ...body,
      client_id: this.clientId,
      secret:    this.secret,
    };

    let response: Response;

    try {
      response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Plaid-Version': '2020-09-14',
          'X-Request-Id': uuidv4(),
        },
        body: JSON.stringify(requestBody),
      });
    } catch (networkError) {
      // Network-level failure — always retryable
      if (attempt <= MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
        return this.request<T>(endpoint, body, attempt + 1);
      }
      throw networkError;
    }

    if (!response.ok) {
      let errorBody: {
        error_type?:    string;
        error_code?:    string;
        error_message?: string;
        request_id?:    string;
      } = {};

      try {
        errorBody = (await response.json()) as typeof errorBody;
      } catch {
        // ignore JSON parse failures on error responses
      }

      // Retry on 5xx (server errors) only
      if (response.status >= 500 && attempt <= MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
        return this.request<T>(endpoint, body, attempt + 1);
      }

      throw new PlaidApiError({
        message:    errorBody.error_message ?? `Plaid API error: ${response.status}`,
        statusCode: response.status,
        errorType:  errorBody.error_type  ?? 'UNKNOWN',
        errorCode:  errorBody.error_code  ?? 'UNKNOWN',
        requestId:  errorBody.request_id  ?? '',
      });
    }

    return (await response.json()) as T;
  }

  // ── Public API surface ─────────────────────────────────────

  /**
   * Creates a Link token which the frontend passes to Plaid Link
   * to initiate the account connection flow.
   *
   * POST /link/token/create
   */
  async createLinkToken(
    req: PlaidLinkTokenCreateRequest,
  ): Promise<PlaidLinkTokenResponse> {
    const raw = await this.request<{
      link_token:  string;
      expiration:  string;
      request_id:  string;
    }>('/link/token/create', {
      user: { client_user_id: req.userId },
      client_name:   req.clientName,
      products:      req.products,
      country_codes: req.countryCodes,
      language:      req.language,
      ...(req.webhookUrl ? { webhook: req.webhookUrl } : {}),
    });

    return {
      linkToken:  raw.link_token,
      expiration: raw.expiration,
      requestId:  raw.request_id,
    };
  }

  /**
   * Exchanges the short-lived public_token (obtained from Plaid Link)
   * for a durable access_token stored server-side.
   *
   * POST /item/public_token/exchange
   */
  async exchangePublicToken(
    publicToken: string,
  ): Promise<PlaidTokenExchangeResponse> {
    const raw = await this.request<{
      access_token: string;
      item_id:      string;
      request_id:   string;
    }>('/item/public_token/exchange', {
      public_token: publicToken,
    });

    return {
      accessToken: raw.access_token,
      itemId:      raw.item_id,
      requestId:   raw.request_id,
    };
  }

  /**
   * Retrieves all accounts linked to an Item.
   *
   * POST /accounts/get
   */
  async getAccounts(accessToken: string): Promise<PlaidAccountsResponse> {
    const raw = await this.request<{
      accounts:   unknown[];
      item:       { item_id: string };
      request_id: string;
    }>('/accounts/get', { access_token: accessToken });

    return {
      accounts:  this.mapAccounts(raw.accounts as RawAccount[]),
      itemId:    raw.item.item_id,
      requestId: raw.request_id,
    };
  }

  /**
   * Retrieves transactions for an Item within a date range.
   *
   * POST /transactions/get
   */
  async getTransactions(
    accessToken: string,
    startDate:   string,   // YYYY-MM-DD
    endDate:     string,   // YYYY-MM-DD
    opts?: { count?: number; offset?: number },
  ): Promise<PlaidTransactionsResponse> {
    const raw = await this.request<{
      accounts:           unknown[];
      transactions:       unknown[];
      total_transactions: number;
      item:               { item_id: string };
      request_id:         string;
    }>('/transactions/get', {
      access_token: accessToken,
      start_date:   startDate,
      end_date:     endDate,
      options: {
        count:  opts?.count  ?? 100,
        offset: opts?.offset ?? 0,
      },
    });

    return {
      accounts:          this.mapAccounts(raw.accounts as RawAccount[]),
      transactions:      this.mapTransactions(raw.transactions as RawTransaction[]),
      totalTransactions: raw.total_transactions,
      itemId:            raw.item.item_id,
      requestId:         raw.request_id,
    };
  }

  /**
   * Retrieves real-time balance data for all accounts in an Item.
   *
   * POST /accounts/balance/get
   */
  async getBalance(accessToken: string): Promise<PlaidBalanceResponse> {
    const raw = await this.request<{
      accounts:   unknown[];
      item:       { item_id: string };
      request_id: string;
    }>('/accounts/balance/get', { access_token: accessToken });

    return {
      accounts:  this.mapAccounts(raw.accounts as RawAccount[]),
      itemId:    raw.item.item_id,
      requestId: raw.request_id,
    };
  }

  /**
   * Retrieves identity / ownership information for all accounts.
   *
   * POST /identity/get
   */
  async getIdentity(accessToken: string): Promise<PlaidIdentityResponse> {
    const raw = await this.request<{
      accounts:   unknown[];
      item:       { item_id: string };
      request_id: string;
    }>('/identity/get', { access_token: accessToken });

    return {
      accounts:  this.mapIdentityAccounts(raw.accounts),
      itemId:    raw.item.item_id,
      requestId: raw.request_id,
    };
  }

  // ── Private response mappers (snake_case → camelCase) ──────

  private mapAccounts(rawAccounts: RawAccount[]): PlaidAccount[] {
    return rawAccounts.map((a) => ({
      accountId:    a.account_id,
      name:         a.name,
      officialName: a.official_name ?? null,
      type:         a.type,
      subtype:      a.subtype ?? null,
      mask:         a.mask   ?? null,
      balances: {
        available:       a.balances?.available       ?? null,
        current:         a.balances?.current         ?? null,
        limit:           a.balances?.limit           ?? null,
        isoCurrencyCode: a.balances?.iso_currency_code ?? null,
      },
    }));
  }

  private mapTransactions(rawTxns: RawTransaction[]): PlaidTransaction[] {
    return rawTxns.map((t) => ({
      transactionId:   t.transaction_id,
      accountId:       t.account_id,
      amount:          t.amount,
      isoCurrencyCode: t.iso_currency_code ?? null,
      date:            t.date,
      name:            t.name,
      merchantName:    t.merchant_name ?? null,
      category:        t.category ?? [],
      pending:         t.pending,
    }));
  }

  private mapIdentityAccounts(rawAccounts: unknown[]): PlaidIdentityResponse['accounts'] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rawAccounts as any[]).map((a) => ({
      ...this.mapAccounts([a as RawAccount])[0],
      owners: (a.owners ?? []).map((owner: RawOwner) => ({
        names:       owner.names ?? [],
        emails:      (owner.emails ?? []).map((e: RawEmail) => ({
          data:    e.data,
          primary: e.primary,
          type:    e.type,
        })),
        phoneNumbers: (owner.phone_numbers ?? []).map((p: RawPhone) => ({
          data:    p.data,
          primary: p.primary,
          type:    p.type,
        })),
        addresses: (owner.addresses ?? []).map((addr: RawAddress) => ({
          data: {
            street:     addr.data?.street     ?? '',
            city:       addr.data?.city       ?? '',
            region:     addr.data?.region     ?? '',
            postalCode: addr.data?.postal_code ?? '',
            country:    addr.data?.country    ?? '',
          },
          primary: addr.primary,
        })),
      })),
    }));
  }

  /** Expose sanitizer so tests can verify scrubbing without calling real APIs. */
  static sanitizeForLog = sanitizeForLog;
}

// ── Raw Plaid wire types (internal use only) ───────────────────

interface RawAccount {
  account_id:    string;
  name:          string;
  official_name?: string;
  type:          string;
  subtype?:      string;
  mask?:         string;
  balances?: {
    available?:         number | null;
    current?:           number | null;
    limit?:             number | null;
    iso_currency_code?: string | null;
  };
}

interface RawTransaction {
  transaction_id:   string;
  account_id:       string;
  amount:           number;
  iso_currency_code?: string | null;
  date:             string;
  name:             string;
  merchant_name?:   string | null;
  category?:        string[];
  pending:          boolean;
}

interface RawOwner {
  names?:         string[];
  emails?:        RawEmail[];
  phone_numbers?: RawPhone[];
  addresses?:     RawAddress[];
}

interface RawEmail {
  data:    string;
  primary: boolean;
  type:    string;
}

interface RawPhone {
  data:    string;
  primary: boolean;
  type:    string;
}

interface RawAddress {
  data?: {
    street?:      string;
    city?:        string;
    region?:      string;
    postal_code?: string;
    country?:     string;
  };
  primary: boolean;
}

// ── Default singleton (driven by env vars at import time) ──────

let _defaultClient: PlaidClient | null = null;

/**
 * Returns a lazily-initialised PlaidClient using env vars.
 * Tests should construct their own instance with injected credentials.
 */
export function getPlaidClient(): PlaidClient {
  if (!_defaultClient) {
    _defaultClient = new PlaidClient();
  }
  return _defaultClient;
}

/** Resets the singleton — useful in tests. */
export function resetPlaidClient(): void {
  _defaultClient = null;
}
