// ============================================================
// CapitalForge — Twilio Webhook Handlers
//
// Processes Twilio status callbacks and recording/transcription
// webhooks. All handlers are framework-agnostic — they accept
// a plain payload object and return a result; Express/Fastify
// route handlers in the API layer call these functions.
//
// Webhooks handled:
//   handleCallStatus      — call.{initiated|ringing|answered|completed|failed}
//   handleRecordingAvailable — recording-available callback, auto-files to vault
//   handleTranscriptionAvailable — transcription-available callback, caches in DB
//
// Event bus integration:
//   All lifecycle events (call.completed, recording.available,
//   transcription.available) are published to the event bus so
//   downstream consumers (compliance, CRM, audit) can react.
//
// Signature validation:
//   validateTwilioSignature() MUST be called in the HTTP route
//   handler BEFORE delegating to these functions. See the
//   validateTwilioSignature helper exported below.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _twilioLib = require('twilio') as {
  validateRequest: (authToken: string, sig: string, url: string, params: Record<string, string>) => boolean;
};

type TwilioValidateRequestFn = (authToken: string, sig: string, url: string, params: Record<string, string>) => boolean;

let _validateRequestFn: TwilioValidateRequestFn = (...args) => _twilioLib.validateRequest(...args);

/** Override the validateRequest implementation — test-only. */
export function _setValidateRequest(fn: TwilioValidateRequestFn): void {
  _validateRequestFn = fn;
}
/** Reset to the real Twilio validateRequest — test-only. */
export function _resetValidateRequest(): void {
  _validateRequestFn = (...args) => _twilioLib.validateRequest(...args);
}
import { PrismaClient } from '@prisma/client';
import { eventBus } from '../../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import { DocumentVaultService } from '../../services/document-vault.service.js';
import logger from '../../config/logger.js';

// ── Types ──────────────────────────────────────────────────────────────────

