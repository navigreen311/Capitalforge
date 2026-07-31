// ============================================================
// toComplaintViews — mapping GET /api/complaints
//
// The page rendered eight fixed complaints and used a vocabulary the model did
// not have: eight categories against the API's five, and an "Escalated" status
// that is a field, not a status. These pin the reconciliation, and pin that an
// SLA counted from an unknown filing date stays unknown.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toComplaintView,
  toComplaintViews,
  toAnalyticsView,
  slaDueDate,
  slaDaysRemaining,
  resolvedWithin,
  isEscalated,
  openCount,
  SLA_DAYS,
  toAttachableDocuments,
  formatFileSize,
} from '../../../src/frontend/lib/complaint-view';

const NOW = new Date('2026-08-01T00:00:00.000Z');

/** Captured from a live POST against the running API. */
const REAL_ROW = {
  id: 'b914926d-38a2-43a3-9664-a695a5c39ba7',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  businessId: null,
  businessName: null,
  category: 'billing',
  subcategory: null,
  source: 'portal',
  severity: 'high',
  status: 'open',
  description: 'Client disputes an annual fee charged after cancellation.',
  evidenceDocIds: [],
  callRecordIds: [],
  rootCause: null,
  resolution: null,
  assignedTo: null,
  escalatedTo: null,
  resolvedAt: null,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
};

const ENVELOPE = { complaints: [REAL_ROW], total: 1, page: 1, pageSize: 20 };

describe('toComplaintViews', () => {
  it('reads the endpoint envelope', () => {
    expect(toComplaintViews(ENVELOPE)).toHaveLength(1);
  });

  it('maps the fields the register renders', () => {
    expect(toComplaintViews(ENVELOPE)[0]).toMatchObject({
      id: 'b914926d-38a2-43a3-9664-a695a5c39ba7',
      category: 'billing',
      source: 'portal',
      severity: 'high',
      status: 'open',
      clientName: null,
    });
  });

  it('carries the client name when the list resolved one', () => {
    const view = toComplaintView({ ...REAL_ROW, businessName: 'Apex Digital Solutions LLC' });
    expect(view?.clientName).toBe('Apex Digital Solutions LLC');
  });

  it('returns an empty list for junk rather than throwing', () => {
    expect(toComplaintViews(null)).toEqual([]);
    expect(toComplaintViews({})).toEqual([]);
    expect(toComplaintViews('nonsense')).toEqual([]);
  });

  it('drops a row with no id', () => {
    expect(toComplaintView({ category: 'billing' })).toBeNull();
  });
});

describe('vocabulary reconciliation', () => {
  it('keeps the four statuses the model actually has', () => {
    for (const status of ['open', 'investigating', 'resolved', 'closed']) {
      expect(toComplaintView({ ...REAL_ROW, status })?.status).toBe(status);
    }
  });

  it('treats an unknown status as open rather than dropping the complaint', () => {
    // The page used to send "Escalated" and "In Review", which the API has
    // never accepted. A complaint absent from the register is worse than one
    // shown in the wrong column.
    expect(toComplaintView({ ...REAL_ROW, status: 'Escalated' })?.status).toBe('open');
    expect(toComplaintView({ ...REAL_ROW, status: 'In Review' })?.status).toBe('open');
  });

  it('reads escalation from escalatedTo, where it lives', () => {
    expect(isEscalated(toComplaintView(REAL_ROW)!)).toBe(false);
    expect(isEscalated(toComplaintView({ ...REAL_ROW, escalatedTo: 'Compliance' })!)).toBe(true);
  });

  it('folds an unrecognised category into other rather than guessing', () => {
    // "Fair Lending" and "Product Mismatch" were page-only categories with no
    // model equivalent; mapping them onto compliance would have changed what
    // the user chose.
    expect(toComplaintView({ ...REAL_ROW, category: 'Fair Lending' })?.category).toBe('other');
    expect(toComplaintView({ ...REAL_ROW, category: 'compliance' })?.category).toBe('compliance');
  });

  it('defaults an unknown severity to medium', () => {
    expect(toComplaintView({ ...REAL_ROW, severity: 'Critical' })?.severity).toBe('medium');
    expect(toComplaintView({ ...REAL_ROW, severity: 'critical' })?.severity).toBe('critical');
  });
});

describe('SLA', () => {
  it('counts from the filing date, by severity', () => {
    const view = toComplaintView(REAL_ROW)!;
    // high = 10 days from 2026-07-25.
    expect(SLA_DAYS.high).toBe(10);
    expect(slaDueDate(view)?.toISOString().slice(0, 10)).toBe('2026-08-04');
  });

  it('reports days remaining against a fixed instant', () => {
    expect(slaDaysRemaining(toComplaintView(REAL_ROW)!, NOW)).toBe(3);
  });

  it('goes negative once the deadline has passed', () => {
    const old = toComplaintView({ ...REAL_ROW, createdAt: '2026-06-01T00:00:00.000Z' })!;
    expect(slaDaysRemaining(old, NOW)!).toBeLessThan(0);
  });

  it('leaves the deadline unknown when there is no filing date', () => {
    const view = toComplaintView({ ...REAL_ROW, createdAt: null })!;
    // Not "due today": a deadline counted from an unknown start is not one.
    expect(slaDueDate(view)).toBeNull();
    expect(slaDaysRemaining(view, NOW)).toBeNull();
  });
});

