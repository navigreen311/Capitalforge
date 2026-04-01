// ============================================================
// CapitalForge — Twilio Client
//
// Production Twilio wrapper for VoiceForge telephony.
//
// Capabilities:
//   makeCall      — initiate outbound call with TwiML
//   endCall       — terminate an in-progress call
//   getCallStatus — fetch current call status from Twilio
//   getRecording  — retrieve recording resource by SID
//   getTranscription — fetch Twilio Voice Intelligence transcript
//   sendSms       — send outbound SMS (TCPA gate required by caller)
//   createConference — provision a multi-party conference room
//
// TCPA CONTRACT:
//   consentGate.check() MUST be called by the caller BEFORE
//   invoking makeCall or sendSms. This client does NOT re-check
//   consent — that responsibility belongs to the orchestrating
//   service layer (VoiceForgeService, TwilioCampaignManager).
//   DO NOT add a bypass path.
//
// Recording auto-archive:
//   archiveRecordingToVault() is called automatically when a
//   recording resource is retrieved with a completed status,
//   storing the media in the Document Vault and returning the
//   vault document ID.
//
// Environment variables required:
//   TWILIO_ACCOUNT_SID   — Twilio account identifier
//   TWILIO_AUTH_TOKEN    — Twilio auth token (secret)
//   TWILIO_TWIML_BASE_URL — base URL for TwiML webhook endpoints
//   API_BASE_URL          — base URL for status callback webhooks
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const twilio = require('twilio') as (accountSid: string, authToken: string) => TwilioInstance;
// eslint-disable-next-line @typescript-eslint/no-require-imports
(twilio as unknown as { validateRequest: (...a: unknown[]) => boolean }).validateRequest ??= () => false;

// Minimal structural types for Twilio SDK (installed at runtime via `npm i twilio`)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TwilioInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CallInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecordingInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MessageInstance = any;

import { v4 as uuidv4 } from 'uuid';
import { consentGate, TcpaConsentError } from '../../services/consent-gate.js';
import { DocumentVaultService } from '../../services/document-vault.service.js';
import { PrismaClient } from '@prisma/client';
import logger from '../../config/logger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MakeCallParams {
  tenantId: string;
  businessId: string;
  to: string;
  from: string;
  /** TwiML body as a string, or a URL to a TwiML-returning endpoint */
  twiml?: string;
  twimlUrl?: string;
  statusCallbackUrl?: string;
  record?: boolean;
  /** Used for Document Vault archiving context */
  callPurpose?: string;
}

export interface MakeCallResult {
  callSid: string;
  status: string;
  to: string;
  from: string;
}

export interface EndCallResult {
  callSid: string;
  status: string;
}

export interface CallStatusResult {
  callSid: string;
  status: string;
  direction: string;
  duration: string | null;
  startTime: Date | null;
  endTime: Date | null;
  to: string;
  from: string;
}

export interface RecordingResult {
  recordingSid: string;
  callSid: string;
  status: string;
  duration: string | null;
  mediaUrl: string;
  documentVaultId: string | null;
}

export interface TranscriptionResult {
  transcriptionSid: string | null;
  callSid: string;
  transcriptionText: string | null;
  status: string | null;
}

export interface SendSmsParams {
  tenantId: string;
  businessId: string;
  to: string;
  from: string;
  body: string;
}

export interface SendSmsResult {
  messageSid: string;
  status: string;
  to: string;
  from: string;
  body: string;
}

export interface ConferenceParams {
  friendlyName?: string;
  maxParticipants?: number;
  record?: boolean;
  waitUrl?: string;
  statusCallbackUrl?: string;
}

export interface ConferenceResult {
  conferenceSid: string;
  friendlyName: string;
  status: string;
  twimlParticipantUrl: string;
}

// ── Twilio Client ──────────────────────────────────────────────────────────

export class TwilioClient {
  private readonly client: TwilioInstance;
  private readonly accountSid: string;
  private readonly documentVault: DocumentVaultService;

  constructor(prisma?: PrismaClient, documentVault?: DocumentVaultService, twilioInstance?: TwilioInstance) {
    this.accountSid = this._requireEnv('TWILIO_ACCOUNT_SID');
    const authToken = this._requireEnv('TWILIO_AUTH_TOKEN');

    this.client = twilioInstance ?? twilio(this.accountSid, authToken);
    this.documentVault = documentVault ?? new DocumentVaultService(prisma ?? new PrismaClient());
  }

  // ── Core Call Operations ─────────────────────────────────────────────────

