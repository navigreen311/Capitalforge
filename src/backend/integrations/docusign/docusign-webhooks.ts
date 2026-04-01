// ============================================================
// CapitalForge — DocuSign Connect Webhook Handler
//
// Handles inbound DocuSign Connect notifications:
//   - envelope-completed  → auto-file signed doc to Document Vault
//   - envelope-declined   → update local record, emit event
//   - envelope-voided     → update local record, emit event
//
// Security:
//   - Validates HMAC-SHA256 signature from X-DocuSign-Signature-1 header
//   - Rejects malformed or unsigned payloads in production
//   - Idempotent: duplicate delivery of the same envelopeId + event is a no-op
//
// STUB NOTE: Signature verification logic is included but uses a
// constant-time comparison against a shared HMAC secret. In production
// set DOCUSIGN_WEBHOOK_HMAC_SECRET in the environment.
// ============================================================

import crypto from 'crypto';
import type { Request, Response } from 'express';
import logger from '../../config/logger.js';
import { EventBus } from '../../events/event-bus.js';
import { DocumentVaultService } from '../../services/document-vault.service.js';
import {
  DocuSignClient,
  DocuSignEnvelopeNotFoundError,
  type EnvelopeStatus,
  type EnvelopeRecord,
} from './docusign-client.js';

// ── Environment ───────────────────────────────────────────────

const WEBHOOK_HMAC_SECRET = process.env['DOCUSIGN_WEBHOOK_HMAC_SECRET'] ?? '';
const SKIP_SIG_VERIFICATION = process.env['NODE_ENV'] === 'test'; // relax in unit tests

// ── Types ─────────────────────────────────────────────────────

/** Normalised event object extracted from a DocuSign Connect payload */
export interface DocuSignWebhookEvent {
  event:      DocuSignConnectEventType;
  envelopeId: string;
  status:     EnvelopeStatus;
  /** ISO timestamp from DocuSign */
  timestamp:  string;
  /** Raw Connect payload body — not persisted by default (may contain PII) */
  rawPayload: Record<string, unknown>;
}

/** DocuSign Connect event types handled by this webhook */
export type DocuSignConnectEventType =
  | 'envelope-completed'
  | 'envelope-declined'
  | 'envelope-voided'
  | 'envelope-sent'
  | 'envelope-delivered';

/** Result returned by processWebhook() to the route handler */
export interface WebhookProcessResult {
  received:   true;
  envelopeId: string;
  event:      DocuSignConnectEventType;
  /** true if the event was a duplicate and skipped */
  duplicate:  boolean;
}

// ── Idempotency store (replace with Redis / DB in production) ──

const _processedEvents = new Set<string>(); // `${envelopeId}:${event}`

function idempotencyKey(envelopeId: string, event: DocuSignConnectEventType): string {
  return `${envelopeId}:${event}`;
}

// ── Event constants ────────────────────────────────────────────

const DOCUSIGN_WEBHOOK_EVENTS = {
  ENVELOPE_COMPLETED: 'docusign.webhook.envelope.completed',
  ENVELOPE_DECLINED:  'docusign.webhook.envelope.declined',
  ENVELOPE_VOIDED:    'docusign.webhook.envelope.voided',
  ENVELOPE_SENT:      'docusign.webhook.envelope.sent',
  ENVELOPE_DELIVERED: 'docusign.webhook.envelope.delivered',
  SIGNATURE_INVALID:  'docusign.webhook.signature.invalid',
} as const;

// ── Signature Verification ─────────────────────────────────────

/**
 * Verify the HMAC-SHA256 signature from DocuSign Connect.
 *
 * DocuSign sends the HMAC in the X-DocuSign-Signature-1 header as
 * a Base64-encoded SHA256 HMAC of the raw request body.
 *
 * Production replacement: same logic but WEBHOOK_HMAC_SECRET must be
 * configured in DocuSign Admin → Connect → HMAC Key.
 */
