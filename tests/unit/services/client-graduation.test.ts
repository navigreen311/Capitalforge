// ============================================================
// Unit Tests — Client Graduation Engine & Credit Builder Track
//
// Coverage:
//   - resolveCurrentTrack: track resolution for all four bands
//   - checkTrackEligibility: gate-by-gate pass/fail per track
//   - getNextTrack: progression ordering and boundary cases
//   - estimateMonthsToNextTrack: projection accuracy
//   - buildActionRoadmap: action priorities and categories
//   - assessGraduation: full assessment composition
//   - autoAssessGraduation: DB read + event emission (mocked)
//   - evaluateStackingUnlock: stacking gate criteria
//   - buildCreditRoadmap: vendor filtering, milestone targeting
//   - evaluateMilestoneProgress: SBSS milestone tracking
//   - buildCreditRoadmapForBusiness: DB-backed roadmap generation
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-001', publishedAt: new Date() }),
  },
}));

vi.mock('@prisma/client', () => {
  const mockFindUnique = vi.fn();

  const PrismaClient = vi.fn().mockImplementation(() => ({
    business: {
      findUnique: mockFindUnique,
    },
  }));

  return { PrismaClient };
});

// ── Imports (after mocks) ─────────────────────────────────────

import {
  resolveCurrentTrack,
  checkTrackEligibility,
  getNextTrack,
  estimateMonthsToNextTrack,
  buildActionRoadmap,
  assessGraduation,
  autoAssessGraduation,
  setPrismaClient,
  GRADUATION_TRACKS,
  TRACK_THRESHOLDS,
  businessScore,
  businessCreditGate,
  meetsThreshold,
  withBusinessScore,
  type GraduationInput,
  type MilestoneGate,
  type ScoreThreshold,
} from '../../../src/backend/services/client-graduation.service.js';

import {
  evaluateStackingUnlock,
  buildCreditRoadmap,
  evaluateMilestoneProgress,
  buildCreditRoadmapForBusiness,
  setPrismaClient as setCreditBuilderPrisma,
  NET30_VENDORS,
  SBSS_SCORE_MILESTONES,
  DUNS_REGISTRATION_STEPS,
} from '../../../src/backend/services/credit-builder.service.js';

import { eventBus } from '../../../src/backend/events/event-bus.js';
import { PrismaClient } from '@prisma/client';

// ── Test Fixtures ─────────────────────────────────────────────

/**
 * A business-credit threshold, declared here rather than read from
 * TRACK_THRESHOLDS.
 *
 * Every track declared one until the SBSS gates were removed on 2026-08-05;
 * none does now. The rules being proven belong to `meetsThreshold` and
 * `businessCreditGate`, not to any track, and they have to stay provable
 * through a period when no track happens to use them.
 *
 * Annotated `ScoreThreshold<'sbss'>` rather than `as const`. The `as const`
 * form was tried first and silently broke the guarantee — the readonly
 * literal did not bind `T`, so `meetsThreshold` accepted a PAYDEX and the
 * directive marking that error went unused. `tsc` reported the unused
 * directive; the test suite was green throughout. That is the only reason it
 * was caught.
 */
const SBSS_THRESHOLD: ScoreThreshold<'sbss'> = { scoreType: 'sbss', min: 50 };

/** Fully qualifies for LOC/SBA Bridge (highest track) */
const primeInput: GraduationInput = {
  ficoScore:           750,
  businessAgeMonths:   30,
  monthlyRevenue:      20_000,
  businessScores: { sbss: businessScore('sbss', 150) },
  tradelineCount:      8,
  currentUtilization:  0.20,
};

/** Qualifies for Full Stack only */
const fullStackInput: GraduationInput = {
  ficoScore:           700,
  businessAgeMonths:   14,
  monthlyRevenue:      9_000,
  businessScores: { sbss: businessScore('sbss', 60) },
  tradelineCount:      5,
  currentUtilization:  0.40,
};

/** Qualifies for Starter Stack only */
const starterInput: GraduationInput = {
  ficoScore:           640,
  businessAgeMonths:   8,
  monthlyRevenue:      4_000,
  businessScores: { sbss: businessScore('sbss', 0) },
  tradelineCount:      2,
  currentUtilization:  0.65,
};

/** Only qualifies for Credit Builder */
const builderInput: GraduationInput = {
  ficoScore:           580,
  businessAgeMonths:   2,
  monthlyRevenue:      1_000,
  businessScores: { sbss: businessScore('sbss', 0) },
  tradelineCount:      0,
  currentUtilization:  0.90,
};

