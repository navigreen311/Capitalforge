// ============================================================
// Stacking unlock criteria — assessed, and honest about the one that cannot be
//
// The panel held eight criteria as literals with a hardcoded status of
// "unknown" and `allMet = false` beside them, so it reported "8 stacking
// criteria, none assessed" to every client since it was written.
//
// Seven are answerable from data this system holds. The eighth is not
// answerable for anybody, and says so: a criterion nothing can assess and a
// criterion a client fails are different facts, and only one of them is the
// client's problem.
//
// These also pin the property the whole refactor exists for — sc_002 and DUNS
// step 4 are the same question about trade lines, sc_003 and step 5 the same
// question about PAYDEX, and both now read one fact set.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  assessStackingCriteria,
  assessTiers,
} from '../../../src/backend/services/stacking-criteria.service';
import { deriveStepStates } from '../../../src/backend/services/credit-builder-steps.service';
import { monthsSince, reportsToDnb, type CreditFacts } from '../../../src/backend/services/credit-facts';

const NOTHING: CreditFacts = {
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
  businessAgeMonths: null,
  submittedApplicationCount: 0,
};

const STRONG: CreditFacts = {
  addressLine1: '500 Main St',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  phoneNumber: '+15125550100',
  dnbTradelineCount: 6,
  paydex: 84,
  paydexPulledAt: new Date('2026-03-01'),
  sbss: 190,
  sbssPulledAt: new Date('2026-03-01'),
  intelliscore: 72,
  intelliscorePulledAt: new Date('2026-03-01'),
  businessAgeMonths: 84,
  submittedApplicationCount: 3,
};

function criterion(facts: CreditFacts, id: string, dunsAttested = false) {
  return assessStackingCriteria(facts, dunsAttested).find((c) => c.id === id)!;
}

describe('a client with nothing on file', () => {
  it('is not reported as failing thresholds nobody measured', () => {
    const criteria = assessStackingCriteria(NOTHING, false);

    // The scores were never pulled. "Unknown" is the honest answer, and
    // `null >= 140` being false in JavaScript is not a reason to say "not met".
    for (const id of ['sc_003', 'sc_004', 'sc_005', 'sc_007', 'sc_008']) {
      expect(criteria.find((c) => c.id === id)!.status, id).toBe('unknown');
    }
  });

  it('does report the countable ones, which are genuinely zero', () => {
    // A trade line count of zero is a real answer, not an absence.
    expect(criterion(NOTHING, 'sc_002').status).toBe('not_met');
    expect(criterion(NOTHING, 'sc_002').basis).toBe('0 of 5 trade lines reporting to D&B');
  });

  it('unlocks no tier', () => {
    expect(assessTiers(assessStackingCriteria(NOTHING, false)).every((t) => !t.unlocked)).toBe(true);
  });
});

describe('sc_001 — an attestation and a fact together', () => {
  it('needs both the advisor’s confirmation and a live D&B file', () => {
    const oneLine = { ...NOTHING, dnbTradelineCount: 1 };

    expect(criterion(oneLine, 'sc_001', true).status).toBe('met');
    expect(criterion(oneLine, 'sc_001', false).status).toBe('not_met');
    expect(criterion(NOTHING, 'sc_001', true).status).toBe('not_met');
  });

  it('says which half is missing', () => {
    expect(criterion(NOTHING, 'sc_001', true).basis)
      .toBe('DUNS confirmed by an advisor, but no trade line reports to D&B yet');
    expect(criterion({ ...NOTHING, dnbTradelineCount: 2 }, 'sc_001', false).basis)
      .toMatch(/no advisor has confirmed the DUNS registration/i);
  });
});

describe('thresholds', () => {
  it('sc_002 completes at five trade lines', () => {
    expect(criterion({ ...STRONG, dnbTradelineCount: 4 }, 'sc_002').status).toBe('not_met');
    expect(criterion({ ...STRONG, dnbTradelineCount: 5 }, 'sc_002').status).toBe('met');
  });

  it('sc_003 completes at PAYDEX 80', () => {
    expect(criterion({ ...STRONG, paydex: 79 }, 'sc_003').status).toBe('not_met');
    expect(criterion({ ...STRONG, paydex: 80 }, 'sc_003').status).toBe('met');
  });

  it('sc_004 and sc_008 read the same SBSS at different thresholds', () => {
    const mid = { ...STRONG, sbss: 150 };
    expect(criterion(mid, 'sc_004').status).toBe('met');
    expect(criterion(mid, 'sc_008').status).toBe('not_met');
  });

  it('sc_005 reads Experian’s own product', () => {
    // Assessable only since business pulls stopped being written as `sbss`
    // whatever bureau produced them. Nothing emitted `intelliscore` before.
    expect(criterion({ ...STRONG, intelliscore: 59 }, 'sc_005').status).toBe('not_met');
    expect(criterion({ ...STRONG, intelliscore: 60 }, 'sc_005').status).toBe('met');
    expect(criterion({ ...STRONG, intelliscore: null }, 'sc_005').basis)
      .toBe('No Intelliscore on record for this client');
  });

  it('sc_007 completes at two years', () => {
    expect(criterion({ ...STRONG, businessAgeMonths: 23 }, 'sc_007').status).toBe('not_met');
    expect(criterion({ ...STRONG, businessAgeMonths: 24 }, 'sc_007').status).toBe('met');
    expect(criterion({ ...STRONG, businessAgeMonths: null }, 'sc_007').basis)
      .toBe('No formation date recorded for this business');
  });
});

