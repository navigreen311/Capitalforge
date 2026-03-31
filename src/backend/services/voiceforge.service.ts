// ============================================================
// CapitalForge — VoiceForge Service
//
// Twilio integration stub for telephony, call recording,
// outreach campaigns, and transcript retrieval.
//
// TCPA CONTRACT — non-negotiable:
//   consentGate.check(tenantId, businessId, 'voice') MUST return
//   { allowed: true } before ANY outbound dial attempt.
//   A denied gate result is a HARD STOP — call is never placed.
//
// Outreach campaigns:
//   - APR expiry outreach: queries rounds with approaching expiry,
//     checks consent per business, initiates calls for allowed ones.
//   - Repayment reminder outreach: targets businesses with upcoming
//     payment due dates.
//   - Re-stack consultation scheduling: targets businesses eligible
//     for a follow-on funding round.
//
// All calls are logged to the Document Vault.
// All call lifecycle events are published to the Event Bus.
//
// Twilio stub: replace the _twilioClient stub methods with the
// real Twilio Node SDK in production:
//   import twilio from 'twilio';
//   const client = twilio(accountSid, authToken);
//   client.calls.create({ ... })
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import { consentGate, TcpaConsentError } from './consent-gate.js';
import { DocumentVaultService } from './document-vault.service.js';
import logger from '../config/logger.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type CallStatus =
  | 'queued'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no-answer';

export type CallDirection = 'outbound' | 'inbound';

export type OutreachCampaignType = 'apr_expiry' | 'repayment_reminder' | 'restack_consultation';

export interface InitiateCallInput {
  tenantId: string;
  businessId: string;
  toPhoneNumber: string;
  fromPhoneNumber: string;
  advisorId?: string;
  purpose: string;
  campaignType?: OutreachCampaignType;
  campaignId?: string;
}

export interface CallRecord {
  id: string;
  tenantId: string;
  businessId: string;
  advisorId: string | null;
  twilioCallSid: string | null;
  toPhoneNumber: string;
  fromPhoneNumber: string;
  direction: CallDirection;
  status: CallStatus;
  purpose: string;
  campaignType: string | null;
  campaignId: string | null;
  durationSeconds: number | null;
  recordingSid: string | null;
  recordingUrl: string | null;
  transcriptText: string | null;
  documentVaultId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

export interface StartRecordingResult {
  callId: string;
  recordingSid: string;
  status: 'recording';
}

export interface StopRecordingResult {
  callId: string;
  recordingSid: string;
  status: 'stopped';
  recordingUrl: string;
}

export interface TranscriptResult {
  callId: string;
  twilioCallSid: string | null;
  transcriptText: string | null;
  transcriptSource: 'twilio_voice_intelligence' | 'manual' | null;
  generatedAt: Date | null;
}

export interface OutreachCampaignResult {
  campaignId: string;
  campaignType: OutreachCampaignType;
  tenantId: string;
  totalTargets: number;
  consentBlocked: number;
  callsInitiated: number;
  errors: Array<{ businessId: string; reason: string }>;
  triggeredAt: Date;
}

export interface ListCallsFilter {
  tenantId: string;
  businessId?: string;
  advisorId?: string;
  campaignType?: OutreachCampaignType;
  status?: CallStatus;
  since?: string;
  page?: number;
  pageSize?: number;
}

// ── Twilio stub client ──────────────────────────────────────────────────────
// Replace with real Twilio SDK in production.

interface TwilioCallCreateParams {
  to: string;
  from: string;
  url: string;          // TwiML webhook
  statusCallback?: string;
  record?: boolean;
}

interface TwilioCallResource {
  sid: string;
  status: string;
  duration: string | null;
}

interface TwilioRecordingResource {
  sid: string;
  callSid: string;
  status: string;
  duration: string | null;
  mediaUrl: string;
}

/** Stub Twilio client — swap for `twilio(accountSid, authToken)` in production. */
class TwilioStubClient {
  async createCall(params: TwilioCallCreateParams): Promise<TwilioCallResource> {
    logger.info('[TwilioStub] createCall', { to: params.to, from: params.from });
    return {
      sid: `CA${uuidv4().replace(/-/g, '').slice(0, 32)}`,
      status: 'queued',
      duration: null,
    };
  }

  async fetchCall(callSid: string): Promise<TwilioCallResource> {
    logger.info('[TwilioStub] fetchCall', { callSid });
    return { sid: callSid, status: 'completed', duration: '120' };
  }

  async updateCall(callSid: string, status: 'completed'): Promise<TwilioCallResource> {
    logger.info('[TwilioStub] updateCall', { callSid, status });
    return { sid: callSid, status, duration: null };
  }