// ── resolveCurrentTrack ───────────────────────────────────────

describe('resolveCurrentTrack', () => {
  it('resolves to LOC_SBA_BRIDGE for a prime profile', () => {
    expect(resolveCurrentTrack(primeInput)).toBe(GRADUATION_TRACKS.LOC_SBA_BRIDGE);
  });

  it('resolves to FULL_STACK for a full-stack eligible profile', () => {
    expect(resolveCurrentTrack(fullStackInput)).toBe(GRADUATION_TRACKS.FULL_STACK);
  });

  it('resolves to STARTER_STACK for a starter-eligible profile', () => {
    expect(resolveCurrentTrack(starterInput)).toBe(GRADUATION_TRACKS.STARTER_STACK);
  });

  it('resolves to CREDIT_BUILDER for a profile that meets no upper thresholds', () => {
    expect(resolveCurrentTrack(builderInput)).toBe(GRADUATION_TRACKS.CREDIT_BUILDER);
  });

  it('resolves to CREDIT_BUILDER when FICO is below Starter Stack minimum', () => {
    const input: GraduationInput = { ...starterInput, ficoScore: 500 };
    expect(resolveCurrentTrack(input)).toBe(GRADUATION_TRACKS.CREDIT_BUILDER);
  });

  it('resolves to STARTER_STACK even when business credit is zero (not required at starter)', () => {
    const input: GraduationInput = { ...starterInput, businessScores: { sbss: businessScore('sbss', 0) } };
    expect(resolveCurrentTrack(input)).toBe(GRADUATION_TRACKS.STARTER_STACK);
  });
});

// ── checkTrackEligibility ─────────────────────────────────────