describe('sc_006 — the one nothing can answer', () => {
  it('is unassessable for every client, however strong', () => {
    // No pull path produces an Equifax business risk score: the Equifax
    // business adapter writes an SBSS, which is FICO's product on a different
    // scale. There is no figure to compare against 500.
    expect(criterion(STRONG, 'sc_006').status).toBe('unassessable');
    expect(criterion(NOTHING, 'sc_006').status).toBe('unassessable');
  });

  it('says why, rather than reading as a failure', () => {
    expect(criterion(STRONG, 'sc_006').basis).toMatch(/No Equifax business risk score is produced/);
  });

  it('keeps its tier locked, and names itself as the blocker', () => {
    const tiers = assessTiers(assessStackingCriteria(STRONG, true));
    const tier2 = tiers.find((t) => t.tier === 2)!;

    // A tier is a statement that the client clears every requirement, and
    // "we cannot check" is not clearing it.
    expect(tier2.unlocked).toBe(false);
    expect(tier2.met).toBe(2);
    expect(tier2.blockedBy).toEqual(['Equifax Business Credit ≥ 500']);
  });
});

describe('tiers', () => {
  it('unlocks when every criterion in the tier is met', () => {
    const tiers = assessTiers(assessStackingCriteria(STRONG, true));
    expect(tiers.find((t) => t.tier === 1)!.unlocked).toBe(true);
    expect(tiers.find((t) => t.tier === 3)!.unlocked).toBe(true);
  });

  it('names what a tier is waiting on rather than only counting', () => {
    const tier1 = assessTiers(assessStackingCriteria(NOTHING, false)).find((t) => t.tier === 1)!;
    expect(tier1.blockedBy).toEqual([
      'DUNS Registered & Active',
      '5+ Net-30 Trade Lines',
      'Paydex Score ≥ 80',
    ]);
  });
});

describe('the criteria and the DUNS steps cannot drift', () => {
  // The reason both read one fact set. Asked separately they would eventually
  // answer differently — one counting trade lines reporting anywhere and the
  // other counting D&B, one reading the latest pull and the other the highest.
  const CASES: CreditFacts[] = [
    NOTHING,
    STRONG,
    { ...NOTHING, dnbTradelineCount: 5, paydex: 80, paydexPulledAt: new Date('2026-01-01') },
    { ...STRONG, dnbTradelineCount: 4, paydex: 79 },
  ];

  for (const [i, facts] of CASES.entries()) {
    it(`agrees on trade lines and PAYDEX — case ${i + 1}`, () => {
      const steps = deriveStepStates(facts, []);
      const criteria = assessStackingCriteria(facts, false);

      const step4 = steps.find((s) => s.stepNumber === 4)!.completed;
      const step5 = steps.find((s) => s.stepNumber === 5)!.completed;

      expect(criteria.find((c) => c.id === 'sc_002')!.status === 'met').toBe(step4);
      expect(criteria.find((c) => c.id === 'sc_003')!.status === 'met').toBe(step5);
    });
  }
});

describe('shared fact helpers', () => {
  it('recognises the ways a trade line names D&B', () => {
    expect(reportsToDnb(['D&B'])).toBe(true);
    expect(reportsToDnb(['DNB'])).toBe(true);
    expect(reportsToDnb(['Dun & Bradstreet'])).toBe(true);
    expect(reportsToDnb(['Experian Biz'])).toBe(false);
    expect(reportsToDnb(null)).toBe(false);
    expect(reportsToDnb('D&B')).toBe(false);
  });

  it('counts whole months, not part ones', () => {
    expect(monthsSince(new Date('2024-08-05'), new Date('2026-08-05'))).toBe(24);
    // One day short of the anniversary is not two years.
    expect(monthsSince(new Date('2024-08-05'), new Date('2026-08-04'))).toBe(23);
  });
});
