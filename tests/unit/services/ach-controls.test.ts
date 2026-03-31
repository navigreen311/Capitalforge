// ============================================================
// Unit Tests — ACH / Debit Authorization Controls
//
// Run standalone: npx vitest run tests/unit/services/ach-controls.test.ts
//
// Coverage:
//   • Authorization storage (all compliance fields, validation gates)
//   • Revocation cascade (status, timestamps, event published)
//   • Tolerance checks (10% band, edge cases)
//   • Unauthorized debit detection (all four violation types)
//   • Alert generation and retrieval
//   • Pre-debit confirmation guard
//   • DebitMonitor: evaluation, reconciliation, unknown processor
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { AchControlsService } from '../../../src/backend/services/ach-controls.service.js';
import { DebitMonitor } from '../../../src/backend/services/debit-monitor.js';
import { EVENT_TYPES } from '../../../src/backend/events/event-types.js';

// ── Test fixtures ─────────────────────────────────────────────

const TENANT_ID = 'tenant-test-001';
const BUSINESS_ID = 'biz-test-001';
const AUTH_ID = 'auth-test-001';
const DEBIT_EVENT_ID = 'debit-test-001';

function makeAuthorization(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: AUTH_ID,
    businessId: BUSINESS_ID,
    processorName: 'Rapid Capital ACH',
    authorizedAmount: new Decimal('1000.00'),
    authorizedFrequency: 'weekly',
    signedDocumentRef: 'vault://docs/ach-auth-001.pdf',
    status: 'active',
    authorizedAt: new Date('2026-01-01T00:00:00Z'),
    revokedAt: null,
    revocationNotifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDebitEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DEBIT_EVENT_ID,
    authorizationId: AUTH_ID,
    amount: new Decimal('950.00'),
    frequency: 'weekly',
    isWithinTolerance: true,
    flagged: false,
    flagReason: null,
    processedAt: new Date('2026-01-08T10:00:00Z'),
    createdAt: new Date('2026-01-08T10:00:01Z'),
    ...overrides,
  };
}

// ── Prisma mock factory ───────────────────────────────────────

