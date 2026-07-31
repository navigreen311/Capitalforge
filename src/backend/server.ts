// ============================================================
// CapitalForge Express Server
// Entry point for the backend API process.
// ============================================================

import express, { Response, NextFunction } from 'express';
import type { Request } from './types/http.js';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import logger from './config/logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { globalErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { applySecurityHeaders } from './middleware/security-headers.js';
import { sanitizeInputs } from './middleware/input-sanitizer.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { csrfProtection } from './middleware/csrf-protection.js';
import { timeoutMiddleware } from './middleware/timeout.js';
import { metricsMiddleware, metricsEndpoint } from './middleware/metrics.js';
import { apiRouter } from './api/routes/index.js';
import { listStubs } from './api/routes/_stub-response.js';
import { eventBus } from './events/event-bus.js';
import { LedgerService } from './events/ledger.service.js';

// ── Canonical audit ledger ────────────────────────────────────
/**
 * Attach the LedgerService to the event bus so `publishAndPersist`
 * actually writes to `ledger_events`.
 *
 * Without this, every one of the ~55 `publishAndPersist` call sites
 * across the services layer logs "called without a LedgerWriter" and
 * silently drops the event — the chain of custody is never recorded.
 *
 * config/database.ts is loaded lazily rather than imported at module
 * scope: it builds a PrismaClient as a side effect of being imported,
 * and server.ts is imported by unit tests that stub @prisma/client with
 * a client that has no `$on`. Deferring the load keeps `createApp()`
 * free of database side effects.
 *
 * Exported so tests (and any alternate entry point) can attach a real
 * or mock writer explicitly.
 */
export function attachLedgerWriter(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require('./config/database.js') as typeof import('./config/database.js');
  eventBus.setLedgerWriter(new LedgerService(prisma));
  logger.info('Canonical audit ledger attached to event bus');
}

// ── App factory (exported for testing) ───────────────────────
export function createApp(): express.Application {
  const app = express();

  // ── Security headers (CSP, HSTS, X-Frame-Options, etc.) ──
  app.use(helmet());
  app.use(applySecurityHeaders);

  // ── CORS ──────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token'],
      exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    }),
  );

  // ── Body parsing ──────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Correlation ID (must come before route logging) ───────
  app.use(requestIdMiddleware);

  // ── Request timeout (30s default, 120s uploads, 5s health) ─
  app.use(timeoutMiddleware());

  // ── Prometheus metrics collection ─────────────────────────
  app.use(metricsMiddleware);
  app.get('/metrics', metricsEndpoint);

  // ── Input sanitization (XSS, SQL injection, path traversal) ─
  app.use(sanitizeInputs);

  // ── API rate limiting (per-tenant from SaaS plan) ─────────
  app.use('/api', rateLimiter as any);

  // ── CSRF protection (double-submit cookie for non-API) ────
  app.use(csrfProtection);

  // ── Structured request logging ────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const reqLog = logger.child({
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
    });

    reqLog.info('Incoming request');

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      reqLog[level]('Request completed', {
        statusCode: res.statusCode,
        durationMs,
        contentLength: res.get('Content-Length'),
      });
    });

    next();
  });

  // ── Routes ────────────────────────────────────────────────
  app.use('/api', apiRouter);

  // ── 404 catch-all (before global error handler) ───────────
  app.use(notFoundHandler);

  // ── Global error handler (must be last) ───────────────────
  app.use(globalErrorHandler);

  return app;
}

// ── Start server (skipped when module is imported in tests) ──
if (process.env.VITEST !== 'true') {
  attachLedgerWriter();

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info('CapitalForge API server started', {
      port: config.port,
      env: config.nodeEnv,
      frontendUrl: config.frontendUrl,
    });

    // Print the stub inventory at boot so unimplemented endpoints stay
    // visible instead of quietly accumulating behind plausible 200s.
    const stubs = listStubs();
    if (stubs.length > 0) {
      logger.warn(
        `${stubs.length} endpoint group(s) are serving sample data, not real state`,
        { stubs: stubs.map((s) => `${s.feature} — ${s.reason}`) },
      );
    }
  });

  // ── Graceful shutdown ──────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully…`);
    server.close(() => {
      logger.info('HTTP server closed. Exiting process.');
      process.exit(0);
    });

    // Force-kill if close takes too long
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — shutting down', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}
