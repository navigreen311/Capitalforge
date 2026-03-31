// ============================================================
// Canonical Ledger + Event Bus — barrel export
// ============================================================

// Event bus (singleton + class)
export { EventBus, eventBus } from './event-bus.js';
export type { LedgerWriter } from './event-bus.js';

// Ledger service
export { LedgerService } from './ledger.service.js';
export type {
  QueryByAggregateOptions,
  QueryByTenantOptions,
} from './ledger.service.js';

// Types & constants
export {
  EVENT_TYPES,
  AGGREGATE_TYPES,
} from './event-types.js';

export type {
  EventType,
  AggregateType,
  TopicPattern,
  LedgerEnvelope,
  PersistedEvent,
  SubscribeOptions,
  // Re-exported from shared/types
  LedgerEventPayload,
  EventHandler,
} from './event-types.js';
