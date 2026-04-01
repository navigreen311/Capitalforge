// ============================================================
// CapitalForge — Webhook Signature Utilities
//
// HMAC-SHA256 signature generation and verification for:
//   1. Outgoing webhooks (our deliveries to tenant endpoints)
//   2. Incoming webhooks from Stripe, Plaid, DocuSign
//
// Signature format (outgoing):
//   X-CapitalForge-Signature: t=<timestamp>,v1=<hex-hmac>
//
// Constant-time comparison prevents timing attacks.
// ============================================================

import { createHmac, timingSafeEqual } from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SignatureHeader {
  /** Unix timestamp (seconds) included in the signed payload */
  timestamp: number;
  /** Hex-encoded HMAC-SHA256 */
  signature: string;
  /** Full header value: `t=<ts>,v1=<sig>` */
  header: string;
}

export interface VerificationResult {
  valid: boolean;
  reason?: 'missing_header' | 'malformed_header' | 'expired' | 'invalid_signature';
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default tolerance window for replay protection (5 minutes). */
const DEFAULT_TOLERANCE_SECONDS = 300;

// ── Outgoing — sign payloads we send to tenants ───────────────────────────────

/**
 * Generate an HMAC-SHA256 signature for an outgoing webhook delivery.
 *
 * Signed payload: `<timestamp>.<rawBody>`
 *
 * @param rawBody  JSON-serialized event payload (string)
 * @param secret   Subscription secret
 * @param timestamp  Unix seconds (defaults to now)
 */
export function generateWebhookSignature(
  rawBody: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): SignatureHeader {
  const signedPayload = `${timestamp}.${rawBody}`;
  const signature = createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  return {
    timestamp,
    signature,
    header: `t=${timestamp},v1=${signature}`,
  };
}

/**
 * Verify an incoming request is genuinely from CapitalForge
 * (when re-verifying echoed events, or for testing purposes).
 *
 * @param rawBody        Raw request body string (do NOT re-serialize)
 * @param headerValue    Value of X-CapitalForge-Signature header
 * @param secret         The subscription secret
 * @param toleranceSecs  Replay protection window (default 5 min)
 */
export function verifyWebhookSignature(
  rawBody: string,
  headerValue: string | undefined,
  secret: string,
  toleranceSecs: number = DEFAULT_TOLERANCE_SECONDS,
): VerificationResult {
  if (!headerValue) {
    return { valid: false, reason: 'missing_header' };
  }

  const { timestamp, signatures } = parseSignatureHeader(headerValue);

  if (timestamp === null || signatures.length === 0) {
    return { valid: false, reason: 'malformed_header' };
  }

  // Replay protection
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSecs) {
    return { valid: false, reason: 'expired' };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // Check any v1 signature in constant time
  const expectedBuf = Buffer.from(expected, 'hex');
  const matched = signatures.some((sig) => {
    try {
      const sigBuf = Buffer.from(sig, 'hex');
      return sigBuf.length === expectedBuf.length &&
        timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });

  if (!matched) {
    return { valid: false, reason: 'invalid_signature' };
  }

  return { valid: true };
}

// ── Incoming — verify Stripe / Plaid / DocuSign webhooks ─────────────────────

/**
 * Verify a Stripe webhook signature.
 *
 * Stripe header format: `t=<ts>,v1=<hex>,v0=<hex>`
 * Signed payload:       `<timestamp>.<rawBody>`
 *
 * @param rawBody         Raw request body buffer or string
 * @param stripeSignature Value of `Stripe-Signature` header
 * @param webhookSecret   Stripe endpoint signing secret (whsec_...)
 * @param toleranceSecs   Replay window (default 5 min)
 */
export function verifyStripeSignature(
  rawBody: string | Buffer,
  stripeSignature: string | undefined,
  webhookSecret: string,
  toleranceSecs: number = DEFAULT_TOLERANCE_SECONDS,
): VerificationResult {
  if (!stripeSignature) {
    return { valid: false, reason: 'missing_header' };
  }

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const { timestamp, signatures } = parseSignatureHeader(stripeSignature);

  if (timestamp === null || signatures.length === 0) {
    return { valid: false, reason: 'malformed_header' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSecs) {
    return { valid: false, reason: 'expired' };
  }

  const signedPayload = `${timestamp}.${body}`;
  const expected = createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const matched = signatures.some((sig) => {
    try {
      const sigBuf = Buffer.from(sig, 'hex');
      return sigBuf.length === expectedBuf.length &&
        timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });

  return matched ? { valid: true } : { valid: false, reason: 'invalid_signature' };
}

/**
 * Verify a Plaid webhook signature.
 *
 * Plaid uses a standalone JWT-based verification mechanism but also
 * supports simple HMAC for server-side webhook secrets. This function
 * handles the HMAC variant used with the webhook verification key.
 *
 * Plaid header: `Plaid-Verification` contains a JWT, but here we
 * verify the simpler `X-Plaid-Signature` HMAC variant.
 *
 * @param rawBody        Raw request body string
 * @param plaidSignature Value of `Plaid-Verification` or `X-Plaid-Signature`
 * @param secret         Plaid webhook secret
 */
export function verifyPlaidSignature(
  rawBody: string,
  plaidSignature: string | undefined,
  secret: string,
): VerificationResult {
  if (!plaidSignature) {
    return { valid: false, reason: 'missing_header' };
  }

  // Plaid uses hex-encoded HMAC-SHA256 of the raw body (no timestamp prefix)
  const expected = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  try {
    const sigBuf = Buffer.from(plaidSignature.toLowerCase(), 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expectedBuf.length) {
      return { valid: false, reason: 'invalid_signature' };
    }

    return timingSafeEqual(sigBuf, expectedBuf)
      ? { valid: true }
      : { valid: false, reason: 'invalid_signature' };
  } catch {
    return { valid: false, reason: 'malformed_header' };
  }
}

/**
 * Verify a DocuSign HMAC webhook signature.
 *
 * DocuSign signs with multiple HMAC keys, sending:
 *   X-DocuSign-Signature-1: <base64-hmac>
 *
 * @param rawBody         Raw request body string
 * @param docuSignature   Value of `X-DocuSign-Signature-1` (base64)
 * @param hmacKey         DocuSign HMAC key (base64-encoded)
 */
export function verifyDocuSignSignature(
  rawBody: string,
  docuSignature: string | undefined,
  hmacKey: string,
): VerificationResult {
  if (!docuSignature) {
    return { valid: false, reason: 'missing_header' };
  }

  try {
    // DocuSign key is base64-encoded
    const keyBuffer = Buffer.from(hmacKey, 'base64');
    const expected = createHmac('sha256', keyBuffer)
      .update(rawBody, 'utf8')
      .digest('base64');

    const expectedBuf = Buffer.from(expected, 'base64');
    const sigBuf = Buffer.from(docuSignature, 'base64');

    if (sigBuf.length !== expectedBuf.length) {
      return { valid: false, reason: 'invalid_signature' };
    }

    return timingSafeEqual(sigBuf, expectedBuf)
      ? { valid: true }
      : { valid: false, reason: 'invalid_signature' };
  } catch {
    return { valid: false, reason: 'malformed_header' };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface ParsedHeader {
  timestamp: number | null;
  signatures: string[];
}

/**
 * Parse a `t=<ts>,v1=<sig>[,v0=<sig>]` header into components.
 * Handles both Stripe and CapitalForge signature header formats.
 */
function parseSignatureHeader(header: string): ParsedHeader {
  const parts = header.split(',');
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;

    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();

    if (key === 't') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) timestamp = parsed;
    } else if (key === 'v1' || key === 'v0') {
      if (val.length > 0) signatures.push(val);
    }
  }

  return { timestamp, signatures };
}
