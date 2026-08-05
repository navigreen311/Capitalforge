// ============================================================
// Portfolio benchmarks — approval rate by segment
//
// This was a list of literals, the same segments and figures for every tenant,
// sitting beside an industry-benchmark block the portfolio beat on every axis.
// The data to compute it honestly was already here: a business carries an
// `industry` and an application belongs to a business. Nothing joined them, so
// the endpoint reported the segment breakdown as uncomputable.
//
// These pin what the computed version says, and — as much — what it refuses to
// say on thin data.
// ============================================================

import { describe, it, expect } from 'vitest';
import { segmentApprovalRates } from '../../../src/backend/api/routes/platform-portfolio.routes';

const app = (status: string, industry: string | null) => ({ status, industry });

describe('segmentApprovalRates', () => {
  it('computes an approval rate per industry', () => {
    const segments = segmentApprovalRates([
      app('approved', 'Technology Services'),
      app('approved', 'Technology Services'),
      app('declined', 'Technology Services'),
      app('approved', 'Construction'),
    ]);

    expect(segments).toEqual([
      { industry: 'Construction', decidedApplications: 1, approved: 1, approvalRate: 100 },
      { industry: 'Technology Services', decidedApplications: 3, approved: 2, approvalRate: 66.7 },
    ]);
  });

  it('carries the sample size beside every rate', () => {
    // The endpoint already states this beside its other figures: an approval
    // rate over three applications is not the same statement as one over three
    // hundred. A segment of one is ranked, and visibly a segment of one.
    const segments = segmentApprovalRates([app('approved', 'Retail')]);
    expect(segments?.[0]).toEqual({
      industry: 'Retail',
      decidedApplications: 1,
      approved: 1,
      approvalRate: 100,
    });
  });

  it('breaks a tie on volume, because it is the stronger claim', () => {
    const segments = segmentApprovalRates([
      app('approved', 'Thin'),
      app('approved', 'Thick'),
      app('approved', 'Thick'),
      app('approved', 'Thick'),
    ]);

    expect(segments?.map((s) => s.industry)).toEqual(['Thick', 'Thin']);
  });

  it('reports businesses with no industry rather than dropping them', () => {
    // Dropping them would make the segment volumes disagree with the
    // quarter's decided-application count sitting beside them.
    const segments = segmentApprovalRates([
      app('approved', 'Retail'),
      app('declined', null),
      app('approved', '   '),
    ]);

    const total = segments!.reduce((sum, s) => sum + s.decidedApplications, 0);
    expect(total).toBe(3);
    expect(segments?.find((s) => s.industry === 'Not recorded')?.decidedApplications).toBe(2);
  });

  it('is null when the quarter decided nothing', () => {
    // Not an empty list, which would read as every segment performing at zero.
    expect(segmentApprovalRates([])).toBeNull();
  });

  it('counts only approvals as approvals', () => {
    const segments = segmentApprovalRates([
      app('declined', 'Retail'),
      app('declined', 'Retail'),
    ]);
    expect(segments?.[0]?.approvalRate).toBe(0);
    expect(segments?.[0]?.approved).toBe(0);
  });
});
