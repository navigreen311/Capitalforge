// ============================================================
// Global Error Handler
// Must be registered LAST with app.use().
// Returns ApiResponse-shaped JSON. Never leaks stack traces in prod.
// Logs every error with the correlation requestId.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../config/logger.js';
import { IS_PRODUCTION } from '../config/index.js';

// ── Typed application error ───────────────────────────────────
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Convenience factories ─────────────────────────────────────
export const notFound = (resource = 'Resource') =>
  new AppError(404, 'NOT_FOUND', `${resource} not found.`);

export const forbidden = (msg = 'Access denied.') =>
  new AppError(403, 'FORBIDDEN', msg);

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', msg, details);

export const conflict = (msg: string) =>
  new AppError(409, 'CONFLICT', msg);

// ── Error-to-response mapping ─────────────────────────────────
interface ErrorShape {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
}

function normalizeError(err: unknown): ErrorShape {
  // Known application error
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
      stack: err.stack,
    };
  }

  // Express body-parser / JSON parse errors
  if (err instanceof SyntaxError && 'body' in err) {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Request body contains invalid JSON.',
      stack: (err as Error).stack,
    };
  }

  // Generic Error
  if (err instanceof Error) {
    return {
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: IS_PRODUCTION ? 'An unexpected error occurred.' : err.message,
      stack: err.stack,
    };
  }

  // Unknown thrown value
  return {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
  };
}

// ── Middleware signature (4 args required by Express) ─────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const normalized = normalizeError(err);

  const reqLog = logger.child({
    requestId: req.requestId,
    tenantId: req.tenant?.tenantId,
    userId: req.tenant?.userId,
  });

  const logPayload = {
    statusCode: normalized.statusCode,
    code: normalized.code,
    method: req.method,
    path: req.path,
    // Only include stack in non-production logs
    ...(IS_PRODUCTION ? {} : { stack: normalized.stack }),
  };

  if (normalized.statusCode >= 500) {
    reqLog.error(normalized.message, logPayload);
  } else {
    reqLog.warn(normalized.message, logPayload);
  }

  const body: ApiResponse = {
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      // Never expose details or stack in production
      ...(IS_PRODUCTION ? {} : { details: normalized.details ?? normalized.stack }),
    },
  };

  res.status(normalized.statusCode).json(body);
}

// ── 404 catch-all (register BEFORE globalErrorHandler) ────────
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found.`));
}
