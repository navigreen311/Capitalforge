// ============================================================
// CapitalForge — Business Credit Builder Track
//
// Responsibilities:
//   1. DUNS number registration guidance (D&B iUpdate / CDP)
//   2. Net-30 vendor tradeline recommendations by industry
//   3. FICO SBSS score improvement roadmap
//   4. Milestone gating: unlock stacking when criteria are met
//   5. Business credit file validation and gap analysis
// ============================================================

import { PrismaClient } from '@prisma/client';
import logger from '../config/logger.js';
import {
  GRADUATION_TRACKS,
  TRACK_THRESHOLDS,
  checkTrackEligibility,
  type GraduationInput,
} from './client-graduation.service.js';

// ── Prisma singleton ─────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── DUNS Registration Steps ───────────────────────────────────

export interface DunsRegistrationStep {
  stepNumber: number;
  title:      string;
  detail:     string;
  url:        string;
  estimatedDays: number;
}

export const DUNS_REGISTRATION_STEPS: DunsRegistrationStep[] = [
  {
    stepNumber:    1,
    title:         'Verify Business Identity',
    detail:        'Gather EIN, legal business name (matching IRS records), physical address, and phone number. Ensure your entity is active with the Secretary of State.',
    url:           'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
    estimatedDays: 0,
  },
  {
    stepNumber:    2,
    title:         'Register for a D-U-N-S Number (Free)',
    detail:        'Go to D&B iUpdate or the D&B Credit Signup page. Select "Get a D-U-N-S Number" → "Get a D-U-N-S Number for Free". Allow 30 business days for standard processing. Expedited is available for a fee but is rarely necessary.',
    url:           'https://www.dnb.com/duns-number/get-a-duns.html',
    estimatedDays: 30,
  },
  {
    stepNumber:    3,
    title:         'Create a D&B Business Credit Profile (CDP)',
    detail:        'After receiving your DUNS, log into D&B and claim your profile. Verify all NAP (Name, Address, Phone) data is consistent across your Google Business, Yelp, and website listings.',
    url:           'https://app.dnb.com/account/signup',
    estimatedDays: 5,
  },
  {
    stepNumber:    4,
    title:         'Register with Business Credit Bureaus',
    detail:        'Register with Experian Business and Equifax Business Credit using your EIN and DUNS. This ensures tradelines reported to multiple bureaus build your file simultaneously.',
    url:           'https://www.experian.com/small-business/business-credit',
    estimatedDays: 7,
  },
  {
    stepNumber:    5,
    title:         'Open Vendor Credit Accounts (Net-30)',
    detail:        'Apply for starter Net-30 accounts that report to D&B, Experian Business, and Equifax Business. Pay BEFORE the due date — early payment is reported as "Anticipates" on Paydex (100 score).',
    url:           'https://nav.com/business-credit-tradelines',
    estimatedDays: 14,
  },
  {
    stepNumber:    6,
    title:         'Monitor and Dispute Errors',
    detail:        'Pull your Paydex score monthly (free via Nav.com). Dispute any inaccurate tradelines directly through D&B iUpdate. Errors should resolve within 30 days.',
    url:           'https://www.dnb.com/credit-learning-center/how-to-get-my-dun-bradstreet-credit-report.html',
    estimatedDays: 30,
  },
];

// ── Net-30 Vendor Catalogue ───────────────────────────────────

export interface VendorTradeline {
  vendor:         string;
  category:       string;
  netTerms:       number;
  reportsBureaus: string[];
  creditLimit:    string;
  industries:     string[];   // empty = universal
  requirements:   string;
  url:            string;
  tier:           'starter' | 'intermediate' | 'advanced';
}