describe('checkTrackEligibility', () => {
  describe('CREDIT_BUILDER track', () => {
    it('always returns eligible = true for credit builder (no gates)', () => {
      const { eligible, gates } = checkTrackEligibility(GRADUATION_TRACKS.CREDIT_BUILDER, builderInput);
      expect(eligible).toBe(true);
      expect(gates.every((g) => g.passed)).toBe(true);
    });
  });

  describe('STARTER_STACK track', () => {
    it('passes all gates for a qualifying starter profile', () => {
      const { eligible, gates } = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, starterInput);
      expect(eligible).toBe(true);
      expect(gates.every((g) => g.passed)).toBe(true);
    });

    it('fails FICO gate when score is below 620', () => {
      const input: GraduationInput = { ...starterInput, ficoScore: 610 };
      const { eligible, gates } = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, input);
      expect(eligible).toBe(false);
      const ficoGate = gates.find((g) => g.criterion === 'Personal FICO Score');
      expect(ficoGate?.passed).toBe(false);
      expect(ficoGate?.gap).toBe(10);
    });

    it('fails utilization gate when utilization is above 70%', () => {
      const input: GraduationInput = { ...starterInput, currentUtilization: 0.80 };
      const { eligible, gates } = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, input);
      expect(eligible).toBe(false);
      const utilGate = gates.find((g) => g.criterion === 'Credit Utilization (max)');
      expect(utilGate?.passed).toBe(false);
    });

    it('fails tradeline gate when count is below 2', () => {
      const input: GraduationInput = { ...starterInput, tradelineCount: 1 };
      const { eligible, gates } = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, input);
      const tradelineGate = gates.find((g) => g.criterion === 'Active Positive Tradelines');
      expect(tradelineGate?.passed).toBe(false);
      expect(tradelineGate?.gap).toBe(1);
    });
  });

  describe('FULL_STACK track', () => {
    it('passes all gates for a full-stack eligible profile', () => {
      const { eligible } = checkTrackEligibility(GRADUATION_TRACKS.FULL_STACK, fullStackInput);
      expect(eligible).toBe(true);
    });

    it('no longer gates on a score nobody can obtain', () => {
      // Three tests lived here: a below-threshold SBSS failing the gate, an
      // absent SBSS reporting unknown, and a PAYDEX not being read as an SBSS.
      // All three exercised { scoreType: 'sbss', min: 50 }, removed on
      // 2026-08-05 — FICO computes SBSS when a lender requests it, so no
      // client could clear it by any action, and zero rows of that score type
      // have ever existed here.
      //
      // The rules they proved did not go away; they moved to businessCreditGate
      // below, which is where they can be exercised without a track having to
      // declare a threshold on an unobtainable product.
      //
      // Pinned as an absence so re-adding such a gate argues with a test.
      const input: GraduationInput = { ...fullStackInput, businessScores: { sbss: businessScore('sbss', 30) } };
      const { gates } = checkTrackEligibility(GRADUATION_TRACKS.FULL_STACK, input);

      expect(gates.some((g) => g.criterion.startsWith('Business Credit Score'))).toBe(false);
      // And a low SBSS no longer blocks a client who clears everything else.
      expect(checkTrackEligibility(GRADUATION_TRACKS.FULL_STACK, input).eligible).toBe(true);
    });
  });

  // The business-credit gate is currently unreachable through
  // checkTrackEligibility, because no track declares a threshold. Its rules
  // are still the rules, and a rule that stops being exercised stops being
  // true shortly afterwards — so they are proven directly.
  describe('businessCreditGate — the rules outlive the tracks that used them', () => {
    it('reports an absent score as unknown, not as a failure', () => {
      const gate = businessCreditGate(SBSS_THRESHOLD, {});

      expect(gate.status).toBe('unknown');
      expect(gate.actual).toBeNull();
      expect(gate.gap).toBeNull();
      // Unknown never passes: a track asserts the client clears every
      // requirement, and "we did not check" is not clearing it.
      expect(gate.passed).toBe(false);
    });

    it('says nobody can obtain a lender-computed score, rather than to pull it', () => {
      const gate = businessCreditGate(SBSS_THRESHOLD, {});

      // This engine used to emit "Pull a FICO SBSS report for this client".
      // Nobody can: FICO calculates it when a lender requests it.
      expect(gate.resolution).not.toMatch(/Pull a/i);
      expect(gate.resolution).toMatch(/nobody here can obtain one/i);
      expect(gate.resolution).toMatch(/not a shortfall/i);
    });

    it('still tells an advisor to pull a report they can actually buy', () => {
      // The contrast that makes the rule a distinction rather than a blanket
      // rewording. Intelliscore is about $49.95 from Experian.
      const gate = businessCreditGate({ scoreType: 'intelliscore', min: 60 } as const, {});

      expect(gate.status).toBe('unknown');
      expect(gate.resolution).toMatch(/Pull a/i);
      expect(gate.resolution).toMatch(/not a shortfall/i);
    });

    it('measures a score that is on record', () => {
      const short = businessCreditGate(
        { scoreType: 'sbss', min: 50 } as const,
        withBusinessScore({}, 'sbss', 30),
      );
      expect(short.status).toBe('failed');
      expect(short.gap).toBe(20);
      expect(short.passed).toBe(false);

      const clear = businessCreditGate(
        { scoreType: 'sbss', min: 50 } as const,
        withBusinessScore({}, 'sbss', 60),
      );
      expect(clear.status).toBe('passed');
      expect(clear.passed).toBe(true);
    });

    it('does not read a PAYDEX as though it were the required product', () => {
      // The original defect: Math.max flattened every business score into one
      // number, so a PAYDEX of 88 cleared a threshold of 50 that is an SBSS
      // figure. The gate reads only the product its threshold names.
      const gate = businessCreditGate(
        { scoreType: 'sbss', min: 50 } as const,
        withBusinessScore({}, 'paydex', 88),
      );

      expect(gate.status).toBe('unknown');
      expect(gate.passed).toBe(false);
    });
  });

  describe('LOC_SBA_BRIDGE track', () => {
    it('passes all gates for a prime profile', () => {
      const { eligible } = checkTrackEligibility(GRADUATION_TRACKS.LOC_SBA_BRIDGE, primeInput);
      expect(eligible).toBe(true);
    });

    it('fails revenue gate when monthly revenue is below $15k', () => {
      const input: GraduationInput = { ...primeInput, monthlyRevenue: 12_000 };
      const { eligible, gates } = checkTrackEligibility(GRADUATION_TRACKS.LOC_SBA_BRIDGE, input);
      expect(eligible).toBe(false);
      const revGate = gates.find((g) => g.criterion === 'Monthly Revenue ($)');
      expect(revGate?.passed).toBe(false);
      expect(revGate?.gap).toBe(3_000);
    });

    it('fails FICO gate when score is below 720', () => {
      const input: GraduationInput = { ...primeInput, ficoScore: 710 };
      const { eligible, gates } = checkTrackEligibility(GRADUATION_TRACKS.LOC_SBA_BRIDGE, input);
      expect(eligible).toBe(false);
      const ficoGate = gates.find((g) => g.criterion === 'Personal FICO Score');
      expect(ficoGate?.passed).toBe(false);
    });
  });

  it('returns a gate for every requirement the track actually asserts', () => {
    // Was "always exactly 6", then 6 for the two tracks asserting business
    // credit and 5 for the rest — because a gate reporting "0 required,
    // passed" would imply a requirement exists and that the client cleared it.
    //
    // Five everywhere since 2026-08-05: the two business-credit thresholds
    // were both SBSS, and no track declares one now. Worth stating plainly
    // rather than adjusting a number quietly — Full Stack and LOC/SBA Bridge
    // assert nothing about business credit today, which is a real change in
    // what those tracks mean and not a tidy-up.
    for (const track of Object.values(GRADUATION_TRACKS)) {
      const { gates } = checkTrackEligibility(track, builderInput);
      expect(gates, `${track} gate count`).toHaveLength(5);
      expect(
        gates.some((g) => g.criterion.startsWith('Business Credit Score')),
        `${track} should assert no business-credit gate`,
      ).toBe(false);
    }
  });
});

