// ============================================================
// CapitalForge Event Types
// Re-exports and extends shared constants for the event bus layer
// ============================================================

export {
  EVENT_TYPES,
  AGGREGATE_TYPES,
} from '../../shared/constants/index.js';

export type { LedgerEventPayload, EventHandler } from '../../shared/types/index.js';

// Derive union types from the const objects for type-safe event routing
import { EVENT_TYPES, AGGREGATE_TYPES } from '../../shared/constants/index.js';

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
export type AggregateType = (typeof AGGREGATE_TYPES)[keyof typeof AGGREGATE_TYPES];

// Topic patterns supported by the event bus wildcard matcher.
// e.g. "consent.*" matches "consent.captured" and "consent.revoked"
export type TopicPattern = string;

// Full envelope written to the canonical ledger
export interface LedgerEnvelope {
  tenantId: string;
  eventType: EventType | string;
  aggregateType: AggregateType | string;
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Monotonic version counter per aggregate — defaults to 1 */
  version?: number;
}

// Thin wrapper returned when an event is persisted
export interface PersistedEvent extends LedgerEnvelope {
  id: string;
  publishedAt: Date;
  processedAt?: Date | null;
}

// Options accepted by subscribe()
export interface SubscribeOptions {
  /** A human-readable label used in error logs */
  handlerName?: string;
}
