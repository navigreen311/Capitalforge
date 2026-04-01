// ============================================================
// CapitalForge — Plaid Integration
// Barrel export — import everything from this path.
// ============================================================

export {
  PlaidClient,
  PlaidApiError,
  PlaidConfigError,
  getPlaidClient,
  resetPlaidClient,
} from './plaid-client.js';

export type {
  PlaidLinkTokenCreateRequest,
  PlaidLinkTokenResponse,
  PlaidTokenExchangeResponse,
  PlaidAccount,
  PlaidAccountsResponse,
  PlaidTransaction,
  PlaidTransactionsResponse,
  PlaidBalanceResponse,
  PlaidIdentityResponse,
} from './plaid-client.js';

export {
  handlePlaidWebhook,
  verifyPlaidSignature,
  isTransactionsSyncEvent,
  isItemErrorEvent,
  isInitialUpdateEvent,
} from './plaid-webhooks.js';

export type {
  PlaidWebhookType,
  PlaidWebhookCode,
  PlaidWebhookPayload,
  PlaidWebhookError,
  WebhookProcessResult,
  SignatureVerificationResult,
} from './plaid-webhooks.js';
