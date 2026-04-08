// ============================================================
// Credit Union Issuer Database
// - 6 credit unions with business card products
// - Eligibility checker for membership qualification
// - Approval intelligence and velocity rules
// ============================================================

export interface CreditUnionIssuer {
  id: string;
  name: string;
  type: 'credit_union';
  tier: 'A' | 'B';
  membershipRequired: boolean;
  membershipEligibility: string[];
  membershipCost: number;
  businessCard: {
    name: string;
    limitRange: string;
    introPeriod: string;
    ongoingApr: number;
    annualFee: number;
    minFico: number;
  };
  velocityRules: string[];
  reconLine: string;
  approvalIntelligence: string;
  stackingRole: string;
  approvalRateByFico: Record<string, number>;
}

export const CREDIT_UNION_ISSUERS: CreditUnionIssuer[] = [
  {
    id: 'navy-federal',
    name: 'Navy Federal Credit Union',
    type: 'credit_union',
    tier: 'A',
    membershipRequired: true,
    membershipEligibility: [
      'Active duty military',
      'Retired military',
      'Veterans',
      'Military family members',
      'DoD civilian employees',
    ],
    membershipCost: 0,
    businessCard: {
      name: 'Navy Federal Business Visa',
      limitRange: '$10,000–$50,000',
      introPeriod: '0% for 12 months',
      ongoingApr: 14.90,
      annualFee: 0,
      minFico: 620,
    },
    velocityRules: [
      'Max 2 new NFCU cards per 12 months',
      'Existing member relationship preferred (6+ months)',
    ],
    reconLine: '1-888-842-6328',
    approvalIntelligence:
      'Navy Federal is known for generous limits and lenient underwriting for members with established relationships. Direct deposit significantly improves approval odds.',
    stackingRole: 'Anchor card for military-affiliated applicants — high limits at lowest APR tier.',
    approvalRateByFico: {
      '620-659': 55,
      '660-699': 72,
      '700-739': 85,
      '740-779': 92,
      '780+': 96,
    },
  },
  {
    id: 'penfed',
    name: 'PenFed Credit Union',
    type: 'credit_union',
    tier: 'A',
    membershipRequired: true,
    membershipEligibility: [
      'Anyone — open to all via $17 membership fee',
      'Military and government employees (priority)',
      'Voices for Americas Troops donation ($17)',
    ],
    membershipCost: 17,
    businessCard: {
      name: 'PenFed Business Cash Rewards',
      limitRange: '$5,000–$35,000',
      introPeriod: '0% for 12 months',
      ongoingApr: 17.99,
      annualFee: 0,
      minFico: 650,
    },
    velocityRules: [
      'Max 1 new PenFed card per 6 months',
      'Requires savings account with $5 minimum balance',
    ],
    reconLine: '1-800-247-5626',
    approvalIntelligence:
      'PenFed has a straightforward approval process. Membership is open to anyone via a small donation. Credit limits tend to be moderate but grow with relationship.',
    stackingRole: 'Easy-access CU card for non-military applicants — low barrier to entry.',
    approvalRateByFico: {
      '650-679': 50,
      '680-699': 65,
      '700-739': 78,
      '740-779': 88,
      '780+': 94,
    },
  },
  {
    id: 'alliant',
    name: 'Alliant Credit Union',
    type: 'credit_union',
    tier: 'A',
    membershipRequired: true,
    membershipEligibility: [
      'Anyone — join via Foster Care to Success ($10 donation)',
      'Employees of qualifying companies',
      'Residents of qualifying communities in Chicagoland area',
    ],
    membershipCost: 10,
    businessCard: {
      name: 'Alliant Business Visa Signature',
      limitRange: '$5,000–$40,000',
      introPeriod: '0% for 12 months',
      ongoingApr: 15.24,
      annualFee: 0,
      minFico: 640,
    },
    velocityRules: [
      'Max 2 new Alliant products per 12 months',
      'Checking account with direct deposit improves odds',
    ],
    reconLine: '1-800-328-1935',
    approvalIntelligence:
      'Alliant is one of the largest online CUs with competitive rates. They value banking relationship depth — having a checking account and direct deposit materially improves approval.',
    stackingRole: 'Strong mid-tier CU card with competitive APR and accessible membership.',
    approvalRateByFico: {
      '640-659': 45,
      '660-699': 62,
      '700-739': 80,
      '740-779': 90,
      '780+': 95,
    },
  },
  {
    id: 'dcu',
    name: 'DCU (Digital Federal Credit Union)',
    type: 'credit_union',
    tier: 'A',
    membershipRequired: true,
    membershipEligibility: [
      'Anyone — join via Reach Out for Schools ($10 donation)',
      'Employees of 500+ partner organizations',
      'Residents of qualifying Massachusetts communities',
    ],
    membershipCost: 10,
    businessCard: {
      name: 'DCU Business Visa Platinum',
      limitRange: '$5,000–$50,000',
      introPeriod: '0% for 12 months',
      ongoingApr: 13.50,
      annualFee: 0,
      minFico: 620,
    },
    velocityRules: [
      'Max 1 new DCU card per 6 months',
      'Primary savings account required ($5 minimum)',
    ],
    reconLine: '1-508-263-6700',
    approvalIntelligence:
      'DCU offers the LOWEST APR among credit union business cards at 13.50%. Open membership via charitable donation. Known for generous credit limits for established members.',
    stackingRole: 'RECOMMENDED — Best-in-class APR makes this the priority CU card for cost-conscious stacking.',
    approvalRateByFico: {
      '620-659': 52,
      '660-699': 70,
      '700-739': 84,
      '740-779': 91,
      '780+': 96,
    },
  },
  {
    id: 'first-tech',
    name: 'First Tech Federal Credit Union',
    type: 'credit_union',
    tier: 'B',
    membershipRequired: true,
    membershipEligibility: [
      'Employees of qualifying tech companies (Intel, HP, Microsoft, Nike, etc.)',
      'Computer History Museum members ($15)',
      'Financial Fitness Association members ($15)',
    ],
    membershipCost: 15,
    businessCard: {
      name: 'First Tech Business Rewards',
      limitRange: '$5,000–$30,000',
      introPeriod: '0% for 6 months',
      ongoingApr: 18.00,
      annualFee: 0,
      minFico: 660,
    },
    velocityRules: [
      'Max 2 new First Tech products per 12 months',
      'Membership tenure of 3+ months preferred',
    ],
    reconLine: '1-855-855-8805',
    approvalIntelligence:
      'First Tech primarily serves the tech industry. Approval odds improve significantly with employer verification from a qualifying tech company. Limits trend higher for tech employees.',
    stackingRole: 'Niche CU for tech workers — employer affiliation significantly boosts approval.',
    approvalRateByFico: {
      '660-679': 42,
      '680-699': 58,
      '700-739': 72,
      '740-779': 84,
      '780+': 91,
    },
  },
  {
    id: 'becu',
    name: 'BECU (Boeing Employees Credit Union)',
    type: 'credit_union',
    tier: 'B',
    membershipRequired: true,
    membershipEligibility: [
      'Residents of Washington state',
      'Boeing employees and retirees',
      'Family members of existing BECU members',
    ],
    membershipCost: 0,
    businessCard: {
      name: 'BECU Business Visa',
      limitRange: '$5,000–$25,000',
      introPeriod: '0% for 9 months',
      ongoingApr: 15.24,
      annualFee: 0,
      minFico: 630,
    },
    velocityRules: [
      'Max 1 new BECU card per 12 months',
      'WA state residency verified during application',
    ],
    reconLine: '1-800-233-2328',
    approvalIntelligence:
      'BECU is geographically restricted to Washington state residents. Competitive rates and no-fee structure. Member relationship depth (checking, savings, auto loan) improves credit limit assignment.',
    stackingRole: 'Regional CU option for WA residents — no membership fee and competitive APR.',
    approvalRateByFico: {
      '630-659': 48,
      '660-699': 64,
      '700-739': 78,
      '740-779': 87,
      '780+': 93,
    },
  },
  {
    id: 'lake-michigan',
    name: 'Lake Michigan Credit Union',
    type: 'credit_union',
    tier: 'B',
    membershipRequired: true,
    membershipEligibility: [
      'Residents of lower Michigan',
      'Employees of qualifying organizations in Michigan',
      'Members of qualifying associations',
    ],
    membershipCost: 5,
    businessCard: {
      name: 'LMCU Business Visa',
      limitRange: '$5,000–$25,000',
      introPeriod: '0% for 6 months',
      ongoingApr: 15.49,
      annualFee: 0,
      minFico: 640,
    },
    velocityRules: [
      'Max 1 new LMCU card per 12 months',
      'Requires membership with $5 savings deposit',
    ],
    reconLine: '1-800-242-9790',
    approvalIntelligence:
      'Lake Michigan CU is one of the largest credit unions in Michigan with competitive rates. Strong preference for members with established checking/savings relationships.',
    stackingRole: 'Regional CU option for Michigan residents — competitive APR with low membership cost.',
    approvalRateByFico: {
      '640-659': 44,
      '660-699': 60,
      '700-739': 76,
      '740-779': 86,
      '780+': 92,
    },
  },
];

