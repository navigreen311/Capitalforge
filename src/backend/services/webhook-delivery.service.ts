// ============================================================
// CapitalForge — Webhook Delivery Service
//
// Responsibilities:
//   • Register / list / delete webhook subscriptions per tenant
//   • Deliver events to subscriber URLs with HMAC-SHA256 signature
//   • Exponential-backoff retry (3 attempts: 1min, 5min, 30min)
//   • Dead-letter queue after max retries exhausted
//   • Append-only delivery log with response status & latency
//
// All state is in-process (Map-based) for portability.
// In production, swap the in-memory store for Prisma models.
// ============================================================

import { randomUUID } from 'crypto';
import { EVENT_TYPES } from '@shared/constants/index.js';
import { generateWebhookSignature } from './webhook-signature.js';
import logger from '../config/logger.js';

// ── Types & Constants ─────────────────────────────────────────────────────────

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export const ALL_EVENT_TYPES: EventType[] = Object.values(EVENT_TYPES);

/** Delay (ms) before each retry attempt. Index = attempt number (0-based). */
export const RETRY_DELAYS_MS = [
  1 * 60 * 1000,   // 1 minute
  5 * 60 * 1000,   // 5 minutes
  30 * 60 * 1000,  // 30 minutes
] as const;

export const MAX_RETRY_ATTEMPTS = RETRY_DELAYS_MS.length;

// ── Subscription ──────────────────────────────────────────────────────────────

