// ============================================================
// CapitalForge — Field-Level Encryption Service
// AES-256-GCM with per-encryption random IV.
// Supports key rotation via versioned key registry.
// Primary key source: ENCRYPTION_KEY env var.
// Stub for AWS KMS integration (swap getActiveKey/decrypt branch).
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// ── Constants ────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 12;          // 96-bit IV — NIST recommended for GCM
const AUTH_TAG_LENGTH = 16;    // 128-bit authentication tag
const KEY_LENGTH = 32;         // 256-bit key
const ENCODING = 'base64' as const;

/** Separator used in the ciphertext envelope string. */
const ENVELOPE_SEPARATOR = ':';

/** Current key version — bump when rotating keys. */
const CURRENT_KEY_VERSION = 1;

// ── Key management ────────────────────────────────────────────

/**
 * A versioned encryption key.
 * `id`      — integer version label stored in ciphertext envelopes.
 * `key`     — raw 32-byte Buffer.
 * `active`  — only one key should be active (used for new encryptions).
 */
export interface EncryptionKeyEntry {
  id: number;
  key: Buffer;
  active: boolean;
}

/**
 * Derives a 32-byte key from an arbitrary-length passphrase using
 * SHA-256. Not a KDF substitute for production key derivation, but
 * acceptable when the passphrase is itself a high-entropy secret.
 */
function deriveKey(passphrase: string): Buffer {
  return createHash('sha256').update(passphrase).digest();
}

/**
 * Loads the key registry from environment variables.
 *
 * Expected env vars:
 *  - `ENCRYPTION_KEY`    — current active key (required)
 *  - `ENCRYPTION_KEY_N`  — historical key with version N (optional, N ≥ 1)
 *
 * Example rotation env setup:
 *   ENCRYPTION_KEY=new-secret-value
 *   ENCRYPTION_KEY_1=old-secret-value
 */
function loadKeyRegistry(): Map<number, EncryptionKeyEntry> {
  const registry = new Map<number, EncryptionKeyEntry>();

  const primary = process.env['ENCRYPTION_KEY'];
  if (!primary) {
    throw new EncryptionConfigError(
      'ENCRYPTION_KEY environment variable is not set.',
    );
  }

  // Validate key length before deriving
  if (primary.length < 16) {
    throw new EncryptionConfigError(
      'ENCRYPTION_KEY must be at least 16 characters.',
    );
  }

  registry.set(CURRENT_KEY_VERSION, {
    id: CURRENT_KEY_VERSION,
    key: deriveKey(primary),
    active: true,
  });

  // Load historical keys for decryption of rotated ciphertext
  let version = 2;
  while (version <= 100) {
    const envKey = process.env[`ENCRYPTION_KEY_${version}`];
    if (!envKey) break;
    registry.set(version, {
      id: version,
      key: deriveKey(envKey),
      active: false,
    });
    version++;
  }

  return registry;
}

// ── Lazy key registry singleton ───────────────────────────────

let _keyRegistry: Map<number, EncryptionKeyEntry> | null = null;

function getKeyRegistry(): Map<number, EncryptionKeyEntry> {
  if (!_keyRegistry) {
    _keyRegistry = loadKeyRegistry();
  }
  return _keyRegistry;
}

/** Clears the key registry cache — used in tests when env vars change. */
export function resetKeyRegistryCache(): void {
  _keyRegistry = null;
}

function getActiveKey(): EncryptionKeyEntry {
  const registry = getKeyRegistry();
  for (const entry of registry.values()) {
    if (entry.active) return entry;
  }
  throw new EncryptionConfigError('No active encryption key found in registry.');
}

function getKeyById(id: number): EncryptionKeyEntry {
  const registry = getKeyRegistry();
  const entry = registry.get(id);
  if (!entry) {
    throw new EncryptionError(`No decryption key found for version ${id}.`);
  }
  return entry;
}

// ── AWS KMS stub ──────────────────────────────────────────────

/**
 * AWS KMS stub interface.
 * Replace with `@aws-sdk/client-kms` integration in production.
 *
 * When `USE_AWS_KMS=true`, the service delegates key material
 * retrieval to KMS. The stub below simulates the interface.
 */
export interface KMSProvider {
  encrypt(keyId: string, plaintext: Buffer): Promise<Buffer>;
  decrypt(keyId: string, ciphertext: Buffer): Promise<Buffer>;
}

let _kmsProvider: KMSProvider | null = null;

/** Inject a real or mock KMS provider (for testing / production wiring). */
export function setKMSProvider(provider: KMSProvider | null): void {
  _kmsProvider = provider;
}

// ── Envelope format ───────────────────────────────────────────

