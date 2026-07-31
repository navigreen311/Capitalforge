// ============================================================
// CapitalForge — Payment Reminder Routes (TCPA-gated)
//
// Mounted under:
//   GET  /api/v1/dashboard/payment-reminder-eligible
//   POST /api/v1/voiceforge/sms-campaign
//
// Eligibility is computed from real payment schedules and real consent
// records. The consent gate is the whole point of this feature — contacting a
// client on a channel they have not consented to is a TCPA violation — so it
// is evaluated against ConsentRecord rather than asserted.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import type { ApiResponse } from '@shared/types/index.js';
import { PrismaClient } from '@prisma/client';
import logger from '../../config/logger.js';
import {
  dispatchSmsCampaign,
  smsConfigStatus,
} from '../../services/sms-dispatch.service.js';

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReminderClient {
  client_id: string;
  client_name: string;
  amount_due: number;
  due_date: string;
  tcpa_sms_consent: boolean;
  reason?: string;
}

interface ReminderEligibilityResponse {
  eligible: ReminderClient[];
  ineligible: ReminderClient[];
}

interface SmsCampaignRequest {
  client_ids: string[];
  template: string;
  channel: 'sms' | 'email' | 'voice';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTenantId(req: Request): string {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Tenant context is missing — authentication middleware did not run.');
  }
  return tenantId;
}

/** How far ahead a payment counts as worth reminding about. */
const REMINDER_WINDOW_DAYS = 7;

/** Message body per template. Kept short: one SMS segment is 160 characters. */
const TEMPLATES: Record<string, (clientName: string) => string> = {
  payment_reminder: (name) =>
    `${name}: a card payment is due within 7 days. Log in to CapitalForge for details. Reply STOP to opt out.`,
  apr_expiry: (name) =>
    `${name}: an introductory APR is ending soon. Log in to CapitalForge to review. Reply STOP to opt out.`,
};

/**
 * Every message carries opt-out instructions, which carriers require and
 * which is the mechanism the inbound webhook enforces.
 */
function renderTemplate(template: string | undefined, clientName: string): string | null {
  const render = TEMPLATES[template ?? 'payment_reminder'];
  return render ? render(clientName) : null;
}

// ── Routers ──────────────────────────────────────────────────────────────────

/** Dashboard sub-router: GET /api/v1/dashboard/payment-reminder-eligible */
export const paymentReminderEligibleRouter = Router();

paymentReminderEligibleRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = getTenantId(req);

    try {
      const windowEnd = new Date(Date.now() + REMINDER_WINDOW_DAYS * 86_400_000);

      const schedules = await prisma.paymentSchedule.findMany({
        where: {
          status: { not: 'paid' },
          dueDate: { lte: windowEnd },
          repaymentPlan: { tenantId },
        },
        include: {
          repaymentPlan: {
            include: { business: { select: { id: true, legalName: true } } },
          },
        },
        orderBy: { dueDate: 'asc' },
      });

      const businessIds = [...new Set(schedules.map((s) => s.repaymentPlan.businessId))];

      // One query for the consent that gates the whole feature.
      const consents = await prisma.consentRecord.findMany({
        where: {
          tenantId,
          businessId: { in: businessIds },
          channel: 'sms',
          consentType: 'tcpa',
          status: 'active',
        },
        select: { businessId: true },
      });
      const consented = new Set(consents.map((c) => c.businessId));

      const eligible: ReminderClient[] = [];
      const ineligible: ReminderClient[] = [];

      for (const schedule of schedules) {
        const businessId = schedule.repaymentPlan.businessId;
        const hasConsent = consented.has(businessId);

        const entry: ReminderClient = {
          client_id: businessId,
          client_name: schedule.repaymentPlan.business.legalName,
          amount_due: Number(schedule.minimumPayment),
          due_date: schedule.dueDate.toISOString().slice(0, 10),
          tcpa_sms_consent: hasConsent,
          ...(hasConsent ? {} : { reason: 'No active TCPA SMS consent on record' }),
        };

        (hasConsent ? eligible : ineligible).push(entry);
      }

      const body: ApiResponse<ReminderEligibilityResponse> = {
        success: true,
        data: { eligible, ineligible },
        meta: {
          windowDays: REMINDER_WINDOW_DAYS,
          total: schedules.length,
          smsProviderConfigured: smsConfigStatus().configured,
        },
      };
      res.status(200).json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Payment reminder eligibility check failed', { tenantId, error: message });
      const body: ApiResponse = {
        success: false,
        error: { code: 'REMINDER_ELIGIBILITY_FAILED', message: 'Unable to determine eligibility.' },
      };
      res.status(500).json(body);
    }
  },
);

