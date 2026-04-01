// ============================================================
// CapitalForge — E2E: ACH / Debit Authorization Lifecycle
//
// Covers the full ACH authorization compliance lifecycle:
//   create authorization → record debit (within/over tolerance) →
//   revoke authorization → post-revocation debit detection →
//   auto-open complaint case → debit monitor batch reconciliation
//
// Compliance references enforced:
//   • NACHA Operating Rules §2.3
//   • Yellowstone Capital FTC settlement (2020)
//   • RCG Advances FTC ban
//
// All Prisma calls are mocked. Services are tested with real logic
// wired to injected mocks — no HTTP layer involved.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createFullTestBusiness,
  cleanupTestBusiness,
  createEventBusSpy,
  type TestBusinessGraph,
} from './helpers/test-setup.js';

// ── Service imports ───────────────────────────────────────────
import {
  AchControlsService,
  type CreateAuthorizationInput,
  type RevokeAuthorizationInput,
  type RecordDebitEventInput,
} from '../../src/backend/services/ach-controls.service.js';
import {
  DebitMonitor,
} from '../../src/backend/services/debit-monitor.js';
import { eventBus } from '../../src/backend/events/event-bus.js';

// ── Shared authorization fixture factory ─────────────────────

function makeAuthorizationRecord(
  businessId: string,
  overrides: Partial<{
    id: string;
    status: string;
    authorizedAmount: number;
    authorizedFrequency: string;
    revokedAt: Date | null;
    revocationNotifiedAt: Date | null;
  }> = {},
) {
  return {
    id:                   overrides.id          ?? `auth-${businessId}`,
    businessId,
    processorName:        'Stripe ACH',
    authorizedAmount:     overrides.authorizedAmount     ?? 2_500,
    authorizedFrequency:  overrides.authorizedFrequency  ?? 'monthly',
    signedDocumentRef:    `ach-doc-ref-${businessId}`,
    authorizedAt:         new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    status:               overrides.status               ?? 'active',
    revokedAt:            overrides.revokedAt            ?? null,
    revocationNotifiedAt: overrides.revocationNotifiedAt ?? null,
    createdAt:            new Date(),
    updatedAt:            new Date(),
  };
}

function makeDebitEventRecord(
  authorizationId: string,
  businessId: string,
  tenantId: string,
  overrides: Partial<{
    id: string;
    amount: number;
    flagged: boolean;
    isWithinTolerance: boolean;
    flagReason: string | null;
    frequency: string | null;
    processedAt: Date;
  }> = {},
) {
  return {
    id:               overrides.id               ?? `debit-evt-${Date.now()}`,
    authorizationId,
    amount:           overrides.amount            ?? 2_500,
    frequency:        overrides.frequency         ?? 'monthly',
    isWithinTolerance: overrides.isWithinTolerance ?? true,
    flagged:          overrides.flagged           ?? false,
    flagReason:       overrides.flagReason        ?? null,
    processedAt:      overrides.processedAt       ?? new Date(),
    createdAt:        new Date(),
    updatedAt:        new Date(),
    // For DebitMonitor.evaluateDebitEvent includes:
    authorization: {
      ...makeAuthorizationRecord(businessId, { id: authorizationId }),
      business: { id: businessId, tenantId },
    },
  };
}

// ── Test suite ─────────────────────────────────────────────────

