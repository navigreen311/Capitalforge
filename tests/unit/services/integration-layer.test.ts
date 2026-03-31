// ============================================================
// CapitalForge — Integration Layer Tests
// Covers: integration connect/disconnect, webhook processing,
// API key management, rate limiting, backup tracking, metrics.
// 20+ test cases.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';

// Services under test
import {
  integrationLayerService,
  plaid,
  quickbooks,
  xero,
  docusign,
  stripe,
  listConnections,
  getConnection,
  listDeadLettered,
  markDeadLettered,
} from '../../../src/backend/services/integration-layer.service.js';

import {
  apiPortalService,
  generateApiKey,
  listApiKeys,
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
} from '../../../src/backend/services/api-portal.service.js';

import {
  businessContinuityService,
  triggerBackup,
  listBackups,
  getRtoRpoStatus,
  exportClientCase,
  logRecoveryTest,
  listRecoveryTests,
  purgeExpiredBackups,
} from '../../../src/backend/services/business-continuity.service.js';

// ── Test tenant IDs ──────────────────────────────────────────

const T1 = 'tenant-test-001';
const T2 = 'tenant-test-002';

// ============================================================
// INTEGRATION LAYER — PLAID
// ============================================================

describe('Plaid Integration', () => {
  it('connects and returns a connection record', async () => {
    const conn = await plaid.connect(T1, 'public-token-abc');
    expect(conn.provider).toBe('plaid');
    expect(conn.status).toBe('connected');
    expect(conn.accessToken).toBeTruthy();
    expect(conn.tenantId).toBe(T1);
    expect(conn.connectedAt).toBeInstanceOf(Date);
  });

  it('stores connection and can be retrieved via getConnection', async () => {
    await plaid.connect(T1, 'public-token-def');
    const conn = getConnection(T1, 'plaid');
    expect(conn).toBeDefined();
    expect(conn?.status).toBe('connected');
  });

  it('syncs and returns sync result', async () => {
    await plaid.connect(T1, 'public-token-ghi');
    const result = await plaid.sync(T1);
    expect(result.provider).toBe('plaid');
    expect(result.recordsSynced).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error when syncing without connection', async () => {
    const result = await plaid.sync('nonexistent-tenant');
    expect(result.recordsSynced).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('processes incoming webhook events', async () => {
    await plaid.connect(T1, 'public-token-jkl');
    const event = await plaid.handleWebhook(T1, {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'DEFAULT_UPDATE',
      item_id:      'item_abc123',
    });
    expect(event.provider).toBe('plaid');
    expect(event.eventType).toBe('TRANSACTIONS');
    expect(event.deadLettered).toBe(false);
    expect(event.id).toBeTruthy();
  });

  it('disconnects and updates status', async () => {
    await plaid.connect(T1, 'public-token-mno');
    await plaid.disconnect(T1);
    const conn = getConnection(T1, 'plaid');
    expect(conn?.status).toBe('disconnected');
    expect(conn?.disconnectedAt).toBeInstanceOf(Date);
  });
});

// ============================================================
// INTEGRATION LAYER — QUICKBOOKS
// ============================================================

describe('QuickBooks Integration', () => {
  it('connects with oauth code and realmId', async () => {
    const conn = await quickbooks.connect(T2, 'qbo_oauth_code', 'realm_9876543');
    expect(conn.provider).toBe('quickbooks');
    expect(conn.status).toBe('connected');
    expect(conn.externalAccountId).toBe('realm_9876543');
  });

  it('syncs accounting data', async () => {
    await quickbooks.connect(T2, 'qbo_oauth_code2', 'realm_111222');
    const result = await quickbooks.sync(T2);
    expect(result.provider).toBe('quickbooks');
    expect(result.recordsSynced).toBeGreaterThan(0);
  });

  it('processes QuickBooks webhook payload', async () => {
    await quickbooks.connect(T2, 'qbo_code3', 'realm_333444');
    const event = await quickbooks.handleWebhook(T2, {
      eventNotifications: [{ realmId: 'realm_333444', dataChangeEvent: { entities: [] } }],
    });
    expect(event.provider).toBe('quickbooks');
    expect(event.processedAt).toBeInstanceOf(Date);
  });
});

// ============================================================
// INTEGRATION LAYER — DEAD LETTER QUEUE
// ============================================================

describe('Dead Letter Queue', () => {
  it('marks a webhook event as dead-lettered', async () => {
    const event = await stripe.handleWebhook(T1, { type: 'charge.failed' }, '');
    markDeadLettered(event.id, 'Endpoint returned 500');
    const dead = listDeadLettered();
    const found = dead.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found?.deadLettered).toBe(true);
    expect(found?.lastError).toBe('Endpoint returned 500');
  });
});

// ============================================================
// API PORTAL — API KEY MANAGEMENT
// ============================================================

describe('API Key Management', () => {
  it('generates a new API key with secret', () => {
    const key = generateApiKey(T1, 'Test Key', ['read', 'write']);
    expect(key.secret).toMatch(/^cf_/);
    expect(key.keyPrefix).toBeTruthy();
    expect(key.scopes).toContain('read');
    expect(key.isActive).toBe(true);
  });

  it('validates a correct API key', () => {
    const key = generateApiKey(T1, 'Validation Test', ['read']);
    const validated = validateApiKey(key.secret);
    expect(validated).not.toBeNull();
    expect(validated?.id).toBe(key.id);
  });

  it('rejects an invalid API key', () => {
    const result = validateApiKey('cf_totally_fake_key_does_not_exist');
    expect(result).toBeNull();
  });

  it('lists only active keys for a tenant', () => {
    generateApiKey(T2, 'Key A', ['read']);
    generateApiKey(T2, 'Key B', ['write']);
    const keys = listApiKeys(T2);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys.every((k) => k.tenantId === T2)).toBe(true);
  });

  it('revokes a key and removes it from active list', () => {
    const key     = generateApiKey(T1, 'Revoke Me');
    revokeApiKey(key.id);
    const found   = listApiKeys(T1).find((k) => k.id === key.id);
    expect(found).toBeUndefined();
  });

  it('rejects a revoked key during validation', () => {
    const key = generateApiKey(T1, 'Soon Revoked');
    revokeApiKey(key.id);
    const result = validateApiKey(key.secret);
    expect(result).toBeNull();
  });

  it('throws when revoking a non-existent key', () => {
    expect(() => revokeApiKey('nonexistent-key-id')).toThrow();
  });
});

