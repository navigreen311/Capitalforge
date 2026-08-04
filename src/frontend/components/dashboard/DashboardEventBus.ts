// ============================================================
// CapitalForge — Dashboard Event Bus
//
// Utility for publishing dashboard UI events to the backend.
// NOT a React component — no 'use client' directive.
//
// The wire format is the server's, and it is easy to get wrong: POST
// /api/v1/events requires `event_type` (snake_case) and an object `payload`,
// and it derives the aggregate id from *inside* that payload —
// `payload.aggregateId ?? payload.id ?? randomUUID()`. A top-level
// `aggregateType` or `aggregateId` is ignored.
//
// Two components used to post to this endpoint inline instead of calling this
// function, both sending `eventType` with a top-level `aggregateId`. The
// server answered 400 to every one of them, neither checked the response, and
// so no task.completed or apr_expiry.acknowledged event was ever written. That
// is why they now go through here: one spelling of the format, in one place.
// ============================================================

import { loadJson } from '@/lib/load-json';

/**
 * Publishes a dashboard event to the backend event log.
 *
 * Throws on refusal rather than resolving. These events are non-critical, so
 * callers may well choose to swallow the error — but that has to be their
 * decision, taken in the open. Resolving regardless is what hid the broken
 * payload shape for as long as it was broken.
 *
 * @param eventType - The event type identifier (e.g. 'consent_alert.dismissed').
 *                    Must be one of the server's supported types.
 * @param payload   - Arbitrary event payload. Include `aggregateId` here, not
 *                    alongside it, or the event is recorded against a random id.
 */
export async function publishEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await loadJson('/api/v1/events', {
    method: 'POST',
    body: {
      event_type: eventType,
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
      },
    },
  });
}
