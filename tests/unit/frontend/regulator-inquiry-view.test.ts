// ============================================================
// toInquiryViews — mapping GET /api/regulator/inquiries
//
// The complaints page rendered four hard-coded inquiries and a "+ Log Inquiry"
// button with no handler, while these endpoints already existed and persisted.
// These pin the mapping against a captured response, and pin that a deadline
// with no date stays unknown rather than becoming a number.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toInquiryView,
  toInquiryViews,
  deadlineLabel,
  MATTER_TYPE_LABELS,
  STATUS_LABELS,
} from '../../../src/frontend/lib/regulator-inquiry-view';

/** Captured from a live POST + GET against the running API. */
const REAL_ROW = {
  id: 'd4b143c1-3cd2-45b7-bc39-30c060be9b22',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  businessId: null,
  matterType: 'CFPB',
  referenceNumber: 'PROBE-001',
  agencyName: 'Consumer Financial Protection Bureau',
  description: 'Probe: fair lending practices review request.',
  severity: 'elevated',
  status: 'open',
  responseDueDate: '2026-09-30T00:00:00.000Z',
  assignedCounsel: null,
  assignedTo: null,
  responseNotes: null,
  resolution: null,
  legalHoldActivatedAt: null,
  legalHoldActivatedBy: null,
  closedAt: null,
  createdAt: '2026-07-31T19:10:47.144Z',
  updatedAt: '2026-07-31T19:10:47.144Z',
  deadlineStatus: {
    daysUntilDeadline: 61,
    isOverdue: false,
    escalationLevel: 'none',
    nextEscalationAt: '2026-09-16T00:00:00.000Z',
  },
};

const ENVELOPE = { inquiries: [REAL_ROW], total: 1, page: 1, pageSize: 25 };

describe('toInquiryViews', () => {
  it('reads the endpoint envelope, not just a bare array', () => {
    expect(toInquiryViews(ENVELOPE)).toHaveLength(1);
  });

  it('also accepts a bare array, so callers passing data.inquiries still work', () => {
    expect(toInquiryViews([REAL_ROW])).toHaveLength(1);
  });

  it('maps the fields the panel renders', () => {
    expect(toInquiryViews(ENVELOPE)[0]).toMatchObject({
      id: 'd4b143c1-3cd2-45b7-bc39-30c060be9b22',
      matterType: 'CFPB',
      agencyName: 'Consumer Financial Protection Bureau',
      referenceNumber: 'PROBE-001',
      severity: 'elevated',
      status: 'open',
      daysUntilDeadline: 61,
      isOverdue: false,
    });
  });

  it('returns an empty list for junk rather than throwing', () => {
    expect(toInquiryViews(null)).toEqual([]);
    expect(toInquiryViews(undefined)).toEqual([]);
    expect(toInquiryViews({})).toEqual([]);
    expect(toInquiryViews('nonsense')).toEqual([]);
  });

  it('drops a row with no id, which could not be addressed anyway', () => {
    expect(toInquiryView({ agencyName: 'FTC' }, )).toBeNull();
  });
});

describe('toInquiryView — values that must not be invented', () => {
  it('leaves a missing reference number null rather than fabricating one', () => {
    const view = toInquiryView({ ...REAL_ROW, referenceNumber: null }, );
    expect(view?.referenceNumber).toBeNull();
  });

  it('leaves the deadline unknown when the API carries no deadlineStatus', () => {
    const bare = { ...REAL_ROW } as Record<string, unknown>;
    delete bare.deadlineStatus;
    const view = toInquiryView(bare);
    // Not 0: an inquiry with no deadline is not one due today.
    expect(view?.daysUntilDeadline).toBeNull();
    expect(view?.isOverdue).toBe(false);
  });

  it('takes urgency from the API rather than recomputing it from the date', () => {
    // A deadlineStatus that disagrees with responseDueDate is still honoured:
    // two clocks disagreeing about an overdue regulator response is worse
    // than one, and the server owns the escalation rules.
    const view = toInquiryView({
      ...REAL_ROW,
      deadlineStatus: { daysUntilDeadline: -3, isOverdue: true },
    });
    expect(view?.isOverdue).toBe(true);
    expect(view?.daysUntilDeadline).toBe(-3);
  });

  it('falls back to the least specific matter type rather than dropping the row', () => {
    const view = toInquiryView({ ...REAL_ROW, matterType: 'something_new' });
    // Present under a general heading beats absent from a compliance list.
    expect(view?.matterType).toBe('audit');
  });

  it('falls back to routine severity and open status for unknown values', () => {
    const view = toInquiryView({ ...REAL_ROW, severity: '???', status: '???' });
    expect(view?.severity).toBe('routine');
    expect(view?.status).toBe('open');
  });
});

describe('deadlineLabel', () => {
  const base = toInquiryView(REAL_ROW)!;

  it('counts down when a deadline is ahead', () => {
    expect(deadlineLabel(base)).toBe('61 days to respond');
  });

  it('singularises one day', () => {
    expect(deadlineLabel({ ...base, daysUntilDeadline: 1 })).toBe('1 day to respond');
  });

  it('says due today rather than "0 days"', () => {
    expect(deadlineLabel({ ...base, daysUntilDeadline: 0 })).toBe('Response due today');
  });

  it('reports overdue as a positive number of days late', () => {
    expect(deadlineLabel({ ...base, daysUntilDeadline: -3, isOverdue: true })).toBe(
      'Overdue by 3 days',
    );
  });

  it('says plainly when no deadline was set', () => {
    expect(deadlineLabel({ ...base, daysUntilDeadline: null })).toBe(
      'No response deadline set',
    );
  });
});

describe('display labels', () => {
  it('covers every matter type and status the API can return', () => {
    expect(Object.keys(MATTER_TYPE_LABELS).sort()).toEqual(
      ['CFPB', 'FTC', 'audit', 'state_AG'].sort(),
    );
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(
      ['closed', 'legal_hold', 'open', 'response_drafted', 'response_submitted'].sort(),
    );
  });
});
