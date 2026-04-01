// ============================================================
// CapitalForge — Dashboard Event Bus
//
// Utility for publishing dashboard UI events to the backend.
// NOT a React component — no 'use client' directive.
// ============================================================

/**
 * Publishes a dashboard event to the backend event log.
 *
 * @param eventType - The event type identifier (e.g. 'consent_alert.dismissed')
 * @param payload   - Arbitrary event payload data
 */
export async function publishEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('cf_access_token')
      : null;

  await fetch('/api/v1/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      event_type: eventType,
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
      },
    }),
  });
}
