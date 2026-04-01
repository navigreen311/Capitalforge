// ============================================================
// CapitalForge — Retry Utility
// Exponential backoff with full jitter for transient failures.
// Distinguishes retryable errors (network, 429, 503) from
// non-retryable errors (400, 401, 403, 404) and fails fast
// on the latter.
// ============================================================

import logger from '../config/logger.js';

// ── Types ─────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 4 */
  maxAttempts?: number;
  /** Base delay in milliseconds for the first retry. Default: 200 */
  baseDelayMs?: number;
  /** Upper cap on computed delay. Default: 30_000 */
  maxDelayMs?: number;
  /** Called before each retry with the attempt number (1-based) and error. */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** Override the default retryable predicate. */
  isRetryable?: (error: Error) => boolean;
  /** Human-readable label for logging. */
  operationName?: string;
}

export class RetryExhaustedError extends Error {
  constructor(
    public readonly operationName: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(
      `[Retry:${operationName}] Exhausted after ${attempts} attempt(s): ${lastError.message}`,
    );
    this.name = 'RetryExhaustedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── HTTP status helpers ───────────────────────────────────────

/** Extracts an HTTP status code from an error if present. */
function statusOf(error: Error): number | undefined {
  const e = error as unknown as Record<string, unknown>;
  // Axios-style
  if (typeof e['response'] === 'object' && e['response'] !== null) {
    const resp = e['response'] as Record<string, unknown>;
    if (typeof resp['status'] === 'number') return resp['status'];
  }
  // node-fetch / undici style
  if (typeof e['status'] === 'number') return e['status'];
  if (typeof e['statusCode'] === 'number') return e['statusCode'];
  return undefined;
}

/**
 * Default retryability logic.
 *
 * Retryable:
 *   - No HTTP status (network-level errors: ECONNRESET, ETIMEDOUT, ENOTFOUND, fetch failures)
 *   - 408 Request Timeout
 *   - 429 Too Many Requests
 *   - 500 Internal Server Error
 *   - 502 Bad Gateway
 *   - 503 Service Unavailable
 *   - 504 Gateway Timeout
 *
 * Non-retryable (fast fail):
 *   - 400 Bad Request — caller bug, won't resolve
 *   - 401 Unauthorized — credential issue
 *   - 403 Forbidden    — permission issue
 *   - 404 Not Found    — resource doesn't exist
 *   - 409 Conflict     — business logic conflict
 *   - 422 Unprocessable Entity
 */
export function isRetryableError(error: Error): boolean {
  const NON_RETRYABLE = new Set([400, 401, 403, 404, 409, 410, 422]);
  const RETRYABLE     = new Set([408, 429, 500, 502, 503, 504]);

  const status = statusOf(error);

  if (status === undefined) {
    // Network-level errors — always retryable
    const msg = error.message.toLowerCase();
    const retryableNames = new Set(['networkerror', 'aborterror', 'typeerror']);
    if (retryableNames.has(error.name.toLowerCase())) return true;
    if (
      msg.includes('network') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('fetch') ||
      msg.includes('socket')
    ) {
      return true;
    }
    // Unknown errors without a status — retry conservatively
    return true;
  }

  if (NON_RETRYABLE.has(status)) return false;
  if (RETRYABLE.has(status)) return true;

  // Default: retry 5xx, don't retry 4xx
  return status >= 500;
}

// ── Delay computation ─────────────────────────────────────────

/**
 * Full-jitter exponential backoff:
 *   delay = random(0, min(maxDelay, base * 2^(attempt-1)))
 *
 * "Full jitter" avoids thundering-herd on mass retries.
 */
export function computeBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const capped      = Math.min(exponential, maxDelayMs);
  return Math.floor(Math.random() * capped);
}

// ── Core retry loop ───────────────────────────────────────────

/**
 * Retries `fn` using exponential backoff with full jitter.
 *
 * @throws {RetryExhaustedError} when all attempts fail with retryable errors.
 * @throws The original error immediately when it is non-retryable.
 *
 * Usage:
 *   const data = await withRetry(
 *     () => plaidClient.getTransactions(req),
 *     { maxAttempts: 3, operationName: 'plaid.getTransactions' },
 *   );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts    = 4,
    baseDelayMs    = 200,
    maxDelayMs     = 30_000,
    onRetry,
    isRetryable    = isRetryableError,
    operationName  = 'operation',
  } = options;

  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isRetryable(lastError)) {
        logger.debug(`[Retry:${operationName}] Non-retryable error on attempt ${attempt} — aborting`, {
          error: lastError.message,
          status: statusOf(lastError),
        });
        throw lastError;
      }

      if (attempt === maxAttempts) break;

      const delayMs = computeBackoffDelay(attempt, baseDelayMs, maxDelayMs);

      logger.warn(`[Retry:${operationName}] Attempt ${attempt}/${maxAttempts} failed — retrying in ${delayMs}ms`, {
        error: lastError.message,
        attempt,
        delayMs,
      });

      if (onRetry) onRetry(attempt, lastError, delayMs);

      await sleep(delayMs);
    }
  }

  throw new RetryExhaustedError(operationName, maxAttempts, lastError);
}

// ── Helpers ───────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an async function with retry logic and returns the decorated version.
 * Convenient when you want to pre-configure retries on a service method.
 *
 * Usage:
 *   const resilientFetch = retryable(fetchCreditReport, { maxAttempts: 3 });
 *   const report = await resilientFetch(businessId);
 */
export function retryable<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options?: RetryOptions,
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}
