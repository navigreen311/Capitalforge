// ============================================================
// CapitalForge Express Server
// Entry point for the backend API process.
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
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
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info('CapitalForge API server started', {
      port: config.port,
      env: config.nodeEnv,
      frontendUrl: config.frontendUrl,
    });
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
