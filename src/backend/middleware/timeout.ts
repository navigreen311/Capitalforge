// ============================================================
// CapitalForge — Request Timeout Middleware
// Enforces per-route time limits and returns HTTP 504 Gateway
// Timeout if the handler has not responded within the window.
//
// Defaults:
//   Health checks  →   5 s
//   File uploads   → 120 s
//   General routes →  30 s
//
// Usage:
//   app.use(timeoutMiddleware());
//   // or per-router:
//   router.post('/documents/upload', timeoutMiddleware({ ms: UPLOAD_TIMEOUT_MS }), handler);
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import logger from '../config/logger.js';

// ── Constants ─────────────────────────────────────────────────

export const DEFAULT_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS  = 120_000;
export const HEALTH_TIMEOUT_MS  = 5_000;

// ── Types ─────────────────────────────────────────────────────

export interface TimeoutOptions {
  /** Hard timeout in milliseconds. Falls back to route-based defaults. */
  ms?: number;
  /** Error message included in the 504 response body. */
  message?: string;
}

// ── Route classifier ──────────────────────────────────────────

function resolveTimeout(req: Request, override?: number): number {
  if (override !== undefined) return override;

  const path = req.path.toLowerCase();

  // Health / readiness probes need tight SLOs
  if (path === '/health' || path === '/ready' || path === '/healthz' || path === '/ping') {
    return HEALTH_TIMEOUT_MS;
  }

  // File upload endpoints are time-intensive
  if (
    path.includes('/upload') ||
    path.includes('/import') ||
    path.includes('/bulk') ||
    req.headers['content-type']?.includes('multipart/form-data')
  ) {
    return UPLOAD_TIMEOUT_MS;
  }

  return DEFAULT_TIMEOUT_MS;
}

// ── Middleware factory ────────────────────────────────────────

/**
 * Returns an Express middleware that aborts with 504 if the downstream
 * handler has not called `res.end()` within the configured timeout window.
 *
 * The timer is cleared on `res.finish` so it does not fire after a normal
 * response. Works with both streaming and non-streaming handlers.
 */
export function timeoutMiddleware(options: TimeoutOptions = {}) {
  return function requestTimeout(req: Request, res: Response, next: NextFunction): void {
    const ms      = resolveTimeout(req, options.ms);
    const message = options.message ?? 'Request timed out. Please try again.';

    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;

      const reqLog = logger.child({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        timeoutMs: ms,
      });
      reqLog.warn('[Timeout] Request exceeded time limit — responding 504');

      if (res.headersSent) {
        // Headers already committed (e.g., streaming response) — destroy socket
        req.socket?.destroy();
        return;
      }

      res.status(504).json({
        success: false,
        error: {
          code: 'GATEWAY_TIMEOUT',
          message,
          timeoutMs: ms,
        },
      });
    }, ms);

    // Ensure the timer is GC'd once the response completes
    res.on('finish',  () => clearTimeout(timer));
    res.on('close',   () => clearTimeout(timer));

    // Expose timedOut flag for downstream handlers that want early-exit behaviour
    Object.defineProperty(req, 'timedOut', {
      get: () => timedOut,
      configurable: true,
    });

    next();
  };
}

// ── Named presets (convenience exports) ──────────────────────

/** 30-second timeout — general API routes. */
export const defaultTimeout = () => timeoutMiddleware({ ms: DEFAULT_TIMEOUT_MS });

/** 120-second timeout — file upload / bulk import routes. */
export const uploadTimeout = () => timeoutMiddleware({ ms: UPLOAD_TIMEOUT_MS });

/** 5-second timeout — health check / readiness probe routes. */
export const healthTimeout = () => timeoutMiddleware({ ms: HEALTH_TIMEOUT_MS });

// ── Express type augmentation ─────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      /** True if the request timeout has fired before the handler responded. */
      timedOut?: boolean;
    }
  }
}
