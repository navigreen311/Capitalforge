'use client';

// ============================================================
// Stacking Optimizer — /optimizer
// - Input form: FICO, existing cards, business profile
// - Optimization results: ranked card recommendations with
//   approval probability bars
// - Issuer rule violations panel (Chase 5/24, Amex velocity)
// - Multi-round sequencing timeline
// - Network diversity indicator (Visa/MC/Amex pie chart)
// - "Run Optimization" action button
// ============================================================

import { useState, useMemo, useEffect, useCallback } from 'react';
import { SectionCard } from '@/components/ui/card';
import {
  CardRecommendation,
  type CardRecommendationProps,
} from '@/components/modules/card-recommendation';
import {
  CREDIT_UNION_ISSUERS,
  checkCUEligibility,
  type EligibilityResult,
  type CreditUnionIssuer,
} from '@/lib/credit-union-issuers';

// ─── Types for Optimizer V2 API ──────────────────────────────────────────────

type PrioritizationMode = 'max_credit' | 'best_terms' | 'fastest_approval' | 'min_inquiries';

interface ClientOption {
  id: string;
  businessName: string;
  status: string;
}

interface ApiCardRecommendation {
  cardProductId: string;
  issuer: string;
  name: string;
  cardType: string;
  eligibilityScore: number;
  estimatedLimitMin: number;
  estimatedLimitMax: number;
  estimatedLimitTypical: number;
  approvalDifficulty: string;
  aprIntro: number | null;
  aprIntroMonths: number | null;
  aprPostPromo: number | null;
  annualFee: number;
  rewardsType: string | null;
  rewardsRate: number | null;
  rewardsDetails: string | null;
  welcomeBonus: string | null;
  welcomeBonusValue: number | null;
  personalGuarantee: boolean;
  bestFor: string | null;
  sequencePosition: number;
  cooldownDays: number;
  rationale: string;
  velocityRisk: 'low' | 'medium' | 'high';
}

interface ApiExcludedCard {
  cardProductId: string;
  issuer: string;
  name: string;
  reason: string;
}

interface ApiAprExpiry {
  cardName: string;
  introMonths: number;
  expiryEstimate: string;
}

interface ApiStackingPlan {
  businessId: string;
  generatedAt: string;
  recommendations: ApiCardRecommendation[];
  excludedCards: ApiExcludedCard[];
  totalEstimatedCreditMin: number;
  totalEstimatedCreditMax: number;
  totalEstimatedCreditTypical: number;
  velocityRiskScore: number;
  velocityRiskLevel: 'low' | 'medium' | 'high';
  aprExpirySummary: ApiAprExpiry[];
  prioritizationMode: PrioritizationMode;
  cardCount: number;
}

// ─── Credit Union bureau pull mapping & helpers ─────────────────────────────

const CU_BUREAU_PULLS: Record<string, string> = {
  'penfed':      'TransUnion',
  'alliant':     'TransUnion',
  'first-tech':  'TransUnion',
  'navy-federal':'Equifax',
  'becu':        'Equifax',
  'dcu':         'Equifax',
};

/** Known CU issuer names (case-insensitive match) */
const CU_ISSUER_NAMES = CREDIT_UNION_ISSUERS.map((cu) => cu.name.toLowerCase());

function isCreditUnionIssuer(issuerName: string): boolean {
  const lower = issuerName.toLowerCase();
  return (
    CU_ISSUER_NAMES.some((name) => lower.includes(name.split(' ')[0].toLowerCase())) ||
    lower.includes('credit union') ||
    lower === 'penfed' ||
    lower === 'alliant' ||
    lower === 'navy federal' ||
    lower === 'dcu' ||
    lower === 'first tech' ||
    lower === 'becu'
  );
}

function getCUBureauPull(issuerName: string): string | null {
  const lower = issuerName.toLowerCase();
  for (const [cuId, bureau] of Object.entries(CU_BUREAU_PULLS)) {
    if (lower.includes(cuId.replace('-', ' ')) || lower.includes(cuId.replace('-', ''))) {
      return bureau;
    }
  }
  return null;
}

function getCUIdFromIssuer(issuerName: string): string | null {
  const lower = issuerName.toLowerCase();
  for (const cu of CREDIT_UNION_ISSUERS) {
    const cuNameLower = cu.name.toLowerCase();
    if (lower.includes(cuNameLower.split(' ')[0].toLowerCase()) || lower.includes(cu.id.replace('-', ' '))) {
      return cu.id;
    }
  }
  return null;
}

// ─── Credit Union Strategy Panel ────────────────────────────────────────────

