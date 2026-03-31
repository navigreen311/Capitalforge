// ============================================================
// CapitalForge — Consent Service Unit Tests
//
// Coverage:
//   - Consent grant (new + duplicate channel)
//   - Revoke cascade (event published, records updated, count correct)
//   - Gate enforcement (TCPA hard block, revoked, missing, allowed)
//   - Audit trail (immutable history, full export, filters)
//   - Multi-channel consent (independent per channel)
//   - TcpaConsentError thrown by assertAllowed()
//   - Tenant isolation assertions
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @prisma/client before importing any service that depends on it
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({})),
}));

import { ConsentService } from '../../../src/backend/services/consent.service.js';
import { ConsentGate, TcpaConsentError } from '../../../src/backend/services/consent-gate.js';
import { EventBus, eventBus } from '../../../src/backend/events/event-bus.js';
import type { ConsentChannel, ConsentType } from '../../../src/shared/types/index.js';

// ----------------------------------------------------------------
// Prisma mock factory
// ----------------------------------------------------------------

/**
 * In-memory store that mimics the ConsentRecord Prisma model.
 * Each test gets a fresh store via `makeConsentStore()`.
 */
function makeConsentStore() {
  // Internal storage
  const records: Map<string, Record<string, unknown>> = new Map();
  let idCounter = 0;

  function nextId() {
    return `record-${++idCounter}`;
  }

  return {
    _records: records,

    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = nextId();
      const record = {
        id,
        grantedAt: new Date(),
        revokedAt: null,
        revocationReason: null,
        ...data,
      };
      records.set(id, record);
      return record;
    }),

    findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      let results = Array.from(records.values());

      if (where) {
        results = results.filter((r) => {
          return Object.entries(where).every(([key, val]) => {
            if (val === null) return r[key] === null;
            if (typeof val === 'object' && val !== null && 'in' in (val as object)) {
              const list = (val as { in: unknown[] }).in;
              return list.includes(r[key]);
            }
            return r[key] === val;
          });
        });
      }

      return results;
    }),

    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const [id, record] of records.entries()) {
          const matches = Object.entries(where).every(([key, val]) => {
            if (typeof val === 'object' && val !== null && 'in' in (val as object)) {
              const list = (val as { in: unknown[] }).in;
              return list.includes(record[key]);
            }
            return record[key] === val;
          });
          if (matches) {
            records.set(id, { ...record, ...data });
            count++;
          }
        }
        return { count };
      },
    ),

    count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      const all = Array.from(records.values());
      if (!where) return all.length;
      return all.filter((r) =>
        Object.entries(where).every(([k, v]) => r[k] === v),
      ).length;
    }),
  };
}

// ----------------------------------------------------------------
// Test setup helpers
// ----------------------------------------------------------------

const TENANT_ID = 'tenant-alpha';
const BUSINESS_ID = 'biz-001';

