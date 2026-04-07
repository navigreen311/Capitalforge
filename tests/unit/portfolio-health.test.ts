// ============================================================
// CapitalForge — Readiness Score (Portfolio Health) Test Suite
//
// Covers:
//   - Score calculation with perfect data (should be 100, grade A)
//   - Score with zero/empty data (should be low, grade F)
//   - Mixed data (partial scores)
//   - Grade boundaries (90=A, 89=B, 80=B, 79=C, etc.)
//   - Action items generation
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calculateReadinessScore,
  gradeFromScore,
  scoreProfileCompleteness,
  scoreConsentCompliance,
  scoreCreditProfile,
  scoreFundingHistory,
  generateActionItems,
  type ReadinessClient,
  type ReadinessBreakdown,
} from '../../src/backend/services/readiness-score.js';

// ── Fixtures ─────────────────────────────────────────────────

function makePerfectClient(): ReadinessClient {
  return {
    ein: '12-3456789',
    entityType: 'LLC',
    annualRevenue: 500_000,
    industry: 'technology',
    owners: [{ name: 'Jane Doe' }],
    allConsentsGranted: true,
    allAcknowledgmentsSigned: true,
    kybVerified: true,
    compliancePassed: true,
    creditReport: {
      pulledAt: new Date().toISOString(), // today = within 60 days
      ficoScore: 800,
      utilization: 0.10,
    },
    previousRounds: 3,
    approvalRate: 0.95,
    hasActiveDeclines: false,
  };
}

function makeEmptyClient(): ReadinessClient {
  return {};
}

// ── Score calculation with perfect data ──────────────────────

