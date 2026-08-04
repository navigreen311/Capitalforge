// ============================================================
// CapitalForge — Dashboard Events Routes
//
// POST /api/v1/events — log dashboard UI events to LedgerEvent
//
// Captures user interactions (dismissals, acknowledgements,
// completions) for audit trail and analytics.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from '../../config/database.js';
import { randomUUID } from 'crypto';
import logger from '../../config/logger.js';

// ── Lazy PrismaClient singleton ─────────────────────────────────────────────

let prisma: PrismaClient | null = null;
function db(): PrismaClient {
  prisma ??= sharedPrisma;
  return prisma;
}

// ── Supported event types ───────────────────────────────────────────────────

// Exported so a test can check it against what the frontend actually posts.
// Every event type here was refused at some point by a UI spelling it its own
// way; the set is only useful if something compares the two sides.
export const SUPPORTED_EVENT_TYPES = new Set([
  'consent_alert.dismissed',
  'apr_expiry.acknowledged',
  'task.completed',
  'deal_committee.decided',
  'restack.outreach.initiated',
  'payment_reminder.sent',
  // Advisor notes. Unlike the six above, these are not a record *of* an action
  // taken elsewhere — the event is the note. Nothing else stores it, so a
  // refusal here loses what the advisor typed. Both were being posted by the
  // UI and refused as unsupported, which is why they are here.
  'client.advisor_note_added',
  'round.advisor_note_added',
]);

// ── Router ──────────────────────────────────────────────────────────────────

export const dashboardEventsRouter = Router();

// POST / — Record a dashboard event
dashboardEventsRouter.post(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { event_type, payload } = req.body ?? {};

      // ── Validate request body ──────────────────────────────────────────
      if (!event_type || typeof event_type !== 'string') {
        res.status(400).json({
          success: false,
          error: 'event_type is required and must be a string.',
        });
        return;
      }

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        res.status(400).json({
          success: false,
          error: 'payload is required and must be an object.',
        });
        return;
      }

      if (!SUPPORTED_EVENT_TYPES.has(event_type)) {
        res.status(400).json({
          success: false,
          error: `Unsupported event_type "${event_type}". Supported: ${[...SUPPORTED_EVENT_TYPES].join(', ')}`,
        });
        return;
      }

      // ── Tenant scoping ─────────────────────────────────────────────────
      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        res.status(401).json({
          success: false,
          error: 'Authentication context missing.',
        });
        return;
      }

      const userId = req.tenant?.userId ?? 'system';
      const aggregateId = (payload as Record<string, unknown>).aggregateId as string
        ?? (payload as Record<string, unknown>).id as string
        ?? randomUUID();

      // ── Write LedgerEvent ──────────────────────────────────────────────
      const ledgerEvent = await db().ledgerEvent.create({
        data: {
          tenantId,
          eventType: event_type,
          aggregateType: 'dashboard',
          aggregateId,
          payload: payload as object,
          metadata: {
            userId,
            source: 'dashboard_ui',
            recordedAt: new Date().toISOString(),
          },
        },
      });

      logger.info('Dashboard event recorded', {
        eventId: ledgerEvent.id,
        eventType: event_type,
        tenantId,
        userId,
      });

      res.status(201).json({
        success: true,
        data: { event_id: ledgerEvent.id },
      });
    } catch (err) {
      logger.error('Failed to record dashboard event', { error: err });
      res.status(500).json({
        success: false,
        error: 'Internal server error.',
      });
    }
  },
);
