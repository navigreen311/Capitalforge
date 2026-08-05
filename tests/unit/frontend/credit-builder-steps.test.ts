// ============================================================
// DUNS track progress — the marks that feed a readiness claim
//
// The six completion circles on /credit-builder were component state. They did
// not survive a refresh and they were keyed to nobody, so marks made against
// one client stayed on screen after switching to another — and `tier1Unlocked`
// read the count, so the "ready for Tier 1 stacking" banner rested partly on
// three checkboxes that belonged to no business.
//
// These pin the two judgments that make that impossible to repeat: an unread
// track is null rather than a count of nothing, and a milestone is announced
// only for a crossing observed between two known readings.
// ============================================================

import { describe, it, expect } from 'vitest';
import { toDunsSteps, completedStepCount } from '../../../src/frontend/lib/credit-view';
import { checkMilestones } from '../../../src/frontend/lib/credit-milestones';

/** Captured from GET /api/credit-builder/:clientId/steps. */
const STEPS_RESPONSE = {
  clientId: 'seed-biz-001',
  steps: [
    { stepNumber: 1, source: 'attested', completed: true, basis: null, completedAt: '2026-08-01T10:00:00.000Z', completedBy: 'user-1' },
    { stepNumber: 2, source: 'derived', completed: true, basis: 'Address and phone on file', completedAt: null, completedBy: null },
    { stepNumber: 3, source: 'attested', completed: false, basis: null, completedAt: null, completedBy: null },
    { stepNumber: 4, source: 'derived', completed: false, basis: '0 of 5 trade lines reporting to D&B', completedAt: null, completedBy: null },
    { stepNumber: 5, source: 'derived', completed: false, basis: 'No PAYDEX on record', completedAt: null, completedBy: null },
    { stepNumber: 6, source: 'derived', completed: false, basis: 'No card application submitted', completedAt: null, completedBy: null },
  ],
  completedCount: 2,
  totalSteps: 6,
};

describe('toDunsSteps', () => {
  it('maps the six steps the API returns', () => {
    const steps = toDunsSteps(STEPS_RESPONSE);
    expect(steps).toHaveLength(6);
    expect(steps?.[0]).toEqual({
      stepNumber: 1,
      source: 'attested',
      completed: true,
      basis: null,
      completedAt: '2026-08-01T10:00:00.000Z',
      completedBy: 'user-1',
    });
  });

  it('carries the kind of claim each step makes, and its basis', () => {
    const steps = toDunsSteps(STEPS_RESPONSE);
    expect(steps?.map((s) => s.source)).toEqual([
      'attested', 'derived', 'attested', 'derived', 'derived', 'derived',
    ]);
    expect(steps?.[1]?.basis).toBe('Address and phone on file');
    // An attested step's evidence is the person who marked it, not a figure.
    expect(steps?.[0]?.basis).toBeNull();
  });

  it('treats an unrecognised source as attested', () => {
    // The safe direction: an attested step offers a control and names who
    // marked it, so a mislabelled one is visibly wrong rather than quietly
    // authoritative about data it never read.
    const steps = toDunsSteps({ steps: [{ stepNumber: 1, completed: true }] });
    expect(steps?.[0]?.source).toBe('attested');
  });

  it('accepts the response either bare or under a data wrapper', () => {
    expect(toDunsSteps({ data: STEPS_RESPONSE })).toHaveLength(6);
  });

  it('is null when the track has not been read', () => {
    // No client selected, or the request failed. Not the same as a client who
    // has completed none of the steps.
    expect(toDunsSteps(undefined)).toBeNull();
    expect(toDunsSteps(null)).toBeNull();
    expect(toDunsSteps({})).toBeNull();
  });

  it('distinguishes an unread track from a client who has done nothing', () => {
    expect(completedStepCount(null)).toBeNull();
    expect(completedStepCount(toDunsSteps({ ...STEPS_RESPONSE, steps: [] }))).toBe(0);
    expect(completedStepCount(toDunsSteps(STEPS_RESPONSE))).toBe(2);
  });

  it('drops a row carrying no step number rather than numbering it', () => {
    const steps = toDunsSteps({ steps: [{ completed: true }, STEPS_RESPONSE.steps[0]] });
    expect(steps).toHaveLength(1);
    expect(steps?.[0]?.stepNumber).toBe(1);
  });

  it('treats anything but true as not completed', () => {
    const steps = toDunsSteps({ steps: [{ stepNumber: 1, completed: 'yes' }] });
    expect(steps?.[0]?.completed).toBe(false);
  });
});

describe('checkMilestones', () => {
  it('announces a crossing between two known readings', () => {
    const alerts = checkMilestones(
      { paydex: 76, tradelineCount: 4 },
      { paydex: 81, tradelineCount: 5 },
      'seed-biz-001',
    );
    expect(alerts.map((a: { id: string }) => a.id)).toEqual(['paydex_80', 'tradelines_5']);
  });

  it('carries the client through to the optimizer link', () => {
    const [alert] = checkMilestones({ paydex: 70, tradelineCount: 0 }, { paydex: 80, tradelineCount: 0 }, 'seed-biz-001');
    expect(alert?.action?.url).toBe('/optimizer?client_id=seed-biz-001&from=milestone');
  });

  it('says nothing on the first reading', () => {
    // A client who has held a PAYDEX of 85 for two years has not just crossed
    // 80. With no previous reading there is no crossing to report.
    expect(checkMilestones(null, { paydex: 85, tradelineCount: 9 })).toEqual([]);
  });

  it('does not treat an unknown figure as a zero', () => {
    // Null is "not read", and reading a figure for the first time is not
    // progress. Treating it as 0 would announce a milestone on page load.
    expect(checkMilestones({ paydex: null, tradelineCount: null }, { paydex: 88, tradelineCount: 7 })).toEqual([]);
    expect(checkMilestones({ paydex: 60, tradelineCount: 1 }, { paydex: null, tradelineCount: null })).toEqual([]);
  });

  it('does not re-announce a threshold already above it', () => {
    expect(checkMilestones({ paydex: 82, tradelineCount: 6 }, { paydex: 84, tradelineCount: 7 })).toEqual([]);
  });

  it('says nothing when a figure falls back below', () => {
    expect(checkMilestones({ paydex: 82, tradelineCount: 6 }, { paydex: 74, tradelineCount: 3 })).toEqual([]);
  });
});