export const NET30_VENDORS: VendorTradeline[] = [
  // ── Tier 1: Starter (no prior business credit required) ────
  {
    vendor:         'Uline',
    category:       'Shipping & Packaging',
    netTerms:       30,
    reportsBureaus: ['D&B', 'Experian Business'],
    creditLimit:    '$500 – $25,000',
    industries:     [],
    requirements:   'EIN, business address, 1+ year in business preferred (not required)',
    url:            'https://www.uline.com/Help_Content/Net30.aspx',
    tier:           'starter',
  },
  {
    vendor:         'Quill (Staples)',
    category:       'Office Supplies',
    netTerms:       30,
    reportsBureaus: ['D&B'],
    creditLimit:    '$500 – $10,000',
    industries:     [],
    requirements:   'EIN and business address; no revenue minimum',
    url:            'https://www.quill.com/account/billing',
    tier:           'starter',
  },
  {
    vendor:         'Grainger',
    category:       'Industrial / MRO Supplies',
    netTerms:       30,
    reportsBureaus: ['D&B', 'Experian Business'],
    creditLimit:    '$500 – $50,000',
    industries:     ['manufacturing', 'construction', 'facilities', 'logistics'],
    requirements:   'Business account application; EIN required',
    url:            'https://www.grainger.com/content/grainger-account',
    tier:           'starter',
  },
  {
    vendor:         'Summa Office Supplies',
    category:       'Office Supplies',
    netTerms:       30,
    reportsBureaus: ['D&B', 'Experian Business', 'Equifax Business'],
    creditLimit:    '$75 – $2,500',
    industries:     [],
    requirements:   'New businesses accepted; lowest bar for approval',
    url:            'https://summaofficesupplies.com/net-30-account',
    tier:           'starter',
  },
  {
    vendor:         'Crown Office Supplies',
    category:       'Office Supplies',
    netTerms:       30,
    reportsBureaus: ['D&B', 'Experian Business'],
    creditLimit:    '$250 – $5,000',
    industries:     [],
    requirements:   'No minimum credit score; EIN required',
    url:            'https://www.crownofficeltd.com/net30',
    tier:           'starter',
  },
  // ── Tier 2: Intermediate (some business credit history) ────
  {
    vendor:         'Home Depot Commercial',
    category:       'Hardware & Building Materials',
    netTerms:       30,
    reportsBureaus: ['D&B', 'Experian Business'],
    creditLimit:    '$1,000 – $50,000',
    industries:     ['construction', 'real_estate', 'property_management', 'retail'],
    requirements:   'DUNS required; 2+ positive tradelines recommended',
    url:            'https://www.homedepot.com/c/commercial_account',
    tier:           'intermediate',
  },
  {
    vendor:         'Amazon Business',
    category:       'General / E-Commerce',
    netTerms:       30,
    reportsBureaus: ['Experian Business'],
    creditLimit:    '$1,000 – $25,000',
    industries:     [],
    requirements:   'Existing Amazon account; 6+ months in business',
    url:            'https://www.amazon.com/business/register/flow/accountCreation',
    tier:           'intermediate',
  },
  {
    vendor:         'FedEx Business Account',
    category:       'Shipping & Logistics',
    netTerms:       30,
    reportsBureaus: ['D&B'],
    creditLimit:    '$500 – $10,000',
    industries:     ['logistics', 'e-commerce', 'retail', 'technology'],
    requirements:   'Business account; EIN and 6+ months operating',
    url:            'https://www.fedex.com/en-us/open-account.html',
    tier:           'intermediate',
  },
  {
    vendor:         'Shell Fleet Card (Net-30)',
    category:       'Fuel & Fleet',
    netTerms:       30,
    reportsBureaus: ['D&B', 'Experian Business'],
    creditLimit:    '$500 – $5,000',
    industries:     ['transportation', 'construction', 'field_services', 'logistics'],
    requirements:   'Commercial fleet vehicle(s); business bank account',
    url:            'https://www.shell.us.com/business/fleet-cards.html',
    tier:           'intermediate',
  },
  // ── Tier 3: Advanced (established business credit file) ────
  {
    vendor:         'Dell Business Credit',
    category:       'Technology Hardware',
    netTerms:       30,
    reportsBureaus: ['D&B', 'Experian Business'],
    creditLimit:    '$2,000 – $250,000',
    industries:     ['technology', 'media', 'professional_services'],
    requirements:   'Paydex 70+ or Experian Intelliscore 50+; 12+ months in business',
    url:            'https://www.dell.com/en-us/work/shop/dell-business-credit/ab/business-credit',
    tier:           'advanced',
  },
  {
    vendor:         'Costco Business Membership + Net-30',
    category:       'General / Wholesale',
    netTerms:       30,
    reportsBureaus: ['D&B'],
    creditLimit:    '$2,500 – $25,000',
    industries:     ['retail', 'food_service', 'hospitality'],
    requirements:   'Business membership ($65/yr); established D&B file recommended',
    url:            'https://www.costco.com/business-membership.html',
    tier:           'advanced',
  },
];

