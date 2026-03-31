// ============================================================
// Unit Tests — EventBus
// Run standalone: npx vitest run tests/unit/services/event-bus.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../../src/backend/events/event-bus.js';
import type { LedgerWriter } from '../../../src/backend/events/event-bus.js';
import type { LedgerEnvelope } from '../../../src/backend/events/event-types.js';
import type { LedgerEventPayload } from '../../../src/shared/types/index.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../../../src/shared/constants/index.js';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function makeEnvelope(
  overrides: Partial<Omit<LedgerEnvelope, 'tenantId'>> = {},
): Omit<LedgerEnvelope, 'tenantId'> {
  return {
    eventType: EVENT_TYPES.CONSENT_CAPTURED,
    aggregateType: AGGREGATE_TYPES.CONSENT,
    aggregateId: 'consent-001',
    payload: { channel: 'email' },
    ...overrides,
  };
}

function makeMockWriter(
  id = 'evt-persisted-id',
): { writer: LedgerWriter; persist: ReturnType<typeof vi.fn> } {
  const persist = vi.fn().mockResolvedValue({ id, publishedAt: new Date() });
  const writer: LedgerWriter = { persist };
  return { writer, persist };
}

// ----------------------------------------------------------------
// Setup: reset singleton before every test
// ----------------------------------------------------------------

beforeEach(() => {
  EventBus.reset();
});

// ----------------------------------------------------------------
// Singleton
// ----------------------------------------------------------------

describe('EventBus — singleton', () => {
  it('returns the same instance on successive calls', () => {
    const a = EventBus.getInstance();
    const b = EventBus.getInstance();
    expect(a).toBe(b);
  });

  it('reset() creates a fresh instance with no subscriptions', () => {
    const bus = EventBus.getInstance();
    bus.subscribe('*', vi.fn());
    expect(bus.subscriptionCount).toBe(1);

    EventBus.reset();
    const fresh = EventBus.getInstance();
    expect(fresh.subscriptionCount).toBe(0);
    expect(fresh).not.toBe(bus);
  });
});

// ----------------------------------------------------------------
// subscribe / unsubscribe
// ----------------------------------------------------------------

describe('EventBus — subscribe / unsubscribe', () => {
  it('subscribe returns a unique ID', () => {
    const bus = EventBus.getInstance();
    const id1 = bus.subscribe('consent.captured', vi.fn());
    const id2 = bus.subscribe('consent.captured', vi.fn());
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
  });

  it('unsubscribe removes the handler and returns true', () => {
    const bus = EventBus.getInstance();
    const id = bus.subscribe('consent.captured', vi.fn());
    expect(bus.subscriptionCount).toBe(1);
    const removed = bus.unsubscribe(id);
    expect(removed).toBe(true);
    expect(bus.subscriptionCount).toBe(0);
  });

  it('unsubscribe on unknown ID returns false', () => {
    const bus = EventBus.getInstance();
    expect(bus.unsubscribe('non-existent')).toBe(false);
  });

  it('unsubscribeAll clears every subscription', () => {
    const bus = EventBus.getInstance();
    bus.subscribe('consent.*', vi.fn());
    bus.subscribe('application.*', vi.fn());
    bus.unsubscribeAll();
    expect(bus.subscriptionCount).toBe(0);
  });
});

// ----------------------------------------------------------------
// publish
// ----------------------------------------------------------------

describe('EventBus — publish', () => {
  it('calls a matching exact-topic handler', async () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe(EVENT_TYPES.CONSENT_CAPTURED, handler);

    await bus.publish('tenant-A', makeEnvelope());

    expect(handler).toHaveBeenCalledOnce();
    const arg: LedgerEventPayload = handler.mock.calls[0][0];
    expect(arg.eventType).toBe(EVENT_TYPES.CONSENT_CAPTURED);
    expect(arg.aggregateId).toBe('consent-001');
  });

  it('does NOT call a handler subscribed to a different topic', async () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe(EVENT_TYPES.CONSENT_REVOKED, handler);

    await bus.publish('tenant-A', makeEnvelope({ eventType: EVENT_TYPES.CONSENT_CAPTURED }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('calls all matching handlers (multi-handler)', async () => {
    const bus = EventBus.getInstance();
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);
    const h3 = vi.fn().mockResolvedValue(undefined);

    bus.subscribe(EVENT_TYPES.CONSENT_CAPTURED, h1);
    bus.subscribe(EVENT_TYPES.CONSENT_CAPTURED, h2);
    bus.subscribe(EVENT_TYPES.APPLICATION_SUBMITTED, h3); // should NOT fire

    await bus.publish('tenant-A', makeEnvelope());

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
    expect(h3).not.toHaveBeenCalled();
  });

  it('passes correct payload fields to the handler', async () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('*', handler);

    const envelope = makeEnvelope({
      payload: { amount: 5000, currency: 'USD' },
      metadata: { source: 'test' },
    });
    await bus.publish('tenant-A', envelope);

    const arg: LedgerEventPayload = handler.mock.calls[0][0];
    expect(arg.payload).toEqual({ amount: 5000, currency: 'USD' });
    expect(arg.metadata).toEqual({ source: 'test' });
  });
});

// ----------------------------------------------------------------
// Wildcard subscriptions
// ----------------------------------------------------------------