function makeTestDeps() {
  const store = makeConsentStore();
  const mockPrisma = { consentRecord: store } as unknown as Parameters<
    typeof ConsentService.prototype['constructor']
  >[0];

  const service = new ConsentService(mockPrisma as never);
  const gate = new ConsentGate(service);

  return { store, service, gate };
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('ConsentService', () => {
  let deps: ReturnType<typeof makeTestDeps>;

  beforeEach(() => {
    // Reset event bus between tests — prevent cross-test event leakage
    EventBus.reset();
    deps = makeTestDeps();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Grant ────────────────────────────────────────────────────

  describe('grantConsent()', () => {
    it('creates a new active consent record', async () => {
      const record = await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
        ipAddress: '10.0.0.1',
        evidenceRef: 'docusign-envelope-abc123',
      });

      expect(record.channel).toBe('voice');
      expect(record.consentType).toBe('tcpa');
      expect(record.status).toBe('active');
      expect(record.evidenceRef).toBe('docusign-envelope-abc123');
      expect(record.ipAddress).toBe('10.0.0.1');
      expect(record.id).toBeTruthy();
    });

    it('stores actorId in metadata', async () => {
      const record = await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'email',
        consentType: 'tcpa',
        actorId: 'user-advisor-99',
      });

      expect((record.metadata as Record<string, unknown>)?.actorId).toBe('user-advisor-99');
    });

    it('throws when tenantId is missing', async () => {
      await expect(
        deps.service.grantConsent({
          tenantId: '',
          businessId: BUSINESS_ID,
          channel: 'sms',
          consentType: 'tcpa',
        }),
      ).rejects.toThrow('[ConsentService] tenantId is required');
    });

    it('throws when businessId is missing', async () => {
      await expect(
        deps.service.grantConsent({
          tenantId: TENANT_ID,
          businessId: '',
          channel: 'sms',
          consentType: 'tcpa',
        }),
      ).rejects.toThrow('[ConsentService] businessId is required');
    });

    it('allows granting consent for multiple channels independently', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
        consentType: 'tcpa',
      });
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'email',
        consentType: 'data_sharing',
      });

      // All three should be in the store
      expect(deps.store._records.size).toBe(3);
    });

    it('publishes consent.captured event after grant', async () => {
      const publishSpy = vi.spyOn(
        eventBus,
        'publishAndPersist',
      );

      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });

      expect(publishSpy).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ eventType: 'consent.captured' }),
      );
    });
  });

  // ── Revoke + cascade ─────────────────────────────────────────

  describe('revokeConsent()', () => {
    it('revokes active consent records and returns count', async () => {
      // Grant first
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
        consentType: 'tcpa',
      });

      const result = await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
        revocationReason: 'Client requested via SMS STOP',
      });

      expect(result.revokedCount).toBe(1);
      expect(result.records[0]?.status).toBe('revoked');
      expect(result.records[0]?.revocationReason).toContain('STOP');
    });

    it('returns revokedCount 0 when no active records exist', async () => {
      const result = await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
      });

      expect(result.revokedCount).toBe(0);
      expect(result.records).toHaveLength(0);
    });

    it('publishes consent.revoked event for each revoked record', async () => {
      const publishSpy = vi.spyOn(
        eventBus,
        'publishAndPersist',
      );

      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
        consentType: 'tcpa',
      });

      publishSpy.mockClear();

      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
      });

      // Should publish one CONSENT_REVOKED event
      expect(publishSpy).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ eventType: 'consent.revoked' }),
      );
    });

    it('CONSENT_REVOKED payload includes cascade targets', async () => {
      const publishSpy = vi.spyOn(
        eventBus,
        'publishAndPersist',
      );

      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });

      publishSpy.mockClear();

      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
      });

      const call = publishSpy.mock.calls.find(
        ([, env]) => env.eventType === 'consent.revoked',
      );
      expect(call).toBeDefined();
      const payload = call![1]!.payload as Record<string, unknown>;
      expect(Array.isArray(payload.cascadeTarget)).toBe(true);
      expect(payload.cascadeTarget).toContain('voiceforge');
    });

    it('preserves history — revoked records remain in store', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
        consentType: 'tcpa',
      });

      expect(deps.store._records.size).toBe(1);

      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
      });

      // Record was updated, NOT deleted
      expect(deps.store._records.size).toBe(1);
      const record = Array.from(deps.store._records.values())[0]!;
      expect(record['status']).toBe('revoked');
      expect(record['revokedAt']).toBeInstanceOf(Date);
    });

    it('does not revoke consent for a different channel', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'email',
        consentType: 'tcpa',
      });

      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
      });

      // Email should still be active
      const hasEmail = await deps.service.hasActiveConsent(
        TENANT_ID,
        BUSINESS_ID,
        'email',
        'tcpa',
      );
      expect(hasEmail).toBe(true);
    });
  });

  // ── Status query ─────────────────────────────────────────────

  describe('getConsentStatuses()', () => {
    it('returns empty array when no consents exist', async () => {
      const statuses = await deps.service.getConsentStatuses(
        TENANT_ID,
        BUSINESS_ID,
      );
      expect(statuses).toHaveLength(0);
    });

    it('returns current status for each granted channel', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'email',
        consentType: 'data_sharing',
      });

      const statuses = await deps.service.getConsentStatuses(
        TENANT_ID,
        BUSINESS_ID,
      );

      expect(statuses).toHaveLength(2);
      const voiceStatus = statuses.find((s) => s.channel === 'voice');
      expect(voiceStatus?.status).toBe('active');
    });

    it('shows revoked status after revocation', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
        consentType: 'tcpa',
      });
      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
      });

      const statuses = await deps.service.getConsentStatuses(
        TENANT_ID,
        BUSINESS_ID,
      );
      const smsStatus = statuses.find((s) => s.channel === 'sms');
      expect(smsStatus?.status).toBe('revoked');
    });
  });

  // ── hasActiveConsent ─────────────────────────────────────────

  describe('hasActiveConsent()', () => {
    it('returns true when active consent exists', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });

      const has = await deps.service.hasActiveConsent(
        TENANT_ID,
        BUSINESS_ID,
        'voice',
        'tcpa',
      );
      expect(has).toBe(true);
    });

    it('returns false when no consent exists', async () => {
      const has = await deps.service.hasActiveConsent(
        TENANT_ID,
        BUSINESS_ID,
        'voice',
        'tcpa',
      );
      expect(has).toBe(false);
    });

    it('returns false after revocation', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });
      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
      });

      const has = await deps.service.hasActiveConsent(
        TENANT_ID,
        BUSINESS_ID,
        'voice',
        'tcpa',
      );
      expect(has).toBe(false);
    });
  });

  // ── Audit export ─────────────────────────────────────────────

  describe('exportAudit()', () => {
    it('exports full history including revoked records', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
        evidenceRef: 'ev-001',
      });
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
        consentType: 'tcpa',
        evidenceRef: 'ev-002',
      });
      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        revocationReason: 'DNC request',
      });

      const audit = await deps.service.exportAudit(TENANT_ID, BUSINESS_ID);

      expect(audit.tenantId).toBe(TENANT_ID);
      expect(audit.businessId).toBe(BUSINESS_ID);
      expect(audit.exportedAt).toBeInstanceOf(Date);
      expect(audit.totalRecords).toBe(2);

      const voiceRecord = audit.records.find((r) => r.channel === 'voice');
      const smsRecord = audit.records.find((r) => r.channel === 'sms');

      expect(voiceRecord?.status).toBe('revoked');
      expect(voiceRecord?.revocationReason).toBe('DNC request');
      expect(smsRecord?.status).toBe('active');
    });

    it('returns empty records when no consent history exists', async () => {
      const audit = await deps.service.exportAudit(TENANT_ID, BUSINESS_ID);
      expect(audit.totalRecords).toBe(0);
      expect(audit.records).toHaveLength(0);
    });
  });
});