// ── SBSS Score Improvement Roadmap ───────────────────────────

export interface SbssScoreMilestone {
  targetScore:    number;
  label:          string;
  requiredActions: string[];
  unlockedProducts: string[];
  estimatedMonths: number;
}

export const SBSS_SCORE_MILESTONES: SbssScoreMilestone[] = [
  {
    targetScore:    50,
    label:          'SBSS 50 — Basic Business Credit',
    requiredActions: [
      'Register DUNS number',
      'Open 2–3 Net-30 vendor accounts',
      'Pay all balances before due date',
      'Ensure consistent NAP data across all business directories',
    ],
    unlockedProducts: [
      'Starter Net-30 vendor accounts (Tier 2)',
      'Some secured business cards',
    ],
    estimatedMonths: 3,
  },
  {
    targetScore:    80,
    label:          'SBSS 80 — Starter Stack Eligible',
    requiredActions: [
      'Maintain 4+ active Net-30 tradelines with on-time payments',
      'No derogatory marks or slow pays in the last 12 months',
      'Personal FICO 620+ (personal credit still factors into SBSS)',
      'Business bank account with 6+ months of statements',
    ],
    unlockedProducts: [
      'Entry-level business credit cards (Capital One Spark, Chase Ink Cash)',
      'Starter Stack track',
    ],
    estimatedMonths: 6,
  },
  {
    targetScore:    140,
    label:          'SBSS 140 — Full Stack Eligible',
    requiredActions: [
      'Maintain 6+ Net-30 tradelines with consistent payment history',
      'Business credit utilization below 30%',
      'Personal FICO 680+',
      '12+ months business operating history',
      'Demonstrate $8,000+/mo revenue with bank statements',
    ],
    unlockedProducts: [
      'Premium business cards (Amex Business Gold/Platinum, Chase Ink Preferred)',
      'Full Stack track',
      'SBA Express loan pre-qualification',
    ],
    estimatedMonths: 12,
  },
  {
    targetScore:    200,
    label:          'SBSS 200 — LOC / SBA Bridge Ready',
    requiredActions: [
      'Maintain 8+ Net-30 tradelines',
      'Zero late payments in 24 months',
      'Personal FICO 720+',
      '24+ months operating history',
      'Revenue $15,000+/mo with 2+ years tax returns',
      'Debt service coverage ratio > 1.25',
    ],
    unlockedProducts: [
      'SBA 7(a) loan ($500K–$5M)',
      'Business line of credit ($100K–$500K)',
      'LOC/SBA Bridge track',
    ],
    estimatedMonths: 24,
  },
];

// ── Stacking Unlock Criteria ──────────────────────────────────

export interface StackingUnlockStatus {
  unlocked:           boolean;
  track:              string;
  gatePassed:         boolean[];
  blockingReasons:    string[];
  recommendedActions: string[];
}

