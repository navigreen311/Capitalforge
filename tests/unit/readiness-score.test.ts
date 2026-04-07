// ============================================================
// CapitalForge — Readiness Score Test Suite
//
// Covers:
//   - Profile completeness scoring
//   - Consent/compliance scoring
//   - Credit profile scoring
//   - Funding history scoring
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calculateReadinessScore,
  scoreProfileCompleteness,
  scoreConsentCompliance,
  scoreCreditProfile,
  scoreFundingHistory,
  gradeFromScore,
  type ReadinessClient,
} from '../../src/backend/services/readiness-score.js';

// ── Profile Completeness (20 pts) ───────────────────────────

describe('Readiness — Profile Completeness', () => {
  it('should award 0 for completely empty profile', () => {
    expect(scoreProfileCompleteness({})).toBe(0);
  });

  it('should award 4 for having EIN only', () => {
    expect(scoreProfileCompleteness({ ein: '12-3456789' })).toBe(4);
  });

  it('should award 4 for entity type', () => {
    expect(scoreProfileCompleteness({ entityType: 'LLC' })).toBe(4);
  });

  it('should award 4 for positive annual revenue', () => {
    expect(scoreProfileCompleteness({ annualRevenue: 100_000 })).toBe(4);
  });

  it('should not award points for zero annual revenue', () => {
    expect(scoreProfileCompleteness({ annualRevenue: 0 })).toBe(0);
  });

  it('should not award points for null annual revenue', () => {
    expect(scoreProfileCompleteness({ annualRevenue: null })).toBe(0);
  });

  it('should award 4 for industry', () => {
    expect(scoreProfileCompleteness({ industry: 'technology' })).toBe(4);
  });

  it('should award 4 for having owners', () => {
    expect(scoreProfileCompleteness({ owners: [{ name: 'Jane' }] })).toBe(4);
  });

  it('should not award points for empty owners array', () => {
    expect(scoreProfileCompleteness({ owners: [] })).toBe(0);
  });

  it('should award full 20 for complete profile', () => {
    expect(scoreProfileCompleteness({
      ein: '12-3456789',
      entityType: 'LLC',
      annualRevenue: 500_000,
      industry: 'technology',
      owners: [{ name: 'Jane' }],
    })).toBe(20);
  });

  it('should award 12 for 3 out of 5 fields', () => {
    expect(scoreProfileCompleteness({
      ein: '12-3456789',
      entityType: 'Corp',
      industry: 'healthcare',
    })).toBe(12);
  });
});

// ── Consent & Compliance (25 pts) ────────────────────────────

describe('Readiness — Consent & Compliance', () => {
  it('should award 0 when nothing is granted', () => {
    expect(scoreConsentCompliance({})).toBe(0);
  });

  it('should award 0 when all are explicitly false', () => {
    expect(scoreConsentCompliance({
      allConsentsGranted: false,
      allAcknowledgmentsSigned: false,
      kybVerified: false,
      compliancePassed: false,
    })).toBe(0);
  });

  it('should award 8 for all consents granted', () => {
    expect(scoreConsentCompliance({ allConsentsGranted: true })).toBe(8);
  });

  it('should award 7 for all acknowledgments signed', () => {
    expect(scoreConsentCompliance({ allAcknowledgmentsSigned: true })).toBe(7);
  });

  it('should award 5 for KYB verified', () => {
    expect(scoreConsentCompliance({ kybVerified: true })).toBe(5);
  });

  it('should award 5 for compliance passed', () => {
    expect(scoreConsentCompliance({ compliancePassed: true })).toBe(5);
  });

  it('should award full 25 when all are true', () => {
    expect(scoreConsentCompliance({
      allConsentsGranted: true,
      allAcknowledgmentsSigned: true,
      kybVerified: true,
      compliancePassed: true,
    })).toBe(25);
  });

  it('should award partial score for mixed values', () => {
    expect(scoreConsentCompliance({
      allConsentsGranted: true,
      allAcknowledgmentsSigned: true,
      kybVerified: false,
      compliancePassed: false,
    })).toBe(15); // 8 + 7
  });
});

// ── Credit Profile (30 pts) ─────────────────────────────────