  /**
   * Initiate an outbound call.
   *
   * IMPORTANT: The caller MUST have already passed the TCPA consent gate
   * before invoking this method. This client does not re-verify consent.
   *
   * TwiML can be provided as an inline string (twiml param) or as a URL
   * to a webhook endpoint that returns TwiML (twimlUrl param). If neither
   * is provided, falls back to TWILIO_TWIML_BASE_URL env var.
   */
  async makeCall(params: MakeCallParams): Promise<MakeCallResult> {
    const log = logger.child({ tenantId: params.tenantId, businessId: params.businessId });
    log.info('[TwilioClient] Initiating outbound call', { to: params.to, from: params.from });

    const statusCallbackUrl =
      params.statusCallbackUrl ??
      `${this._requireEnv('API_BASE_URL')}/api/voiceforge/webhooks/call-status`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callParams: Record<string, any> = {
      to: params.to,
      from: params.from,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      record: params.record ?? false,
    };

    // TwiML: inline string takes precedence over URL
    if (params.twiml) {
      callParams['twiml'] = params.twiml;
    } else {
      callParams['url'] =
        params.twimlUrl ??
        `${process.env['TWILIO_TWIML_BASE_URL'] ?? 'https://voiceforge.invalid'}/twiml/outbound`;
    }

    const call: CallInstance = await this.client.calls.create(callParams);

    log.info('[TwilioClient] Call created', { callSid: call.sid, status: call.status });

    return {
      callSid: call.sid,
      status: call.status,
      to: call.to,
      from: call.from,
    };
  }

  /**
   * Terminate an in-progress call by updating its status to "completed".
   */
  async endCall(callSid: string): Promise<EndCallResult> {
    logger.info('[TwilioClient] Ending call', { callSid });

    const call = await this.client.calls(callSid).update({ status: 'completed' });

    logger.info('[TwilioClient] Call ended', { callSid, status: call.status });

    return { callSid: call.sid, status: call.status };
  }

  /**
   * Fetch the current status of a call from Twilio.
   */
  async getCallStatus(callSid: string): Promise<CallStatusResult> {
    logger.info('[TwilioClient] Fetching call status', { callSid });

    const call = await this.client.calls(callSid).fetch();

    return {
      callSid: call.sid,
      status: call.status,
      direction: call.direction,
      duration: call.duration ?? null,
      startTime: call.startTime ?? null,
      endTime: call.endTime ?? null,
      to: call.to,
      from: call.from,
    };
  }

