// ============================================================
// CapitalForge — Inbound SMS webhooks (Twilio)
//
// POST /api/voiceforge/webhooks/sms-inbound  — inbound messages, incl. STOP
// POST /api/voiceforge/webhooks/sms-status   — delivery status callbacks
//
// These are public: Twilio cannot present a bearer token. They authenticate
// by HMAC signature instead, which is verified on every request before
// anything is written.
//
// The inbound handler is what makes outbound SMS defensible. A recipient who
// replies STOP must stop receiving messages, and the only way that happens is
// if this endpoint exists, is reachable, and records the opt-out.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient } from '@prisma/client';
import logger from '../../config/logger.js';
import { validateTwilioSignature } from '../../integrations/twilio/twilio-webhooks.js';
import { isOptOutKeyword, recordOptOut, normalisePhone } from '../../services/sms-dispatch.service.js';

const prisma = new PrismaClient();

export const smsWebhookRouter = Router();

// ── Signature verification ───────────────────────────────────

/**
 * Verify the request really came from Twilio.
 *
 * Without this the endpoint would let anyone opt a number out — or, worse,
 * forge delivery receipts. Returns true when the request may proceed.
 */
function verifySignature(req: Request, res: Response): boolean {
  const authToken = process.env['TWILIO_AUTH_TOKEN'];
  if (!authToken) {
    logger.error('[sms-webhook] TWILIO_AUTH_TOKEN not set; refusing webhook');
    res.status(503).json({
      success: false,
      error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook verification is not configured.' },
    });
    return false;
  }

  const signature = req.headers['x-twilio-signature'];
  const url = `${process.env['API_BASE_URL'] ?? ''}${req.originalUrl}`;
  const params = (req.body ?? {}) as Record<string, string>;

  const valid =
    typeof signature === 'string' &&
    validateTwilioSignature(authToken, signature, url, params);

  if (!valid) {
    logger.warn('[sms-webhook] Rejected request with invalid signature', { url });
    res.status(403).json({
      success: false,
      error: { code: 'INVALID_SIGNATURE', message: 'Twilio signature verification failed.' },
    });
    return false;
  }

  return true;
}

/** Twilio expects TwiML or an empty 200; it retries on anything else. */
function emptyTwiml(res: Response): void {
  res.set('Content-Type', 'text/xml').status(200).send('<Response></Response>');
}

// ── POST /sms-inbound ────────────────────────────────────────

smsWebhookRouter.post('/sms-inbound', async (req: Request, res: Response): Promise<void> => {
  if (!verifySignature(req, res)) return;

  const body = (req.body ?? {}) as Record<string, string>;
  const from = body['From'] ?? '';
  const to = body['To'] ?? '';
  const text = body['Body'] ?? '';
  const messageSid = body['MessageSid'] ?? null;

  try {
    // The tenant is resolved from the number the message was sent to. A
    // message for a number this deployment does not own is logged and
    // acknowledged rather than applied to an arbitrary tenant.
    const normalisedFrom = normalisePhone(from);
    const candidates = await prisma.business.findMany({
      where: { phoneNumber: { not: null } },
      select: { id: true, tenantId: true, phoneNumber: true },
    });
    const match = candidates.find((b) => normalisePhone(b.phoneNumber) === normalisedFrom) ?? null;

    if (!match) {
      logger.warn('[sms-webhook] Inbound message from an unrecognised number', { to });
      emptyTwiml(res);
      return;
    }

    await prisma.smsMessage.create({
      data: {
        tenantId: match.tenantId,
        businessId: match.id,
        direction: 'inbound',
        toPhoneNumber: to,
        fromPhoneNumber: normalisedFrom ?? from,
        body: text,
        status: 'received',
        providerSid: messageSid,
      },
    });

    if (isOptOutKeyword(text)) {
      const result = await recordOptOut(match.tenantId, from, `Inbound "${text.trim()}" message`);
      logger.info('[sms-webhook] Opt-out honoured', {
        tenantId: match.tenantId,
        businessId: result.businessId,
        consentsRevoked: result.consentsRevoked,
      });
    }

    emptyTwiml(res);
  } catch (error) {
    logger.error('[sms-webhook] Failed to process inbound message', { error });
    // Still acknowledge: Twilio retries on failure, and a retry storm would
    // not help. The error is logged for follow-up.
    emptyTwiml(res);
  }
});

// ── POST /sms-status ─────────────────────────────────────────

smsWebhookRouter.post('/sms-status', async (req: Request, res: Response): Promise<void> => {
  if (!verifySignature(req, res)) return;

  const body = (req.body ?? {}) as Record<string, string>;
  const messageSid = body['MessageSid'] ?? body['SmsSid'] ?? null;
  const status = body['MessageStatus'] ?? body['SmsStatus'] ?? null;
  const errorCode = body['ErrorCode'] ?? null;

  if (!messageSid || !status) {
    emptyTwiml(res);
    return;
  }

  try {
    // Delivery is the fact that matters for an audit: "sent" only means the
    // provider accepted it, not that it arrived.
    const updated = await prisma.smsMessage.updateMany({
      where: { providerSid: messageSid },
      data: { status, ...(errorCode ? { errorCode } : {}) },
    });

    if (updated.count === 0) {
      logger.warn('[sms-webhook] Status callback for an unknown message', { messageSid, status });
    }

    emptyTwiml(res);
  } catch (error) {
    logger.error('[sms-webhook] Failed to record delivery status', { messageSid, error });
    emptyTwiml(res);
  }
});
