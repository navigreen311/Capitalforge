// ============================================================
// CapitalForge — Stripe Payment Routes
//
// POST /api/stripe/checkout   — create Stripe Checkout session
// POST /api/stripe/portal     — create Billing Portal session
// POST /api/stripe/webhook    — Stripe webhook receiver
// GET  /api/stripe/status     — Stripe configuration status
// GET  /api/stripe/subscription — current tenant subscription
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  stripeService,
} from '../../services/stripe.service.js';
import type {
  PlanSlug,
} from '../../services/stripe.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const stripeRouter = Router();

// ── GET /api/stripe/status ───────────────────────────────────
// Public — returns whether Stripe is configured (no auth needed)

stripeRouter.get(
  '/status',
  async (_req: Request, res: Response): Promise<void> => {
    const status = stripeService.getStripeStatus();
    const body: ApiResponse<typeof status> = { success: true, data: status };
    res.status(200).json(body);
  },
);

// ── Auth-protected routes below ─────────────────────────────

stripeRouter.use(tenantMiddleware);

// ── POST /api/stripe/checkout ────────────────────────────────

stripeRouter.post(
  '/checkout',
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

    const { planSlug, successUrl, cancelUrl } = req.body as {
      planSlug?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    const validPlans: PlanSlug[] = ['starter', 'pro'];
    if (!planSlug || !validPlans.includes(planSlug as PlanSlug)) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `"planSlug" must be one of: ${validPlans.join(', ')}.`,
        },
      };
      res.status(422).json(body);
      return;
    }

    try {
      const result = await stripeService.createCheckoutSession({
        tenantId,
        email: req.tenant?.userId ?? '', // In production, resolve email from user record
        planSlug: planSlug as PlanSlug,
        successUrl,
        cancelUrl,
      });

      logger.info('Checkout session created', {
        tenantId,
        planSlug,
        sessionId: result.sessionId,
        mock: result.mock,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Checkout session creation failed', {
        tenantId,
        planSlug,
        error: err instanceof Error ? err.message : String(err),
      });

      const body: ApiResponse = {
        success: false,
        error: { code: 'CHECKOUT_ERROR', message: 'Failed to create checkout session.' },
      };
      res.status(500).json(body);
    }
  },
);

// ── POST /api/stripe/portal ──────────────────────────────────

stripeRouter.post(
  '/portal',
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

    const { customerId } = req.body as { customerId?: string };

    // In production, look up the Stripe customer ID from the tenant's subscription
    const resolvedCustomerId =
      customerId ??
      stripeService.getTenantSubscription(tenantId)?.customerId ??
      `cus_mock_${tenantId}`;

    try {
      const result = await stripeService.createBillingPortalSession(resolvedCustomerId);

      logger.info('Billing portal session created', {
        tenantId,
        customerId: resolvedCustomerId,
        mock: result.mock,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Billing portal session creation failed', {
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });

      const body: ApiResponse = {
        success: false,
        error: { code: 'PORTAL_ERROR', message: 'Failed to create billing portal session.' },
      };
      res.status(500).json(body);
    }
  },
);

// ── GET /api/stripe/subscription ─────────────────────────────

stripeRouter.get(
  '/subscription',
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

    const subscription = stripeService.getTenantSubscription(tenantId);

    const body: ApiResponse = {
      success: true,
      data: subscription ?? {
        tenantId,
        planSlug: 'starter',
        status: 'active',
        message: 'No Stripe subscription found. Using default Starter plan.',
      },
    };
    res.status(200).json(body);
  },
);

// ── POST /api/stripe/webhook ─────────────────────────────────
// This route does NOT use tenantMiddleware — Stripe sends the
// webhook directly with its own signature-based authentication.

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'MISSING_SIGNATURE', message: 'stripe-signature header required.' },
      };
      res.status(400).json(body);
      return;
    }

    const event = stripeService.constructWebhookEvent(
      JSON.stringify(req.body),
      signature,
    );

    if (!event) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'WEBHOOK_VERIFY_FAILED',
          message: 'Webhook signature verification failed or Stripe is not configured.',
        },
      };
      res.status(400).json(body);
      return;
    }

    try {
      const result = await stripeService.handleWebhookEvent(event);

      logger.info('Stripe webhook processed', {
        eventId: event.id,
        eventType: event.type,
        handled: result.handled,
        action: result.action,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Stripe webhook handler error', {
        eventId: event.id,
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      });

      const body: ApiResponse = {
        success: false,
        error: { code: 'WEBHOOK_ERROR', message: 'Webhook processing failed.' },
      };
      res.status(500).json(body);
    }
  },
);
