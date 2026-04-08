// ============================================================
// CapitalForge — Payment Reminder Routes (TCPA-gated)
//
// Mounted under:
//   GET  /api/v1/dashboard/payment-reminder-eligible
//   POST /api/v1/voiceforge/sms-campaign
//
// Returns mock eligible/ineligible lists based on TCPA consent
// and accepts SMS campaign dispatch requests.
// ============================================================

import { Router, type Request, type Response } from 'express';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

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

interface SmsCampaignResponse {
  sent_count: number;
  skipped_count: number;
  campaign_id: string;
}

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ELIGIBLE: ReminderClient[] = [
  {
    client_id: 'cli_apex_001',
    client_name: 'Apex Ventures Inc.',
    amount_due: 12500.0,
    due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    tcpa_sms_consent: true,
  },
  {
    client_id: 'cli_bright_002',
    client_name: 'Brightline Corp',
    amount_due: 8750.0,
    due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    tcpa_sms_consent: true,
  },
];

const MOCK_INELIGIBLE: ReminderClient[] = [
  {
    client_id: 'cli_meridian_003',
    client_name: 'Meridian Holdings LLC',
    amount_due: 15300.0,
    due_date: new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10),
    tcpa_sms_consent: false,
    reason: 'TCPA SMS consent not recorded',
  },
];

// ── Routers ──────────────────────────────────────────────────────────────────

/** Dashboard sub-router: GET /api/v1/dashboard/payment-reminder-eligible */
export const paymentReminderEligibleRouter = Router();

paymentReminderEligibleRouter.get(
  '/',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const data: ReminderEligibilityResponse = {
        eligible: MOCK_ELIGIBLE,
        ineligible: MOCK_INELIGIBLE,
      };

      const body: ApiResponse<ReminderEligibilityResponse> = {
        success: true,
        data,
      };
      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Payment reminder eligibility check failed', { error: message });
      const body: ApiResponse = {
        success: false,
        error: { code: 'REMINDER_ELIGIBILITY_FAILED', message },
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
    try {
      const { client_ids, template, channel } = req.body as SmsCampaignRequest;

      if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'client_ids array is required' },
        } satisfies ApiResponse);
        return;
      }

      // Filter against mock eligible list — only send to consented clients
      const eligibleIds = new Set(MOCK_ELIGIBLE.map((c) => c.client_id));
      const sentIds = client_ids.filter((id) => eligibleIds.has(id));
      const skippedCount = client_ids.length - sentIds.length;

      logger.info('SMS campaign dispatched', {
        channel: channel ?? 'sms',
        template: template ?? 'payment_reminder',
        sent: sentIds.length,
        skipped: skippedCount,
      });

      const data: SmsCampaignResponse = {
        sent_count: sentIds.length,
        skipped_count: skippedCount,
        campaign_id: `camp_${Date.now()}`,
      };

      const body: ApiResponse<SmsCampaignResponse> = { success: true, data };
      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('SMS campaign dispatch failed', { error: message });
      const body: ApiResponse = {
        success: false,
        error: { code: 'SMS_CAMPAIGN_FAILED', message },
      };
      res.status(500).json(body);
    }
  },
);