  async createRecording(callSid: string): Promise<TwilioRecordingResource> {
    logger.info('[TwilioStub] createRecording', { callSid });
    return {
      sid: `RE${uuidv4().replace(/-/g, '').slice(0, 32)}`,
      callSid,
      status: 'in-progress',
      duration: null,
      mediaUrl: `https://api.twilio.com/stub/recordings/${callSid}.mp3`,
    };
  }

  async stopRecording(recordingSid: string): Promise<TwilioRecordingResource> {
    logger.info('[TwilioStub] stopRecording', { recordingSid });
    return {
      sid: recordingSid,
      callSid: 'stub',
      status: 'completed',
      duration: '90',
      mediaUrl: `https://api.twilio.com/stub/recordings/${recordingSid}.mp3`,
    };
  }

  async fetchTranscript(callSid: string): Promise<string | null> {
    logger.info('[TwilioStub] fetchTranscript', { callSid });
    // In production: use Twilio Voice Intelligence service
    return null;
  }
}

// ── VoiceForgeService ────────────────────────────────────────────────────────

export class VoiceForgeService {
  private readonly prisma: PrismaClient;
  private readonly documentVault: DocumentVaultService;
  private readonly twilio: TwilioStubClient;

  constructor(prisma?: PrismaClient, documentVault?: DocumentVaultService) {
    this.prisma = prisma ?? new PrismaClient();
    this.documentVault = documentVault ?? new DocumentVaultService(this.prisma);
    this.twilio = new TwilioStubClient();
  }

  // ── Core Call Operations ─────────────────────────────────────────────────

  /**
   * Initiate an outbound call.
   *
   * TCPA GATE: consentGate.check() is called BEFORE any dial attempt.
   * If consent is denied the method throws TcpaConsentError immediately.
   * There is NO bypass path for this check.
   */
  async initiateCall(input: InitiateCallInput): Promise<CallRecord> {
    const log = logger.child({
      tenantId: input.tenantId,
      businessId: input.businessId,
    });

    // ── TCPA CONSENT GATE — non-negotiable pre-flight ──────────────
    const gateResult = await consentGate.check(
      input.tenantId,
      input.businessId,
      'voice',
    );

    if (!gateResult.allowed) {
      log.warn('[VoiceForge] TCPA consent gate blocked call', {
        reason: gateResult.reason,
        message: gateResult.message,
      });
      throw new TcpaConsentError(
        gateResult.reason,
        gateResult.message,
        'voice',
        input.businessId,
      );
    }

    log.info('[VoiceForge] TCPA consent confirmed — initiating call');

    // ── Place the call via Twilio ─────────────────────────────────
    const twilioCall = await this.twilio.createCall({
      to: input.toPhoneNumber,
      from: input.fromPhoneNumber,
      url: `${process.env['TWILIO_TWIML_BASE_URL'] ?? 'https://voiceforge.stub'}/twiml/outbound`,
      statusCallback: `${process.env['API_BASE_URL'] ?? 'https://api.stub'}/api/voiceforge/webhooks/call-status`,
      record: false, // recording started separately when needed
    });

    // ── Persist call record ───────────────────────────────────────
    const callId = uuidv4();
    const now = new Date();

    const record = await this.prisma.voiceCall.create({
      data: {
        id: callId,
        tenantId: input.tenantId,
        businessId: input.businessId,
        advisorId: input.advisorId ?? null,
        twilioCallSid: twilioCall.sid,
        toPhoneNumber: input.toPhoneNumber,
        fromPhoneNumber: input.fromPhoneNumber,
        direction: 'outbound' as const,
        status: 'queued' as const,
        purpose: input.purpose,
        campaignType: input.campaignType ?? null,
        campaignId: input.campaignId ?? null,
        startedAt: now,
      },
    });

    // ── Log to Document Vault ──────────────────────────────────────
    try {
      const vaultDoc = await this.documentVault.uploadDocument({
        tenantId: input.tenantId,
        businessId: input.businessId,
        documentType: 'receipt',
        title: `Call Log — ${input.purpose} — ${now.toISOString()}`,
        mimeType: 'application/json',
        content: Buffer.from(
          JSON.stringify({
            callId,
            twilioCallSid: twilioCall.sid,
            purpose: input.purpose,
            campaignType: input.campaignType,
            direction: 'outbound',
            initiatedAt: now.toISOString(),
          }),
        ),
        metadata: {
          callId,
          twilioCallSid: twilioCall.sid,
          callType: 'voiceforge_call',
          campaignType: input.campaignType,
        },
      });

      await this.prisma.voiceCall.update({
        where: { id: callId },
        data: { documentVaultId: vaultDoc.id },
      });
    } catch (vaultErr) {
      log.warn('[VoiceForge] Document Vault logging failed — call still proceeding', {
        callId,
        error: String(vaultErr),
      });
    }

    // ── Publish event ──────────────────────────────────────────────
    await eventBus.publish(input.tenantId, {
      eventType: 'call.initiated',
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId: input.businessId,
      payload: {
        callId,
        twilioCallSid: twilioCall.sid,
        purpose: input.purpose,
        campaignType: input.campaignType ?? null,
      },
    });

    log.info('[VoiceForge] Call initiated', {
      callId,
      twilioCallSid: twilioCall.sid,
    });

    return this._mapRecord(record);
  }

