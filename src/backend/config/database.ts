// ============================================================
// CapitalForge — Prisma Client Singleton
// Connection pooling, query logging in dev, error handling
// ============================================================

import { PrismaClient } from '@prisma/client';
import { IS_PRODUCTION, IS_TEST } from './index.js';
import logger from './logger.js';

// ── Types ─────────────────────────────────────────────────────
type QueryEvent = {
  timestamp: Date;
  query: string;
  params: string;
  duration: number;
  target: string;
};

type LogEvent = {
  timestamp: Date;
  message: string;
  target: string;
};

// ── Client factory ────────────────────────────────────────────
function buildPrismaClient(): PrismaClient {
  const logLevels: Array<'query' | 'info' | 'warn' | 'error'> = IS_TEST
    ? ['error']
    : IS_PRODUCTION
      ? ['warn', 'error']
      : ['query', 'info', 'warn', 'error'];

  const client = new PrismaClient({
    log: logLevels.map((level) =>
      level === 'query'
        ? { emit: 'event', level }
        : { emit: 'stdout', level },
    ),
    errorFormat: IS_PRODUCTION ? 'minimal' : 'pretty',
  });

  // In development, log slow queries and query details
  if (!IS_PRODUCTION && !IS_TEST) {
    // @ts-expect-error — Prisma's $on typings require event-emit log config
    client.$on('query', (e: QueryEvent) => {
      const slow = e.duration > 200;
      const logFn = slow ? logger.warn.bind(logger) : logger.debug.bind(logger);
      logFn('Prisma query', {
        query: e.query,
        params: e.params,
        durationMs: e.duration,
        slow,
      });
    });

    // @ts-expect-error — same reason
    client.$on('info', (e: LogEvent) => {
      logger.debug('Prisma info', { message: e.message, target: e.target });
    });
  }

  // Warn-level events always go to the application logger
  // @ts-expect-error — same reason
  client.$on('warn', (e: LogEvent) => {
    logger.warn('Prisma warning', { message: e.message, target: e.target });
  });

  // @ts-expect-error — same reason
  client.$on('error', (e: LogEvent) => {
    logger.error('Prisma error', { message: e.message, target: e.target });
  });

  return client;
}

// ── Singleton guard ───────────────────────────────────────────
// Prevent multiple client instances during hot-reload in dev
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ?? buildPrismaClient();

if (!IS_PRODUCTION) {
  global.__prisma = prisma;
}

// ── Graceful shutdown ─────────────────────────────────────────
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Prisma client disconnected');
}

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// ── Health check helper ───────────────────────────────────────
export async function checkDatabaseHealth(): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Database health check failed', { error: message });
    return { ok: false, error: message };
  }
}

export default prisma;