// ----------------------------------------------------------------
// ConsentGate tests
// ----------------------------------------------------------------

describe('ConsentGate', () => {
  let deps: ReturnType<typeof makeTestDeps>;

  beforeEach(() => {
    EventBus.reset();
    deps = makeTestDeps();
  });

  // ── TCPA hard block ──────────────────────────────────────────

  describe('TCPA hard block (voice + sms)', () => {
    it('blocks voice call with no consent on record — TCPA_HARD_BLOCK', async () => {
      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'voice');

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe('TCPA_HARD_BLOCK');
        expect(result.channel).toBe('voice');
      }
    });

    it('blocks SMS with no consent on record — TCPA_HARD_BLOCK', async () => {
      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'sms');

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe('TCPA_HARD_BLOCK');
      }
    });

    it('blocks voice call when consent is revoked — CONSENT_REVOKED', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });
      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
      });

      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'voice');

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe('CONSENT_REVOKED');
      }
    });

    it('allows voice call when active TCPA consent exists', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });

      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'voice');

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.consentType).toBe('tcpa');
      }
    });

    it('allows SMS when active TCPA consent exists', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
        consentType: 'tcpa',
      });

      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'sms');
      expect(result.allowed).toBe(true);
    });
  });

  // ── Email channel ────────────────────────────────────────────

  describe('email channel', () => {
    it('blocks email with no consent', async () => {
      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'email');
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toBe('CONSENT_MISSING');
      }
    });

    it('allows email with tcpa consent', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'email',
        consentType: 'tcpa',
      });
      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'email');
      expect(result.allowed).toBe(true);
    });

    it('allows email with data_sharing consent (alternative)', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'email',
        consentType: 'data_sharing',
      });
      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'email');
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.consentType).toBe('data_sharing');
      }
    });
  });

  // ── Partner channel ──────────────────────────────────────────

  describe('partner channel', () => {
    it('blocks partner without referral consent', async () => {
      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'partner');
      expect(result.allowed).toBe(false);
    });

    it('allows partner with referral consent', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'partner',
        consentType: 'referral',
      });
      const result = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'partner');
      expect(result.allowed).toBe(true);
    });
  });

  // ── checkMany ────────────────────────────────────────────────

  describe('checkMany()', () => {
    it('returns a map with results for each channel', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });

      const channels: ConsentChannel[] = ['voice', 'sms', 'email'];
      const results = await deps.gate.checkMany(
        TENANT_ID,
        BUSINESS_ID,
        channels,
      );

      expect(results.size).toBe(3);
      expect(results.get('voice')?.allowed).toBe(true);
      expect(results.get('sms')?.allowed).toBe(false);
      expect(results.get('email')?.allowed).toBe(false);
    });
  });

  // ── assertAllowed ────────────────────────────────────────────

  describe('assertAllowed()', () => {
    it('throws TcpaConsentError when consent is missing', async () => {
      await expect(
        deps.gate.assertAllowed(TENANT_ID, BUSINESS_ID, 'voice'),
      ).rejects.toThrow(TcpaConsentError);
    });

    it('TcpaConsentError carries reason and channel', async () => {
      try {
        await deps.gate.assertAllowed(TENANT_ID, BUSINESS_ID, 'sms');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TcpaConsentError);
        const tcpaErr = err as TcpaConsentError;
        expect(tcpaErr.channel).toBe('sms');
        expect(tcpaErr.reason).toBe('TCPA_HARD_BLOCK');
        expect(tcpaErr.businessId).toBe(BUSINESS_ID);
      }
    });

    it('does not throw when consent is active', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });

      await expect(
        deps.gate.assertAllowed(TENANT_ID, BUSINESS_ID, 'voice'),
      ).resolves.toBeUndefined();
    });
  });

  // ── Multi-channel independence ───────────────────────────────

  describe('multi-channel consent independence', () => {
    it('each channel is gated independently', async () => {
      const channelsToGrant: Array<{ channel: ConsentChannel; consentType: ConsentType }> = [
        { channel: 'voice', consentType: 'tcpa' },
        { channel: 'sms', consentType: 'tcpa' },
      ];

      for (const { channel, consentType } of channelsToGrant) {
        await deps.service.grantConsent({
          tenantId: TENANT_ID,
          businessId: BUSINESS_ID,
          channel,
          consentType,
        });
      }

      // Revoke only sms
      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'sms',
      });

      const voiceResult = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'voice');
      const smsResult = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'sms');
      const emailResult = await deps.gate.check(TENANT_ID, BUSINESS_ID, 'email');

      expect(voiceResult.allowed).toBe(true);
      expect(smsResult.allowed).toBe(false);
      expect(emailResult.allowed).toBe(false);
    });

    it('revoking one channel does not affect audit records for other channels', async () => {
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });
      await deps.service.grantConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'email',
        consentType: 'tcpa',
      });
      await deps.service.revokeConsent({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        channel: 'voice',
      });

      const audit = await deps.service.exportAudit(TENANT_ID, BUSINESS_ID);
      // Both records should appear — history is immutable
      expect(audit.totalRecords).toBe(2);

      const emailRecord = audit.records.find((r) => r.channel === 'email');
      expect(emailRecord?.status).toBe('active');
    });
  });

  // ── Tenant isolation ─────────────────────────────────────────

  describe('tenant isolation', () => {
    it('consent granted for tenant-A does not satisfy gate for tenant-B', async () => {
      await deps.service.grantConsent({
        tenantId: 'tenant-A',
        businessId: BUSINESS_ID,
        channel: 'voice',
        consentType: 'tcpa',
      });

      // Gate check for tenant-B — different tenant, same businessId
      // (In production, businessId would also differ, but we test tenantId scoping)
      const result = await deps.gate.check('tenant-B', BUSINESS_ID, 'voice');
      expect(result.allowed).toBe(false);
    });
  });
});
