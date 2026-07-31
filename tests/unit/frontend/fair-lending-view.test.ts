// ============================================================
// fair-lending-view — Section 1071 dashboard mapping
//
// The page showed approval rates by race and gender from ten hardcoded
// buckets while the API reported totalApplications: 0. These pin the mapping
// against real responses, and pin the distinction the whole page turns on: a
// rate over no applications does not exist, and is not 0%.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toFairLendingDashboard,
  toCoverageCheck,
  toAdverseActionRows,
  coverageBanner,
  collectionStatus,
  humanise,
} from '../../../src/frontend/lib/fair-lending-view';

/** Captured from GET /api/fair-lending/dashboard?year=2026. */
const REAL_DASHBOARD = {
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  reportingYear: 2026,
  totalApplications: 4,
  approvalRate: 25,
  denialRate: 50,
  withdrawalRate: 25,
  applicationsByPurpose: { working_capital: 2, equipment: 1, expansion: 1 },
  actionsByType: { approved_and_originated: 1, denied: 2, withdrawn_by_applicant: 1 },
  topAdverseReasons: [
    { reason: 'Too many recent inquiries', count: 1 },
    { reason: 'Personal revolving utilization above issuer threshold', count: 1 },
  ],
  coverageStatus: 'below_threshold',
  coverageThreshold: 100,
  recordsWithDemographics: 2,
  demographicCompletionRate: 50,
};

/** The response before anything was recorded — what the page contradicted. */
const EMPTY_DASHBOARD = {
  tenantId: 't',
  reportingYear: 2026,
  totalApplications: 0,
  approvalRate: 0,
  denialRate: 0,
  withdrawalRate: 0,
  applicationsByPurpose: {},
  actionsByType: {},
  topAdverseReasons: [],
  coverageStatus: 'below_threshold',
  coverageThreshold: 100,
  recordsWithDemographics: 0,
  demographicCompletionRate: 0,
};

describe('toFairLendingDashboard', () => {
  it('maps a real response', () => {
    expect(toFairLendingDashboard(REAL_DASHBOARD)).toMatchObject({
      reportingYear: 2026,
      totalApplications: 4,
      approvalRate: 25,
      denialRate: 50,
      withdrawalRate: 25,
      coverageThreshold: 100,
      recordsWithDemographics: 2,
      demographicCompletionRate: 50,
    });
  });

  it('has no rates at all on a year with no covered applications', () => {
    // The API sends 0. On a fair lending surface that reads as "none were
    // approved", which is a finding; "there were none to decide" is not.
    const d = toFairLendingDashboard(EMPTY_DASHBOARD);
    expect(d?.approvalRate).toBeNull();
    expect(d?.denialRate).toBeNull();
    expect(d?.withdrawalRate).toBeNull();
    expect(d?.demographicCompletionRate).toBeNull();
    expect(d?.totalApplications).toBe(0);
  });

  it('sorts the purpose and action counts, largest first', () => {
    const d = toFairLendingDashboard(REAL_DASHBOARD);
    expect(d?.applicationsByPurpose[0]).toEqual({ label: 'Working capital', count: 2 });
    expect(d?.actionsByType[0]).toEqual({ action: 'denied', count: 2 });
  });

  it('drops zero counts rather than charting empty categories', () => {
    const d = toFairLendingDashboard({
      ...REAL_DASHBOARD,
      applicationsByPurpose: { working_capital: 2, equipment: 0 },
    });
    expect(d?.applicationsByPurpose.map((p) => p.label)).toEqual(['Working capital']);
  });

  it('keeps the adverse reasons the API tallied', () => {
    const d = toFairLendingDashboard(REAL_DASHBOARD);
    expect(d?.topAdverseReasons).toHaveLength(2);
    expect(d?.topAdverseReasons[0]).toEqual({
      reason: 'Too many recent inquiries',
      count: 1,
    });
  });

  it('falls back to below_threshold for an unrecognised coverage status', () => {
    // Never to triggered: claiming a reporting obligation that has not
    // attached is its own problem.
    const d = toFairLendingDashboard({ ...REAL_DASHBOARD, coverageStatus: 'who_knows' });
    expect(d?.coverageStatus).toBe('below_threshold');
  });

  it('returns null for a response it cannot read', () => {
    expect(toFairLendingDashboard(null)).toBeNull();
    expect(toFairLendingDashboard({ error: 'nope' })).toBeNull();
  });
});