describe('EventBus — wildcard subscriptions', () => {
  it('"consent.*" matches consent.captured', async () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('consent.*', handler);

    await bus.publish('tenant-A', makeEnvelope({ eventType: 'consent.captured' }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('"consent.*" matches consent.revoked', async () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('consent.*', handler);

    await bus.publish('tenant-A', makeEnvelope({ eventType: 'consent.revoked' }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('"consent.*" does NOT match application.submitted', async () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('consent.*', handler);

    await bus.publish('tenant-A', makeEnvelope({ eventType: 'application.submitted' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('"*" (universal) matches every event', async () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('*', handler);

    await bus.publish('tenant-A', makeEnvelope({ eventType: 'consent.captured' }));
    await bus.publish('tenant-A', makeEnvelope({ eventType: 'application.submitted' }));
    await bus.publish('tenant-A', makeEnvelope({ eventType: 'round.started' }));

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('"compliance.*" matches compliance.check.completed', async () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('compliance.*', handler);

    await bus.publish('tenant-A', makeEnvelope({ eventType: EVENT_TYPES.COMPLIANCE_CHECK_COMPLETED }));
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ----------------------------------------------------------------
// Error isolation — a failing handler must not crash others
// ----------------------------------------------------------------

describe('EventBus — error isolation', () => {
  it('does not throw when a handler rejects', async () => {
    const bus = EventBus.getInstance();
    const bad = vi.fn().mockRejectedValue(new Error('handler boom'));
    const good = vi.fn().mockResolvedValue(undefined);

    bus.subscribe(EVENT_TYPES.CONSENT_CAPTURED, bad);
    bus.subscribe(EVENT_TYPES.CONSENT_CAPTURED, good);

    await expect(bus.publish('tenant-A', makeEnvelope())).resolves.not.toThrow();
  });

  it('still calls subsequent handlers after one throws', async () => {
    const bus = EventBus.getInstance();
    const bad = vi.fn().mockRejectedValue(new Error('oops'));
    const good = vi.fn().mockResolvedValue(undefined);

    bus.subscribe('*', bad);
    bus.subscribe('*', good);

    await bus.publish('tenant-A', makeEnvelope());

    expect(good).toHaveBeenCalledOnce();
  });
});

// ----------------------------------------------------------------
// publishAndPersist
// ----------------------------------------------------------------

describe('EventBus — publishAndPersist', () => {
  it('calls LedgerWriter.persist before dispatching to subscribers', async () => {
    const bus = EventBus.getInstance();
    const callOrder: string[] = [];

    const { writer, persist } = makeMockWriter();
    persist.mockImplementation(async () => {
      callOrder.push('persist');
      return { id: 'e1', publishedAt: new Date() };
    });
    bus.setLedgerWriter(writer);

    const handler = vi.fn().mockImplementation(async () => {
      callOrder.push('handler');
    });
    bus.subscribe('*', handler);

    await bus.publishAndPersist('tenant-A', makeEnvelope());

    expect(callOrder).toEqual(['persist', 'handler']);
  });

  it('returns the persisted id and publishedAt', async () => {
    const bus = EventBus.getInstance();
    const fixedDate = new Date('2026-01-01T00:00:00Z');
    const { writer, persist } = makeMockWriter('returned-id');
    persist.mockResolvedValue({ id: 'returned-id', publishedAt: fixedDate });
    bus.setLedgerWriter(writer);

    const result = await bus.publishAndPersist('tenant-A', makeEnvelope());

    expect(result).toEqual({ id: 'returned-id', publishedAt: fixedDate });
  });

  it('still dispatches to subscribers even without a LedgerWriter', async () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn().mockResolvedValue(undefined);
    bus.subscribe('*', handler);

    const result = await bus.publishAndPersist('tenant-A', makeEnvelope());

    expect(result).toBeNull();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('passes tenantId to the LedgerWriter', async () => {
    const bus = EventBus.getInstance();
    const { writer, persist } = makeMockWriter();
    bus.setLedgerWriter(writer);

    await bus.publishAndPersist('tenant-XYZ', makeEnvelope());

    const persistedEnvelope: LedgerEnvelope = persist.mock.calls[0][0];
    expect(persistedEnvelope.tenantId).toBe('tenant-XYZ');
  });
});

// ----------------------------------------------------------------
// Tenant isolation — events from different tenants do not bleed
// ----------------------------------------------------------------

describe('EventBus — tenant isolation', () => {
  it('subscriber receives events from all tenants (bus is tenant-agnostic; isolation is via LedgerWriter)', async () => {
    // The in-memory bus does NOT filter by tenant at dispatch time.
    // Tenant isolation at the data layer is enforced by LedgerService.
    // This test verifies that the tenantId is faithfully threaded through
    // to the LedgerWriter so it can enforce isolation there.
    const bus = EventBus.getInstance();
    const { writer, persist } = makeMockWriter();
    bus.setLedgerWriter(writer);

    await bus.publishAndPersist('tenant-A', makeEnvelope({ aggregateId: 'agg-1' }));
    await bus.publishAndPersist('tenant-B', makeEnvelope({ aggregateId: 'agg-2' }));

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[0][0].tenantId).toBe('tenant-A');
    expect(persist.mock.calls[1][0].tenantId).toBe('tenant-B');
  });

  it('a wildcard subscriber sees events from multiple tenants', async () => {
    const bus = EventBus.getInstance();
    const received: string[] = [];
    bus.subscribe('*', async (evt) => {
      received.push(evt.aggregateId);
    });

    await bus.publish('tenant-A', makeEnvelope({ aggregateId: 'a-agg' }));
    await bus.publish('tenant-B', makeEnvelope({ aggregateId: 'b-agg' }));

    expect(received).toEqual(['a-agg', 'b-agg']);
  });
});