function CreditUnionStrategyPanel() {
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-teal-200 bg-teal-50">
        <h3 className="text-sm font-bold text-teal-800 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-600 text-white text-[10px] font-bold">
            CU
          </span>
          Credit Union Strategy Note
        </h3>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="space-y-2 text-xs text-teal-900 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="text-teal-600 font-bold mt-0.5 flex-shrink-0">1.</span>
            <p>
              <span className="font-semibold">No velocity impact on major banks:</span>{' '}
              CU cards do not count against Chase 5/24 or Amex velocity limits. They use independent inquiry tracking and are invisible to bank velocity algorithms.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-teal-600 font-bold mt-0.5 flex-shrink-0">2.</span>
            <p>
              <span className="font-semibold">Lower ongoing APRs:</span>{' '}
              CU business cards typically carry 10-18% APR vs. 20-29% at major banks — saving significant interest on carried balances.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-teal-600 font-bold mt-0.5 flex-shrink-0">3.</span>
            <p>
              <span className="font-semibold">Membership is accessible:</span>{' '}
              Most CUs are open to anyone via a small donation ($5-$15). Military-affiliated CUs like Navy Federal require service connection.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-teal-600 font-bold mt-0.5 flex-shrink-0">4.</span>
            <p>
              <span className="font-semibold">Apply AFTER major bank cards:</span>{' '}
              CUs process applications slower with independent inquiry tracking. Prioritize Chase, Amex, and Capital One first, then layer CU cards on top without velocity penalty.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-teal-600 font-bold mt-0.5 flex-shrink-0">5.</span>
            <p>
              <span className="font-semibold">Membership establishment takes 1-3 business days:</span>{' '}
              Factor this lead time into your application timeline. Open membership and savings account first, then wait for approval before applying for credit products.
            </p>
          </div>
        </div>

        {/* Bureau pull table */}
        <div className="rounded-lg border border-teal-200 bg-white overflow-hidden mt-3">
          <div className="px-3 py-2 bg-teal-100/50 border-b border-teal-200">
            <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Bureau Pull by Credit Union</p>
          </div>
          <div className="divide-y divide-teal-100">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-800">PenFed / Alliant / First Tech</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                TransUnion
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-800">Navy Federal / BECU / DCU</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                Equifax
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mock result data ─────────────────────────────────────────────────────────

const MOCK_RESULTS: Omit<CardRecommendationProps, 'rank'>[] = [
  {
    cardName: 'Ink Business Unlimited®',
    issuer: 'Chase',
    network: 'Visa',
    approvalProbability: 82,
    introApr: '0% for 12 months',
    ongoingApr: '18.49%–24.49%',
    creditLimitEstimate: '$10,000–$30,000',
    rewardsSummary: '1.5% cash back on all purchases',
    annualFee: '$0',
    scoreBreakdown: [
      { label: 'FICO alignment',   score: 91, weight: 0.35 },
      { label: 'Business revenue', score: 78, weight: 0.25 },
      { label: 'Issuer appetite',  score: 85, weight: 0.20 },
      { label: 'Utilization ratio',score: 72, weight: 0.20 },
    ],
  },
  {
    cardName: 'Blue Business Cash™',
    issuer: 'American Express',
    network: 'Amex',
    approvalProbability: 68,
    introApr: '0% for 15 months',
    ongoingApr: '19.49%–27.49%',
    creditLimitEstimate: '$5,000–$20,000',
    rewardsSummary: '2% cash back on first $50K/year',
    annualFee: '$0',
    warnings: [
      {
        rule: 'Amex Velocity (2/90)',
        severity: 'caution',
        explanation:
          'Amex typically limits approvals to 2 cards per 90-day window. You have 1 Amex card opened in the past 90 days.',
      },
    ],
    scoreBreakdown: [
      { label: 'FICO alignment',   score: 80, weight: 0.35 },
      { label: 'Business revenue', score: 74, weight: 0.25 },
      { label: 'Issuer appetite',  score: 62, weight: 0.20 },
      { label: 'Utilization ratio',score: 70, weight: 0.20 },
    ],
  },
  {
    cardName: 'Spark Cash Plus',
    issuer: 'Capital One',
    network: 'Mastercard',
    approvalProbability: 55,
    introApr: 'N/A (charge card)',
    ongoingApr: 'N/A',
    creditLimitEstimate: '$15,000–$50,000',
    rewardsSummary: '2% cash back on every purchase',
    annualFee: '$150',
    scoreBreakdown: [
      { label: 'FICO alignment',   score: 65, weight: 0.35 },
      { label: 'Business revenue', score: 71, weight: 0.25 },
      { label: 'Issuer appetite',  score: 58, weight: 0.20 },
      { label: 'Utilization ratio',score: 60, weight: 0.20 },
    ],
  },
  {
    cardName: 'Freedom Flex℠ Business',
    issuer: 'Chase',
    network: 'Visa',
    approvalProbability: 28,
    introApr: '0% for 15 months',
    ongoingApr: '20.49%–29.24%',
    creditLimitEstimate: '$2,000–$10,000',
    rewardsSummary: '5% on rotating quarterly categories',
    annualFee: '$0',
    warnings: [
      {
        rule: 'Chase 5/24',
        severity: 'block',
        explanation:
          'Chase denies applicants with 5+ new card accounts in the past 24 months. Profile shows 5 new accounts — this application will likely be auto-denied.',
      },
    ],
    scoreBreakdown: [
      { label: 'FICO alignment',    score: 45, weight: 0.35 },
      { label: 'Business revenue',  score: 60, weight: 0.25 },
      { label: 'Issuer appetite',   score: 20, weight: 0.20 },
      { label: 'Utilization ratio', score: 55, weight: 0.20 },
    ],
  },
];

const EXISTING_CARDS = [
  'Chase Sapphire Preferred',
  'Amex Platinum',
  'Capital One Venture X',
  'Citi Double Cash',
  'Discover it Business',
];

// ─── Network diversity ────────────────────────────────────────────────────────

interface NetworkSlice {
  network: string;
  count: number;
  color: string;
}

const NETWORK_DATA: NetworkSlice[] = [
  { network: 'Visa',       count: 3, color: '#1A56DB' },
  { network: 'Mastercard', count: 2, color: '#F97316' },
  { network: 'Amex',       count: 2, color: '#0A1628' },
  { network: 'Discover',   count: 1, color: '#D97706' },
];

function NetworkPieChart({ data }: { data: NetworkSlice[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  let cumAngle = -90; // start at top

  const slices = data.map((d) => {
    const angle = (d.count / total) * 360;
    const start = cumAngle;
    cumAngle += angle;
    return { ...d, startAngle: start, sweepAngle: angle };
  });

  function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(
    cx: number, cy: number, r: number,
    startAngle: number, endAngle: number,
  ) {
    const s = polarToXY(cx, cy, r, startAngle);
    const e = polarToXY(cx, cy, r, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
      `M ${cx} ${cy}`,
      `L ${s.x} ${s.y}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`,
      'Z',
    ].join(' ');
  }

  return (
    <div className="flex items-center gap-6">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-label="Network diversity chart">
        {slices.map((s) => (
          <path
            key={s.network}
            d={describeArc(48, 48, 44, s.startAngle, s.startAngle + s.sweepAngle)}
            fill={s.color}
            stroke="white"
            strokeWidth="2"
          />
        ))}
        {/* Donut hole */}
        <circle cx="48" cy="48" r="22" fill="white" />
        <text x="48" y="48" textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: '10px', fontWeight: 700, fill: '#0A1628' }}>
          {total}
        </text>
      </svg>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.network} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-gray-600 font-medium">{d.network}</span>
            <span className="text-gray-400 ml-auto pl-3">{d.count} cards</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sequencing timeline ──────────────────────────────────────────────────────

interface SequenceRound {
  round: number;
  label: string;
  cards: string[];
  waitPeriod: string;
  rationale: string;
}

const SEQUENCE_ROUNDS: SequenceRound[] = [
  {
    round: 1,
    label: 'Round 1 — Apply Now',
    cards: ['Ink Business Unlimited®', 'Blue Business Cash™'],
    waitPeriod: 'Wait 91 days',
    rationale: 'Apply simultaneously to Chase and Amex to avoid bureau pulls cross-contaminating velocity counts.',
  },
  {
    round: 2,
    label: 'Round 2 — Q3 2026',
    cards: ['Spark Cash Plus'],
    waitPeriod: 'Wait 6 months',
    rationale: 'Capital One prefers 6+ months between applications. Previous round\'s accounts will age favorably.',
  },
  {
    round: 3,
    label: 'Round 3 — Q1 2027',
    cards: ['Freedom Flex℠ Business'],
    waitPeriod: '—',
    rationale: 'Chase 5/24 window clears by Jan 2027. Apply after oldest new account drops off the 24-month count.',
  },
];

// ─── Issuer violations panel ──────────────────────────────────────────────────

interface ViolationEntry {
  rule: string;
  issuer: string;
  severity: 'block' | 'caution';
  detail: string;
  recommendation: string;
}

const VIOLATIONS: ViolationEntry[] = [
  {
    rule: 'Chase 5/24',
    issuer: 'Chase',
    severity: 'block',
    detail: 'You have opened 5 new credit accounts in the past 24 months. Chase auto-declines applicants above this threshold regardless of credit score.',
    recommendation: 'Wait until the oldest qualifying account exits the 24-month window (estimated Jan 2027) before applying for Chase products.',
  },
  {
    rule: 'Amex Velocity (2/90)',
    issuer: 'American Express',
    severity: 'caution',
    detail: '1 Amex card was opened 42 days ago. Amex restricts new approvals to 2 accounts per 90-day rolling window.',
    recommendation: 'Wait until Day 91 before applying for a second Amex card to avoid soft-block and preserve approval odds.',
  },
];

// ─── US states ───────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
] as const;

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};

