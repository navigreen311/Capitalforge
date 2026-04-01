// ============================================================
// CapitalForge — Credit Bureau Alert Webhook Handler
//
// Handles inbound bureau alert notifications:
//   - credit_score_change   — score moved by ± threshold
//   - new_inquiry           — hard inquiry recorded
//   - derogatory_mark       — new derogatory tradeline or public record
//   - account_opened        — new account tradeline
//   - account_closed        — tradeline closure
//
// Bureau alert products:
//   Experian:   CreditLock/CreditAlert webhook API
//   TransUnion: TrueCredit Alert API
//   Equifax:    InterConnect Monitoring (SOAP/REST)
//   D&B:        Monitoring Alert API (Direct+ subscription)
//
// Security:
//   - Validates per-bureau HMAC or API-key-based signature headers
//   - Idempotent: duplicate alert delivery is a no-op
//   - All PII-bearing fields in raw payloads are never logged
// ============================================================

import crypto from 'crypto';
import type { Request, Response } from 'express';
import logger from '../../config/logger.js';
import { EventBus } from '../../events/event-bus.js';
import type { Bureau } from '../../../shared/types/index.js';

// ── Environment ───────────────────────────────────────────────

const BUREAU_WEBHOOK_SECRETS: Record<Bureau, string> = {
  experian:   process.env['EXPERIAN_WEBHOOK_SECRET']   ?? '',
  transunion: process.env['TRANSUNION_WEBHOOK_SECRET'] ?? '',
  equifax:    process.env['EQUIFAX_WEBHOOK_SECRET']    ?? '',
  dnb:        process.env['DNB_WEBHOOK_SECRET']        ?? '',
};

const SKIP_SIG_VERIFICATION = process.env['NODE_ENV'] === 'test';

// Score change threshold to emit an alert event (points)
const SCORE_CHANGE_THRESHOLD = parseInt(process.env['CREDIT_ALERT_SCORE_THRESHOLD'] ?? '20', 10);

// ── Types ─────────────────────────────────────────────────────

export type BureauAlertType =
  | 'credit_score_change'
  | 'new_inquiry'
  | 'derogatory_mark'
  | 'account_opened'
  | 'account_closed';

export interface BureauAlertPayload {
  alertType:    BureauAlertType;
  bureau:       Bureau;
  /** Opaque subject reference — NOT raw SSN/EIN */
  subjectRef:   string;
  timestamp:    string;
  /** Bureau-specific alert data, normalised */
  data:         BureauAlertData;
  /** Raw bureau alert body — stored for audit, not logged */
  rawPayload:   Record<string, unknown>;
}

export interface BureauAlertData {
  // Score change
  previousScore?: number;
  currentScore?:  number;
  scoreDelta?:    number;
  scoreType?:     string;
  // Inquiry
  inquiryCreditor?:  string;
  inquiryDate?:      string;
  inquiryType?:      'hard' | 'soft';
  // Derogatory
  derogatoryType?:   string; // 'collection', 'charge_off', 'judgment', 'bankruptcy'
  derogatoryAmount?: number;
  creditor?:         string;
  // Account
  accountType?:      string;
  creditLimit?:      number;
}

export interface AlertProcessResult {
  received:   true;
  bureau:     Bureau;
  alertType:  BureauAlertType;
  subjectRef: string;
  duplicate:  boolean;
  /** Whether the alert crossed a significance threshold */
  significant: boolean;
}

// ── Event constants ────────────────────────────────────────────

const BUREAU_ALERT_EVENTS = {
  SCORE_CHANGE:      'bureau.alert.score_change',
  SCORE_CHANGE_SIGNIFICANT: 'bureau.alert.score_change.significant',
  NEW_INQUIRY:       'bureau.alert.new_inquiry',
  DEROGATORY_MARK:   'bureau.alert.derogatory_mark',
  ACCOUNT_OPENED:    'bureau.alert.account_opened',
  ACCOUNT_CLOSED:    'bureau.alert.account_closed',
} as const;

// ── Idempotency ────────────────────────────────────────────────

const _processedAlerts = new Set<string>();

function alertIdempotencyKey(
  bureau:    Bureau,
  alertType: BureauAlertType,
  subjectRef: string,
  timestamp: string,
): string {
  return `${bureau}:${alertType}:${subjectRef}:${timestamp}`;
}

// ── Signature Verification ────────────────────────────────────