function makePrismaMock() {
  return {
    business: {
      findFirst: vi.fn(),
    },
    achAuthorization: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    debitEvent: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

// ── EventBus mock factory ─────────────────────────────────────

function makeEventBusMock() {
  return {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-001', publishedAt: new Date() }),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue('sub-001'),
    unsubscribe: vi.fn().mockReturnValue(true),
    setLedgerWriter: vi.fn(),
  };
}

// ═══════════════════════════════════════════════════════════════
// AchControlsService
// ═══════════════════════════════════════════════════════════════

describe('AchControlsService — createAuthorization', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let svc: AchControlsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    svc = new AchControlsService(prisma as never, eventBus as never);
  });

  it('creates an authorization when all required fields are present', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID, legalName: 'Acme Corp' });
    const auth = makeAuthorization();
    prisma.achAuthorization.create.mockResolvedValue(auth);

    const result = await svc.createAuthorization({
      tenantId: TENANT_ID,
      businessId: BUSINESS_ID,
      processorName: 'Rapid Capital ACH',
      authorizedAmount: 1000,
      authorizedFrequency: 'weekly',
      signedDocumentRef: 'vault://docs/ach-auth-001.pdf',
      authorizedAt: '2026-01-01T00:00:00Z',
    });

    expect(result.id).toBe(AUTH_ID);
    expect(prisma.achAuthorization.create).toHaveBeenCalledOnce();
  });

  it('publishes DEBIT_AUTHORIZED after successful creation', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID, legalName: 'Acme Corp' });
    prisma.achAuthorization.create.mockResolvedValue(makeAuthorization());

    await svc.createAuthorization({
      tenantId: TENANT_ID,
      businessId: BUSINESS_ID,
      processorName: 'Rapid Capital ACH',
      authorizedAmount: 1000,
      authorizedFrequency: 'weekly',
      signedDocumentRef: 'vault://docs/ach-auth-001.pdf',
      authorizedAt: '2026-01-01T00:00:00Z',
    });

    expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();
    const [calledTenantId, envelope] = eventBus.publishAndPersist.mock.calls[0];
    expect(calledTenantId).toBe(TENANT_ID);
    expect(envelope.eventType).toBe(EVENT_TYPES.DEBIT_AUTHORIZED);
  });

  it('rejects when signedDocumentRef is missing', async () => {
    await expect(
      svc.createAuthorization({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        processorName: 'Rapid Capital ACH',
        authorizedAmount: 1000,
        authorizedFrequency: 'weekly',
        signedDocumentRef: '',       // ← empty
        authorizedAt: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toThrow(/signedDocumentRef is required/);
  });

  it('rejects when authorizedAmount is zero', async () => {
    await expect(
      svc.createAuthorization({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        processorName: 'Rapid Capital ACH',
        authorizedAmount: 0,         // ← invalid
        authorizedFrequency: 'weekly',
        signedDocumentRef: 'vault://docs/ach-auth-001.pdf',
        authorizedAt: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toThrow(/authorizedAmount must be a positive number/);
  });

  it('rejects when authorizedFrequency is missing', async () => {
    await expect(
      svc.createAuthorization({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        processorName: 'Rapid Capital ACH',
        authorizedAmount: 1000,
        authorizedFrequency: '',     // ← empty
        signedDocumentRef: 'vault://docs/ach-auth-001.pdf',
        authorizedAt: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toThrow(/authorizedFrequency is required/);
  });

  it('rejects when business is not found for tenant', async () => {
    prisma.business.findFirst.mockResolvedValue(null);

    await expect(
      svc.createAuthorization({
        tenantId: TENANT_ID,
        businessId: 'ghost-biz',
        processorName: 'Rapid Capital ACH',
        authorizedAmount: 1000,
        authorizedFrequency: 'weekly',
        signedDocumentRef: 'vault://docs/ach-auth-001.pdf',
        authorizedAt: '2026-01-01T00:00:00Z',
      }),
    ).rejects.toThrow(/not found/);
  });
});

// ─────────────────────────────────────────────────────────────

describe('AchControlsService — revokeAuthorization', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let svc: AchControlsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    svc = new AchControlsService(prisma as never, eventBus as never);
  });

  it('marks authorization as revoked and sets timestamps', async () => {
    prisma.achAuthorization.findFirst.mockResolvedValue(makeAuthorization());
    const revoked = makeAuthorization({
      status: 'revoked',
      revokedAt: new Date(),
      revocationNotifiedAt: new Date(),
    });
    prisma.achAuthorization.update.mockResolvedValue(revoked);

    const result = await svc.revokeAuthorization({
      tenantId: TENANT_ID,
      businessId: BUSINESS_ID,
      authorizationId: AUTH_ID,
      revokedBy: 'user-001',
      revocationReason: 'Business owner requested revocation.',
    });

    expect(result.status).toBe('revoked');
    expect(result.revokedAt).toBeDefined();
    expect(result.revocationNotifiedAt).toBeDefined();
  });

  it('publishes DEBIT_REVOKED immediately upon revocation', async () => {
    prisma.achAuthorization.findFirst.mockResolvedValue(makeAuthorization());
    prisma.achAuthorization.update.mockResolvedValue(
      makeAuthorization({ status: 'revoked', revokedAt: new Date(), revocationNotifiedAt: new Date() }),
    );

    await svc.revokeAuthorization({
      tenantId: TENANT_ID,
      businessId: BUSINESS_ID,
      authorizationId: AUTH_ID,
      revokedBy: 'user-001',
      revocationReason: 'MCA was fully repaid.',
    });

    expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();
    const [, envelope] = eventBus.publishAndPersist.mock.calls[0];
    expect(envelope.eventType).toBe(EVENT_TYPES.DEBIT_REVOKED);
    // revocationNotifiedAt must be present in the payload for legal proof
    expect(envelope.payload.revocationNotifiedAt).toBeDefined();
  });

  it('throws when authorization is already revoked', async () => {
    prisma.achAuthorization.findFirst.mockResolvedValue(
      makeAuthorization({ status: 'revoked' }),
    );

    await expect(
      svc.revokeAuthorization({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        authorizationId: AUTH_ID,
        revokedBy: 'user-001',
        revocationReason: 'Duplicate revocation attempt.',
      }),
    ).rejects.toThrow(/already revoked/);
  });

  it('throws when authorization is not found', async () => {
    prisma.achAuthorization.findFirst.mockResolvedValue(null);

    await expect(
      svc.revokeAuthorization({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        authorizationId: 'ghost-auth',
        revokedBy: 'user-001',
        revocationReason: 'Test.',
      }),
    ).rejects.toThrow(/not found/);
  });
});

// ─────────────────────────────────────────────────────────────

describe('AchControlsService — recordDebitEvent / tolerance checks', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let svc: AchControlsService;

  const makeAuthWithBusiness = (authOverrides = {}) => ({
    ...makeAuthorization(authOverrides),
    business: { tenantId: TENANT_ID, id: BUSINESS_ID },
  });

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    svc = new AchControlsService(prisma as never, eventBus as never);
  });

  it('passes when debit is exactly at authorized amount', async () => {
    prisma.achAuthorization.findUnique.mockResolvedValue(makeAuthWithBusiness());
    prisma.debitEvent.create.mockResolvedValue(makeDebitEvent({ amount: new Decimal('1000.00') }));

    const result = await svc.recordDebitEvent({
      tenantId: TENANT_ID,
      authorizationId: AUTH_ID,
      amount: 1000.00,
      frequency: 'weekly',
      processedAt: '2026-01-08T10:00:00Z',
    });

    expect(result.flagged).toBe(false);
    expect(result.isWithinTolerance).toBe(true);
    expect(result.flagReasons).toHaveLength(0);
  });

  it('passes when debit is exactly at the 10% tolerance boundary', async () => {
    prisma.achAuthorization.findUnique.mockResolvedValue(makeAuthWithBusiness());
    // $1100 = $1000 × 1.10 — right at boundary, should pass
    prisma.debitEvent.create.mockResolvedValue(makeDebitEvent({ amount: new Decimal('1100.00') }));

    const result = await svc.recordDebitEvent({
      tenantId: TENANT_ID,
      authorizationId: AUTH_ID,
      amount: 1100.00,
      frequency: 'weekly',
      processedAt: '2026-01-08T10:00:00Z',
    });

    expect(result.flagged).toBe(false);
    expect(result.flagReasons).toHaveLength(0);
  });

  it('flags when debit exceeds authorized amount by more than 10%', async () => {
    prisma.achAuthorization.findUnique.mockResolvedValue(makeAuthWithBusiness());
    // $1100.01 > $1000 × 1.10 — must flag
    prisma.debitEvent.create.mockResolvedValue(
      makeDebitEvent({ amount: new Decimal('1100.01'), flagged: true }),
    );

    const result = await svc.recordDebitEvent({
      tenantId: TENANT_ID,
      authorizationId: AUTH_ID,
      amount: 1100.01,
      frequency: 'weekly',
      processedAt: '2026-01-08T10:00:00Z',
    });

    expect(result.flagged).toBe(true);
    expect(result.isWithinTolerance).toBe(false);
    expect(result.flagReasons.some((r) => r.includes('exceeds authorized'))).toBe(true);
  });

  it('flags when debit is significantly above authorized amount', async () => {
    prisma.achAuthorization.findUnique.mockResolvedValue(makeAuthWithBusiness());
    prisma.debitEvent.create.mockResolvedValue(
      makeDebitEvent({ amount: new Decimal('2500.00'), flagged: true }),
    );

    const result = await svc.recordDebitEvent({
      tenantId: TENANT_ID,
      authorizationId: AUTH_ID,
      amount: 2500.00,
      processedAt: '2026-01-08T10:00:00Z',
    });

    expect(result.flagged).toBe(true);
    expect(result.flagReasons.some((r) => r.includes('150.0%'))).toBe(true);
  });

  it('flags when debit occurs after authorization is revoked', async () => {
    prisma.achAuthorization.findUnique.mockResolvedValue(
      makeAuthWithBusiness({ status: 'revoked', revokedAt: new Date('2026-01-05T00:00:00Z') }),
    );
    prisma.debitEvent.create.mockResolvedValue(
      makeDebitEvent({ flagged: true }),
    );

    const result = await svc.recordDebitEvent({
      tenantId: TENANT_ID,
      authorizationId: AUTH_ID,
      amount: 500.00,
      processedAt: '2026-01-08T10:00:00Z',
    });

    expect(result.flagged).toBe(true);
    expect(result.flagReasons.some((r) => r.includes('revoked'))).toBe(true);
  });

  it('flags frequency mismatch', async () => {
    prisma.achAuthorization.findUnique.mockResolvedValue(makeAuthWithBusiness());
    prisma.debitEvent.create.mockResolvedValue(
      makeDebitEvent({ frequency: 'daily', flagged: true }),
    );

    const result = await svc.recordDebitEvent({
      tenantId: TENANT_ID,
      authorizationId: AUTH_ID,
      amount: 500.00,
      frequency: 'daily',        // authorized: weekly
      processedAt: '2026-01-08T10:00:00Z',
    });

    expect(result.flagged).toBe(true);
    expect(result.flagReasons.some((r) => r.includes('does not match authorized frequency'))).toBe(true);
  });

  it('publishes DEBIT_UNAUTHORIZED_DETECTED when a violation is flagged', async () => {
    prisma.achAuthorization.findUnique.mockResolvedValue(
      makeAuthWithBusiness({ status: 'revoked', revokedAt: new Date() }),
    );
    prisma.debitEvent.create.mockResolvedValue(makeDebitEvent({ flagged: true }));

    await svc.recordDebitEvent({
      tenantId: TENANT_ID,
      authorizationId: AUTH_ID,
      amount: 500.00,
      processedAt: '2026-01-08T10:00:00Z',
    });

    expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();
    const [, envelope] = eventBus.publishAndPersist.mock.calls[0];
    expect(envelope.eventType).toBe(EVENT_TYPES.DEBIT_UNAUTHORIZED_DETECTED);
    expect(envelope.payload.openComplaintCase).toBe(true);
  });

  it('throws when authorization is not found', async () => {
    prisma.achAuthorization.findUnique.mockResolvedValue(null);

    await expect(
      svc.recordDebitEvent({
        tenantId: TENANT_ID,
        authorizationId: 'ghost',
        amount: 500,
        processedAt: '2026-01-08T10:00:00Z',
      }),
    ).rejects.toThrow(/not found/);
  });

  it('throws when tenant does not own the authorization', async () => {
    prisma.achAuthorization.findUnique.mockResolvedValue({
      ...makeAuthWithBusiness(),
      business: { tenantId: 'other-tenant', id: BUSINESS_ID },
    });

    await expect(
      svc.recordDebitEvent({
        tenantId: TENANT_ID,
        authorizationId: AUTH_ID,
        amount: 500,
        processedAt: '2026-01-08T10:00:00Z',
      }),
    ).rejects.toThrow(/does not belong to tenant/);
  });
});

// ─────────────────────────────────────────────────────────────

describe('AchControlsService — getUnauthorizedAlerts', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let svc: AchControlsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    svc = new AchControlsService(prisma as never, eventBus as never);
  });

  it('returns mapped alerts for all flagged debit events', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    prisma.debitEvent.findMany.mockResolvedValue([
      {
        ...makeDebitEvent({ flagged: true, flagReason: 'Amount exceeds tolerance.' }),
        authorization: {
          id: AUTH_ID,
          processorName: 'Rapid Capital ACH',
          businessId: BUSINESS_ID,
        },
      },
    ]);

    const alerts = await svc.getUnauthorizedAlerts(TENANT_ID, BUSINESS_ID);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].processorName).toBe('Rapid Capital ACH');
    expect(alerts[0].reason).toBe('Amount exceeds tolerance.');
    expect(alerts[0].businessId).toBe(BUSINESS_ID);
  });

  it('returns empty array when no flagged events exist', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    prisma.debitEvent.findMany.mockResolvedValue([]);

    const alerts = await svc.getUnauthorizedAlerts(TENANT_ID, BUSINESS_ID);
    expect(alerts).toHaveLength(0);
  });

  it('throws when business is not found for tenant', async () => {
    prisma.business.findFirst.mockResolvedValue(null);

    await expect(
      svc.getUnauthorizedAlerts(TENANT_ID, 'ghost-biz'),
    ).rejects.toThrow(/not found/);
  });
});

