// ============================================================
// CapitalForge — Graceful Shutdown Handler
// Orchestrates an ordered, time-bounded teardown sequence:
//   1. Stop accepting new HTTP requests
//   2. Drain in-flight connections
//   3. Close Prisma DB pool
//   4. Close Redis connections
//   5. Flush structured logs
//   6. Exit cleanly (or force-exit on timeout)
//
// Usage (in server.ts):
//   import { registerGracefulShutdown } from './utils/graceful-shutdown.js';
//   registerGracefulShutdown({ server, prisma, redis });
// ============================================================

import type { Server } from 'http';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import logger from '../config/logger.js';

// ── Types ─────────────────────────────────────────────────────

export interface GracefulShutdownOptions {
  /** The running HTTP/HTTPS server. */
  server: Server;
  /** Prisma client whose connection pool should be closed. */
  prisma: PrismaClient;
  /** IORedis client(s) to disconnect. */
  redis?: Redis | Redis[];
  /**
   * Maximum time (ms) to wait for the full shutdown sequence
   * before forcibly calling process.exit(1). Default: 30_000
   */
  timeoutMs?: number;
  /**
   * Additional teardown callbacks to run after Redis but before exit.
   * Errors thrown here are logged but do not abort shutdown.
   */
  onBeforeExit?: Array<() => Promise<void>>;
}

// ── Implementation ────────────────────────────────────────────

export function registerGracefulShutdown(options: GracefulShutdownOptions): void {
  const { server, prisma, redis, timeoutMs = 30_000, onBeforeExit = [] } = options;

  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.warn(`[GracefulShutdown] Already shutting down — ignoring duplicate ${signal}`);
      return;
    }
    isShuttingDown = true;

    logger.info(`[GracefulShutdown] Received ${signal} — initiating graceful shutdown`, {
      signal,
      timeoutMs,
    });

    // Force-exit guard — fires if full sequence exceeds timeoutMs
    const forceExitTimer = setTimeout(() => {
      logger.error('[GracefulShutdown] Shutdown timed out — forcing exit with code 1', {
        timeoutMs,
      });
      process.exit(1);
    }, timeoutMs);

    // Prevent the timer from keeping the event loop alive
    forceExitTimer.unref();

    try {
      // ── Step 1: Stop accepting new requests ─────────────
      await stopHttpServer(server);

      // ── Step 2: Close Prisma DB pool ─────────────────────
      await closePrisma(prisma);

      // ── Step 3: Close Redis ───────────────────────────────
      if (redis) {
        const clients = Array.isArray(redis) ? redis : [redis];
        await closeRedis(clients);
      }

      // ── Step 4: Custom teardown hooks ─────────────────────
      for (const hook of onBeforeExit) {
        try {
          await hook();
        } catch (err) {
          logger.error('[GracefulShutdown] Custom teardown hook failed', {
            error: (err as Error).message,
          });
        }
      }

      // ── Step 5: Flush logs ────────────────────────────────
      await flushLogs();

      clearTimeout(forceExitTimer);
      logger.info('[GracefulShutdown] Shutdown complete — exiting cleanly');
      process.exit(0);
    } catch (err) {
      logger.error('[GracefulShutdown] Error during shutdown sequence', {
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  };

  // ── Signal handlers ───────────────────────────────────────
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT',  () => void shutdown('SIGINT'));

  // ── Unhandled rejection / exception safety net ────────────
  process.on('unhandledRejection', (reason) => {
    logger.error('[GracefulShutdown] Unhandled promise rejection', { reason });
    // Do not exit — let the process continue; alerting is sufficient here.
  });

  process.on('uncaughtException', (err) => {
    logger.error('[GracefulShutdown] Uncaught exception — initiating emergency shutdown', {
      error: err.message,
      stack: err.stack,
    });
    void shutdown('uncaughtException');
  });
}

// ── Step implementations ──────────────────────────────────────

function stopHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info('[GracefulShutdown] Stopping HTTP server — no new connections accepted');
    server.close((err) => {
      if (err) {
        // ENOTOPEN means server was never started — treat as non-fatal
        if ((err as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
          logger.warn('[GracefulShutdown] HTTP server was not running');
          resolve();
        } else {
          logger.error('[GracefulShutdown] Error closing HTTP server', { error: err.message });
          reject(err);
        }
      } else {
        logger.info('[GracefulShutdown] HTTP server closed — all connections drained');
        resolve();
      }
    });
  });
}

async function closePrisma(prisma: PrismaClient): Promise<void> {
  logger.info('[GracefulShutdown] Disconnecting Prisma (closing DB pool)');
  try {
    await prisma.$disconnect();
    logger.info('[GracefulShutdown] Prisma disconnected');
  } catch (err) {
    logger.error('[GracefulShutdown] Error disconnecting Prisma', {
      error: (err as Error).message,
    });
    throw err;
  }
}

async function closeRedis(clients: Redis[]): Promise<void> {
  logger.info(`[GracefulShutdown] Closing ${clients.length} Redis connection(s)`);
  const results = await Promise.allSettled(
    clients.map((client) => client.quit()),
  );

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      logger.error(`[GracefulShutdown] Redis client[${i}] failed to quit`, {
        error: (result.reason as Error).message,
      });
    }
  });

  const failures = results.filter((r) => r.status === 'rejected').length;
  if (failures > 0) {
    logger.warn(`[GracefulShutdown] ${failures} Redis client(s) did not quit cleanly`);
  } else {
    logger.info('[GracefulShutdown] All Redis clients closed');
  }
}

/** Waits for Winston transports to flush buffered log entries. */
function flushLogs(): Promise<void> {
  return new Promise<void>((resolve) => {
    // Winston does not expose a built-in flush; a short wait ensures
    // the async transports (file, HTTP, cloud) drain their buffers.
    // Replace with logger.end(resolve) if using a writable stream transport.
    logger.info('[GracefulShutdown] Flushing log buffers');
    setTimeout(resolve, 200);
  });
}

// ── Exported utilities ────────────────────────────────────────

/**
 * Wraps a set of async shutdown steps for use outside of the full
 * `registerGracefulShutdown` flow (e.g., standalone scripts, batch jobs).
 *
 * Usage:
 *   await runShutdownSequence([
 *     () => prisma.$disconnect(),
 *     () => redis.quit(),
 *   ], { timeoutMs: 10_000 });
 */
export async function runShutdownSequence(
  steps: Array<() => Promise<unknown>>,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<void> {
  const deadline = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Shutdown sequence timed out')), timeoutMs),
  );

  const sequence = (async () => {
    for (const step of steps) {
      await step();
    }
  })();

  await Promise.race([sequence, deadline]);
}
