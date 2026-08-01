// ============================================================
// notifications-view — the bell reads records, not fixtures
//
// The header showed "4 unread" on every page from a constant, over five
// literal notifications with hand-written relative timestamps. These pin the
// judgments that keep the replacement honest: an unreadable severity is not
// escalated, an unreadable count is not rendered as zero, and a missing date
// produces no relative time at all.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toNotificationRow,
  toNotificationRows,
  toSeverity,
  toOutstandingCount,
  sortForDisplay,
  relativeTime,
  tally,
} from '../../../src/frontend/lib/notifications-view';

const NOW = new Date('2026-08-01T12:00:00.000Z');

/** Captured from GET /api/notifications. */
const REAL_ROW = {
  id: 'apr:seed-app-001',
  type: 'apr_expiry',
  severity: 'HIGH',
  title: 'Intro APR — Apex Digital Solutions LLC',
  description: 'Chase Ink Business Preferred intro rate ends in 11 days.',
  occurredAt: '2026-08-12T00:00:00.000Z',
  href: '/applications',
};

describe('toNotificationRow', () => {
  it('maps a real notification', () => {
    expect(toNotificationRow(REAL_ROW)).toEqual({
      id: 'apr:seed-app-001',
      type: 'apr_expiry',
      severity: 'HIGH',
      title: 'Intro APR — Apex Digital Solutions LLC',
      description: 'Chase Ink Business Preferred intro rate ends in 11 days.',
      occurredAt: '2026-08-12T00:00:00.000Z',
      href: '/applications',
    });
  });

  it('drops a row with no id or no title', () => {
    // Neither is actionable, and a blank entry in an alert list reads as a
    // system that is still loading.
    expect(toNotificationRow({ ...REAL_ROW, id: undefined })).toBeNull();
    expect(toNotificationRow({ ...REAL_ROW, title: '  ' })).toBeNull();
  });

  it('carries a null href rather than a link to nowhere', () => {
    // Every fixture linked somewhere: /clients/cl-004 for a client that does
    // not exist.
    expect(toNotificationRow({ ...REAL_ROW, href: undefined })?.href).toBeNull();
  });

  it('reads the list envelope, and junk as empty', () => {
    expect(toNotificationRows({ notifications: [REAL_ROW] })).toHaveLength(1);
    expect(toNotificationRows([REAL_ROW])).toHaveLength(1);
    expect(toNotificationRows(null)).toEqual([]);
  });
});

describe('toSeverity', () => {
  it('accepts the severities the API sends', () => {
    for (const s of ['CRITICAL', 'HIGH', 'MEDIUM', 'INFO']) {
      expect(toSeverity(s)).toBe(s);
    }
  });

  it('reads anything unrecognised as INFO, never upward', () => {
    // An item shown CRITICAL because its severity could not be read is a
    // false alarm, and a panel that cries wolf gets ignored when it is right.
    expect(toSeverity('URGENT')).toBe('INFO');
    expect(toSeverity(undefined)).toBe('INFO');
    expect(toSeverity(5)).toBe('INFO');
  });
});

describe('toOutstandingCount', () => {
  it('reads the count', () => {
    expect(toOutstandingCount({ outstanding: 7 })).toBe(7);
    expect(toOutstandingCount({ outstanding: 0 })).toBe(0);
  });

  it('is null when it cannot be read, rather than zero', () => {
    // Zero on the bell says "nothing needs your attention", which is a claim.
    expect(toOutstandingCount({})).toBeNull();
    expect(toOutstandingCount(null)).toBeNull();
    expect(toOutstandingCount({ outstanding: -1 })).toBeNull();
    expect(toOutstandingCount({ outstanding: 'four' })).toBeNull();
  });
});

describe('sortForDisplay', () => {
  const row = (over: Record<string, unknown>) => toNotificationRow({ ...REAL_ROW, ...over })!;

  it('puts the worst first, then the most recent', () => {
    const sorted = sortForDisplay([
      row({ id: 'a', severity: 'MEDIUM', occurredAt: '2026-07-31T00:00:00.000Z' }),
      row({ id: 'b', severity: 'CRITICAL', occurredAt: '2026-07-01T00:00:00.000Z' }),
      row({ id: 'c', severity: 'MEDIUM', occurredAt: '2026-08-01T00:00:00.000Z' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts undated items last rather than treating them as ancient', () => {
    const sorted = sortForDisplay([
      row({ id: 'undated', severity: 'HIGH', occurredAt: null }),
      row({ id: 'dated', severity: 'HIGH', occurredAt: '2020-01-01T00:00:00.000Z' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['dated', 'undated']);
  });

  it('does not mutate its input', () => {
    const rows = [row({ id: 'a', severity: 'INFO' }), row({ id: 'b', severity: 'CRITICAL' })];
    sortForDisplay(rows);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('relativeTime', () => {
  it('counts back from the record date', () => {
    expect(relativeTime('2026-08-01T10:00:00.000Z', NOW)).toBe('2 hours ago');
    expect(relativeTime('2026-07-30T12:00:00.000Z', NOW)).toBe('2 days ago');
    expect(relativeTime('2026-08-01T11:59:30.000Z', NOW)).toBe('just now');
  });

  it('handles a date still ahead', () => {
    // An intro APR that expires next month is a real notification about a
    // future date; "in 11 days" is not the same statement as "11 days ago".
    expect(relativeTime('2026-08-12T12:00:00.000Z', NOW)).toBe('in 11 days');
  });

  it('says nothing when there is no usable date', () => {
    // The fixtures printed "2h ago" as a literal, so they said the same
    // thing whenever you looked.
    expect(relativeTime(null, NOW)).toBeNull();
    expect(relativeTime('not a date', NOW)).toBeNull();
  });
});

describe('tally', () => {
  const row = (over: Record<string, unknown>) => toNotificationRow({ ...REAL_ROW, ...over })!;

  it('counts by severity', () => {
    expect(
      tally([
        row({ id: 'a', severity: 'CRITICAL' }),
        row({ id: 'b', severity: 'HIGH' }),
        row({ id: 'c', severity: 'MEDIUM' }),
        row({ id: 'd', severity: 'INFO' }),
      ]),
    ).toEqual({ critical: 1, high: 1, other: 2 });
  });

  it('handles an empty list', () => {
    expect(tally([])).toEqual({ critical: 0, high: 0, other: 0 });
  });
});
