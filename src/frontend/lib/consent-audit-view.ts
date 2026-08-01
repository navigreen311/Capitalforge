// ============================================================
// CapitalForge — Consent and do-not-contact
//
// The compliance communication page called nothing, and two of its fixtures
// decided whether contacting somebody is lawful.
//
// A consent audit table gave each business a voice, SMS and email status:
//
//   Apex Ventures LLC        voice granted  sms granted     email granted
//   Summit Capital Group     voice none     sms none        email granted
//
// And a do-not-contact list of three entries. Both were literals. "Granted"
// asserted a TCPA basis to call and text a client, and the DNC list is the
// record of people who asked not to be. This system can send real SMS.
//
// What is real:
//   GET /api/businesses/:id/consent        — current status per channel
//   GET /api/businesses/:id/consent/audit  — the immutable history
//   GET /api/do-not-call                   — the suppression list
//
// The last of those did not exist until this repair. The table has been
// written to on every SMS opt-out, and checked by the sender before every
// send, but nothing could read it back.
//
// Absent consent is never rendered as granted. A business the page could not
// read is "unknown", not "not obtained" and certainly not "granted": one of
// those is a gap in the record and the other is permission to dial.
// ============================================================

export type ConsentStatus = 'active' | 'revoked' | 'expired' | 'pending' | 'unknown';

/** The channels a consent record can cover. */
export const CONSENT_CHANNELS = ['voice', 'sms', 'email', 'document'] as const;

export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export interface ConsentEntry {
  channel: string;
  consentType: string;
  status: ConsentStatus;
  grantedAt: string | null;
  revokedAt: string | null;
  /** What proves it. Null when nothing was recorded, which is itself a gap. */
  evidenceRef: string | null;
  recordId: string | null;
}

export interface BusinessConsent {
  businessId: string;
  businessName: string;
  /** Null when the consent record could not be read for this business. */
  entries: ConsentEntry[] | null;
}

export interface DncEntry {
  id: string;
  phoneNumber: string;
  businessId: string | null;
  /** Null when the number matched no client on file. Still a suppression. */
  businessName: string | null;
  source: string;
  reason: string | null;
  addedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

const STATUSES = new Set<string>(['active', 'revoked', 'expired', 'pending']);

/**
 * A consent status, or 'unknown'.
 *
 * Anything unrecognised becomes 'unknown' — never 'active'. Reading a value
 * this code does not understand as permission to contact someone is the one
 * failure mode that costs the client rather than the firm.
 */
export function toConsentStatus(raw: unknown): ConsentStatus {
  const s = (str(raw) ?? '').toLowerCase();
  return STATUSES.has(s) ? (s as ConsentStatus) : 'unknown';
}

export function toConsentEntries(data: unknown): ConsentEntry[] {
  const list = Array.isArray(data) ? data : asRecord(data)['records'];
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    const e = asRecord(entry);
    const channel = str(e['channel']);
    if (channel === null) return [];
    return [
      {
        channel,
        consentType: str(e['consentType']) ?? 'unspecified',
        status: toConsentStatus(e['status']),
        grantedAt: str(e['grantedAt']),
        revokedAt: str(e['revokedAt']),
        evidenceRef: str(e['evidenceRef']),
        recordId: str(e['id']) ?? str(e['recordId']),
      },
    ];
  });
}

export function toDncEntries(data: unknown): DncEntry[] {
  const list = Array.isArray(data) ? data : asRecord(data)['data'];
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    const e = asRecord(entry);
    const id = str(e['id']);
    const phoneNumber = str(e['phoneNumber']);
    // A suppression with no number suppresses nothing, and showing it as a
    // row implies a protection that is not in place.
    if (id === null || phoneNumber === null) return [];
    return [
      {
        id,
        phoneNumber,
        businessId: str(e['businessId']),
        businessName: str(e['businessName']),
        source: str(e['source']) ?? 'unknown',
        reason: str(e['reason']),
        addedAt: str(e['addedAt']),
      },
    ];
  });
}

// ── Derived ─────────────────────────────────────────────────

/**
 * Whether a channel may be used for a business, on the record as it stands.
 *
 * Returns 'unknown' when nothing covers the channel — not 'revoked', which
 * would read as a decision somebody made, and not 'active'. The page shows
 * the difference because it is the difference between "we have no basis" and
 * "we were told no".
 */
export function channelStatus(
  consent: BusinessConsent,
  channel: ConsentChannel,
): ConsentStatus {
  if (consent.entries === null) return 'unknown';

  const matching = consent.entries.filter((e) => e.channel === channel);
  if (matching.length === 0) return 'unknown';

  // A revocation anywhere on the channel wins: consent is revocable at any
  // time, and the most recent word is the one that counts.
  if (matching.some((e) => e.status === 'revoked')) return 'revoked';
  if (matching.some((e) => e.status === 'active')) return 'active';
  if (matching.some((e) => e.status === 'expired')) return 'expired';
  if (matching.some((e) => e.status === 'pending')) return 'pending';
  return 'unknown';
}

/** Whether contacting on this channel has a recorded basis. */
export function mayContact(consent: BusinessConsent, channel: ConsentChannel): boolean {
  return channelStatus(consent, channel) === 'active';
}

export interface ConsentSummary {
  businesses: number;
  /** Businesses whose consent record could not be read at all. */
  unreadable: number;
  /** Per contactable channel: how many businesses have a live consent. */
  contactable: Record<'voice' | 'sms' | 'email', number>;
  /** Per channel: how many have nothing on record either way. */
  unknown: Record<'voice' | 'sms' | 'email', number>;
}

const CONTACT_CHANNELS: ('voice' | 'sms' | 'email')[] = ['voice', 'sms', 'email'];

export function summariseConsent(rows: BusinessConsent[]): ConsentSummary {
  const contactable = { voice: 0, sms: 0, email: 0 };
  const unknown = { voice: 0, sms: 0, email: 0 };

  for (const row of rows) {
    for (const channel of CONTACT_CHANNELS) {
      const status = channelStatus(row, channel);
      if (status === 'active') contactable[channel] += 1;
      if (status === 'unknown') unknown[channel] += 1;
    }
  }

  return {
    businesses: rows.length,
    unreadable: rows.filter((r) => r.entries === null).length,
    contactable,
    unknown,
  };
}

/**
 * Businesses on the do-not-contact list.
 *
 * Matched by business id, which is what the opt-out handler records. A
 * suppression that matched no client is deliberately not attributed to one.
 */
export function suppressedBusinessIds(entries: DncEntry[]): Set<string> {
  return new Set(entries.map((e) => e.businessId).filter((id): id is string => id !== null));
}

/** Snake case to words, for values the API sends as enum keys. */
export function humanise(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}