describe('toCoverageCheck', () => {
  const REAL_COVERAGE = {
    tenantId: 't',
    year: 2026,
    applicationCount: 4,
    threshold: 100,
    triggered: false,
    percentToThreshold: 4,
  };

  it('maps a real response', () => {
    expect(toCoverageCheck(REAL_COVERAGE)).toEqual({
      year: 2026,
      applicationCount: 4,
      threshold: 100,
      triggered: false,
      percentToThreshold: 4,
    });
  });

  it('treats a missing triggered flag as not triggered', () => {
    expect(toCoverageCheck({ ...REAL_COVERAGE, triggered: undefined })?.triggered).toBe(false);
  });

  it('returns null when the response carries no counts', () => {
    expect(toCoverageCheck({ year: 2026 })).toBeNull();
  });
});

describe('toAdverseActionRows', () => {
  const REAL_ROW = {
    recordId: 'seed-1071-004',
    applicationId: 'seed-app-005',
    actionDate: '2026-02-28T00:00:00.000Z',
    actionTaken: 'denied',
    adverseReasons: ['Personal revolving utilization above issuer threshold'],
    creditPurpose: 'working_capital',
    businessType: 's_corp',
    isFirewalled: true,
  };

  it('maps a real row', () => {
    expect(toAdverseActionRows([REAL_ROW])[0]).toMatchObject({
      recordId: 'seed-1071-004',
      applicationId: 'seed-app-005',
      actionTaken: 'denied',
      isFirewalled: true,
    });
  });

  it('carries no delivery flag, because no such field exists', () => {
    // The page showed a noticeDelivered column and counted undelivered
    // notices from it. Nothing in the schema records notice delivery.
    const row = toAdverseActionRows([REAL_ROW])[0] as unknown as Record<string, unknown>;
    expect(row['noticeDelivered']).toBeUndefined();
  });

  it('keeps the reasons as given, and empty when there are none', () => {
    expect(toAdverseActionRows([{ ...REAL_ROW, adverseReasons: null }])[0].adverseReasons).toEqual(
      [],
    );
  });

  it('drops a row with no record id', () => {
    expect(toAdverseActionRows([{ actionTaken: 'denied' }])).toEqual([]);
  });

  it('returns an empty list for junk', () => {
    expect(toAdverseActionRows(null)).toEqual([]);
    expect(toAdverseActionRows({ data: [] })).toEqual([]);
  });
});

describe('coverageBanner', () => {
  const coverage = {
    year: 2026,
    applicationCount: 4,
    threshold: 100,
    triggered: false,
    percentToThreshold: 4,
  };

  it('says reporting is not required below the threshold', () => {
    const b = coverageBanner(coverage, 'below_threshold');
    expect(b.tone).toBe('neutral');
    expect(b.detail).toContain('4 of 100');
    expect(b.detail).toContain('not required');
  });

  it('says how many more would trigger reporting when approaching', () => {
    const b = coverageBanner({ ...coverage, applicationCount: 85 }, 'approaching_threshold');
    expect(b.tone).toBe('warning');
    expect(b.detail).toContain('15 more');
  });

  it('states the obligation once triggered', () => {
    const b = coverageBanner(
      { ...coverage, applicationCount: 120, triggered: true },
      '1071_triggered',
    );
    expect(b.tone).toBe('triggered');
    expect(b.headline).toContain('required');
  });

  it('says coverage is unknown rather than implying it is safe', () => {
    // A failed read must not render as "below threshold", which is a
    // statement that no reporting obligation has attached.
    const b = coverageBanner(null, 'below_threshold');
    expect(b.tone).toBe('neutral');
    expect(b.headline).toBe('Coverage unknown');
    expect(b.detail).toContain('could not be read');
  });
});

describe('collectionStatus', () => {
  it('reports how many records carry a demographic response', () => {
    const s = collectionStatus(toFairLendingDashboard(REAL_DASHBOARD));
    expect(s).toMatchObject({ collected: 2, total: 4, rate: 50 });
  });

  it('says what the figure is not', () => {
    // It counts responses, not their content. Nothing on this page reports
    // outcomes by demographic — the API does not expose that, by design.
    const s = collectionStatus(toFairLendingDashboard(REAL_DASHBOARD));
    expect(s.note).toContain('not what was answered');
    expect(s.note).toContain('decline');
  });

  it('has no rate on an empty year', () => {
    const s = collectionStatus(toFairLendingDashboard(EMPTY_DASHBOARD));
    expect(s.rate).toBeNull();
    expect(s.note).toContain('No covered applications');
  });

  it('has no rate when the dashboard could not be read', () => {
    expect(collectionStatus(null).rate).toBeNull();
  });
});

describe('humanise', () => {
  it('turns API enum keys into words', () => {
    expect(humanise('working_capital')).toBe('Working capital');
    expect(humanise('approved_and_originated')).toBe('Approved and originated');
    expect(humanise('')).toBe('');
  });
});