/**
 * Verify bureau webhook HMAC signature.
 *
 * Each bureau uses slightly different headers:
 *   Experian:   X-Experian-Signature (HMAC-SHA256, hex)
 *   TransUnion: X-TU-Signature       (HMAC-SHA256, base64)
 *   Equifax:    X-EFX-Signature      (HMAC-SHA256, base64)
 *   D&B:        X-DNB-Signature      (HMAC-SHA256, base64)
 */
function verifyBureauSignature(
  bureau:    Bureau,
  rawBody:   string,
  signature: string | undefined,
): boolean {
  if (SKIP_SIG_VERIFICATION) return true;
  if (!signature)             return false;

  const secret = BUREAU_WEBHOOK_SECRETS[bureau];
  if (!secret) {
    logger.warn('[BureauWebhook] Webhook secret not configured', { bureau });
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret).update(rawBody, 'utf8');

  // Experian uses hex; others use base64
  const expected = bureau === 'experian' ? hmac.digest('hex') : hmac.digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Buffers of different length — timingSafeEqual throws
    return false;
  }
}

// ── Payload Normalisation ──────────────────────────────────────

/**
 * Normalise a bureau-specific alert payload into BureauAlertPayload.
 *
 * Each bureau has a different JSON shape. The normalisation
 * maps common fields into a unified shape. PII fields (SSN, full name)
 * are stripped; only opaque subjectRef is carried.
 *
 * Example Experian shape:
 *   { alertType: 'SCORE_CHANGE', subjectReference: '...', scoreChange: { prev: 720, curr: 700 }, ... }
 *
 * Example D&B shape:
 *   { alertCategory: 'DEROGATORY', entityDuns: '...', event: { type: 'COLLECTION', amount: 5000 }, ... }
 */
function normaliseBureauPayload(
  bureau:  Bureau,
  body:    Record<string, unknown>,
): BureauAlertPayload {
  // Common fields — each bureau may use different key names
  const alertTypeRaw = (
    (body['alertType'] as string)
    ?? (body['alertCategory'] as string)
    ?? (body['type'] as string)
    ?? ''
  ).toLowerCase();

  const alertType = mapAlertType(alertTypeRaw);

  const subjectRef = (
    (body['subjectReference'] as string)
    ?? (body['subjectRef'] as string)
    ?? (body['entityDuns'] as string)
    ?? (body['entityRef'] as string)
    ?? 'unknown'
  );

  const timestamp = (
    (body['timestamp'] as string)
    ?? (body['generatedAt'] as string)
    ?? (body['eventDate'] as string)
    ?? new Date().toISOString()
  );

  const data = extractAlertData(body, alertType);

  return { alertType, bureau, subjectRef, timestamp, data, rawPayload: body };
}

function mapAlertType(raw: string): BureauAlertType {
  if (raw.includes('score'))      return 'credit_score_change';
  if (raw.includes('inquiry'))    return 'new_inquiry';
  if (raw.includes('derogatory') || raw.includes('collection') || raw.includes('judgment')) {
    return 'derogatory_mark';
  }
  if (raw.includes('open'))       return 'account_opened';
  if (raw.includes('close') || raw.includes('closed')) return 'account_closed';
  return 'credit_score_change'; // safe fallback
}

function extractAlertData(
  body:      Record<string, unknown>,
  alertType: BureauAlertType,
): BureauAlertData {
  const data: BureauAlertData = {};

  // Score change
  const scoreChange = body['scoreChange'] as Record<string, unknown> | undefined;
  if (scoreChange || alertType === 'credit_score_change') {
    data.previousScore = Number(scoreChange?.['previous'] ?? body['previousScore'] ?? 0) || undefined;
    data.currentScore  = Number(scoreChange?.['current']  ?? body['currentScore']  ?? 0) || undefined;
    data.scoreDelta    = data.currentScore !== undefined && data.previousScore !== undefined
      ? data.currentScore - data.previousScore
      : undefined;
    data.scoreType = (scoreChange?.['type'] as string) ?? (body['scoreType'] as string) ?? 'fico';
  }

  // Inquiry
  if (alertType === 'new_inquiry') {
    data.inquiryCreditor = (body['creditor'] as string) ?? (body['inquiryCreditor'] as string);
    data.inquiryDate     = (body['inquiryDate'] as string) ?? new Date().toISOString();
    data.inquiryType     = ((body['inquiryType'] as string) ?? 'hard') as 'hard' | 'soft';
  }

  // Derogatory
  if (alertType === 'derogatory_mark') {
    const event = body['event'] as Record<string, unknown> | undefined;
    data.derogatoryType   = (event?.['type'] as string) ?? (body['derogatoryType'] as string);
    data.derogatoryAmount = Number(event?.['amount'] ?? body['amount'] ?? 0) || undefined;
    data.creditor         = (body['creditor'] as string);
  }

  // Account
  if (alertType === 'account_opened' || alertType === 'account_closed') {
    data.accountType  = (body['accountType'] as string);
    data.creditLimit  = Number(body['creditLimit'] ?? 0) || undefined;
    data.creditor     = (body['creditor'] as string);
  }

  return data;
}

