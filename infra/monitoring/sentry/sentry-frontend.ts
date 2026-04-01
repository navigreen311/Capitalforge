// ============================================================
// CapitalForge — Sentry Frontend SDK (Next.js 15)
//
// Usage:
//   1. Call initSentryFrontend() in app/layout.tsx (or instrumentation.ts)
//   2. Wrap the root layout in <SentryErrorBoundary>
//   3. Set NEXT_PUBLIC_SENTRY_DSN in your env
//
// Session Replay masks all user input fields by default to
// prevent PII capture. Replay is sampled at 20% for normal
// sessions and 100% for sessions that produce an error.
// ============================================================

'use client';

import * as Sentry from '@sentry/nextjs';

// ── PII mask list for Replay ──────────────────────────────────
// These CSS selectors are masked (replaced with *) in all
// session replay recordings. Expand as new PII fields are added.
const REPLAY_MASK_SELECTORS = [
  // Generic sensitive inputs
  'input[type="password"]',
  'input[type="ssn"]',
  'input[name*="ssn"]',
  'input[name*="ein"]',
  'input[name*="tax"]',
  'input[name*="card"]',
  'input[name*="account"]',
  'input[name*="routing"]',
  'input[name*="dob"]',
  'input[name*="birth"]',
  // Custom data attribute for explicit PII fields
  '[data-sentry-mask]',
  // Any field labelled sensitive in design system
  '.field--sensitive input',
  '.field--sensitive textarea',
];

// ── Blocked selectors (not recorded at all) ──────────────────
const REPLAY_BLOCK_SELECTORS = [
  // Full SSN / EIN display areas
  '[data-sentry-block]',
  '.pii-display',
];

// ── Initialisation ────────────────────────────────────────────

export function initSentryFrontend(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Sentry] NEXT_PUBLIC_SENTRY_DSN not set — Sentry disabled.');
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',

    // ── Sampling ──────────────────────────────────────────
    tracesSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.15 : 1.0,

    // ── Integrations ──────────────────────────────────────
    integrations: [
      // Browser tracing (page loads, navigation, XHR/fetch)
      Sentry.browserTracingIntegration({
        // Trace outgoing fetch/XHR to the CapitalForge API
        tracePropagationTargets: [
          'localhost',
          /^https:\/\/api\.capitalforge\.com/,
        ],
      }),

      // Session Replay
      Sentry.replayIntegration({
        // Normal session sample rate
        sessionSampleRate: 0.2,
        // Always capture replay for error sessions
        errorSampleRate: 1.0,

        // PII protection — mask sensitive inputs
        maskAllInputs: true,
        maskAllText: false,
        mask: REPLAY_MASK_SELECTORS,
        block: REPLAY_BLOCK_SELECTORS,

        // Network request capture for replay context
        networkDetailAllowUrls: [/^https:\/\/api\.capitalforge\.com/],
        networkCaptureBodies: false,        // Never capture request bodies (PII risk)
        networkRequestHeaders: ['x-request-id'],
        networkResponseHeaders: ['x-request-id'],
      }),
    ],

    // ── PII protection ────────────────────────────────────
    sendDefaultPii: false,

    // ── Ignore noisy browser errors ───────────────────────
    ignoreErrors: [
      // Network errors from browser extensions
      'Non-Error promise rejection captured',
      // Safari ResizeObserver loop limit
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Extension-injected script errors
      /extensions\//i,
      /^chrome:\/\//i,
      // AbortController cancellations from route transitions
      'AbortError',
      // Chunk loading failures (handled by Next.js refresh)
      /Loading chunk \d+ failed/,
    ],

    denyUrls: [
      // Browser extension scripts
      /extensions\//i,
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
    ],

    // ── Breadcrumbs ───────────────────────────────────────
    maxBreadcrumbs: 30,
    attachStacktrace: true,

    // ── Tags applied to every event ───────────────────────
    initialScope: {
      tags: {
        service: 'capitalforge-frontend',
        team: 'platform',
        framework: 'nextjs-15',
      },
    },
  });
}

// ── User context ──────────────────────────────────────────────

/**
 * Identify the authenticated user in Sentry.
 * Uses opaque internal IDs only — never name, email, or PII.
 */
export function identifySentryUser(userId: string, tenantId: string, role: string): void {
  Sentry.setUser({ id: userId, tenantId, role });
}

/** Clear identity on sign-out. */
export function clearSentryIdentity(): void {
  Sentry.setUser(null);
}

// ── Error Boundary ────────────────────────────────────────────

export { ErrorBoundary as SentryErrorBoundary } from '@sentry/nextjs';

// ── Manual capture helpers ────────────────────────────────────

/**
 * Capture a frontend error with optional context.
 * Use in catch blocks where you want to suppress the UI throw
 * but still track the error.
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Track a compliance-related UI event as a breadcrumb.
 * Useful for reconstructing consent / disclosure click sequences.
 */
export function trackComplianceStep(step: string, meta?: Record<string, string>): void {
  Sentry.addBreadcrumb({
    category: 'compliance-ui',
    message: step,
    data: meta,
    level: 'info',
  });
}

// Re-export Sentry namespace for advanced usage
export { Sentry };