/** Twilio call status callback payload (POST body). */
export interface TwilioCallStatusPayload {
  CallSid: string;
  CallStatus: string;
  Direction?: string;
  Duration?: string;
  From?: string;
  To?: string;
  Timestamp?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

/** Twilio recording status callback payload. */
export interface TwilioRecordingPayload {
  CallSid: string;
  RecordingSid: string;
  RecordingUrl: string;
  RecordingStatus: string;
  RecordingDuration?: string;
  RecordingChannels?: string;
  RecordingSource?: string;
  AccountSid?: string;
}

/** Twilio transcription callback payload. */
export interface TwilioTranscriptionPayload {
  CallSid: string;
  TranscriptionSid: string;
  TranscriptionText: string;
  TranscriptionStatus: string;
  RecordingSid?: string;
  TranscriptionUrl?: string;
  AccountSid?: string;
}

export interface WebhookResult {
  processed: boolean;
  eventType: string;
  callSid: string;
  details: Record<string, unknown>;
}

// ── Signature Validation ──────────────────────────────────────────────────

/**
 * Validate that a webhook request genuinely originates from Twilio.
 *
 * Must be called in the HTTP route layer before processing any webhook.
 * Throws an error if validation fails — treat that as a 403 response.
 *
 * @param authToken   TWILIO_AUTH_TOKEN env var value
 * @param signature   X-Twilio-Signature header value
 * @param url         Full URL of the webhook endpoint (must match exactly)
 * @param params      POST body params as key-value record
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  return _validateRequestFn(authToken, signature, url, params);
}

// ── Webhook Handler ───────────────────────────────────────────────────────

export class TwilioWebhookHandler {
  private readonly prisma: PrismaClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any; // forward-declared models (voiceCall) not yet in Prisma schema
  private readonly documentVault: DocumentVaultService;

  constructor(prisma?: PrismaClient, documentVault?: DocumentVaultService) {
    this.prisma = prisma ?? new PrismaClient();
    this.db = this.prisma;
    this.documentVault = documentVault ?? new DocumentVaultService(this.prisma);
  }

  // ── Call Status Callback ─────────────────────────────────────────────────

  /**
   * Handle call status callbacks from Twilio.
   *
   * Updates the VoiceCall record in the database and publishes the
   * appropriate event to the event bus.
   *
   * Handles: queued, ringing, in-progress, completed, failed, busy, no-answer
   */
  async handleCallStatus(payload: TwilioCallStatusPayload): Promise<WebhookResult> {
    const log = logger.child({ callSid: payload.CallSid, callStatus: payload.CallStatus });
    log.info('[TwilioWebhook] Call status callback received');

    // Look up the internal call record by Twilio SID
    const callRecord = await this.db.voiceCall.findFirst({
      where: { twilioCallSid: payload.CallSid },
    });

    if (!callRecord) {
      log.warn('[TwilioWebhook] No VoiceCall found for Twilio SID', {
        twilioCallSid: payload.CallSid,
      });
      return {
        processed: false,
        eventType: 'call.status.unknown',
        callSid: payload.CallSid,
        details: { reason: 'no_matching_call_record' },
      };
    }

    const now = new Date();
    const isTerminal = ['completed', 'failed', 'busy', 'no-answer'].includes(payload.CallStatus);

    // Build DB update
    const updateData: Record<string, unknown> = {
      status: payload.CallStatus,
    };

    if (isTerminal) {
      updateData['endedAt'] = now;
      if (payload.Duration) {
        updateData['durationSeconds'] = parseInt(payload.Duration, 10);
      } else if (callRecord.startedAt) {
        updateData['durationSeconds'] = Math.round(
          (now.getTime() - callRecord.startedAt.getTime()) / 1000,
        );
      }
    }

    await this.db.voiceCall.update({
      where: { id: callRecord.id },
      data: updateData,
    });

    // Publish event — completed calls get the persistent EVENT_TYPES.CALL_COMPLETED
    if (payload.CallStatus === 'completed') {
      await eventBus.publishAndPersist(callRecord.tenantId, {
        eventType: EVENT_TYPES.CALL_COMPLETED,
        aggregateType: AGGREGATE_TYPES.BUSINESS,
        aggregateId: callRecord.businessId,
        payload: {
          callId: callRecord.id,
          twilioCallSid: payload.CallSid,
          durationSeconds: updateData['durationSeconds'] ?? null,
          endedAt: now.toISOString(),
          direction: callRecord.direction,
          campaignType: callRecord.campaignType,
        },
      });
    } else {
      await eventBus.publish(callRecord.tenantId, {
        eventType: `call.${payload.CallStatus}`,
        aggregateType: AGGREGATE_TYPES.BUSINESS,
        aggregateId: callRecord.businessId,
        payload: {
          callId: callRecord.id,
          twilioCallSid: payload.CallSid,
          status: payload.CallStatus,
          direction: callRecord.direction,
        },
      });
    }

    log.info('[TwilioWebhook] Call status processed', {
      callId: callRecord.id,
      status: payload.CallStatus,
      isTerminal,
    });

    return {
      processed: true,
      eventType: `call.${payload.CallStatus}`,
      callSid: payload.CallSid,
      details: {
        callId: callRecord.id,
        status: payload.CallStatus,
        durationSeconds: updateData['durationSeconds'] ?? null,
      },
    };
  }

  // ── Recording Available Callback ─────────────────────────────────────────

