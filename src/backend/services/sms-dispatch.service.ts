// ============================================================
// CapitalForge — SMS dispatch
//
// Sends outbound SMS through Twilio with the checks that outreach to
// consumers legally requires, in this order:
//
//   1. a phone number on record          — nothing to send to otherwise
//   2. do-not-call list                  — an opt-out is permanent
//   3. TCPA consent for the sms channel  — the gate this product sells
//   4. quiet hours                       — no contact outside 8am–9pm
//
// Every outcome is written to SmsMessage, including the blocks. A message
// that was never sent is a fact worth keeping: it is the evidence that the
// gate worked, and without it a TCPA complaint cannot be answered.
// ============================================================

import { prisma as sharedPrisma } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';
import { consentGate } from './consent-gate.js';
import { getTwilioClient } from '../integrations/twilio/twilio-client.js';
import { resolveTimezone, hourInZone, type TimezoneSource } from './timezone.js';

const prisma = sharedPrisma;

// ── Configuration ────────────────────────────────────────────

/** TCPA restricts telephone solicitation to 8am–9pm in the recipient's local time. */
export const QUIET_HOURS_START = 8;
export const QUIET_HOURS_END = 21;

export type BlockedReason =
  | 'no_phone'
  | 'dnc'
  | 'no_consent'
  | 'quiet_hours'
  | 'unknown_timezone';

export interface SmsRecipientResult {
  businessId: string;
  status: 'sent' | 'blocked' | 'failed';
  blockedReason?: BlockedReason;
  detail?: string;
  providerSid?: string;
  messageId: string;
  /** Where the recipient's timezone came from, for audit. */
  timezone?: string | null;
  timezoneSource?: TimezoneSource;
}

export interface SmsCampaignOutcome {
  campaignId: string;
  requested: number;
  sent: number;
  blocked: number;
  failed: number;
  results: SmsRecipientResult[];
}

export interface DispatchInput {
  tenantId: string;
  businessIds: string[];
  body: string;
  purpose?: string;
  /** Overrides TWILIO_FROM_NUMBER when supplied. */
  fromPhoneNumber?: string;
  /** Evaluate quiet hours against this instant. Defaults to now. */
  asOf?: Date;
}

// ── Configuration checks ─────────────────────────────────────

export interface SmsConfigStatus {
  configured: boolean;
  missing: string[];
}

/**
 * Whether SMS can be sent at all.
 *
 * A from-number is as necessary as the credentials: Twilio rejects a send
 * without one, so treating it as optional would turn a configuration mistake
 * into a per-recipient failure.
 */
export function smsConfigStatus(): SmsConfigStatus {
  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'];
  const missing = required.filter((key) => !process.env[key]);
  return { configured: missing.length === 0, missing };
}

// ── Phone normalisation ──────────────────────────────────────

/**
 * Normalise to E.164 so a DNC entry cannot be missed on formatting.
 *
 * Only North American numbers are handled, because that is the only
 * numbering plan whose country code can be inferred from a bare 10-digit
 * string. Anything else must already carry a '+'.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// ── Quiet hours ──────────────────────────────────────────────

/**
 * Whether `asOf` falls inside the permitted contact window in `zone`.
 *
 * Judged in the recipient's own timezone via Intl, so daylight saving is
 * handled. This previously used the server's clock with an optional fixed
 * offset, which was wrong for any recipient in another zone and wrong for
 * everyone for half the year.
 */
export function withinQuietHours(asOf: Date, zone: string): boolean {
  const hour = hourInZone(asOf, zone);
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
}

// ── Dispatch ─────────────────────────────────────────────────

