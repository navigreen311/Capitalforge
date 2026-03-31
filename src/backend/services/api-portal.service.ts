// ============================================================
// CapitalForge — API Portal Service
// API key management, webhook subscriptions, rate limiting,
// health/observability metrics per tenant.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// ── Types ────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;       // first 8 chars shown in UI
  keyHash: string;         // SHA-256 of full key stored in DB
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  revokedAt?: Date;
}

export interface ApiKeyWithSecret extends ApiKey {
  secret: string;          // full key — only returned on creation
}

export interface WebhookSubscription {
  id: string;
  tenantId: string;
  url: string;
  events: string[];        // e.g. ['application.approved', 'backup.completed']
  signingSecret: string;
  isActive: boolean;
  failureCount: number;
  deadLetterCount: number;
  createdAt: Date;
  lastDeliveryAt?: Date;
  lastDeliveryStatus?: 'success' | 'failed';
}

export interface RateLimitConfig {
  tenantId: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  burstAllowance: number;
  updatedAt: Date;
}

export interface HealthMetrics {
  status: 'healthy' | 'degraded' | 'down';
  uptimePercent: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRatePct: number;
  jobQueueDepth: number;
  jobQueueProcessingRate: number; // jobs/sec
  checkedAt: Date;
}

export interface TenantObservabilityMetrics {
  tenantId: string;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  activeApiKeys: number;
  webhookDeliveries: number;
  webhookFailures: number;
  periodStart: Date;
  periodEnd: Date;
}

// ── In-memory stores (replace with DB in production) ─────────

const apiKeys    = new Map<string, ApiKey>();
const webhooks   = new Map<string, WebhookSubscription>();
const rateLimits = new Map<string, RateLimitConfig>();

// Request counter per tenant for metrics (sliding window stub)
const requestCounters = new Map<string, { total: number; success: number; failed: number; latencies: number[] }>();

// ── Defaults ─────────────────────────────────────────────────

const DEFAULT_RATE_LIMIT: Omit<RateLimitConfig, 'tenantId' | 'updatedAt'> = {
  requestsPerMinute: 120,
  requestsPerDay:    10_000,
  burstAllowance:    30,
};

// ============================================================
// API Key Management
// ============================================================

export function generateApiKey(
  tenantId: string,
  name: string,
  scopes: string[] = ['read'],
  expiresAt?: Date,
): ApiKeyWithSecret {
  const rawSecret = `cf_${uuidv4().replace(/-/g, '')}`;
  const keyHash   = crypto.createHash('sha256').update(rawSecret).digest('hex');
  const keyPrefix = rawSecret.slice(0, 12);

  const key: ApiKey = {
    id:        uuidv4(),
    tenantId,
    name,
    keyPrefix,
    keyHash,
    scopes,
    isActive:  true,
    expiresAt,
    createdAt: new Date(),
  };
  apiKeys.set(key.id, key);

  return { ...key, secret: rawSecret };
}

export function listApiKeys(tenantId: string): ApiKey[] {
  return Array.from(apiKeys.values()).filter((k) => k.tenantId === tenantId && !k.revokedAt);
}

export function getApiKey(id: string): ApiKey | undefined {
  return apiKeys.get(id);
}

export function revokeApiKey(id: string): ApiKey {
  const key = apiKeys.get(id);
  if (!key) throw new Error(`API key ${id} not found`);
  key.isActive  = false;
  key.revokedAt = new Date();
  apiKeys.set(id, key);
  return key;
}

/**
 * Validate a raw API key string. Returns the key record if valid.
 * In production: look up by keyPrefix then compare hash.
 */
export function validateApiKey(rawKey: string): ApiKey | null {
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
  for (const key of apiKeys.values()) {
    if (key.keyHash === hash && key.isActive) {
      if (key.expiresAt && key.expiresAt < new Date()) return null;
      key.lastUsedAt = new Date();
      return key;
    }
  }
  return null;
}

// ============================================================
// Webhook Subscriptions
// ============================================================

export function createWebhookSubscription(
  tenantId: string,
  url: string,
  events: string[],
): WebhookSubscription {
  const sub: WebhookSubscription = {
    id:              uuidv4(),
    tenantId,
    url,
    events,
    signingSecret:   `whsec_${uuidv4().replace(/-/g, '')}`,
    isActive:        true,
    failureCount:    0,
    deadLetterCount: 0,
    createdAt:       new Date(),
  };
  webhooks.set(sub.id, sub);
  return sub;
}

export function listWebhookSubscriptions(tenantId: string): WebhookSubscription[] {
  return Array.from(webhooks.values()).filter((s) => s.tenantId === tenantId);
}