// ── getNextTrack ──────────────────────────────────────────────

describe('getNextTrack', () => {
  it('returns STARTER_STACK as next after CREDIT_BUILDER', () => {
    expect(getNextTrack(GRADUATION_TRACKS.CREDIT_BUILDER)).toBe(GRADUATION_TRACKS.STARTER_STACK);
  });

  it('returns FULL_STACK as next after STARTER_STACK', () => {
    expect(getNextTrack(GRADUATION_TRACKS.STARTER_STACK)).toBe(GRADUATION_TRACKS.FULL_STACK);
  });

  it('returns LOC_SBA_BRIDGE as next after FULL_STACK', () => {
    expect(getNextTrack(GRADUATION_TRACKS.FULL_STACK)).toBe(GRADUATION_TRACKS.LOC_SBA_BRIDGE);
  });

  it('returns null when already at LOC_SBA_BRIDGE (top track)', () => {
    expect(getNextTrack(GRADUATION_TRACKS.LOC_SBA_BRIDGE)).toBeNull();
  });
});

// ── estimateMonthsToNextTrack ─────────────────────────────────

describe('estimateMonthsToNextTrack', () => {
  it('returns 0 when all criteria are already met for the next track', () => {
    const months = estimateMonthsToNextTrack(primeInput, GRADUATION_TRACKS.LOC_SBA_BRIDGE);
    expect(months).toBe(0);
  });

  it('returns a positive estimate when FICO needs to improve', () => {
    const input: GraduationInput = { ...starterInput, ficoScore: 580 };
    const months = estimateMonthsToNextTrack(input, GRADUATION_TRACKS.FULL_STACK);
    expect(months).toBeGreaterThan(0);
  });

  it('is dominated by business age when age gap is large', () => {
    const input: GraduationInput = { ...builderInput, businessAgeMonths: 0 };
    const months = estimateMonthsToNextTrack(input, GRADUATION_TRACKS.STARTER_STACK);
    // Starter stack requires 6 months; should be at least 6
    expect(months).toBeGreaterThanOrEqual(6);
  });

  it('returns a number, not NaN or Infinity', () => {
    const months = estimateMonthsToNextTrack(builderInput, GRADUATION_TRACKS.STARTER_STACK);
    expect(Number.isFinite(months)).toBe(true);
  });
});

// ── buildActionRoadmap ────────────────────────────────────────

describe('estimateMonthsToNextTrack — an unmeasured gate has no timeline', () => {
  // ⚠ The null-not-zero guard in this function is currently UNREACHABLE.
  //
  // It fires only when a track declares a business-credit threshold and the
  // client has no score of that product. Both thresholds were SBSS and both
  // were removed on 2026-08-05, so no input can reach it today.
  //
  // The guard is kept, and this note is the reason: it exists because a client
  // who cleared every measurable Full Stack gate with no SBSS on record was
  // told "Estimated 0 months at the current rate" — zero means "nothing left
  // to close", and nothing had been closed. The day a track declares a
  // threshold again, that defect returns without it.
  //
  // Two other guards lost their only exercise in the same change: the
  // compile-time proof that a PAYDEX cannot be compared against an SBSS
  // requirement, and businessCreditGate's unknown-not-failed rule. Both were
  // rescued by testing them directly rather than through a track. This one
  // cannot be, without a seam to inject thresholds — recorded rather than
  // quietly dropped, because an untested guard is a guard on its way out.
  //
  // (Do not begin a wrapped comment line with the ts-expect-error directive
  // name. An earlier draft of this note did, and TypeScript read the prose as
  // a real directive on the following line.)

  it('estimates zero when every gate a track asserts is met', () => {
    // Honest today: Full Stack asserts nothing about business credit, so a
    // client meeting the rest has genuinely nothing left to close.
    const input: GraduationInput = {
      ...fullStackInput,
      businessScores: { paydex: businessScore('paydex', 88) },
    };
    expect(estimateMonthsToNextTrack(input, GRADUATION_TRACKS.FULL_STACK)).toBe(0);
  });

  it('still projects months from the gates that remain', () => {
    // Tradelines short by two, so there is a real gap to project from.
    const input: GraduationInput = { ...fullStackInput, tradelineCount: 2 };
    const months = estimateMonthsToNextTrack(input, GRADUATION_TRACKS.FULL_STACK);
    expect(months).not.toBeNull();
    expect(months).toBeGreaterThan(0);
  });
});

