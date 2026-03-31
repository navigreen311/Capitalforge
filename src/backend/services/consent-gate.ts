// ============================================================
// CapitalForge — TCPA Consent Gate
//
// THE authoritative pre-flight check before ANY outbound
// communication (call, SMS, email) is initiated.
//
// Usage contract:
//   - Call `consentGate.check(...)` BEFORE dialing, texting, or
//     emailing a client.
//   - If the result is `{ allowed: false }` — HARD STOP. Do not
//     proceed. Log the denial. Return the reason to the caller.
//   - This is non-negotiable. No bypass path exists in this module.
//
// TCPA rules enforced:
//   - voice + sms require active `tcpa` consent
//   - email requires active `tcpa` or `data_sharing` consent
//   - partner channel requires active `referral` consent
//   - document channel requires active `application` consent
//   - Revoked consent is IMMEDIATELY effective — no grace period
// ============================================================

import type {
  ConsentChannel,
  ConsentType,
} from '@shared/types/index.js';
import { ConsentService } from './consent.service.js';
import logger from '../config/logger.js';

// ----------------------------------------------------------------
// Gate result types
// ----------------------------------------------------------------

/** Returned when outbound communication is allowed. */
export interface GateAllowed {
  allowed: true;
  channel: ConsentChannel;
  consentType: ConsentType;
  businessId: string;
}

/** Returned when outbound communication is blocked. */
export interface GateDenied {
  allowed: false;
  channel: ConsentChannel;
  consentType: ConsentType;
  businessId: string;
  reason: ConsentDenyReason;
  message: string;
}

export type GateResult = GateAllowed | GateDenied;

export type ConsentDenyReason =
  | 'CONSENT_MISSING'      // No consent record exists for this channel
  | 'CONSENT_REVOKED'      // Consent was explicitly revoked
  | 'CONSENT_EXPIRED'      // Consent record has expired status
  | 'TCPA_HARD_BLOCK'      // Voice/SMS channel without any active TCPA consent
  | 'CHANNEL_NOT_SUPPORTED'; // Unknown channel passed to gate

// ----------------------------------------------------------------
// Channel-to-required-consentType mapping
// ----------------------------------------------------------------

/**
 * Defines which consentType is evaluated for each channel.
 * This is the authoritative mapping — changing it requires a
 * compliance review.
 */
const CHANNEL_CONSENT_REQUIREMENTS: Record<ConsentChannel, ConsentType[]> = {
  voice: ['tcpa'],
  sms: ['tcpa'],
  email: ['tcpa', 'data_sharing'],   // either satisfies email consent
  partner: ['referral', 'data_sharing'],
  document: ['application'],
};

/**
 * Channels that are TCPA-governed and carry the hardest legal
 * consequences if a violation occurs.
 */
const TCPA_HARD_CHANNELS: Set<ConsentChannel> = new Set(['voice', 'sms']);

// ----------------------------------------------------------------
// ConsentGate
// ----------------------------------------------------------------

export class ConsentGate {
  private readonly consentService: ConsentService;

  constructor(consentService?: ConsentService) {
    this.consentService = consentService ?? new ConsentService();
  }

