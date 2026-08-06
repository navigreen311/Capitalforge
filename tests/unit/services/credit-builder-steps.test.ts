// ============================================================
// DUNS step derivation — what the data says vs what an advisor said
//
// A client with a PAYDEX of 80 showed the score card ticked, the step-5
// progress bar full at 80/80, and the step itself unchecked with the track at
// 0/6. Nothing connected the figure on screen to the step describing it,
// because completion was manual-only and stored nowhere.
//
// Four steps are now read from the client's data and two stay an advisor's
// claim. These pin which is which, each rule's boundary, and the property that
// makes the split worth having: a derived step reports the data even when a
// stored mark says otherwise.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  deriveStepStates,
  isDerivedStep,
  DERIVED_STEPS,
  type StepDerivationInput,
  type AttestedMark,
} from '../../../src/backend/services/credit-builder-steps.service';

/** A client with nothing on file. */
const EMPTY: StepDerivationInput = {
  addressLine1: null,
  city: null,
  state: null,
  zip: null,
  phoneNumber: null,
  dnbTradelineCount: 0,
  paydex: null,
  paydexPulledAt: null,
  sbss: null,
  sbssPulledAt: null,
  intelliscore: null,
  intelliscorePulledAt: null,
  equifaxBusinessRisk: null,
  equifaxBusinessRiskPulledAt: null,
  equifaxOneScore: null,
  businessAgeMonths: null,
  submittedApplicationCount: 0,
};

/** A client who satisfies all four derived steps. */
const COMPLETE: StepDerivationInput = {
  addressLine1: '500 Main St',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  phoneNumber: '+15125550100',
  dnbTradelineCount: 5,
  paydex: 80,
  paydexPulledAt: new Date('2026-03-01T00:00:00.000Z'),
  sbss: 180,
  sbssPulledAt: new Date('2026-03-01T00:00:00.000Z'),
  intelliscore: 64,
  intelliscorePulledAt: new Date('2026-03-01T00:00:00.000Z'),
  equifaxBusinessRisk: 640,
  equifaxBusinessRiskPulledAt: new Date('2026-03-01T00:00:00.000Z'),
  equifaxOneScore: null,
  businessAgeMonths: 84,
  submittedApplicationCount: 2,
};

function step(input: StepDerivationInput, n: number, marks: AttestedMark[] = []) {
  return deriveStepStates(input, marks).find((s) => s.stepNumber === n)!;
}

describe('which steps are derived', () => {
  it('derives 2, 4, 5 and 6, and leaves 1 and 3 attested', () => {
    expect([...DERIVED_STEPS].sort()).toEqual([2, 4, 5, 6]);
    expect(isDerivedStep(1)).toBe(false);
    expect(isDerivedStep(3)).toBe(false);
  });

  it('labels every step with the kind of claim it carries', () => {
    const states = deriveStepStates(EMPTY, []);
    expect(states).toHaveLength(6);
    expect(states.map((s) => s.source)).toEqual([
      'attested', 'derived', 'attested', 'derived', 'derived', 'derived',
    ]);
  });

  it('gives a derived step no author, and an attested one no basis', () => {
    const marks: AttestedMark[] = [
      { stepNumber: 1, completed: true, completedAt: new Date('2026-08-01'), completedBy: 'user-1' },
    ];
    const derived = step(COMPLETE, 5, marks);
    const attested = step(COMPLETE, 1, marks);

    // Nobody marked the PAYDEX, and the date it crossed 80 is recorded nowhere.
    expect(derived.completedBy).toBeNull();
    expect(derived.completedAt).toBeNull();
    expect(derived.basis).toBeTruthy();

    // An advisor's claim has an author and a date, and no figure behind it.
    expect(attested.completedBy).toBe('user-1');
    expect(attested.completedAt).toBe(new Date('2026-08-01').toISOString());
    expect(attested.basis).toBeNull();
  });
});

describe('step 2 — address and phone', () => {
  it('is met when all four address parts and a phone are on file', () => {
    expect(step(COMPLETE, 2).completed).toBe(true);
    expect(step(COMPLETE, 2).basis).toBe('Address and phone on file');
  });

  it('names what is missing rather than just failing', () => {
    expect(step(EMPTY, 2).basis).toBe('Missing on the client record: street, city, state, ZIP, phone');
  });

  it('does not accept a partial address', () => {
    // D&B matches on consistent NAP data; three quarters of an address
    // matches nothing.
    const noZip = { ...COMPLETE, zip: null };
    expect(step(noZip, 2).completed).toBe(false);
    expect(step(noZip, 2).basis).toBe('Missing on the client record: ZIP');
  });

  it('treats whitespace as absent', () => {
    expect(step({ ...COMPLETE, phoneNumber: '   ' }, 2).completed).toBe(false);
  });
});

