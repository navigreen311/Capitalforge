// ============================================================
// activity-view — the dashboard feed reads the audit log
//
// "Recent Activity" was five literals with times written in as strings, so
// the card said "12 min ago" whenever it was opened. These pin what the
// replacement may and may not say: the action as recorded rather than a
// sentence about it, no actor invented for a row that names none, and day
// labels derived from the timestamps.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toActivityRow,
  toActivityRows,
  describeAction,
  describeTarget,
  initials,
  groupByDay,
} from '../../../src/frontend/lib/activity-view';

const NOW = new Date('2026-08-01T12:00:00.000Z');

/** Captured from GET /api/activity. */
const REAL_ROW = {
  id: '0b0a3a0e-9a1f-4f0d-9d0e-2b8f6a2c1d44',
  action: 'application.submitted',
  resource: 'CardApplication',
  resourceId: 'seed-app-003',
  actor: 'Alexandra Torres',
  occurredAt: '2026-08-01T09:14:02.113Z',
};

describe('toActivityRow', () => {
  it('maps a real entry', () => {
    expect(toActivityRow(REAL_ROW)).toEqual({
      id: '0b0a3a0e-9a1f-4f0d-9d0e-2b8f6a2c1d44',
      action: 'application.submitted',
      resource: 'CardApplication',
      resourceId: 'seed-app-003',
      actor: 'Alexandra Torres',
      occurredAt: '2026-08-01T09:14:02.113Z',
    });
  });

  it('keeps an unattributed action unattributed', () => {
    // The record does not always name a user, and "system" is a
    // person-shaped answer to a question it did not answer.
    expect(toActivityRow({ ...REAL_ROW, actor: null })?.actor).toBeNull();
  });

  it('drops an entry with no action or no time', () => {
    expect(toActivityRow({ ...REAL_ROW, action: undefined })).toBeNull();
    expect(toActivityRow({ ...REAL_ROW, occurredAt: null })).toBeNull();
  });

  it('reads the envelope, and junk as empty', () => {
    expect(toActivityRows({ entries: [REAL_ROW] })).toHaveLength(1);
    expect(toActivityRows([REAL_ROW])).toHaveLength(1);
    expect(toActivityRows(undefined)).toEqual([]);
  });
});

describe('describeAction', () => {
  it('puts the recorded action into words and stops there', () => {
    expect(describeAction('application.submitted')).toBe('Application submitted');
    expect(describeAction('data.exported')).toBe('Data exported');
    expect(describeAction('offboarding.initiated')).toBe('Offboarding initiated');
  });

  it('does not embellish an action it does not recognise', () => {
    // The fixtures read like sentences somebody wrote — "APP-0091 moved to
    // underwriting review". The record says an action and a resource.
    expect(describeAction('some.new.action')).toBe('Some new action');
    expect(describeAction('')).toBe('');
  });
});

describe('describeTarget', () => {
  const row = (over: Record<string, unknown>) => toActivityRow({ ...REAL_ROW, ...over })!;

  it('names the resource and its id, so the line can be traced back', () => {
    expect(describeTarget(row({}))).toBe('CardApplication seed-app-003');
  });

  it('copes with a missing id or resource', () => {
    expect(describeTarget(row({ resourceId: null }))).toBe('CardApplication');
    expect(describeTarget(row({ resource: '' }))).toBe('seed-app-003');
    expect(describeTarget(row({ resource: '', resourceId: null }))).toBe('');
  });
});

describe('initials', () => {
  it('takes the badge from the action', () => {
    expect(initials('application.submitted')).toBe('AP');
    expect(initials('data.exported')).toBe('DA');
  });

  it('has something to show for anything', () => {
    expect(initials('')).toBe('??');
  });
});

describe('groupByDay', () => {
  const row = (id: string, occurredAt: string) => toActivityRow({ ...REAL_ROW, id, occurredAt })!;

  it('labels today and yesterday from the dates, not from a fixture', () => {
    const groups = groupByDay(
      [
        row('a', '2026-08-01T11:00:00.000Z'),
        row('b', '2026-08-01T08:00:00.000Z'),
        row('c', '2026-07-31T22:00:00.000Z'),
        row('d', '2026-07-20T10:00:00.000Z'),
      ],
      NOW,
    );

    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', '2026-07-20']);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('produces no groups for an empty feed', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});
