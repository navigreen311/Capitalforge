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
import { registerStub } from './_stub-response.js';

const prisma = new PrismaClient();

// The dispatch half of this feature has no provider behind it. Eligibility is
// real; sending is not, and the send endpoint refuses rather than pretending.
registerStub(
  'voiceforge.smsCampaign',
  'No SMS provider is configured, so campaigns are refused rather than '
  + 'reported as sent. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to enable.',
);

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

/** Whether an SMS provider is configured. */
function smsProviderConfigured(): boolean {
  return Boolean(process.env['TWILIO_ACCOUNT_SID'] && process.env['TWILIO_AUTH_TOKEN']);
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
          smsProviderConfigured: smsProviderConfigured(),
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

      // Consent is resolved first, so the response can always say who was
      // blocked for consent regardless of provider state.
      const consents = await prisma.consentRecord.findMany({
        where: {
          tenantId,
          businessId: { in: client_ids },
          channel: channel ?? 'sms',
          consentType: 'tcpa',
          status: 'active',
        },
        select: { businessId: true },
      });
      const consented = new Set(consents.map((c) => c.businessId));
      const wouldSendTo = client_ids.filter((id) => consented.has(id));
      const blockedForConsent = client_ids.filter((id) => !consented.has(id));

      if (!smsProviderConfigured()) {
        // Nothing can be sent, so nothing is claimed. This used to log
        // "SMS campaign dispatched" and return a sent_count for a dispatch
        // that never happened — in a product whose selling point is
        // consent-gated outreach.
        logger.warn('SMS campaign requested with no provider configured', {
          tenantId,
          requested: client_ids.length,
          wouldSendTo: wouldSendTo.length,
        });

        res.status(503).json({
          success: false,
          error: {
            code: 'SMS_PROVIDER_NOT_CONFIGURED',
            message:
              'No SMS provider is configured, so nothing was sent. '
              + 'Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to enable dispatch.',
          },
          meta: {
            wouldSendTo,
            blockedForConsent,
            template: template ?? 'payment_reminder',
            channel: channel ?? 'sms',
          },
        } satisfies ApiResponse);
        return;
      }

      // Credentials are present but no dispatch client is wired. Failing
      // loudly is the only honest option: returning a success here would
      // recreate exactly the defect this replaced.
      logger.error('SMS provider configured but no dispatch client is implemented', { tenantId });
      res.status(501).json({
        success: false,
        error: {
          code: 'SMS_DISPATCH_NOT_IMPLEMENTED',
          message:
            'SMS credentials are present but no dispatch client is wired. Nothing was sent.',
        },
        meta: { wouldSendTo, blockedForConsent },
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
