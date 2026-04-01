// ============================================================
// CapitalForge — CSRF Protection Middleware
// Double-submit cookie pattern for non-API (browser) routes.
// API routes (Bearer-token authenticated) are exempt.
// SameSite=Strict cookies prevent most CSRF automatically;
// this adds an explicit token layer for defense-in-depth.
// ============================================================

import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// ── Constants ────────────────────────────────────────────────

export const CSRF_COOKIE_NAME = '__Host-csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_FORM_FIELD  = '_csrf';
export const CSRF_TOKEN_BYTES = 32;

/**
 * HTTP methods that MUST carry a valid CSRF token.
 * GET, HEAD, OPTIONS are safe methods and are exempt.
 */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Routes excluded from CSRF enforcement.
 * Typically these are Bearer-authenticated API endpoints where the
 * `Authorization` header itself provides CSRF protection (custom
 * request header that browsers cannot set in cross-origin fetches
 * without CORS pre-flight).
 */
const CSRF_EXEMPT_PREFIXES = [
  '/api/',          // All REST API routes use Bearer tokens
];

// ── Token helpers ────────────────────────────────────────────

/** Generates a new cryptographically-random CSRF token (hex string). */
export function generateCSRFToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString('hex');
}

/**
 * Timing-safe string comparison to prevent timing-based token guessing.
 * Returns `false` if lengths differ (avoids length-leak too).
 */
export function compareCSRFTokens(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

// ── Route classification ──────────────────────────────────────

function isCSRFExempt(req: Request): boolean {
  // Safe HTTP methods never mutate state — skip enforcement
  if (!UNSAFE_METHODS.has(req.method)) return true;

  // API routes authenticated by Bearer token are exempt
  const path = req.path;
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }

  return false;
}

// ── Cookie helpers ────────────────────────────────────────────

/**
 * Reads the CSRF token from the request cookie.
 * Returns `null` if the cookie is absent or empty.
 */
function getTokenFromCookie(req: Request): string | null {
  const cookies = parseCookies(req);
  const token = cookies[CSRF_COOKIE_NAME];
  return token && token.length > 0 ? token : null;
}

/**
 * Reads the CSRF token submitted by the client.
 * Checks (in order): request header, body field.
 */
function getSubmittedToken(req: Request): string | null {
  // Header takes precedence (used by SPA / fetch clients)
  const headerToken = req.headers[CSRF_HEADER_NAME];
  if (typeof headerToken === 'string' && headerToken.length > 0) {
    return headerToken;
  }

  // Form body fallback (traditional HTML form POSTs)
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body[CSRF_FORM_FIELD] === 'string') {
    return body[CSRF_FORM_FIELD] as string;
  }

  return null;
}

/**
 * Minimal cookie parser — avoids a third-party dependency.
 * Only parses the Cookie header; does not decode `%xx` sequences
 * beyond the basic split (adequate for our own token cookies).
 */
function parseCookies(req: Request): Record<string, string> {
  const header = req.headers['cookie'];
  if (!header) return {};

  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('=') as [string, string])
      .filter(([name]) => name.length > 0)
      .map(([name, ...rest]) => [name.trim(), rest.join('=').trim()]),
  );
}

/**
 * Sets the CSRF cookie on the response.
 *
 * Cookie attributes:
 * - `__Host-` prefix: browser enforces Secure + Path=/ + no Domain
 * - `SameSite=Strict`: blocks all cross-site sends (defense-in-depth)
 * - `HttpOnly=false`: client-side JS must read it to set the header
 * - `Secure`: HTTPS only (enforced by __Host- prefix)
 * - `Path=/`: required by __Host- prefix
 */
export function setCSRFCookie(res: Response, token: string): void {
  const cookieValue = [
    `${CSRF_COOKIE_NAME}=${token}`,
    'SameSite=Strict',
    'Secure',
    'Path=/',
  ].join('; ');

  // Append without overwriting other Set-Cookie headers
  const existing = res.getHeader('Set-Cookie');
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieValue]);
  } else if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, cookieValue]);
  } else {
    res.setHeader('Set-Cookie', cookieValue);
  }
}

// ── Middleware ───────────────────────────────────────────────

/**
 * `csrfProtection` — Express middleware implementing the
 * double-submit cookie pattern.
 *
 * **Safe-method requests (GET/HEAD/OPTIONS):**
 *   - A new CSRF token is generated and set as a cookie if one
 *     isn't already present, so the client can read it for
 *     subsequent mutations.
 *
 * **Unsafe-method requests (POST/PUT/PATCH/DELETE) on non-API routes:**
 *   - Reads the token from the cookie.
 *   - Reads the token submitted in the header or body.
 *   - Rejects with 403 if either is absent or they do not match.
 *
 * **API routes** (`/api/` prefix) are **exempt** because they use
 * Bearer tokens — a custom request header that browsers will not
 * send cross-origin without a CORS pre-flight.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // ── Exempt routes ────────────────────────────────────
  if (isCSRFExempt(req)) {
    // Still ensure the cookie is present for subsequent mutations
    ensureCSRFCookie(req, res);
    next();
    return;
  }

  // ── Enforce for unsafe mutations ─────────────────────
  const cookieToken = getTokenFromCookie(req);
  const submittedToken = getSubmittedToken(req);

  if (!cookieToken) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_COOKIE_MISSING',
        message: 'CSRF cookie is missing. Please reload the page.',
      },
    });
    return;
  }

  if (!submittedToken) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_TOKEN_MISSING',
        message: `CSRF token is required in ${CSRF_HEADER_NAME} header or ${CSRF_FORM_FIELD} body field.`,
      },
    });
    return;
  }

  if (!compareCSRFTokens(cookieToken, submittedToken)) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_TOKEN_INVALID',
        message: 'CSRF token mismatch. Request rejected.',
      },
    });
    return;
  }

  next();
}

/**
 * Sets a new CSRF cookie if one isn't already present on the request.
 * Called on every safe-method response so the client always has a
 * valid token ready for subsequent mutations.
 */
function ensureCSRFCookie(req: Request, res: Response): void {
  const existing = getTokenFromCookie(req);
  if (!existing) {
    setCSRFCookie(res, generateCSRFToken());
  }
}

// ── Token rotation ────────────────────────────────────────────

/**
 * Force-rotates the CSRF token after a successful state-changing
 * request (e.g., login, logout). Call from route handlers.
 */
export function rotateCSRFToken(res: Response): string {
  const newToken = generateCSRFToken();
  setCSRFCookie(res, newToken);
  return newToken;
}
