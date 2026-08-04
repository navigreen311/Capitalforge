// ============================================================
// CapitalForge — Dashboard event contract
//
// POST /api/v1/events refuses any event_type not in SUPPORTED_EVENT_TYPES, and
// refuses it with a 400 the caller is under no obligation to read. Four UI
// surfaces posted to it inline, and every one of them was being refused:
//
//   ActionQueue          sent `eventType`, not `event_type`      → 400
//   AprExpiryPanel       sent `eventType`, not `event_type`      → 400
//   TimelineTab          correct shape, unsupported type         → 400
//   RoundActivityTimeline correct shape, unsupported type        → 400
//
// Nothing failed visibly. Two of them showed a success toast. The events were
// simply never written, and the only way to find out was to read the server's
// validator and the four call sites side by side.
//
// This test does that comparison automatically. It reads every publishEvent()
// call in the frontend and asserts the server accepts the type — so a new
// event type added to a component without being added here fails a test
// instead of failing silently in production.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { SUPPORTED_EVENT_TYPES } from '../../../src/backend/api/routes/dashboard-events.routes.js';

const FRONTEND = join(process.cwd(), 'src', 'frontend');

/** Every .ts/.tsx file under the frontend, excluding build output. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '.next' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

interface PublishCall {
  file: string;
  eventType: string;
  /** The literal object passed as the payload, as written. */
  payload: string;
}

/** Find `publishEvent('some.type', { ... })` calls and their payload text. */
function publishEventCalls(): PublishCall[] {
  const calls: PublishCall[] = [];
  for (const file of sourceFiles(FRONTEND)) {
    const text = readFileSync(file, 'utf8');
    // The definition itself is not a call.
    if (file.endsWith('DashboardEventBus.ts')) continue;

    const pattern = /publishEvent\(\s*'([^']+)'\s*,\s*\{([\s\S]*?)\n\s*\}\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      calls.push({
        file: file.slice(FRONTEND.length + 1).replace(/\\/g, '/'),
        eventType: match[1],
        payload: match[2],
      });
    }
  }
  return calls;
}

describe('dashboard event contract', () => {
  const calls = publishEventCalls();

  it('finds the publishEvent call sites', () => {
    // Guards the test itself. If the regex stops matching, every assertion
    // below passes vacuously and the contract goes unchecked — which is the
    // same failure mode as the unread 400 this test exists to prevent.
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it('only posts event types the server accepts', () => {
    const rejected = calls
      .filter((c) => !SUPPORTED_EVENT_TYPES.has(c.eventType))
      .map((c) => `${c.file} posts '${c.eventType}'`);

    // Every entry here would be a 400 in production, silently.
    expect(rejected).toEqual([]);
  });

  it('carries an aggregateId inside the payload', () => {
    // The route derives the ledger row's aggregate id from
    //   payload.aggregateId ?? payload.id ?? randomUUID()
    // so a payload without one is written under a random id and can never be
    // read back for the record it describes. The write succeeds; the data is
    // unreachable. A top-level aggregateId does not count — it is ignored.
    const missing = calls
      .filter((c) => !/\baggregateId\b/.test(c.payload) && !/\bid:/.test(c.payload))
      .map((c) => `${c.file} ('${c.eventType}')`);

    expect(missing).toEqual([]);
  });

  it('accepts both advisor note types', () => {
    // These two were refused until the UI and the validator were reconciled.
    // Named explicitly so removing either from the server fails here rather
    // than quietly breaking the note surfaces again.
    expect(SUPPORTED_EVENT_TYPES.has('client.advisor_note_added')).toBe(true);
    expect(SUPPORTED_EVENT_TYPES.has('round.advisor_note_added')).toBe(true);
  });
});
