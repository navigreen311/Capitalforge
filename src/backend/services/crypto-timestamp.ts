// ============================================================
// CapitalForge — Cryptographic Timestamp Service
//
// Produces an immutable proof token for every document.
// The token is:
//   SHA-256( sha256Hash || isoTimestamp || tenantId || documentId )
// encoded as a hex string, prefixed with a version tag so the
// algorithm can be upgraded without breaking existing records.
//
// This forms the regulatory proof chain:
//   - The underlying content hash proves WHAT was stored.
//   - The timestamp proves WHEN it was stored.
//   - The tenantId scopes the proof to the correct legal entity.
//   - The documentId ties the proof to a specific DB row.
//
// PRODUCTION NOTE: For legally-binding timestamps, supplement
// this with an RFC 3161 compliant TSA (e.g. DigiCert, GlobalSign).
// The token produced here is sufficient for internal chain-of-custody
// but may not satisfy certain court evidentiary standards on its own.
// ============================================================

import { createHash, timingSafeEqual } from 'crypto';

// ── Constants ─────────────────────────────────────────────────

/** Version tag prepended to every token. Bump when algorithm changes. */
const TOKEN_VERSION = 'v1';

/** Separator that cannot appear in hex strings or ISO dates. */
const SEP = '|';

// ── Types ──────────────────────────────────────────────────────

export interface TimestampInput {
  /** SHA-256 hex digest of the document content */
  contentHash: string;
  /** ISO-8601 timestamp string — use new Date().toISOString() */
  timestamp: string;
  /** Tenant UUID — scopes the proof to the correct legal entity */
  tenantId: string;
  /** Document UUID from the database */
  documentId: string;
}

export interface CryptoTimestampRecord {
  /** Opaque token stored in Document.cryptoTimestamp */
  token: string;
  /** The algorithm version embedded in the token */
  version: string;
  /** The exact timestamp used to generate the token */
  timestamp: string;
  /** The content hash used to generate the token */
  contentHash: string;
}

export interface VerifyResult {
  valid: boolean;
  /** Present only when valid === false */
  reason?: string;
}

// ── Core helpers ───────────────────────────────────────────────

/**
 * Computes SHA-256 over arbitrary data and returns the hex digest.
 */
export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Computes SHA-256 of raw binary content (Buffer or Uint8Array).
 * This is the canonical content hash stored on every Document record.
 */
export function hashContent(content: Buffer | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

// ── Token generation ───────────────────────────────────────────

/**
 * Generate a cryptographic timestamp token.
 *
 * The token binds content, time, tenant, and record identity into a
 * single hex string that can be independently re-derived and verified.
 *
 * Format:  `v1:<hex(sha256(contentHash|timestamp|tenantId|documentId))>`
 */
export function generateCryptoTimestamp(input: TimestampInput): CryptoTimestampRecord {
  const { contentHash, timestamp, tenantId, documentId } = input;

  // Validate inputs — all components are required for a meaningful proof
  if (!contentHash || !/^[0-9a-f]{64}$/i.test(contentHash)) {
    throw new Error(
      '[CryptoTimestamp] contentHash must be a 64-character hex string (SHA-256)',
    );
  }
  if (!timestamp || isNaN(Date.parse(timestamp))) {
    throw new Error('[CryptoTimestamp] timestamp must be a valid ISO-8601 date string');
  }
  if (!tenantId || tenantId.trim() === '') {
    throw new Error('[CryptoTimestamp] tenantId is required');
  }
  if (!documentId || documentId.trim() === '') {
    throw new Error('[CryptoTimestamp] documentId is required');
  }

  // Canonical concatenation — order is FIXED and must never change for v1
  const canonical = [contentHash, timestamp, tenantId, documentId].join(SEP);
  const proofHash = sha256Hex(canonical);
  const token = `${TOKEN_VERSION}:${proofHash}`;

  return {
    token,
    version: TOKEN_VERSION,
    timestamp,
    contentHash,
  };
}

// ── Verification ───────────────────────────────────────────────

/**
 * Verify a stored timestamp token against the claimed inputs.
 *
 * Uses timing-safe comparison to prevent oracle attacks.
 * Returns `{ valid: true }` when the token matches, or
 * `{ valid: false, reason: '...' }` on any mismatch or error.
 */
export function verifyCryptoTimestamp(
  token: string,
  input: TimestampInput,
): VerifyResult {
  try {
    // Parse version prefix
    const colonIdx = token.indexOf(':');
    if (colonIdx === -1) {
      return { valid: false, reason: 'Malformed token: missing version prefix' };
    }

    const version = token.substring(0, colonIdx);
    const storedHash = token.substring(colonIdx + 1);

    if (version !== TOKEN_VERSION) {
      return {
        valid: false,
        reason: `Unsupported token version: ${version}. Expected: ${TOKEN_VERSION}`,
      };
    }

    if (!/^[0-9a-f]{64}$/i.test(storedHash)) {
      return { valid: false, reason: 'Malformed token: hash segment is not 64-char hex' };
    }

    // Re-derive the expected hash from supplied inputs
    const { contentHash, timestamp, tenantId, documentId } = input;
    const canonical = [contentHash, timestamp, tenantId, documentId].join(SEP);
    const expectedHash = sha256Hex(canonical);

    // Timing-safe comparison prevents timing oracle attacks
    const storedBuf   = Buffer.from(storedHash.toLowerCase(),   'hex');
    const expectedBuf = Buffer.from(expectedHash.toLowerCase(), 'hex');

    if (storedBuf.length !== expectedBuf.length) {
      return { valid: false, reason: 'Hash length mismatch' };
    }

    const isMatch = timingSafeEqual(storedBuf, expectedBuf);
    if (!isMatch) {
      return { valid: false, reason: 'Token does not match the supplied document inputs' };
    }

    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, reason: `Verification error: ${message}` };
  }
}

// ── Utility ────────────────────────────────────────────────────

/**
 * Extract the embedded timestamp and content hash from a token record
 * without performing full verification.  Useful for display / logging.
 */
export function parseTokenRecord(record: CryptoTimestampRecord): {
  version: string;
  timestamp: string;
  contentHash: string;
  proofHash: string;
} {
  const proofHash = record.token.split(':')[1] ?? '';
  return {
    version:     record.version,
    timestamp:   record.timestamp,
    contentHash: record.contentHash,
    proofHash,
  };
}
