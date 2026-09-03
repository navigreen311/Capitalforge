// ============================================================
// recordOptOut — a STOP has to behave like a revocation, not merely look like one
//
// There are two ways consent gets revoked in this system, and they did not
// agree. The API path (ConsentService.revokeConsent) published CONSENT_REVOKED.
// The STOP path did a raw `prisma.consentRecord.updateMany` and published
// nothing — so the revocation a human actually triggered, by texting STOP, was
// the silent one. Anything subscribed to the cascade heard about advisor-entered
// revocations and never about consumer opt-outs.
//
// It also meant the two paths wrote different rows: the raw update left
// grant-time metadata alone while the API path destroyed it, so the ledger
// recorded the same event two ways depending on who triggered it.
//
// What is asserted here is the cascade, because it is the half that was silent.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const TENANT = 'tenant-alpha';
const BUSINESS = 'biz-001';
const PHONE = '+15125550123';

const businessFindMany = vi.fn();
const dncUpsert = vi.fn();
const consentFindMany = vi.fn();
const consentUpdate = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    business: {
      findMany: businessFindMany,
      // revokeConsent resolves the business itself now, because an API
      // revocation must suppress the number without a STOP having arrived.
      // On this path that means the business is looked up twice - once here to
      // match the number, once inside the revocation.
      findFirst: vi.fn(async () => ({ phoneNumber: '+15551234567' })),
    },
    doNotCallList: { upsert: dncUpsert },
    consentRecord: {
      findMany: consentFindMany,
      update: consentUpdate,
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    $on: vi.fn(),
  })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

// Static imports: vi.mock above is hoisted, so the mocked client is in place
// before either module is evaluated. Top-level await would make this file an
// ES module under a CommonJS tsconfig.
import { recordOptOut } from '../../../src/backend/services/sms-dispatch.service.js';
import { eventBus } from '../../../src/backend/events/event-bus.js';

/** An active sms consent row carrying the evidence of who granted it. */
function activeSmsConsent(id = 'consent-1') {
  return {
    id,
    tenantId: TENANT,
    businessId: BUSINESS,
    channel: 'sms',
    consentType: 'tcpa',
    status: 'active',
    grantedAt: new Date('2026-01-01'),
    revokedAt: null,
    revocationReason: null,
    ipAddress: '203.0.113.7',
    evidenceRef: 'docusign://envelope/abc',
    metadata: { actorId: 'user-advisor-99', grantedByIp: '203.0.113.7' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  businessFindMany.mockResolvedValue([{ id: BUSINESS, phoneNumber: '(512) 555-0123' }]);
  dncUpsert.mockResolvedValue({});
  consentFindMany.mockResolvedValue([activeSmsConsent()]);
  consentUpdate.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
    Promise.resolve({ ...activeSmsConsent(where.id), ...data }),
  );
});

describe('recordOptOut', () => {
  it('publishes CONSENT_REVOKED so the cascade fires on the STOP path too', async () => {
    const publishSpy = vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(undefined as never);

    const result = await recordOptOut(TENANT, '(512) 555-0123', 'Inbound "STOP" message');

    expect(result.consentsRevoked).toBe(1);

    const revoked = publishSpy.mock.calls.filter(
      ([, envelope]) => envelope.eventType === 'consent.revoked',
    );
    expect(revoked, 'a STOP must announce itself like any other revocation').toHaveLength(1);
    expect(revoked[0]![0]).toBe(TENANT);

    const payload = revoked[0]![1].payload as Record<string, unknown>;
    expect(payload['channel']).toBe('sms');
    expect(payload['revocationReason']).toBe('Inbound "STOP" message');
    // The cascade targets are what a downstream consumer keys on.
    expect(payload['cascadeTarget']).toContain('twilio');
  });

  it('adds the number to the do-not-call list as well as revoking consent', async () => {
    vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(undefined as never);

    await recordOptOut(TENANT, '(512) 555-0123');

    // Both halves. The DNC entry stops sends even if consent is re-granted in
    // error; the revocation keeps the ledger an audit reads agreeing with it.
    expect(dncUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_phoneNumber: { tenantId: TENANT, phoneNumber: PHONE } },
      }),
    );
    expect(consentUpdate).toHaveBeenCalledTimes(1);
  });

  it('revokes only the sms channel', async () => {
    vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(undefined as never);

    await recordOptOut(TENANT, '(512) 555-0123');

    // A STOP is an opt-out from messages, not a withdrawal of consent to be
    // called or emailed. Widening it is a policy decision, not a webhook's.
    expect(consentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ channel: 'sms', status: 'active' }),
      }),
    );
  });

  it('keeps the grant-time evidence on the revoked record', async () => {
    vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(undefined as never);

    await recordOptOut(TENANT, '(512) 555-0123');

    const [{ data }] = consentUpdate.mock.calls[0] as [{ data: Record<string, unknown> }];
    const metadata = data['metadata'] as Record<string, unknown>;
    expect(metadata['actorId']).toBe('user-advisor-99');
    expect(metadata['grantedByIp']).toBe('203.0.113.7');
    expect(data['status']).toBe('revoked');
  });

  it('still records the do-not-call entry when no business matches the number', async () => {
    vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(undefined as never);
    businessFindMany.mockResolvedValue([]);

    const result = await recordOptOut(TENANT, '(512) 555-0123');

    // An unmatched number is the case where suppression matters most: nobody
    // knows whose it is, so nothing else will stop the next send.
    expect(dncUpsert).toHaveBeenCalledTimes(1);
    expect(result.businessId).toBeNull();
    expect(result.consentsRevoked).toBe(0);
  });

  it('refuses a number it cannot normalise rather than suppressing nothing', async () => {
    await expect(recordOptOut(TENANT, 'not a phone')).rejects.toThrow(/unparseable/i);
    expect(dncUpsert).not.toHaveBeenCalled();
  });
});
