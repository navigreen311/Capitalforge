// ============================================================
// graduation-view — the assessment an advisor can finally see
//
// The engine behind /graduation/status has been correct and unrendered since
// it was written: nothing in the frontend called it, so the four tracks, the
// gates holding a client back and the roadmap out of them lived only in an API
// response nobody read.
//
// These pin the judgments that make the panel worth having, all of them the
// same rule in different places: a requirement a client fell short of and a
// requirement nobody measured are different facts, and the second must never
// be presented as the first.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toGraduationStatus,
  gatesByStatus,
} from '../../../src/frontend/lib/graduation-view';

/** Captured from GET /api/businesses/:id/graduation/status. */
const RESPONSE = {
  businessId: 'seed-biz-001',
  currentTrack: 'credit_builder',
  currentTrackLabel: 'Credit Builder',
  currentTrackDescription: 'Establish business credit identity.',
  currentTrackCreditRange: '$0 – $5,000',
  nextTrack: 'starter_stack',
  nextTrackLabel: 'Starter Stack',
  nextTrackEligible: false,
  estimatedMonthsToNextTrack: 2,
  milestoneGates: [
    { criterion: 'Personal FICO Score', required: 620, actual: 762, status: 'passed', passed: true, gap: 0 },
    { criterion: 'Active Positive Tradelines', required: 2, actual: 0, status: 'failed', passed: false, gap: 2 },
    {
      criterion: 'Business Credit Score (FICO SBSS)',
      required: 50,
      actual: null,
      status: 'unknown',
      passed: false,
      gap: null,
      resolution: 'Pull a FICO SBSS report for this client.',
    },
  ],
  actionRoadmap: [
    { priority: 2, category: 'tradelines', action: 'Open 2 vendor accounts', impact: 'Builds depth', timelineEstimate: '1–2 months' },
    { priority: 1, category: 'business_credit', action: 'Pull a FICO SBSS report', impact: 'Not a shortfall', timelineEstimate: 'Same day' },
  ],
  trackProgression: [
    { track: 'credit_builder', label: 'Credit Builder', range: '$0 – $5,000', active: true },
    { track: 'starter_stack', label: 'Starter Stack', range: '$5,000 – $50,000', active: false },
  ],
};

describe('toGraduationStatus', () => {
  it('maps the assessment the API returns', () => {
    const view = toGraduationStatus(RESPONSE);
    expect(view?.currentTrackLabel).toBe('Credit Builder');
    expect(view?.nextTrackLabel).toBe('Starter Stack');
    expect(view?.gates).toHaveLength(3);
    expect(view?.progression).toHaveLength(2);
  });

  it('accepts the response bare or under a data wrapper', () => {
    expect(toGraduationStatus({ data: RESPONSE })?.currentTrackLabel).toBe('Credit Builder');
  });

  it('is null when nothing was read', () => {
    // No client selected, or the request failed. Not an assessment with no
    // gates, which would read as a client with nothing holding them back.
    expect(toGraduationStatus(undefined)).toBeNull();
    expect(toGraduationStatus(null)).toBeNull();
    expect(toGraduationStatus({})).toBeNull();
  });

  it('keeps an unmeasured gate distinct from a failed one', () => {
    const view = toGraduationStatus(RESPONSE);
    const unknown = view?.gates.find((g) => g.status === 'unknown');
    const failed = view?.gates.find((g) => g.status === 'failed');

    expect(unknown?.actual).toBeNull();
    expect(unknown?.gap).toBeNull();
    expect(unknown?.resolution).toBe('Pull a FICO SBSS report for this client.');

    // The failed one has a figure and a distance to close; the unknown one
    // has neither, because nobody measured it.
    expect(failed?.actual).toBe(0);
    expect(failed?.gap).toBe(2);
    expect(failed?.resolution).toBeNull();
  });

  it('keeps a real zero, which is not an absence', () => {
    // A client with no tradelines genuinely has none. Folding 0 into null
    // would turn a measured failure into an unmeasured one.
    const view = toGraduationStatus(RESPONSE);
    expect(view?.gates.find((g) => g.criterion === 'Active Positive Tradelines')?.actual).toBe(0);
  });

  it('treats an unrecognised status as unmeasured, never as failed', () => {
    // The safe direction: a client must not be shown as falling short of a
    // requirement because a string did not parse.
    const view = toGraduationStatus({
      ...RESPONSE,
      milestoneGates: [{ criterion: 'Odd gate', required: 1, actual: 1, status: 'nonsense' }],
    });
    expect(view?.gates[0]?.status).toBe('unknown');
  });

  it('orders the roadmap by priority', () => {
    // The API returns them unordered here on purpose.
    const view = toGraduationStatus(RESPONSE);
    expect(view?.roadmap.map((a) => a.priority)).toEqual([1, 2]);
    expect(view?.roadmap[0]?.action).toBe('Pull a FICO SBSS report');
  });

  it('drops a gate or action carrying no name rather than rendering a blank row', () => {
    const view = toGraduationStatus({
      ...RESPONSE,
      milestoneGates: [{ required: 1, actual: 1, status: 'passed' }, RESPONSE.milestoneGates[0]],
      actionRoadmap: [{ priority: 1 }, RESPONSE.actionRoadmap[0]],
    });
    expect(view?.gates).toHaveLength(1);
    expect(view?.roadmap).toHaveLength(1);
  });

  it('reports no estimate rather than zero when none was made', () => {
    const view = toGraduationStatus({ ...RESPONSE, estimatedMonthsToNextTrack: null });
    expect(view?.estimatedMonthsToNextTrack).toBeNull();
  });

  it('has no next track at the top of the progression', () => {
    const view = toGraduationStatus({ ...RESPONSE, nextTrack: null, nextTrackLabel: null });
    expect(view?.nextTrackLabel).toBeNull();
  });
});

describe('gatesByStatus', () => {
  it('counts each outcome separately', () => {
    const view = toGraduationStatus(RESPONSE)!;
    expect(gatesByStatus(view.gates)).toEqual({ passed: 1, failed: 1, unknown: 1 });
  });

  it('does not fold unmeasured gates into failures', () => {
    // The count an advisor reads. "2 not yet" would claim this client fell
    // short twice when they fell short once and were never measured once.
    const view = toGraduationStatus(RESPONSE)!;
    const counts = gatesByStatus(view.gates);
    expect(counts.failed).toBe(1);
    expect(counts.unknown).toBe(1);
  });
});