// ── BureauWebhookHandler ──────────────────────────────────────

export class BureauWebhookHandler {
  private readonly eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus ?? EventBus.getInstance();
  }

  // ── Express Route Handlers ─────────────────────────────────

  /**
   * Generic Express handler — resolves bureau from :bureau route param.
   * Mount at: POST /api/webhooks/bureau/:bureau
   */
  async handle(req: Request, res: Response): Promise<void> {
    const bureau = req.params['bureau'] as Bureau;
    const validBureaus: Bureau[] = ['experian', 'transunion', 'equifax', 'dnb'];

    if (!validBureaus.includes(bureau)) {
      res.status(400).json({ success: false, error: `Unknown bureau: ${bureau}` });
      return;
    }

    const rawBody  = JSON.stringify(req.body);
    const sigHeader: Record<Bureau, string> = {
      experian:   'x-experian-signature',
      transunion: 'x-tu-signature',
      equifax:    'x-efx-signature',
      dnb:        'x-dnb-signature',
    };
    const signature = req.headers[sigHeader[bureau]] as string | undefined;

    if (!verifyBureauSignature(bureau, rawBody, signature)) {
      logger.warn('[BureauWebhook] Signature verification failed', { bureau });
      res.status(401).json({ success: false, error: 'INVALID_SIGNATURE' });
      return;
    }

    // Resolve tenantId from the alert payload or webhook subscription metadata
    // In production: look up tenantId by bureau subscription ID
    const tenantId = (req.body as Record<string, unknown>)['tenantId'] as string
      ?? (req as unknown as Record<string, unknown>)['tenantId'] as string
      ?? 'unknown-tenant';

    try {
      const result = await this.processAlert(bureau, req.body as Record<string, unknown>, tenantId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      logger.error('[BureauWebhook] Processing error', { bureau, err });
      // Always return 200 to prevent bureau retry storms
      res.status(200).json({ success: true, data: { received: true, error: (err as Error).message } });
    }
  }

  // ── Core Processing ────────────────────────────────────────

  /**
   * Parse and route a bureau alert payload.
   *
   * @param bureau   Source bureau
   * @param body     Parsed JSON alert body
   * @param tenantId Resolved tenant scope
   */
  async processAlert(
    bureau:   Bureau,
    body:     Record<string, unknown>,
    tenantId: string,
  ): Promise<AlertProcessResult> {
    const alert = normaliseBureauPayload(bureau, body);

    const iKey = alertIdempotencyKey(bureau, alert.alertType, alert.subjectRef, alert.timestamp);
    if (_processedAlerts.has(iKey)) {
      logger.debug('[BureauWebhook] Duplicate alert — skipping', {
        bureau, alertType: alert.alertType, subjectRef: alert.subjectRef,
      });
      return {
        received:    true,
        bureau,
        alertType:   alert.alertType,
        subjectRef:  alert.subjectRef,
        duplicate:   true,
        significant: false,
      };
    }

    let significant = false;

    switch (alert.alertType) {
      case 'credit_score_change':
        significant = await this._handleScoreChange(alert, tenantId);
        break;
      case 'new_inquiry':
        await this._handleNewInquiry(alert, tenantId);
        break;
      case 'derogatory_mark':
        significant = await this._handleDerogatoryMark(alert, tenantId);
        break;
      case 'account_opened':
      case 'account_closed':
        await this._handleAccountChange(alert, tenantId);
        break;
    }

    _processedAlerts.add(iKey);

    return {
      received:    true,
      bureau,
      alertType:   alert.alertType,
      subjectRef:  alert.subjectRef,
      duplicate:   false,
      significant,
    };
  }

  // ── Event Handlers ─────────────────────────────────────────

  private async _handleScoreChange(
    alert:    BureauAlertPayload,
    tenantId: string,
  ): Promise<boolean> {
    const { scoreDelta, previousScore, currentScore, scoreType } = alert.data;
    const absDelta  = Math.abs(scoreDelta ?? 0);
    const significant = absDelta >= SCORE_CHANGE_THRESHOLD;

    logger.info('[BureauWebhook] Score change alert', {
      bureau:     alert.bureau,
      subjectRef: alert.subjectRef,
      scoreType,
      // scores logged at info level — not PII for business subject
      previousScore,
      currentScore,
      scoreDelta,
      significant,
    });

    await this.eventBus.publish(tenantId, {
      eventType:     significant
        ? BUREAU_ALERT_EVENTS.SCORE_CHANGE_SIGNIFICANT
        : BUREAU_ALERT_EVENTS.SCORE_CHANGE,
      aggregateType: 'credit_alert',
      aggregateId:   alert.subjectRef,
      payload: {
        bureau:        alert.bureau,
        subjectRef:    alert.subjectRef,
        previousScore,
        currentScore,
        scoreDelta,
        scoreType,
        significant,
        timestamp:     alert.timestamp,
      },
    });

    return significant;
  }

  private async _handleNewInquiry(
    alert:    BureauAlertPayload,
    tenantId: string,
  ): Promise<void> {
    const { inquiryCreditor, inquiryDate, inquiryType } = alert.data;

    logger.info('[BureauWebhook] New inquiry alert', {
      bureau:          alert.bureau,
      subjectRef:      alert.subjectRef,
      inquiryType,
      inquiryDate,
      // inquiryCreditor may be considered PII — log at debug
    });
    logger.debug('[BureauWebhook] Inquiry creditor', { inquiryCreditor });

    await this.eventBus.publish(tenantId, {
      eventType:     BUREAU_ALERT_EVENTS.NEW_INQUIRY,
      aggregateType: 'credit_alert',
      aggregateId:   alert.subjectRef,
      payload: {
        bureau:          alert.bureau,
        subjectRef:      alert.subjectRef,
        inquiryType:     inquiryType ?? 'hard',
        inquiryDate:     inquiryDate ?? alert.timestamp,
        timestamp:       alert.timestamp,
      },
    });
  }

  private async _handleDerogatoryMark(
    alert:    BureauAlertPayload,
    tenantId: string,
  ): Promise<boolean> {
    const { derogatoryType, derogatoryAmount } = alert.data;
    // All derogatory marks are considered significant
    const significant = true;

    logger.warn('[BureauWebhook] Derogatory mark alert', {
      bureau:          alert.bureau,
      subjectRef:      alert.subjectRef,
      derogatoryType,
      derogatoryAmount,
    });

    await this.eventBus.publish(tenantId, {
      eventType:     BUREAU_ALERT_EVENTS.DEROGATORY_MARK,
      aggregateType: 'credit_alert',
      aggregateId:   alert.subjectRef,
      payload: {
        bureau:          alert.bureau,
        subjectRef:      alert.subjectRef,
        derogatoryType,
        derogatoryAmount,
        timestamp:       alert.timestamp,
      },
    });

    return significant;
  }

  private async _handleAccountChange(
    alert:    BureauAlertPayload,
    tenantId: string,
  ): Promise<void> {
    const { accountType, creditLimit, creditor } = alert.data;
    const eventType = alert.alertType === 'account_opened'
      ? BUREAU_ALERT_EVENTS.ACCOUNT_OPENED
      : BUREAU_ALERT_EVENTS.ACCOUNT_CLOSED;

    logger.info('[BureauWebhook] Account change alert', {
      bureau:     alert.bureau,
      alertType:  alert.alertType,
      subjectRef: alert.subjectRef,
      accountType,
    });

    await this.eventBus.publish(tenantId, {
      eventType,
      aggregateType: 'credit_alert',
      aggregateId:   alert.subjectRef,
      payload: {
        bureau:      alert.bureau,
        subjectRef:  alert.subjectRef,
        alertType:   alert.alertType,
        accountType,
        creditLimit,
        creditor,
        timestamp:   alert.timestamp,
      },
    });
  }

  // ── Test Helpers ───────────────────────────────────────────

  /** Reset idempotency store. @internal */
  _clearProcessedAlerts(): void {
    _processedAlerts.clear();
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const bureauWebhookHandler = new BureauWebhookHandler();