describe('Readiness Score — Perfect Data', () => {
  it('should return score of 100 and grade A with all fields populated optimally', () => {
    const result = calculateReadinessScore(makePerfectClient());
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('should have all component scores at maximum', () => {
    const result = calculateReadinessScore(makePerfectClient());
    expect(result.breakdown.profileCompleteness).toBe(20);
    expect(result.breakdown.consentCompliance).toBe(25);
    expect(result.breakdown.creditProfile).toBe(30);
    expect(result.breakdown.fundingHistory).toBe(25);
  });

  it('should generate no action items with perfect data', () => {
    const result = calculateReadinessScore(makePerfectClient());
    expect(result.actionItems).toHaveLength(0);
  });
});

// ── Score with zero/empty data ───────────────────────────────

describe('Readiness Score — Zero Data', () => {
  it('should return a low score with empty client', () => {
    const result = calculateReadinessScore(makeEmptyClient());
    // Profile=0, Consent=0, Credit=0, Funding=5(base for 0 rounds)+5(no declines)=10
    expect(result.score).toBe(10);
    expect(result.grade).toBe('F');
  });

  it('should have zero for profile, consent, and credit components', () => {
    const result = calculateReadinessScore(makeEmptyClient());
    expect(result.breakdown.profileCompleteness).toBe(0);
    expect(result.breakdown.consentCompliance).toBe(0);
    expect(result.breakdown.creditProfile).toBe(0);
  });

  it('should still award base funding history points for 0 rounds + no declines', () => {
    const result = calculateReadinessScore(makeEmptyClient());
    // 0 rounds = 5 pts, no approvalRate = 0 pts, no active declines = 5 pts
    expect(result.breakdown.fundingHistory).toBe(10);
  });
});

// ── Mixed data (partial scores) ──────────────────────────────

describe('Readiness Score — Mixed Data', () => {
  it('should compute partial scores for incomplete profile', () => {
    const client: ReadinessClient = {
      ein: '12-3456789',
      entityType: 'LLC',
      // missing annualRevenue, industry, owners
      allConsentsGranted: true,
      allAcknowledgmentsSigned: true,
      kybVerified: false,
      compliancePassed: false,
      creditReport: {
        pulledAt: new Date().toISOString(),
        ficoScore: 700,
        utilization: 0.25,
      },
      previousRounds: 1,
      approvalRate: 0.60,
      hasActiveDeclines: false,
    };

    const result = calculateReadinessScore(client);

    // Profile: ein(4) + entityType(4) = 8
    expect(result.breakdown.profileCompleteness).toBe(8);
    // Consent: consents(8) + acks(7) = 15
    expect(result.breakdown.consentCompliance).toBe(15);
    // Credit: recent(10) + FICO 700 (680-719 band) -> 9 + util 0.25 < 0.30 -> 3 = 22
    expect(result.breakdown.creditProfile).toBe(22);
    // Funding: 1 round(10) + rate>50%(3) + no declines(5) = 18
    expect(result.breakdown.fundingHistory).toBe(18);

    expect(result.score).toBe(8 + 15 + 22 + 18); // 63
    expect(result.grade).toBe('D');
  });

  it('should handle client with only credit data', () => {
    const client: ReadinessClient = {
      creditReport: {
        pulledAt: new Date().toISOString(),
        ficoScore: 760,
        utilization: 0.15,
      },
    };

    const result = calculateReadinessScore(client);
    // Profile=0, Consent=0, Credit=10+15+5=30, Funding=5+0+5=10
    expect(result.score).toBe(40);
    expect(result.grade).toBe('F');
  });
});

// ── Grade Boundaries ─────────────────────────────────────────

describe('Readiness Score — Grade Boundaries', () => {
  it('should assign grade A for score 90', () => {
    expect(gradeFromScore(90)).toBe('A');
  });

  it('should assign grade A for score 100', () => {
    expect(gradeFromScore(100)).toBe('A');
  });

  it('should assign grade B for score 89', () => {
    expect(gradeFromScore(89)).toBe('B');
  });

  it('should assign grade B for score 80', () => {
    expect(gradeFromScore(80)).toBe('B');
  });

  it('should assign grade C for score 79', () => {
    expect(gradeFromScore(79)).toBe('C');
  });

  it('should assign grade C for score 70', () => {
    expect(gradeFromScore(70)).toBe('C');
  });

  it('should assign grade D for score 69', () => {
    expect(gradeFromScore(69)).toBe('D');
  });

  it('should assign grade D for score 60', () => {
    expect(gradeFromScore(60)).toBe('D');
  });

  it('should assign grade F for score 59', () => {
    expect(gradeFromScore(59)).toBe('F');
  });

  it('should assign grade F for score 0', () => {
    expect(gradeFromScore(0)).toBe('F');
  });
});

// ── Action Items Generation ──────────────────────────────────

describe('Readiness Score — Action Items', () => {
  it('should generate action items for missing profile fields', () => {
    const client = makeEmptyClient();
    const result = calculateReadinessScore(client);

    expect(result.actionItems).toContain('Obtain and register an EIN');
    expect(result.actionItems).toContain('Set entity type (LLC, Corp, etc.)');
    expect(result.actionItems).toContain('Provide annual revenue documentation');
    expect(result.actionItems).toContain('Classify business industry');
    expect(result.actionItems).toContain('Add business owner information');
  });

  it('should generate consent-related action items when not complete', () => {
    const client: ReadinessClient = {
      allConsentsGranted: false,
      allAcknowledgmentsSigned: false,
      kybVerified: false,
      compliancePassed: false,
    };
    const result = calculateReadinessScore(client);

    expect(result.actionItems).toContain('Complete all required consents');
    expect(result.actionItems).toContain('Sign all product acknowledgments');
    expect(result.actionItems).toContain('Complete KYB verification');
    expect(result.actionItems).toContain('Resolve compliance review issues');
  });

  it('should suggest pulling credit report when none exists', () => {
    const client: ReadinessClient = {
      ein: '12-3456789',
      entityType: 'LLC',
      annualRevenue: 100000,
      industry: 'tech',
      owners: [{}],
      allConsentsGranted: true,
      allAcknowledgmentsSigned: true,
      kybVerified: true,
      compliancePassed: true,
    };
    const result = calculateReadinessScore(client);

    expect(result.actionItems).toContain('Pull a fresh credit report');
  });

  it('should suggest improving FICO when below 720', () => {
    const client: ReadinessClient = {
      creditReport: {
        pulledAt: null, // no recency points
        ficoScore: 650,
        utilization: 0.35,
      },
    };
    const result = calculateReadinessScore(client);
    // Credit: 0(recency) + 6(FICO 640-679) + 1(util>=30%) = 7, which is < 20
    expect(result.breakdown.creditProfile).toBeLessThan(20);
    expect(result.actionItems).toContain('Work on improving FICO score to 720+');
  });

  it('should suggest resolving declines when active', () => {
    const client: ReadinessClient = {
      hasActiveDeclines: true,
      previousRounds: 1,
      approvalRate: 0.40,
    };
    const result = calculateReadinessScore(client);

    expect(result.actionItems).toContain('Resolve active decline issues before next round');
    expect(result.actionItems).toContain('Improve application quality to increase approval rate');
  });
});

// ── Component Scorer Unit Tests ──────────────────────────────

describe('Profile Completeness Scorer', () => {
  it('should give 0 for empty client', () => {
    expect(scoreProfileCompleteness({})).toBe(0);
  });

  it('should give 4 per field present', () => {
    expect(scoreProfileCompleteness({ ein: '12-3456789' })).toBe(4);
    expect(scoreProfileCompleteness({ ein: '12-3456789', entityType: 'LLC' })).toBe(8);
  });

  it('should not count zero revenue', () => {
    expect(scoreProfileCompleteness({ annualRevenue: 0 })).toBe(0);
  });
});

describe('Credit Profile Scorer', () => {
  it('should return 0 when no credit report', () => {
    expect(scoreCreditProfile({})).toBe(0);
    expect(scoreCreditProfile({ creditReport: null })).toBe(0);
  });

  it('should award 15 for FICO >= 760', () => {
    const client: ReadinessClient = {
      creditReport: { ficoScore: 760, pulledAt: null, utilization: null },
    };
    expect(scoreCreditProfile(client)).toBe(15);
  });

  it('should award 12 for FICO 720-759', () => {
    const client: ReadinessClient = {
      creditReport: { ficoScore: 720, pulledAt: null, utilization: null },
    };
    expect(scoreCreditProfile(client)).toBe(12);
  });

  it('should award 5 for utilization < 20%', () => {
    const client: ReadinessClient = {
      creditReport: { ficoScore: null, pulledAt: null, utilization: 0.15 },
    };
    expect(scoreCreditProfile(client)).toBe(5);
  });

  it('should award 10 for recent credit pull within 60 days', () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 30);
    const client: ReadinessClient = {
      creditReport: { ficoScore: null, pulledAt: recentDate.toISOString(), utilization: null },
    };
    expect(scoreCreditProfile(client)).toBe(10);
  });

  it('should not award recency points for old credit pull', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 90);
    const client: ReadinessClient = {
      creditReport: { ficoScore: null, pulledAt: oldDate.toISOString(), utilization: null },
    };
    expect(scoreCreditProfile(client)).toBe(0);
  });
});

describe('Funding History Scorer', () => {
  it('should give 5 base points for 0 rounds', () => {
    expect(scoreFundingHistory({ previousRounds: 0 })).toBe(10); // 5 + 5(no declines)
  });

  it('should give 10 for 1 round', () => {
    expect(scoreFundingHistory({ previousRounds: 1 })).toBe(15); // 10 + 5(no declines)
  });

  it('should give 15 for 2+ rounds', () => {
    expect(scoreFundingHistory({ previousRounds: 5 })).toBe(20); // 15 + 5(no declines)
  });

  it('should add 5 for approval rate > 80%', () => {
    expect(scoreFundingHistory({ previousRounds: 0, approvalRate: 0.85 })).toBe(15); // 5+5+5
  });

  it('should not award decline bonus when declines active', () => {
    expect(scoreFundingHistory({ hasActiveDeclines: true })).toBe(5); // 5 for 0 rounds only
  });
});
