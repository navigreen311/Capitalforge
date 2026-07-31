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

    client.$on('info', (e: LogEvent) => {
      logger.debug('Prisma info', { message: e.message, target: e.target });
    });
  }

  // Warn-level events always go to the application logger
  client.$on('warn', (e: LogEvent) => {
    logger.warn('Prisma warning', { message: e.message, target: e.target });
  });

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

/**
 * The client, built on first use rather than on import.
 *
 * This module used to call buildPrismaClient() while it was being evaluated,
 * so importing it — for any symbol, from any module — constructed a client and
 * attached its log listeners. That is a side effect no importer asked for: it
 * runs in processes that never query, and it broke the server test, which
 * mocks PrismaClient and therefore has no `$on`, the moment a newly mounted
 * route pulled a service that imports this file into the server's graph.
 */
function resolveClient(): PrismaClient {
  if (!global.__prisma) {
    global.__prisma = buildPrismaClient();
  }
  return global.__prisma;
}

/**
 * The shared client.
 *
 * A proxy, so that `import { prisma }` costs nothing until a property is
 * actually read. Methods are bound to the real client — Prisma's own
 * internals rely on `this`, and handing back an unbound `$queryRaw` would
 * fail in a way that looks like a database fault.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = resolveClient();
    const value = Reflect.get(client, prop, receiver) as unknown;
    return typeof value === 'function' ? value.bind(client) : value;
  },
  set(_target, prop, value) {
    return Reflect.set(resolveClient(), prop, value);
  },
  has(_target, prop) {
    return Reflect.has(resolveClient(), prop);
  },
});

// ── Graceful shutdown ─────────────────────────────────────────
export async function disconnectPrisma(): Promise<void> {
  // Nothing to disconnect if nothing ever connected — and asking would build
  // a client during shutdown purely to close it.
  if (!global.__prisma) return;
  await global.__prisma.$disconnect();
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