export interface WebhookSubscription {
  id: string;
  tenantId: string;
  url: string;
  events: EventType[];
  /** HMAC-SHA256 signing secret — returned once on creation, then redacted */
  secret: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionInput {
  tenantId: string;
  url: string;
  /** Subset of EVENT_TYPES values, or ['*'] for all events */
  events: string[];
  /** Optional custom secret; auto-generated if omitted */
  secret?: string;
}

export interface SubscriptionView extends Omit<WebhookSubscription, 'secret'> {
  secretPreview: string; // first 8 chars + '...'
}

// ── Delivery ──────────────────────────────────────────────────────────────────

export interface WebhookEvent {
  id: string;
  type: EventType;
  tenantId: string;
  data: unknown;
  createdAt: Date;
}

export type DeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'retrying'
  | 'dead_letter';

export interface DeliveryAttempt {
  attemptNumber: number;
  attemptedAt: Date;
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  tenantId: string;
  eventId: string;
  eventType: EventType;
  payload: string; // JSON string
  status: DeliveryStatus;
  attempts: DeliveryAttempt[];
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class WebhookDeliveryService {
  // ── In-memory store (replace with Prisma in production) ────
  private subscriptions = new Map<string, WebhookSubscription>();
  private deliveries    = new Map<string, WebhookDelivery>();

  // ── Subscription CRUD ──────────────────────────────────────

  /**
   * Register a new webhook subscription for a tenant.
   * Returns the full secret once — callers must store it securely.
   */
  createSubscription(input: CreateSubscriptionInput): WebhookSubscription {
    this.validateUrl(input.url);

    const resolvedEvents = this.resolveEvents(input.events);
    const secret = input.secret ?? this.generateSecret();
    const now = new Date();

    const sub: WebhookSubscription = {
      id:        randomUUID(),
      tenantId:  input.tenantId,
      url:       input.url,
      events:    resolvedEvents,
      secret,
      active:    true,
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(sub.id, sub);

    logger.info('[WebhookDelivery] Subscription created', {
      subscriptionId: sub.id,
      tenantId: sub.tenantId,
      url: sub.url,
      events: sub.events,
    });

    return sub;
  }

  /**
   * List active subscriptions for a tenant (secret redacted).
   */
  listSubscriptions(tenantId: string): SubscriptionView[] {
    const result: SubscriptionView[] = [];

    for (const sub of this.subscriptions.values()) {
      if (sub.tenantId === tenantId && sub.active) {
        result.push(this.toView(sub));
      }
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Soft-delete a subscription (marks inactive).
   * Returns false if not found or not owned by tenantId.
   */
  deleteSubscription(id: string, tenantId: string): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub || sub.tenantId !== tenantId) return false;

    sub.active = false;
    sub.updatedAt = new Date();
    this.subscriptions.set(id, sub);

    logger.info('[WebhookDelivery] Subscription deleted', {
      subscriptionId: id,
      tenantId,
    });

    return true;
  }

  /**
   * Get a single subscription by ID (secret redacted).
   */
  getSubscription(id: string, tenantId: string): SubscriptionView | null {
    const sub = this.subscriptions.get(id);
    if (!sub || sub.tenantId !== tenantId) return null;
    return this.toView(sub);
  }

  // ── Delivery ───────────────────────────────────────────────

  /**
   * Dispatch an event to all active subscriptions for the tenant
   * that are subscribed to this event type.
   *
   * Delivers immediately. Retry scheduling is done by the caller
   * (webhook-retry job) after inspecting failed delivery records.
   */
  async dispatchEvent(
    tenantId: string,
    eventType: EventType,
    data: unknown,
  ): Promise<WebhookDelivery[]> {
    const event: WebhookEvent = {
      id:        randomUUID(),
      type:      eventType,
      tenantId,
      data,
      createdAt: new Date(),
    };

    const matchingSubs = [...this.subscriptions.values()].filter(
      (s) => s.tenantId === tenantId &&
             s.active &&
             (s.events.includes(eventType) || (s.events as string[]).includes('*')),
    );

    const results = await Promise.all(
      matchingSubs.map((sub) => this.attemptDelivery(sub, event, 1)),
    );

    return results;
  }

  /**
   * Deliver to a single subscription and record the outcome.
   * Used both for initial dispatch and retry attempts.
   */
  async attemptDelivery(
    sub: WebhookSubscription,
    event: WebhookEvent,
    attemptNumber: number,
    existingDeliveryId?: string,
  ): Promise<WebhookDelivery> {
    const payload = JSON.stringify({
      id:        event.id,
      type:      event.type,
      tenantId:  event.tenantId,
      data:      event.data,
      createdAt: event.createdAt.toISOString(),
    });

    const { header: signatureHeader } = generateWebhookSignature(payload, sub.secret);

    const start = Date.now();
    let statusCode: number | null = null;
    let errorMsg: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

      const response = await fetch(sub.url, {
        method:  'POST',
        headers: {
          'Content-Type':             'application/json',
          'X-CapitalForge-Signature': signatureHeader,
          'X-CapitalForge-Event':     event.type,
          'X-CapitalForge-Delivery':  existingDeliveryId ?? randomUUID(),
        },
        body:   payload,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      statusCode = response.status;

      if (!response.ok) {
        errorMsg = `HTTP ${statusCode}`;
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    const latencyMs = Date.now() - start;
    const now = new Date();

    const attempt: DeliveryAttempt = {
      attemptNumber,
      attemptedAt: now,
      statusCode,
      latencyMs,
      error: errorMsg,
    };

    const succeeded = statusCode !== null && statusCode >= 200 && statusCode < 300;

    // Upsert delivery record
    let delivery: WebhookDelivery;
    const deliveryId = existingDeliveryId ?? randomUUID();
    const existing = existingDeliveryId ? this.deliveries.get(existingDeliveryId) : undefined;

    if (existing) {
      existing.attempts.push(attempt);
      existing.updatedAt = now;

      if (succeeded) {
        existing.status = 'delivered';
        existing.nextRetryAt = null;
      } else if (attemptNumber >= MAX_RETRY_ATTEMPTS) {
        existing.status = 'dead_letter';
        existing.nextRetryAt = null;
        logger.warn('[WebhookDelivery] Delivery moved to dead-letter queue', {
          deliveryId: existing.id,
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          attempts: existing.attempts.length,
        });
      } else {
        existing.status = 'retrying';
        existing.nextRetryAt = new Date(Date.now() + RETRY_DELAYS_MS[attemptNumber]);
      }

      this.deliveries.set(existing.id, existing);
      delivery = existing;
    } else {
      const nextRetryAt = (!succeeded && attemptNumber < MAX_RETRY_ATTEMPTS)
        ? new Date(Date.now() + RETRY_DELAYS_MS[attemptNumber])
        : null;

      delivery = {
        id:             deliveryId,
        subscriptionId: sub.id,
        tenantId:       sub.tenantId,
        eventId:        event.id,
        eventType:      event.type,
        payload,
        status:         succeeded
          ? 'delivered'
          : attemptNumber >= MAX_RETRY_ATTEMPTS
            ? 'dead_letter'
            : 'retrying',
        attempts:       [attempt],
        nextRetryAt,
        createdAt:      now,
        updatedAt:      now,
      };

      this.deliveries.set(delivery.id, delivery);
    }

    logger.info('[WebhookDelivery] Delivery attempt recorded', {
      deliveryId: delivery.id,
      subscriptionId: sub.id,
      tenantId: sub.tenantId,
      eventType: event.type,
      attemptNumber,
      statusCode,
      latencyMs,
      status: delivery.status,
      error: errorMsg,
    });

    return delivery;
  }

  // ── Delivery log ───────────────────────────────────────────

  /**
   * Retrieve delivery log entries for a tenant, most recent first.
   */
  listDeliveries(
    tenantId: string,
    options: {
      subscriptionId?: string;
      status?: DeliveryStatus;
      limit?: number;
      offset?: number;
    } = {},
  ): { deliveries: WebhookDelivery[]; total: number } {
    let items = [...this.deliveries.values()].filter((d) => d.tenantId === tenantId);

    if (options.subscriptionId) {
      items = items.filter((d) => d.subscriptionId === options.subscriptionId);
    }
    if (options.status) {
      items = items.filter((d) => d.status === options.status);
    }

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = items.length;
    const offset = options.offset ?? 0;
    const limit  = options.limit  ?? 50;
    const paged  = items.slice(offset, offset + limit);

    return { deliveries: paged, total };
  }

  /**
   * List deliveries in the dead-letter queue (across all tenants).
   * Used by the retry background job.
   */
  listDeadLetterDeliveries(): WebhookDelivery[] {
    return [...this.deliveries.values()].filter((d) => d.status === 'dead_letter');
  }

  /**
   * List deliveries scheduled for retry that are now due.
   * Used by the webhook-retry background job.
   */
  listDueRetries(): WebhookDelivery[] {
    const now = new Date();
    return [...this.deliveries.values()].filter(
      (d) => d.status === 'retrying' && d.nextRetryAt !== null && d.nextRetryAt <= now,
    );
  }

  /**
   * Get a subscription by ID (internal — includes secret, for delivery use).
   */
  getSubscriptionInternal(id: string): WebhookSubscription | null {
    return this.subscriptions.get(id) ?? null;
  }

  // ── Test delivery ──────────────────────────────────────────

  /**
   * Send a synthetic test event to a subscription.
   * Useful for validating endpoint connectivity after setup.
   */
  async sendTestDelivery(
    subscriptionId: string,
    tenantId: string,
  ): Promise<WebhookDelivery | null> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub || sub.tenantId !== tenantId || !sub.active) return null;

    const testEvent: WebhookEvent = {
      id:        randomUUID(),
      type:      'application.submitted' as EventType, // benign test event
      tenantId,
      data:      { test: true, message: 'CapitalForge webhook test delivery' },
      createdAt: new Date(),
    };

    return this.attemptDelivery(sub, testEvent, 1);
  }

  // ── Helpers ────────────────────────────────────────────────

  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only http and https URLs are supported.');
      }
    } catch {
      throw new Error(`Invalid webhook URL: ${url}`);
    }
  }

  private resolveEvents(events: string[]): EventType[] {
    if (events.includes('*')) return ALL_EVENT_TYPES;

    const validTypes = new Set<string>(ALL_EVENT_TYPES);
    const resolved: EventType[] = [];

    for (const e of events) {
      if (validTypes.has(e)) {
        resolved.push(e as EventType);
      } else {
        throw new Error(`Unknown event type: ${e}`);
      }
    }

    if (resolved.length === 0) {
      throw new Error('At least one valid event type is required.');
    }

    return resolved;
  }

  private generateSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('hex');
  }

  private toView(sub: WebhookSubscription): SubscriptionView {
    const { secret, ...rest } = sub;
    return {
      ...rest,
      secretPreview: secret.slice(0, 8) + '...',
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const webhookDeliveryService = new WebhookDeliveryService();