  /**
   * Check whether outbound communication is allowed for a given
   * business + channel combination.
   *
   * This method:
   *   1. Validates the channel is known.
   *   2. Looks up the required consentType(s) for the channel.
   *   3. Queries the consent ledger for any active record.
   *   4. Returns `GateAllowed` or `GateDenied` — never throws.
   *
   * Callers MUST inspect `result.allowed` before proceeding.
   * A `false` result MUST be treated as a hard stop.
   */
  async check(
    tenantId: string,
    businessId: string,
    channel: ConsentChannel,
    /** Optional: override the internal ConsentService (useful for test injection) */
    consentServiceOverride?: ConsentService,
  ): Promise<GateResult> {
    const effectiveConsentService = consentServiceOverride ?? this.consentService;
    const log = logger.child({ tenantId, businessId, channel });

    // 1. Validate channel
    const requiredTypes = CHANNEL_CONSENT_REQUIREMENTS[channel];
    if (!requiredTypes) {
      log.warn('[ConsentGate] Unknown channel presented to gate', { channel });
      return this._deny(businessId, channel, 'tcpa', 'CHANNEL_NOT_SUPPORTED',
        `Channel "${channel}" is not a recognised communication channel.`);
    }

    // 2. Check if any of the accepted consentTypes have active consent
    let activeConsentType: ConsentType | null = null;

    for (const consentType of requiredTypes) {
      const hasConsent = await effectiveConsentService.hasActiveConsent(
        tenantId,
        businessId,
        channel,
        consentType,
      );
      if (hasConsent) {
        activeConsentType = consentType;
        break;
      }
    }

    // 3. No active consent found
    if (!activeConsentType) {
      // Determine the specific denial reason
      const anyRecord = await this._hasAnyRecord(
        tenantId,
        businessId,
        channel,
        effectiveConsentService,
      );

      // For TCPA channels (voice/sms) the regulatory exposure is highest
      if (TCPA_HARD_CHANNELS.has(channel)) {
        const reason: ConsentDenyReason = anyRecord
          ? 'CONSENT_REVOKED'
          : 'TCPA_HARD_BLOCK';

        const message = anyRecord
          ? `TCPA consent for ${channel} has been revoked. Outbound communication blocked.`
          : `No TCPA consent on record for ${channel}. Outbound communication blocked per TCPA.`;

        log.warn('[ConsentGate] TCPA hard block', { reason, channel });

        return this._deny(businessId, channel, requiredTypes[0]!, reason, message);
      }

      // Non-TCPA channels: softer denial but still blocked
      const reason: ConsentDenyReason = anyRecord ? 'CONSENT_REVOKED' : 'CONSENT_MISSING';
      const message = anyRecord
        ? `Consent for ${channel} channel has been revoked.`
        : `No active consent for ${channel} channel.`;

      log.info('[ConsentGate] Consent denied', { reason, channel });

      return this._deny(businessId, channel, requiredTypes[0]!, reason, message);
    }

    // 4. Active consent confirmed — allow
    log.debug('[ConsentGate] Consent confirmed — communication allowed', {
      channel,
      consentType: activeConsentType,
    });

    return {
      allowed: true,
      channel,
      consentType: activeConsentType,
      businessId,
    };
  }

  /**
   * Batch check — evaluates multiple channels at once.
   * Returns a map of channel → GateResult.
   * Useful for pre-flight UI display (show which channels are available).
   */
  async checkMany(
    tenantId: string,
    businessId: string,
    channels: ConsentChannel[],
  ): Promise<Map<ConsentChannel, GateResult>> {
    const results = await Promise.all(
      channels.map(async (channel) => ({
        channel,
        result: await this.check(tenantId, businessId, channel),
      })),
    );

    return new Map(results.map(({ channel, result }) => [channel, result]));
  }

  /**
   * Convenience: assert that outbound is allowed or throw.
   * Use in service methods that should throw rather than return a result.
   *
   * @throws {TcpaConsentError} if communication is blocked
   */
  async assertAllowed(
    tenantId: string,
    businessId: string,
    channel: ConsentChannel,
  ): Promise<void> {
    const result = await this.check(tenantId, businessId, channel);
    if (!result.allowed) {
      throw new TcpaConsentError(result.reason, result.message, channel, businessId);
    }
  }

  // ── Private helpers ───────────────────────────────────────────

  /** Check if any consent record (regardless of status) exists for this combination. */
  private async _hasAnyRecord(
    tenantId: string,
    businessId: string,
    channel: ConsentChannel,
    consentServiceOverride?: ConsentService,
  ): Promise<boolean> {
    const svc = consentServiceOverride ?? this.consentService;
    // We query the service for all statuses to determine revoked vs missing
    const statuses = await svc.getConsentStatuses(
      tenantId,
      businessId,
    );
    return statuses.some((s) => s.channel === channel);
  }

  private _deny(
    businessId: string,
    channel: ConsentChannel,
    consentType: ConsentType,
    reason: ConsentDenyReason,
    message: string,
  ): GateDenied {
    return { allowed: false, channel, consentType, businessId, reason, message };
  }
}

// ----------------------------------------------------------------
// TcpaConsentError — thrown by assertAllowed()
// ----------------------------------------------------------------

export class TcpaConsentError extends Error {
  public readonly reason: ConsentDenyReason;
  public readonly channel: ConsentChannel;
  public readonly businessId: string;

  constructor(
    reason: ConsentDenyReason,
    message: string,
    channel: ConsentChannel,
    businessId: string,
  ) {
    super(message);
    this.name = 'TcpaConsentError';
    this.reason = reason;
    this.channel = channel;
    this.businessId = businessId;
  }
}

// ----------------------------------------------------------------
// Singleton export — preferred usage across the app
// ----------------------------------------------------------------

export const consentGate = new ConsentGate();