describe('step 4 — trade lines reporting to D&B', () => {
  it('completes at five', () => {
    expect(step({ ...COMPLETE, dnbTradelineCount: 4 }, 4).completed).toBe(false);
    expect(step({ ...COMPLETE, dnbTradelineCount: 5 }, 4).completed).toBe(true);
    expect(step({ ...COMPLETE, dnbTradelineCount: 9 }, 4).completed).toBe(true);
  });

  it('states the count it counted', () => {
    expect(step({ ...COMPLETE, dnbTradelineCount: 3 }, 4).basis)
      .toBe('3 of 5 trade lines reporting to D&B');
  });
});

describe('step 5 — PAYDEX', () => {
  it('completes at 80, the same figure the score card shows', () => {
    // The defect that prompted all of this: PAYDEX 80, target 80, bar full,
    // step unchecked.
    expect(step({ ...COMPLETE, paydex: 79 }, 5).completed).toBe(false);
    expect(step({ ...COMPLETE, paydex: 80 }, 5).completed).toBe(true);
  });

  it('reports no score rather than a zero', () => {
    const none = step({ ...COMPLETE, paydex: null, paydexPulledAt: null }, 5);
    expect(none.completed).toBe(false);
    expect(none.basis).toBe('No PAYDEX on record');
  });

  it('carries the pull date, so the basis is checkable', () => {
    expect(step(COMPLETE, 5).basis).toBe('PAYDEX 80, pulled 2026-03-01');
  });
});

describe('step 6 — applied for cards', () => {
  it('needs an application that left draft', () => {
    expect(step({ ...COMPLETE, submittedApplicationCount: 0 }, 6).completed).toBe(false);
    expect(step({ ...COMPLETE, submittedApplicationCount: 1 }, 6).completed).toBe(true);
  });

  it('counts them, and gets the singular right', () => {
    expect(step({ ...COMPLETE, submittedApplicationCount: 1 }, 6).basis)
      .toBe('1 card application submitted');
    expect(step({ ...COMPLETE, submittedApplicationCount: 3 }, 6).basis)
      .toBe('3 card applications submitted');
    expect(step({ ...COMPLETE, submittedApplicationCount: 0 }, 6).basis)
      .toBe('No card application submitted');
  });
});

describe('a stored mark cannot outvote the data', () => {
  const MARKED_EVERYTHING: AttestedMark[] = [1, 2, 3, 4, 5, 6].map((stepNumber) => ({
    stepNumber,
    completed: true,
    completedAt: new Date('2026-07-01'),
    completedBy: 'user-1',
  }));

  it('ignores a mark on a derived step', () => {
    // Rows like these exist: every step was manually markable before these
    // rules. A mark on step 5 from last week must not report a PAYDEX the
    // client does not have.
    const states = deriveStepStates(EMPTY, MARKED_EVERYTHING);

    for (const n of [2, 4, 5, 6]) {
      const s = states.find((x) => x.stepNumber === n)!;
      expect(s.completed, `step ${n} follows the data, not the mark`).toBe(false);
      expect(s.completedBy).toBeNull();
    }
  });

  it('still honours a mark on an attested step', () => {
    const states = deriveStepStates(EMPTY, MARKED_EVERYTHING);
    expect(states.find((s) => s.stepNumber === 1)!.completed).toBe(true);
    expect(states.find((s) => s.stepNumber === 3)!.completed).toBe(true);
  });

  it('goes backwards when the data does', () => {
    // The property that makes deriving worth it. Close a trade line and the
    // step stops being complete, which a stored mark could never do.
    expect(step(COMPLETE, 4).completed).toBe(true);
    expect(step({ ...COMPLETE, dnbTradelineCount: 4 }, 4).completed).toBe(false);
  });
});

describe('a client with everything', () => {
  it('completes all four derived steps without anybody marking one', () => {
    const states = deriveStepStates(COMPLETE, []);
    expect(states.filter((s) => s.completed).map((s) => s.stepNumber)).toEqual([2, 4, 5, 6]);
  });
});
