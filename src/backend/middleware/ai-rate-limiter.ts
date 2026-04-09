// ============================================================
// CapitalForge — AI Endpoint Rate Limiter
//
// Specialized rate limiting for AI-powered endpoints.
// Uses @upstash/ratelimit when UPSTASH_REDIS_REST_URL is set,
// otherwise falls back to an in-memory sliding window.
//
// Exported middleware:
//   chatRateLimiter         — 20 requests / minute
//   documentGenRateLimiter  — 50 requests / hour
//   optimizerRateLimiter    — 100 requests / hour
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix epoch ms
}

interface RateLimiterBackend {
  limit(key: string): Promise<RateLimitResult>;
}

interface WindowConfig {
  /** Maximum requests allowed in the window */
  tokens: number;
  /** Window duration as a string (e.g. "1 m", "1 h") for Upstash, or ms for in-memory */
  window: string;
  /** Window duration in milliseconds (used by in-memory fallback) */
  windowMs: number;
}

// ── Window presets ───────────────────────────────────────────────────────────

const WINDOWS = {
  chat:         { tokens: 20,  window: '1 m',  windowMs: 60_000 }       satisfies WindowConfig,
  documentGen:  { tokens: 50,  window: '1 h',  windowMs: 3_600_000 }    satisfies WindowConfig,
  optimizer:    { tokens: 100, window: '1 h',  windowMs: 3_600_000 }    satisfies WindowConfig,
} as const;

// ── In-memory sliding window limiter ─────────────────────────────────────────

class InMemoryRateLimiter implements RateLimiterBackend {
  private windows = new Map<string, { timestamps: number[] }>();
  private readonly config: WindowConfig;

  constructor(config: WindowConfig) {
    this.config = config;

    // Periodically prune stale entries to avoid unbounded memory growth
    setInterval(() => this.prune(), this.config.windowMs * 2).unref();
  }

  async limit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    // Drop timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    const remaining = Math.max(0, this.config.tokens - entry.timestamps.length - 1);
    const success = entry.timestamps.length < this.config.tokens;

    if (success) {
      entry.timestamps.push(now);
    }

    return {
      success,
      limit: this.config.tokens,
      remaining: success ? remaining : 0,
      reset: now + this.config.windowMs,
    };
  }

  private prune(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [key, entry] of this.windows.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      if (entry.timestamps.length === 0) {
        this.windows.delete(key);
      }
    }
  }
}

// ── Upstash-backed limiter (lazy-loaded) ─────────────────────────────────────

let upstashAvailable: boolean | null = null;

async function createUpstashLimiter(config: WindowConfig): Promise<RateLimiterBackend | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  try {
    const { Ratelimit } = await import('@upstash/ratelimit');
    const { Redis } = await import('@upstash/redis');

    const redis = new Redis({ url, token });
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.tokens, config.window as Parameters<typeof Ratelimit.slidingWindow>[1]),
      analytics: true,
      prefix: 'capitalforge:ai-rl',
    });

    return {
      async limit(key: string): Promise<RateLimitResult> {
        const result = await ratelimit.limit(key);
        return {
          success: result.success,
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
        };
      },
    };
  } catch (err) {
    logger.warn('[AI-RateLimiter] Failed to initialise Upstash — falling back to in-memory', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ── Limiter cache (one instance per window preset) ───────────────────────────

const limiterCache = new Map<string, RateLimiterBackend>();

async function getLimiter(name: string, config: WindowConfig): Promise<RateLimiterBackend> {
  const cached = limiterCache.get(name);
  if (cached) return cached;

  // Try Upstash first (only probe once)
  if (upstashAvailable === null) {
    const probe = await createUpstashLimiter(config);
    upstashAvailable = probe !== null;
    if (probe) {
      limiterCache.set(name, probe);
      logger.info('[AI-RateLimiter] Using Upstash Redis backend', { preset: name });
      return probe;
    }
    logger.info('[AI-RateLimiter] Upstash not configured — using in-memory backend');
  }

  if (upstashAvailable) {
    const upstash = await createUpstashLimiter(config);
    if (upstash) {
      limiterCache.set(name, upstash);
      return upstash;
    }
  }

  // Fallback: in-memory
  const mem = new InMemoryRateLimiter(config);
  limiterCache.set(name, mem);
  return mem;
}

// ── Middleware factory ────────────────────────────────────────────────────────

function createAiRateLimiter(presetName: string, config: WindowConfig) {
  return async function aiRateLimiter(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const identifier =
      req.tenant?.tenantId ??
      (req as Request & { userId?: string }).userId ??
      req.ip ??
      'anonymous';

    const key = `${presetName}:${identifier}`;

    try {
      const limiter = await getLimiter(presetName, config);
      const result = await limiter.limit(key);

      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.reset / 1000));

      if (!result.success) {
        const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
        res.setHeader('Retry-After', retryAfter);

        logger.warn('[AI-RateLimiter] Rate limit exceeded', {
          preset: presetName,
          identifier,
          limit: result.limit,
          path: req.path,
          method: req.method,
        });

        const body: ApiResponse = {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `AI rate limit exceeded (${presetName}). Retry after ${retryAfter} seconds.`,
          },
        };
        res.status(429).json(body);
        return;
      }

      next();
    } catch (err) {
      logger.error('[AI-RateLimiter] Unexpected error — allowing request through', {
        preset: presetName,
        error: err instanceof Error ? err.message : String(err),
      });
      next();
    }
  };
}

// ── Exported middleware instances ─────────────────────────────────────────────

/** 20 requests per minute — for AI chat endpoints */
export const chatRateLimiter = createAiRateLimiter('chat', WINDOWS.chat);

/** 50 requests per hour — for AI document generation endpoints */
export const documentGenRateLimiter = createAiRateLimiter('documentGen', WINDOWS.documentGen);

/** 100 requests per hour — for AI optimizer endpoints */
export const optimizerRateLimiter = createAiRateLimiter('optimizer', WINDOWS.optimizer);
