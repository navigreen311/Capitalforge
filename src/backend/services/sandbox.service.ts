// ============================================================
// CapitalForge — Sandbox & Simulation Environment Service
//
// Provides a controlled practice and regression-testing layer:
//
//   1. 50 pre-built synthetic client archetypes spanning the
//      full spectrum of FICO ranges, industries, revenue bands,
//      and funding situations.
//
//   2. Simulated funding rounds with realistic issuer responses
//      based on each archetype's credit and business profile.
//
//   3. Advisor practice mode — an advisor submits a funding
//      plan against a named archetype and receives scored
//      feedback on product selection, sequencing, and risk
//      assessment quality.
//
//   4. Regression test suite — rerun the optimizer against all
//      50 archetypes and surface any rule-update drift vs.
//      stored expected outcomes.
//
// All data is synthetic (no real PII).  The service operates
// entirely in memory; nothing is written to the database
// unless the caller explicitly persists a SandboxProfile
// via the persistence helpers.
// ============================================================

import {
  FundingSimulatorService,
  type SimulatorProfile,
  type ScenarioResult,
} from './funding-simulator.service.js';

// ============================================================
// Archetype Types
// ============================================================

export type IndustryCategory =
  | 'retail'
  | 'restaurant'
  | 'healthcare'
  | 'technology'
  | 'construction'
  | 'professional_services'
  | 'real_estate'
  | 'logistics'
  | 'manufacturing'
  | 'hospitality';

export type FicoTier = 'subprime' | 'near_prime' | 'prime' | 'super_prime';

export type RevenueBand =
  | 'micro'       // < $100k
  | 'small'       // $100k–$500k
  | 'mid'         // $500k–$2M
  | 'established' // $2M–$10M
  | 'large';      // > $10M

export interface ClientArchetype {
  id: string;
  name: string;
  description: string;
  industry: IndustryCategory;
  ficoTier: FicoTier;
  revenueBand: RevenueBand;
  profile: SimulatorProfile;
  /** Expected funding outcome for regression testing */
  expectedOutcome: {
    /** Expected minimum credit total from optimizer */
    minExpectedCredit: number;
    /** Whether the stack strategy should be recommended */
    stackingRecommended: boolean;
    /** Confidence rating the model should produce */
    expectedConfidence: 'high' | 'medium' | 'low';
  };
  tags: string[];
}

// ── Issuer response simulation ─────────────────────────────

export interface SimulatedIssuerResponse {
  issuer: string;
  cardProduct: string;
  decision: 'approved' | 'declined' | 'pending' | 'counteroffer';
  approvedLimit?: number;
  counterofferLimit?: number;
  declineReasons?: string[];
  processingTimeMs: number;
  simulatedAt: string;
}

export interface SimulatedFundingRound {
  roundNumber: number;
  archetypeId: string;
  issuerResponses: SimulatedIssuerResponse[];
  totalApprovedCredit: number;
  approvalCount: number;
  declineCount: number;
  pendingCount: number;
  roundCompletedAt: string;
}

// ── Practice mode ──────────────────────────────────────────

export interface AdvisorFundingPlan {
  archetypeId: string;
  advisorId: string;
  selectedCards: Array<{
    issuer: string;
    cardProduct: string;
    round: number;
    rationale: string;
  }>;
  riskAssessment: string;
  alternativeConsidered: boolean;
}

export interface PracticeFeedbackItem {
  category: 'product_selection' | 'sequencing' | 'risk_assessment' | 'alternative_analysis';
  score: number;     // 0–25 per category
  maxScore: number;
  feedback: string;
  suggestions: string[];
}

export interface PracticeModeResult {
  sessionId: string;
  archetypeId: string;
  advisorId: string;
  overallScore: number;   // 0–100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  feedbackItems: PracticeFeedbackItem[];
  modelAnswer: ScenarioResult;
  completedAt: string;
}

// ── Regression test ────────────────────────────────────────

export interface RegressionTestCase {
  archetypeId: string;
  archetypeName: string;
  passed: boolean;
  expected: ClientArchetype['expectedOutcome'];
  actual: {
    totalCredit: number;
    stackingRecommended: boolean;
    confidence: string;
  };
  drift: string[];
}

export interface RegressionSuiteResult {
  runAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;
  cases: RegressionTestCase[];
  driftSummary: string[];
}

// ── Custom profile ──────────────────────────────────────────

export interface CreateCustomProfileInput {
  tenantId: string;
  profileName: string;
  archetype: string;
  profile: SimulatorProfile;
  tags?: string[];
}

export interface CustomSandboxProfile {
  id: string;
  tenantId: string;
  profileName: string;
  archetype: string;
  profileData: SimulatorProfile;
  isActive: boolean;
  createdAt: string;
  tags: string[];
}

// ============================================================
// Archetype Library (50 pre-built synthetic clients)
// ============================================================

