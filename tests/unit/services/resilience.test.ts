// ============================================================
// CapitalForge — Resilience Unit Tests
// Covers: CircuitBreaker states & transitions, Retry backoff
// & classification, Request Timeout middleware, Graceful
// Shutdown sequence.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Modules under test ────────────────────────────────────────

import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers,
} from '../../../src/backend/utils/circuit-breaker.js';

import {
  withRetry,
  retryable,
  isRetryableError,
  computeBackoffDelay,
  RetryExhaustedError,
} from '../../../src/backend/utils/retry.js';

import {
  timeoutMiddleware,
  DEFAULT_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  HEALTH_TIMEOUT_MS,
} from '../../../src/backend/middleware/timeout.js';

import { runShutdownSequence } from '../../../src/backend/utils/graceful-shutdown.js';

// ── Helpers ───────────────────────────────────────────────────

/** Creates an Error with an HTTP status attached (axios-like shape). */
function httpError(status: number, message = `HTTP ${status}`): Error {
  const err = new Error(message) as Error & { response: { status: number } };
  err.response = { status };
  return err;
}

/** Resolves after `ms` milliseconds. */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Mock logger to silence output in tests ────────────────────
vi.mock('../../../src/backend/config/logger.js', () => ({
  default: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info:  vi.fn(),
      warn:  vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// ─────────────────────────────────────────────────────────────
// 1. CIRCUIT BREAKER
// ─────────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Initial state ─────────────────────────────────────────

  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker({ name: 'test' });
    expect(cb.getState()).toBe('CLOSED');
  });

  it('executes fn and returns result in CLOSED state', async () => {
    const cb = new CircuitBreaker({ name: 'test' });
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  // ── CLOSED → OPEN transition ──────────────────────────────

  it('opens after reaching the failure threshold', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
    const fail = () => Promise.reject(new Error('boom'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow('boom');
    }

    expect(cb.getState()).toBe('OPEN');
  });

  it('does not open before the failure threshold is reached', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 5 });
    const fail = () => Promise.reject(new Error('x'));

    for (let i = 0; i < 4; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }

    expect(cb.getState()).toBe('CLOSED');
  });

  // ── OPEN state ────────────────────────────────────────────

  it('throws CircuitOpenError immediately when OPEN', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1 });
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

    expect(cb.getState()).toBe('OPEN');
    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('increments rejectedCalls when OPEN', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1 });
    await expect(cb.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();

    // Two rejections while open
    await expect(cb.execute(() => Promise.resolve())).rejects.toThrow();
    await expect(cb.execute(() => Promise.resolve())).rejects.toThrow();

    expect(cb.getStats().rejectedCalls).toBe(2);
  });

  // ── OPEN → HALF_OPEN transition ───────────────────────────

  it('transitions to HALF_OPEN after resetTimeoutMs elapses', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 5_000 });
    await expect(cb.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');

    vi.advanceTimersByTime(5_001);

    expect(cb.getState()).toBe('HALF_OPEN');
  });

  // ── HALF_OPEN → CLOSED recovery ───────────────────────────

  it('recovers to CLOSED on success in HALF_OPEN state', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 1_000 });
    await expect(cb.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    vi.advanceTimersByTime(1_001);

    await cb.execute(() => Promise.resolve('ok'));

    expect(cb.getState()).toBe('CLOSED');
  });

  // ── HALF_OPEN → OPEN on probe failure ─────────────────────

  it('re-opens immediately on failure in HALF_OPEN state', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 1_000 });
    await expect(cb.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    vi.advanceTimersByTime(1_001);

    await expect(cb.execute(() => Promise.reject(new Error('probe fail')))).rejects.toThrow();

    expect(cb.getState()).toBe('OPEN');
  });

  // ── Manual reset ──────────────────────────────────────────

  it('resets to CLOSED via reset()', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 1 });
    await expect(cb.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');

    cb.reset();
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats().failures).toBe(0);
  });

  // ── Registry ──────────────────────────────────────────────

  it('getCircuitBreaker returns the same instance for the same name', () => {
    const a = getCircuitBreaker('plaid');
    const b = getCircuitBreaker('plaid');
    expect(a).toBe(b);
  });

  it('getCircuitBreaker returns different instances for different names', () => {
    const a = getCircuitBreaker('plaid');
    const b = getCircuitBreaker('stripe');
    expect(a).not.toBe(b);
  });

  // ── Stats snapshot ────────────────────────────────────────

  it('getStats returns accurate counters', async () => {
    const cb = new CircuitBreaker({ name: 'test', failureThreshold: 5 });
    await cb.execute(() => Promise.resolve('ok'));
    await expect(cb.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();

    const stats = cb.getStats();
    expect(stats.successes).toBe(1);
    expect(stats.failures).toBe(1);
    expect(stats.totalCalls).toBe(2);
    expect(stats.state).toBe('CLOSED');
  });
});

// ─────────────────────────────────────────────────────────────
// 2. RETRY UTILITY
// ─────────────────────────────────────────────────────────────

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves immediately when fn succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    const result = await withRetry(fn, { operationName: 'test' });
    expect(result).toBe('data');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors and eventually resolves', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxAttempts: 4, baseDelayMs: 10, operationName: 'test' });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws RetryExhaustedError after all attempts fail', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, operationName: 'svc' });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on non-retryable 400 error', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(400));
    await expect(withRetry(fn, { maxAttempts: 4, operationName: 'test' })).rejects.toThrow('HTTP 400');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on non-retryable 401 error', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(401));
    await expect(withRetry(fn, { maxAttempts: 4 })).rejects.toThrow('HTTP 401');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on non-retryable 403 error', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(403));
    await expect(withRetry(fn, { maxAttempts: 4 })).rejects.toThrow('HTTP 403');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry callback with attempt number, error, and delay', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue('done');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, onRetry, operationName: 'x' });
    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
  });

  it('retryable decorator wraps function correctly', async () => {
    const inner = vi.fn().mockResolvedValue('wrapped');
    const wrapped = retryable(inner, { operationName: 'w' });
    const result = await wrapped('arg1', 'arg2');
    expect(result).toBe('wrapped');
    expect(inner).toHaveBeenCalledWith('arg1', 'arg2');
  });
});