describe('buildActionRoadmap', () => {
  it('returns an empty roadmap when no gates are failing', () => {
    const { gates } = checkTrackEligibility(GRADUATION_TRACKS.LOC_SBA_BRIDGE, primeInput);
    const roadmap = buildActionRoadmap(primeInput, gates.filter((g) => !g.passed), GRADUATION_TRACKS.LOC_SBA_BRIDGE);
    expect(roadmap).toHaveLength(0);
  });

  it('prioritises utilization reduction as action #1 when utilization is too high', () => {
    const input: GraduationInput = { ...starterInput, currentUtilization: 0.85 };
    const { gates } = checkTrackEligibility(GRADUATION_TRACKS.FULL_STACK, input);
    const roadmap = buildActionRoadmap(input, gates.filter((g) => !g.passed), GRADUATION_TRACKS.FULL_STACK);
    expect(roadmap[0]?.category).toBe('utilization');
    expect(roadmap[0]?.priority).toBe(1);
  });

  it('includes a credit_score action when FICO is below target', () => {
    const input: GraduationInput = { ...fullStackInput, ficoScore: 640 };
    const { gates } = checkTrackEligibility(GRADUATION_TRACKS.FULL_STACK, input);
    const roadmap = buildActionRoadmap(input, gates.filter((g) => !g.passed), GRADUATION_TRACKS.FULL_STACK);
    const ficoAction = roadmap.find((a) => a.category === 'credit_score');
    expect(ficoAction).toBeDefined();
  });

  it('includes a tradelines action when tradeline count is below target', () => {
    const input: GraduationInput = { ...fullStackInput, tradelineCount: 1 };
    const { gates } = checkTrackEligibility(GRADUATION_TRACKS.FULL_STACK, input);
    const roadmap = buildActionRoadmap(input, gates.filter((g) => !g.passed), GRADUATION_TRACKS.FULL_STACK);
    const tradelineAction = roadmap.find((a) => a.category === 'tradelines');
    expect(tradelineAction).toBeDefined();
  });

  it('assigns sequential priority numbers starting at 1', () => {
    const input: GraduationInput = { ...builderInput };
    const { gates } = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, input);
    const roadmap = buildActionRoadmap(input, gates.filter((g) => !g.passed), GRADUATION_TRACKS.STARTER_STACK);
    const priorities = roadmap.map((a) => a.priority);
    priorities.forEach((p, idx) => expect(p).toBe(idx + 1));
  });
});

// ── assessGraduation (full composition) ──────────────────────

