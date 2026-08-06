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
  equifaxBusinessRisk: null,
  equifaxBusinessRiskPulledAt: null,
  equifaxOneScore: null,
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
  equifaxBusinessRisk: 640,
  equifaxBusinessRiskPulledAt: new Date('2026-03-01'),
  equifaxOneScore: null,
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
    // sc_004 and sc_008 were here until the SBSS gates were removed on
    // 2026-08-05. They were the two that had never been assessable for anyone.
    for (const id of ['sc_003', 'sc_005', 'sc_007']) {
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

  it('no longer gates any tier on a score nobody can obtain', () => {
    // This asserted that sc_004 and sc_008 read the same SBSS at 140 and 175.
    // Both are gone (2026-08-05): FICO computes SBSS when a lender requests
    // it, so no client could clear either by any action, and the thresholds
    // were stale — 140 had been superseded twice and the SBA retired the
    // requirement entirely, while 175 had no source at all.
    //
    // Pinned as an absence rather than deleted, so re-adding a gate on an
    // unobtainable product has to argue with a test rather than slip in.
    const withSbss = { ...STRONG, sbss: 150 };
    const ids = assessStackingCriteria(withSbss, true).map((c) => c.id);

    expect(ids).not.toContain('sc_004');
    expect(ids).not.toContain('sc_008');
    expect(
      assessStackingCriteria(withSbss, true).some((c) => /SBSS/i.test(c.label)),
      'no criterion should gate on SBSS',
    ).toBe(false);
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

describe('sc_006 — Equifax’s own business product', () => {
  it('is assessed against the Equifax risk score, on its own scale', () => {
    // Unassessable until the Equifax adapter stopped writing `sbss`: nothing
    // produced the score this reads, so no client could satisfy it.
    expect(criterion({ ...STRONG, equifaxBusinessRisk: 499 }, 'sc_006').status).toBe('not_met');
    expect(criterion({ ...STRONG, equifaxBusinessRisk: 500 }, 'sc_006').status).toBe('met');
    // 700 is above the OneScore range, so the basis is the plain one.
    expect(criterion({ ...STRONG, equifaxBusinessRisk: 700 }, 'sc_006').basis)
      .toBe('Equifax Business Risk 700, needs 500');
  });


  it('names the ambiguity when the value could be either Equifax product', () => {
    // OneScore for Commercial runs 300–650, entirely inside Business Credit
    // Risk's 101–992. Every OneScore is a syntactically valid risk score, so a
    // value in that band cannot say which product it is.
    const c = criterion({ ...STRONG, equifaxBusinessRisk: 640 }, 'sc_006');

    // Still assessed. This is a legitimate risk score, and a flag covering the
    // whole 300–650 band would cover a third of the scale and be read as
    // decoration within a week.
    expect(c.status).toBe('met');
    expect(c.basis).toMatch(/Equifax Business Risk 640, needs 500/);
    expect(c.basis).toMatch(/also falls inside OneScore for Commercial's range/);
    expect(c.basis).toMatch(/confirm the report says "Business Credit Risk"/);
  });

  it('says nothing about ambiguity outside the overlap', () => {
    // 900 cannot be a OneScore, so the caveat would be noise.
    expect(criterion({ ...STRONG, equifaxBusinessRisk: 900 }, 'sc_006').basis)
      .not.toMatch(/OneScore/);
    expect(criterion({ ...STRONG, equifaxBusinessRisk: 200 }, 'sc_006').basis)
      .not.toMatch(/OneScore/);
  });

  it('distinguishes the wrong Equifax product from no Equifax score', () => {
    // The case that used to read as "nothing on record", which sends an
    // advisor to buy a report they already have.
    const wrongProduct = criterion(
      { ...STRONG, equifaxBusinessRisk: null, equifaxOneScore: 520 },
      'sc_006',
    );

    expect(wrongProduct.status).toBe('unassessable');
    expect(wrongProduct.basis).toMatch(/OneScore for Commercial of 520 is on record/);
    expect(wrongProduct.basis).toMatch(/different product/);
    // And it does not claim the client failed a threshold.
    expect(wrongProduct.status).not.toBe('not_met');
  });

  it('is unknown when no Equifax score of any kind is recorded', () => {
    const none = criterion(
      { ...STRONG, equifaxBusinessRisk: null, equifaxOneScore: null },
      'sc_006',
    );
    expect(none.status).toBe('unknown');
    expect(none.basis).toMatch(/No Equifax Business Risk on record/);
    expect(none.basis).not.toMatch(/OneScore/);
  });

  it('is not assessed from an SBSS, which is a different product', () => {
    // 190 is a strong SBSS and would be a very weak Equifax risk score. Before
    // the adapter split, one figure was being read as both.
    const sbssOnly = { ...STRONG, equifaxBusinessRisk: null };
    expect(sbssOnly.sbss).toBe(190);
    expect(criterion(sbssOnly, 'sc_006').status).toBe('unknown');
    expect(criterion(sbssOnly, 'sc_006').basis)
      .toBe('No Equifax Business Risk on record for this client');
  });

  it('no longer leaves Tier 2 permanently locked', () => {
    const tier2 = assessTiers(assessStackingCriteria(STRONG, true)).find((t) => t.tier === 2)!;
    expect(tier2.unlocked).toBe(true);
    // Two, not three: sc_004 (SBSS ≥ 140) left on 2026-08-05. Both survivors
    // measure credit strength and both are obtainable, so Tier 2 keeps full
    // coverage — unlike Tier 3.
    expect(tier2.met).toBe(2);
    expect(tier2.coverage).toBe('full');
    expect(tier2.blockedBy).toEqual([]);
  });

  it('marks Tier 3 narrow, and says so however its one criterion lands', () => {
    // The count is honest and still misleading on its own: "1 of 1 met" reads
    // as a fully assessed tier rather than one with a single requirement left
    // standing after the rest were removed as unmeasurable. Coverage is a
    // fact about the tier, so it holds whether the client passes or not.
    const passing = assessTiers(assessStackingCriteria(STRONG, true)).find((t) => t.tier === 3)!;
    expect(passing.total).toBe(1);
    expect(passing.met).toBe(1);
    expect(passing.unlocked).toBe(true);
    expect(passing.coverage).toBe('narrow');
    expect(passing.coverageNote).toMatch(/not evidence of credit strength/i);

    const failing = assessTiers(
      assessStackingCriteria({ ...STRONG, businessAgeMonths: 6 }, true),
    ).find((t) => t.tier === 3)!;
    expect(failing.unlocked).toBe(false);
    expect(failing.coverage).toBe('narrow');
    expect(failing.coverageNote).toBe(passing.coverageNote);
  });

  it('counts unmeasured criteria separately from failed ones', () => {
    // The defect this prevents: "2 of 4 met" is the same fraction whether the
    // other two fell short or were never measurable, and only one of those is
    // the client's problem.
    const tiers = assessTiers(
      assessStackingCriteria({ ...STRONG, intelliscore: null, equifaxBusinessRisk: 400 }, true),
    );
    const tier2 = tiers.find((t) => t.tier === 2)!;

    expect(tier2.notYetMeasured).toBe(1);
    expect(tier2.notMet).toBe(1);
    expect(tier2.met).toBe(0);
    expect(tier2.notYetMeasured + tier2.notMet + tier2.met + tier2.cannotAssess).toBe(tier2.total);
  });

  it('still locks the tier when the score has not been pulled', () => {
    const tier2 = assessTiers(
      assessStackingCriteria({ ...STRONG, equifaxBusinessRisk: null }, true),
    ).find((t) => t.tier === 2)!;

    // Locked, but for a reason the client can act on — and reported as not
    // measured rather than as a threshold they failed.
    expect(tier2.unlocked).toBe(false);
    expect(tier2.blockedBy).toEqual(['Equifax Business Credit ≥ 500']);
  });
});

describe('no criterion is gated on a product nothing produces', () => {
  it('has a producer for every score the eight criteria read', () => {
    // The check that would have caught sc_006 before it shipped: every score
    // type a criterion reads must be one some adapter writes.
    const PRODUCED = new Set(['paydex', 'intelliscore', 'sbss', 'equifax_business_risk']);
    const READ_BY_CRITERIA = ['paydex', 'sbss', 'intelliscore', 'equifax_business_risk'];

    for (const scoreType of READ_BY_CRITERIA) {
      expect(PRODUCED.has(scoreType), `${scoreType} has a producer`).toBe(true);
    }
  });

  it('reports every criterion as assessable once the scores are on record', () => {
    const criteria = assessStackingCriteria(STRONG, true);
    expect(criteria.filter((c) => c.status === 'unassessable')).toEqual([]);
    expect(criteria.every((c) => c.status === 'met')).toBe(true);
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