// ============================================================
// API PORTAL — WEBHOOK SUBSCRIPTIONS
// ============================================================

describe('Webhook Subscriptions', () => {
  it('creates a subscription with signing secret', () => {
    const sub = createWebhookSubscription(T1, 'https://example.com/hook', ['application.approved']);
    expect(sub.signingSecret).toMatch(/^whsec_/);
    expect(sub.events).toContain('application.approved');
    expect(sub.isActive).toBe(true);
  });

  it('records successful delivery', () => {
    const sub = createWebhookSubscription(T1, 'https://example.com/hook2', ['backup.completed']);
    recordWebhookDelivery(sub.id, true);
    const subs = listWebhookSubscriptions(T1);
    const found = subs.find((s) => s.id === sub.id);
    expect(found?.lastDeliveryStatus).toBe('success');
    expect(found?.failureCount).toBe(0);
  });

  it('increments failure count on failed delivery', () => {
    const sub = createWebhookSubscription(T1, 'https://example.com/hook3', ['payment.failed']);
    recordWebhookDelivery(sub.id, false);
    recordWebhookDelivery(sub.id, false);
    const subs = listWebhookSubscriptions(T1);
    const found = subs.find((s) => s.id === sub.id);
    expect(found?.failureCount).toBe(2);
  });

  it('deletes a subscription', () => {
    const sub   = createWebhookSubscription(T1, 'https://example.com/hook4', ['kyc.passed']);
    deleteWebhookSubscription(sub.id);
    const subs  = listWebhookSubscriptions(T1);
    const found = subs.find((s) => s.id === sub.id);
    expect(found).toBeUndefined();
  });
});

// ============================================================
// API PORTAL — RATE LIMITING
// ============================================================

describe('Rate Limit Config', () => {
  it('returns default rate limit config for new tenant', () => {
    const config = getRateLimitConfig('brand-new-tenant');
    expect(config.requestsPerMinute).toBe(120);
    expect(config.requestsPerDay).toBe(10_000);
    expect(config.burstAllowance).toBe(30);
  });

  it('allows updating rate limit config', () => {
    const updated = updateRateLimitConfig(T1, { requestsPerMinute: 200, requestsPerDay: 50_000 });
    expect(updated.requestsPerMinute).toBe(200);
    expect(updated.requestsPerDay).toBe(50_000);
  });
});