// ─── Form state type ──────────────────────────────────────────────────────────

interface CUFormState {
  state: string;
  militaryStatus: 'active' | 'retired' | 'veteran' | 'family' | 'none';
  employer: string;
  techIndustry: boolean;
  existingMemberships: string[];
  stackedCUs: string[];
}

interface FormState {
  fico: string;
  selectedCards: string[];
  businessType: string;
  annualRevenue: string;
  yearsInBusiness: string;
  employees: string;
  targetFunding: string;
  selectedBusinessId: string;
  prioritizationMode: PrioritizationMode;
  maxCards: string;
  excludeIssuers: string[];
}

const INITIAL_FORM: FormState = {
  fico: '',
  selectedCards: ['Chase Sapphire Preferred', 'Amex Platinum'],
  businessType: 'LLC',
  annualRevenue: '',
  yearsInBusiness: '',
  employees: '',
  targetFunding: '',
  selectedBusinessId: '',
  prioritizationMode: 'max_credit',
  maxCards: '8',
  excludeIssuers: [],
};

const PRIORITIZATION_LABELS: Record<PrioritizationMode, string> = {
  max_credit: 'Maximum Credit',
  best_terms: 'Best Terms (APR)',
  fastest_approval: 'Fastest Approval',
  min_inquiries: 'Minimize Inquiries',
};

const ISSUER_OPTIONS = [
  'chase', 'amex', 'capital_one', 'citi', 'bank_of_america',
  'us_bank', 'wells_fargo', 'discover', 'td_bank', 'pnc',
];

