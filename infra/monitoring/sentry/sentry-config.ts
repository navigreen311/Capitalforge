// ============================================================
// CapitalForge — Sentry Backend SDK Configuration
// Initialise before any other imports in server.ts.
//
// PII scrubbing: SSN, EIN, card numbers, account numbers, and
// any field tagged with common sensitive key names are stripped
// before events leave the process.
// ============================================================

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// ── PII scrubbing ────────────────────────────────────────────

/** Regex patterns for inline PII in string values. */
const PII_PATTERNS: Array<[RegExp, string]> = [
  // SSN: 123-45-6789 or 123456789
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]'],
  [/\b\d{9}\b(?=\D|$)/g, '[SSN/EIN REDACTED]'],
  // EIN: 12-3456789
  [/\b\d{2}-\d{7}\b/g, '[EIN REDACTED]'],
  // Card numbers (Luhn-plausible 13–19 digit sequences, optionally spaced/dashed)
  [/\b(?:\d[ -]?){13,19}\b/g, '[CARD REDACTED]'],
  // Bank account numbers (8–17 digit sequences)
  [/\b\d{8,17}\b/g, '[ACCOUNT REDACTED]'],
  // Routing numbers (exactly 9 digits)
  [/\b\d{9}\b/g, '[ROUTING REDACTED]'],
  // Emails
  [/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL REDACTED]'],
];

/** Sensitive top-level and nested object key names to scrub. */
const SENSITIVE_KEYS = new Set([
  'ssn',
  'sin',
  'ein',
  'tax_id',
  'taxId',
  'password',
  'passwordHash',
  'password_hash',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'apiKey',
  'api_key',
  'card_number',
  'cardNumber',
  'cvv',
  'cvc',
  'account_number',
  'accountNumber',
  'routing_number',
  'routingNumber',
  'bank_account',
  'bankAccount',
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'dob',
  'date_of_birth',
  'dateOfBirth',
  'mother_maiden_name',
  'motherMaidenName',
]);

/** Recursively scrub an unknown value of PII. */
function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[MAX DEPTH]';

  if (typeof value === 'string') {
    let result = value;
    for (const [pattern, replacement] of PII_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        scrubbed[key] = '[REDACTED]';
      } else {
        scrubbed[key] = scrubValue(val, depth + 1);
      }
    }
    return scrubbed;
  }

  return value;
}

/** Sentry `beforeSend` hook — scrubs PII from every event. */
function scrubEvent(event: Sentry.Event): Sentry.Event | null {
  // Scrub request body
  if (event.request?.data) {
    event.request.data = scrubValue(event.request.data) as typeof event.request.data;
  }

  // Scrub request headers (drop auth tokens)
  if (event.request?.headers) {
    const headers = event.request.headers as Record<string, string>;
    for (const key of Object.keys(headers)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        headers[key] = '[REDACTED]';
      }
    }
  }

  // Scrub query string
  if (event.request?.query_string) {
    event.request.query_string = scrubValue(event.request.query_string) as string;
  }

  // Scrub extra / contexts
  if (event.extra) {
    event.extra = scrubValue(event.extra) as typeof event.extra;
  }

  // Scrub breadcrumb data
  if (event.breadcrumbs?.values) {
    event.breadcrumbs.values = event.breadcrumbs.values.map((crumb) => ({
      ...crumb,
      data: crumb.data ? (scrubValue(crumb.data) as typeof crumb.data) : crumb.data,
      message: crumb.message ? (scrubValue(crumb.message) as string) : crumb.message,
    }));
  }

  // Scrub exception values (stack frames can carry PII in message strings)
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((ex) => ({
      ...ex,
      value: ex.value ? (scrubValue(ex.value) as string) : ex.value,
    }));
  }

  return event;
}

// ── Initialisation ────────────────────────────────────────────

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  // Skip in test environments — avoids polluting Sentry with test noise
  if (!dsn || process.env.NODE_ENV === 'test') {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION ?? 'unknown',

    // ── Sampling ──────────────────────────────────────────
    // Capture 100% of errors; sample traces at 10% in production
    // to manage volume/cost. Increase during investigations.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0.5,

    // ── Integrations ──────────────────────────────────────
    integrations: [
      // HTTP instrumentation (Express, fetch)
      Sentry.httpIntegration({ tracing: true }),
      // Express request handler + error handler
      Sentry.expressIntegration(),
      // Prisma query tracing
      Sentry.prismaIntegration(),
      // Node profiling (CPU flamegraphs)
      nodeProfilingIntegration(),
    ],

    // ── Performance ───────────────────────────────────────
    // Attach trace IDs to all outgoing HTTP requests for
    // distributed tracing across services
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/api\.capitalforge\.com/,
      /^https:\/\/internal\.capitalforge\.com/,
    ],

    // ── PII scrubbing ─────────────────────────────────────
    beforeSend: scrubEvent,

    // Never send cookies or IP addresses
    sendDefaultPii: false,

    // ── Tags applied to every event ───────────────────────
    initialScope: {
      tags: {
        service: 'capitalforge-backend',
        team: 'platform',
      },
    },

    // ── Ignore noisy non-actionable errors ────────────────
    ignoreErrors: [
      // Client disconnected before response completed
      'ECONNRESET',
      'EPIPE',
      // Intentional 4xx errors — tracked via metrics, not Sentry
      'AppError: 400',
      'AppError: 401',
      'AppError: 403',
      'AppError: 404',
      'AppError: 409',
    ],

    // ── Breadcrumbs config ────────────────────────────────
    maxBreadcrumbs: 50,
    attachStacktrace: true,
  });
}

// ── Context helpers for request handlers ─────────────────────

/**
 * Set user context on the current Sentry scope.
 * Uses tenant-level IDs only — never PII like name/email.
 */
export function setSentryUser(userId: string, tenantId: string, role: string): void {
  Sentry.setUser({ id: userId, tenantId, role });
}

/** Clear user context (e.g., after logout). */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/**
 * Capture a non-fatal compliance event as a Sentry breadcrumb.
 * These are high-value breadcrumbs that help reconstruct
 * compliance event sequences during incident review.
 */
export function captureComplianceBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category: 'compliance',
    message,
    data: data ? (scrubValue(data) as Record<string, unknown>) : undefined,
    level: 'info',
  });
}

/**
 * Capture a compliance violation as a Sentry event with P1 priority tags.
 * Use for events that require immediate investigation (e.g., unauthorized ACH).
 */
export function captureComplianceViolation(
  message: string,
  data: Record<string, unknown>,
): void {
  Sentry.withScope((scope) => {
    scope.setLevel('error');
    scope.setTag('category', 'compliance-violation');
    scope.setExtras(scrubValue(data) as Record<string, unknown>);
    Sentry.captureMessage(message, 'error');
  });
}

// Re-export Sentry for use in Express error handler middleware
export { Sentry };