/** VoiceForge sub-router: POST /api/v1/voiceforge/sms-campaign */
export const smsCampaignRouter = Router();

smsCampaignRouter.post(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = getTenantId(req);

    try {
      const { client_ids, template, channel } = req.body as SmsCampaignRequest;

      if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'client_ids array is required' },
        } satisfies ApiResponse);
        return;
      }

      if ((channel ?? 'sms') !== 'sms') {
        res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_CHANNEL',
            message: `Only the sms channel is dispatched here; received "${channel}".`,
          },
        } satisfies ApiResponse);
        return;
      }

      const config = smsConfigStatus();
      if (!config.configured) {
        // Nothing can be sent, so nothing is claimed.
        logger.warn('SMS campaign requested with incomplete configuration', {
          tenantId,
          missing: config.missing,
        });
        res.status(503).json({
          success: false,
          error: {
            code: 'SMS_PROVIDER_NOT_CONFIGURED',
            message: `SMS is not configured; nothing was sent. Missing: ${config.missing.join(', ')}.`,
          },
          meta: { missing: config.missing },
        } satisfies ApiResponse);
        return;
      }

      const businesses = await prisma.business.findMany({
        where: { id: { in: client_ids }, tenantId },
        select: { id: true, legalName: true },
      });

      if (businesses.length === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NO_MATCHING_CLIENTS', message: 'No clients matched for this tenant.' },
        } satisfies ApiResponse);
        return;
      }

      // One body per recipient so the client's own name appears. Templates are
      // a fixed set: a caller-supplied body would let arbitrary text be sent
      // to consented consumers under the product's name.
      const unknownTemplate = renderTemplate(template, 'x') === null;
      if (unknownTemplate) {
        res.status(422).json({
          success: false,
          error: {
            code: 'UNKNOWN_TEMPLATE',
            message: `Unknown template "${template}". Available: ${Object.keys(TEMPLATES).join(', ')}.`,
          },
        } satisfies ApiResponse);
        return;
      }

      const outcomes = [];
      for (const business of businesses) {
        const body = renderTemplate(template, business.legalName)!;
        const outcome = await dispatchSmsCampaign({
          tenantId,
          businessIds: [business.id],
          body,
          purpose: template ?? 'payment_reminder',
        });
        outcomes.push(outcome);
      }

      const results = outcomes.flatMap((o) => o.results);
      const sent = results.filter((r) => r.status === 'sent').length;
      const blocked = results.filter((r) => r.status === 'blocked').length;
      const failed = results.filter((r) => r.status === 'failed').length;

      res.status(200).json({
        success: true,
        data: {
          campaign_ids: outcomes.map((o) => o.campaignId),
          sent_count: sent,
          blocked_count: blocked,
          failed_count: failed,
          // Per recipient, with the reason anything was withheld. The previous
          // version reported only a sent_count, for messages never sent.
          results: results.map((r) => ({
            client_id: r.businessId,
            status: r.status,
            blocked_reason: r.blockedReason ?? null,
            detail: r.detail ?? null,
            message_id: r.messageId,
            // Quiet hours are judged per recipient, so which zone was used —
            // and whether it was stored or inferred from the area code — is
            // part of the record.
            timezone: r.timezone ?? null,
            timezone_source: r.timezoneSource ?? null,
          })),
        },
        meta: { requested: client_ids.length, matched: businesses.length },
      } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('SMS campaign dispatch failed', { tenantId, error: message });
      const body: ApiResponse = {
        success: false,
        error: { code: 'SMS_CAMPAIGN_FAILED', message: 'Unable to process the campaign request.' },
      };
      res.status(500).json(body);
    }
  },
);
