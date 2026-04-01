// ============================================================
// CapitalForge — Input Sanitization Middleware
// Strips HTML, blocks SQL injection patterns, prevents XSS and
// path traversal, and validates known PII field formats.
// ============================================================

import type { Request, Response, NextFunction } from 'express';

// ── Regex catalogue ──────────────────────────────────────────

/**
 * Matches any HTML tag: opening, closing, self-closing, comments,
 * CDATA, and processing instructions.
 */
const HTML_TAG_RE = /<[^>]*>/g;

/**
 * Common HTML entities used in XSS payloads — decoded to their
 * literal equivalents so entity-encoded attacks are also caught.
 */
const HTML_ENTITY_RE = /&(?:#\d+|#x[\da-f]+|[a-z]+);/gi;

/**
 * SQL meta-characters and common injection sequences.
 * Pattern is intentionally broad; it will reject strings that
 * look like injected SQL rather than trying to be exhaustive.
 */
const SQL_INJECTION_SOURCE =
  String.raw`(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE|UNION|CAST|CONVERT|DECLARE|CURSOR|FETCH|KILL|OPEN|CLOSE|DEALLOCATE)\b)|(-{2})|\/\*[\s\S]*?\*\/|(;\s*$)`;

function createSQLRegex(): RegExp {
  return new RegExp(SQL_INJECTION_SOURCE, 'gi');
}

/**
 * JavaScript event handler attributes and script injection.
 * Note: compiled fresh per call via createXSSRegex() to avoid
 * stateful lastIndex issues when the global regex is reused.
 */
const XSS_PATTERN_SOURCE = String.raw`(\bon\w+\s*=)|(<\s*script[^>]*>)|(javascript\s*:)|(vbscript\s*:)|(data\s*:text\/html)`;

function createXSSRegex(): RegExp {
  return new RegExp(XSS_PATTERN_SOURCE, 'gi');
}

/**
 * Path traversal sequences: ../, ..\, encoded variants.
 */
const PATH_TRAVERSAL_SOURCE = String.raw`(?:\.\.[/\\]|%2e%2e[%2f%5c]|%252e%252e[%252f%255c]|\.\.%[25][fFcC])`;

function createPathTraversalRegex(): RegExp {
  return new RegExp(PATH_TRAVERSAL_SOURCE, 'gi');
}

/**
 * Null-byte injection (\x00).
 */
const NULL_BYTE_RE = /\x00/g;

// ── Whitelist validators ──────────────────────────────────────

export const FIELD_VALIDATORS: Record<string, RegExp> = {
  /** Employer Identification Number: XX-XXXXXXX */
  ein: /^\d{2}-\d{7}$/,
  /** Social Security Number: XXX-XX-XXXX */
  ssn: /^\d{3}-\d{2}-\d{4}$/,
  /** Basic RFC-5321 email */
  email: /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/,
  /** US/international phone — digits, spaces, hyphens, plus, parens */
  phone: /^\+?[\d\s\-().]{7,20}$/,
  /** 13–19 digit card number (spaces/hyphens stripped before check) */
  cardNumber: /^\d{13,19}$/,
  /** UUID v4 */
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /** Alphanumeric slug */
  slug: /^[a-z0-9-_]{1,128}$/i,
  /** ISO 8601 date */
  isoDate: /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/,
  /** Positive integer (string representation) */
  positiveInt: /^\d{1,15}$/,
  /** US ZIP code (5 or 9 digits) */
  zip: /^\d{5}(-\d{4})?$/,
  /** 2-letter US state code */
  stateCode: /^[A-Z]{2}$/,
};

// ── Sanitize a single string ──────────────────────────────────

/**
 * Removes or neutralises attack vectors from a single string value.
 * Returns the cleaned string, or throws `SanitizationError` if the
 * string contains an unrecoverable dangerous pattern.
 *
 * Regex instances are created fresh per call (not module-level) to
 * avoid lastIndex state bugs with the `g` flag across invocations.
 */
export function sanitizeString(value: string): string {
  if (typeof value !== 'string') return value;

  // 1. Remove null bytes
  let clean = value.replace(NULL_BYTE_RE, '');

  // 2. Check the ORIGINAL value for XSS patterns BEFORE tag stripping
  //    so that attribute-level event handlers (onerror=, onclick=) are
  //    caught even when they are inside a tag that would otherwise be
  //    stripped. Also catches javascript: URI schemes.
  if (createXSSRegex().test(clean)) {
    throw new SanitizationError('Potentially malicious content detected.', 'xss');
  }

  // 3. Decode HTML entities before further processing so that
  //    entity-encoded payloads (e.g. &#60;script&#62;) are caught.
  clean = clean
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/');

  // 4. Strip script/style tag CONTENT (including the tags themselves)
  //    before the generic tag-strip so embedded JS in script elements
  //    is removed entirely rather than left as bare text.
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // 5. Strip all remaining HTML tags (self-closing, comments, etc.)
  clean = clean.replace(HTML_TAG_RE, '');

  // 6. Remove any remaining HTML entities
  clean = clean.replace(HTML_ENTITY_RE, '');

  // 7. Second XSS pass on the now-stripped string (catches entity-encoded variants)
  if (createXSSRegex().test(clean)) {
    throw new SanitizationError('Potentially malicious content detected.', 'xss');
  }

  // 8. Detect SQL injection patterns (not recoverable — reject)
  if (createSQLRegex().test(clean)) {
    throw new SanitizationError('Input contains disallowed SQL keywords.', 'sql_injection');
  }

  // 9. Path traversal (not recoverable — reject)
  if (createPathTraversalRegex().test(clean)) {
    throw new SanitizationError('Input contains path traversal sequences.', 'path_traversal');
  }

  return clean.trim();
}

// ── Recursively sanitize an object/array ─────────────────────

/**
 * Deep-walks `obj` and sanitizes every string leaf value.
 * Non-string primitives pass through unchanged.
 * Throws `SanitizationError` if any string value is dangerous.
 */
export function sanitizeObject(obj: unknown, depth = 0): unknown {
  // Guard against excessively deep (hostile) payloads
  if (depth > 20) {
    throw new SanitizationError('Input nesting depth exceeds maximum allowed.', 'depth_exceeded');
  }

  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj !== 'object') return obj; // number, boolean, bigint …

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Sanitize the key itself (prototype pollution guard)
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue; // Drop dangerous keys silently
    }
    result[key] = sanitizeObject(value, depth + 1);
  }
  return result;
}