function verifyDocuSignSignature(
  rawBody:   string,
  signature: string | undefined,
): boolean {
  if (SKIP_SIG_VERIFICATION) return true;
  if (!signature)             return false;
  if (!WEBHOOK_HMAC_SECRET)   {
    logger.warn('[DocuSignWebhook] DOCUSIGN_WEBHOOK_HMAC_SECRET not set — rejecting all webhooks');
    return false;
  }

  const expected = crypto
    .createHmac('sha256', WEBHOOK_HMAC_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');

  // constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

// ── Payload Normalisation ──────────────────────────────────────

/**
 * Normalise a DocuSign Connect XML or JSON payload into an
 * internal DocuSignWebhookEvent shape.
 *
 * DocuSign Connect can send XML (legacy) or JSON (v2+).
 * This stub expects the modern JSON format.
 *
 * JSON body shape (simplified):
 *   {
 *     "event": "envelope-completed",
 *     "apiVersion": "v2.1",
 *     "uri": "/restapi/v2.1/accounts/.../envelopes/...",
 *     "retryCount": 0,
 *     "configurationId": "...",
 *     "generatedDateTime": "2026-01-15T10:00:00.000Z",
 *     "data": {
 *       "accountId": "...",
 *       "envelopeId": "...",
 *       "envelopeSummary": { "status": "completed", ... }
 *     }
 *   }
 */
function normalisePayload(body: Record<string, unknown>): DocuSignWebhookEvent {
  const event      = (body['event'] as string ?? '').toLowerCase() as DocuSignConnectEventType;
  const data       = (body['data'] as Record<string, unknown>) ?? {};
  const summary    = (data['envelopeSummary'] as Record<string, unknown>) ?? {};
  const envelopeId = (data['envelopeId'] as string)
    ?? (summary['envelopeId'] as string)
    ?? (body['envelopeId'] as string)
    ?? '';

  const statusMap: Record<string, EnvelopeStatus> = {
    'envelope-completed': 'completed',
    'envelope-declined':  'declined',
    'envelope-voided':    'voided',
    'envelope-sent':      'sent',
    'envelope-delivered': 'delivered',
  };

  const status    = statusMap[event] ?? ((summary['status'] as EnvelopeStatus) ?? 'sent');
  const timestamp = (body['generatedDateTime'] as string)
    ?? (summary['completedDateTime'] as string)
    ?? new Date().toISOString();

  return { event, envelopeId, status, timestamp, rawPayload: body };
}

// ── DocuSignWebhookHandler ─────────────────────────────────────

export class DocuSignWebhookHandler {
  private readonly client:   DocuSignClient;
  private readonly vault:    DocumentVaultService;
  private readonly eventBus: EventBus;

  constructor(
    client?:   DocuSignClient,
    vault?:    DocumentVaultService,
    eventBus?: EventBus,
  ) {
    this.client   = client   ?? new DocuSignClient();
    this.vault    = vault    ?? new DocumentVaultService();
    this.eventBus = eventBus ?? EventBus.getInstance();
  }

  // ── Express Route Handler ──────────────────────────────────

  /**
   * Express middleware handler.
   * Mount at: POST /api/webhooks/docusign
   *
   * Requires raw body access — ensure express.json() uses `verify` option
   * or use express.raw() + Buffer on this route so the raw bytes are
   * available for HMAC verification.
   */
  async handle(req: Request, res: Response): Promise<void> {
    const signature = req.headers['x-docusign-signature-1'] as string | undefined;
    const rawBody   = JSON.stringify(req.body); // raw body stub — replace with req.rawBody in prod

    if (!verifyDocuSignSignature(rawBody, signature)) {
      logger.warn('[DocuSignWebhook] Signature verification failed', {
        hasSignature: Boolean(signature),
      });
      res.status(401).json({ success: false, error: 'INVALID_SIGNATURE' });
      return;
    }

    try {
      const result = await this.processWebhook(req.body, 'unknown-tenant');
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      logger.error('[DocuSignWebhook] Processing error', { err });
      // Always return 200 to DocuSign to prevent infinite retries
      // Log and alert internally instead
      res.status(200).json({ success: true, data: { received: true, error: (err as Error).message } });
    }
  }

  // ── Core Processing ────────────────────────────────────────

  /**
   * Parse, validate, and route a raw DocuSign Connect payload.
   *
   * @param body      Parsed JSON body from DocuSign
   * @param tenantId  Resolved from the webhook subscription or JWT context
   */
  async processWebhook(
    body:     Record<string, unknown>,
    tenantId: string,
  ): Promise<WebhookProcessResult> {
    const evt = normalisePayload(body);

    if (!evt.envelopeId) {
      throw new Error('DocuSign webhook payload missing envelopeId');
    }

    const iKey = idempotencyKey(evt.envelopeId, evt.event);
    if (_processedEvents.has(iKey)) {
      logger.debug('[DocuSignWebhook] Duplicate event — skipping', { envelopeId: evt.envelopeId, event: evt.event });
      return { received: true, envelopeId: evt.envelopeId, event: evt.event, duplicate: true };
    }

    switch (evt.event) {
      case 'envelope-completed':
        await this._handleCompleted(evt, tenantId);
        break;
      case 'envelope-declined':
        await this._handleDeclined(evt, tenantId);
        break;
      case 'envelope-voided':
        await this._handleVoided(evt, tenantId);
        break;
      case 'envelope-sent':
      case 'envelope-delivered':
        await this._handleStatusUpdate(evt, tenantId);
        break;
      default:
        logger.debug('[DocuSignWebhook] Unhandled event type', { event: evt.event });
    }

    _processedEvents.add(iKey);

    return { received: true, envelopeId: evt.envelopeId, event: evt.event, duplicate: false };
  }

  // ── Event Handlers ─────────────────────────────────────────

  private async _handleCompleted(
    evt:      DocuSignWebhookEvent,
    tenantId: string,
  ): Promise<void> {
    logger.info('[DocuSignWebhook] envelope-completed', { envelopeId: evt.envelopeId });

    // Update local envelope record
    let record: EnvelopeRecord | null = null;
    try {
      record = this.client._findEnvelope(evt.envelopeId, tenantId);
      record.status      = 'completed';
      record.completedAt = evt.timestamp;
    } catch (e) {
      if (!(e instanceof DocuSignEnvelopeNotFoundError)) throw e;
      logger.warn('[DocuSignWebhook] Envelope not found locally — continuing with vault filing', {
        envelopeId: evt.envelopeId,
      });
    }

    // Auto-file signed document to vault
    // In production, download the actual document via downloadSignedDocument()
    // Here we stub the content for the vault filing
    const stubContent = Buffer.from(
      `%PDF-1.4 completed-envelope ${evt.envelopeId} at ${evt.timestamp}`,
    );

    const emailSubject = record?.emailSubject ?? `Signed Document ${evt.envelopeId}`;

    await this.vault.autoFile({
      tenantId,
      businessId:   record?.businessId ?? undefined,
      documentType: 'contract',
      title:        `Signed: ${emailSubject}`,
      mimeType:     'application/pdf',
      content:      stubContent,
      sourceModule: 'docusign',
      sourceId:     evt.envelopeId,
      metadata: {
        envelopeId:  evt.envelopeId,
        completedAt: evt.timestamp,
        event:       'envelope-completed',
      },
    });

    await this.eventBus.publish(tenantId, {
      eventType:     DOCUSIGN_WEBHOOK_EVENTS.ENVELOPE_COMPLETED,
      aggregateType: 'envelope',
      aggregateId:   evt.envelopeId,
      payload: {
        envelopeId:  evt.envelopeId,
        completedAt: evt.timestamp,
        filedToVault: true,
      },
    });
  }

  private async _handleDeclined(
    evt:      DocuSignWebhookEvent,
    tenantId: string,
  ): Promise<void> {
    logger.info('[DocuSignWebhook] envelope-declined', { envelopeId: evt.envelopeId });

    try {
      const record = this.client._findEnvelope(evt.envelopeId, tenantId);
      record.status = 'declined';
    } catch (e) {
      if (!(e instanceof DocuSignEnvelopeNotFoundError)) throw e;
    }

    await this.eventBus.publish(tenantId, {
      eventType:     DOCUSIGN_WEBHOOK_EVENTS.ENVELOPE_DECLINED,
      aggregateType: 'envelope',
      aggregateId:   evt.envelopeId,
      payload:       { envelopeId: evt.envelopeId, declinedAt: evt.timestamp },
    });
  }

  private async _handleVoided(
    evt:      DocuSignWebhookEvent,
    tenantId: string,
  ): Promise<void> {
    logger.info('[DocuSignWebhook] envelope-voided', { envelopeId: evt.envelopeId });

    try {
      const record     = this.client._findEnvelope(evt.envelopeId, tenantId);
      record.status    = 'voided';
      record.voidedAt  = evt.timestamp;
      const summary    = (evt.rawPayload['data'] as Record<string, unknown>)?.['envelopeSummary'] as Record<string, unknown>;
      record.voidedReason = (summary?.['voidedReason'] as string) ?? 'Voided via webhook';
    } catch (e) {
      if (!(e instanceof DocuSignEnvelopeNotFoundError)) throw e;
    }

    await this.eventBus.publish(tenantId, {
      eventType:     DOCUSIGN_WEBHOOK_EVENTS.ENVELOPE_VOIDED,
      aggregateType: 'envelope',
      aggregateId:   evt.envelopeId,
      payload:       { envelopeId: evt.envelopeId, voidedAt: evt.timestamp },
    });
  }

  private async _handleStatusUpdate(
    evt:      DocuSignWebhookEvent,
    tenantId: string,
  ): Promise<void> {
    logger.debug('[DocuSignWebhook] Status update', { envelopeId: evt.envelopeId, status: evt.status });

    try {
      const record   = this.client._findEnvelope(evt.envelopeId, tenantId);
      record.status  = evt.status;
      if (evt.status === 'sent') record.sentAt = evt.timestamp;
    } catch (e) {
      if (!(e instanceof DocuSignEnvelopeNotFoundError)) throw e;
    }

    const eventType = evt.event === 'envelope-sent'
      ? DOCUSIGN_WEBHOOK_EVENTS.ENVELOPE_SENT
      : DOCUSIGN_WEBHOOK_EVENTS.ENVELOPE_DELIVERED;

    await this.eventBus.publish(tenantId, {
      eventType,
      aggregateType: 'envelope',
      aggregateId:   evt.envelopeId,
      payload:       { envelopeId: evt.envelopeId, status: evt.status, timestamp: evt.timestamp },
    });
  }

  // ── Test Helpers ───────────────────────────────────────────

  /** Reset idempotency store between tests. @internal */
  _clearProcessedEvents(): void {
    _processedEvents.clear();
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const docuSignWebhookHandler = new DocuSignWebhookHandler();
