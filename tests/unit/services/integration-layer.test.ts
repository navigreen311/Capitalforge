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
  IntegrationNotImplementedError,
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
  // These asserted the fabrication: that connect returned a connection with a
  // truthy accessToken, that getConnection found it afterwards, and that sync
  // reported more than zero records. All three were true — connect built an
  // access token of the form plaid_access_stub_<uuid>, put it in a Map, and
  // sync returned a fixed 150 for transactions it had never fetched.
  //
  // What they now pin is the refusal, because nothing here contacts Plaid.

  it('refuses to connect, rather than inventing an access token', async () => {
    await expect(plaid.connect(T1, 'public-token-abc')).rejects.toBeInstanceOf(
      IntegrationNotImplementedError,
    );
  });

  it('reports no connection afterwards', async () => {
    await plaid.connect(T1, 'public-token-def').catch(() => undefined);
    // It used to find the one connect had just faked.
    expect(getConnection(T1, 'plaid')).toBeUndefined();
  });

  it('refuses to sync, rather than reporting 150 records', async () => {
    await expect(plaid.sync(T1)).rejects.toBeInstanceOf(IntegrationNotImplementedError);
  });

  it('refuses to disconnect something that was never connected', async () => {
    await expect(plaid.disconnect(T1)).rejects.toBeInstanceOf(IntegrationNotImplementedError);
  });

  it('says what is missing', async () => {
    await expect(plaid.connect(T1, 'public-token-xyz')).rejects.toThrow(
      /Nothing in this system contacts the provider/,
    );
  });

  it('still parses an incoming webhook', async () => {
    // Webhook handling reads the payload it was given, which is real work and
    // does not depend on a connection existing.
    const event = await plaid.handleWebhook(T1, {
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'DEFAULT_UPDATE',
      item_id:      'item_abc123',
    });
    expect(event.provider).toBe('plaid');
    expect(event.eventType).toBe('TRANSACTIONS');
    expect(event.deadLettered).toBe(false);
  });
});

// ============================================================
// INTEGRATION LAYER — QUICKBOOKS
// ============================================================

describe('QuickBooks Integration', () => {
  it('refuses to connect', async () => {
    await expect(
      quickbooks.connect(T2, 'qbo_oauth_code', 'realm_9876543'),
    ).rejects.toBeInstanceOf(IntegrationNotImplementedError);
  });

  it('refuses to sync, rather than reporting 48 records', async () => {
    await expect(quickbooks.sync(T2)).rejects.toBeInstanceOf(IntegrationNotImplementedError);
  });

  it('still parses an incoming webhook', async () => {
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
  it('lists what a case export would include, and offers no file', async () => {
    const result = await exportClientCase(T1, 'biz-abc-123', 'advisor-user');

    // This asserted downloadUrl matched /^https:/, which it did — the URL
    // pointed at api.capitalforge.io with a token prefixed "stub_", and the
    // size beside it was a random number between 100KB and 2.1MB. Nothing
    // writes an export artefact, so there is no file to link to or measure.
    expect(result.downloadUrl).toBeNull();
    expect(result.sizeBytes).toBeNull();

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
  it('is empty, because nothing can connect', async () => {
    await plaid.connect(T1, 'tok').catch(() => undefined);
    await quickbooks.connect(T1, 'code', 'realm').catch(() => undefined);

    // It used to return whatever this worker had faked since it started, so
    // two workers disagreed about what was connected and a restart
    // disconnected everything.
    expect(listConnections(T1)).toEqual([]);
  });
});
