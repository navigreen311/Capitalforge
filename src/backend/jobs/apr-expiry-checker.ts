// ============================================================
// CapitalForge — APR Expiry Checker Background Job
//
// Uses BullMQ to schedule a repeating job that scans all active
// completed funding rounds for upcoming intro APR expirations.
//
// Alert windows: 60, 30, 15 days before aprExpiryDate.
//
// The worker fires APR_EXPIRY_APPROACHING events (via the
// FundingRoundService) and marks alertSentXX flags so each
// window is fired exactly once per round.
//
// Architecture:
//   - AprExpiryCheckerJob  : registers the repeatable job in BullMQ
//   - AprExpiryCheckerWorker: processes each job run (the scan)
//   - bootstrap()          : wires both together for app startup
// ============================================================

import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { FundingRoundService } from '../services/funding-round.service.js';
import { REDIS_URL } from '../config/index.js';
import logger from '../config/logger.js';
import { APR_ALERT_WINDOWS } from '@shared/constants/index.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const APR_EXPIRY_QUEUE_NAME = 'apr-expiry-checker';
export const APR_EXPIRY_JOB_NAME  = 'scan-apr-expiry';

/** How many days out to consider a round "approaching expiry" at all. */
const LOOK_AHEAD_DAYS = Math.max(...APR_ALERT_WINDOWS) + 1; // 61

// ── Connection helper ─────────────────────────────────────────────────────────

function parseRedisConnection(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  } catch {
    // Fall back to default local Redis
    return { host: 'localhost', port: 6379 };
  }
}

// ── Job payload type ──────────────────────────────────────────────────────────

export interface AprExpiryJobData {
  /** ISO timestamp injected at schedule time; worker uses it as "now" for deterministic testing */
  triggeredAt: string;
}

export interface AprExpiryJobResult {
  roundsScanned: number;
  alertsFired: Array<{
    roundId: string;
    businessId: string;
    roundNumber: number;
    windowsFired: number[];
  }>;
  processedAt: string;
}

// ── Worker logic ──────────────────────────────────────────────────────────────

/**
 * The core scan function — decoupled from BullMQ so it can be called
 * directly in tests without spinning up a real queue.
 */