  /**
   * End an in-progress call by updating Twilio call status to "completed".
   */
  async endCall(callId: string, tenantId: string): Promise<CallRecord> {
    const existing = await this._requireCall(callId, tenantId);

    if (existing.twilioCallSid) {
      await this.twilio.updateCall(existing.twilioCallSid, 'completed');
    }

    const now = new Date();
    const updated = await this.prisma.voiceCall.update({
      where: { id: callId },
      data: {
        status: 'completed',
        endedAt: now,
        durationSeconds: existing.startedAt
          ? Math.round((now.getTime() - existing.startedAt.getTime()) / 1000)
          : null,
      },
    });

    // ── Publish CALL_COMPLETED event ──────────────────────────────
    await eventBus.publishAndPersist(tenantId, {
      eventType: EVENT_TYPES.CALL_COMPLETED,
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId: existing.businessId,
      payload: {
        callId,
        twilioCallSid: existing.twilioCallSid,
        durationSeconds: updated.durationSeconds,
        endedAt: now.toISOString(),
      },
    });

    logger.info('[VoiceForge] Call ended', { callId, durationSeconds: updated.durationSeconds });

    return this._mapRecord(updated);
  }

  /**
   * Fetch a single call record by ID (tenant-scoped).
   */
  async getCallRecord(callId: string, tenantId: string): Promise<CallRecord> {
    return this._requireCall(callId, tenantId);
  }

  /**
   * List call records with optional filters.
   */
  async listCallRecords(filter: ListCallsFilter): Promise<{
    records: CallRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenantId: filter.tenantId };
    if (filter.businessId) where['businessId'] = filter.businessId;
    if (filter.advisorId) where['advisorId'] = filter.advisorId;
    if (filter.campaignType) where['campaignType'] = filter.campaignType;
    if (filter.status) where['status'] = filter.status;
    if (filter.since) where['createdAt'] = { gte: new Date(filter.since) };

    const [raw, total] = await Promise.all([
      this.prisma.voiceCall.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.voiceCall.count({ where }),
    ]);

    return {
      records: raw.map((r) => this._mapRecord(r)),
      total,
      page,
      pageSize,
    };
  }

  // ── Recording ────────────────────────────────────────────────────────────

  /**
   * Start recording an in-progress call.
   */
  async startRecording(callId: string, tenantId: string): Promise<StartRecordingResult> {
    const call = await this._requireCall(callId, tenantId);

    if (!call.twilioCallSid) {
      throw new Error(`Call ${callId} has no Twilio SID — cannot start recording.`);
    }

    const recording = await this.twilio.createRecording(call.twilioCallSid);

    await this.prisma.voiceCall.update({
      where: { id: callId },
      data: { recordingSid: recording.sid },
    });

    logger.info('[VoiceForge] Recording started', { callId, recordingSid: recording.sid });

    return { callId, recordingSid: recording.sid, status: 'recording' };
  }

  /**
   * Stop an active recording and persist the recording URL.
   */
  async stopRecording(callId: string, tenantId: string): Promise<StopRecordingResult> {
    const call = await this._requireCall(callId, tenantId);

    if (!call.recordingSid) {
      throw new Error(`Call ${callId} has no active recording.`);
    }

    const stopped = await this.twilio.stopRecording(call.recordingSid);

    await this.prisma.voiceCall.update({
      where: { id: callId },
      data: {
        recordingUrl: stopped.mediaUrl,
        durationSeconds: stopped.duration ? parseInt(stopped.duration, 10) : null,
      },
    });

    logger.info('[VoiceForge] Recording stopped', {
      callId,
      recordingSid: stopped.sid,
      recordingUrl: stopped.mediaUrl,
    });

    return {
      callId,
      recordingSid: stopped.sid,
      status: 'stopped',
      recordingUrl: stopped.mediaUrl,
    };
  }

