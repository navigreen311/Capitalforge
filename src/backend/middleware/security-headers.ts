// ============================================================
// CapitalForge — Security Headers Middleware
// Applies strict CSP, HSTS, framing, referrer, and permissions
// policy headers to every response.
// Document-capture routes relax Permissions-Policy for camera.
// ============================================================

import type { Request, Response, NextFunction } from 'express';

// ── Route classification ──────────────────────────────────────

/**
 * Routes on which camera / microphone access is permitted so that
 * users can capture identity or business documents via webcam.
 */
const DOCUMENT_CAPTURE_PATHS = [
  '/api/documents/capture',
  '/api/kyb/document-upload',
  '/api/kyc/document-upload',
];

function isDocumentCapturePath(path: string): boolean {
  return DOCUMENT_CAPTURE_PATHS.some((p) => path.startsWith(p));
}

// ── CSP directives ────────────────────────────────────────────

/**
 * Builds a Content-Security-Policy header value.
 * All directives are restrictive by default; no 'unsafe-inline'
 * or 'unsafe-eval' unless absolutely unavoidable.
 */
function buildCSP(nonce: string): string {
  const directives: string[] = [
    // Only load scripts from same origin + inline scripts with nonce
    `script-src 'self' 'nonce-${nonce}'`,
    // Styles: same origin + nonce (avoids unsafe-inline)
    `style-src 'self' 'nonce-${nonce}'`,
    // Default: same origin only
    `default-src 'self'`,
    // Images: same origin + data URIs (needed for inline document thumbnails)
    `img-src 'self' data: blob:`,
    // Fonts: same origin only
    `font-src 'self'`,
    // No plugins (flash, java applets, etc.)
    `object-src 'none'`,
    // Media: same origin only
    `media-src 'self'`,
    // Frames: deny embedding of other content
    `frame-src 'none'`,
    // Workers must come from same origin
    `worker-src 'self' blob:`,
    // Manifest: same origin
    `manifest-src 'self'`,
    // All navigations must be from same origin
    `navigate-to 'self'`,
    // Report CSP violations (logged internally; no external collector)
    `report-uri /api/internal/csp-report`,
    // Upgrade any accidental HTTP sub-resources to HTTPS
    `upgrade-insecure-requests`,
    // Block mixed content
    `block-all-mixed-content`,
    // base-uri locked to self to prevent base-tag injection
    `base-uri 'self'`,
    // form-action locked to self
    `form-action 'self'`,
  ];

  return directives.join('; ');
}

// ── Permissions-Policy directives ────────────────────────────

function buildPermissionsPolicy(allowCamera: boolean): string {
  const camera = allowCamera ? 'camera=(self)' : 'camera=()';
  const microphone = allowCamera ? 'microphone=(self)' : 'microphone=()';

  return [
    camera,
    microphone,
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
    'ambient-light-sensor=()',
    'autoplay=()',
    'encrypted-media=(self)',
    'fullscreen=(self)',
    'picture-in-picture=()',
    'display-capture=()',
    'screen-wake-lock=()',
    'web-share=()',
  ].join(', ');
}

// ── Nonce generation ─────────────────────────────────────────

/**
 * Generates a cryptographically-random 128-bit nonce encoded as
 * base64. Falls back gracefully if crypto is unavailable (test env).
 */
function generateNonce(): string {
  try {
    // Node 20+ has globalThis.crypto
    const { randomBytes } = require('crypto') as typeof import('crypto');
    return randomBytes(16).toString('base64');
  } catch {
    return Buffer.from(Math.random().toString()).toString('base64');
  }
}

// ── Augment Express Request ───────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** CSP nonce for this request — pass to SSR template renderers. */
      cspNonce?: string;
    }
  }
}

// ── Middleware ───────────────────────────────────────────────

/**
 * `applySecurityHeaders` sets hardened HTTP security headers.
 *
 * - Content-Security-Policy: strict, nonce-based
 * - Strict-Transport-Security: 1 year, includeSubDomains, preload
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin
 * - Permissions-Policy: blocks camera/mic/geo except on capture routes
 * - X-XSS-Protection: disabled in favour of CSP (legacy browsers)
 * - Cross-Origin headers for COEP / COOP / CORP isolation
 */
export function applySecurityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const nonce = generateNonce();
  req.cspNonce = nonce;

  const onDocumentRoute = isDocumentCapturePath(req.path);

  // ── Transport security ───────────────────────────────────
  // 1 year max-age, includeSubDomains, preload-ready
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  );

  // ── Content type sniffing prevention ────────────────────
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // ── Clickjacking prevention ──────────────────────────────
  res.setHeader('X-Frame-Options', 'DENY');

  // ── Referrer policy ──────────────────────────────────────
  // Only send origin (no path/query) on cross-origin requests.
  res.setHeader('Referrer-Policy', 'strict-origin');

  // ── Permissions policy ───────────────────────────────────
  res.setHeader('Permissions-Policy', buildPermissionsPolicy(onDocumentRoute));

  // ── Content Security Policy ──────────────────────────────
  res.setHeader('Content-Security-Policy', buildCSP(nonce));

  // ── XSS protection (legacy IE/Edge — disabled in modern) ─
  // Setting to 0 disables the broken XSS auditor; CSP handles it.
  res.setHeader('X-XSS-Protection', '0');

  // ── Cross-Origin isolation headers ──────────────────────
  // Enable SharedArrayBuffer and high-resolution timers safely.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // ── Remove information-leaking headers ──────────────────
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  next();
}

// ── CSP violation report handler (internal) ──────────────────

/**
 * Minimal handler for `report-uri /api/internal/csp-report`.
 * Logs the violation and returns 204 — no body needed.
 * Register this route BEFORE auth middleware so browsers can POST.
 */
export function cspReportHandler(
  req: Request,
  res: Response,
): void {
  const report = (req as Request & { body?: unknown }).body;

  // Import lazily to avoid circular dependency in test environments
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const logger = require('../config/logger.js').default as {
      warn: (msg: string, data: unknown) => void;
    };
    logger.warn('CSP violation report', {
      report,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  } catch {
    // Silently ignore if logger unavailable (unit tests)
  }

  res.status(204).end();
}
