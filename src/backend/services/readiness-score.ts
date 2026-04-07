// ============================================================
// CapitalForge — Client Readiness Score Engine
//
// Calculates a composite readiness score (0–100) across 4 dimensions:
//   1. Profile Completeness   (20 pts)
//   2. Consent & Compliance   (25 pts)
//   3. Credit Profile         (30 pts)
//   4. Funding History        (25 pts)
//
// Pure function — no DB dependency. Accepts a structured client
// object and returns a deterministic score + breakdown.
// ============================================================

// ── Input Types ──────────────────────────────────────────────

export interface ReadinessClient {
  // Profile fields
  ein?: string | null;
  entityType?: string | null;
  annualRevenue?: number | null;
  industry?: string | null;
  owners?: unknown[] | null;

  // Consent & compliance
  allConsentsGranted?: boolean;
  allAcknowledgmentsSigned?: boolean;
  kybVerified?: boolean;
  compliancePassed?: boolean;

  // Credit profile
  creditReport?: {
    pulledAt?: string | Date | null;
    ficoScore?: number | null;
    utilization?: number | null; // 0–1 ratio
  } | null;

  // Funding history
  previousRounds?: number | null;
  approvalRate?: number | null;   // 0–1 ratio
  hasActiveDeclines?: boolean;
}

// ── Output Types ─────────────────────────────────────────────

export interface ReadinessBreakdown {
  profileCompleteness: number;  // 0–20
  consentCompliance: number;    // 0–25
  creditProfile: number;        // 0–30
  fundingHistory: number;       // 0–25
}

export interface ReadinessResult {
  score: number;              // 0–100
  breakdown: ReadinessBreakdown;
  grade: string;              // A, B, C, D, F
  actionItems: string[];
}

// ── Grade Boundaries ─────────────────────────────────────────

export function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ── Component Scorers ────────────────────────────────────────

/**
 * Profile completeness — 20 points total.
 * 4 points each for: EIN, entity type, annual revenue, industry, owners.
 */
export function scoreProfileCompleteness(client: ReadinessClient): number {
  let points = 0;
  if (client.ein)           points += 4;
  if (client.entityType)    points += 4;
  if (client.annualRevenue != null && client.annualRevenue > 0) points += 4;
  if (client.industry)      points += 4;
  if (client.owners && client.owners.length > 0) points += 4;
  return points;
}

/**
 * Consent & compliance — 25 points total.
 * All consents granted (8), all acks signed (7), KYB verified (5), compliance passed (5).
 */
export function scoreConsentCompliance(client: ReadinessClient): number {
  let points = 0;
  if (client.allConsentsGranted)        points += 8;
  if (client.allAcknowledgmentsSigned)  points += 7;
  if (client.kybVerified)               points += 5;
  if (client.compliancePassed)          points += 5;
  return points;
}

/**
 * Credit profile — 30 points total.
 * Recent credit report within 60 days (10), FICO scoring (up to 15), utilization (up to 5).
 */
export function scoreCreditProfile(client: ReadinessClient): number {
  let points = 0;
  const report = client.creditReport;
  if (!report) return 0;

  // Recent credit report within 60 days — 10 points
  if (report.pulledAt) {
    const pulledDate = typeof report.pulledAt === 'string'
      ? new Date(report.pulledAt)
      : report.pulledAt;
    const daysSincePull = (Date.now() - pulledDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePull <= 60) {
      points += 10;
    }
  }

  // FICO scoring — up to 15 points
  if (report.ficoScore != null) {
    if (report.ficoScore >= 760) points += 15;
    else if (report.ficoScore >= 720) points += 12;
    else if (report.ficoScore >= 680) points += 9;
    else if (report.ficoScore >= 640) points += 6;
    else points += 3;
  }

  // Utilization scoring — up to 5 points
  if (report.utilization != null) {
    if (report.utilization < 0.20) points += 5;
    else if (report.utilization < 0.30) points += 3;
    else points += 1;
  }

  return points;
}

/**
 * Funding history — 25 points total.
 * Previous rounds (0=5, 1=10, 2+=15), approval rate (>80%=5, >50%=3, else=1),
 * no active declines (5).
 */
export function scoreFundingHistory(client: ReadinessClient): number {
  let points = 0;

  // Previous rounds scoring — up to 15 points
  const rounds = client.previousRounds ?? 0;
  if (rounds >= 2) points += 15;
  else if (rounds === 1) points += 10;
  else points += 5;

  // Approval rate — up to 5 points
  const rate = client.approvalRate;
  if (rate != null) {
    if (rate > 0.80) points += 5;
    else if (rate > 0.50) points += 3;
    else points += 1;
  }

  // No active declines — 5 points
  if (!client.hasActiveDeclines) {
    points += 5;
  }

  return points;
}

// ── Action Items Generator ───────────────────────────────────

export function generateActionItems(
  client: ReadinessClient,
  breakdown: ReadinessBreakdown,
): string[] {
  const items: string[] = [];

  // Profile gaps
  if (breakdown.profileCompleteness < 20) {
    if (!client.ein) items.push('Obtain and register an EIN');
    if (!client.entityType) items.push('Set entity type (LLC, Corp, etc.)');
    if (client.annualRevenue == null || client.annualRevenue <= 0) {
      items.push('Provide annual revenue documentation');
    }
    if (!client.industry) items.push('Classify business industry');
    if (!client.owners || client.owners.length === 0) {
      items.push('Add business owner information');
    }
  }

  // Consent gaps
  if (breakdown.consentCompliance < 25) {
    if (!client.allConsentsGranted) items.push('Complete all required consents');
    if (!client.allAcknowledgmentsSigned) items.push('Sign all product acknowledgments');
    if (!client.kybVerified) items.push('Complete KYB verification');
    if (!client.compliancePassed) items.push('Resolve compliance review issues');
  }

  // Credit gaps
  if (breakdown.creditProfile < 20) {
    const report = client.creditReport;
    if (!report || !report.pulledAt) {
      items.push('Pull a fresh credit report');
    }
    if (report?.ficoScore != null && report.ficoScore < 720) {
      items.push('Work on improving FICO score to 720+');
    }
    if (report?.utilization != null && report.utilization >= 0.30) {
      items.push('Reduce credit utilization below 30%');
    }
  }

  // Funding history gaps
  if (breakdown.fundingHistory < 20) {
    if (client.hasActiveDeclines) {
      items.push('Resolve active decline issues before next round');
    }
    if (client.approvalRate != null && client.approvalRate <= 0.50) {
      items.push('Improve application quality to increase approval rate');
    }
  }

  return items;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Calculate a composite readiness score for a client/business.
 * Pure function — no side effects or DB calls.
 */
export function calculateReadinessScore(client: ReadinessClient): ReadinessResult {
  const breakdown: ReadinessBreakdown = {
    profileCompleteness: scoreProfileCompleteness(client),
    consentCompliance:   scoreConsentCompliance(client),
    creditProfile:       scoreCreditProfile(client),
    fundingHistory:      scoreFundingHistory(client),
  };

  const score = Math.min(
    100,
    Math.max(
      0,
      breakdown.profileCompleteness +
      breakdown.consentCompliance +
      breakdown.creditProfile +
      breakdown.fundingHistory,
    ),
  );

  const grade = gradeFromScore(score);
  const actionItems = generateActionItems(client, breakdown);

  return { score, breakdown, grade, actionItems };
}