  // ── Transcripts ──────────────────────────────────────────────────────────

  /**
   * Retrieve the transcript for a completed call.
   * Fetches from Twilio Voice Intelligence stub; caches in DB.
   */
  async getTranscript(callId: string, tenantId: string): Promise<TranscriptResult> {
    const call = await this._requireCall(callId, tenantId);

    // Return cached transcript if available
    if (call.transcriptText) {
      return {
        callId,
        twilioCallSid: call.twilioCallSid,
        transcriptText: call.transcriptText,
        transcriptSource: 'twilio_voice_intelligence',
        generatedAt: call.endedAt,
      };
    }

    if (!call.twilioCallSid) {
      return {
        callId,
        twilioCallSid: null,
        transcriptText: null,
        transcriptSource: null,
        generatedAt: null,
      };
    }

    // Fetch from Twilio
    const transcriptText = await this.twilio.fetchTranscript(call.twilioCallSid);

    if (transcriptText) {
      await this.prisma.voiceCall.update({
        where: { id: callId },
        data: { transcriptText },
      });
    }

    return {
      callId,
      twilioCallSid: call.twilioCallSid,
      transcriptText,
      transcriptSource: transcriptText ? 'twilio_voice_intelligence' : null,
      generatedAt: transcriptText ? new Date() : null,
    };
  }

  // ── Outreach Campaigns ───────────────────────────────────────────────────

  /**
   * APR Expiry Outreach Campaign.
   *
   * Queries FundingRounds with approaching APR expiry (within the next
   * APR_ALERT_WINDOWS days), checks TCPA consent per business, and
   * initiates outbound calls for consented businesses.
   */
  async triggerAprExpiryOutreach(
    tenantId: string,
    fromPhoneNumber: string,
    advisorId?: string,
  ): Promise<OutreachCampaignResult> {
    const campaignId = uuidv4();
    const now = new Date();
    const cutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60-day window

    logger.info('[VoiceForge] APR expiry outreach campaign triggered', {
      campaignId,
      tenantId,
    });

    // Query rounds with approaching APR expiry
    const rounds = await this.prisma.fundingRound.findMany({
      where: {
        tenantId,
        status: 'in_progress',
        aprExpiryDate: {
          gte: now,
          lte: cutoff,
        },
      },
      include: {
        business: {
          select: { id: true, phoneNumber: true },
        },
      },
    });

    return this._executeCampaign({
      campaignId,
      campaignType: 'apr_expiry',
      tenantId,
      fromPhoneNumber,
      advisorId,
      targets: rounds
        .filter((r) => r.business?.phoneNumber)
        .map((r) => ({
          businessId: r.business!.id,
          toPhoneNumber: r.business!.phoneNumber!,
          purpose: `APR expiry alert — round expires ${r.aprExpiryDate?.toDateString() ?? 'soon'}`,
        })),
    });
  }

  /**
   * Repayment Reminder Outreach Campaign.
   *
   * Targets businesses with upcoming ACH debit / repayment due dates.
   */
  async triggerRepaymentReminderOutreach(
    tenantId: string,
    fromPhoneNumber: string,
    advisorId?: string,
  ): Promise<OutreachCampaignResult> {
    const campaignId = uuidv4();
    const now = new Date();
    const upcoming = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7-day lookahead

    logger.info('[VoiceForge] Repayment reminder outreach triggered', {
      campaignId,
      tenantId,
    });

    const schedules = await this.prisma.repaymentSchedule.findMany({
      where: {
        tenantId,
        status: 'pending',
        dueDate: { gte: now, lte: upcoming },
      },
      include: {
        business: {
          select: { id: true, phoneNumber: true },
        },
      },
    });

    return this._executeCampaign({
      campaignId,
      campaignType: 'repayment_reminder',
      tenantId,
      fromPhoneNumber,
      advisorId,
      targets: schedules
        .filter((s) => s.business?.phoneNumber)
        .map((s) => ({
          businessId: s.business!.id,
          toPhoneNumber: s.business!.phoneNumber!,
          purpose: `Repayment reminder — payment due ${s.dueDate?.toDateString() ?? 'soon'}`,
        })),
    });
  }