describe('Readiness — Credit Profile', () => {
  it('should award 0 when no credit report', () => {
    expect(scoreCreditProfile({})).toBe(0);
  });

  it('should award 0 when credit report is null', () => {
    expect(scoreCreditProfile({ creditReport: null })).toBe(0);
  });

  // Recency scoring (10 pts)
  it('should award 10 for credit report pulled today', () => {
    const client: ReadinessClient = {
      creditReport: { pulledAt: new Date().toISOString(), ficoScore: null, utilization: null },
    };
    expect(scoreCreditProfile(client)).toBe(10);
  });

  it('should award 10 for report pulled 59 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 59);
    const client: ReadinessClient = {
      creditReport: { pulledAt: d.toISOString(), ficoScore: null, utilization: null },
    };
    expect(scoreCreditProfile(client)).toBe(10);
  });

  it('should not award recency for report pulled 61 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 61);
    const client: ReadinessClient = {
      creditReport: { pulledAt: d.toISOString(), ficoScore: null, utilization: null },
    };
    expect(scoreCreditProfile(client)).toBe(0);
  });

  // FICO scoring (15 pts max)
  it('should award 15 for FICO >= 760', () => {
    const client: ReadinessClient = {
      creditReport: { ficoScore: 800, pulledAt: null, utilization: null },
    };
    expect(scoreCreditProfile(client)).toBe(15);
  });

  it('should award 12 for FICO 720-759', () => {
    expect(scoreCreditProfile({ creditReport: { ficoScore: 720, pulledAt: null, utilization: null } })).toBe(12);
    expect(scoreCreditProfile({ creditReport: { ficoScore: 759, pulledAt: null, utilization: null } })).toBe(12);
  });

  it('should award 9 for FICO 680-719', () => {
    expect(scoreCreditProfile({ creditReport: { ficoScore: 680, pulledAt: null, utilization: null } })).toBe(9);
    expect(scoreCreditProfile({ creditReport: { ficoScore: 719, pulledAt: null, utilization: null } })).toBe(9);
  });

  it('should award 6 for FICO 640-679', () => {
    expect(scoreCreditProfile({ creditReport: { ficoScore: 640, pulledAt: null, utilization: null } })).toBe(6);
    expect(scoreCreditProfile({ creditReport: { ficoScore: 679, pulledAt: null, utilization: null } })).toBe(6);
  });

  it('should award 3 for FICO < 640', () => {
    expect(scoreCreditProfile({ creditReport: { ficoScore: 600, pulledAt: null, utilization: null } })).toBe(3);
    expect(scoreCreditProfile({ creditReport: { ficoScore: 500, pulledAt: null, utilization: null } })).toBe(3);
  });

  // Utilization scoring (5 pts max)
  it('should award 5 for utilization < 20%', () => {
    expect(scoreCreditProfile({ creditReport: { ficoScore: null, pulledAt: null, utilization: 0.10 } })).toBe(5);
    expect(scoreCreditProfile({ creditReport: { ficoScore: null, pulledAt: null, utilization: 0.19 } })).toBe(5);
  });

  it('should award 3 for utilization 20-29%', () => {
    expect(scoreCreditProfile({ creditReport: { ficoScore: null, pulledAt: null, utilization: 0.20 } })).toBe(3);
    expect(scoreCreditProfile({ creditReport: { ficoScore: null, pulledAt: null, utilization: 0.29 } })).toBe(3);
  });

  it('should award 1 for utilization >= 30%', () => {
    expect(scoreCreditProfile({ creditReport: { ficoScore: null, pulledAt: null, utilization: 0.50 } })).toBe(1);
    expect(scoreCreditProfile({ creditReport: { ficoScore: null, pulledAt: null, utilization: 0.90 } })).toBe(1);
  });

  // Combined
  it('should award full 30 for recent report + high FICO + low utilization', () => {
    const client: ReadinessClient = {
      creditReport: {
        pulledAt: new Date().toISOString(),
        ficoScore: 800,
        utilization: 0.10,
      },
    };
    expect(scoreCreditProfile(client)).toBe(30); // 10 + 15 + 5
  });
});

// ── Funding History (25 pts) ─────────────────────────────────