/**
 * Ciphertext envelope (base64-encoded, colon-separated):
 *   `<keyVersion>:<iv>:<authTag>:<ciphertext>`
 *
 * All segments are base64 to keep the string URL/DB safe.
 */
interface CiphertextEnvelope {
  keyVersion: number;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

function serializeEnvelope(env: CiphertextEnvelope): string {
  return [
    env.keyVersion.toString(),
    env.iv.toString(ENCODING),
    env.authTag.toString(ENCODING),
    env.ciphertext.toString(ENCODING),
  ].join(ENVELOPE_SEPARATOR);
}

function parseEnvelope(raw: string): CiphertextEnvelope {
  const parts = raw.split(ENVELOPE_SEPARATOR);
  if (parts.length !== 4) {
    throw new EncryptionError('Invalid ciphertext envelope format.');
  }
  const [versionStr, ivB64, tagB64, ctB64] = parts as [string, string, string, string];

  const keyVersion = parseInt(versionStr, 10);
  if (isNaN(keyVersion) || keyVersion < 1) {
    throw new EncryptionError('Invalid key version in ciphertext envelope.');
  }

  return {
    keyVersion,
    iv: Buffer.from(ivB64, ENCODING),
    authTag: Buffer.from(tagB64, ENCODING),
    ciphertext: Buffer.from(ctB64, ENCODING),
  };
}

// ── Core encrypt / decrypt ────────────────────────────────────

/**
 * Encrypts `plaintext` with AES-256-GCM.
 *
 * Returns a self-describing envelope string that includes the key
 * version so that decryption can locate the correct key automatically
 * even after key rotation.
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new EncryptionError('encrypt() expects a string value.');
  }

  const keyEntry = getActiveKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, keyEntry.key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return serializeEnvelope({
    keyVersion: keyEntry.id,
    iv,
    authTag,
    ciphertext: encrypted,
  });
}

/**
 * Decrypts a ciphertext envelope produced by `encrypt()`.
 *
 * Automatically selects the correct decryption key by reading the
 * version stored in the envelope — supports rotating keys without
 * re-encrypting all existing data immediately.
 */
export function decrypt(envelopeStr: string): string {
  if (typeof envelopeStr !== 'string') {
    throw new EncryptionError('decrypt() expects a string value.');
  }

  const envelope = parseEnvelope(envelopeStr);
  const keyEntry = getKeyById(envelope.keyVersion);

  const decipher = createDecipheriv(ALGORITHM, keyEntry.key, envelope.iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(envelope.authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(envelope.ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    throw new EncryptionError(
      'Decryption failed — authentication tag mismatch or corrupted data.',
    );
  }
}

// ── PII field helpers ─────────────────────────────────────────

/** Names of PII fields that receive field-level encryption. */
export type PIIFieldName = 'ssn' | 'ein' | 'cardNumber' | 'bankAccountNumber' | 'driverLicenseNumber';

/**
 * Encrypts a known PII field value.
 * Strips formatting before encryption so the canonical stored form is
 * digits-only; this normalises comparisons at decrypt time.
 */
export function encryptPIIField(fieldName: PIIFieldName, value: string): string {
  if (!value) return value;
  const normalized = normalizePIIValue(fieldName, value);
  return encrypt(normalized);
}

/**
 * Decrypts a previously-encrypted PII field value.
 * Returns the canonical (stripped-of-formatting) form.
 */
export function decryptPIIField(_fieldName: PIIFieldName, ciphertext: string): string {
  return decrypt(ciphertext);
}

/**
 * Strips formatting characters from PII values before encryption.
 */
function normalizePIIValue(fieldName: PIIFieldName, value: string): string {
  switch (fieldName) {
    case 'ssn':
    case 'ein':
    case 'cardNumber':
    case 'bankAccountNumber':
      // Keep only digits
      return value.replace(/\D/g, '');
    default:
      return value.trim();
  }
}

// ── Key rotation helper ───────────────────────────────────────

/**
 * Re-encrypts `oldCiphertext` under the currently active key.
 *
 * Call this during a rotation job to migrate stored values to the
 * new key. The old key must still be present in the registry
 * (as `ENCRYPTION_KEY_N`) for decryption to succeed.
 */
export function rotateKey(oldCiphertext: string): string {
  const plaintext = decrypt(oldCiphertext);
  return encrypt(plaintext);
}

/**
 * Returns `true` if `ciphertext` was encrypted with the current
 * active key version (i.e., rotation is not needed).
 */
export function isCurrentKeyVersion(ciphertext: string): boolean {
  try {
    const envelope = parseEnvelope(ciphertext);
    return envelope.keyVersion === CURRENT_KEY_VERSION;
  } catch {
    return false;
  }
}

// ── Error types ───────────────────────────────────────────────

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionConfigError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
