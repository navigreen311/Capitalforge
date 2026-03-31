// ============================================================
// Unit Tests — LedgerService
// Run standalone: npx vitest run tests/unit/services/ledger.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LedgerService } from '../../../src/backend/events/ledger.service.js';
import type { LedgerEnvelope } from '../../../src/backend/events/event-types.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../../../src/shared/constants/index.js';

// ----------------------------------------------------------------
// Prisma mock factory
// ----------------------------------------------------------------

/**
 * Returns a mock PrismaClient with all ledgerEvent methods stubbed.
 * Pass override functions to customise behaviour per-test.
 */
function makePrismaMock(overrides: {
  create?: ReturnType<typeof vi.fn>;
  findMany?: ReturnType<typeof vi.fn>;
  updateMany?: ReturnType<typeof vi.fn>;
} = {}) {
  const fixedDate = new Date('2026-03-31T12:00:00Z');
  const fixedId = 'ledger-evt-uuid-001';

  const create = overrides.create ?? vi.fn().mockResolvedValue({
    id: fixedId,
    tenantId: 'tenant-test',
    eventType: EVENT_TYPES.CONSENT_CAPTURED,
    aggregateType: AGGREGATE_TYPES.CONSENT,
    aggregateId: 'consent-001',
    payload: {},
    metadata: {},
    version: 1,
    publishedAt: fixedDate,
    processedAt: null,
  });

  const findMany = overrides.findMany ?? vi.fn().mockResolvedValue([]);
  const updateMany = overrides.updateMany ?? vi.fn().mockResolvedValue({ count: 1 });

  const prisma = {
    ledgerEvent: { create, findMany, updateMany },
  } as unknown as import('@prisma/client').PrismaClient;

  return { prisma, create, findMany, updateMany, fixedDate, fixedId };
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function makeEnvelope(overrides: Partial<LedgerEnvelope> = {}): LedgerEnvelope {
  return {
    tenantId: 'tenant-test',
    eventType: EVENT_TYPES.CONSENT_CAPTURED,
    aggregateType: AGGREGATE_TYPES.CONSENT,
    aggregateId: 'consent-001',
    payload: { channel: 'email' },
    metadata: { source: 'unit-test' },
    version: 1,
    ...overrides,
  };
}

// ----------------------------------------------------------------
// persist()
// ----------------------------------------------------------------

describe('LedgerService — persist()', () => {
  it('writes the event to the database via prisma.ledgerEvent.create', async () => {
    const { prisma, create, fixedId, fixedDate } = makePrismaMock();
    const svc = new LedgerService(prisma);

    const result = await svc.persist(makeEnvelope());

    expect(create).toHaveBeenCalledOnce();
    expect(result.id).toBe(fixedId);
    expect(result.publishedAt).toEqual(fixedDate);
  });

  it('passes all envelope fields to Prisma create', async () => {
    const { prisma, create } = makePrismaMock();
    const svc = new LedgerService(prisma);

    const envelope = makeEnvelope({
      eventType: EVENT_TYPES.APPLICATION_SUBMITTED,
      aggregateType: AGGREGATE_TYPES.APPLICATION,
      aggregateId: 'app-xyz',
      payload: { issuer: 'Chase' },
      metadata: { ip: '127.0.0.1' },
      version: 3,
    });

    await svc.persist(envelope);

    const data = create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('tenant-test');
    expect(data.eventType).toBe(EVENT_TYPES.APPLICATION_SUBMITTED);
    expect(data.aggregateType).toBe(AGGREGATE_TYPES.APPLICATION);
    expect(data.aggregateId).toBe('app-xyz');
    expect(data.payload).toEqual({ issuer: 'Chase' });
    expect(data.metadata).toEqual({ ip: '127.0.0.1' });
    expect(data.version).toBe(3);
  });

  it('defaults version to 1 when not provided', async () => {
    const { prisma, create } = makePrismaMock();
    const svc = new LedgerService(prisma);

    const { version: _omitted, ...noVersion } = makeEnvelope();
    await svc.persist(noVersion as LedgerEnvelope);

    expect(create.mock.calls[0][0].data.version).toBe(1);
  });

  it('defaults metadata to {} when not provided', async () => {
    const { prisma, create } = makePrismaMock();
    const svc = new LedgerService(prisma);

    const envelope: LedgerEnvelope = makeEnvelope({ metadata: undefined });
    await svc.persist(envelope);

    expect(create.mock.calls[0][0].data.metadata).toEqual({});
  });

  it('throws when tenantId is empty', async () => {
    const { prisma } = makePrismaMock();
    const svc = new LedgerService(prisma);

    await expect(svc.persist(makeEnvelope({ tenantId: '' }))).rejects.toThrow(
      /tenantId is required/,
    );
  });

  it('does NOT call update after create (immutability — no mutation path)', async () => {
    const { prisma, updateMany } = makePrismaMock();
    const svc = new LedgerService(prisma);

    await svc.persist(makeEnvelope());

    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// getByAggregate()
// ----------------------------------------------------------------

describe('LedgerService — getByAggregate()', () => {
  it('queries with correct tenantId, aggregateType, aggregateId', async () => {
    const { prisma, findMany } = makePrismaMock({ findMany: vi.fn().mockResolvedValue([]) });
    const svc = new LedgerService(prisma);

    await svc.getByAggregate({
      tenantId: 'tenant-A',
      aggregateType: AGGREGATE_TYPES.CONSENT,
      aggregateId: 'consent-42',
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant-A');
    expect(where.aggregateType).toBe(AGGREGATE_TYPES.CONSENT);
    expect(where.aggregateId).toBe('consent-42');
  });

  it('orders results by publishedAt ascending (chronological replay order)', async () => {
    const { prisma, findMany } = makePrismaMock({ findMany: vi.fn().mockResolvedValue([]) });
    const svc = new LedgerService(prisma);

    await svc.getByAggregate({
      tenantId: 'tenant-A',
      aggregateType: AGGREGATE_TYPES.CONSENT,
      aggregateId: 'consent-42',
    });

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ publishedAt: 'asc' });
  });

  it('maps Prisma rows to PersistedEvent shape', async () => {
    const publishedAt = new Date('2026-01-15T08:00:00Z');
    const rows = [
      {
        id: 'row-1',
        tenantId: 'tenant-A',
        eventType: EVENT_TYPES.CONSENT_CAPTURED,
        aggregateType: AGGREGATE_TYPES.CONSENT,
        aggregateId: 'consent-42',
        payload: { channel: 'voice' },
        metadata: {},
        version: 1,
        publishedAt,
        processedAt: null,
      },
    ];
    const { prisma } = makePrismaMock({ findMany: vi.fn().mockResolvedValue(rows) });
    const svc = new LedgerService(prisma);

    const events = await svc.getByAggregate({
      tenantId: 'tenant-A',
      aggregateType: AGGREGATE_TYPES.CONSENT,
      aggregateId: 'consent-42',
    });

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('row-1');
    expect(events[0].publishedAt).toEqual(publishedAt);
    expect(events[0].payload).toEqual({ channel: 'voice' });
  });

  it('applies default limit of 100', async () => {
    const { prisma, findMany } = makePrismaMock({ findMany: vi.fn().mockResolvedValue([]) });
    const svc = new LedgerService(prisma);

    await svc.getByAggregate({
      tenantId: 'tenant-A',
      aggregateType: AGGREGATE_TYPES.CONSENT,
      aggregateId: 'consent-42',
    });

    expect(findMany.mock.calls[0][0].take).toBe(100);
  });

  it('respects custom limit and offset', async () => {
    const { prisma, findMany } = makePrismaMock({ findMany: vi.fn().mockResolvedValue([]) });
    const svc = new LedgerService(prisma);

    await svc.getByAggregate({
      tenantId: 'tenant-A',
      aggregateType: AGGREGATE_TYPES.CONSENT,
      aggregateId: 'consent-42',
      limit: 10,
      offset: 20,
    });

    expect(findMany.mock.calls[0][0].take).toBe(10);
    expect(findMany.mock.calls[0][0].skip).toBe(20);
  });

  it('throws when tenantId is empty', async () => {
    const { prisma } = makePrismaMock();
    const svc = new LedgerService(prisma);

    await expect(
      svc.getByAggregate({ tenantId: '', aggregateType: 'business', aggregateId: 'b1' }),
    ).rejects.toThrow(/tenantId is required/);
  });
});

// ----------------------------------------------------------------
// getByTenant()
// ----------------------------------------------------------------

describe('LedgerService — getByTenant()', () => {
  it('filters by tenantId', async () => {
    const { prisma, findMany } = makePrismaMock({ findMany: vi.fn().mockResolvedValue([]) });
    const svc = new LedgerService(prisma);

    await svc.getByTenant({ tenantId: 'tenant-B' });

    expect(findMany.mock.calls[0][0].where.tenantId).toBe('tenant-B');
  });

  it('adds eventType filter when provided', async () => {
    const { prisma, findMany } = makePrismaMock({ findMany: vi.fn().mockResolvedValue([]) });
    const svc = new LedgerService(prisma);

    await svc.getByTenant({
      tenantId: 'tenant-B',
      eventType: EVENT_TYPES.CONSENT_CAPTURED,
    });

    expect(findMany.mock.calls[0][0].where.eventType).toBe(EVENT_TYPES.CONSENT_CAPTURED);
  });

  it('adds since filter when provided as a Date', async () => {
    const { prisma, findMany } = makePrismaMock({ findMany: vi.fn().mockResolvedValue([]) });
    const svc = new LedgerService(prisma);
    const since = new Date('2026-01-01');

    await svc.getByTenant({ tenantId: 'tenant-B', since });

    expect(findMany.mock.calls[0][0].where.publishedAt).toEqual({ gte: since });
  });

  it('adds since filter when provided as an ISO string', async () => {
    const { prisma, findMany } = makePrismaMock({ findMany: vi.fn().mockResolvedValue([]) });
    const svc = new LedgerService(prisma);

    await svc.getByTenant({ tenantId: 'tenant-B', since: '2026-01-01T00:00:00Z' });

    const gte = findMany.mock.calls[0][0].where.publishedAt?.gte;
    expect(gte).toBeInstanceOf(Date);
    expect((gte as Date).getFullYear()).toBe(2026);
  });

  it('does not add since filter when omitted', async () => {
    const { prisma, findMany } = makePrismaMock({ findMany: vi.fn().mockResolvedValue([]) });
    const svc = new LedgerService(prisma);

    await svc.getByTenant({ tenantId: 'tenant-B' });

    expect(findMany.mock.calls[0][0].where.publishedAt).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// markProcessed()
// ----------------------------------------------------------------

describe('LedgerService — markProcessed()', () => {
  it('calls updateMany with the correct id and tenantId', async () => {
    const { prisma, updateMany } = makePrismaMock();
    const svc = new LedgerService(prisma);

    await svc.markProcessed('evt-123', 'tenant-A');

    expect(updateMany).toHaveBeenCalledOnce();
    const call = updateMany.mock.calls[0][0];
    expect(call.where.id).toBe('evt-123');
    expect(call.where.tenantId).toBe('tenant-A');
    expect(call.data.processedAt).toBeInstanceOf(Date);
  });

  it('does NOT update payload or any other immutable fields', async () => {
    const { prisma, updateMany } = makePrismaMock();
    const svc = new LedgerService(prisma);

    await svc.markProcessed('evt-123', 'tenant-A');

    const data = updateMany.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['processedAt']);
  });

  it('throws when tenantId is empty', async () => {
    const { prisma } = makePrismaMock();
    const svc = new LedgerService(prisma);

    await expect(svc.markProcessed('evt-123', '')).rejects.toThrow(
      /tenantId is required/,
    );
  });
});

// ----------------------------------------------------------------
// Immutability contract
// ----------------------------------------------------------------

describe('LedgerService — immutability contract', () => {
  it('persist does not expose any delete or update method', () => {
    const { prisma } = makePrismaMock();
    const svc = new LedgerService(prisma);

    // Ensure there is no "update" or "delete" method on LedgerService itself
    // (markProcessed only touches processedAt — not core event data)
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(svc));
    expect(proto).not.toContain('delete');
    expect(proto).not.toContain('updateEvent');
    expect(proto).not.toContain('upsert');
  });

  it('a second persist call creates a second independent row', async () => {
    let callCount = 0;
    const create = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        id: `id-${callCount}`,
        tenantId: 'tenant-A',
        eventType: EVENT_TYPES.CONSENT_CAPTURED,
        aggregateType: AGGREGATE_TYPES.CONSENT,
        aggregateId: 'c1',
        payload: {},
        metadata: {},
        version: callCount,
        publishedAt: new Date(),
        processedAt: null,
      };
    });

    const { prisma } = makePrismaMock({ create });
    const svc = new LedgerService(prisma);

    const r1 = await svc.persist(makeEnvelope({ version: 1 }));
    const r2 = await svc.persist(makeEnvelope({ version: 2 }));

    expect(r1.id).toBe('id-1');
    expect(r2.id).toBe('id-2');
    expect(create).toHaveBeenCalledTimes(2);
  });
});