const INITIAL_CU_FORM: CUFormState = {
  state: '',
  militaryStatus: 'none',
  employer: '',
  techIndustry: false,
  existingMemberships: [],
  stackedCUs: [],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OptimizerPage() {
  const [form, setForm]           = useState<FormState>(INITIAL_FORM);
  const [hasResults, setHasResults] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [apiError, setApiError]   = useState<string | null>(null);

  // Optimizer V2 API state
  const [clients, setClients]           = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [stackingPlan, setStackingPlan] = useState<ApiStackingPlan | null>(null);

  // Credit Union eligibility state
  const [cuForm, setCUForm]       = useState<CUFormState>(INITIAL_CU_FORM);
  const [cuPanelOpen, setCUPanelOpen] = useState(true);

  // Load clients on mount
  useEffect(() => {
    setClientsLoading(true);
    fetch('/api/v1/clients')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setClients(json.data.map((c: Record<string, unknown>) => ({
            id: c.id as string,
            businessName: (c.businessName || c.legalName || 'Unknown') as string,
            status: (c.status || 'unknown') as string,
          })));
        }
      })
      .catch(() => {
        // Silently fall back — clients list is optional
      })
      .finally(() => setClientsLoading(false));
  }, []);

  const cuEligibility = useMemo<EligibilityResult[]>(() => {
    if (!cuForm.state) return [];
    return checkCUEligibility(
      cuForm.state,
      cuForm.militaryStatus,
      cuForm.employer,
      cuForm.techIndustry,
    );
  }, [cuForm.state, cuForm.militaryStatus, cuForm.employer, cuForm.techIndustry]);

  function toggleCUMembership(cuId: string) {
    setCUForm((f) => ({
      ...f,
      existingMemberships: f.existingMemberships.includes(cuId)
        ? f.existingMemberships.filter((id) => id !== cuId)
        : [...f.existingMemberships, cuId],
    }));
  }

  function toggleStackCU(cuId: string) {
    setCUForm((f) => ({
      ...f,
      stackedCUs: f.stackedCUs.includes(cuId)
        ? f.stackedCUs.filter((id) => id !== cuId)
        : [...f.stackedCUs, cuId],
    }));
  }

  function toggleCard(card: string) {
    setForm((f) => ({
      ...f,
      selectedCards: f.selectedCards.includes(card)
        ? f.selectedCards.filter((c) => c !== card)
        : [...f.selectedCards, card],
    }));
  }

  const handleRun = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    setStackingPlan(null);

    // If a business is selected, call the V2 API
    if (form.selectedBusinessId) {
      try {
        const res = await fetch('/api/optimizer/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessId: form.selectedBusinessId,
            targetAmount: form.targetFunding ? Number(form.targetFunding) : 100000,
            maxCards: form.maxCards ? Number(form.maxCards) : 8,
            prioritize: form.prioritizationMode,
            excludeIssuers: form.excludeIssuers,
            includeCreditUnions: false,
          }),
        });

        const json = await res.json();

        if (json.success && json.data) {
          setStackingPlan(json.data as ApiStackingPlan);
          setHasResults(true);
        } else {
          setApiError(json.error?.message || 'Optimizer failed. Please try again.');
          // Fall back to mock results
          setHasResults(true);
        }
      } catch {
        setApiError('Unable to reach the optimizer API. Showing mock data.');
        setHasResults(true);
      }
    } else {
      // No business selected — use mock data (existing behavior)
      await new Promise((r) => setTimeout(r, 1200));
      setHasResults(true);
    }

    setLoading(false);
  }, [form.selectedBusinessId, form.targetFunding, form.maxCards, form.prioritizationMode, form.excludeIssuers]);

  return (
    <div className="space-y-8">
      {/* ── Page header ──────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stacking Optimizer</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Model approval probability, issuer rules, and sequencing for maximum credit capacity.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left column: input form (1/3) ──────────────── */}
        <div className="xl:col-span-1 space-y-5">
          {/* Business Selector */}
          <SectionCard title="Business / Client" subtitle="Select a client to load their data for optimization">
            <div className="space-y-4">
              <FormField label="Select Business">
                <select
                  value={form.selectedBusinessId}
                  onChange={(e) => setForm({ ...form, selectedBusinessId: e.target.value })}
                  className="cf-input"
                  disabled={clientsLoading}
                >
                  <option value="">-- Manual entry (mock) --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} ({c.status})
                    </option>
                  ))}
                </select>
              </FormField>
              {form.selectedBusinessId && (
                <p className="text-xs text-emerald-600 font-medium">
                  Business selected — optimizer will load profile from database.
                </p>
              )}
            </div>
          </SectionCard>

          {/* Prioritization Mode */}
          <SectionCard title="Optimization Strategy" subtitle="How to rank and sequence card recommendations">
            <div className="space-y-4">
              <FormField label="Prioritization Mode">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(PRIORITIZATION_LABELS) as [PrioritizationMode, string][]).map(
                    ([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm({ ...form, prioritizationMode: mode })}
                        className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
                          form.prioritizationMode === mode
                            ? 'bg-brand-navy text-white border-brand-navy'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-brand-navy/30'
                        }`}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </FormField>

              <FormField label="Max Cards">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.maxCards}
                  onChange={(e) => setForm({ ...form, maxCards: e.target.value })}
                  className="cf-input"
                />
              </FormField>

              <FormField label="Exclude Issuers">
                <div className="flex flex-wrap gap-2 mt-1">
                  {ISSUER_OPTIONS.map((issuer) => (
                    <label key={issuer} className="flex items-center gap-1.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.excludeIssuers.includes(issuer)}
                        onChange={() =>
                          setForm((f) => ({
                            ...f,
                            excludeIssuers: f.excludeIssuers.includes(issuer)
                              ? f.excludeIssuers.filter((i) => i !== issuer)
                              : [...f.excludeIssuers, issuer],
                          }))
                        }
                        className="w-3.5 h-3.5 rounded border-gray-300 text-brand-navy focus:ring-brand-navy/30"
                      />
                      <span className="text-xs text-gray-700 group-hover:text-gray-900 transition-colors capitalize">
                        {issuer.replace(/_/g, ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </FormField>
            </div>
          </SectionCard>

          {/* FICO + Revenue */}
          <SectionCard title="Credit Profile" subtitle="Applicant FICO and financial snapshot">
            <div className="space-y-4">
              <FormField label="Personal FICO Score">
                <input
                  type="number"
                  min={300}
                  max={850}
                  placeholder="e.g. 760"
                  value={form.fico}
                  onChange={(e) => setForm({ ...form, fico: e.target.value })}
                  className="cf-input"
                />
              </FormField>

              <FormField label="Annual Business Revenue">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    placeholder="e.g. 500000"
                    value={form.annualRevenue}
                    onChange={(e) => setForm({ ...form, annualRevenue: e.target.value })}
                    className="cf-input pl-7"
                  />
                </div>
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Years in Business">
                  <input
                    type="number"
                    min={0}
                    placeholder="2"
                    value={form.yearsInBusiness}
                    onChange={(e) => setForm({ ...form, yearsInBusiness: e.target.value })}
                    className="cf-input"
                  />
                </FormField>
                <FormField label="Employees">
                  <input
                    type="number"
                    min={1}
                    placeholder="10"
                    value={form.employees}
                    onChange={(e) => setForm({ ...form, employees: e.target.value })}
                    className="cf-input"
                  />
                </FormField>
              </div>
            </div>
          </SectionCard>

          {/* Business Profile */}
          <SectionCard title="Business Profile">
            <div className="space-y-4">
              <FormField label="Entity Type">
                <select
                  value={form.businessType}
                  onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                  className="cf-input"
                >
                  {['LLC', 'S-Corp', 'C-Corp', 'Sole Proprietor', 'Partnership'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Target Credit Funding">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    placeholder="e.g. 100000"
                    value={form.targetFunding}
                    onChange={(e) => setForm({ ...form, targetFunding: e.target.value })}
                    className="cf-input pl-7"
                  />
                </div>
              </FormField>
            </div>
          </SectionCard>

          {/* Existing cards */}
          <SectionCard title="Existing Cards" subtitle="Select all cards currently open">
            <div className="space-y-2">
              {EXISTING_CARDS.map((card) => (
                <label key={card} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.selectedCards.includes(card)}
                    onChange={() => toggleCard(card)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-navy focus:ring-brand-navy/30"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                    {card}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {form.selectedCards.length} card{form.selectedCards.length !== 1 ? 's' : ''} selected
            </p>
          </SectionCard>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={loading}
            className={`
              w-full py-3 rounded-xl font-semibold text-sm transition-all duration-150
              ${loading
                ? 'bg-brand-navy/60 text-white/60 cursor-not-allowed'
                : 'bg-brand-navy text-white hover:bg-brand-navy-800 shadow-md hover:shadow-lg'}
            `}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Optimizing…
              </span>
            ) : (
              'Run Optimization'
            )}
          </button>
        </div>

        {/* ── Right column: results (2/3) ─────────────────── */}
        <div className="xl:col-span-2 space-y-6">
          {/* ── Credit Union Eligibility (always visible) ── */}
          <div className="rounded-xl border border-surface-border bg-white shadow-card overflow-hidden">
            <button
              onClick={() => setCUPanelOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="text-left">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  Credit Union Eligibility
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-navy/10 text-brand-navy border border-brand-navy/15">
                    6 CUs
                  </span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Check membership eligibility and add credit union cards to your stacking strategy
                </p>
              </div>
              <span className={`text-gray-400 text-sm transition-transform duration-200 ${cuPanelOpen ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>

            {cuPanelOpen && (
              <div className="border-t border-surface-border px-5 py-5 space-y-5">
                {/* ── Eligibility Form ────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="State of Residence">
                    <select
                      value={cuForm.state}
                      onChange={(e) => setCUForm({ ...cuForm, state: e.target.value })}
                      className="cf-input"
                    >
                      <option value="">Select state…</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>{s} — {STATE_NAMES[s]}</option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Military Status">
                    <div className="flex flex-wrap gap-2 mt-1">
                      {([
                        ['active', 'Active'],
                        ['retired', 'Retired'],
                        ['veteran', 'Veteran'],
                        ['family', 'Family'],
                        ['none', 'None'],
                      ] as const).map(([value, label]) => (
                        <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="militaryStatus"
                            value={value}
                            checked={cuForm.militaryStatus === value}
                            onChange={() => setCUForm({ ...cuForm, militaryStatus: value })}
                            className="w-3.5 h-3.5 text-brand-navy focus:ring-brand-navy/30"
                          />
                          <span className="text-xs text-gray-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </FormField>

                  <FormField label="Employer">
                    <input
                      type="text"
                      placeholder="e.g. Microsoft, Intel, Boeing"
                      value={cuForm.employer}
                      onChange={(e) => setCUForm({ ...cuForm, employer: e.target.value })}
                      className="cf-input"
                    />
                  </FormField>

                  <FormField label="Tech Industry">
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={cuForm.techIndustry}
                        onClick={() => setCUForm({ ...cuForm, techIndustry: !cuForm.techIndustry })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          cuForm.techIndustry ? 'bg-brand-navy' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                            cuForm.techIndustry ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <span className="text-xs text-gray-600">
                        {cuForm.techIndustry ? 'Yes — tech industry' : 'No'}
                      </span>
                    </div>
                  </FormField>
                </div>

                {/* Existing CU Memberships */}
                <FormField label="Existing Credit Union Memberships">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {CREDIT_UNION_ISSUERS.map((cu) => (
                      <label key={cu.id} className="flex items-center gap-1.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={cuForm.existingMemberships.includes(cu.id)}
                          onChange={() => toggleCUMembership(cu.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-brand-navy focus:ring-brand-navy/30"
                        />
                        <span className="text-xs text-gray-700 group-hover:text-gray-900 transition-colors">
                          {cu.name.split(' ').slice(0, 2).join(' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </FormField>

                {/* ── Results Panel ────────────────────── */}
                {cuForm.state && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700">Eligibility Results</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {cuEligibility.map((result) => {
                        const isStacked = cuForm.stackedCUs.includes(result.cu.id);
                        const isMember = cuForm.existingMemberships.includes(result.cu.id);
                        const isDCU = result.cu.id === 'dcu';
                        return (
                          <div
                            key={result.cu.id}
                            className={`rounded-xl border p-4 transition-all ${
                              result.eligible
                                ? isDCU
                                  ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                                  : 'bg-white border-gray-200 hover:border-brand-navy/30'
                                : 'bg-gray-50 border-gray-200 opacity-70'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-semibold ${result.eligible ? 'text-gray-900' : 'text-gray-500'}`}>
                                    {result.cu.name.split('(')[0].trim().split(' ').slice(0, 2).join(' ')}
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    result.cu.tier === 'A'
                                      ? 'bg-brand-navy/10 text-brand-navy'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    Tier {result.cu.tier}
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-0.5">{result.cu.businessCard.name}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`text-xs font-bold ${result.eligible ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {result.eligible ? '✓ Eligible' : '✕ Not eligible'}
                                </span>
                                {isDCU && result.eligible && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    RECOMMEND
                                  </span>
                                )}
                              </div>
                            </div>

                            <p className="text-xs text-gray-500 mb-2 leading-relaxed">{result.reason}</p>

                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-3">
                                <span className="text-gray-500">
                                  APR: <span className="font-semibold text-gray-700">{result.cu.businessCard.ongoingApr}%</span>
                                </span>
                                <span className="text-gray-500">
                                  FICO: <span className="font-semibold text-gray-700">{result.cu.businessCard.minFico}+</span>
                                </span>
                                {result.cost > 0 && (
                                  <span className="text-gray-500">
                                    Cost: <span className="font-semibold text-gray-700">${result.cost}</span>
                                  </span>
                                )}
                              </div>
                              {result.eligible && !isMember && (
                                <button
                                  onClick={() => toggleStackCU(result.cu.id)}
                                  className={`text-[11px] font-semibold px-3 py-1 rounded-lg transition-all ${
                                    isStacked
                                      ? 'bg-brand-navy text-white'
                                      : 'bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20'
                                  }`}
                                >
                                  {isStacked ? '✓ In Stack' : 'Add to Stack'}
                                </button>
                              )}
                              {isMember && (
                                <span className="text-[11px] font-semibold text-emerald-600">✓ Member</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Membership Action Plan ──────────── */}
                {cuForm.stackedCUs.length > 0 && (
                  <div className="rounded-xl border border-brand-navy/20 bg-brand-navy/5 p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-brand-navy flex items-center gap-2">
                      Membership Action Plan
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-navy/10 text-brand-navy">
                        {cuForm.stackedCUs.length} CU{cuForm.stackedCUs.length !== 1 ? 's' : ''}
                      </span>
                    </h3>
                    <div className="space-y-3">
                      {cuForm.stackedCUs.map((cuId, idx) => {
                        const result = cuEligibility.find((r) => r.cu.id === cuId);
                        if (!result) return null;
                        const cu = result.cu;
                        return (
                          <div key={cuId} className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-navy text-white flex items-center justify-center text-xs font-bold mt-0.5">
                              {idx + 1}
                            </div>
                            <div className="flex-1 space-y-1">
                              <p className="text-sm font-semibold text-gray-900">
                                Join {cu.name}
                                {cu.id === 'dcu' && <span className="text-emerald-600 ml-1">(Best APR)</span>}
                              </p>
                              <div className="space-y-0.5">
                                <p className="text-xs text-gray-600">
                                  <span className="font-medium">Step 1:</span> Visit {cu.name.toLowerCase().replace(/\s/g, '')}.org and apply for membership
                                </p>
                                <p className="text-xs text-gray-600">
                                  <span className="font-medium">Step 2:</span> Open primary savings account ($5 minimum deposit)
                                </p>
                                <p className="text-xs text-gray-600">
                                  <span className="font-medium">Step 3:</span> Wait 30 days, then apply for {cu.businessCard.name}
                                </p>
                              </div>
                              <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-1">
                                <span>Est. time: <span className="font-semibold text-gray-700">30–45 days</span></span>
                                <span>Cost: <span className="font-semibold text-gray-700">${result.cost + 5}</span> (membership + $5 savings)</span>
                                <span>Credit unlocked: <span className="font-semibold text-gray-700">{cu.businessCard.limitRange}</span></span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="rounded-lg bg-white/60 border border-brand-navy/10 px-3 py-2.5 mt-2">
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold text-brand-navy">Total estimated cost:</span>{' '}
                        ${cuForm.stackedCUs.reduce((sum, cuId) => {
                          const r = cuEligibility.find((e) => e.cu.id === cuId);
                          return sum + (r ? r.cost + 5 : 0);
                        }, 0)}{' '}
                        — <span className="font-semibold text-brand-navy">Timeline:</span> 30–45 days before first CU card application
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Credit Union Strategy Panel (when CU cards are in stack) ── */}
          {cuForm.stackedCUs.length > 0 && hasResults && (
            <CreditUnionStrategyPanel />
          )}

          {/* ── API Error Banner ────────────────────────── */}
          {apiError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-700 font-medium">{apiError}</p>
            </div>
          )}

          {!hasResults ? (
            <EmptyState />
          ) : stackingPlan ? (
            <>
              {/* ── Velocity Risk + Summary ──────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard
                  label="Total Est. Credit"
                  value={`$${stackingPlan.totalEstimatedCreditTypical.toLocaleString()}`}
                  sublabel={`$${stackingPlan.totalEstimatedCreditMin.toLocaleString()} – $${stackingPlan.totalEstimatedCreditMax.toLocaleString()}`}
                />
                <SummaryCard
                  label="Cards Recommended"
                  value={String(stackingPlan.cardCount)}
                  sublabel={`Mode: ${PRIORITIZATION_LABELS[stackingPlan.prioritizationMode]}`}
                />
                <div className="rounded-xl border border-surface-border bg-white shadow-card p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Velocity Risk</p>
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl font-bold ${
                      stackingPlan.velocityRiskLevel === 'low' ? 'text-emerald-600' :
                      stackingPlan.velocityRiskLevel === 'medium' ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {stackingPlan.velocityRiskScore}
                    </span>
                    <VelocityBadge level={stackingPlan.velocityRiskLevel} />
                  </div>
                </div>
              </div>

              {/* ── Card Recommendations from API ────────── */}
              <SectionCard
                title="Card Recommendations"
                subtitle={`Ranked by ${PRIORITIZATION_LABELS[stackingPlan.prioritizationMode].toLowerCase()} strategy`}
              >
                <div className="space-y-4 p-0">
                  {stackingPlan.recommendations.map((rec) => (
                    <ApiCardRecommendationCard key={rec.cardProductId} rec={rec} />
                  ))}
                </div>
              </SectionCard>

              {/* ── Excluded Cards ────────────────────────── */}
              {stackingPlan.excludedCards.length > 0 && (
                <SectionCard
                  title="Excluded Cards"
                  subtitle="Cards not eligible based on your profile"
                >
                  <div className="space-y-2">
                    {stackingPlan.excludedCards.map((ec) => (
                      <div key={ec.cardProductId} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-gray-700">{ec.name}</span>
                          <span className="text-xs text-gray-400 capitalize">{ec.issuer.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-xs text-gray-500">{ec.reason}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* ── APR Expiry Summary ────────────────────── */}
              {stackingPlan.aprExpirySummary.length > 0 && (
                <SectionCard
                  title="APR Expiry Timeline"
                  subtitle="When intro 0% APR periods expire for recommended cards"
                >
                  <div className="space-y-2">
                    {stackingPlan.aprExpirySummary.map((apr) => (
                      <div key={apr.cardName} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
                        <div>
                          <span className="text-sm font-semibold text-gray-800">{apr.cardName}</span>
                          <span className="text-xs text-gray-400 ml-2">{apr.introMonths} months @ 0%</span>
                        </div>
                        <span className="text-xs font-semibold text-amber-600">
                          Expires: {new Date(apr.expiryEstimate).toLocaleDateString('en-US', {
                            month: 'short', year: 'numeric',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* ── Sequencing Timeline + Network Diversity ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2">
                  <SectionCard
                    title="Application Sequencing"
                    subtitle="Recommended order with cooldown periods"
                  >
                    <div className="relative">
                      <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200" aria-hidden="true" />
                      <div className="space-y-6 pl-10">
                        {stackingPlan.recommendations.map((rec) => (
                          <ApiSequenceStep key={rec.cardProductId} rec={rec} />
                        ))}
                      </div>
                    </div>
                  </SectionCard>
                </div>

                <div>
                  <SectionCard
                    title="Network Diversity"
                    subtitle="Current card network spread"
                  >
                    <NetworkPieChart data={NETWORK_DATA} />
                    <div className="mt-4 rounded-lg bg-brand-navy/5 border border-brand-navy/10 px-3 py-2.5">
                      <p className="text-xs text-brand-navy font-semibold mb-0.5">Recommendation</p>
                      <p className="text-xs text-gray-600">
                        Add a Discover card to broaden acceptance coverage and reduce single-network exposure.
                      </p>
                    </div>
                  </SectionCard>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* ── Fallback: Mock Card Recommendations ───── */}
              <SectionCard
                title="Card Recommendations"
                subtitle="Ranked by modeled approval probability given your profile"
              >
                <div className="space-y-4 p-0">
                  {MOCK_RESULTS.map((card, i) => (
                    <CardRecommendation key={card.cardName} rank={i + 1} {...card} />
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title="Issuer Rule Violations"
                subtitle="Policy limits that may affect approval outcomes"
              >
                <div className="space-y-4">
                  {VIOLATIONS.map((v) => (
                    <ViolationCard key={v.rule} violation={v} />
                  ))}
                </div>
              </SectionCard>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2">
                  <SectionCard
                    title="Multi-Round Sequencing"
                    subtitle="Optimal application order to maximize approvals"
                  >
                    <div className="relative">
                      <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200" aria-hidden="true" />
                      <div className="space-y-6 pl-10">
                        {SEQUENCE_ROUNDS.map((r) => (
                          <SequenceStep key={r.round} step={r} />
                        ))}
                      </div>
                    </div>
                  </SectionCard>
                </div>

                <div>
                  <SectionCard
                    title="Network Diversity"
                    subtitle="Current card network spread"
                  >
                    <NetworkPieChart data={NETWORK_DATA} />
                    <div className="mt-4 rounded-lg bg-brand-navy/5 border border-brand-navy/10 px-3 py-2.5">
                      <p className="text-xs text-brand-navy font-semibold mb-0.5">Recommendation</p>
                      <p className="text-xs text-gray-600">
                        Add a Discover card to broaden acceptance coverage and reduce single-network exposure.
                      </p>
                    </div>
                  </SectionCard>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Form field wrapper ───────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 bg-white rounded-xl border border-surface-border shadow-card">
      <div className="w-14 h-14 rounded-2xl bg-brand-navy/5 flex items-center justify-center mb-4 text-2xl">
        OPT
      </div>
      <h3 className="text-base font-semibold text-gray-700 mb-1">No Optimization Run Yet</h3>
      <p className="text-sm text-gray-400 max-w-xs">
        Complete the profile form and click "Run Optimization" to see ranked card recommendations,
        issuer rule analysis, and sequencing guidance.
      </p>
    </div>
  );
}

// ─── Violation card ───────────────────────────────────────────────────────────

function ViolationCard({ violation }: { violation: ViolationEntry }) {
  const isBlock = violation.severity === 'block';
  return (
    <div
      className={`rounded-xl border p-4 ${isBlock ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`font-bold text-sm ${isBlock ? 'text-red-700' : 'text-amber-700'}`}>
          {isBlock ? '✕' : '⚠'} {violation.rule}
        </span>
        <span className={`text-xs font-medium ${isBlock ? 'text-red-500' : 'text-amber-500'}`}>
          — {violation.issuer}
        </span>
        <span
          className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border
            ${isBlock ? 'bg-red-100 text-red-700 border-red-300' : 'bg-amber-100 text-amber-700 border-amber-300'}`}
        >
          {isBlock ? 'BLOCK' : 'CAUTION'}
        </span>
      </div>
      <p className={`text-xs mb-2 leading-relaxed ${isBlock ? 'text-red-700' : 'text-amber-700'}`}>
        {violation.detail}
      </p>
      <div className={`rounded-lg px-3 py-2 ${isBlock ? 'bg-red-100/60 border border-red-200' : 'bg-amber-100/60 border border-amber-200'}`}>
        <p className={`text-xs font-semibold mb-0.5 ${isBlock ? 'text-red-800' : 'text-amber-800'}`}>
          Recommendation
        </p>
        <p className={`text-xs ${isBlock ? 'text-red-700' : 'text-amber-700'}`}>
          {violation.recommendation}
        </p>
      </div>
    </div>
  );
}

// ─── Sequence step ────────────────────────────────────────────────────────────

function SequenceStep({ step }: { step: SequenceRound }) {
  return (
    <div className="relative">
      {/* Dot on the timeline */}
      <div className="absolute -left-[26px] top-1 w-3.5 h-3.5 rounded-full bg-brand-navy border-2 border-white shadow-sm" />
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-gray-900">{step.label}</p>
        <div className="flex flex-wrap gap-1.5">
          {step.cards.map((c) => (
            <span
              key={c}
              className="text-xs bg-brand-navy/10 text-brand-navy px-2 py-0.5 rounded-full font-medium border border-brand-navy/15"
            >
              {c}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{step.rationale}</p>
        {step.waitPeriod !== '—' && (
          <p className="text-xs font-semibold text-brand-gold-600 mt-1">
            — {step.waitPeriod}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── V2 API result components ────────────────────────────────────────────────

function SummaryCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-white shadow-card p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
    </div>
  );
}

function VelocityBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const config = {
    low: { bg: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'LOW RISK' },
    medium: { bg: 'bg-amber-100 text-amber-700 border-amber-200', label: 'MODERATE RISK' },
    high: { bg: 'bg-red-100 text-red-700 border-red-200', label: 'HIGH RISK' },
  };
  const c = config[level];
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.bg}`}>
      {c.label}
    </span>
  );
}

function EligibilityBar({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-brand-gold' : score >= 30 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-8 text-right">{score}</span>
    </div>
  );
}

function ApiCardRecommendationCard({ rec }: { rec: ApiCardRecommendation }) {
  const isCU = isCreditUnionIssuer(rec.issuer);
  const bureauPull = isCU ? getCUBureauPull(rec.issuer) : null;
  const cuId = isCU ? getCUIdFromIssuer(rec.issuer) : null;
  const cuData = cuId ? CREDIT_UNION_ISSUERS.find((cu) => cu.id === cuId) : null;

  return (
    <div className={`rounded-xl border bg-white p-4 hover:border-brand-navy/20 transition-all ${
      isCU ? 'border-teal-200' : 'border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-navy/10 flex items-center justify-center text-sm font-bold text-brand-navy">
            {rec.sequencePosition}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-900">{rec.name}</h4>
              {isCU && (
                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border bg-teal-50 text-teal-700 border-teal-200">
                  CU
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 capitalize">{rec.issuer.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <VelocityBadge level={rec.velocityRisk} />
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            rec.approvalDifficulty === 'easy' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            rec.approvalDifficulty === 'moderate' ? 'bg-blue-50 text-blue-700 border-blue-200' :
            rec.approvalDifficulty === 'hard' ? 'bg-amber-50 text-amber-700 border-amber-200' :
            'bg-red-50 text-red-700 border-red-200'
          }`}>
            {rec.approvalDifficulty.toUpperCase().replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Eligibility score bar */}
      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-1">Eligibility Score</p>
        <EligibilityBar score={rec.eligibilityScore} />
      </div>

      {/* Key details grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
        <div>
          <p className="text-gray-400 font-medium">Credit Limit</p>
          <p className="text-gray-800 font-semibold">
            ${rec.estimatedLimitMin.toLocaleString()} – ${rec.estimatedLimitMax > 0 ? `$${rec.estimatedLimitMax.toLocaleString()}` : 'No limit'}
          </p>
        </div>
        <div>
          <p className="text-gray-400 font-medium">Intro APR</p>
          <p className="text-gray-800 font-semibold">
            {rec.aprIntro !== null && rec.aprIntro === 0 && rec.aprIntroMonths
              ? `0% for ${rec.aprIntroMonths}mo`
              : rec.cardType === 'business_charge' ? 'N/A (charge)' : 'None'}
          </p>
        </div>
        <div>
          <p className="text-gray-400 font-medium">Annual Fee</p>
          <p className="text-gray-800 font-semibold">${rec.annualFee}</p>
        </div>
        <div>
          <p className="text-gray-400 font-medium">Rewards</p>
          <p className="text-gray-800 font-semibold">
            {rec.rewardsRate ? `${rec.rewardsRate}% ${rec.rewardsType?.replace(/_/g, ' ') ?? ''}` : 'None'}
          </p>
        </div>
      </div>

      {/* Rationale */}
      <p className="text-xs text-gray-500 leading-relaxed">{rec.rationale}</p>

      {/* Cooldown */}
      {rec.cooldownDays > 0 && (
        <div className="mt-2 rounded-lg bg-brand-navy/5 border border-brand-navy/10 px-3 py-1.5">
          <p className="text-xs text-brand-navy font-semibold">
            Wait {rec.cooldownDays} days before this application
          </p>
        </div>
      )}

      {/* Credit Union details */}
      {isCU && (
        <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-3">
            {bureauPull && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Bureau:</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                  {bureauPull}
                </span>
              </div>
            )}
            {cuData && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Membership:</span>
                <span className="text-[10px] font-semibold text-teal-800">
                  {cuData.membershipCost > 0 ? `$${cuData.membershipCost}` : 'Free'}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-teal-700 leading-relaxed">
            {cuData
              ? `Membership establishment takes 1-3 business days. ${cuData.membershipEligibility[0]}. Does not count against Chase 5/24 or Amex velocity limits.`
              : 'CU cards do not count against Chase 5/24 or Amex velocity limits. Apply after major bank cards.'}
          </p>
        </div>
      )}
    </div>
  );
}

function ApiSequenceStep({ rec }: { rec: ApiCardRecommendation }) {
  return (
    <div className="relative">
      <div className="absolute -left-[26px] top-1 w-3.5 h-3.5 rounded-full bg-brand-navy border-2 border-white shadow-sm" />
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-gray-900">
          Step {rec.sequencePosition} — {rec.name}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs bg-brand-navy/10 text-brand-navy px-2 py-0.5 rounded-full font-medium border border-brand-navy/15 capitalize">
            {rec.issuer.replace(/_/g, ' ')}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
            rec.velocityRisk === 'low' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            rec.velocityRisk === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
            'bg-red-50 text-red-700 border-red-200'
          }`}>
            {rec.velocityRisk} risk
          </span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{rec.rationale}</p>
        {rec.cooldownDays > 0 && (
          <p className="text-xs font-semibold text-brand-gold-600 mt-1">
            -- Wait {rec.cooldownDays} days
          </p>
        )}
      </div>
    </div>
  );
}
