// ============================================================
// A gate that was never measured is unknown, not failed
//
// The four remaining numeric requirements — FICO, business age, revenue and
// trade lines — arrived as 0 when absent. All four gate on a *minimum*, so a
// zero fails, which is the safe direction. That is why it survived so long.
//
// What it cost was the reason. A client with no credit report on file was
// shown "Personal FICO Score — required 620, actual 0, gap 620", which tells
// an advisor to raise a catastrophic score. The work is to pull a report, and
// no amount of improving anything closes a 620-point gap that does not exist.
//
// `MilestoneGate` has carried `status: 'unknown'` all along, and the
// business-score gate has used it properly the whole time. These four sat
// beside it on the old shape.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  checkTrackEligibility,
  estimateMonthsToNextTrack,
  GRADUATION_TRACKS,
  type GraduationInput,
  type MilestoneGate,
} from '../../../src/backend/services/client-graduation.service';

const MEASURED: GraduationInput = {
  ficoScore: 700,
  businessAgeMonths: 24,
  monthlyRevenue: 20_000,
  businessScores: {},
  tradelineCount: 6,
  currentUtilization: 0.2,
};

function gate(input: GraduationInput, startsWith: string): MilestoneGate {
  const { gates } = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, input);
  return gates.find((g) => g.criterion.startsWith(startsWith))!;
}

const CASES: Array<[keyof GraduationInput, string, RegExp]> = [
  ['ficoScore', 'Personal FICO Score', /pull a personal credit report/i],
  ['businessAgeMonths', 'Business Age', /formation date/i],
  ['monthlyRevenue', 'Monthly Revenue', /record revenue/i],
  ['tradelineCount', 'Active Positive Tradelines', /business credit report/i],
];

describe.each(CASES)('%s, when it has never been measured', (field, criterion, resolution) => {
  const unmeasured = { ...MEASURED, [field]: null } as GraduationInput;

  it('reads unknown rather than failed', () => {
    expect(gate(unmeasured, criterion).status).toBe('unknown');
  });

  it('shows no figure rather than 0', () => {
    // The visible half of the defect: "actual 0" is a measurement.
    expect(gate(unmeasured, criterion).actual).toBeNull();
  });

  it('reports no gap', () => {
    // A gap is a distance to a target, and there is no distance from nothing.
    expect(gate(unmeasured, criterion).gap).toBeNull();
  });

  it('does not pass', () => {
    // Unknown is not a pass. These four fail closed either way; the point is
    // that they now fail closed for the stated reason.
    expect(gate(unmeasured, criterion).passed).toBe(false);
  });

  it('says what to do about it', () => {
    expect(gate(unmeasured, criterion).resolution).toMatch(resolution);
  });
});

describe('measured values are untouched', () => {
  it('passes a figure that clears the minimum', () => {
    const g = gate(MEASURED, 'Personal FICO Score');
    expect(g.status).toBe('passed');
    expect(g.actual).toBe(700);
  });

  it('fails a figure that does not, and reports the real gap', () => {
    const g = gate({ ...MEASURED, ficoScore: 600 }, 'Personal FICO Score');
    expect(g.status).toBe('failed');
    expect(g.gap).toBe(20);
  });

  it('treats a genuine zero as measured', () => {
    // A business with no trade lines reporting is a real finding, distinct
    // from one whose report has never been pulled.
    const g = gate({ ...MEASURED, tradelineCount: 0 }, 'Active Positive Tradelines');
    expect(g.status).toBe('failed');
    expect(g.actual).toBe(0);
    expect(g.gap).toBe(2);
  });
});

describe('the timeline estimate', () => {
  it('is null when any requirement was never measured', () => {
    // Zero means "nothing left to close". An unmeasured FICO used to project a
    // climb from zero — a number, confidently wrong — and an unmeasured
    // revenue skipped its branch in silence. Neither is an estimate.
    expect(
      estimateMonthsToNextTrack(
        { ...MEASURED, ficoScore: null },
        GRADUATION_TRACKS.FULL_STACK,
      ),
    ).toBeNull();
  });

  it('still estimates when everything is on record', () => {
    const months = estimateMonthsToNextTrack(
      { ...MEASURED, ficoScore: 640 },
      GRADUATION_TRACKS.FULL_STACK,
    );
    expect(months).not.toBeNull();
    expect(months!).toBeGreaterThan(0);
  });
});
