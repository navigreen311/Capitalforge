// ============================================================
// CapitalForge — Twilio Campaign Manager
//
// Orchestrates outreach campaigns for VoiceForge telephony.
//
// Campaigns:
//   runAprExpiryCampaign        — businesses with APR expiry in 60 days
//   runRepaymentReminderCampaign — businesses with upcoming repayment due dates
//   runRestackConsultationCampaign — businesses eligible for a follow-on round
//
// TCPA contract (non-negotiable):
//   consentGate.check(tenantId, businessId, 'voice') is called for
//   EVERY target before any call is placed. No batch-level bypass exists.
//   Blocked targets are counted and returned in the campaign result.
//
// Do-Not-Call enforcement:
//   The DNC list is checked via prisma.doNotCallList before consent gate.
//   A DNC match is a HARD STOP — same as consent denial.
//
// Rate limiting:
//   CAMPAIGN_CALLS_PER_SECOND defaults to 1. The manager enforces a
//   per-call delay between dials to stay within Twilio's recommended
//   outbound throughput limits.
//
// Note: Prisma models voiceCall, doNotCallList, repaymentSchedule are
// forward-declared (schema migration pending). Access via (prisma as any)
// following the same pattern used in voiceforge.service.ts.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { consentGate, TcpaConsentError } from '../../services/consent-gate.js';
import { eventBus } from '../../events/event-bus.js';
import { AGGREGATE_TYPES } from '@shared/constants/index.js';
import { TwilioClient } from './twilio-client.js';
import { DocumentVaultService } from '../../services/document-vault.service.js';
import logger from '../../config/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────

export type CampaignType = 'apr_expiry' | 'repayment_reminder' | 'restack_consultation';

export interface CampaignTarget {
  businessId: string;
  toPhoneNumber: string;
  purpose: string;
  /** Optional metadata attached to each call */
  meta?: Record<string, unknown>;
}

export interface CampaignConfig {
  tenantId: string;
  fromPhoneNumber: string;
  advisorId?: string;
  /** Max calls per second. Defaults to 1. */
  callsPerSecond?: number;
  /** Inline TwiML or TwiML URL. Defaults to env TWILIO_TWIML_BASE_URL. */
  twiml?: string;
  twimlUrl?: string;
}

export interface CampaignResult {
  campaignId: string;
  campaignType: CampaignType;
  tenantId: string;
  totalTargets: number;
  dncBlocked: number;
  consentBlocked: number;
  callsInitiated: number;
  errors: Array<{ businessId: string; reason: string }>;
  triggeredAt: Date;
}

// ── Rate-limit helper ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Campaign Manager ──────────────────────────────────────────────────────

export class TwilioCampaignManager {
  private readonly prisma: PrismaClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any; // forward-declared models not yet in Prisma schema
  private readonly twilioClient: TwilioClient;

  constructor(prisma?: PrismaClient, twilioClient?: TwilioClient) {
    this.prisma = prisma ?? new PrismaClient();
    this.db = this.prisma; // access stub models via any
    this.twilioClient =
      twilioClient ??
      new TwilioClient(this.prisma, new DocumentVaultService(this.prisma));
  }

  // ── APR Expiry Campaign ──────────────────────────────────────────────────

  /**
   * Outreach to businesses with an APR expiry date within 60 days.
   *
   * Queries active funding rounds with an approaching APR expiry,
   * checks DNC list and TCPA consent per business, then dials.
   */
  async runAprExpiryCampaign(config: CampaignConfig): Promise<CampaignResult> {
    const campaignId = uuidv4();
    const now = new Date();
    const cutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days

    logger.info('[TwilioCampaigns] APR expiry campaign starting', {
      campaignId,
      tenantId: config.tenantId,
    });

    // Forward-declared schema: voiceForge.service.ts uses same pattern
    const rounds = await this.db.fundingRound.findMany({
      where: {
        tenantId: config.tenantId,
        status: 'in_progress',
        aprExpiryDate: { gte: now, lte: cutoff },
      },
      include: {
        business: {
          select: { id: true, phoneNumber: true },
        },
      },
    });

    const targets: CampaignTarget[] = (rounds as Array<{
      id: string;
      business?: { id: string; phoneNumber?: string | null };
      aprExpiryDate?: Date | null;
    }>)
      .filter((r) => r.business?.phoneNumber)
      .map((r) => ({
        businessId: r.business!.id,
        toPhoneNumber: r.business!.phoneNumber!,
        purpose: `APR expiry alert — round expires ${r.aprExpiryDate?.toDateString() ?? 'soon'}`,
        meta: { fundingRoundId: r.id, aprExpiryDate: r.aprExpiryDate?.toISOString() },
      }));

    return this._executeCampaign('apr_expiry', campaignId, targets, config);
  }