  /**
   * Handle recording-available callbacks from Twilio.
   *
   * Persists the recording URL on the VoiceCall record, archives the
   * recording metadata to the Document Vault, and publishes a
   * recording.available event to the event bus.
   */
  async handleRecordingAvailable(payload: TwilioRecordingPayload): Promise<WebhookResult> {
    const log = logger.child({
      callSid: payload.CallSid,
      recordingSid: payload.RecordingSid,
    });
    log.info('[TwilioWebhook] Recording available callback received');

    const callRecord = await this.db.voiceCall.findFirst({
      where: { twilioCallSid: payload.CallSid },
    });

    if (!callRecord) {
      log.warn('[TwilioWebhook] No VoiceCall found for recording callback', {
        twilioCallSid: payload.CallSid,
      });
      return {
        processed: false,
        eventType: 'recording.available',
        callSid: payload.CallSid,
        details: { reason: 'no_matching_call_record' },
      };
    }

    // Persist recording details on call record
    await this.db.voiceCall.update({
      where: { id: callRecord.id },
      data: {
        recordingSid: payload.RecordingSid,
        recordingUrl: payload.RecordingUrl,
        durationSeconds: payload.RecordingDuration
          ? parseInt(payload.RecordingDuration, 10)
          : callRecord.durationSeconds,
      },
    });

    // Auto-archive to Document Vault
    let documentVaultId: string | null = null;
    try {
      const vaultDoc = await this.documentVault.upload({
        tenantId: callRecord.tenantId,
        businessId: callRecord.businessId,
        documentType: 'receipt',
        title: `Call Recording — ${payload.RecordingSid} — ${new Date().toISOString()}`,
        mimeType: 'application/json',
        content: Buffer.from(
          JSON.stringify({
            recordingSid: payload.RecordingSid,
            callSid: payload.CallSid,
            callId: callRecord.id,
            recordingUrl: payload.RecordingUrl,
            duration: payload.RecordingDuration ?? null,
            archivedAt: new Date().toISOString(),
          }),
        ),
        metadata: {
          recordingSid: payload.RecordingSid,
          callSid: payload.CallSid,
          callId: callRecord.id,
          documentSubtype: 'call_recording',
        },
      });

      documentVaultId = vaultDoc.id;

      // Update call record with vault reference
      await this.db.voiceCall.update({
        where: { id: callRecord.id },
        data: { documentVaultId },
      });

      log.info('[TwilioWebhook] Recording archived to Document Vault', {
        documentVaultId,
      });
    } catch (vaultErr) {
      log.warn('[TwilioWebhook] Recording vault archive failed (non-fatal)', {
        error: String(vaultErr),
      });
    }

    // Publish recording.available event
    await eventBus.publish(callRecord.tenantId, {
      eventType: 'recording.available',
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId: callRecord.businessId,
      payload: {
        callId: callRecord.id,
        twilioCallSid: payload.CallSid,
        recordingSid: payload.RecordingSid,
        recordingUrl: payload.RecordingUrl,
        duration: payload.RecordingDuration ?? null,
        documentVaultId,
      },
    });

    log.info('[TwilioWebhook] Recording available processed', {
      callId: callRecord.id,
      recordingSid: payload.RecordingSid,
      documentVaultId,
    });

    return {
      processed: true,
      eventType: 'recording.available',
      callSid: payload.CallSid,
      details: {
        callId: callRecord.id,
        recordingSid: payload.RecordingSid,
        documentVaultId,
      },
    };
  }

  // ── Transcription Available Callback ─────────────────────────────────────

  /**
   * Handle transcription-available callbacks from Twilio.
   *
   * Caches the transcript text on the VoiceCall record and publishes
   * a transcription.available event to the event bus.
   */
  async handleTranscriptionAvailable(
    payload: TwilioTranscriptionPayload,
  ): Promise<WebhookResult> {
    const log = logger.child({
      callSid: payload.CallSid,
      transcriptionSid: payload.TranscriptionSid,
    });
    log.info('[TwilioWebhook] Transcription available callback received');

    const callRecord = await this.db.voiceCall.findFirst({
      where: { twilioCallSid: payload.CallSid },
    });

    if (!callRecord) {
      log.warn('[TwilioWebhook] No VoiceCall found for transcription callback', {
        twilioCallSid: payload.CallSid,
      });
      return {
        processed: false,
        eventType: 'transcription.available',
        callSid: payload.CallSid,
        details: { reason: 'no_matching_call_record' },
      };
    }

    const transcriptText =
      payload.TranscriptionStatus === 'completed' ? payload.TranscriptionText : null;

    if (transcriptText) {
      await this.db.voiceCall.update({
        where: { id: callRecord.id },
        data: { transcriptText },
      });
    }

    // Publish transcription.available event
    await eventBus.publish(callRecord.tenantId, {
      eventType: 'transcription.available',
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId: callRecord.businessId,
      payload: {
        callId: callRecord.id,
        twilioCallSid: payload.CallSid,
        transcriptionSid: payload.TranscriptionSid,
        transcriptionStatus: payload.TranscriptionStatus,
        hasText: !!transcriptText,
      },
    });

    log.info('[TwilioWebhook] Transcription processed', {
      callId: callRecord.id,
      transcriptionStatus: payload.TranscriptionStatus,
      hasText: !!transcriptText,
    });

    return {
      processed: true,
      eventType: 'transcription.available',
      callSid: payload.CallSid,
      details: {
        callId: callRecord.id,
        transcriptionSid: payload.TranscriptionSid,
        transcriptionStatus: payload.TranscriptionStatus,
        textCached: !!transcriptText,
      },
    };
  }
}

// ── Singleton export ──────────────────────────────────────────────────────

export const twilioWebhookHandler = new TwilioWebhookHandler();