// ─────────────────────────────────────────────────────────────

describe('AchControlsService — preDebitConfirmation', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let svc: AchControlsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    svc = new AchControlsService(prisma as never, eventBus as never);
  });

  it('allows a debit within authorized amount', async () => {
    prisma.achAuthorization.findFirst.mockResolvedValue(makeAuthorization());

    const result = await svc.preDebitConfirmation(TENANT_ID, AUTH_ID, 800);

    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('flags a debit exceeding tolerance and marks requiresConfirmation', async () => {
    prisma.achAuthorization.findFirst.mockResolvedValue(makeAuthorization());

    const result = await svc.preDebitConfirmation(TENANT_ID, AUTH_ID, 1200);

    expect(result.allowed).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.reasons.some((r) => r.includes('tolerance band'))).toBe(true);
  });

  it('disallows debit on a revoked authorization', async () => {
    prisma.achAuthorization.findFirst.mockResolvedValue(
      makeAuthorization({ status: 'revoked' }),
    );

    const result = await svc.preDebitConfirmation(TENANT_ID, AUTH_ID, 500);

    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes('revoked'))).toBe(true);
  });

  it('returns not-allowed when authorization does not exist for tenant', async () => {
    prisma.achAuthorization.findFirst.mockResolvedValue(null);

    const result = await svc.preDebitConfirmation(TENANT_ID, 'ghost-auth', 500);

    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes('not found'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────

describe('AchControlsService — getAuthorizationsForBusiness', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: AchControlsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    svc = new AchControlsService(prisma as never, makeEventBusMock() as never);
  });

  it('returns authorizations with debit events', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    const authWithEvents = { ...makeAuthorization(), debitEvents: [makeDebitEvent()] };
    prisma.achAuthorization.findMany.mockResolvedValue([authWithEvents]);

    const result = await svc.getAuthorizationsForBusiness(TENANT_ID, BUSINESS_ID);

    expect(result).toHaveLength(1);
    expect(result[0].debitEvents).toHaveLength(1);
  });

  it('throws when business is not found', async () => {
    prisma.business.findFirst.mockResolvedValue(null);

    await expect(
      svc.getAuthorizationsForBusiness(TENANT_ID, 'ghost'),
    ).rejects.toThrow(/not found/);
  });
});

