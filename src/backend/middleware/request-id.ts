// ============================================================
// Request ID Middleware
// Attaches a UUID to every request for correlation tracing.
// Reads X-Request-ID from incoming headers (for gateway pass-through),
// otherwise generates a new v4 UUID.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const REQUEST_ID_HEADER = 'X-Request-ID';

// Extend Express Request to carry requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers[REQUEST_ID_HEADER.toLowerCase()];
  const requestId = typeof existingId === 'string' && existingId.length > 0
    ? existingId
    : uuidv4();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
