// ============================================================
// CapitalForge — Webhook Routes
//
// POST   /api/webhooks/subscriptions        — register subscription
// GET    /api/webhooks/subscriptions        — list subscriptions
// DELETE /api/webhooks/subscriptions/:id    — remove subscription
// GET    /api/webhooks/deliveries           — delivery log
// POST   /api/webhooks/test                 — send test delivery
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  webhookDeliveryService,
  ALL_EVENT_TYPES,
  type CreateSubscriptionInput,
} from '../../services/webhook-delivery.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────────────────────

export const webhooksRouter = Router();

webhooksRouter.use(tenantMiddleware);

// ── POST /api/webhooks/subscriptions ──────────────────────────────────────────
//
// Body: { url: string, events: string[], secret?: string }
// Returns the subscription with the full secret (one-time reveal).

webhooksRouter.post(
  '/subscriptions',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Tenant context required.' },
      };
      res.status(401).json(body);
      return;
    }

    const { url, events, secret } = req.body as Partial<CreateSubscriptionInput>;

    if (!url || typeof url !== 'string') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'url is required.' },
      };
      res.status(400).json(body);
      return;
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'events must be a non-empty array. Use ["*"] to subscribe to all events.',
        },
      };
      res.status(400).json(body);
      return;
    }

    try {
      const subscription = webhookDeliveryService.createSubscription({
        tenantId,
        url,
        events,
        secret: typeof secret === 'string' ? secret : undefined,
      });

      logger.info('[WebhooksRoute] Subscription created', {
        subscriptionId: subscription.id,
        tenantId,
      });

      const body: ApiResponse = {
        success: true,
        data: {
          subscription,
          warning: 'Store the secret now — it will not be shown again.',
        },
      };
      res.status(201).json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create subscription.';
      const body: ApiResponse = {
        success: false,
        error: { code: 'SUBSCRIPTION_CREATE_FAILED', message },
      };
      res.status(400).json(body);
    }
  },
);

// ── GET /api/webhooks/subscriptions ───────────────────────────────────────────
//
// Returns all active subscriptions for the tenant (secret redacted).

webhooksRouter.get(
  '/subscriptions',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Tenant context required.' },
      };
      res.status(401).json(body);
      return;
    }

    const subs = webhookDeliveryService.listSubscriptions(tenantId);

    const body: ApiResponse = {
      success: true,
      data: {
        subscriptions: subs,
        total: subs.length,
        availableEvents: ALL_EVENT_TYPES,
      },
    };
    res.status(200).json(body);
  },
);

// ── DELETE /api/webhooks/subscriptions/:id ────────────────────────────────────
//
// Soft-deletes a subscription. Returns 404 if not found or not owned.

webhooksRouter.delete(
  '/subscriptions/:id',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Tenant context required.' },
      };
      res.status(401).json(body);
      return;
    }

    const { id } = req.params as { id: string };

    const deleted = webhookDeliveryService.deleteSubscription(id, tenantId);

    if (!deleted) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Subscription not found.' },
      };
      res.status(404).json(body);
      return;
    }

    const body: ApiResponse = {
      success: true,
      data: { message: 'Subscription deleted.' },
    };
    res.status(200).json(body);
  },
);

// ── GET /api/webhooks/deliveries ──────────────────────────────────────────────
//
// Query params: subscriptionId?, status?, limit?, offset?

webhooksRouter.get(
  '/deliveries',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Tenant context required.' },
      };
      res.status(401).json(body);
      return;
    }

    const {
      subscriptionId,
      status,
      limit:  limitStr,
      offset: offsetStr,
    } = req.query as Record<string, string | undefined>;

    const limit  = limitStr  ? Math.min(parseInt(limitStr,  10) || 50, 200) : 50;
    const offset = offsetStr ? Math.max(parseInt(offsetStr, 10) || 0,  0)   : 0;

    const validStatuses = new Set([
      'pending', 'delivered', 'failed', 'retrying', 'dead_letter',
    ]);

    if (status && !validStatuses.has(status)) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: `Invalid status. Must be one of: ${[...validStatuses].join(', ')}.`,
        },
      };
      res.status(400).json(body);
      return;
    }

    const result = webhookDeliveryService.listDeliveries(tenantId, {
      subscriptionId,
      status:  status as Parameters<typeof webhookDeliveryService.listDeliveries>[1]['status'],
      limit,
      offset,
    });

    const body: ApiResponse = {
      success: true,
      data: {
        deliveries: result.deliveries,
        total:      result.total,
        limit,
        offset,
      },
    };
    res.status(200).json(body);
  },
);

// ── POST /api/webhooks/test ───────────────────────────────────────────────────
//
// Body: { subscriptionId: string }
// Sends a synthetic test event to validate endpoint connectivity.

webhooksRouter.post(
  '/test',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Tenant context required.' },
      };
      res.status(401).json(body);
      return;
    }

    const { subscriptionId } = req.body as { subscriptionId?: string };

    if (!subscriptionId || typeof subscriptionId !== 'string') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'subscriptionId is required.' },
      };
      res.status(400).json(body);
      return;
    }

    const delivery = await webhookDeliveryService.sendTestDelivery(subscriptionId, tenantId);

    if (!delivery) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Subscription not found or inactive.' },
      };
      res.status(404).json(body);
      return;
    }

    logger.info('[WebhooksRoute] Test delivery sent', {
      subscriptionId,
      tenantId,
      deliveryId: delivery.id,
      status:     delivery.status,
    });

    const body: ApiResponse = {
      success: true,
      data: {
        delivery,
        message: delivery.status === 'delivered'
          ? 'Test delivery succeeded.'
          : 'Test delivery failed — check delivery details for error.',
      },
    };
    res.status(delivery.status === 'delivered' ? 200 : 502).json(body);
  },
);