// ═══════════════════════════════════════════════════════════════
// DebitMonitor
// ═══════════════════════════════════════════════════════════════

describe('DebitMonitor — evaluateDebitEvent', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let monitor: DebitMonitor;

  const makeFullDebitEvent = (
    debitOverrides: Partial<Record<string, unknown>> = {},
    authOverrides: Partial<Record<string, unknown>> = {},
  ) => ({
    ...makeDebitEvent(debitOverrides),
    authorization: {
      ...makeAuthorization(authOverrides),
      business: { id: BUSINESS_ID, tenantId: TENANT_ID },
    },
  });

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    monitor = new DebitMonitor(prisma as never, eventBus as never);
  });

  it('returns unauthorized=false for a clean debit event', async () => {
    prisma.debitEvent.findUnique.mockResolvedValue(makeFullDebitEvent());

    const result = await monitor.evaluateDebitEvent(TENANT_ID, DEBIT_EVENT_ID);

    expect(result.unauthorized).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('detects POST_REVOCATION_DEBIT when authorization is revoked', async () => {
    prisma.debitEvent.findUnique.mockResolvedValue(
      makeFullDebitEvent({}, { status: 'revoked', revokedAt: new Date('2026-01-05') }),
    );
    prisma.debitEvent.update.mockResolvedValue({});

    const result = await monitor.evaluateDebitEvent(TENANT_ID, DEBIT_EVENT_ID);

    expect(result.unauthorized).toBe(true);
    expect(result.violations.some((v) => v.type === 'POST_REVOCATION_DEBIT')).toBe(true);
  });

  it('detects AMOUNT_OVER_TOLERANCE when debit exceeds 10% band', async () => {
    prisma.debitEvent.findUnique.mockResolvedValue(
      makeFullDebitEvent({ amount: new Decimal('1500.00') }),
    );
    prisma.debitEvent.update.mockResolvedValue({});

    const result = await monitor.evaluateDebitEvent(TENANT_ID, DEBIT_EVENT_ID);

    expect(result.unauthorized).toBe(true);
    expect(result.violations.some((v) => v.type === 'AMOUNT_OVER_TOLERANCE')).toBe(true);
  });

  it('detects FREQUENCY_EXCEEDED when debit is more frequent than authorized', async () => {
    // authorized: weekly (every 7 days), debit frequency: daily (every 1 day)
    prisma.debitEvent.findUnique.mockResolvedValue(
      makeFullDebitEvent({ frequency: 'daily' }),
    );
    prisma.debitEvent.update.mockResolvedValue({});

    const result = await monitor.evaluateDebitEvent(TENANT_ID, DEBIT_EVENT_ID);

    expect(result.unauthorized).toBe(true);
    expect(result.violations.some((v) => v.type === 'FREQUENCY_EXCEEDED')).toBe(true);
  });

  it('detects SUSPENDED_AUTHORIZATION when authorization is suspended', async () => {
    prisma.debitEvent.findUnique.mockResolvedValue(
      makeFullDebitEvent({}, { status: 'suspended' }),
    );
    prisma.debitEvent.update.mockResolvedValue({});

    const result = await monitor.evaluateDebitEvent(TENANT_ID, DEBIT_EVENT_ID);

    expect(result.unauthorized).toBe(true);
    expect(result.violations.some((v) => v.type === 'SUSPENDED_AUTHORIZATION')).toBe(true);
  });

  it('publishes DEBIT_UNAUTHORIZED_DETECTED with openComplaintCase=true on violation', async () => {
    prisma.debitEvent.findUnique.mockResolvedValue(
      makeFullDebitEvent({}, { status: 'revoked', revokedAt: new Date() }),
    );
    prisma.debitEvent.update.mockResolvedValue({});

    await monitor.evaluateDebitEvent(TENANT_ID, DEBIT_EVENT_ID);

    expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();
    const [, envelope] = eventBus.publishAndPersist.mock.calls[0];
    expect(envelope.eventType).toBe(EVENT_TYPES.DEBIT_UNAUTHORIZED_DETECTED);
    expect(envelope.payload.openComplaintCase).toBe(true);
    expect(envelope.payload.complaintCategory).toBe('unauthorized_ach_debit');
  });

  it('updates debitEvent.flagged when violation found on a previously clean event', async () => {
    prisma.debitEvent.findUnique.mockResolvedValue(
      makeFullDebitEvent({ flagged: false }, { status: 'revoked', revokedAt: new Date() }),
    );
    prisma.debitEvent.update.mockResolvedValue({});

    await monitor.evaluateDebitEvent(TENANT_ID, DEBIT_EVENT_ID);

    expect(prisma.debitEvent.update).toHaveBeenCalledOnce();
    const updateArgs = prisma.debitEvent.update.mock.calls[0][0];
    expect(updateArgs.data.flagged).toBe(true);
    expect(updateArgs.data.isWithinTolerance).toBe(false);
  });

  it('returns empty result when debit event is not found', async () => {
    prisma.debitEvent.findUnique.mockResolvedValue(null);

    const result = await monitor.evaluateDebitEvent(TENANT_ID, 'ghost-event');

    expect(result.unauthorized).toBe(false);
    expect(result.debitEvent).toBeNull();
  });

  it('skips evaluation when tenant does not match', async () => {
    prisma.debitEvent.findUnique.mockResolvedValue(
      makeFullDebitEvent({}, {}),
    );
    // Override business tenantId to a different tenant
    prisma.debitEvent.findUnique.mockResolvedValue({
      ...makeDebitEvent(),
      authorization: {
        ...makeAuthorization(),
        business: { id: BUSINESS_ID, tenantId: 'other-tenant' },
      },
    });

    const result = await monitor.evaluateDebitEvent(TENANT_ID, DEBIT_EVENT_ID);

    expect(result.unauthorized).toBe(false);
    expect(eventBus.publishAndPersist).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────

describe('DebitMonitor — handleUnknownProcessorDebit', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let monitor: DebitMonitor;

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    monitor = new DebitMonitor(prisma as never, eventBus as never);
  });

  it('detects UNKNOWN_PROCESSOR when no active authorization exists for processor', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    prisma.achAuthorization.findFirst.mockResolvedValue(null); // no match

    const result = await monitor.handleUnknownProcessorDebit({
      tenantId: TENANT_ID,
      businessId: BUSINESS_ID,
      processorName: 'Rogue MCA LLC',
      amount: 2000,
      processedAt: '2026-01-10T10:00:00Z',
    });

    expect(result.unauthorized).toBe(true);
    expect(result.violations.some((v) => v.type === 'UNKNOWN_PROCESSOR')).toBe(true);
  });

  it('publishes DEBIT_UNAUTHORIZED_DETECTED for unknown processor', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    prisma.achAuthorization.findFirst.mockResolvedValue(null);

    await monitor.handleUnknownProcessorDebit({
      tenantId: TENANT_ID,
      businessId: BUSINESS_ID,
      processorName: 'Rogue MCA LLC',
      amount: 2000,
      processedAt: '2026-01-10T10:00:00Z',
    });

    expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();
    const [, envelope] = eventBus.publishAndPersist.mock.calls[0];
    expect(envelope.eventType).toBe(EVENT_TYPES.DEBIT_UNAUTHORIZED_DETECTED);
    expect(envelope.payload.violationType).toBe('UNKNOWN_PROCESSOR');
  });

  it('returns unauthorized=false when an active authorization exists for the processor', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    prisma.achAuthorization.findFirst.mockResolvedValue(makeAuthorization());

    const result = await monitor.handleUnknownProcessorDebit({
      tenantId: TENANT_ID,
      businessId: BUSINESS_ID,
      processorName: 'Rapid Capital ACH',  // matches authorization
      amount: 500,
      processedAt: '2026-01-10T10:00:00Z',
    });

    expect(result.unauthorized).toBe(false);
    expect(eventBus.publishAndPersist).not.toHaveBeenCalled();
  });

  it('throws when business is not found', async () => {
    prisma.business.findFirst.mockResolvedValue(null);

    await expect(
      monitor.handleUnknownProcessorDebit({
        tenantId: TENANT_ID,
        businessId: 'ghost',
        processorName: 'Any Processor',
        amount: 500,
        processedAt: '2026-01-10T10:00:00Z',
      }),
    ).rejects.toThrow(/not found/);
  });
});