export async function dispatchSmsCampaign(input: DispatchInput): Promise<SmsCampaignOutcome> {
  const { tenantId, businessIds, body, purpose } = input;
  const campaignId = uuidv4();
  const asOf = input.asOf ?? new Date();
  const log = logger.child({ campaignId, tenantId });

  const status = smsConfigStatus();
  if (!status.configured) {
    // Callers are expected to check first; throwing here stops a
    // misconfiguration from being reported as a partial send.
    throw new Error(`SMS is not configured. Missing: ${status.missing.join(', ')}`);
  }

  const fromPhoneNumber =
    input.fromPhoneNumber ?? (process.env['TWILIO_FROM_NUMBER'] as string);

  const businesses = await prisma.business.findMany({
    where: { id: { in: businessIds }, tenantId },
    select: { id: true, legalName: true, phoneNumber: true, timezone: true },
  });
  const byId = new Map(businesses.map((b) => [b.id, b]));

  // One query for the tenant's do-not-call list rather than one per recipient.
  const dncRows = await prisma.doNotCallList.findMany({
    where: { tenantId },
    select: { phoneNumber: true },
  });
  const dnc = new Set(dncRows.map((d) => d.phoneNumber));

  const results: SmsRecipientResult[] = [];

  for (const businessId of businessIds) {
    const business = byId.get(businessId);
    const to = normalisePhone(business?.phoneNumber);

    const record = async (
      recordStatus: string,
      extra: Partial<{
        blockedReason: BlockedReason;
        providerSid: string;
        errorCode: string;
      }> = {},
    ) => {
      const row = await prisma.smsMessage.create({
        data: {
          tenantId,
          businessId: business ? businessId : null,
          direction: 'outbound',
          toPhoneNumber: to ?? business?.phoneNumber ?? 'unknown',
          fromPhoneNumber,
          body,
          status: recordStatus,
          campaignId,
          purpose: purpose ?? null,
          blockedReason: extra.blockedReason ?? null,
          providerSid: extra.providerSid ?? null,
          errorCode: extra.errorCode ?? null,
        },
      });
      return row.id;
    };

    // ── 1. A number to send to ──────────────────────────────
    if (!to) {
      results.push({
        businessId,
        status: 'blocked',
        blockedReason: 'no_phone',
        detail: business ? 'No usable phone number on record' : 'Business not found for this tenant',
        messageId: await record('blocked', { blockedReason: 'no_phone' }),
      });
      continue;
    }

    // ── 2. Do-not-call ──────────────────────────────────────
    if (dnc.has(to)) {
      log.info('SMS blocked by do-not-call list', { businessId });
      results.push({
        businessId,
        status: 'blocked',
        blockedReason: 'dnc',
        detail: 'Recipient is on the do-not-call list',
        messageId: await record('blocked', { blockedReason: 'dnc' }),
      });
      continue;
    }

    // ── 3. TCPA consent ─────────────────────────────────────
    let allowed = false;
    let consentDetail = 'No active TCPA SMS consent on record';
    try {
      const gate = await consentGate.check(tenantId, businessId, 'sms');
      allowed = gate.allowed;
      if (!gate.allowed) consentDetail = gate.message ?? gate.reason ?? consentDetail;
    } catch (error) {
      // A gate that cannot be evaluated is treated as a refusal. Failing open
      // here would send without knowing whether consent exists.
      log.warn('Consent gate error — treating as blocked', { businessId, error });
      allowed = false;
      consentDetail = 'Consent could not be verified';
    }

    if (!allowed) {
      results.push({
        businessId,
        status: 'blocked',
        blockedReason: 'no_consent',
        detail: consentDetail,
        messageId: await record('blocked', { blockedReason: 'no_consent' }),
      });
      continue;
    }

    // ── 4. Quiet hours, in the recipient's own timezone ─────
    const { zone, source } = resolveTimezone(business?.timezone, to);

    if (!zone) {
      // No stored zone and an area code outside the table. Refusing is the
      // only safe answer: sending anyway would be a guess, and the guess that
      // matters lands at 3am.
      results.push({
        businessId,
        status: 'blocked',
        blockedReason: 'unknown_timezone',
        detail:
          'No timezone on record and none derivable from the number. '
          + 'Set Business.timezone to enable outreach.',
        timezone: null,
        timezoneSource: 'none',
        messageId: await record('blocked', { blockedReason: 'unknown_timezone' }),
      });
      continue;
    }

    if (!withinQuietHours(asOf, zone)) {
      results.push({
        businessId,
        status: 'blocked',
        blockedReason: 'quiet_hours',
        detail:
          `Local time in ${zone} is outside the `
          + `${QUIET_HOURS_START}:00–${QUIET_HOURS_END}:00 contact window`,
        timezone: zone,
        timezoneSource: source,
        messageId: await record('blocked', { blockedReason: 'quiet_hours' }),
      });
      continue;
    }

    // ── 5. Send ─────────────────────────────────────────────
    try {
      const sent = await getTwilioClient().sendSms({
        tenantId,
        businessId,
        to,
        from: fromPhoneNumber,
        body,
      });

      results.push({
        businessId,
        status: 'sent',
        providerSid: sent.messageSid,
        timezone: zone,
        timezoneSource: source,
        messageId: await record(sent.status || 'sent', { providerSid: sent.messageSid }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log.error('SMS send failed', { businessId, error: detail });
      results.push({
        businessId,
        status: 'failed',
        detail,
        timezone: zone,
        timezoneSource: source,
        messageId: await record('failed', { errorCode: detail.slice(0, 100) }),
      });
    }
  }

  const outcome: SmsCampaignOutcome = {
    campaignId,
    requested: businessIds.length,
    sent: results.filter((r) => r.status === 'sent').length,
    blocked: results.filter((r) => r.status === 'blocked').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };

  log.info('SMS campaign complete', {
    requested: outcome.requested,
    sent: outcome.sent,
    blocked: outcome.blocked,
    failed: outcome.failed,
  });

  return outcome;
}

// ── Opt-out ──────────────────────────────────────────────────

/** Keywords that must stop further messages, per carrier and TCPA practice. */
const OPT_OUT_KEYWORDS = new Set([
  'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'revoke', 'optout', 'opt-out',
]);

export function isOptOutKeyword(body: string): boolean {
  return OPT_OUT_KEYWORDS.has(body.trim().toLowerCase().replace(/[.!]$/, ''));
}

/**
 * Honour an opt-out: add the number to the do-not-call list and revoke the
 * matching SMS consent.
 *
 * Both halves matter. The DNC entry stops future sends even if consent is
 * later re-granted in error, and revoking the consent record keeps the
 * consent ledger — which is what an audit reads — agreeing with reality.
 */
export async function recordOptOut(
  tenantId: string,
  rawPhone: string,
  reason = 'Inbound STOP message',
): Promise<{ phoneNumber: string; businessId: string | null; consentsRevoked: number }> {
  const phoneNumber = normalisePhone(rawPhone);
  if (!phoneNumber) {
    throw new Error(`Cannot record opt-out for unparseable number: ${rawPhone}`);
  }

  // Matched on the normalised form: an equality filter would miss numbers
  // stored with different formatting, and a missed match means an opt-out
  // that fails to revoke the consent behind it.
  const candidates = await prisma.business.findMany({
    where: { tenantId, phoneNumber: { not: null } },
    select: { id: true, phoneNumber: true },
  });
  const matched = candidates.find((b) => normalisePhone(b.phoneNumber) === phoneNumber) ?? null;

  await prisma.doNotCallList.upsert({
    where: { tenantId_phoneNumber: { tenantId, phoneNumber } },
    create: {
      tenantId,
      phoneNumber,
      businessId: matched?.id ?? null,
      source: 'opt_out',
      reason,
    },
    update: { reason, source: 'opt_out' },
  });

  let consentsRevoked = 0;
  if (matched) {
    const revoked = await prisma.consentRecord.updateMany({
      where: { tenantId, businessId: matched.id, channel: 'sms', status: 'active' },
      data: { status: 'revoked', revokedAt: new Date(), revocationReason: reason },
    });
    consentsRevoked = revoked.count;
  }

  logger.info('Opt-out recorded', { tenantId, businessId: matched?.id ?? null, consentsRevoked });

  return { phoneNumber, businessId: matched?.id ?? null, consentsRevoked };
}