function buildArchetypes(): ClientArchetype[] {
  return [
    // ── SUBPRIME (FICO 550–619) ──────────────────────────────
    {
      id: 'arch-001',
      name: 'Struggling Restaurateur',
      description: 'Food service owner recovering from pandemic closures; thin credit file, high utilization.',
      industry: 'restaurant',
      ficoTier: 'subprime',
      revenueBand: 'small',
      profile: { ficoScore: 578, utilizationRatio: 0.78, derogatoryCount: 2, inquiries12m: 4, creditAgeMonths: 36, annualRevenue: 180_000, yearsInOperation: 2, existingDebt: 45_000, targetCreditLimit: 50_000 },
      expectedOutcome: { minExpectedCredit: 5_000, stackingRecommended: false, expectedConfidence: 'low' },
      tags: ['subprime', 'high-risk', 'restaurant', 'recovery'],
    },
    {
      id: 'arch-002',
      name: 'First-Year Contractor',
      description: 'Solo construction contractor, limited credit history, no derogatory marks.',
      industry: 'construction',
      ficoTier: 'subprime',
      revenueBand: 'micro',
      profile: { ficoScore: 605, utilizationRatio: 0.65, derogatoryCount: 0, inquiries12m: 3, creditAgeMonths: 18, annualRevenue: 75_000, yearsInOperation: 1, existingDebt: 12_000, targetCreditLimit: 25_000 },
      expectedOutcome: { minExpectedCredit: 5_000, stackingRecommended: false, expectedConfidence: 'low' },
      tags: ['subprime', 'construction', 'new-business'],
    },
    {
      id: 'arch-003',
      name: 'Retail Kiosk Owner',
      description: 'Mall retail operator with collection accounts from personal medical debt.',
      industry: 'retail',
      ficoTier: 'subprime',
      revenueBand: 'micro',
      profile: { ficoScore: 592, utilizationRatio: 0.72, derogatoryCount: 3, inquiries12m: 6, creditAgeMonths: 48, annualRevenue: 95_000, yearsInOperation: 3, existingDebt: 30_000, targetCreditLimit: 30_000 },
      expectedOutcome: { minExpectedCredit: 0, stackingRecommended: false, expectedConfidence: 'low' },
      tags: ['subprime', 'derogatory', 'retail'],
    },
    {
      id: 'arch-004',
      name: 'Emerging Logistics Owner',
      description: 'Single-truck freight operator rebuilding credit after Chapter 7 discharge (3 years ago).',
      industry: 'logistics',
      ficoTier: 'subprime',
      revenueBand: 'small',
      profile: { ficoScore: 614, utilizationRatio: 0.55, derogatoryCount: 1, inquiries12m: 2, creditAgeMonths: 60, annualRevenue: 220_000, yearsInOperation: 4, existingDebt: 55_000, targetCreditLimit: 40_000 },
      expectedOutcome: { minExpectedCredit: 5_000, stackingRecommended: false, expectedConfidence: 'low' },
      tags: ['subprime', 'bankruptcy-recovery', 'logistics'],
    },
    {
      id: 'arch-005',
      name: 'Home-Based E-commerce Startup',
      description: 'New Shopify store with 6 months of revenue; personal credit is subprime.',
      industry: 'retail',
      ficoTier: 'subprime',
      revenueBand: 'micro',
      profile: { ficoScore: 560, utilizationRatio: 0.85, derogatoryCount: 1, inquiries12m: 5, creditAgeMonths: 24, annualRevenue: 48_000, yearsInOperation: 0, existingDebt: 8_000, targetCreditLimit: 20_000 },
      expectedOutcome: { minExpectedCredit: 0, stackingRecommended: false, expectedConfidence: 'low' },
      tags: ['subprime', 'startup', 'ecommerce'],
    },

    // ── NEAR-PRIME (FICO 620–679) ────────────────────────────
    {
      id: 'arch-006',
      name: 'Local Restaurant Chain (2 Locations)',
      description: 'Growing food service operator; solid revenue, moderate credit profile.',
      industry: 'restaurant',
      ficoTier: 'near_prime',
      revenueBand: 'small',
      profile: { ficoScore: 645, utilizationRatio: 0.45, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 72, annualRevenue: 480_000, yearsInOperation: 5, existingDebt: 60_000, targetCreditLimit: 75_000 },
      expectedOutcome: { minExpectedCredit: 30_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'restaurant', 'multi-location'],
    },
    {
      id: 'arch-007',
      name: 'Healthcare Staffing Agency',
      description: 'Small healthcare recruiter with consistent B2B contracts.',
      industry: 'healthcare',
      ficoTier: 'near_prime',
      revenueBand: 'mid',
      profile: { ficoScore: 660, utilizationRatio: 0.38, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 84, annualRevenue: 650_000, yearsInOperation: 6, existingDebt: 80_000, targetCreditLimit: 100_000 },
      expectedOutcome: { minExpectedCredit: 50_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'healthcare', 'b2b'],
    },
    {
      id: 'arch-008',
      name: 'General Contractor — Residential',
      description: 'Residential remodeler with seasonal revenue swings; moderate credit.',
      industry: 'construction',
      ficoTier: 'near_prime',
      revenueBand: 'small',
      profile: { ficoScore: 635, utilizationRatio: 0.50, derogatoryCount: 1, inquiries12m: 3, creditAgeMonths: 96, annualRevenue: 350_000, yearsInOperation: 8, existingDebt: 70_000, targetCreditLimit: 60_000 },
      expectedOutcome: { minExpectedCredit: 20_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'construction', 'seasonal'],
    },
    {
      id: 'arch-009',
      name: 'Retail Franchise Operator',
      description: 'Single-unit franchisee for a national QSR; steady income but high debt-to-income.',
      industry: 'retail',
      ficoTier: 'near_prime',
      revenueBand: 'small',
      profile: { ficoScore: 652, utilizationRatio: 0.55, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 60, annualRevenue: 420_000, yearsInOperation: 4, existingDebt: 120_000, targetCreditLimit: 80_000 },
      expectedOutcome: { minExpectedCredit: 25_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'franchise', 'retail'],
    },
    {
      id: 'arch-010',
      name: 'Tech Startup — Pre-Revenue',
      description: 'SaaS company with 1 year of runway, founder has near-prime personal credit.',
      industry: 'technology',
      ficoTier: 'near_prime',
      revenueBand: 'micro',
      profile: { ficoScore: 668, utilizationRatio: 0.40, derogatoryCount: 0, inquiries12m: 4, creditAgeMonths: 48, annualRevenue: 60_000, yearsInOperation: 1, existingDebt: 20_000, targetCreditLimit: 50_000 },
      expectedOutcome: { minExpectedCredit: 20_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'technology', 'startup'],
    },
    {
      id: 'arch-011',
      name: 'Hospitality Operator — Boutique Hotel',
      description: 'Small hotel owner; post-COVID stabilization, near-prime credit score.',
      industry: 'hospitality',
      ficoTier: 'near_prime',
      revenueBand: 'mid',
      profile: { ficoScore: 641, utilizationRatio: 0.48, derogatoryCount: 1, inquiries12m: 2, creditAgeMonths: 120, annualRevenue: 750_000, yearsInOperation: 10, existingDebt: 180_000, targetCreditLimit: 100_000 },
      expectedOutcome: { minExpectedCredit: 30_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'hospitality', 'post-covid'],
    },
    {
      id: 'arch-012',
      name: 'Professional Services — Accountant',
      description: 'CPA in private practice; conservative credit behavior, steady revenue.',
      industry: 'professional_services',
      ficoTier: 'near_prime',
      revenueBand: 'small',
      profile: { ficoScore: 675, utilizationRatio: 0.30, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 120, annualRevenue: 280_000, yearsInOperation: 12, existingDebt: 40_000, targetCreditLimit: 60_000 },
      expectedOutcome: { minExpectedCredit: 35_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'professional-services', 'accountant'],
    },
    {
      id: 'arch-013',
      name: 'Manufacturing SME',
      description: 'Small-batch custom parts manufacturer with 1 derogatory mark from 2020.',
      industry: 'manufacturing',
      ficoTier: 'near_prime',
      revenueBand: 'mid',
      profile: { ficoScore: 638, utilizationRatio: 0.42, derogatoryCount: 1, inquiries12m: 2, creditAgeMonths: 108, annualRevenue: 900_000, yearsInOperation: 9, existingDebt: 250_000, targetCreditLimit: 120_000 },
      expectedOutcome: { minExpectedCredit: 30_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'manufacturing', 'b2b'],
    },
    {
      id: 'arch-014',
      name: 'Logistics Fleet — 5 Trucks',
      description: 'Regional trucking operator, seasonal revenue, high equipment debt.',
      industry: 'logistics',
      ficoTier: 'near_prime',
      revenueBand: 'mid',
      profile: { ficoScore: 658, utilizationRatio: 0.60, derogatoryCount: 0, inquiries12m: 3, creditAgeMonths: 84, annualRevenue: 1_100_000, yearsInOperation: 7, existingDebt: 320_000, targetCreditLimit: 150_000 },
      expectedOutcome: { minExpectedCredit: 40_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'logistics', 'fleet'],
    },
    {
      id: 'arch-015',
      name: 'Real Estate Investor — 3 Rentals',
      description: 'Small landlord with rental income; near-prime credit, leveraged properties.',
      industry: 'real_estate',
      ficoTier: 'near_prime',
      revenueBand: 'small',
      profile: { ficoScore: 649, utilizationRatio: 0.35, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 156, annualRevenue: 160_000, yearsInOperation: 6, existingDebt: 380_000, targetCreditLimit: 70_000 },
      expectedOutcome: { minExpectedCredit: 25_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'real-estate', 'investor'],
    },

    // ── PRIME (FICO 680–739) ──────────────────────────────────
    {
      id: 'arch-016',
      name: 'E-commerce Brand Owner',
      description: 'Direct-to-consumer brand with strong Shopify revenue and clean credit.',
      industry: 'retail',
      ficoTier: 'prime',
      revenueBand: 'small',
      profile: { ficoScore: 698, utilizationRatio: 0.22, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 72, annualRevenue: 450_000, yearsInOperation: 4, existingDebt: 30_000, targetCreditLimit: 100_000 },
      expectedOutcome: { minExpectedCredit: 60_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['prime', 'retail', 'ecommerce'],
    },
    {
      id: 'arch-017',
      name: 'Digital Marketing Agency',
      description: 'B2B agency with retainer-based revenue and solid FICO.',
      industry: 'professional_services',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 715, utilizationRatio: 0.18, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 96, annualRevenue: 800_000, yearsInOperation: 7, existingDebt: 50_000, targetCreditLimit: 150_000 },
      expectedOutcome: { minExpectedCredit: 100_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'professional-services', 'agency'],
    },
    {
      id: 'arch-018',
      name: 'Dental Practice — Solo',
      description: 'Solo dentist expanding to second operatory; prime credit, insurance revenue.',
      industry: 'healthcare',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 722, utilizationRatio: 0.20, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 120, annualRevenue: 750_000, yearsInOperation: 10, existingDebt: 90_000, targetCreditLimit: 120_000 },
      expectedOutcome: { minExpectedCredit: 80_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'healthcare', 'dental'],
    },
    {
      id: 'arch-019',
      name: 'SaaS Company — Series Seed',
      description: 'VC-backed SaaS with growing ARR; founder personal credit is prime.',
      industry: 'technology',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 708, utilizationRatio: 0.15, derogatoryCount: 0, inquiries12m: 3, creditAgeMonths: 60, annualRevenue: 600_000, yearsInOperation: 3, existingDebt: 40_000, targetCreditLimit: 200_000 },
      expectedOutcome: { minExpectedCredit: 120_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'technology', 'saas', 'vc-backed'],
    },
    {
      id: 'arch-020',
      name: 'Commercial Real Estate Broker',
      description: 'Independent CRE broker with commission income; prime FICO.',
      industry: 'real_estate',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 695, utilizationRatio: 0.28, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 144, annualRevenue: 550_000, yearsInOperation: 12, existingDebt: 60_000, targetCreditLimit: 100_000 },
      expectedOutcome: { minExpectedCredit: 65_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['prime', 'real-estate', 'commission-income'],
    },
    {
      id: 'arch-021',
      name: 'Multi-Unit Franchisee — QSR',
      description: 'Operates 3 fast-food franchises; prime credit, standardized operations.',
      industry: 'restaurant',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 710, utilizationRatio: 0.32, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 108, annualRevenue: 1_800_000, yearsInOperation: 9, existingDebt: 400_000, targetCreditLimit: 200_000 },
      expectedOutcome: { minExpectedCredit: 120_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'restaurant', 'franchise', 'multi-unit'],
    },
    {
      id: 'arch-022',
      name: 'IT Services Firm',
      description: 'Managed IT services provider with government contracts; prime credit.',
      industry: 'technology',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 700, utilizationRatio: 0.25, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 84, annualRevenue: 1_200_000, yearsInOperation: 8, existingDebt: 100_000, targetCreditLimit: 175_000 },
      expectedOutcome: { minExpectedCredit: 100_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'technology', 'government-contract'],
    },
    {
      id: 'arch-023',
      name: 'Construction GC — Commercial',
      description: 'Commercial GC with bonding capacity; prime credit, high WIP.',
      industry: 'construction',
      ficoTier: 'prime',
      revenueBand: 'established',
      profile: { ficoScore: 718, utilizationRatio: 0.30, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 180, annualRevenue: 3_500_000, yearsInOperation: 15, existingDebt: 600_000, targetCreditLimit: 300_000 },
      expectedOutcome: { minExpectedCredit: 150_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'construction', 'commercial-gc'],
    },
    {
      id: 'arch-024',
      name: 'Logistics 3PL Operator',
      description: '3PL warehouse and fulfillment company; prime credit, contractual revenue.',
      industry: 'logistics',
      ficoTier: 'prime',
      revenueBand: 'established',
      profile: { ficoScore: 705, utilizationRatio: 0.20, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 120, annualRevenue: 2_200_000, yearsInOperation: 11, existingDebt: 350_000, targetCreditLimit: 250_000 },
      expectedOutcome: { minExpectedCredit: 150_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'logistics', '3pl'],
    },
    {
      id: 'arch-025',
      name: 'Boutique Law Firm',
      description: 'Four-attorney litigation firm with contingency fee revenue; prime credit.',
      industry: 'professional_services',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 720, utilizationRatio: 0.15, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 156, annualRevenue: 1_400_000, yearsInOperation: 13, existingDebt: 120_000, targetCreditLimit: 180_000 },
      expectedOutcome: { minExpectedCredit: 120_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'professional-services', 'law-firm'],
    },

    // ── SUPER-PRIME (FICO 740+) ───────────────────────────────
    {
      id: 'arch-026',
      name: 'High-Growth SaaS CEO',
      description: 'Profitable B2B SaaS business; founder has excellent credit, clean file.',
      industry: 'technology',
      ficoTier: 'super_prime',
      revenueBand: 'established',
      profile: { ficoScore: 790, utilizationRatio: 0.08, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 180, annualRevenue: 4_000_000, yearsInOperation: 10, existingDebt: 200_000, targetCreditLimit: 500_000 },
      expectedOutcome: { minExpectedCredit: 300_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['super-prime', 'technology', 'saas', 'high-growth'],
    },
    {
      id: 'arch-027',
      name: 'Healthcare Group Practice',
      description: 'Multi-provider medical practice with insurance contracts; excellent credit.',
      industry: 'healthcare',
      ficoTier: 'super_prime',
      revenueBand: 'established',
      profile: { ficoScore: 775, utilizationRatio: 0.10, derogatoryCount: 0, inquiries12m: 0, creditAgeMonths: 240, annualRevenue: 5_000_000, yearsInOperation: 20, existingDebt: 400_000, targetCreditLimit: 400_000 },
      expectedOutcome: { minExpectedCredit: 250_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['super-prime', 'healthcare', 'group-practice'],
    },
    {
      id: 'arch-028',
      name: 'Regional Retail Chain',
      description: '12-location specialty retail chain; super-prime owner credit.',
      industry: 'retail',
      ficoTier: 'super_prime',
      revenueBand: 'large',
      profile: { ficoScore: 810, utilizationRatio: 0.06, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 300, annualRevenue: 12_000_000, yearsInOperation: 25, existingDebt: 1_500_000, targetCreditLimit: 1_000_000 },
      expectedOutcome: { minExpectedCredit: 400_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['super-prime', 'retail', 'chain', 'large'],
    },
    {
      id: 'arch-029',
      name: 'CRE Developer',
      description: 'Active real estate developer with multiple projects; super-prime credit.',
      industry: 'real_estate',
      ficoTier: 'super_prime',
      revenueBand: 'large',
      profile: { ficoScore: 802, utilizationRatio: 0.12, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 264, annualRevenue: 8_000_000, yearsInOperation: 22, existingDebt: 5_000_000, targetCreditLimit: 750_000 },
      expectedOutcome: { minExpectedCredit: 350_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['super-prime', 'real-estate', 'developer'],
    },
    {
      id: 'arch-030',
      name: 'National Logistics Company',
      description: '50-truck logistics operator; super-prime credit, institutional contracts.',
      industry: 'logistics',
      ficoTier: 'super_prime',
      revenueBand: 'large',
      profile: { ficoScore: 785, utilizationRatio: 0.09, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 216, annualRevenue: 15_000_000, yearsInOperation: 18, existingDebt: 3_000_000, targetCreditLimit: 800_000 },
      expectedOutcome: { minExpectedCredit: 400_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['super-prime', 'logistics', 'national'],
    },

    // ── EDGE CASES & SPECIAL SCENARIOS ──────────────────────
    {
      id: 'arch-031',
      name: 'Credit-Invisible Startup',
      description: 'First-time entrepreneur; ITIN filer, no US credit history at all.',
      industry: 'retail',
      ficoTier: 'subprime',
      revenueBand: 'micro',
      profile: { ficoScore: 550, utilizationRatio: 0.0, derogatoryCount: 0, inquiries12m: 0, creditAgeMonths: 0, annualRevenue: 40_000, yearsInOperation: 0, existingDebt: 0, targetCreditLimit: 20_000 },
      expectedOutcome: { minExpectedCredit: 0, stackingRecommended: false, expectedConfidence: 'low' },
      tags: ['edge-case', 'no-credit-history', 'startup'],
    },
    {
      id: 'arch-032',
      name: 'Thin-File High-Revenue',
      description: 'International business owner with strong US revenue but minimal US credit age.',
      industry: 'manufacturing',
      ficoTier: 'near_prime',
      revenueBand: 'established',
      profile: { ficoScore: 640, utilizationRatio: 0.10, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 12, annualRevenue: 2_800_000, yearsInOperation: 3, existingDebt: 200_000, targetCreditLimit: 300_000 },
      expectedOutcome: { minExpectedCredit: 30_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['edge-case', 'thin-file', 'high-revenue'],
    },
    {
      id: 'arch-033',
      name: 'Maxed-Out Utilization',
      description: 'Business owner with excellent FICO history but currently at 95% utilization.',
      industry: 'professional_services',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 690, utilizationRatio: 0.95, derogatoryCount: 0, inquiries12m: 0, creditAgeMonths: 180, annualRevenue: 700_000, yearsInOperation: 15, existingDebt: 80_000, targetCreditLimit: 100_000 },
      expectedOutcome: { minExpectedCredit: 20_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['edge-case', 'high-utilization', 'prime'],
    },
    {
      id: 'arch-034',
      name: 'Serial Applicant',
      description: 'Owner who applied for 10 products in the last 12 months; heavy inquiry velocity.',
      industry: 'retail',
      ficoTier: 'prime',
      revenueBand: 'small',
      profile: { ficoScore: 705, utilizationRatio: 0.30, derogatoryCount: 0, inquiries12m: 10, creditAgeMonths: 120, annualRevenue: 380_000, yearsInOperation: 7, existingDebt: 40_000, targetCreditLimit: 80_000 },
      expectedOutcome: { minExpectedCredit: 30_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['edge-case', 'inquiry-velocity', 'prime'],
    },
    {
      id: 'arch-035',
      name: 'Micro Business — Perfect Credit',
      description: 'Solo consultant with 800+ FICO but very low annual revenue.',
      industry: 'professional_services',
      ficoTier: 'super_prime',
      revenueBand: 'micro',
      profile: { ficoScore: 825, utilizationRatio: 0.05, derogatoryCount: 0, inquiries12m: 0, creditAgeMonths: 240, annualRevenue: 85_000, yearsInOperation: 20, existingDebt: 5_000, targetCreditLimit: 50_000 },
      expectedOutcome: { minExpectedCredit: 40_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['edge-case', 'super-prime', 'micro-revenue'],
    },
    {
      id: 'arch-036',
      name: 'Seasonal Business — Holiday Retail',
      description: 'Pop-up holiday retail with 90% revenue in Q4; volatile cash flow.',
      industry: 'retail',
      ficoTier: 'near_prime',
      revenueBand: 'small',
      profile: { ficoScore: 662, utilizationRatio: 0.60, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 48, annualRevenue: 300_000, yearsInOperation: 3, existingDebt: 50_000, targetCreditLimit: 60_000 },
      expectedOutcome: { minExpectedCredit: 25_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['edge-case', 'seasonal', 'retail'],
    },
    {
      id: 'arch-037',
      name: 'Cannabis Dispensary — Restricted',
      description: 'State-licensed dispensary; most card issuers decline MCC 5912 / cannabis.',
      industry: 'retail',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 710, utilizationRatio: 0.25, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 60, annualRevenue: 900_000, yearsInOperation: 4, existingDebt: 100_000, targetCreditLimit: 150_000 },
      expectedOutcome: { minExpectedCredit: 30_000, stackingRecommended: false, expectedConfidence: 'low' },
      tags: ['edge-case', 'restricted-industry', 'cannabis'],
    },
    {
      id: 'arch-038',
      name: 'Non-Profit Organization',
      description: '501(c)(3) with solid donation revenue; personal credit of executive director is prime.',
      industry: 'professional_services',
      ficoTier: 'prime',
      revenueBand: 'small',
      profile: { ficoScore: 700, utilizationRatio: 0.20, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 120, annualRevenue: 400_000, yearsInOperation: 10, existingDebt: 30_000, targetCreditLimit: 60_000 },
      expectedOutcome: { minExpectedCredit: 40_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['edge-case', 'non-profit', 'prime'],
    },
    {
      id: 'arch-039',
      name: 'Distressed Business — Pre-Hardship',
      description: 'Revenue declining 40%; owner in early hardship discussions with lenders.',
      industry: 'restaurant',
      ficoTier: 'subprime',
      revenueBand: 'small',
      profile: { ficoScore: 588, utilizationRatio: 0.82, derogatoryCount: 2, inquiries12m: 5, creditAgeMonths: 84, annualRevenue: 150_000, yearsInOperation: 6, existingDebt: 95_000, targetCreditLimit: 40_000 },
      expectedOutcome: { minExpectedCredit: 0, stackingRecommended: false, expectedConfidence: 'low' },
      tags: ['edge-case', 'distressed', 'hardship'],
    },
    {
      id: 'arch-040',
      name: 'Recent Bankruptcy Discharge',
      description: 'Chapter 7 discharged 2 years ago; rebuilding credit aggressively.',
      industry: 'retail',
      ficoTier: 'subprime',
      revenueBand: 'small',
      profile: { ficoScore: 580, utilizationRatio: 0.40, derogatoryCount: 4, inquiries12m: 2, creditAgeMonths: 24, annualRevenue: 200_000, yearsInOperation: 2, existingDebt: 15_000, targetCreditLimit: 30_000 },
      expectedOutcome: { minExpectedCredit: 0, stackingRecommended: false, expectedConfidence: 'low' },
      tags: ['edge-case', 'bankruptcy', 'rebuilding'],
    },

    // ── MIXED/SPECIALTY ──────────────────────────────────────
    {
      id: 'arch-041',
      name: 'Medical Device Distributor',
      description: 'B2B medical supply distribution; high-margin, prime credit.',
      industry: 'healthcare',
      ficoTier: 'prime',
      revenueBand: 'established',
      profile: { ficoScore: 730, utilizationRatio: 0.18, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 144, annualRevenue: 2_500_000, yearsInOperation: 12, existingDebt: 200_000, targetCreditLimit: 300_000 },
      expectedOutcome: { minExpectedCredit: 180_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'healthcare', 'distribution'],
    },
    {
      id: 'arch-042',
      name: 'Food Truck Fleet',
      description: 'Three food trucks with catering contracts; near-prime credit.',
      industry: 'restaurant',
      ficoTier: 'near_prime',
      revenueBand: 'small',
      profile: { ficoScore: 668, utilizationRatio: 0.35, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 60, annualRevenue: 340_000, yearsInOperation: 5, existingDebt: 55_000, targetCreditLimit: 70_000 },
      expectedOutcome: { minExpectedCredit: 40_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'restaurant', 'food-truck'],
    },
    {
      id: 'arch-043',
      name: 'Accounting Firm — 10 CPAs',
      description: 'Regional accounting firm with tax and audit practice; super-prime.',
      industry: 'professional_services',
      ficoTier: 'super_prime',
      revenueBand: 'established',
      profile: { ficoScore: 768, utilizationRatio: 0.10, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 216, annualRevenue: 3_200_000, yearsInOperation: 18, existingDebt: 250_000, targetCreditLimit: 400_000 },
      expectedOutcome: { minExpectedCredit: 250_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['super-prime', 'professional-services', 'accounting-firm'],
    },
    {
      id: 'arch-044',
      name: 'Solar Installation Company',
      description: 'Residential solar installer capitalizing on IRA incentives; prime credit.',
      industry: 'construction',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 712, utilizationRatio: 0.22, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 72, annualRevenue: 1_600_000, yearsInOperation: 6, existingDebt: 180_000, targetCreditLimit: 200_000 },
      expectedOutcome: { minExpectedCredit: 120_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'construction', 'renewable-energy'],
    },
    {
      id: 'arch-045',
      name: 'Veterinary Clinic',
      description: 'Small animal veterinary practice; steady revenue, prime FICO.',
      industry: 'healthcare',
      ficoTier: 'prime',
      revenueBand: 'small',
      profile: { ficoScore: 725, utilizationRatio: 0.15, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 108, annualRevenue: 480_000, yearsInOperation: 9, existingDebt: 70_000, targetCreditLimit: 100_000 },
      expectedOutcome: { minExpectedCredit: 70_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'healthcare', 'veterinary'],
    },
    {
      id: 'arch-046',
      name: 'Fitness Studio Chain',
      description: 'Three boutique fitness studios; subscription revenue, near-prime owner.',
      industry: 'hospitality',
      ficoTier: 'near_prime',
      revenueBand: 'small',
      profile: { ficoScore: 672, utilizationRatio: 0.42, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 84, annualRevenue: 420_000, yearsInOperation: 7, existingDebt: 80_000, targetCreditLimit: 80_000 },
      expectedOutcome: { minExpectedCredit: 45_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'hospitality', 'fitness'],
    },
    {
      id: 'arch-047',
      name: 'Auto Repair Shop',
      description: 'Independent auto repair; established business, near-prime credit.',
      industry: 'retail',
      ficoTier: 'near_prime',
      revenueBand: 'small',
      profile: { ficoScore: 655, utilizationRatio: 0.38, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 144, annualRevenue: 380_000, yearsInOperation: 12, existingDebt: 60_000, targetCreditLimit: 60_000 },
      expectedOutcome: { minExpectedCredit: 30_000, stackingRecommended: true, expectedConfidence: 'medium' },
      tags: ['near-prime', 'auto-repair', 'established'],
    },
    {
      id: 'arch-048',
      name: 'Import/Export SME',
      description: 'International trade business with LC-backed transactions; prime credit.',
      industry: 'logistics',
      ficoTier: 'prime',
      revenueBand: 'mid',
      profile: { ficoScore: 718, utilizationRatio: 0.20, derogatoryCount: 0, inquiries12m: 2, creditAgeMonths: 120, annualRevenue: 1_800_000, yearsInOperation: 10, existingDebt: 250_000, targetCreditLimit: 200_000 },
      expectedOutcome: { minExpectedCredit: 120_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['prime', 'logistics', 'import-export'],
    },
    {
      id: 'arch-049',
      name: 'Luxury Goods Retailer',
      description: 'High-end jeweler; strong margins, super-prime credit.',
      industry: 'retail',
      ficoTier: 'super_prime',
      revenueBand: 'mid',
      profile: { ficoScore: 760, utilizationRatio: 0.08, derogatoryCount: 0, inquiries12m: 0, creditAgeMonths: 192, annualRevenue: 1_500_000, yearsInOperation: 16, existingDebt: 80_000, targetCreditLimit: 250_000 },
      expectedOutcome: { minExpectedCredit: 180_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['super-prime', 'retail', 'luxury'],
    },
    {
      id: 'arch-050',
      name: 'Scale-Up Restaurant Group',
      description: 'Private equity-backed restaurant operator; super-prime management team.',
      industry: 'restaurant',
      ficoTier: 'super_prime',
      revenueBand: 'large',
      profile: { ficoScore: 795, utilizationRatio: 0.10, derogatoryCount: 0, inquiries12m: 1, creditAgeMonths: 240, annualRevenue: 10_000_000, yearsInOperation: 20, existingDebt: 2_000_000, targetCreditLimit: 800_000 },
      expectedOutcome: { minExpectedCredit: 400_000, stackingRecommended: true, expectedConfidence: 'high' },
      tags: ['super-prime', 'restaurant', 'pe-backed', 'large'],
    },
  ];
}

// ============================================================
// SandboxService
// ============================================================

export class SandboxService {
  private readonly simulator: FundingSimulatorService;
  private readonly archetypes: Map<string, ClientArchetype>;
  private readonly customProfiles: Map<string, CustomSandboxProfile>;

  constructor(simulator?: FundingSimulatorService) {
    this.simulator = simulator ?? new FundingSimulatorService();
    this.archetypes = new Map(buildArchetypes().map((a) => [a.id, a]));
    this.customProfiles = new Map();
  }

  // ── Archetype access ───────────────────────────────────────

  /**
   * Return all 50 pre-built archetypes (optionally filtered).
   */
  listArchetypes(filters?: {
    ficoTier?: FicoTier;
    industry?: IndustryCategory;
    revenueBand?: RevenueBand;
    tags?: string[];
  }): ClientArchetype[] {
    let results = Array.from(this.archetypes.values());

    if (filters?.ficoTier) {
      results = results.filter((a) => a.ficoTier === filters.ficoTier);
    }
    if (filters?.industry) {
      results = results.filter((a) => a.industry === filters.industry);
    }
    if (filters?.revenueBand) {
      results = results.filter((a) => a.revenueBand === filters.revenueBand);
    }
    if (filters?.tags && filters.tags.length > 0) {
      results = results.filter((a) =>
        filters.tags!.every((tag) => a.tags.includes(tag)),
      );
    }

    return results;
  }

  getArchetype(id: string): ClientArchetype | undefined {
    return this.archetypes.get(id);
  }

  // ── Custom profile management ─────────────────────────────

  createCustomProfile(input: CreateCustomProfileInput): CustomSandboxProfile {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const profile: CustomSandboxProfile = {
      id,
      tenantId: input.tenantId,
      profileName: input.profileName,
      archetype: input.archetype,
      profileData: input.profile,
      isActive: true,
      createdAt: new Date().toISOString(),
      tags: input.tags ?? [],
    };
    this.customProfiles.set(id, profile);
    return profile;
  }

  listCustomProfiles(tenantId: string): CustomSandboxProfile[] {
    return Array.from(this.customProfiles.values()).filter(
      (p) => p.tenantId === tenantId && p.isActive,
    );
  }

  // ── Simulated funding round ────────────────────────────────

  /**
   * Simulate a complete funding round for a given archetype,
   * producing realistic issuer responses based on the profile.
   */
  simulateFundingRound(
    archetypeId: string,
    roundNumber = 1,
  ): SimulatedFundingRound {
    const archetype = this.archetypes.get(archetypeId);
    if (!archetype) {
      throw new Error(`Archetype '${archetypeId}' not found.`);
    }

    const scenarioResult = this.simulator.runScenario(
      archetype.profile,
      archetype.name,
    );

    const targetRound = scenarioResult.multiRoundModel.rounds.find(
      (r) => r.roundNumber === roundNumber,
    );

    if (!targetRound) {
      return {
        roundNumber,
        archetypeId,
        issuerResponses: [],
        totalApprovedCredit: 0,
        approvalCount: 0,
        declineCount: 0,
        pendingCount: 0,
        roundCompletedAt: new Date().toISOString(),
      };
    }

    const issuerResponses = this._simulateIssuerResponses(
      archetype,
      targetRound.cardCount,
      targetRound.avgApprovalProbability,
      targetRound.estimatedCreditTotal / Math.max(targetRound.cardCount, 1),
    );

    const approvalCount = issuerResponses.filter((r) => r.decision === 'approved').length;
    const declineCount  = issuerResponses.filter((r) => r.decision === 'declined').length;
    const pendingCount  = issuerResponses.filter((r) => r.decision === 'pending').length;
    const totalApproved = issuerResponses.reduce(
      (s, r) => s + (r.approvedLimit ?? 0),
      0,
    );

    return {
      roundNumber,
      archetypeId,
      issuerResponses,
      totalApprovedCredit: totalApproved,
      approvalCount,
      declineCount,
      pendingCount,
      roundCompletedAt: new Date().toISOString(),
    };
  }

  // ── Advisor practice mode ─────────────────────────────────

  /**
   * Score an advisor's submitted funding plan against the model answer.
   */
  runPracticeMode(plan: AdvisorFundingPlan): PracticeModeResult {
    const archetype = this.archetypes.get(plan.archetypeId);
    if (!archetype) {
      throw new Error(`Archetype '${plan.archetypeId}' not found.`);
    }

    const modelAnswer = this.simulator.runScenario(
      archetype.profile,
      `${archetype.name} — Model Answer`,
    );

    const feedbackItems: PracticeFeedbackItem[] = [
      this._scoreProductSelection(plan, modelAnswer, archetype),
      this._scoreSequencing(plan, modelAnswer),
      this._scoreRiskAssessment(plan, modelAnswer, archetype),
      this._scoreAlternativeAnalysis(plan, modelAnswer),
    ];

    const overallScore = feedbackItems.reduce((s, f) => s + f.score, 0);
    const grade = this._toGrade(overallScore);

    return {
      sessionId: `practice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      archetypeId: plan.archetypeId,
      advisorId: plan.advisorId,
      overallScore,
      grade,
      feedbackItems,
      modelAnswer,
      completedAt: new Date().toISOString(),
    };
  }

  // ── Regression test suite ─────────────────────────────────

  /**
   * Run the optimizer against all 50 archetypes and compare
   * outcomes against stored expected outcomes.  Surfaces any
   * drift caused by rule updates.
   */
  runRegressionSuite(): RegressionSuiteResult {
    const cases: RegressionTestCase[] = [];
    const driftSummary: string[] = [];

    for (const archetype of this.archetypes.values()) {
      const scenario = this.simulator.runScenario(archetype.profile, archetype.name);
      const actual = {
        totalCredit: scenario.multiRoundModel.totalEstimatedCredit,
        stackingRecommended:
          scenario.alternativeComparison.recommendation.primaryChoice === 'credit_card_stack',
        confidence: scenario.multiRoundModel.confidenceRating,
      };

      const drift: string[] = [];

      if (actual.totalCredit < archetype.expectedOutcome.minExpectedCredit) {
        drift.push(
          `Total credit $${actual.totalCredit.toLocaleString()} is below expected minimum $${archetype.expectedOutcome.minExpectedCredit.toLocaleString()}.`,
        );
      }
      if (actual.stackingRecommended !== archetype.expectedOutcome.stackingRecommended) {
        drift.push(
          `Stacking recommendation changed: expected ${archetype.expectedOutcome.stackingRecommended}, got ${actual.stackingRecommended}.`,
        );
      }
      if (actual.confidence !== archetype.expectedOutcome.expectedConfidence) {
        drift.push(
          `Confidence changed: expected '${archetype.expectedOutcome.expectedConfidence}', got '${actual.confidence}'.`,
        );
      }

      const passed = drift.length === 0;
      if (!passed) {
        driftSummary.push(`[${archetype.id}] ${archetype.name}: ${drift.join(' | ')}`);
      }

      cases.push({
        archetypeId: archetype.id,
        archetypeName: archetype.name,
        passed,
        expected: archetype.expectedOutcome,
        actual,
        drift,
      });
    }

    const passed = cases.filter((c) => c.passed).length;

    return {
      runAt: new Date().toISOString(),
      totalTests: cases.length,
      passed,
      failed: cases.length - passed,
      passRate: parseFloat((passed / cases.length).toFixed(4)),
      cases,
      driftSummary,
    };
  }

  // ── Private helpers ────────────────────────────────────────

  private _simulateIssuerResponses(
    archetype: ClientArchetype,
    cardCount: number,
    avgApprovalProb: number,
    avgCreditPerCard: number,
  ): SimulatedIssuerResponse[] {
    const issuers = ['chase', 'amex', 'capital_one', 'citi', 'bank_of_america', 'us_bank', 'wells_fargo'];
    const responses: SimulatedIssuerResponse[] = [];

    for (let i = 0; i < cardCount; i++) {
      const issuer = issuers[i % issuers.length]!;
      const rand = Math.random();
      const processingTime = Math.floor(Math.random() * 3000) + 500;

      let decision: SimulatedIssuerResponse['decision'];
      let approvedLimit: number | undefined;
      let declineReasons: string[] | undefined;

      if (rand < avgApprovalProb * 0.85) {
        decision = 'approved';
        // Vary approved limit ±20% around average
        const variation = 0.8 + Math.random() * 0.4;
        approvedLimit = Math.round(avgCreditPerCard * variation);
      } else if (rand < avgApprovalProb) {
        decision = 'counteroffer';
        approvedLimit = Math.round(avgCreditPerCard * 0.5);
      } else if (rand < avgApprovalProb + 0.05) {
        decision = 'pending';
      } else {
        decision = 'declined';
        declineReasons = this._pickDeclineReasons(archetype);
      }

      responses.push({
        issuer,
        cardProduct: `${issuer.replace('_', ' ').toUpperCase()} Business Card`,
        decision,
        approvedLimit,
        declineReasons,
        processingTimeMs: processingTime,
        simulatedAt: new Date().toISOString(),
      });
    }

    return responses;
  }

  private _pickDeclineReasons(archetype: ClientArchetype): string[] {
    const reasons: string[] = [];
    if (archetype.profile.ficoScore < 660) {
      reasons.push('Credit score below minimum threshold');
    }
    if (archetype.profile.utilizationRatio > 0.7) {
      reasons.push('Revolving utilization too high');
    }
    if (archetype.profile.derogatoryCount > 0) {
      reasons.push('Derogatory marks on credit file');
    }
    if (archetype.profile.inquiries12m > 6) {
      reasons.push('Too many recent inquiries');
    }
    if (reasons.length === 0) {
      reasons.push('Insufficient credit history for this product');
    }
    return reasons;
  }

  private _scoreProductSelection(
    plan: AdvisorFundingPlan,
    model: ScenarioResult,
    archetype: ClientArchetype,
  ): PracticeFeedbackItem {
    const maxScore = 25;
    let score = 0;
    const suggestions: string[] = [];

    const selectedCount = plan.selectedCards.length;
    const modelCount = model.multiRoundModel.totalCards;

    if (selectedCount > 0) score += 10;
    if (Math.abs(selectedCount - modelCount) <= 1) score += 10;
    if (selectedCount > 0 && archetype.expectedOutcome.stackingRecommended) score += 5;

    if (selectedCount < modelCount - 1) {
      suggestions.push(`Consider adding ${modelCount - selectedCount} more card(s) to reach the target credit limit.`);
    }
    if (!archetype.expectedOutcome.stackingRecommended && selectedCount > 0) {
      suggestions.push('This archetype may not be well-suited for stacking — review suitability thresholds.');
    }

    return {
      category: 'product_selection',
      score: Math.min(maxScore, score),
      maxScore,
      feedback: score >= 20 ? 'Good product selection for this archetype.' : 'Product selection needs improvement.',
      suggestions,
    };
  }

  private _scoreSequencing(
    plan: AdvisorFundingPlan,
    model: ScenarioResult,
  ): PracticeFeedbackItem {
    const maxScore = 25;
    let score = 0;
    const suggestions: string[] = [];

    const rounds = [...new Set(plan.selectedCards.map((c) => c.round))].sort((a, b) => a - b);
    const modelRoundCount = model.multiRoundModel.rounds.length;

    if (rounds.length > 0) score += 10;
    if (Math.abs(rounds.length - modelRoundCount) <= 1) score += 10;
    // All cards have a rationale
    if (plan.selectedCards.every((c) => c.rationale.length > 10)) score += 5;

    if (rounds.length === 1 && modelRoundCount > 1) {
      suggestions.push('Spreading applications across multiple rounds reduces issuer velocity concerns.');
    }
    if (plan.selectedCards.some((c) => !c.rationale || c.rationale.length < 10)) {
      suggestions.push('Provide a clear rationale for each card selection.');
    }

    return {
      category: 'sequencing',
      score: Math.min(maxScore, score),
      maxScore,
      feedback: score >= 20 ? 'Round sequencing aligns with best practice.' : 'Review round sequencing strategy.',
      suggestions,
    };
  }

  private _scoreRiskAssessment(
    plan: AdvisorFundingPlan,
    model: ScenarioResult,
    archetype: ClientArchetype,
  ): PracticeFeedbackItem {
    const maxScore = 25;
    let score = 0;
    const suggestions: string[] = [];

    const assessment = plan.riskAssessment.toLowerCase();

    if (assessment.length > 50) score += 5;

    const riskFactors = model.approvalProbabilityReport.riskFactors;
    let coveredFactors = 0;
    if (assessment.includes('fico') || assessment.includes('credit score')) coveredFactors++;
    if (assessment.includes('utiliz')) coveredFactors++;
    if (assessment.includes('derog') || assessment.includes('collection')) coveredFactors++;
    if (assessment.includes('revenue') || assessment.includes('cash flow')) coveredFactors++;
    if (assessment.includes('interest') || assessment.includes('apr') || assessment.includes('shock')) coveredFactors++;

    score += Math.min(15, coveredFactors * 3);

    const worstCase = model.worstCaseRepayment;
    if (!worstCase.isSustainable && assessment.includes('sustain')) score += 5;
    if (worstCase.isSustainable) score += 5; // sustainable profile is easier

    if (riskFactors.length > 0 && coveredFactors < 2) {
      suggestions.push(`Address key risk factors: ${riskFactors.slice(0, 2).join('; ')}`);
    }
    if (!assessment.includes('interest') && !assessment.includes('apr')) {
      suggestions.push('Always address the interest shock risk when evaluating stacking suitability.');
    }

    return {
      category: 'risk_assessment',
      score: Math.min(maxScore, score),
      maxScore,
      feedback: score >= 20
        ? 'Thorough risk assessment covering key factors.'
        : 'Risk assessment should cover FICO, utilization, interest shock, and revenue sustainability.',
      suggestions,
    };
  }

  private _scoreAlternativeAnalysis(
    plan: AdvisorFundingPlan,
    model: ScenarioResult,
  ): PracticeFeedbackItem {
    const maxScore = 25;
    let score = 0;
    const suggestions: string[] = [];

    if (plan.alternativeConsidered) {
      score += 15;
    }

    const primaryRec = model.alternativeComparison.recommendation.primaryChoice;
    if (plan.alternativeConsidered && primaryRec !== 'credit_card_stack') {
      score += 10; // correctly identified a non-stacking recommendation
    } else if (plan.alternativeConsidered && primaryRec === 'credit_card_stack') {
      score += 10; // correctly proceeded with stacking after alternative review
    }

    if (!plan.alternativeConsidered) {
      suggestions.push('Always document whether SBA 7(a), line of credit, or MCA was evaluated and why stacking was preferred.');
    }

    return {
      category: 'alternative_analysis',
      score: Math.min(maxScore, score),
      maxScore,
      feedback: plan.alternativeConsidered
        ? 'Good practice — alternatives were considered before recommending stacking.'
        : 'Alternative product analysis was not documented.',
      suggestions,
    };
  }

  private _toGrade(score: number): PracticeModeResult['grade'] {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}

// Singleton convenience export
export const sandboxService = new SandboxService();