// ── Field-level whitelist validation ─────────────────────────

export type FieldType = keyof typeof FIELD_VALIDATORS;

/**
 * Validates `value` against the named field whitelist pattern.
 * Returns `true` when valid, `false` otherwise.
 * Strips formatting characters from card numbers / phones before
 * matching so that user-friendly formats are accepted.
 */
export function validateField(fieldType: FieldType, value: string): boolean {
  const validator = FIELD_VALIDATORS[fieldType];
  if (!validator) return false;

  let normalized = value;

  if (fieldType === 'cardNumber') {
    // Strip spaces and hyphens to get raw digits
    normalized = value.replace(/[\s-]/g, '');
  }

  return validator.test(normalized);
}

// ── Sanitization error ────────────────────────────────────────

export type SanitizationViolation = 'xss' | 'sql_injection' | 'path_traversal' | 'depth_exceeded';

export class SanitizationError extends Error {
  constructor(
    message: string,
    public readonly violation: SanitizationViolation,
  ) {
    super(message);
    this.name = 'SanitizationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Express middleware ────────────────────────────────────────

/**
 * `sanitizeInputs` — Express middleware that sanitizes `req.body`,
 * `req.query`, and `req.params` in-place before route handlers run.
 *
 * On `SanitizationError` it responds 400 with a structured error
 * body. Stack traces are never returned to the caller.
 */
export function sanitizeInputs(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    if (req.body !== undefined && req.body !== null) {
      req.body = sanitizeObject(req.body) as typeof req.body;
    }

    // Query-string values are strings or string arrays
    const rawQuery = req.query as Record<string, unknown>;
    const sanitizedQuery: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rawQuery)) {
      sanitizedQuery[key] = sanitizeObject(val);
    }
    req.query = sanitizedQuery as typeof req.query;

    // Route params
    const rawParams = req.params as Record<string, string>;
    const sanitizedParams: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawParams)) {
      sanitizedParams[key] = sanitizeObject(val) as string;
    }
    req.params = sanitizedParams as typeof req.params;

    next();
  } catch (err) {
    if (err instanceof SanitizationError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INPUT_REJECTED',
          message: err.message,
          violation: err.violation,
        },
      });
      return;
    }
    next(err);
  }
}
