// ============================================================
// TCPA Consent Verification Gate
// ============================================================
// Checks whether a client has valid voice-consent on file
// before allowing outbound call initiation.
//
// In the current implementation this reads from localStorage
// (mock consent store). In production this would call the
// backend consent-management service.
// ============================================================

const CONSENT_STORAGE_KEY = 'cf_tcpa_consents';

export interface TcpaConsentRecord {
  clientId: string;
  voiceConsent: boolean;
  consentDate: string;
  revokedAt?: string;
  channel: 'web' | 'phone' | 'paper';
}

export interface TcpaVerificationResult {
  allowed: boolean;
  reason?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConsentStore(): Record<string, TcpaConsentRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, TcpaConsentRecord>) : {};
  } catch {
    return {};
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Verify that the given client has active TCPA voice consent.
 *
 * Returns `{ allowed: true }` when consent is on file and not revoked.
 * Returns `{ allowed: false, reason }` otherwise.
 */
export async function verifyTcpaConsent(
  clientId: string,
): Promise<TcpaVerificationResult> {
  const store = getConsentStore();
  const record = store[clientId];

  if (!record) {
    return { allowed: false, reason: 'No TCPA consent record found for this client.' };
  }

  if (!record.voiceConsent) {
    return { allowed: false, reason: 'Client has not granted voice consent.' };
  }

  if (record.revokedAt) {
    return { allowed: false, reason: 'Voice consent has been revoked.' };
  }

  return { allowed: true };
}

/**
 * Seed a mock consent record into localStorage (for development / testing).
 */
export function seedMockConsent(record: TcpaConsentRecord): void {
  if (typeof window === 'undefined') return;
  const store = getConsentStore();
  store[record.clientId] = record;
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(store));
}

/**
 * Revoke consent for a client (sets revokedAt timestamp).
 */
export function revokeMockConsent(clientId: string): void {
  if (typeof window === 'undefined') return;
  const store = getConsentStore();
  if (store[clientId]) {
    store[clientId].revokedAt = new Date().toISOString();
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(store));
  }
}