  /**
   * Re-stack Consultation Scheduling Campaign.
   *
   * Targets businesses that have completed a funding round and are
   * eligible for a follow-on re-stack consultation call.
   */
  async triggerRestackConsultationOutreach(
    tenantId: string,
    fromPhoneNumber: string,
    advisorId?: string,
  ): Promise<OutreachCampaignResult> {
    const campaignId = uuidv4();

    logger.info('[VoiceForge] Re-stack consultation outreach triggered', {
      campaignId,
      tenantId,
    });

    // Businesses with completed rounds and no active in-progress round
    const eligibleBusinesses = await this.prisma.business.findMany({
      where: {
        tenantId,
        status: 'active',
        fundingRounds: {
          some: { status: 'completed' },
          none: { status: 'in_progress' },
        },
      },
      select: { id: true, phoneNumber: true },
    });

    return this._executeCampaign({
      campaignId,
      campaignType: 'restack_consultation',
      tenantId,
      fromPhoneNumber,
      advisorId,
      targets: eligibleBusinesses
        .filter((b) => b.phoneNumber)
        .map((b) => ({
          businessId: b.id,
          toPhoneNumber: b.phoneNumber!,
          purpose: 'Re-stack consultation — explore next funding round',
        })),
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Execute a batch outreach campaign with TCPA gate per business. */
  private async _executeCampaign(params: {
    campaignId: string;
    campaignType: OutreachCampaignType;
    tenantId: string;
    fromPhoneNumber: string;
    advisorId?: string;
    targets: Array<{
      businessId: string;
      toPhoneNumber: string;
      purpose: string;
    }>;
  }): Promise<OutreachCampaignResult> {
    const errors: Array<{ businessId: string; reason: string }> = [];
    let consentBlocked = 0;
    let callsInitiated = 0;

    for (const target of params.targets) {
      try {
        await this.initiateCall({
          tenantId: params.tenantId,
          businessId: target.businessId,
          toPhoneNumber: target.toPhoneNumber,
          fromPhoneNumber: params.fromPhoneNumber,
          advisorId: params.advisorId,
          purpose: target.purpose,
          campaignType: params.campaignType,
          campaignId: params.campaignId,
        });
        callsInitiated++;
      } catch (err) {
        if (err instanceof TcpaConsentError) {
          consentBlocked++;
          logger.info('[VoiceForge] Campaign call blocked by consent gate', {
            businessId: target.businessId,
            reason: err.reason,
          });
        } else {
          errors.push({
            businessId: target.businessId,
            reason: err instanceof Error ? err.message : String(err),
          });
          logger.warn('[VoiceForge] Campaign call failed', {
            businessId: target.businessId,
            error: String(err),
          });
        }
      }
    }

    const result: OutreachCampaignResult = {
      campaignId: params.campaignId,
      campaignType: params.campaignType,
      tenantId: params.tenantId,
      totalTargets: params.targets.length,
      consentBlocked,
      callsInitiated,
      errors,
      triggeredAt: new Date(),
    };

    logger.info('[VoiceForge] Campaign complete', {
      campaignId: params.campaignId,
      campaignType: params.campaignType,
      totalTargets: params.targets.length,
      consentBlocked,
      callsInitiated,
      errorCount: errors.length,
    });

    return result;
  }

  /** Fetch a VoiceCall record by ID, scoped to tenant. Throws AppError if not found. */
  private async _requireCall(callId: string, tenantId: string): Promise<CallRecord> {
    const record = await this.prisma.voiceCall.findFirst({
      where: { id: callId, tenantId },
    });

    if (!record) {
      const { AppError } = await import('../middleware/error-handler.js');
      throw new AppError(404, 'NOT_FOUND', `Call record ${callId} not found.`);
    }

    return this._mapRecord(record);
  }

  private _mapRecord(r: {
    id: string;
    tenantId: string;
    businessId: string;
    advisorId: string | null;
    twilioCallSid: string | null;
    toPhoneNumber: string;
    fromPhoneNumber: string;
    direction: string;
    status: string;
    purpose: string;
    campaignType: string | null;
    campaignId: string | null;
    durationSeconds: number | null;
    recordingSid: string | null;
    recordingUrl: string | null;
    transcriptText: string | null;
    documentVaultId: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
  }): CallRecord {
    return {
      id: r.id,
      tenantId: r.tenantId,
      businessId: r.businessId,
      advisorId: r.advisorId,
      twilioCallSid: r.twilioCallSid,
      toPhoneNumber: r.toPhoneNumber,
      fromPhoneNumber: r.fromPhoneNumber,
      direction: r.direction as CallDirection,
      status: r.status as CallStatus,
      purpose: r.purpose,
      campaignType: r.campaignType,
      campaignId: r.campaignId,
      durationSeconds: r.durationSeconds,
      recordingSid: r.recordingSid,
      recordingUrl: r.recordingUrl,
      transcriptText: r.transcriptText,
      documentVaultId: r.documentVaultId,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      createdAt: r.createdAt,
    };
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────

export const voiceForgeService = new VoiceForgeService();