describe('assessGraduation', () => {
  it('correctly identifies current and next tracks', () => {
    const result = assessGraduation('biz-001', starterInput);
    expect(result.currentTrack).toBe(GRADUATION_TRACKS.STARTER_STACK);
    expect(result.nextTrack).toBe(GRADUATION_TRACKS.FULL_STACK);
  });

  it('marks nextTrackEligible as true when next-track criteria are met', () => {
    // fullStackInput already meets full stack; next is LOC_SBA_BRIDGE which it doesn't meet
    const result = assessGraduation('biz-002', fullStackInput);
    expect(result.nextTrack).toBe(GRADUATION_TRACKS.LOC_SBA_BRIDGE);
    expect(result.nextTrackEligible).toBe(false);
  });

  it('sets nextTrack to null at the top of the progression', () => {
    const result = assessGraduation('biz-003', primeInput);
    expect(result.nextTrack).toBeNull();
    expect(result.nextTrackEligible).toBe(false);
  });

  it('returns a non-null estimatedMonthsToNextTrack when not yet eligible', () => {
    const result = assessGraduation('biz-004', builderInput);
    expect(result.estimatedMonthsToNextTrack).not.toBeNull();
    expect(result.estimatedMonthsToNextTrack).toBeGreaterThan(0);
  });

  it('includes actionRoadmap with at least one action for a builder-level client', () => {
    const result = assessGraduation('biz-005', builderInput);
    expect(result.actionRoadmap.length).toBeGreaterThan(0);
  });

  it('sets assessedAt to a recent Date', () => {
    const before = Date.now();
    const result = assessGraduation('biz-006', starterInput);
    const after  = Date.now();
    expect(result.assessedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.assessedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('populates milestoneGates from the next-track threshold check', () => {
    const result = assessGraduation('biz-007', starterInput);
    expect(result.milestoneGates.length).toBeGreaterThan(0);
    // Every gate should have required, actual, and passed fields
    result.milestoneGates.forEach((gate) => {
      expect(gate).toHaveProperty('criterion');
      expect(gate).toHaveProperty('passed');
    });
  });
});

// ── autoAssessGraduation (DB-backed, mocked Prisma) ──────────

describe('autoAssessGraduation', () => {
  // The mocked PrismaClient constructor returns an object of model delegates
  // (business.findUnique, etc.). `ReturnType<typeof vi.fn>` is the Mock type
  // itself, which has no model properties — so every `mockPrisma.business.*`
  // was an error.
  let mockPrisma: Record<string, Record<string, ReturnType<typeof vi.fn>>>;

  beforeEach(() => {
    const instance = new (PrismaClient as ReturnType<typeof vi.fn>)();
    mockPrisma = instance;
    setPrismaClient(instance as unknown as PrismaClient);
    vi.mocked(eventBus.publishAndPersist).mockClear();
  });

  it('throws when business is not found', async () => {
    mockPrisma.business.findUnique.mockResolvedValue(null);
    await expect(
      autoAssessGraduation('nonexistent', 'tenant-001'),
    ).rejects.toThrow('not found');
  });

  it('returns a GraduationAssessment when business exists', async () => {
    mockPrisma.business.findUnique.mockResolvedValue({
      id:              'biz-db-001',
      dateOfFormation: new Date(Date.now() - 14 * 30.44 * 24 * 60 * 60 * 1000),
      monthlyRevenue:  9_000,
      industry:        'technology',
      creditProfiles:  [
        { profileType: 'personal', scoreType: 'fico',  score: 710, utilization: 0.35, pulledAt: new Date(), tradelines: null },
        { profileType: 'business', scoreType: 'sbss',  score: 70,  utilization: null, pulledAt: new Date(), tradelines: [{}, {}, {}, {}, {}] },
      ],
    });

    const result = await autoAssessGraduation('biz-db-001', 'tenant-001');
    expect(result).toHaveProperty('currentTrack');
    expect(result.businessId).toBe('biz-db-001');
  });

  it('publishes a ledger event after a successful assessment', async () => {
    mockPrisma.business.findUnique.mockResolvedValue({
      id:              'biz-db-002',
      dateOfFormation: new Date(Date.now() - 10 * 30.44 * 24 * 60 * 60 * 1000),
      monthlyRevenue:  5_000,
      industry:        'retail',
      creditProfiles:  [],
    });

    await autoAssessGraduation('biz-db-002', 'tenant-001');
    expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();
  });
});

// ── evaluateStackingUnlock ────────────────────────────────────

describe('evaluateStackingUnlock', () => {
  it('returns unlocked = true for a starter-stack-eligible profile', () => {
    const result = evaluateStackingUnlock(starterInput);
    expect(result.unlocked).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
  });

  it('returns unlocked = false for a builder-level profile', () => {
    const result = evaluateStackingUnlock(builderInput);
    expect(result.unlocked).toBe(false);
    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });

  it('includes recommendedActions for each failing criterion', () => {
    const result = evaluateStackingUnlock(builderInput);
    expect(result.recommendedActions.length).toBeGreaterThan(0);
  });

  it('sets track to starter_stack when unlocked', () => {
    const result = evaluateStackingUnlock(starterInput);
    expect(result.track).toBe(GRADUATION_TRACKS.STARTER_STACK);
  });

  it('sets track to credit_builder when locked', () => {
    const result = evaluateStackingUnlock(builderInput);
    expect(result.track).toBe(GRADUATION_TRACKS.CREDIT_BUILDER);
  });
});

// ── buildCreditRoadmap ────────────────────────────────────────

describe('buildCreditRoadmap', () => {
  it('includes all DUNS registration steps', () => {
    const roadmap = buildCreditRoadmap('biz-001', 'technology', starterInput);
    expect(roadmap.dunsSteps).toHaveLength(DUNS_REGISTRATION_STEPS.length);
  });

  it('includes all SBSS milestones', () => {
    const roadmap = buildCreditRoadmap('biz-001', 'technology', starterInput);
    expect(roadmap.sbssMilestones).toHaveLength(SBSS_SCORE_MILESTONES.length);
  });

  it('filters vendors to include universal and industry-specific entries', () => {
    const roadmap = buildCreditRoadmap('biz-001', 'construction', builderInput);
    const industryVendors = roadmap.recommendedVendors.filter(
      (v) => v.industries.includes('construction'),
    );
    const universalVendors = roadmap.recommendedVendors.filter(
      (v) => v.industries.length === 0,
    );
    expect(industryVendors.length + universalVendors.length).toBe(roadmap.recommendedVendors.length);
    expect(industryVendors.length).toBeGreaterThan(0);
  });

  it('returns estimatedCompletionMonths = 0 when stacking is already unlocked', () => {
    const roadmap = buildCreditRoadmap('biz-001', 'general', primeInput);
    expect(roadmap.estimatedCompletionMonths).toBe(0);
  });

  it('returns a positive estimatedCompletionMonths when stacking is locked', () => {
    const roadmap = buildCreditRoadmap('biz-001', 'general', builderInput);
    expect(roadmap.estimatedCompletionMonths).toBeGreaterThan(0);
  });

  it('sets currentSbssTarget to first unachieved SBSS milestone', () => {
    const roadmap = buildCreditRoadmap('biz-001', 'general', builderInput);
    expect(roadmap.currentSbssTarget).not.toBeNull();
    expect(roadmap.currentSbssTarget!.targetScore).toBeGreaterThan(
      builderInput.businessScores.sbss?.value ?? 0,
    );
  });
});

// ── evaluateMilestoneProgress ─────────────────────────────────

describe('evaluateMilestoneProgress', () => {
  it('marks milestones below current score as achieved', () => {
    const progress = evaluateMilestoneProgress(90);
    const achieved = progress.filter((m) => m.achieved);
    expect(achieved.length).toBeGreaterThan(0);
    achieved.forEach((m) => expect(m.targetScore).toBeLessThanOrEqual(90));
  });

  it('marks milestones above current score as not achieved', () => {
    const progress = evaluateMilestoneProgress(40);
    const notAchieved = progress.filter((m) => !m.achieved);
    expect(notAchieved.length).toBeGreaterThan(0);
    notAchieved.forEach((m) => expect(m.targetScore).toBeGreaterThan(40));
  });

  it('returns 4 milestones total', () => {
    const progress = evaluateMilestoneProgress(0);
    expect(progress).toHaveLength(4);
  });

  it('sets gap = 0 for achieved milestones', () => {
    const progress = evaluateMilestoneProgress(300);
    progress.forEach((m) => {
      expect(m.gap).toBe(0);
      expect(m.achieved).toBe(true);
    });
  });

  it('sets requiredActions to empty array for achieved milestones', () => {
    const progress = evaluateMilestoneProgress(300);
    progress.forEach((m) => expect(m.requiredActions).toHaveLength(0));
  });

  it('sets percentComplete to 100 for fully achieved milestones', () => {
    const progress = evaluateMilestoneProgress(300);
    progress.forEach((m) => expect(m.percentComplete).toBe(100));
  });

  it('sets estimatedMonths = 0 for achieved milestones', () => {
    const progress = evaluateMilestoneProgress(300);
    progress.forEach((m) => expect(m.estimatedMonths).toBe(0));
  });
});

// ── buildCreditRoadmapForBusiness (DB-backed) ─────────────────

describe('buildCreditRoadmapForBusiness', () => {
  // The mocked PrismaClient constructor returns an object of model delegates
  // (business.findUnique, etc.). `ReturnType<typeof vi.fn>` is the Mock type
  // itself, which has no model properties — so every `mockPrisma.business.*`
  // was an error.
  let mockPrisma: Record<string, Record<string, ReturnType<typeof vi.fn>>>;

  beforeEach(() => {
    const instance = new (PrismaClient as ReturnType<typeof vi.fn>)();
    mockPrisma = instance;
    setCreditBuilderPrisma(instance as unknown as PrismaClient);
  });

  it('throws when business is not found', async () => {
    mockPrisma.business.findUnique.mockResolvedValue(null);
    await expect(buildCreditRoadmapForBusiness('ghost-001')).rejects.toThrow('not found');
  });

  it('returns a roadmap with DUNS steps and vendor recommendations', async () => {
    mockPrisma.business.findUnique.mockResolvedValue({
      id:              'biz-cr-001',
      dateOfFormation: new Date(Date.now() - 8 * 30.44 * 24 * 60 * 60 * 1000),
      monthlyRevenue:  5_500,
      industry:        'logistics',
      creditProfiles:  [
        { profileType: 'personal', scoreType: 'fico', score: 660, utilization: 0.45, pulledAt: new Date(), tradelines: null },
        { profileType: 'business', scoreType: 'paydex', score: 55, utilization: null, pulledAt: new Date(), tradelines: [{}, {}] },
      ],
    });

    const roadmap = await buildCreditRoadmapForBusiness('biz-cr-001');
    expect(roadmap.dunsSteps.length).toBeGreaterThan(0);
    expect(roadmap.recommendedVendors.length).toBeGreaterThan(0);
    expect(roadmap.businessId).toBe('biz-cr-001');
  });
});

// ── The mistake, made unrepresentable ────────────────────────
//
// `@ts-expect-error` fails the build if the error it marks does NOT occur, so
// these are not documentation — they are the guarantee. `npm run build:backend`
// compiles this directory, and CI runs it.

describe('a score cannot be compared to another product’s threshold', () => {
  it('will not flatten a client’s business scores into one number', () => {
    const scores = withBusinessScore(withBusinessScore({}, 'sbss', 150), 'paydex', 88);

    // The original defect, in the form it was actually written: take the
    // larger of a client's business scores and compare it to a threshold.
    // A BusinessScore is not a number, so neither half compiles.
    // @ts-expect-error — Math.max does not accept BusinessScore
    const flattened = Math.max(scores.sbss, scores.paydex);
    expect(flattened).toBeDefined();

    // @ts-expect-error — nor does comparing two products directly
    const bigger = scores.sbss > scores.paydex;
    expect(bigger).toBeDefined();
  });

  it('does not claim to stop every possible flattening', () => {
    // Honest about the limit. `Object.values` on a mapped type falls through
    // to TypeScript's `values(o: {}): any[]` overload, so spreading it into
    // Math.max still compiles — the values are erased to `any` before the
    // type ever reaches Math.max.
    //
    // The guarantee is on the scores themselves, which is where the defect
    // lived: every site that read them named a product. Nobody reached for
    // Object.values; they wrote Math.max over a mapped list.
    const scores = withBusinessScore({}, 'sbss', 150);
    const erased: unknown[] = Object.values(scores);
    expect(erased).toHaveLength(1);
  });

  // These two took their threshold from FULL_STACK, which declared
  // { scoreType: 'sbss', min: 50 } until the SBSS gates were removed on
  // 2026-08-05. No track declares a business-credit requirement now, so
  // sourcing one from TRACK_THRESHOLDS yields null and the guarantee has
  // nothing to demonstrate — the @ts-expect-error below went unused, which is
  // itself how a type-level guarantee quietly stops guaranteeing anything.
  //
  // Declared locally instead. The rule being proven is a property of
  // meetsThreshold, not of any particular track, and it must keep being
  // provable through a period when no track happens to use it. Inventing a
  // track threshold to keep the test alive would have been padding of exactly
  // the kind this change removed.
  // Annotated `ScoreThreshold<'sbss'>`, not `as const`.
  //
  // `as const` was the first attempt and it silently broke the guarantee: the
  // readonly literal did not bind T to 'sbss' the way TRACK_THRESHOLDS' entry
  // had, so meetsThreshold accepted a PAYDEX and the @ts-expect-error below
  // went unused. tsc reported the unused directive, which is the only reason
  // it was caught — the suite was green. That is the mechanism working, and a
  // reminder that a type-level guarantee needs its own regression test as much
  // as any runtime rule.

  it('will not compare a PAYDEX against an SBSS requirement', () => {
    const paydex = businessScore('paydex', 88);

    // Both sides are generic in the same score type, so this is a type error
    // rather than a plausible-looking `true`.
    // @ts-expect-error — a PAYDEX is not an SBSS
    const met = meetsThreshold(SBSS_THRESHOLD, paydex);
    expect(met).toBeDefined();
  });

  it('still compares like with like', () => {
    expect(meetsThreshold(SBSS_THRESHOLD, businessScore('sbss', 60))).toBe(true);
    expect(meetsThreshold(SBSS_THRESHOLD, businessScore('sbss', 40))).toBe(false);
  });

  it('keeps a score and its product together', () => {
    // The key and the score's own scoreType cannot disagree: the record is
    // mapped by product, and `withBusinessScore` builds the entry from the
    // same key it files it under.
    const scores = withBusinessScore({}, 'paydex', 88);
    expect(scores.paydex?.scoreType).toBe('paydex');
    expect(scores.paydex?.value).toBe(88);
    expect(scores.sbss).toBeUndefined();
  });
});