export function deleteWebhookSubscription(id: string): void {
  if (!webhooks.has(id)) throw new Error(`Webhook ${id} not found`);
  webhooks.delete(id);
}

export function recordWebhookDelivery(id: string, success: boolean): void {
  const sub = webhooks.get(id);
  if (!sub) return;
  sub.lastDeliveryAt     = new Date();
  sub.lastDeliveryStatus = success ? 'success' : 'failed';
  if (!success) {
    sub.failureCount += 1;
    if (sub.failureCount >= 5) {
      sub.deadLetterCount += 1;
    }
  }
  webhooks.set(id, sub);
}

// ============================================================
// Rate Limiting
// ============================================================

export function getRateLimitConfig(tenantId: string): RateLimitConfig {
  const existing = rateLimits.get(tenantId);
  if (existing) return existing;

  const config: RateLimitConfig = {
    tenantId,
    ...DEFAULT_RATE_LIMIT,
    updatedAt: new Date(),
  };
  rateLimits.set(tenantId, config);
  return config;
}

export function updateRateLimitConfig(
  tenantId: string,
  patch: Partial<Omit<RateLimitConfig, 'tenantId' | 'updatedAt'>>,
): RateLimitConfig {
  const current = getRateLimitConfig(tenantId);
  const updated: RateLimitConfig = { ...current, ...patch, updatedAt: new Date() };
  rateLimits.set(tenantId, updated);
  return updated;
}

// ============================================================
// Request Telemetry
// ============================================================

export function recordRequest(tenantId: string, latencyMs: number, success: boolean): void {
  const counter = requestCounters.get(tenantId) ?? { total: 0, success: 0, failed: 0, latencies: [] };
  counter.total        += 1;
  counter.latencies.push(latencyMs);
  if (success) counter.success += 1;
  else counter.failed          += 1;
  // Keep only last 1000 latency samples for percentile calc
  if (counter.latencies.length > 1000) counter.latencies.shift();
  requestCounters.set(tenantId, counter);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ============================================================
// Health / Observability
// ============================================================

export function getHealthMetrics(): HealthMetrics {
  // STUB — in production aggregate from job queue, DB pool, error tracking
  const allLatencies = Array.from(requestCounters.values())
    .flatMap((c) => c.latencies)
    .sort((a, b) => a - b);

  const totalReqs  = Array.from(requestCounters.values()).reduce((s, c) => s + c.total, 0);
  const failedReqs = Array.from(requestCounters.values()).reduce((s, c) => s + c.failed, 0);

  return {
    status:                  'healthy',
    uptimePercent:           99.94,
    p50LatencyMs:            percentile(allLatencies, 50) || 42,
    p95LatencyMs:            percentile(allLatencies, 95) || 180,
    p99LatencyMs:            percentile(allLatencies, 99) || 420,
    errorRatePct:            totalReqs > 0 ? (failedReqs / totalReqs) * 100 : 0,
    jobQueueDepth:           3,       // STUB — replace with bull/bullmq queue.getWaiting().length
    jobQueueProcessingRate:  12.5,    // STUB — jobs/sec from queue metrics
    checkedAt:               new Date(),
  };
}

export function getTenantMetrics(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
): TenantObservabilityMetrics {
  const counter = requestCounters.get(tenantId) ?? { total: 0, success: 0, failed: 0, latencies: [] };
  const avgLatency = counter.latencies.length
    ? counter.latencies.reduce((a, b) => a + b, 0) / counter.latencies.length
    : 0;

  const tenantWebhooks = listWebhookSubscriptions(tenantId);
  const webhookDeliveries = tenantWebhooks.reduce((s, w) => s + (w.failureCount + (w.deadLetterCount === 0 ? 0 : 0)), 0);
  const webhookFailures   = tenantWebhooks.reduce((s, w) => s + w.failureCount, 0);

  return {
    tenantId,
    totalRequests:    counter.total,
    successRequests:  counter.success,
    failedRequests:   counter.failed,
    avgLatencyMs:     Math.round(avgLatency),
    activeApiKeys:    listApiKeys(tenantId).filter((k) => k.isActive).length,
    webhookDeliveries,
    webhookFailures,
    periodStart,
    periodEnd,
  };
}

export const apiPortalService = {
  generateApiKey,
  listApiKeys,
  getApiKey,
  revokeApiKey,
  validateApiKey,
  createWebhookSubscription,
  listWebhookSubscriptions,
  deleteWebhookSubscription,
  recordWebhookDelivery,
  getRateLimitConfig,
  updateRateLimitConfig,
  recordRequest,
  getHealthMetrics,
  getTenantMetrics,
};