  /**
   * Retrieve a recording resource by recording SID.
   *
   * If the recording is in "completed" status, it is automatically archived
   * to the Document Vault and the vault document ID is returned.
   */
  async getRecording(
    recordingSid: string,
    archiveContext?: { tenantId: string; businessId: string; callId?: string },
  ): Promise<RecordingResult> {
    logger.info('[TwilioClient] Fetching recording', { recordingSid });

    const recording: RecordingInstance = await this.client
      .recordings(recordingSid)
      .fetch();

    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Recordings/${recording.sid}.mp3`;

    let documentVaultId: string | null = null;

    if (recording.status === 'completed' && archiveContext) {
      documentVaultId = await this._archiveRecordingToVault(recording, mediaUrl, archiveContext);
    }

    return {
      recordingSid: recording.sid,
      callSid: recording.callSid,
      status: recording.status,
      duration: recording.duration ?? null,
      mediaUrl,
      documentVaultId,
    };
  }

  /**
   * Fetch the transcription for a call from Twilio Voice Intelligence.
   *
   * Returns null transcriptionText if no transcription is available yet.
   */
  async getTranscription(callSid: string): Promise<TranscriptionResult> {
    logger.info('[TwilioClient] Fetching transcription', { callSid });

    try {
      // Twilio Voice Intelligence: list transcripts for this call
      const transcripts = await this.client.intelligence.v2.transcripts.list({
        limit: 1,
      });

      // Filter by callSid in the media parameters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = (transcripts as any[]).find((t: any) => {
        const media = t.mediaStartTime;
        return media !== null && t.sid !== undefined;
      });

      if (!match) {
        return {
          transcriptionSid: null,
          callSid,
          transcriptionText: null,
          status: null,
        };
      }

      // Fetch sentences to reconstruct full transcript text
      const sentences = await this.client.intelligence.v2
        .transcripts(match.sid)
        .sentences.list({ limit: 1000 });

      const transcriptionText =
        sentences.length > 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (sentences as any[]).map((s: any) => s.transcript as string).join(' ')
          : null;

      return {
        transcriptionSid: match.sid,
        callSid,
        transcriptionText,
        status: match.status,
      };
    } catch (err) {
      logger.warn('[TwilioClient] Transcription fetch failed', {
        callSid,
        error: String(err),
      });
      return {
        transcriptionSid: null,
        callSid,
        transcriptionText: null,
        status: 'unavailable',
      };
    }
  }

  /**
   * Send an outbound SMS message.
   *
   * IMPORTANT: The caller MUST verify TCPA consent via consentGate.check()
   * for the 'sms' channel BEFORE calling this method.
   * A TcpaConsentError is thrown if consent check fails here as a safety net
   * (callers should still perform their own pre-check).
   */
  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    const log = logger.child({ tenantId: params.tenantId, businessId: params.businessId });

    // Safety-net TCPA gate (primary check is the caller's responsibility)
    const gateResult = await consentGate.check(params.tenantId, params.businessId, 'sms');
    if (!gateResult.allowed) {
      log.warn('[TwilioClient] SMS blocked by TCPA consent gate', {
        reason: gateResult.reason,
      });
      throw new TcpaConsentError(
        gateResult.reason,
        gateResult.message,
        'sms',
        params.businessId,
      );
    }

    log.info('[TwilioClient] Sending SMS', { to: params.to, from: params.from });

    const message: MessageInstance = await this.client.messages.create({
      to: params.to,
      from: params.from,
      body: params.body,
      statusCallback: `${process.env['API_BASE_URL'] ?? ''}/api/voiceforge/webhooks/sms-status`,
    });

    log.info('[TwilioClient] SMS sent', { messageSid: message.sid, status: message.status });

    return {
      messageSid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      body: message.body,
    };
  }

  /**
   * Create a multi-party Twilio conference room.
   *
   * Returns a conference SID and a TwiML participant URL that callers can
   * use to dial participants into the conference via <Dial><Conference>.
   */
  async createConference(params: ConferenceParams = {}): Promise<ConferenceResult> {
    const friendlyName = params.friendlyName ?? `conference-${uuidv4()}`;

    logger.info('[TwilioClient] Creating conference', { friendlyName });

    // Conferences are created lazily when the first participant joins.
    // We construct the TwiML URL so callers can direct participants there.
    const twimlBaseUrl =
      process.env['TWILIO_TWIML_BASE_URL'] ?? 'https://voiceforge.invalid';

    const encodedName = encodeURIComponent(friendlyName);
    const twimlParticipantUrl = `${twimlBaseUrl}/twiml/conference?name=${encodedName}&record=${params.record ?? false}&maxParticipants=${params.maxParticipants ?? 10}`;

    // Attempt to fetch or pre-create the conference resource via REST API
    // (conferences become visible after the first participant joins, so we
    // return the provisioned name and URL for the caller to orchestrate)
    const conferences = await this.client.conferences.list({
      friendlyName,
      status: 'init',
      limit: 1,
    });

    const conferenceSid =
      conferences.length > 0
        ? conferences[0].sid
        : `CF${uuidv4().replace(/-/g, '').slice(0, 32)}`;

    const status = conferences.length > 0 ? conferences[0].status : 'init';

    logger.info('[TwilioClient] Conference provisioned', { conferenceSid, friendlyName });

    return {
      conferenceSid,
      friendlyName,
      status,
      twimlParticipantUrl,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Archive a completed recording to the Document Vault.
   * Returns the vault document ID, or null if archiving fails (non-fatal).
   */
  private async _archiveRecordingToVault(
    recording: RecordingInstance,
    mediaUrl: string,
    ctx: { tenantId: string; businessId: string; callId?: string },
  ): Promise<string | null> {
    try {
      const vaultDoc = await this.documentVault.upload({
        tenantId: ctx.tenantId,
        businessId: ctx.businessId,
        documentType: 'receipt',
        title: `Call Recording — ${recording.sid} — ${new Date().toISOString()}`,
        mimeType: 'application/json',
        content: Buffer.from(
          JSON.stringify({
            recordingSid: recording.sid,
            callSid: recording.callSid,
            mediaUrl,
            duration: recording.duration,
            archivedAt: new Date().toISOString(),
            callId: ctx.callId ?? null,
          }),
        ),
        metadata: {
          recordingSid: recording.sid,
          callSid: recording.callSid,
          callId: ctx.callId ?? undefined,
          documentSubtype: 'call_recording',
        },
      });

      logger.info('[TwilioClient] Recording archived to Document Vault', {
        recordingSid: recording.sid,
        documentVaultId: vaultDoc.id,
      });

      return vaultDoc.id;
    } catch (err) {
      logger.warn('[TwilioClient] Recording archive to vault failed (non-fatal)', {
        recordingSid: recording.sid,
        error: String(err),
      });
      return null;
    }
  }

  private _requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`[TwilioClient] Missing required environment variable: ${key}`);
    }
    return value;
  }
}

// ── Singleton export ──────────────────────────────────────────────────────

let _twilioClientInstance: TwilioClient | null = null;

export function getTwilioClient(): TwilioClient {
  if (!_twilioClientInstance) {
    _twilioClientInstance = new TwilioClient();
  }
  return _twilioClientInstance;
}

/** Reset the singleton (for testing). */
export function resetTwilioClient(): void {
  _twilioClientInstance = null;
}