export function evaluateStackingUnlock(input: GraduationInput): StackingUnlockStatus {
  const starterThreshold = TRACK_THRESHOLDS[GRADUATION_TRACKS.STARTER_STACK];
  const { eligible, gates } = checkTrackEligibility(GRADUATION_TRACKS.STARTER_STACK, input);

  const blockingReasons: string[] = [];
  const recommendedActions: string[] = [];

  const gatePassed = gates.map((g) => g.passed);

  gates.forEach((gate) => {
    if (!gate.passed) {
      blockingReasons.push(
        `${gate.criterion}: requires ${gate.required}, current value is ${gate.actual}`,
      );
    }
  });

  if (!eligible) {
    if (input.ficoScore < starterThreshold.minFicoScore) {
      recommendedActions.push(
        `Improve personal FICO to ${starterThreshold.minFicoScore} (currently ${input.ficoScore})`,
      );
    }
    if (input.tradelineCount < starterThreshold.minTradelines) {
      recommendedActions.push(
        `Open ${starterThreshold.minTradelines - input.tradelineCount} more Net-30 vendor accounts`,
      );
    }
    if (input.currentUtilization > starterThreshold.maxUtilization) {
      recommendedActions.push(
        `Reduce personal credit utilization below ${(starterThreshold.maxUtilization * 100).toFixed(0)}%`,
      );
    }
    if (input.businessAgeMonths < starterThreshold.minBusinessAgeMonths) {
      const remaining = starterThreshold.minBusinessAgeMonths - input.businessAgeMonths;
      recommendedActions.push(`Wait ${remaining} more month(s) for business age requirement`);
    }
    if (input.monthlyRevenue < starterThreshold.minMonthlyRevenue) {
      recommendedActions.push(
        `Grow monthly revenue to $${starterThreshold.minMonthlyRevenue.toLocaleString()}`,
      );
    }
  }

  return {
    unlocked:           eligible,
    track:              eligible ? GRADUATION_TRACKS.STARTER_STACK : GRADUATION_TRACKS.CREDIT_BUILDER,
    gatePassed,
    blockingReasons,
    recommendedActions,
  };
}

// ── Roadmap Builder ───────────────────────────────────────────

export interface CreditBuilderRoadmap {
  businessId:             string;
  dunsSteps:              DunsRegistrationStep[];
  recommendedVendors:     VendorTradeline[];
  sbssMilestones:         SbssScoreMilestone[];
  currentSbssTarget:      SbssScoreMilestone | null;
  stackingUnlockStatus:   StackingUnlockStatus;
  estimatedCompletionMonths: number;
  generatedAt:            Date;
}

/**
 * Generate a complete credit builder roadmap for a business.
 */
export function buildCreditRoadmap(
  businessId: string,
  industry:   string,
  input:      GraduationInput,
): CreditBuilderRoadmap {
  const unlockStatus = evaluateStackingUnlock(input);

  // Filter vendors to industry-relevant + universal
  const normalizedIndustry = industry.toLowerCase().replace(/[\s-]/g, '_');
  const recommendedVendors = NET30_VENDORS.filter(
    (v) => v.industries.length === 0 || v.industries.includes(normalizedIndustry),
  );

  // Find the current SBSS milestone target
  const currentSbssTarget =
    SBSS_SCORE_MILESTONES.find((m) => m.targetScore > input.businessCreditScore) ?? null;

  // Compute estimated total time to stacking unlock
  const estimatedCompletionMonths = unlockStatus.unlocked
    ? 0
    : currentSbssTarget?.estimatedMonths ?? 6;

  logger.info('[CreditBuilderService] Roadmap generated', {
    businessId,
    industry,
    unlocked:              unlockStatus.unlocked,
    currentBizCreditScore: input.businessCreditScore,
    currentSbssTarget:     currentSbssTarget?.label,
  });

  return {
    businessId,
    dunsSteps:             DUNS_REGISTRATION_STEPS,
    recommendedVendors,
    sbssMilestones:        SBSS_SCORE_MILESTONES,
    currentSbssTarget,
    stackingUnlockStatus:  unlockStatus,
    estimatedCompletionMonths,
    generatedAt:           new Date(),
  };
}