// ─── Eligibility checker ─────────────────────────────────────────────────────

export interface EligibilityResult {
  cu: CreditUnionIssuer;
  eligible: boolean;
  reason: string;
  cost: number;
}

export function checkCUEligibility(
  state: string,
  militaryStatus: 'active' | 'retired' | 'veteran' | 'family' | 'none',
  employer: string,
  techIndustry: boolean,
): EligibilityResult[] {
  const employerLower = employer.toLowerCase().trim();
  const isMilitary = militaryStatus !== 'none';

  return CREDIT_UNION_ISSUERS.map((cu) => {
    switch (cu.id) {
      case 'navy-federal': {
        const eligible = isMilitary;
        return {
          cu,
          eligible,
          reason: eligible
            ? `Eligible via ${militaryStatus} military status — no membership fee`
            : 'Requires military affiliation (active, retired, veteran, or family member)',
          cost: 0,
        };
      }

      case 'penfed': {
        // Open to anyone via $17 donation
        return {
          cu,
          eligible: true,
          reason: isMilitary
            ? `Eligible via military affiliation — priority processing, $17 membership`
            : 'Open membership via $17 Voices for Americas Troops donation',
          cost: 17,
        };
      }

      case 'alliant': {
        // Open to anyone via $10 donation
        return {
          cu,
          eligible: true,
          reason: 'Open membership via $10 Foster Care to Success donation',
          cost: 10,
        };
      }

      case 'dcu': {
        // Open to anyone via $10 donation
        return {
          cu,
          eligible: true,
          reason: 'Open membership via $10 Reach Out for Schools donation — LOWEST APR at 13.50%',
          cost: 10,
        };
      }

      case 'first-tech': {
        const techCompanies = ['intel', 'hp', 'microsoft', 'nike', 'amazon', 'google', 'apple', 'meta', 'oracle', 'cisco'];
        const employerMatch = techCompanies.some((tc) => employerLower.includes(tc));
        const eligible = techIndustry || employerMatch;
        return {
          cu,
          eligible,
          reason: eligible
            ? employerMatch
              ? `Eligible via employer (${employer}) — direct membership`
              : 'Eligible via tech industry affiliation — join via Computer History Museum ($15)'
            : 'Requires tech industry employment or $15 Computer History Museum / Financial Fitness Association membership',
          cost: eligible ? 15 : 15,
        };
      }

      case 'becu': {
        const eligible = state === 'WA';
        return {
          cu,
          eligible,
          reason: eligible
            ? 'Eligible via Washington state residency — no membership fee'
            : 'Restricted to Washington state residents, Boeing employees, or BECU family members',
          cost: 0,
        };
      }

      case 'lake-michigan': {
        const eligible = state === 'MI';
        return {
          cu,
          eligible,
          reason: eligible
            ? 'Eligible via Michigan residency — $5 membership deposit'
            : 'Restricted to lower Michigan residents, qualifying employees, or association members',
          cost: 5,
        };
      }

      default:
        return {
          cu,
          eligible: false,
          reason: 'Unknown credit union',
          cost: 0,
        };
    }
  });
}
