// ============================================================
// CapitalForge — Plaid Webhook Handler
//
// Supported webhook types:
//   TRANSACTIONS  / TRANSACTIONS_SYNC
//   ITEM          / ITEM_ERROR
//   TRANSACTIONS  / INITIAL_UPDATE
//
// Signature verification: Plaid sends a JWT in the
// Plaid-Verification header.  Full verification requires
// fetching the JWK from Plaid and validating with jose.
// The stub below captures the structure; wire up jose for prod.
//
// Processed events are routed to the shared EventBus.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { WebhookEvent } from '../../services/integration-layer.service.js';
import { EventBus } from '../../events/event-bus.js';

// ── Plaid webhook payload types ────────────────────────────────

export type PlaidWebhookType =
  | 'TRANSACTIONS'
  | 'ITEM'
  | 'AUTH'
  | 'IDENTITY'
  | 'ASSETS'
  | 'INVESTMENTS';

export type PlaidWebhookCode =
  // TRANSACTIONS
  | 'INITIAL_UPDATE'
  | 'HISTORICAL_UPDATE'
  | 'DEFAULT_UPDATE'
  | 'TRANSACTIONS_REMOVED'
  | 'SYNC_UPDATES_AVAILABLE'
  // ITEM
  | 'ERROR'
  | 'PENDING_EXPIRATION'
  | 'USER_PERMISSION_REVOKED'
  | 'WEBHOOK_UPDATE_ACKNOWLEDGED'
  | string;

export interface PlaidWebhookPayload {
  webhook_type:         PlaidWebhookType | string;
  webhook_code:         PlaidWebhookCode;
  item_id:              string;
  error?:               PlaidWebhookError | null;
  new_transactions?:    number;
  removed_transactions?: string[];
  [key: string]:        unknown;
}

export interface PlaidWebhookError {
  error_type:    string;
  error_code:    string;
  error_message: string;
  display_message: string | null;
  request_id:    string;
  causes?:       unknown[];
}

export interface WebhookProcessResult {
  event:      WebhookEvent;
  routed:     boolean;
  routedTo:   string;
}

// ── Signature verification ─────────────────────────────────────

export interface SignatureVerificationResult {
  valid:     boolean;
  reason?:   string;
}

/**
 * Verifies the Plaid-Verification JWT header.
 *
 * STUB — production implementation must:
 *   1. Decode the JWT header to get the `kid`.
 *   2. Fetch https://production.plaid.com/api/webhook_verification_key/get
 *      with the `kid` (POST with client_id + secret).
 *   3. Construct a JWK from the response and verify via jose.
 *   4. Validate `iat` claim is within 5 minutes (replay prevention).
 *   5. Verify `alg` is ES256 (Plaid's signing algorithm).
 *
 * Wire up jose or similar for full verification before going live.
 */
export async function verifyPlaidSignature(
  rawBody:    string,
  jwtHeader:  string | undefined,
): Promise<SignatureVerificationResult> {
  if (!jwtHeader) {
    return { valid: false, reason: 'Missing Plaid-Verification header' };
  }

  // ── STUB: structural check only ───────────────────────────────
  // A real JWT has three base64url-encoded sections separated by dots.
  const parts = jwtHeader.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'Malformed JWT: expected 3 dot-separated segments' };
  }

  // Decode header segment to verify expected algorithm
  let header: { alg?: string; kid?: string } = {};
  try {
    header = JSON.parse(
      Buffer.from(parts[0]!, 'base64url').toString('utf8'),
    ) as { alg?: string; kid?: string };
  } catch {
    return { valid: false, reason: 'Could not parse JWT header' };
  }

  if (header.alg && header.alg !== 'ES256') {
    return {
      valid:  false,
      reason: `Unexpected signing algorithm: ${header.alg} (expected ES256)`,
    };
  }

  if (!header.kid) {
    return { valid: false, reason: 'JWT header missing kid (key ID)' };
  }

  // TODO: fetch JWK from Plaid, verify signature, check iat claim.
  // For now we mark as structurally valid so the downstream handler
  // can run in sandbox/development environments.
  void rawBody; // will be used in real hash verification

  return { valid: true, reason: 'STUB — cryptographic verification not yet wired up' };
}

// ── Event routing ──────────────────────────────────────────────