// ─────────────────────────────────────────────────────────────

describe('DebitMonitor — reconcileBusiness', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let monitor: DebitMonitor;

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    monitor = new DebitMonitor(prisma as never, eventBus as never);
  });

  it('scans all debit events and returns violation count', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    prisma.debitEvent.findMany.mockResolvedValue([
      { id: 'debit-A' },
      { id: 'debit-B' },
    ]);

    // First event: clean. Second event: revoked auth (violation).
    prisma.debitEvent.findUnique
      .mockResolvedValueOnce({
        ...makeDebitEvent({ id: 'debit-A' }),
        authorization: {
          ...makeAuthorization(),
          business: { id: BUSINESS_ID, tenantId: TENANT_ID },
        },
      })
      .mockResolvedValueOnce({
        ...makeDebitEvent({ id: 'debit-B' }),
        authorization: {
          ...makeAuthorization({ status: 'revoked', revokedAt: new Date() }),
          business: { id: BUSINESS_ID, tenantId: TENANT_ID },
        },
      });

    prisma.debitEvent.update.mockResolvedValue({});

    const summary = await monitor.reconcileBusiness(
      TENANT_ID,
      BUSINESS_ID,
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(summary.scanned).toBe(2);
    expect(summary.violations).toBe(1);
    expect(summary.results).toHaveLength(2);
  });

  it('returns zero violations when all events are clean', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    prisma.debitEvent.findMany.mockResolvedValue([{ id: 'debit-A' }]);
    prisma.debitEvent.findUnique.mockResolvedValue({
      ...makeDebitEvent({ id: 'debit-A' }),
      authorization: {
        ...makeAuthorization(),
        business: { id: BUSINESS_ID, tenantId: TENANT_ID },
      },
    });

    const summary = await monitor.reconcileBusiness(
      TENANT_ID,
      BUSINESS_ID,
      new Date('2026-01-01'),
    );

    expect(summary.violations).toBe(0);
  });

  it('throws when business is not found', async () => {
    prisma.business.findFirst.mockResolvedValue(null);

    await expect(
      monitor.reconcileBusiness(TENANT_ID, 'ghost', new Date()),
    ).rejects.toThrow(/not found/);
  });
});
