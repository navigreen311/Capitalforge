// ============================================================
// CapitalForge Logger
// Winston: structured JSON, PII masking, request context
// ============================================================

import winston from 'winston';
import { IS_PRODUCTION, IS_TEST, NODE_ENV } from './index.js';

// ── PII masking ───────────────────────────────────────────────
const PII_FIELDS = new Set([
  'ssn',
  'password',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'pin',
  'routingNumber',
  'routing_number',
  'accountNumber',
  'account_number',
]);

const MASK = '[REDACTED]';

function maskPii(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj; // guard against circular depth
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => maskPii(item, depth + 1));
  }

  const masked: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (PII_FIELDS.has(key) || PII_FIELDS.has(key.toLowerCase())) {
      masked[key] = MASK;
    } else if (typeof val === 'object' && val !== null) {
      masked[key] = maskPii(val, depth + 1);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

// ── Custom format ─────────────────────────────────────────────
const piiMaskingFormat = winston.format((info) => {
  const { message, level, timestamp, ...meta } = info;
  const maskedMeta = maskPii(meta) as Record<string, unknown>;
  return {
    ...maskedMeta,
    level,
    timestamp,
    message: typeof message === 'string' ? message : JSON.stringify(message),
  };
});

// ── Formats ───────────────────────────────────────────────────
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  piiMaskingFormat(),
  winston.format.json(),
);

const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  piiMaskingFormat(),
  winston.format.printf(({ timestamp, level, message, requestId, tenantId, ...rest }) => {
    const ctx = [requestId && `req:${requestId}`, tenantId && `tenant:${tenantId}`]
      .filter(Boolean)
      .join(' ');
    const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${timestamp} ${level} ${ctx ? `[${ctx}] ` : ''}${message}${meta}`;
  }),
);

// ── Logger instance ───────────────────────────────────────────
const logger = winston.createLogger({
  level: IS_TEST ? 'silent' : IS_PRODUCTION ? 'info' : 'debug',
  format: IS_PRODUCTION || IS_TEST ? jsonFormat : devFormat,
  defaultMeta: { service: 'capitalforge-api', env: NODE_ENV },
  transports: [
    new winston.transports.Console({
      silent: IS_TEST,
    }),
  ],
});

// In production, also write errors to a separate stream for alerting hooks
if (IS_PRODUCTION) {
  logger.add(
    new winston.transports.Console({
      level: 'error',
      format: jsonFormat,
    }),
  );
}

// ── Child logger factory ──────────────────────────────────────
export interface RequestLogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  method?: string;
  path?: string;
}

export function createRequestLogger(ctx: RequestLogContext): winston.Logger {
  return logger.child(ctx);
}

export { maskPii };
export default logger;