describe('Readiness — Funding History', () => {
  // Previous rounds scoring
  it('should award 5 for 0 previous rounds', () => {
    // 5(rounds) + 5(no declines) = 10
    expect(scoreFundingHistory({ previousRounds: 0, hasActiveDeclines: false })).toBe(10);
  });

  it('should award 10 for 1 previous round', () => {
    expect(scoreFundingHistory({ previousRounds: 1, hasActiveDeclines: false })).toBe(15);
  });

  it('should award 15 for 2 previous rounds', () => {
    expect(scoreFundingHistory({ previousRounds: 2, hasActiveDeclines: false })).toBe(20);
  });

  it('should award 15 for 5+ previous rounds (same as 2)', () => {
    expect(scoreFundingHistory({ previousRounds: 5, hasActiveDeclines: false })).toBe(20);
  });

  // Approval rate scoring
  it('should award 5 for approval rate > 80%', () => {
    const base = scoreFundingHistory({ previousRounds: 0, approvalRate: 0.90, hasActiveDeclines: false });
    // 5(rounds) + 5(rate) + 5(no declines) = 15
    expect(base).toBe(15);
  });

  it('should award 3 for approval rate 51-80%', () => {
    const base = scoreFundingHistory({ previousRounds: 0, approvalRate: 0.60, hasActiveDeclines: false });
    // 5 + 3 + 5 = 13
    expect(base).toBe(13);
  });

  it('should award 1 for approval rate <= 50%', () => {
    const base = scoreFundingHistory({ previousRounds: 0, approvalRate: 0.30, hasActiveDeclines: false });
    // 5 + 1 + 5 = 11
    expect(base).toBe(11);
  });

  it('should award 0 for approval rate when not provided', () => {
    const base = scoreFundingHistory({ previousRounds: 0, hasActiveDeclines: false });
    // 5 + 0 + 5 = 10
    expect(base).toBe(10);
  });

  // No active declines scoring
  it('should award 5 when no active declines', () => {
    const withDeclines = scoreFundingHistory({ previousRounds: 0, hasActiveDeclines: true });
    const withoutDeclines = scoreFundingHistory({ previousRounds: 0, hasActiveDeclines: false });
    expect(withoutDeclines - withDeclines).toBe(5);
  });

  it('should award 0 decline bonus when declines are active', () => {
    const result = scoreFundingHistory({ previousRounds: 0, hasActiveDeclines: true });
    // 5(rounds) + 0(no rate) + 0(has declines) = 5
    expect(result).toBe(5);
  });

  // Full score
  it('should award full 25 with optimal history', () => {
    const result = scoreFundingHistory({
      previousRounds: 3,
      approvalRate: 0.95,
      hasActiveDeclines: false,
    });
    // 15 + 5 + 5 = 25
    expect(result).toBe(25);
  });
});

// ── Integration: Full Score Calculation ──────────────────────

describe('Readiness — Full Calculation Integration', () => {
  it('should sum all components correctly', () => {
    const client: ReadinessClient = {
      ein: '12-3456789',
      entityType: 'LLC',
      annualRevenue: 500_000,
      industry: 'technology',
      owners: [{ name: 'Jane' }],
      allConsentsGranted: true,
      allAcknowledgmentsSigned: true,
      kybVerified: true,
      compliancePassed: true,
      creditReport: {
        pulledAt: new Date().toISOString(),
        ficoScore: 800,
        utilization: 0.10,
      },
      previousRounds: 3,
      approvalRate: 0.95,
      hasActiveDeclines: false,
    };

    const result = calculateReadinessScore(client);
    const sum =
      result.breakdown.profileCompleteness +
      result.breakdown.consentCompliance +
      result.breakdown.creditProfile +
      result.breakdown.fundingHistory;

    expect(result.score).toBe(sum);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('should clamp score between 0 and 100', () => {
    const result = calculateReadinessScore({});
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should return grade consistent with score', () => {
    const testCases: Array<{ score: number; expectedGrade: string }> = [
      { score: 95, expectedGrade: 'A' },
      { score: 85, expectedGrade: 'B' },
      { score: 75, expectedGrade: 'C' },
      { score: 65, expectedGrade: 'D' },
      { score: 50, expectedGrade: 'F' },
    ];

    for (const tc of testCases) {
      expect(gradeFromScore(tc.score)).toBe(tc.expectedGrade);
    }
  });
});
