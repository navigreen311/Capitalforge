// ============================================================
// CapitalForge — Circuit Breaker
// Implements the standard CLOSED → OPEN → HALF_OPEN state
// machine to protect calls to external APIs (Plaid, Stripe,
// DocuSign, credit bureaus) from cascading failures.
//
// States:
//   CLOSED    — normal operation; failures are counted.
//   OPEN      — circuit tripped; calls rejected immediately.
//   HALF_OPEN — trial period; limited calls allowed to probe
//               whether the upstream has recovered.
// ============================================================

import logger from '../config/logger.js';

// ── Types ─────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Milliseconds to wait in OPEN state before moving to HALF_OPEN. Default: 30_000 */
  resetTimeoutMs?: number;
  /** Max call attempts allowed in HALF_OPEN state. Default: 3 */
  halfOpenMaxAttempts?: number;
  /** Human-readable name for logging / metrics. */
  name?: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: Date | null;
  lastStateChangeAt: Date;
  totalCalls: number;
  rejectedCalls: number;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker [${name}] is OPEN — call rejected.`);
    this.name = 'CircuitOpenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Implementation ────────────────────────────────────────────

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;

  private state: CircuitState = 'CLOSED';
  private failureCount  = 0;
  private successCount  = 0;
  private halfOpenCalls = 0;
  private lastFailureAt: Date | null = null;
  private lastStateChangeAt: Date = new Date();
  private openedAt: number | null = null;
  private totalCalls   = 0;
  private rejectedCalls = 0;

  constructor(options: CircuitBreakerOptions = {}) {
    this.name                = options.name               ?? 'CircuitBreaker';
    this.failureThreshold    = options.failureThreshold   ?? 5;
    this.resetTimeoutMs      = options.resetTimeoutMs     ?? 30_000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 3;
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Executes `fn` through the circuit breaker.
   * - CLOSED: calls fn; on failure increments counter.
   * - OPEN: throws CircuitOpenError immediately.
   * - HALF_OPEN: allows up to halfOpenMaxAttempts; success resets, failure re-opens.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;
    this.evaluateStateTransition();

    if (this.state === 'OPEN') {
      this.rejectedCalls++;
      logger.warn(`[CircuitBreaker:${this.name}] Call rejected — circuit is OPEN`, {
        failures: this.failureCount,
        openedAt: this.openedAt,
      });
      throw new CircuitOpenError(this.name);
    }

    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenCalls >= this.halfOpenMaxAttempts) {
        this.rejectedCalls++;
        throw new CircuitOpenError(this.name);
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err as Error);
      throw err;
    }
  }

  /** Current state of the circuit. */
  getState(): CircuitState {
    this.evaluateStateTransition();
    return this.state;
  }

  /** Snapshot of internal counters for monitoring / health checks. */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      lastFailureAt: this.lastFailureAt,
      lastStateChangeAt: this.lastStateChangeAt,
      totalCalls: this.totalCalls,
      rejectedCalls: this.rejectedCalls,
    };
  }

  /** Manually reset the circuit to CLOSED (useful for testing / admin resets). */
  reset(): void {
    this.transitionTo('CLOSED');
    this.failureCount  = 0;
    this.successCount  = 0;
    this.halfOpenCalls = 0;
    this.openedAt      = null;
    this.lastFailureAt = null;
  }

  // ── Private state machine ────────────────────────────────

  private evaluateStateTransition(): void {
    if (this.state === 'OPEN' && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
        this.halfOpenCalls = 0;
      }
    }
  }

  private onSuccess(): void {
    this.successCount++;

    if (this.state === 'HALF_OPEN') {
      // Full probe attempt succeeded — circuit recovers
      logger.info(`[CircuitBreaker:${this.name}] Recovered — transitioning HALF_OPEN → CLOSED`);
      this.transitionTo('CLOSED');
      this.failureCount  = 0;
      this.halfOpenCalls = 0;
      this.openedAt      = null;
    } else if (this.state === 'CLOSED') {
      // Reset consecutive failure count on any success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(err: Error): void {
    this.failureCount++;
    this.lastFailureAt = new Date();

    logger.warn(`[CircuitBreaker:${this.name}] Failure recorded`, {
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      state: this.state,
      error: err.message,
    });

    if (this.state === 'HALF_OPEN') {
      // A failure during trial re-opens immediately
      logger.error(`[CircuitBreaker:${this.name}] Probe failed — re-opening circuit`);
      this.transitionTo('OPEN');
      this.openedAt      = Date.now();
      this.halfOpenCalls = 0;
      return;
    }

    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      logger.error(`[CircuitBreaker:${this.name}] Threshold reached — opening circuit`, {
        failureCount: this.failureCount,
      });
      this.transitionTo('OPEN');
      this.openedAt = Date.now();
    }
  }

  private transitionTo(next: CircuitState): void {
    if (this.state !== next) {
      logger.info(`[CircuitBreaker:${this.name}] State transition: ${this.state} → ${next}`);
      this.state             = next;
      this.lastStateChangeAt = new Date();
    }
  }
}

// ── Registry ─────────────────────────────────────────────────
// Maintains singleton breakers keyed by service name so callers
// share state across the process lifetime.

const registry = new Map<string, CircuitBreaker>();

/**
 * Returns (or creates) a named circuit breaker.
 *
 * Usage:
 *   const cb = getCircuitBreaker('plaid', { failureThreshold: 3 });
 *   const data = await cb.execute(() => plaidClient.getAccounts(req));
 */
export function getCircuitBreaker(
  name: string,
  options?: Omit<CircuitBreakerOptions, 'name'>,
): CircuitBreaker {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker({ ...options, name }));
  }
  return registry.get(name)!;
}

/** Resets all registered circuit breakers (useful between tests). */
export function resetAllCircuitBreakers(): void {
  registry.forEach((cb) => cb.reset());
  registry.clear();
}
