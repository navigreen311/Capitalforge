// ============================================================
// CapitalForge In-Memory Event Bus
//
// Features:
//   - Topic-based publish / subscribe
//   - Wildcard subscriptions (e.g. "consent.*")
//   - Singleton instance
//   - Async, non-crashing handler dispatch
//   - publishAndPersist() writes to the canonical ledger before fanning out
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { EventHandler } from '../../shared/types/index.js';
import type {
  LedgerEnvelope,
  TopicPattern,
  SubscribeOptions,
} from './event-types.js';

// ----------------------------------------------------------------
// Internal types
// ----------------------------------------------------------------

interface Subscription {
  id: string;
  pattern: TopicPattern;
  handler: EventHandler;
  handlerName: string;
}

/** Minimal interface for the ledger dependency so tests can inject a mock. */
export interface LedgerWriter {
  persist(envelope: LedgerEnvelope): Promise<{ id: string; publishedAt: Date }>;
}

// ----------------------------------------------------------------
// EventBus
// ----------------------------------------------------------------

export class EventBus {
  // Singleton
  private static instance: EventBus | null = null;

  private readonly subscriptions: Map<string, Subscription> = new Map();

  /** Optional ledger writer injected at startup or by tests */
  private ledgerWriter: LedgerWriter | null = null;

  private constructor() {}

  // ---- Singleton access ----------------------------------------

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Reset the singleton — **test-only**.
   * Clears all subscriptions and the ledger writer.
   */
  static reset(): void {
    EventBus.instance = null;
  }

  // ---- Dependency injection ------------------------------------

  setLedgerWriter(writer: LedgerWriter): void {
    this.ledgerWriter = writer;
  }

  // ---- Subscribe / Unsubscribe ---------------------------------

  /**
   * Register a handler for a topic pattern.
   * Wildcards: "consent.*" matches any event whose topic starts with "consent."
   * Returns a subscription ID that can be passed to unsubscribe().
   */
  subscribe(
    pattern: TopicPattern,
    handler: EventHandler,
    options: SubscribeOptions = {},
  ): string {
    const id = uuidv4();
    this.subscriptions.set(id, {
      id,
      pattern,
      handler,
      handlerName: options.handlerName ?? pattern,
    });
    return id;
  }

  /** Remove a previously registered subscription by its ID. */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /** Remove all subscriptions — useful in tests. */
  unsubscribeAll(): void {
    this.subscriptions.clear();
  }

  // ---- Publish -------------------------------------------------

  /**
   * Publish an event to all matching subscribers.
   * Handler errors are caught and logged so one bad handler never crashes others.
   */
  async publish(
    tenantId: string,
    envelope: Omit<LedgerEnvelope, 'tenantId'>,
  ): Promise<void> {
    const fullEnvelope: LedgerEnvelope = { tenantId, ...envelope };
    await this._dispatch(fullEnvelope);
  }

  /**
   * Persist the event to the canonical ledger THEN fan out to all matching subscribers.
   * If no ledger writer is configured the call still dispatches to subscribers (with a warning).
   *
   * Returns the persisted event record (id + publishedAt) or null when no writer is set.
   */
  async publishAndPersist(
    tenantId: string,
    envelope: Omit<LedgerEnvelope, 'tenantId'>,
  ): Promise<{ id: string; publishedAt: Date } | null> {
    const fullEnvelope: LedgerEnvelope = { tenantId, ...envelope };

    let persisted: { id: string; publishedAt: Date } | null = null;

    if (this.ledgerWriter) {
      persisted = await this.ledgerWriter.persist(fullEnvelope);
    } else {
      console.warn(
        '[EventBus] publishAndPersist called without a LedgerWriter — event will NOT be persisted.',
      );
    }

    await this._dispatch(fullEnvelope);

    return persisted;
  }

  // ---- Introspection (useful in tests) -------------------------

  /** Number of active subscriptions. */
  get subscriptionCount(): number {
    return this.subscriptions.size;
  }

  /** Returns all patterns currently subscribed to. */
  get activePatterns(): string[] {
    return Array.from(this.subscriptions.values()).map((s) => s.pattern);
  }

  // ---- Private helpers -----------------------------------------

  private async _dispatch(envelope: LedgerEnvelope): Promise<void> {
    const matchingSubs = this._findMatchingSubscriptions(envelope.eventType);

    if (matchingSubs.length === 0) return;

    // Shared payload shape expected by EventHandler
    const eventPayload = {
      eventType: envelope.eventType,
      aggregateType: envelope.aggregateType,
      aggregateId: envelope.aggregateId,
      payload: envelope.payload,
      metadata: envelope.metadata,
    };

    await Promise.allSettled(
      matchingSubs.map((sub) =>
        sub.handler(eventPayload).catch((err: unknown) => {
          console.error(
            `[EventBus] Handler "${sub.handlerName}" threw for topic "${envelope.eventType}":`,
            err,
          );
        }),
      ),
    );
  }

  private _findMatchingSubscriptions(eventType: string): Subscription[] {
    const results: Subscription[] = [];

    for (const sub of this.subscriptions.values()) {
      if (this._matches(sub.pattern, eventType)) {
        results.push(sub);
      }
    }

    return results;
  }

  /**
   * Wildcard matching rules:
   *  - Exact match:  "consent.captured"   === "consent.captured"
   *  - Namespace glob: "consent.*"         matches "consent.captured", "consent.revoked",
   *                                         AND multi-segment "compliance.check.completed"
   *  - Root glob:    "*"                   matches every event type
   *
   * Implementation: escape regex special chars, then convert "\.*" (escaped dot + *)
   * into "\..+" so the wildcard matches one or more characters after the dot separator,
   * covering both two-segment (consent.captured) and three-segment (compliance.check.completed)
   * topic strings.
   */
  private _matches(pattern: TopicPattern, topic: string): boolean {
    // Fast paths
    if (pattern === topic) return true;
    if (pattern === '*') return true;

    // Step 1: escape all regex-special chars (turns "." into "\.")
    const escaped = pattern.replace(
      /[.+^${}()|[\]\\]/g,
      (c) => (c === '.' ? '\\.' : `\\${c}`),
    );

    // Step 2: turn "\.*" (namespace wildcard) into "\..+" which matches
    // any non-empty suffix after the dot — handles 1-to-N additional segments
    const regexStr = escaped.replace(/\\\.\*/g, '\\..+');

    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(topic);
  }
}

// Convenience export of the singleton
export const eventBus = EventBus.getInstance();