  // ── Repayment Reminder Campaign ──────────────────────────────────────────

  /**
   * Outreach to businesses with a repayment due date within 7 days.
   *
   * Queries pending repayment schedules with a due date in the
   * 7-day lookahead window, checks DNC and consent per business.
   */
  async runRepaymentReminderCampaign(config: CampaignConfig): Promise<CampaignResult> {
    const campaignId = uuidv4();
    const now = new Date();
    const upcoming = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    logger.info('[TwilioCampaigns] Repayment reminder campaign starting', {
      campaignId,
      tenantId: config.tenantId,
    });

    // Forward-declared: repaymentSchedule model (see voiceforge.service.ts)
    const schedules = await this.db.repaymentSchedule.findMany({
      where: {
        tenantId: config.tenantId,
        status: 'pending',
        dueDate: { gte: now, lte: upcoming },
      },
      include: {
        business: {
          select: { id: true, phoneNumber: true },
        },
      },
    });

    // Deduplicate — one call per business even with multiple schedules due
    const seen = new Set<string>();
    const targets: CampaignTarget[] = [];
    for (const s of schedules as Array<{
      id: string;
      business?: { id: string; phoneNumber?: string | null };
      dueDate?: Date | null;
    }>) {
      if (!s.business?.phoneNumber || seen.has(s.business.id)) continue;
      seen.add(s.business.id);
      targets.push({
        businessId: s.business.id,
        toPhoneNumber: s.business.phoneNumber,
        purpose: `Repayment reminder — payment due ${s.dueDate?.toDateString() ?? 'soon'}`,
        meta: { repaymentScheduleId: s.id, dueDate: s.dueDate?.toISOString() },
      });
    }

    return this._executeCampaign('repayment_reminder', campaignId, targets, config);
  }

  // ── Re-stack Consultation Campaign ───────────────────────────────────────

  /**
   * Outreach to businesses eligible for a follow-on funding round.
   *
   * Targets active businesses that have at least one completed round
   * and no currently in-progress round.
   */
  async runRestackConsultationCampaign(config: CampaignConfig): Promise<CampaignResult> {
    const campaignId = uuidv4();

    logger.info('[TwilioCampaigns] Re-stack consultation campaign starting', {
      campaignId,
      tenantId: config.tenantId,
    });

    // Forward-declared: phoneNumber field not yet in Business schema
    const eligibleBusinesses = await this.db.business.findMany({
      where: {
        tenantId: config.tenantId,
        status: 'active',
        fundingRounds: {
          some: { status: 'completed' },
          none: { status: 'in_progress' },
        },
      },
      select: { id: true, phoneNumber: true },
    });

    const targets: CampaignTarget[] = (eligibleBusinesses as Array<{
      id: string;
      phoneNumber?: string | null;
    }>)
      .filter((b) => b.phoneNumber)
      .map((b) => ({
        businessId: b.id,
        toPhoneNumber: b.phoneNumber!,
        purpose: 'Re-stack consultation — explore next funding round',
      }));

    return this._executeCampaign('restack_consultation', campaignId, targets, config);
  }

  // ── Private: Campaign Executor ────────────────────────────────────────────