/**
 * Generate credit builder roadmap from persisted business data.
 */
export async function buildCreditRoadmapForBusiness(
  businessId: string,
): Promise<CreditBuilderRoadmap> {
  const prisma = getPrisma();

  const business = await prisma.business.findUnique({
    where:   { id: businessId },
    include: { creditProfiles: { orderBy: { pulledAt: 'desc' } } },
  });

  if (!business) {
    throw new Error(`Business ${businessId} not found`);
  }

  const ageMonths = business.dateOfFormation
    ? Math.floor(
        (Date.now() - new Date(business.dateOfFormation).getTime()) /
          (1000 * 60 * 60 * 24 * 30.44),
      )
    : 0;

  const personalProfiles = business.creditProfiles.filter(
    (p) => p.profileType === 'personal' && p.scoreType === 'fico',
  );
  const ficoScore = personalProfiles.length > 0
    ? Math.max(...personalProfiles.map((p) => p.score ?? 0))
    : 0;

  const bizProfiles = business.creditProfiles.filter(
    (p) => p.profileType === 'business',
  );
  const businessCreditScore = bizProfiles.length > 0
    ? Math.max(...bizProfiles.map((p) => p.score ?? 0))
    : 0;

  const latestBizProfile = bizProfiles[0] ?? null;
  const tradelines = latestBizProfile?.tradelines as Record<string, unknown>[] | null;
  const tradelineCount = Array.isArray(tradelines) ? tradelines.length : 0;

  const latestPersonal   = personalProfiles[0] ?? null;
  const currentUtilization = latestPersonal?.utilization
    ? Number(latestPersonal.utilization)
    : 0;

  const monthlyRevenue = business.monthlyRevenue
    ? Number(business.monthlyRevenue)
    : 0;

  const input: GraduationInput = {
    ficoScore,
    businessAgeMonths:   ageMonths,
    monthlyRevenue,
    businessCreditScore,
    tradelineCount,
    currentUtilization,
  };

  return buildCreditRoadmap(
    businessId,
    business.industry ?? 'general',
    input,
  );
}

// ── Milestone Progress Evaluation ────────────────────────────

export interface MilestoneProgress {
  milestoneLabel:  string;
  targetScore:     number;
  currentScore:    number;
  gap:             number;
  percentComplete: number;
  requiredActions: string[];
  estimatedMonths: number;
  achieved:        boolean;
}

/**
 * Evaluate progress toward each SBSS milestone for a given current score.
 */
export function evaluateMilestoneProgress(
  currentSbssScore: number,
): MilestoneProgress[] {
  const previous = [0, ...SBSS_SCORE_MILESTONES.map((m) => m.targetScore)];

  return SBSS_SCORE_MILESTONES.map((milestone, idx) => {
    const rangeStart = previous[idx];
    const rangeEnd   = milestone.targetScore;
    const rangeSize  = rangeEnd - rangeStart;

    const clampedCurrent = Math.min(currentSbssScore, rangeEnd);
    const pointsInRange  = Math.max(0, clampedCurrent - rangeStart);
    const percentComplete = rangeSize > 0
      ? Math.min(100, Math.round((pointsInRange / rangeSize) * 100))
      : 100;

    const gap       = Math.max(0, milestone.targetScore - currentSbssScore);
    const achieved  = currentSbssScore >= milestone.targetScore;

    return {
      milestoneLabel:  milestone.label,
      targetScore:     milestone.targetScore,
      currentScore:    currentSbssScore,
      gap,
      percentComplete,
      requiredActions: achieved ? [] : milestone.requiredActions,
      estimatedMonths: achieved ? 0 : milestone.estimatedMonths,
      achieved,
    };
  });
}