export async function runAprExpiryScan(
  now: Date = new Date(),
  prisma?: PrismaClient,
): Promise<AprExpiryJobResult> {
  const db = prisma ?? new PrismaClient();
  const service = new FundingRoundService(db);

  const lookAheadDate = new Date(now);
  lookAheadDate.setDate(lookAheadDate.getDate() + LOOK_AHEAD_DAYS);

  // Find all completed rounds that:
  //   1. Have an aprExpiryDate set
  //   2. Are expiring within the look-ahead window
  //   3. Still have at least one un-sent alert flag
  const candidateRounds = await db.fundingRound.findMany({
    where: {
      status: 'completed',
      aprExpiryDate: {
        not: null,
        lte: lookAheadDate,
        gte: now, // Don't alert on already-expired rounds
      },
      OR: [
        { alertSent60: false },
        { alertSent30: false },
        { alertSent15: false },
      ],
    },
    include: {
      business: {
        select: { tenantId: true },
      },
    },
  });

  logger.info('[AprExpiryChecker] Scan started', {
    roundsFound: candidateRounds.length,
    now: now.toISOString(),
    lookAheadDate: lookAheadDate.toISOString(),
  });

  const alertsFired: AprExpiryJobResult['alertsFired'] = [];

  for (const round of candidateRounds) {
    const tenantId = round.business.tenantId;

    try {
      const { windowsFired } = await service.evaluateAprAlerts(
        round,
        tenantId,
        now,
      );

      if (windowsFired.length > 0) {
        alertsFired.push({
          roundId: round.id,
          businessId: round.businessId,
          roundNumber: round.roundNumber,
          windowsFired,
        });

        logger.info('[AprExpiryChecker] Alerts fired for round', {
          roundId: round.id,
          businessId: round.businessId,
          roundNumber: round.roundNumber,
          windowsFired,
          tenantId,
        });
      }
    } catch (err) {
      // Log and continue — one failing round should not block others
      logger.error('[AprExpiryChecker] Error evaluating round', {
        roundId: round.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result: AprExpiryJobResult = {
    roundsScanned: candidateRounds.length,
    alertsFired,
    processedAt: now.toISOString(),
  };

  logger.info('[AprExpiryChecker] Scan complete', {
    roundsScanned: result.roundsScanned,
    totalAlertsFired: alertsFired.reduce((n, r) => n + r.windowsFired.length, 0),
  });

  return result;
}

// ── BullMQ Queue & Worker classes ─────────────────────────────────────────────

export class AprExpiryCheckerJob {
  private readonly queue: Queue<AprExpiryJobData>;
  private readonly connection: ConnectionOptions;

  constructor(redisUrl: string = REDIS_URL) {
    this.connection = parseRedisConnection(redisUrl);
    this.queue = new Queue<AprExpiryJobData>(APR_EXPIRY_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
      },
    });
  }

  /**
   * Register the repeatable scan job.
   *
   * @param cronExpression  Cron string — defaults to every day at 06:00 UTC.
   */
  async schedule(cronExpression = '0 6 * * *'): Promise<void> {
    await this.queue.upsertJobScheduler(
      APR_EXPIRY_JOB_NAME,
      { pattern: cronExpression },
      {
        name: APR_EXPIRY_JOB_NAME,
        data: { triggeredAt: new Date().toISOString() },
      },
    );

    logger.info('[AprExpiryCheckerJob] Repeatable job scheduled', {
      queue: APR_EXPIRY_QUEUE_NAME,
      cron: cronExpression,
    });
  }

  /** Manually enqueue a one-off scan (useful for testing / on-demand triggers). */
  async triggerNow(): Promise<void> {
    await this.queue.add(APR_EXPIRY_JOB_NAME, {
      triggeredAt: new Date().toISOString(),
    });

    logger.info('[AprExpiryCheckerJob] Manual scan triggered');
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  get bullQueue(): Queue<AprExpiryJobData> {
    return this.queue;
  }
}

export class AprExpiryCheckerWorker {
  private readonly worker: Worker<AprExpiryJobData, AprExpiryJobResult>;
  private readonly prisma: PrismaClient;

  constructor(redisUrl: string = REDIS_URL, prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
    const connection = parseRedisConnection(redisUrl);

    this.worker = new Worker<AprExpiryJobData, AprExpiryJobResult>(
      APR_EXPIRY_QUEUE_NAME,
      this._processJob.bind(this),
      {
        connection,
        concurrency: 1,         // Scans are serial — prevents double-alerting
        lockDuration: 120_000,  // 2 minutes max per scan
      },
    );

    this.worker.on('completed', (job, result) => {
      logger.info('[AprExpiryCheckerWorker] Job completed', {
        jobId: job.id,
        roundsScanned: result.roundsScanned,
        alertsFired: result.alertsFired.length,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('[AprExpiryCheckerWorker] Job failed', {
        jobId: job?.id,
        error: err.message,
        stack: err.stack,
      });
    });

    this.worker.on('error', (err) => {
      logger.error('[AprExpiryCheckerWorker] Worker error', {
        error: err.message,
      });
    });
  }

  private async _processJob(
    job: Job<AprExpiryJobData, AprExpiryJobResult>,
  ): Promise<AprExpiryJobResult> {
    const now = job.data.triggeredAt
      ? new Date(job.data.triggeredAt)
      : new Date();

    logger.info('[AprExpiryCheckerWorker] Processing job', {
      jobId: job.id,
      now: now.toISOString(),
    });

    return runAprExpiryScan(now, this.prisma);
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.prisma.$disconnect();
  }

  get bullWorker(): Worker<AprExpiryJobData, AprExpiryJobResult> {
    return this.worker;
  }
}

// ── Bootstrap helper ──────────────────────────────────────────────────────────

export interface AprExpiryCheckerHandle {
  job: AprExpiryCheckerJob;
  worker: AprExpiryCheckerWorker;
  /** Gracefully shut down queue and worker */
  shutdown: () => Promise<void>;
}

/**
 * Wire up and start the APR expiry checker subsystem.
 * Call this once during application startup.
 *
 * @example
 *   const checker = await bootstrapAprExpiryChecker();
 *   // on shutdown:
 *   await checker.shutdown();
 */
export async function bootstrapAprExpiryChecker(
  options: {
    redisUrl?: string;
    cronExpression?: string;
    prisma?: PrismaClient;
  } = {},
): Promise<AprExpiryCheckerHandle> {
  const redisUrl = options.redisUrl ?? REDIS_URL;

  const job    = new AprExpiryCheckerJob(redisUrl);
  const worker = new AprExpiryCheckerWorker(redisUrl, options.prisma);

  await job.schedule(options.cronExpression);

  logger.info('[AprExpiryChecker] Subsystem bootstrapped', { redisUrl });

  const shutdown = async (): Promise<void> => {
    logger.info('[AprExpiryChecker] Shutting down...');
    await Promise.all([job.close(), worker.close()]);
    logger.info('[AprExpiryChecker] Shutdown complete.');
  };

  return { job, worker, shutdown };
}