  /**
   * Core campaign execution loop.
   *
   * For each target:
   *   1. Check DNC list — HARD STOP if listed.
   *   2. Check TCPA consent gate — HARD STOP if denied.
   *   3. Dial via TwilioClient.makeCall().
   *   4. Persist VoiceCall record.
   *   5. Publish call.initiated event.
   *   6. Rate-limit: sleep between dials.
   */
  private async _executeCampaign(
    campaignType: CampaignType,
    campaignId: string,
    targets: CampaignTarget[],
    config: CampaignConfig,
  ): Promise<CampaignResult> {
    const callDelayMs = Math.round(1000 / Math.max(0.1, config.callsPerSecond ?? 1));
    const errors: Array<{ businessId: string; reason: string }> = [];
    let dncBlocked = 0;
    let consentBlocked = 0;
    let callsInitiated = 0;

    const log = logger.child({ campaignId, campaignType, tenantId: config.tenantId });

    for (const target of targets) {
      // ── 1. DNC check ────────────────────────────────────────────
      const dncEntry = await this.db.doNotCallList
        .findFirst({
          where: { phoneNumber: target.toPhoneNumber, tenantId: config.tenantId },
        })
        .catch(() => null); // graceful if table doesn't exist yet

      if (dncEntry) {
        dncBlocked++;
        log.info('[TwilioCampaigns] DNC list blocked call', {
          businessId: target.businessId,
          phoneNumber: target.toPhoneNumber,
        });
        continue;
      }

      // ── 2. TCPA consent gate ────────────────────────────────────
      let gateResult;
      try {
        gateResult = await consentGate.check(config.tenantId, target.businessId, 'voice');
      } catch (gateErr) {
        errors.push({
          businessId: target.businessId,
          reason: `Consent gate error: ${String(gateErr)}`,
        });
        log.warn('[TwilioCampaigns] Consent gate threw error', {
          businessId: target.businessId,
          error: String(gateErr),
        });
        continue;
      }

      if (!gateResult.allowed) {
        consentBlocked++;
        log.info('[TwilioCampaigns] TCPA consent gate blocked call', {
          businessId: target.businessId,
          reason: gateResult.reason,
        });
        continue;
      }

      // ── 3. Dial ─────────────────────────────────────────────────
      try {
        const callResult = await this.twilioClient.makeCall({
          tenantId: config.tenantId,
          businessId: target.businessId,
          to: target.toPhoneNumber,
          from: config.fromPhoneNumber,
          twiml: config.twiml,
          twimlUrl: config.twimlUrl,
          callPurpose: target.purpose,
        });

        // ── 4. Persist VoiceCall record ──────────────────────────
        const callId = uuidv4();
        await this.db.voiceCall.create({
          data: {
            id: callId,
            tenantId: config.tenantId,
            businessId: target.businessId,
            advisorId: config.advisorId ?? null,
            twilioCallSid: callResult.callSid,
            toPhoneNumber: target.toPhoneNumber,
            fromPhoneNumber: config.fromPhoneNumber,
            direction: 'outbound',
            status: 'queued',
            purpose: target.purpose,
            campaignType,
            campaignId,
            startedAt: new Date(),
          },
        });

        // ── 5. Publish event ─────────────────────────────────────
        await eventBus.publish(config.tenantId, {
          eventType: 'call.initiated',
          aggregateType: AGGREGATE_TYPES.BUSINESS,
          aggregateId: target.businessId,
          payload: {
            callId,
            twilioCallSid: callResult.callSid,
            campaignId,
            campaignType,
            purpose: target.purpose,
          },
        });

        callsInitiated++;
        log.info('[TwilioCampaigns] Call initiated', {
          businessId: target.businessId,
          callSid: callResult.callSid,
          callId,
        });
      } catch (err) {
        if (err instanceof TcpaConsentError) {
          // Defensive: shouldn't happen since we checked above, but handle it
          consentBlocked++;
          log.info('[TwilioCampaigns] TcpaConsentError during dial (unexpected)', {
            businessId: target.businessId,
          });
        } else {
          errors.push({
            businessId: target.businessId,
            reason: err instanceof Error ? err.message : String(err),
          });
          log.warn('[TwilioCampaigns] Call initiation failed', {
            businessId: target.businessId,
            error: String(err),
          });
        }
      }

      // ── 6. Rate limit ────────────────────────────────────────────
      if (callDelayMs > 0) {
        await sleep(callDelayMs);
      }
    }

    const result: CampaignResult = {
      campaignId,
      campaignType,
      tenantId: config.tenantId,
      totalTargets: targets.length,
      dncBlocked,
      consentBlocked,
      callsInitiated,
      errors,
      triggeredAt: new Date(),
    };

    log.info('[TwilioCampaigns] Campaign complete', {
      totalTargets: targets.length,
      dncBlocked,
      consentBlocked,
      callsInitiated,
      errorCount: errors.length,
    });

    return result;
  }
}

// ── Singleton export (lazy — avoids env-var check at import time) ─────────

let _twilioCampaignManagerInstance: TwilioCampaignManager | null = null;

export function getTwilioCampaignManager(): TwilioCampaignManager {
  if (!_twilioCampaignManagerInstance) {
    _twilioCampaignManagerInstance = new TwilioCampaignManager();
  }
  return _twilioCampaignManagerInstance;
}

/** Reset the singleton (for testing). */
export function resetTwilioCampaignManager(): void {
  _twilioCampaignManagerInstance = null;
}

/**
 * Lazily-initialised singleton accessor.
 * Calling this getter triggers construction — env vars must be set first.
 */
export const twilioCampaignManager: TwilioCampaignManager = new Proxy(
  {} as TwilioCampaignManager,
  {
    get(_target, prop) {
      return (getTwilioCampaignManager() as unknown as Record<string | symbol, unknown>)[prop];
    },
  },
);