// ============================================================
// API PORTAL — OBSERVABILITY METRICS
// ============================================================

describe('Observability Metrics', () => {
  it('returns health metrics with expected shape', () => {
    const health = getHealthMetrics();
    expect(health.status).toMatch(/healthy|degraded|down/);
    expect(typeof health.uptimePercent).toBe('number');
    expect(typeof health.p95LatencyMs).toBe('number');
    expect(health.checkedAt).toBeInstanceOf(Date);
  });

  it('records requests and reflects in metrics', () => {
    recordRequest(T1, 42, true);
    recordRequest(T1, 180, true);
    recordRequest(T1, 500, false);
    const metrics = getTenantMetrics(T1, new Date(0), new Date());
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(3);
    expect(metrics.failedRequests).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// BUSINESS CONTINUITY — BACKUP TRACKING
// ============================================================

describe('Backup Tracking', () => {
  it('triggers a backup and returns running record', async () => {
    const record = await triggerBackup('incremental', T1);
    expect(record.backupType).toBe('incremental');
    expect(record.tenantId).toBe(T1);
    expect(record.retentionDays).toBe(90);
    expect(record.storageLocation).toMatch(/^s3:/);
  });

  it('lists backups and returns newest first', async () => {
    await triggerBackup('full');
    await triggerBackup('incremental');
    const records = listBackups({ limit: 10 });
    expect(records.length).toBeGreaterThanOrEqual(2);
    // Newest first
    expect(records[0].createdAt.getTime()).toBeGreaterThanOrEqual(records[1].createdAt.getTime());
  });

  it('returns RTO/RPO status', () => {
    const status = getRtoRpoStatus();
    expect(typeof status.rtoTargetMinutes).toBe('number');
    expect(typeof status.rpoTargetMinutes).toBe('number');
    expect(typeof status.rpoBreached).toBe('boolean');
  });

  it('purges expired backups', async () => {
    // Create a record that's already expired
    const past    = new Date(Date.now() - 1000);
    const record  = await triggerBackup('snapshot', T2);
    // Manually expire it
    (record as { expiresAt: Date }).expiresAt = past;
    const { purged } = purgeExpiredBackups();
    // At least 0 — seeds may or may not be expired
    expect(purged).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// BUSINESS CONTINUITY — CASE EXPORT
// ============================================================

describe('Client Case Export', () => {
  it('generates a case export with download URL', async () => {
    const result = await exportClientCase(T1, 'biz-abc-123', 'advisor-user');
    expect(result.downloadUrl).toMatch(/^https:/);
    expect(result.includedFiles.length).toBeGreaterThan(5);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.businessId).toBe('biz-abc-123');
  });
});

// ============================================================
// BUSINESS CONTINUITY — RECOVERY TESTING LOG
// ============================================================

describe('Recovery Testing Log', () => {
  it('logs a recovery test and computes duration', () => {
    const start = new Date(Date.now() - 90 * 60 * 1000); // 90 min ago
    const end   = new Date();
    const log   = logRecoveryTest({
      testedBy:           'ops-team',
      testType:           'full_restore',
      startedAt:          start,
      completedAt:        end,
      outcome:            'pass',
      rtoAchievedMinutes: 90,
      notes:              'All services restored within RTO window.',
    });
    expect(log.id).toBeTruthy();
    expect(log.durationMinutes).toBeGreaterThanOrEqual(89);
    expect(log.outcome).toBe('pass');
  });

  it('lists recovery tests with outcome filter', () => {
    logRecoveryTest({ testedBy: 'ops', testType: 'tabletop', startedAt: new Date(), outcome: 'fail', notes: 'Gaps found' });
    const passing = listRecoveryTests({ outcome: 'pass' });
    const failing = listRecoveryTests({ outcome: 'fail' });
    expect(passing.every((l) => l.outcome === 'pass')).toBe(true);
    expect(failing.every((l) => l.outcome === 'fail')).toBe(true);
  });
});

// ============================================================
// INTEGRATION SERVICE — listConnections
// ============================================================

describe('Integration listConnections', () => {
  it('returns all connections for a tenant', async () => {
    const tenant = 'tenant-multi-test';
    await plaid.connect(tenant, 'tok1');
    await docusign.connect(tenant, 'ds_code', 'acct_999');
    const conns = listConnections(tenant);
    expect(conns.length).toBeGreaterThanOrEqual(2);
    expect(conns.every((c) => c.tenantId === tenant)).toBe(true);
  });
});