describe('isRetryableError', () => {
  it('returns true for network errors without status', () => {
    expect(isRetryableError(new Error('Network request failed'))).toBe(true);
  });

  it('returns true for ECONNRESET', () => {
    expect(isRetryableError(new Error('read ECONNRESET'))).toBe(true);
  });

  it('returns true for 429', () => {
    expect(isRetryableError(httpError(429))).toBe(true);
  });

  it('returns true for 503', () => {
    expect(isRetryableError(httpError(503))).toBe(true);
  });

  it('returns false for 400', () => {
    expect(isRetryableError(httpError(400))).toBe(false);
  });

  it('returns false for 401', () => {
    expect(isRetryableError(httpError(401))).toBe(false);
  });

  it('returns false for 403', () => {
    expect(isRetryableError(httpError(403))).toBe(false);
  });
});

describe('computeBackoffDelay', () => {
  it('returns a value within [0, min(maxDelay, base * 2^(attempt-1))]', () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const delay = computeBackoffDelay(attempt, 100, 10_000);
      const cap   = Math.min(100 * Math.pow(2, attempt - 1), 10_000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(cap);
    }
  });

  it('never exceeds maxDelayMs', () => {
    for (let i = 0; i < 20; i++) {
      const d = computeBackoffDelay(10, 500, 2_000);
      expect(d).toBeLessThanOrEqual(2_000);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 3. REQUEST TIMEOUT MIDDLEWARE
// ─────────────────────────────────────────────────────────────

describe('timeoutMiddleware', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function makeReqRes(path = '/api/something', extraHeaders: Record<string, string> = {}) {
    const req = {
      path,
      method: 'GET',
      requestId: 'req-test-1',
      socket: { destroy: vi.fn() },
      headers: extraHeaders,
    } as unknown as import('express').Request;

    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      on: vi.fn(),
    } as unknown as import('express').Response;

    return { req, res };
  }

  it('calls next() immediately and does not time out on fast responses', () => {
    const { req, res } = makeReqRes();
    const next = vi.fn();
    const mw   = timeoutMiddleware({ ms: 5_000 });
    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4_999);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds with 504 after timeout elapses', () => {
    const { req, res } = makeReqRes();
    const next = vi.fn();
    const mw   = timeoutMiddleware({ ms: 1_000 });
    mw(req, res, next);

    vi.advanceTimersByTime(1_001);

    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'GATEWAY_TIMEOUT' }),
      }),
    );
  });

  it('uses HEALTH_TIMEOUT_MS for /health path by default', () => {
    expect(HEALTH_TIMEOUT_MS).toBe(5_000);
    const { req, res } = makeReqRes('/health');
    const next = vi.fn();
    // Use middleware without explicit ms override so route-based logic fires
    const mw = timeoutMiddleware();
    mw(req, res, next);

    vi.advanceTimersByTime(HEALTH_TIMEOUT_MS - 1);
    expect(res.status).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    expect(res.status).toHaveBeenCalledWith(504);
  });

  it('uses UPLOAD_TIMEOUT_MS for /upload path by default', () => {
    expect(UPLOAD_TIMEOUT_MS).toBe(120_000);
    const { req, res } = makeReqRes('/api/documents/upload');
    const next = vi.fn();
    const mw   = timeoutMiddleware();
    mw(req, res, next);

    vi.advanceTimersByTime(UPLOAD_TIMEOUT_MS - 1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('uses DEFAULT_TIMEOUT_MS for ordinary routes', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
  });

  it('destroys socket when headers already sent on timeout', () => {
    const { req, res } = makeReqRes();
    (res as { headersSent: boolean }).headersSent = true;
    const next = vi.fn();
    timeoutMiddleware({ ms: 500 })(req, res, next);

    vi.advanceTimersByTime(501);
    expect(req.socket?.destroy).toHaveBeenCalled();
    // Should not attempt to write headers
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// 4. GRACEFUL SHUTDOWN SEQUENCE
// ─────────────────────────────────────────────────────────────

describe('runShutdownSequence', () => {
  it('runs all steps in order', async () => {
    const order: number[] = [];
    await runShutdownSequence([
      async () => { order.push(1); },
      async () => { order.push(2); },
      async () => { order.push(3); },
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('resolves when all steps succeed', async () => {
    await expect(
      runShutdownSequence([
        async () => { /* prisma disconnect stub */ },
        async () => { /* redis quit stub */ },
      ]),
    ).resolves.toBeUndefined();
  });

  it('rejects when a step throws', async () => {
    await expect(
      runShutdownSequence([
        async () => { throw new Error('DB close failed'); },
      ]),
    ).rejects.toThrow('DB close failed');
  });

  it('rejects with timeout error when sequence exceeds timeoutMs', async () => {
    vi.useFakeTimers();
    const hanging = new Promise<void>(() => { /* never resolves */ });
    const promise = runShutdownSequence(
      [() => hanging],
      { timeoutMs: 1_000 },
    );
    vi.advanceTimersByTime(1_001);
    await expect(promise).rejects.toThrow('timed out');
    vi.useRealTimers();
  });
});