const TOPIC_MAP: Partial<Record<string, string>> = {
  'TRANSACTIONS:INITIAL_UPDATE':      'plaid.transactions.initial_update',
  'TRANSACTIONS:DEFAULT_UPDATE':      'plaid.transactions.default_update',
  'TRANSACTIONS:HISTORICAL_UPDATE':   'plaid.transactions.historical_update',
  'TRANSACTIONS:TRANSACTIONS_REMOVED':'plaid.transactions.removed',
  'TRANSACTIONS:SYNC_UPDATES_AVAILABLE': 'plaid.transactions.sync',
  'ITEM:ERROR':                       'plaid.item.error',
  'ITEM:PENDING_EXPIRATION':          'plaid.item.pending_expiration',
  'ITEM:USER_PERMISSION_REVOKED':     'plaid.item.permission_revoked',
  'ITEM:WEBHOOK_UPDATE_ACKNOWLEDGED': 'plaid.item.webhook_acknowledged',
};

function resolveEventTopic(webhookType: string, webhookCode: string): string {
  const key = `${webhookType}:${webhookCode}`;
  return TOPIC_MAP[key] ?? `plaid.${webhookType.toLowerCase()}.${webhookCode.toLowerCase()}`;
}

// ── Webhook handler ────────────────────────────────────────────

/**
 * Processes an inbound Plaid webhook.
 *
 * @param tenantId    — Tenant that owns this Plaid Item
 * @param rawBody     — Unparsed request body string (for signature verification)
 * @param payload     — Parsed webhook payload
 * @param jwtHeader   — Value of the Plaid-Verification header
 * @param skipSigVerification — Set true in development/tests to bypass sig check
 */
export async function handlePlaidWebhook(
  tenantId:            string,
  rawBody:             string,
  payload:             PlaidWebhookPayload,
  jwtHeader?:          string,
  skipSigVerification  = false,
): Promise<WebhookProcessResult> {
  // 1. Signature verification
  if (!skipSigVerification) {
    const verification = await verifyPlaidSignature(rawBody, jwtHeader);
    if (!verification.valid) {
      const failEvent: WebhookEvent = {
        id:           uuidv4(),
        provider:     'plaid',
        eventType:    'SIGNATURE_VERIFICATION_FAILED',
        payload:      payload as unknown as Record<string, unknown>,
        receivedAt:   new Date(),
        processedAt:  new Date(),
        attempts:     1,
        lastError:    verification.reason,
        deadLettered: true,   // immediately dead-letter invalid signatures
      };
      return { event: failEvent, routed: false, routedTo: 'dead-letter' };
    }
  }

  const webhookType = String(payload.webhook_type ?? 'UNKNOWN');
  const webhookCode = String(payload.webhook_code ?? 'UNKNOWN');
  const topic       = resolveEventTopic(webhookType, webhookCode);

  // 2. Build internal WebhookEvent
  const event: WebhookEvent = {
    id:           uuidv4(),
    provider:     'plaid',
    eventType:    `${webhookType}:${webhookCode}`,
    payload:      payload as unknown as Record<string, unknown>,
    receivedAt:   new Date(),
    attempts:     1,
    deadLettered: false,
  };

  // 3. Route to event bus
  const bus = EventBus.getInstance();
  try {
    await bus.publish(tenantId, {
      eventType:     topic,
      aggregateType: 'plaid_item',
      aggregateId:   payload.item_id ?? 'unknown',
      payload: {
        tenantId,
        webhookType,
        webhookCode,
        itemId:    payload.item_id,
        error:     payload.error ?? null,
        ...(payload.new_transactions !== undefined
          ? { newTransactions: payload.new_transactions }
          : {}),
        ...(payload.removed_transactions
          ? { removedTransactions: payload.removed_transactions }
          : {}),
      },
    });
    event.processedAt = new Date();
  } catch (err) {
    event.deadLettered = true;
    event.lastError    = err instanceof Error ? err.message : String(err);
    return { event, routed: false, routedTo: 'dead-letter' };
  }

  return { event, routed: true, routedTo: topic };
}

// ── Convenience type-guards ────────────────────────────────────

export function isTransactionsSyncEvent(payload: PlaidWebhookPayload): boolean {
  return (
    payload.webhook_type === 'TRANSACTIONS' &&
    (payload.webhook_code === 'SYNC_UPDATES_AVAILABLE' ||
     payload.webhook_code === 'DEFAULT_UPDATE')
  );
}

export function isItemErrorEvent(payload: PlaidWebhookPayload): boolean {
  return payload.webhook_type === 'ITEM' && payload.webhook_code === 'ERROR';
}

export function isInitialUpdateEvent(payload: PlaidWebhookPayload): boolean {
  return (
    payload.webhook_type === 'TRANSACTIONS' &&
    payload.webhook_code === 'INITIAL_UPDATE'
  );
}