describe('E2E: ACH Debit Authorization Lifecycle', () => {
  let graph: TestBusinessGraph;

  beforeEach(() => {
    graph = createFullTestBusiness({
      tenantIdSuffix: 'ach',
      kybVerified:    true,
      kycVerified:    true,
      withConsent:    true,
    });
  });

  afterEach(() => {
    cleanupTestBusiness(graph);
    vi.restoreAllMocks();
  });

  // ── Test 1: Create ACH authorization with signed document ─

  it('creates an ACH authorization with a signed document reference', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new AchControlsService(graph.prisma, eventBus);

    const authRecord = makeAuthorizationRecord(graph.business.id);

    graph.prisma.business.findFirst = vi.fn().mockResolvedValue({
      id: graph.business.id,
      legalName: graph.business.legalName,
    });
    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      create: vi.fn().mockResolvedValue(authRecord),
    } as never;

    const input: CreateAuthorizationInput = {
      tenantId:            graph.tenant.id,
      businessId:          graph.business.id,
      processorName:       'Stripe ACH',
      authorizedAmount:    2_500,
      authorizedFrequency: 'monthly',
      signedDocumentRef:   `ach-doc-ref-${graph.business.id}`,
      authorizedAt:        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const auth = await svc.createAuthorization(input);

    expect(auth.id).toBeDefined();
    expect(auth.processorName).toBe('Stripe ACH');
    expect(graph.prisma.achAuthorization.create).toHaveBeenCalledOnce();
    spy.assertEventFired('debit.authorized');
    spy.restore();
  });

  // ── Test 2: Authorization rejected with missing signed doc ─

  it('rejects authorization creation when signedDocumentRef is absent', async () => {
    const svc = new AchControlsService(graph.prisma, eventBus);

    const input: CreateAuthorizationInput = {
      tenantId:            graph.tenant.id,
      businessId:          graph.business.id,
      processorName:       'Stripe ACH',
      authorizedAmount:    2_500,
      authorizedFrequency: 'monthly',
      signedDocumentRef:   '',
      authorizedAt:        new Date().toISOString(),
    };

    await expect(svc.createAuthorization(input)).rejects.toThrow(
      /signedDocumentRef is required/i,
    );
  });

  // ── Test 3: Debit within tolerance passes (no flag) ───────

  it('records a debit within the 10% tolerance and does not flag it', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new AchControlsService(graph.prisma, eventBus);

    const authRecord = makeAuthorizationRecord(graph.business.id);
    const debitRecord = makeDebitEventRecord(
      authRecord.id, graph.business.id, graph.tenant.id,
      { amount: 2_500, flagged: false, isWithinTolerance: true },
    );

    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      findUnique: vi.fn().mockResolvedValue({
        ...authRecord,
        business: { tenantId: graph.tenant.id, id: graph.business.id },
      }),
    } as never;
    graph.prisma.debitEvent = {
      ...graph.prisma.debitEvent,
      create: vi.fn().mockResolvedValue(debitRecord),
    } as never;

    const input: RecordDebitEventInput = {
      tenantId:        graph.tenant.id,
      authorizationId: authRecord.id,
      amount:          2_500,
      frequency:       'monthly',
      processedAt:     new Date().toISOString(),
    };

    const result = await svc.recordDebitEvent(input);

    expect(result.flagged).toBe(false);
    expect(result.isWithinTolerance).toBe(true);
    expect(result.flagReasons).toHaveLength(0);
    spy.restore();
  });

  // ── Test 4: Debit exceeding 10% tolerance flags and alerts ─

  it('flags a debit exceeding the 10% tolerance band and emits unauthorized alert', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new AchControlsService(graph.prisma, eventBus);

    const authRecord = makeAuthorizationRecord(graph.business.id, {
      authorizedAmount: 2_500,
    });
    const overageDebit = makeDebitEventRecord(
      authRecord.id, graph.business.id, graph.tenant.id,
      { amount: 2_900, flagged: true, isWithinTolerance: false }, // 16% over
    );

    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      findUnique: vi.fn().mockResolvedValue({
        ...authRecord,
        business: { tenantId: graph.tenant.id, id: graph.business.id },
      }),
    } as never;
    graph.prisma.debitEvent = {
      ...graph.prisma.debitEvent,
      create: vi.fn().mockResolvedValue(overageDebit),
    } as never;

    const input: RecordDebitEventInput = {
      tenantId:        graph.tenant.id,
      authorizationId: authRecord.id,
      amount:          2_900, // 16% over authorized $2,500
      frequency:       'monthly',
      processedAt:     new Date().toISOString(),
    };

    const result = await svc.recordDebitEvent(input);

    expect(result.flagged).toBe(true);
    expect(result.isWithinTolerance).toBe(false);
    expect(result.flagReasons.length).toBeGreaterThan(0);
    expect(result.flagReasons[0]).toMatch(/exceeds authorized/i);
    spy.assertEventFired('debit.unauthorized.detected');
    spy.restore();
  });

  // ── Test 5: Frequency mismatch is flagged ─────────────────

  it('flags a debit when frequency does not match the authorization', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new AchControlsService(graph.prisma, eventBus);

    const authRecord = makeAuthorizationRecord(graph.business.id, {
      authorizedFrequency: 'monthly',
    });
    const mismatchDebit = makeDebitEventRecord(
      authRecord.id, graph.business.id, graph.tenant.id,
      { amount: 2_500, frequency: 'weekly', flagged: true, isWithinTolerance: false },
    );

    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      findUnique: vi.fn().mockResolvedValue({
        ...authRecord,
        business: { tenantId: graph.tenant.id, id: graph.business.id },
      }),
    } as never;
    graph.prisma.debitEvent = {
      ...graph.prisma.debitEvent,
      create: vi.fn().mockResolvedValue(mismatchDebit),
    } as never;

    const input: RecordDebitEventInput = {
      tenantId:        graph.tenant.id,
      authorizationId: authRecord.id,
      amount:          2_500,
      frequency:       'weekly', // authorized was 'monthly'
      processedAt:     new Date().toISOString(),
    };

    const result = await svc.recordDebitEvent(input);

    expect(result.flagged).toBe(true);
    const freqReason = result.flagReasons.find((r) => /frequency/i.test(r));
    expect(freqReason).toBeDefined();
    spy.restore();
  });

  // ── Test 6: Revoke authorization with cascade notification ─

  it('revokes authorization and emits DEBIT_REVOKED event for processor cascade', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new AchControlsService(graph.prisma, eventBus);

    const activeAuth = makeAuthorizationRecord(graph.business.id, { status: 'active' });
    const revokedAuth = makeAuthorizationRecord(graph.business.id, {
      status:               'revoked',
      revokedAt:            new Date(),
      revocationNotifiedAt: new Date(),
    });

    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      findFirst: vi.fn().mockResolvedValue(activeAuth),
      update:    vi.fn().mockResolvedValue(revokedAuth),
    } as never;

    const input: RevokeAuthorizationInput = {
      tenantId:          graph.tenant.id,
      businessId:        graph.business.id,
      authorizationId:   activeAuth.id,
      revokedBy:         graph.advisorUser.id,
      revocationReason:  'Client requested revocation — closing business account.',
    };

    const revoked = await svc.revokeAuthorization(input);

    expect(revoked.status).toBe('revoked');
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(revoked.revocationNotifiedAt).toBeInstanceOf(Date);
    spy.assertEventFired('debit.revoked');
    spy.restore();
  });

  // ── Test 7: Revoke already-revoked authorization is rejected

  it('throws when attempting to revoke an already-revoked authorization', async () => {
    const svc = new AchControlsService(graph.prisma, eventBus);

    const alreadyRevoked = makeAuthorizationRecord(graph.business.id, {
      status:    'revoked',
      revokedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      findFirst: vi.fn().mockResolvedValue(alreadyRevoked),
    } as never;

    const input: RevokeAuthorizationInput = {
      tenantId:          graph.tenant.id,
      businessId:        graph.business.id,
      authorizationId:   alreadyRevoked.id,
      revokedBy:         graph.advisorUser.id,
      revocationReason:  'Duplicate revocation attempt.',
    };

    await expect(svc.revokeAuthorization(input)).rejects.toThrow(/already revoked/i);
  });

  // ── Test 8: Post-revocation debit detection ───────────────

  it('detects a debit on a revoked authorization as unauthorized', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new AchControlsService(graph.prisma, eventBus);

    const revokedAuth = makeAuthorizationRecord(graph.business.id, {
      status:    'revoked',
      revokedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // revoked 2 hours ago
    });
    const postRevDebit = makeDebitEventRecord(
      revokedAuth.id, graph.business.id, graph.tenant.id,
      { amount: 2_500, flagged: true, isWithinTolerance: false,
        flagReason: 'Debit received after authorization was revoked.' },
    );

    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      findUnique: vi.fn().mockResolvedValue({
        ...revokedAuth,
        business: { tenantId: graph.tenant.id, id: graph.business.id },
      }),
    } as never;
    graph.prisma.debitEvent = {
      ...graph.prisma.debitEvent,
      create: vi.fn().mockResolvedValue(postRevDebit),
    } as never;

    const input: RecordDebitEventInput = {
      tenantId:        graph.tenant.id,
      authorizationId: revokedAuth.id,
      amount:          2_500,
      frequency:       'monthly',
      processedAt:     new Date().toISOString(),
    };

    const result = await svc.recordDebitEvent(input);

    expect(result.flagged).toBe(true);
    const postRevReason = result.flagReasons.find((r) => /revoked/i.test(r));
    expect(postRevReason).toBeDefined();
    spy.assertEventFired('debit.unauthorized.detected');
    spy.restore();
  });

  // ── Test 9: Auto-open complaint case on unauthorized debit ─

  it('payload of DEBIT_UNAUTHORIZED_DETECTED includes openComplaintCase flag', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new AchControlsService(graph.prisma, eventBus);

    const revokedAuth = makeAuthorizationRecord(graph.business.id, { status: 'revoked' });
    const debitRecord = makeDebitEventRecord(
      revokedAuth.id, graph.business.id, graph.tenant.id,
      { amount: 2_500, flagged: true, isWithinTolerance: false },
    );

    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      findUnique: vi.fn().mockResolvedValue({
        ...revokedAuth,
        business: { tenantId: graph.tenant.id, id: graph.business.id },
      }),
    } as never;
    graph.prisma.debitEvent = {
      ...graph.prisma.debitEvent,
      create: vi.fn().mockResolvedValue(debitRecord),
    } as never;

    await svc.recordDebitEvent({
      tenantId:        graph.tenant.id,
      authorizationId: revokedAuth.id,
      amount:          2_500,
      frequency:       'monthly',
      processedAt:     new Date().toISOString(),
    });

    const alertEvent = spy.findEvent('debit.unauthorized.detected');
    expect(alertEvent).toBeDefined();
    expect((alertEvent!.payload as Record<string, unknown>).openComplaintCase).toBe(true);
    expect((alertEvent!.payload as Record<string, unknown>).complaintCategory).toBe('unauthorized_ach_debit');
    spy.restore();
  });

  // ── Test 10: Pre-debit confirmation check ─────────────────

  it('pre-debit confirmation approves within-tolerance amount', async () => {
    const svc = new AchControlsService(graph.prisma, eventBus);

    const activeAuth = makeAuthorizationRecord(graph.business.id, { authorizedAmount: 2_500 });

    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      findFirst: vi.fn().mockResolvedValue(activeAuth),
    } as never;

    const check = await svc.preDebitConfirmation(
      graph.tenant.id,
      activeAuth.id,
      2_500, // exact authorized amount
      'monthly',
    );

    expect(check.allowed).toBe(true);
    expect(check.reasons).toHaveLength(0);
  });

  // ── Test 11: Pre-debit confirmation blocks over-tolerance ─

  it('pre-debit confirmation blocks amount exceeding 10% tolerance', async () => {
    const svc = new AchControlsService(graph.prisma, eventBus);

    const activeAuth = makeAuthorizationRecord(graph.business.id, { authorizedAmount: 2_500 });

    graph.prisma.achAuthorization = {
      ...graph.prisma.achAuthorization,
      findFirst: vi.fn().mockResolvedValue(activeAuth),
    } as never;

    const check = await svc.preDebitConfirmation(
      graph.tenant.id,
      activeAuth.id,
      3_000, // 20% over — beyond 10% tolerance
      'monthly',
    );

    expect(check.allowed).toBe(false);
    expect(check.reasons.length).toBeGreaterThan(0);
    expect(check.reasons[0]).toMatch(/tolerance/i);
  });

  // ── Test 12: Debit monitor batch reconciliation ───────────

  it('debit monitor reconciles a date range and reports violations', async () => {
    const spy = createEventBusSpy(eventBus);
    const monitor = new DebitMonitor(graph.prisma, eventBus);

    const revokedAuth = makeAuthorizationRecord(graph.business.id, { status: 'revoked' });
    const violationDebit = makeDebitEventRecord(
      revokedAuth.id, graph.business.id, graph.tenant.id,
      { amount: 2_500, flagged: false }, // not yet flagged — monitor will flag it
    );

    // business lookup for reconciliation
    graph.prisma.business.findFirst = vi.fn().mockResolvedValue({
      id: graph.business.id,
    });

    // findMany returns list of event IDs for the date range.
    // findUnique must return the debit event with the REVOKED authorization embedded,
    // so detectViolations sees status === 'revoked' and triggers POST_REVOCATION_DEBIT.
    const violationDebitWithRevokedAuth = {
      ...violationDebit,
      authorization: {
        ...revokedAuth,
        business: { id: graph.business.id, tenantId: graph.tenant.id },
      },
    };
    graph.prisma.debitEvent = {
      ...graph.prisma.debitEvent,
      findMany: vi.fn().mockResolvedValue([{ id: violationDebit.id }]),
      findUnique: vi.fn().mockResolvedValue(violationDebitWithRevokedAuth),
      update: vi.fn().mockResolvedValue({ ...violationDebitWithRevokedAuth, flagged: true }),
    } as never;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const until = new Date();

    const summary = await monitor.reconcileBusiness(
      graph.tenant.id,
      graph.business.id,
      since,
      until,
    );

    expect(summary.scanned).toBe(1);
    expect(summary.results).toHaveLength(1);
    // The revoked authorization triggers POST_REVOCATION_DEBIT violation
    expect(summary.violations).toBe(1);
    spy.restore();
  });
});