describe('resolvedWithin', () => {
  const resolved = (daysAgo: number) =>
    toComplaintView({
      ...REAL_ROW,
      status: 'resolved',
      resolvedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    })!;

  it('counts only what was resolved inside the window', () => {
    const rows = [resolved(5), resolved(29), resolved(45), toComplaintView(REAL_ROW)!];
    expect(resolvedWithin(rows, 30, NOW)).toBe(2);
  });

  it('is zero when nothing is resolved, rather than a fixed number', () => {
    // The KPI it feeds was a hard-coded 12.
    expect(resolvedWithin([toComplaintView(REAL_ROW)!], 30, NOW)).toBe(0);
  });
});

describe('toAnalyticsView', () => {
  const REAL_ANALYTICS = {
    tenantId: 't',
    generatedAt: '2026-07-31T19:37:08.717Z',
    totalComplaints: 4,
    byCategory: { billing: 3, service: 1 },
    byStatus: { open: 2, investigating: 1, resolved: 1 },
    bySeverity: { high: 3, critical: 1 },
    topRootCauses: [
      { rootCause: 'Fee disclosure gap', count: 3 },
      { rootCause: 'Stale eligibility data', count: 1 },
    ],
    averageResolutionDays: 4.5,
    openCritical: 1,
  };

  it('maps the counts', () => {
    const view = toAnalyticsView(REAL_ANALYTICS);
    expect(view.totalComplaints).toBe(4);
    expect(view.openCritical).toBe(1);
    expect(openCount(view)).toBe(3);
  });

  it('derives root-cause percentages from the counts returned', () => {
    const view = toAnalyticsView(REAL_ANALYTICS);
    expect(view.topRootCauses).toEqual([
      { category: 'Fee disclosure gap', count: 3, pct: 75 },
      { category: 'Stale eligibility data', count: 1, pct: 25 },
    ]);
  });

  it('returns no root causes when none are recorded', () => {
    // Previously five fixed slices summing to 100%, whatever the data.
    expect(toAnalyticsView({ ...REAL_ANALYTICS, topRootCauses: [] }).topRootCauses).toEqual([]);
  });

  it('leaves average resolution null when nothing has been resolved', () => {
    expect(
      toAnalyticsView({ ...REAL_ANALYTICS, averageResolutionDays: null }).averageResolutionDays,
    ).toBeNull();
  });

  it('survives a response with nothing in it', () => {
    const view = toAnalyticsView({});
    expect(view.totalComplaints).toBe(0);
    expect(view.topRootCauses).toEqual([]);
    expect(openCount(view)).toBe(0);
  });
});

describe('toAttachableDocuments', () => {
  const ENVELOPE = {
    documents: [
      {
        id: 'seed-doc-001',
        title: 'Chase Ink — March 2026 statement.pdf',
        documentType: 'statement',
        mimeType: 'application/pdf',
        sizeBytes: 184320,
      },
      { id: 'seed-doc-002', title: 'Fee schedule.pdf', documentType: 'disclosure' },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
  };

  it('reads the endpoint envelope', () => {
    expect(toAttachableDocuments(ENVELOPE)).toHaveLength(2);
  });

  it('keeps the fields the picker shows', () => {
    expect(toAttachableDocuments(ENVELOPE)[0]).toEqual({
      id: 'seed-doc-001',
      title: 'Chase Ink — March 2026 statement.pdf',
      documentType: 'statement',
      mimeType: 'application/pdf',
      sizeBytes: 184320,
    });
  });

  it('leaves an absent size null rather than zero', () => {
    // "0 B" would read as an empty file rather than an unrecorded size.
    expect(toAttachableDocuments(ENVELOPE)[1].sizeBytes).toBeNull();
  });

  it('drops a document with no id, which could not be referenced', () => {
    expect(toAttachableDocuments({ documents: [{ title: 'No id.pdf' }] })).toEqual([]);
  });

  it('returns an empty list for junk', () => {
    expect(toAttachableDocuments(null)).toEqual([]);
    expect(toAttachableDocuments({})).toEqual([]);
  });
});

describe('formatFileSize', () => {
  it('scales the unit', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(96100)).toBe('94 KB');
    expect(formatFileSize(184320)).toBe('180 KB');
    expect(formatFileSize(5_242_880)).toBe('5.0 MB');
  });

  it('renders nothing for an unknown size', () => {
    expect(formatFileSize(null)).toBe('');
  });
});
