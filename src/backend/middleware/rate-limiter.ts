// ============================================================
// CapitalForge — Token Bucket Rate Limiter
//
// Per-tenant rate limiting backed by Redis.
// Limits are drawn from SaaS plan entitlements:
//   starter:    60 req/min
//   pro:        300 req/min
//   enterprise: 1000 req/min
//
// Returns 429 + Retry-After header on breach.
// Sets X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset.
// Health check paths are bypassed unconditionally.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import logger from '../config/logger.js';
import type { ApiResponse } from '@shared/types/index.js';

// ── Plan rate limits (requests per minute) ────────────────────────────────────

const PLAN_LIMITS: Record<string, number> = {
  starter:    60,
  pro:        300,
  professional: 300,
  enterprise: 1000,
  reseller:   1000,
};

const DEFAULT_LIMIT = 60;
const WINDOW_SECONDS = 60;

// ── Paths bypassed regardless of auth ────────────────────────────────────────

const BYPASS_PATHS = new Set([
  '/api/health',
  '/api/health/ready',
  '/health',
  '/health/ready',
]);

// ── Redis client (singleton, lazy-connected) ──────────────────────────────────

let redisClient: Redis | null = null;
let redisConnected = false;

async function getRedis(): Promise<Redis | null> {
  if (redisClient && redisConnected) return redisClient;

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

    redisClient.on('error', (err) => {
      logger.warn('[RateLimiter] Redis error — rate limiting degraded', {
        error: err instanceof Error ? err.message : String(err),
      });
      redisConnected = false;
    });

    redisClient.on('ready', () => {
      redisConnected = true;
    });

    await redisClient.connect();
    redisConnected = true;
    return redisClient;
  } catch (err) {
    logger.warn('[RateLimiter] Failed to connect to Redis — bypassing rate limiting', {
      error: err instanceof Error ? err.message : String(err),
    });
    redisConnected = false;
    return null;
  }
}

// ── Token bucket via Redis atomic INCR + EXPIRE ───────────────────────────────

interface BucketResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // Unix epoch seconds
}

async function checkBucket(
  redis: Redis,
  key: string,
  limit: number,
): Promise<BucketResult> {
  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + WINDOW_SECONDS;

  // Lua script — atomic increment + set expiry on first request
  const luaScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('TTL', KEYS[1])
    return {current, ttl}
  `;

  const result = await redis.eval(luaScript, 1, key, String(WINDOW_SECONDS)) as [number, number];

  const count = result[0];
  const ttl = result[1];
  const remaining = Math.max(0, limit - count);
  const actualReset = ttl > 0 ? now + ttl : resetAt;

  return {
    allowed: count <= limit,
    remaining,
    limit,
    resetAt: actualReset,
  };
}

// ── Resolve plan-specific limit from tenant context ───────────────────────────

function resolveLimit(req: Request): number {
  const plan = (req.tenant as (typeof req.tenant & { plan?: string }) | undefined)?.plan;
  if (plan && PLAN_LIMITS[plan.toLowerCase()]) {
    return PLAN_LIMITS[plan.toLowerCase()];
  }
  return DEFAULT_LIMIT;
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Per-tenant token bucket rate limiter.
 *
 * Mount AFTER auth/tenant middleware so req.tenant is populated.
 * Falls back gracefully if Redis is unavailable (allows through).
 */
export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Bypass health check endpoints
  const path = req.path.replace(/\/+$/, '') || '/';
  if (BYPASS_PATHS.has(path)) {
    next();
    return;
  }

  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    // No tenant context — pass through (auth middleware handles unauthorized)
    next();
    return;
  }

  const redis = await getRedis();

  if (!redis) {
    // Redis unavailable — fail open to avoid blocking all traffic
    logger.warn('[RateLimiter] Redis unavailable, skipping rate limit check', { tenantId });
    next();
    return;
  }

  const limit = resolveLimit(req);
  const windowKey = `rl:${tenantId}:${Math.floor(Date.now() / 1000 / WINDOW_SECONDS)}`;

  try {
    const bucket = await checkBucket(redis, windowKey, limit);

    // Set X-RateLimit-* headers on every response
    res.setHeader('X-RateLimit-Limit',     bucket.limit);
    res.setHeader('X-RateLimit-Remaining', bucket.remaining);
    res.setHeader('X-RateLimit-Reset',     bucket.resetAt);

    if (!bucket.allowed) {
      const retryAfter = Math.max(1, bucket.resetAt - Math.floor(Date.now() / 1000));

      res.setHeader('Retry-After', retryAfter);

      logger.warn('[RateLimiter] Rate limit exceeded', {
        tenantId,
        limit,
        path: req.path,
        method: req.method,
      });

      const body: ApiResponse = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. You may retry after ${retryAfter} seconds.`,
        },
      };
      res.status(429).json(body);
      return;
    }

    next();
  } catch (err) {
    logger.error('[RateLimiter] Unexpected error — allowing request through', {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    next();
  }
}

/**
 * Factory that returns a rate limiter middleware pre-configured with
 * a custom limit (overrides plan-based limit). Useful for specific
 * routes that warrant tighter or looser limits.
 */
export function createRateLimiter(limitPerMinute: number) {
  return async function fixedRateLimiter(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const path = req.path.replace(/\/+$/, '') || '/';
    if (BYPASS_PATHS.has(path)) {
      next();
      return;
    }

    const tenantId = req.tenant?.tenantId ?? req.ip ?? 'anonymous';
    const redis = await getRedis();

    if (!redis) {
      next();
      return;
    }

    const windowKey = `rl:fixed:${tenantId}:${Math.floor(Date.now() / 1000 / WINDOW_SECONDS)}`;

    try {
      const bucket = await checkBucket(redis, windowKey, limitPerMinute);

      res.setHeader('X-RateLimit-Limit',     bucket.limit);
      res.setHeader('X-RateLimit-Remaining', bucket.remaining);
      res.setHeader('X-RateLimit-Reset',     bucket.resetAt);

      if (!bucket.allowed) {
        const retryAfter = Math.max(1, bucket.resetAt - Math.floor(Date.now() / 1000));
        res.setHeader('Retry-After', retryAfter);

        const body: ApiResponse = {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
          },
        };
        res.status(429).json(body);
        return;
      }

      next();
    } catch {
      next();
    }
  };
}
