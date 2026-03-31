// ============================================================
// CapitalForge Ledger Service
//
// Writes every domain event to the `ledger_events` table.
// The table is append-only — records are never mutated or deleted
// after creation (enforced by this service and Prisma schema).
//
// Implements the LedgerWriter interface so it can be injected into
// EventBus.setLedgerWriter().
// ============================================================

import { PrismaClient } from '@prisma/client';
import type { LedgerWriter } from './event-bus.js';
import type { LedgerEnvelope, PersistedEvent } from './event-types.js';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface QueryByAggregateOptions {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  /** Return at most this many events (default: 100) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

export interface QueryByTenantOptions {
  tenantId: string;
  eventType?: string;
  /** ISO string or Date — only events at or after this timestamp */
  since?: Date | string;
  limit?: number;
  offset?: number;
}

// ----------------------------------------------------------------
// LedgerService
// ----------------------------------------------------------------

export class LedgerService implements LedgerWriter {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    // Allow injection for testing; fall back to shared singleton
    this.prisma = prisma ?? new PrismaClient();
  }

  // ---- LedgerWriter implementation (used by EventBus) ----------

  /**
   * Write a single event envelope to the ledger.
   * Returns the auto-assigned id and publishedAt timestamp.
   * The record is immutable after creation — no update path exists here.
   */
  async persist(
    envelope: LedgerEnvelope,
  ): Promise<{ id: string; publishedAt: Date }> {
    this._assertTenantId(envelope.tenantId);

    const record = await this.prisma.ledgerEvent.create({
      data: {
        tenantId: envelope.tenantId,
        eventType: envelope.eventType,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        payload: envelope.payload,
        metadata: envelope.metadata ?? {},
        version: envelope.version ?? 1,
        // publishedAt and id are set by Prisma defaults
      },
      select: {
        id: true,
        publishedAt: true,
      },
    });

    return { id: record.id, publishedAt: record.publishedAt };
  }

  // ---- Query helpers -------------------------------------------

  /**
   * Retrieve all events for a specific aggregate, in chronological order.
   * Useful for event sourcing / replaying aggregate state.
   */
  async getByAggregate(
    options: QueryByAggregateOptions,
  ): Promise<PersistedEvent[]> {
    this._assertTenantId(options.tenantId);

    const rows = await this.prisma.ledgerEvent.findMany({
      where: {
        tenantId: options.tenantId,
        aggregateType: options.aggregateType,
        aggregateId: options.aggregateId,
      },
      orderBy: { publishedAt: 'asc' },
      take: options.limit ?? 100,
      skip: options.offset ?? 0,
    });

    return rows.map(this._toPersistedEvent);
  }

  /**
   * Retrieve events for a tenant, optionally filtered by event type and time window.
   */
  async getByTenant(options: QueryByTenantOptions): Promise<PersistedEvent[]> {
    this._assertTenantId(options.tenantId);

    const sinceDate = options.since
      ? typeof options.since === 'string'
        ? new Date(options.since)
        : options.since
      : undefined;

    const rows = await this.prisma.ledgerEvent.findMany({
      where: {
        tenantId: options.tenantId,
        ...(options.eventType ? { eventType: options.eventType } : {}),
        ...(sinceDate ? { publishedAt: { gte: sinceDate } } : {}),
      },
      orderBy: { publishedAt: 'asc' },
      take: options.limit ?? 100,
      skip: options.offset ?? 0,
    });

    return rows.map(this._toPersistedEvent);
  }

  /**
   * Mark an event as processed (e.g. by a downstream consumer).
   * This is the only permitted mutation — it sets processedAt.
   */
  async markProcessed(id: string, tenantId: string): Promise<void> {
    this._assertTenantId(tenantId);

    await this.prisma.ledgerEvent.updateMany({
      where: { id, tenantId },
      data: { processedAt: new Date() },
    });
  }

  // ---- Private helpers -----------------------------------------

  private _assertTenantId(tenantId: string): void {
    if (!tenantId || tenantId.trim() === '') {
      throw new Error('[LedgerService] tenantId is required for all operations');
    }
  }

  private _toPersistedEvent(row: {
    id: string;
    tenantId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
    metadata: unknown;
    version: number;
    publishedAt: Date;
    processedAt: Date | null;
  }): PersistedEvent {
    return {
      id: row.id,
      tenantId: row.tenantId,
      eventType: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      payload: row.payload as Record<string, unknown>,
      metadata: row.metadata as Record<string, unknown> | undefined,
      version: row.version,
      publishedAt: row.publishedAt,
      processedAt: row.processedAt,
    };
  }
}
