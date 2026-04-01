// ============================================================
// CapitalForge — Webhook Retry Background Job
//
// BullMQ-based worker that:
//   1. Scans for webhook deliveries whose nextRetryAt is now due
//   2. Re-attempts delivery with the same payload + fresh signature
//   3. Moves to dead-letter after MAX_RETRY_ATTEMPTS exhausted
//
// Architecture mirrors apr-expiry-checker.ts:
//   WebhookRetryJob    — registers the repeatable BullMQ job
//   WebhookRetryWorker — processes each job run
//   bootstrapWebhookRetry() — wires both for app startup
//
// Queue name: webhook-retry
// Cron:       every minute (*/1 * * * *)
// ============================================================

import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { REDIS_URL } from '../config/index.js';
import logger from '../config/logger.js';
import {
  WebhookDeliveryService,
  type WebhookDelivery,
  type WebhookEvent,
} from '../services/webhook-delivery.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const WEBHOOK_RETRY_QUEUE_NAME = 'webhook-retry';
export const WEBHOOK_RETRY_JOB_NAME   = 'process-webhook-retries';

// ── Connection helper (shared with other BullMQ jobs) ─────────────────────────

function parseRedisConnection(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    return {
      host:     parsed.hostname || 'localhost',
      port:     parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
      tls:      parsed.protocol === 'rediss:' ? {} : undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

// ── Job payload / result types ────────────────────────────────────────────────

export interface WebhookRetryJobData {
  triggeredAt: string;
}

export interface WebhookRetryJobResult {
  deliveriesProcessed: number;
  deliveriesSucceeded: number;
  deliveriesDeadLettered: number;
  processedAt: string;
}

// ── Core scan function (decoupled from BullMQ for testability) ─────────────────

/**
 * Process all webhook deliveries due for retry right now.
 * Returns a summary of what happened.
 */
export async function runWebhookRetryScan(
  now: Date = new Date(),
  service?: WebhookDeliveryService,
): Promise<WebhookRetryJobResult> {
  const deliveryService = service ?? new WebhookDeliveryService();

  const dueDeliveries = deliveryService.listDueRetries();

  logger.info('[WebhookRetry] Retry scan started', {
    dueCount: dueDeliveries.length,
    now: now.toISOString(),
  });

  let succeeded    = 0;
  let deadLettered = 0;

  for (const delivery of dueDeliveries) {
    const sub = deliveryService.getSubscriptionInternal(delivery.subscriptionId);

    if (!sub || !sub.active) {
      logger.warn('[WebhookRetry] Subscription not found or inactive — skipping', {
        deliveryId:     delivery.id,
        subscriptionId: delivery.subscriptionId,
      });
      continue;
    }

    const nextAttemptNumber = delivery.attempts.length + 1;

    // Reconstruct the WebhookEvent from the stored delivery
    const event = extractEventFromDelivery(delivery);

    try {
      const result = await deliveryService.attemptDelivery(
        sub,
        event,
        nextAttemptNumber,
        delivery.id,
      );

      if (result.status === 'delivered') {
        succeeded++;
        logger.info('[WebhookRetry] Retry succeeded', {
          deliveryId:     delivery.id,
          subscriptionId: sub.id,
          tenantId:       sub.tenantId,
          attemptNumber:  nextAttemptNumber,
        });
      } else if (result.status === 'dead_letter') {
        deadLettered++;
        logger.warn('[WebhookRetry] Delivery moved to dead-letter', {
          deliveryId:     delivery.id,
          subscriptionId: sub.id,
          tenantId:       sub.tenantId,
          totalAttempts:  result.attempts.length,
        });
      }
    } catch (err) {
      logger.error('[WebhookRetry] Unexpected error during retry', {
        deliveryId: delivery.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result: WebhookRetryJobResult = {
    deliveriesProcessed:  dueDeliveries.length,
    deliveriesSucceeded:  succeeded,
    deliveriesDeadLettered: deadLettered,
    processedAt: now.toISOString(),
  };

  logger.info('[WebhookRetry] Retry scan complete', result);

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractEventFromDelivery(delivery: WebhookDelivery): WebhookEvent {
  try {
    const parsed = JSON.parse(delivery.payload) as {
      id: string;
      type: string;
      tenantId: string;
      data: unknown;
      createdAt: string;
    };
    return {
      id:        parsed.id,
      type:      parsed.type as WebhookEvent['type'],
      tenantId:  parsed.tenantId,
      data:      parsed.data,
      createdAt: new Date(parsed.createdAt),
    };
  } catch {
    // Fall back to delivery metadata
    return {
      id:        delivery.eventId,
      type:      delivery.eventType,
      tenantId:  delivery.tenantId,
      data:      {},
      createdAt: delivery.createdAt,
    };
  }
}

// ── BullMQ Queue class ────────────────────────────────────────────────────────

export class WebhookRetryJob {
  private readonly queue: Queue<WebhookRetryJobData>;
  private readonly connection: ConnectionOptions;

  constructor(redisUrl: string = REDIS_URL) {
    this.connection = parseRedisConnection(redisUrl);
    this.queue = new Queue<WebhookRetryJobData>(WEBHOOK_RETRY_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail:     { count: 100 },
        attempts:         1, // retry jobs are themselves not retried; the inner delivery handles it
      },
    });
  }

  /**
   * Register the repeatable retry-scanner job.
   *
   * @param cronExpression Cron string — defaults to every minute.
   */
  async schedule(cronExpression = '*/1 * * * *'): Promise<void> {
    await this.queue.upsertJobScheduler(
      WEBHOOK_RETRY_JOB_NAME,
      { pattern: cronExpression },
      {
        name: WEBHOOK_RETRY_JOB_NAME,
        data: { triggeredAt: new Date().toISOString() },
      },
    );

    logger.info('[WebhookRetryJob] Repeatable job scheduled', {
      queue: WEBHOOK_RETRY_QUEUE_NAME,
      cron:  cronExpression,
    });
  }

  /** Manually enqueue a one-off retry scan (on-demand triggers, CI). */
  async triggerNow(): Promise<void> {
    await this.queue.add(WEBHOOK_RETRY_JOB_NAME, {
      triggeredAt: new Date().toISOString(),
    });
    logger.info('[WebhookRetryJob] Manual retry scan triggered');
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  get bullQueue(): Queue<WebhookRetryJobData> {
    return this.queue;
  }
}

// ── BullMQ Worker class ───────────────────────────────────────────────────────

export class WebhookRetryWorker {
  private readonly worker: Worker<WebhookRetryJobData, WebhookRetryJobResult>;
  private readonly service: WebhookDeliveryService;

  constructor(redisUrl: string = REDIS_URL, service?: WebhookDeliveryService) {
    this.service = service ?? new WebhookDeliveryService();
    const connection = parseRedisConnection(redisUrl);

    this.worker = new Worker<WebhookRetryJobData, WebhookRetryJobResult>(
      WEBHOOK_RETRY_QUEUE_NAME,
      this._processJob.bind(this),
      {
        connection,
        concurrency:  1,        // Serial to avoid duplicate delivery
        lockDuration: 60_000,   // 1 minute max per scan
      },
    );

    this.worker.on('completed', (job, result) => {
      logger.info('[WebhookRetryWorker] Job completed', {
        jobId:                  job.id,
        deliveriesProcessed:    result.deliveriesProcessed,
        deliveriesSucceeded:    result.deliveriesSucceeded,
        deliveriesDeadLettered: result.deliveriesDeadLettered,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('[WebhookRetryWorker] Job failed', {
        jobId: job?.id,
        error: err.message,
        stack: err.stack,
      });
    });

    this.worker.on('error', (err) => {
      logger.error('[WebhookRetryWorker] Worker error', {
        error: err.message,
      });
    });
  }

  private async _processJob(
    job: Job<WebhookRetryJobData, WebhookRetryJobResult>,
  ): Promise<WebhookRetryJobResult> {
    const now = job.data.triggeredAt
      ? new Date(job.data.triggeredAt)
      : new Date();

    logger.info('[WebhookRetryWorker] Processing job', {
      jobId: job.id,
      now:   now.toISOString(),
    });

    return runWebhookRetryScan(now, this.service);
  }

  async close(): Promise<void> {
    await this.worker.close();
  }

  get bullWorker(): Worker<WebhookRetryJobData, WebhookRetryJobResult> {
    return this.worker;
  }
}

// ── Bootstrap helper ──────────────────────────────────────────────────────────

export interface WebhookRetryHandle {
  job:      WebhookRetryJob;
  worker:   WebhookRetryWorker;
  shutdown: () => Promise<void>;
}

/**
 * Wire up and start the webhook retry subsystem.
 * Call once during application startup.
 *
 * @example
 *   const retryHandle = await bootstrapWebhookRetry();
 *   // on shutdown:
 *   await retryHandle.shutdown();
 */
export async function bootstrapWebhookRetry(
  options: {
    redisUrl?:       string;
    cronExpression?: string;
    service?:        WebhookDeliveryService;
  } = {},
): Promise<WebhookRetryHandle> {
  const redisUrl = options.redisUrl ?? REDIS_URL;

  const job    = new WebhookRetryJob(redisUrl);
  const worker = new WebhookRetryWorker(redisUrl, options.service);

  await job.schedule(options.cronExpression);

  logger.info('[WebhookRetry] Subsystem bootstrapped', { redisUrl });

  const shutdown = async (): Promise<void> => {
    logger.info('[WebhookRetry] Shutting down...');
    await Promise.all([job.close(), worker.close()]);
    logger.info('[WebhookRetry] Shutdown complete.');
  };

  return { job, worker, shutdown };
}
