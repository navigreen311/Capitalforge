// ============================================================
// The one collapse that granted eligibility instead of withholding it
//
// Five numeric inputs to the graduation assessment collapsed to 0 when absent.
// Four of them gate on a *minimum* — FICO, business age, revenue, tradelines —
// so a zero fails, which is the safe direction and merely mislabels the reason.
//
// Utilisation gates on a **maximum**. The identical collapse inverts:
// `0 <= 0.30` is true on every track, so a client whose utilisation nobody had
// measured cleared the requirement. That contradicts the rule stated twelve
// lines further down the same function —
//
//   "Unknown does not pass. A track is a statement that the client clears
//    every requirement, and 'we did not measure that one' is not clearing it."
//
// — which `gates.every(...)` honoured and the input feeding it did not.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  checkTrackEligibility,
  GRADUATION_TRACKS,
  type GraduationInput,
} from '../../../src/backend/services/client-graduation.service';

/** A client who clears every other requirement for the starter track. */
const OTHERWISE_ELIGIBLE: GraduationInput = {
  ficoScore: 700,
  businessAgeMonths: 24,
  monthlyRevenue: 20_000,
  businessScores: {},
  tradelineCount: 6,
  currentUtilization: 0.2,
};

const utilisationGate = (input: GraduationInput) => {
  const { gates } = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, input);
  return gates.find((g) => g.criterion.startsWith('Credit Utilization'))!;
};

describe('an unmeasured utilisation does not clear a maximum', () => {
  it('reports unknown rather than passed', () => {
    // The defect: 0 <= 0.70 is true, so this gate passed on no data at all.
    const gate = utilisationGate({ ...OTHERWISE_ELIGIBLE, currentUtilization: null });
    expect(gate.status).toBe('unknown');
    expect(gate.passed).toBe(false);
  });

  it('shows no figure, rather than 0.0%', () => {
    const gate = utilisationGate({ ...OTHERWISE_ELIGIBLE, currentUtilization: null });
    expect(gate.actual).toBeNull();
  });

  it('says it is not a shortfall', () => {
    // The same wording the business-score gate has used all along. A gate that
    // reads "failed" invites an advisor to fix a number; this one needs
    // somebody to go and measure it.
    const gate = utilisationGate({ ...OTHERWISE_ELIGIBLE, currentUtilization: null });
    expect(gate.resolution).toMatch(/not a shortfall/i);
  });

  it('withholds the track it used to grant', () => {
    // The consequence, asserted end to end: this client clears every other
    // requirement, so utilisation was the only thing standing between them and
    // an eligibility decision made on data nobody had.
    const measured = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, OTHERWISE_ELIGIBLE);
    expect(measured.eligible).toBe(true);

    const unmeasured = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, {
      ...OTHERWISE_ELIGIBLE,
      currentUtilization: null,
    });
    expect(unmeasured.eligible).toBe(false);
  });
});

describe('a measured utilisation still behaves exactly as before', () => {
  it('passes when inside the maximum', () => {
    const gate = utilisationGate({ ...OTHERWISE_ELIGIBLE, currentUtilization: 0.2 });
    expect(gate.status).toBe('passed');
    expect(gate.actual).toBe('20.0%');
  });

  it('fails when above it', () => {
    const gate = utilisationGate({ ...OTHERWISE_ELIGIBLE, currentUtilization: 0.9 });
    expect(gate.status).toBe('failed');
    expect(gate.actual).toBe('90.0%');
  });

  it('treats a genuine zero as measured, not absent', () => {
    // The other half of the same conflation. The input was built with
    // `latestPersonal?.utilization ? Number(...) : 0`, and 0 is falsy — so a
    // client who genuinely carries no balance was folded in with a client
    // nobody had measured, from the opposite end.
    const gate = utilisationGate({ ...OTHERWISE_ELIGIBLE, currentUtilization: 0 });
    expect(gate.status).toBe('passed');
    expect(gate.actual).toBe('0.0%');
  });
});
