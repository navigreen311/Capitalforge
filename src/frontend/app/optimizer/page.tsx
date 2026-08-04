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
import { fetchAllPages } from '@/lib/fetch-all-pages';
import { loadJson, toLoadError } from '@/lib/load-json';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { useToast } from '@/components/global/ToastProvider';

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
  /** 'issuer_rule' when the wait reflects a published rule; otherwise a bare default. */
  cooldownSource?: 'issuer_rule' | 'unresearched_default';
  /** Credit union cards only: whether the client can actually apply. */
  membership?: {
    status: 'member' | 'eligibility_path' | 'unknown' | 'ineligible';
    detail: string;
    gate?: 'open_enrollment' | 'qualification_required';
    joinCost?: number;
  };
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
  inputProvenance: ApiInputProvenance;
  capacity?: ApiCapacity;
  velocitySummary?: ApiVelocitySummary;
}

interface ApiVelocitySummary {
  cardsCountingToward524: number;
  cardsExemptFrom524: number;
  cardsNotEvaluated: number;
  chase524HeadroomBefore: number;
  chase524HeadroomAfter: number;
  chase524Overage: number;
  exceedsChase524: boolean;
  existingBankCardsInWindow: number;
  existingCreditUnionCardsInWindow: number;
}

interface ApiCapacity {
  targetAmount: number;
  bankEstimatedCredit: number;
  creditUnionEstimatedCredit: number;
  shortfallAfterBanks: number;
  remainingShortfall: number;
  creditUnionsIncluded: boolean;
  creditUnionCardLimit: number;
  bankCardCount: number;
  creditUnionCardCount: number;
}

// ─── Where each input came from ───────────────────────────────────────────────

type ApiInputSource =
  | 'advisor_entered'
  | 'bureau_pull'
  | 'client_record'
  | 'assumed_default';

interface ApiResolvedInput {
  value: number | null;
  source: ApiInputSource;
  label: string;
  pulledAt?: string;
  /** Where one source label would misrepresent the value. */
  detail?: string;
  /** False when the optimizer collects this value but does not read it. */
  influencesPlan?: boolean;
}

interface ApiInputProvenance {
  ficoScore: ApiResolvedInput;
  annualRevenue: ApiResolvedInput;
  businessAgeMonths: ApiResolvedInput;
  recentInquiries: ApiResolvedInput;
  derogatoryMarks: ApiResolvedInput;
  existingCardCount: ApiResolvedInput;
  collectedNotUsed?: ApiResolvedInput[];
  assumedDefaults: string[];
  hasAssumedDefaults: boolean;
}

const SOURCE_LABEL: Record<ApiInputSource, string> = {
  advisor_entered: 'Entered by advisor',
  bureau_pull: 'Credit pull',
  client_record: 'Client record',
  assumed_default: 'Assumed',
};

const SOURCE_STYLE: Record<ApiInputSource, string> = {
  advisor_entered: 'bg-blue-50 text-blue-700 border-blue-200',
  bureau_pull: 'bg-green-50 text-green-700 border-green-200',
  client_record: 'bg-gray-100 text-gray-600 border-gray-300',
  assumed_default: 'bg-amber-50 text-amber-800 border-amber-300',
};

/** Values that read better with units than as bare numbers. */
function formatProvenanceValue(key: string, value: number | null): string {
  if (value === null) return 'Not entered';
  if (key === 'annualRevenue') return `$${value.toLocaleString()}`;
  if (key === 'businessAgeMonths') return `${value} months`;
  return String(value);
}

/**
 * Marks an input the optimizer collects but does not yet read.
 *
 * An advisor who types PAYDEX 72 concludes it shaped the plan. It did not — the
 * scorer reads FICO, revenue, business age, inquiries and existing cards, and
 * nothing else. Saying so on the field is the same principle as labelling an
 * assumed default: the alternative is a control that looks like it matters.
 */
function NotYetUsed() {
  return (
    <span className="ml-2 rounded-full border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">
      Not used in scoring yet
    </span>
  );
}

function formatCurrencyShort(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function InputsUsedPanel({ provenance }: { provenance: ApiInputProvenance }) {
  const rows: Array<[string, ApiResolvedInput]> = [
    ['ficoScore', provenance.ficoScore],
    ['annualRevenue', provenance.annualRevenue],
    ['businessAgeMonths', provenance.businessAgeMonths],
    ['recentInquiries', provenance.recentInquiries],
    ['derogatoryMarks', provenance.derogatoryMarks],
    ['existingCardCount', provenance.existingCardCount],
  ];

  return (
    <div className="space-y-4">
      {/*
        A plan resting on constants is an estimate, and used to be presented
        exactly like one built on a credit pull. This says which it is before
        the recommendations are read, not after they are acted on.
      */}
      {provenance.hasAssumedDefaults && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900"
        >
          <p className="font-semibold">
            Estimate only — built on assumed values for:{' '}
            {provenance.assumedDefaults.join(', ')}.
          </p>
          <p className="mt-1 text-amber-800">
            Pull credit for an accurate plan.
          </p>
        </div>
      )}

      <SectionCard title="Inputs Used" subtitle="What this plan was built on">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-2 pr-4 font-semibold">Input</th>
                <th className="pb-2 pr-4 font-semibold">Value</th>
                <th className="pb-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, row]) => (
                /*
                  A value the scorer never reads is greyed and struck. An
                  advisor scanning this panel to decide whether to trust the
                  plan should see at a glance which numbers shaped it — before
                  this, an unused input sat in the same type as a decisive one
                  and the panel vouched for both.
                */
                <tr
                  key={key}
                  className={`border-t border-gray-100 ${
                    row.influencesPlan === false ? 'opacity-60' : ''
                  }`}
                >
                  <td className="py-2 pr-4 text-gray-700">
                    {row.label}
                    {row.influencesPlan === false && (
                      <span className="ml-2 rounded-full border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">
                        Not used
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 pr-4 font-semibold ${
                      row.influencesPlan === false
                        ? 'text-gray-400 line-through'
                        : 'text-gray-900'
                    }`}
                  >
                    {formatProvenanceValue(key, row.value)}
                  </td>
                  <td className="py-2">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${SOURCE_STYLE[row.source]}`}
                    >
                      {SOURCE_LABEL[row.source]}
                    </span>
                    {row.pulledAt && (
                      <span className="ml-2 text-xs text-gray-500">
                        pulled {row.pulledAt.slice(0, 10)}
                      </span>
                    )}
                    {/* Two sources, both named — a single label here made a
                        true number read as a contradiction. */}
                    {row.detail && (
                      <span className="ml-2 text-xs text-gray-500">{row.detail}</span>
                    )}
                  </td>
                </tr>
              ))}
              {(provenance.collectedNotUsed ?? []).map((row) => (
                <tr key={row.label} className="border-t border-gray-100 opacity-60">
                  <td className="py-2 pr-4 text-gray-700">
                    {row.label}
                    <span className="ml-2 rounded-full border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">
                      Not used
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-semibold text-gray-400 line-through">
                    {formatProvenanceValue(row.label, row.value)}
                  </td>
                  <td className="py-2 text-xs text-gray-500">Collected, not read by the scorer</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Struck-through values are recorded with the plan but do not affect the
          recommendations. They are shown so a value you entered is never simply
          missing from this panel.
        </p>
      </SectionCard>
    </div>
  );
}

// ─── Credit Union bureau pull mapping & helpers ─────────────────────────────

const CU_BUREAU_PULLS: Record<string, string> = {
  'penfed':        'TransUnion',
  'alliant':       'TransUnion',
  'first-tech':    'TransUnion',
  'navy-federal':  'Equifax',
  'becu':          'Equifax',
  'lake-michigan': 'Equifax',
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
    lower === 'first tech' ||
    lower === 'becu' ||
    lower === 'lake michigan' ||
    lower.includes('lake michigan')
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
                <span className="text-xs font-semibold text-gray-800">Navy Federal / BECU / DCU / Lake Michigan</span>
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
    cardName: 'Chase Ink Business Preferred',
    issuer: 'Chase',
    network: 'Visa',
    approvalProbability: 87,
    introApr: '0% for 12 months',
    ongoingApr: '21.24%–26.24%',
    creditLimitEstimate: '$15,000–$50,000',
    rewardsSummary: '3x points on travel & select categories',
    annualFee: '$95',
    warnings: [
      {
        rule: 'Chase 5/24',
        severity: 'caution',
        explanation:
          'You have 3 new cards in the past 24 months — 2 slots remaining under the Chase 5/24 rule.',
      },
    ],
    scoreBreakdown: [
      { label: 'FICO alignment',   score: 92, weight: 0.35 },
      { label: 'Business revenue', score: 85, weight: 0.25 },
      { label: 'Issuer appetite',  score: 88, weight: 0.20 },
      { label: 'Utilization ratio',score: 78, weight: 0.20 },
    ],
  },
  {
    cardName: 'Amex Business Gold Card',
    issuer: 'American Express',
    network: 'Amex',
    approvalProbability: 82,
    introApr: 'N/A (charge card)',
    ongoingApr: 'N/A',
    creditLimitEstimate: '$20,000–$50,000',
    rewardsSummary: '4x points on top 2 spending categories',
    annualFee: '$375',
    warnings: [
      {
        rule: 'Amex Once-per-Lifetime',
        severity: 'caution',
        explanation:
          'Verify you have not previously held the Amex Business Gold. Amex restricts welcome bonuses to once per lifetime per product.',
      },
    ],
    scoreBreakdown: [
      { label: 'FICO alignment',   score: 86, weight: 0.35 },
      { label: 'Business revenue', score: 80, weight: 0.25 },
      { label: 'Issuer appetite',  score: 78, weight: 0.20 },
      { label: 'Utilization ratio',score: 76, weight: 0.20 },
    ],
  },
  {
    cardName: 'Alliant Visa Business Card',
    issuer: 'Alliant Credit Union',
    network: 'Visa',
    approvalProbability: 79,
    introApr: '0% for 12 months',
    ongoingApr: '13.99%–17.99%',
    creditLimitEstimate: '$10,000–$30,000',
    rewardsSummary: '2.5% cash back on all purchases',
    annualFee: '$0',
    isCreditUnion: true,
    bureauPull: 'TransUnion',
    membershipNote: 'Alliant CU membership required ($5 donation to join). Does not count against Chase 5/24.',
    scoreBreakdown: [
      { label: 'FICO alignment',   score: 82, weight: 0.35 },
      { label: 'Business revenue', score: 76, weight: 0.25 },
      { label: 'Issuer appetite',  score: 74, weight: 0.20 },
      { label: 'Utilization ratio',score: 72, weight: 0.20 },
    ],
  },
];

const EXISTING_CARDS = [
  'Chase Ink Business Preferred',
  'Chase Ink Business Cash',
  'Chase Ink Business Unlimited',
  'Amex Business Gold',
  'Amex Business Platinum',
  'Amex Blue Business Cash',
  'Capital One Spark Cash Plus',
  'Capital One Spark Miles',
  'Brex 30',
  'Bank of America Business Advantage',
  'Citi Business Custom Cash',
  'US Bank Business Triple Cash',
  'Wells Fargo Business Platinum',
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
    label: 'Week 1 — Chase First',
    cards: ['Chase Ink Business Preferred'],
    waitPeriod: 'Same week',
    rationale: 'Apply for Chase first to maximize 5/24 slot usage. Chase is the most sensitive to new account velocity — prioritize before other issuers.',
  },
  {
    round: 2,
    label: 'Week 1 — Amex Same Day',
    cards: ['Amex Business Gold Card'],
    waitPeriod: 'Wait 2 weeks',
    rationale: 'Apply for Amex on the same day or within 24 hours of Chase. Amex does not count toward Chase 5/24 (charge card). Combining same-day reduces total inquiry impact.',
  },
  {
    round: 3,
    label: 'Week 3 — Credit Union Layer',
    cards: ['Alliant Visa Business Card'],
    waitPeriod: '—',
    rationale: 'Apply after major bank cards. Alliant uses TransUnion (separate bureau from Chase/Amex). CU cards do not trigger velocity flags at major issuers. Membership must be established first ($5 donation).',
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
    rule: 'Chase 5/24 Count',
    issuer: 'Chase',
    severity: 'caution',
    detail: 'You have 3 new credit card accounts in the past 24 months, leaving 2 slots remaining under Chase 5/24. The recommended Chase Ink Preferred will consume 1 slot.',
    recommendation: 'Apply for Chase cards first to preserve remaining 5/24 slots. Alliant CU card does NOT count against 5/24. Consider timing to avoid burning both slots at once.',
  },
  {
    rule: 'Amex Once-per-Lifetime Check',
    issuer: 'American Express',
    severity: 'caution',
    detail: 'Amex restricts welcome bonus eligibility to once per lifetime per card product. If you have previously held the Amex Business Gold Card, you will not receive the welcome bonus on a new application.',
    recommendation: 'Before applying, check your Amex login for "pre-qualified offers" or call Amex to verify welcome bonus eligibility for the Business Gold Card.',
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

// ─── Sending form values ──────────────────────────────────────────────────────

/**
 * A form field as a number, or null when it was left blank.
 *
 * Null matters: it is the difference between "the advisor said zero" and "the
 * advisor said nothing". The first is an answer the optimizer must use; the
 * second lets it fall back to the client record.
 */
function numOrNull(raw: string): number | null {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** The form collects years; the optimizer works in months. */
function yearsToMonths(raw: string): number | null {
  const years = numOrNull(raw);
  return years === null ? null : Math.round(years * 12);
}

// ─── Form state type ──────────────────────────────────────────────────────────

interface CUFormState {
  state: string;
  militaryStatus: 'active' | 'retired' | 'veteran' | 'family' | 'none';
  employer: string;
  techIndustry: boolean;
  existingMemberships: string[];
  stackedCUs: string[];
  /** Whether credit union cards are considered in the plan at all. */
  includeInPlan: boolean;
  /** Most credit union cards to recommend. Each is a membership and a hard pull. */
  maxCards: string;
}

interface ExistingCardDetail {
  balance: string;
  limit: string;
}

interface FormState {
  fico: string;
  dnbPaydex: string;
  experianBis: string;
  ficoSbss: string;
  inquiries6mo: string;
  inquiries12mo: string;
  inquiries24mo: string;
  derogatoryMarks: string;
  selectedCards: string[];
  cardDetails: Record<string, ExistingCardDetail>;
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
  dnbPaydex: '',
  experianBis: '',
  ficoSbss: '',
  inquiries6mo: '',
  inquiries12mo: '',
  inquiries24mo: '',
  derogatoryMarks: '',
  selectedCards: ['Chase Ink Business Preferred', 'Amex Business Gold'],
  cardDetails: {},
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

// Must match CardProduct.issuerId exactly — an entry spelled differently
// excludes nothing. Kept in step with src/shared/constants/issuers.ts, which
// the seed validates against.
const ISSUER_OPTIONS = [
  'chase', 'amex', 'capital_one', 'citi', 'bank_of_america',
  'us_bank', 'wells_fargo', 'discover', 'td_bank', 'pnc',
  // Credit unions. These carry products in the catalogue and were absent
  // here, so a CU card could not be excluded at all.
  'alliant', 'becu', 'first_tech', 'lake_michigan_cu', 'navy_federal', 'penfed',
];

const INITIAL_CU_FORM: CUFormState = {
  // Off by default: including credit unions changes what a plan recommends,
  // and that should be a decision the advisor makes rather than a side effect
  // of filling in a state.
  includeInPlan: false,
  maxCards: '3',
  state: '',
  militaryStatus: 'none',
  employer: '',
  techIndustry: false,
  existingMemberships: [],
  stackedCUs: [],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OptimizerPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm]           = useState<FormState>(INITIAL_FORM);
  const [hasResults, setHasResults] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [apiError, setApiError]   = useState<string | null>(null);
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [creatingRound, setCreatingRound]   = useState(false);

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
    // Every page: the endpoint returns 25 at a time, so this offered the
    // first 25 clients and no way to select any of the others.
    fetchAllPages('/api/v1/clients', (json) => {
      const body = json as { success?: boolean; data?: unknown };
      if (body.success !== true || !Array.isArray(body.data)) return [];
      return body.data.map((row) => {
        const c = row as Record<string, unknown>;
        return {
          id: c.id as string,
          businessName: (c.businessName || c.legalName || 'Unknown') as string,
          status: (c.status || 'unknown') as string,
        };
      });
    })
      .then(({ rows }) => setClients(rows))
      .catch(() => {
        // The list is optional here; the form still works without it.
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
        // Through `loadJson` rather than a bare fetch with `authHeaders()`.
        // The bare version sent whatever token was in storage and reported
        // the refusal, so a form filled in over more than fifteen minutes —
        // the access token's whole life — failed on the click, while the
        // client dropdown above it kept showing data fetched on mount, back
        // when the token was still good. Nothing was wrong with the session:
        // the refresh token was never spent.
        const data = await loadJson<ApiStackingPlan>('/api/optimizer/run', {
          method: 'POST',
          body: {
            businessId: form.selectedBusinessId,
            targetAmount: form.targetFunding ? Number(form.targetFunding) : 100000,
            maxCards: form.maxCards ? Number(form.maxCards) : 8,
            prioritize: form.prioritizationMode,
            excludeIssuers: form.excludeIssuers,
            includeCreditUnions: cuForm.includeInPlan,
            maxCreditUnionCards: numOrNull(cuForm.maxCards) ?? 3,
            // Membership standing. Absent fields are reported as unknown by the
            // optimizer rather than resolved in the card's favour.
            creditUnionEligibility: {
              state: cuForm.state || null,
              militaryStatus: cuForm.militaryStatus,
              employer: cuForm.employer || null,
              techIndustry: cuForm.techIndustry,
              existingMemberships: cuForm.existingMemberships,
            },
            // Everything the advisor typed. None of this used to leave the
            // browser: the optimizer read the client record, and where that
            // was empty it used constants — so a FICO entered here was
            // discarded in favour of an assumed 680.
            profile: {
              ficoScore: numOrNull(form.fico),
              annualRevenue: numOrNull(form.annualRevenue),
              businessAgeMonths: yearsToMonths(form.yearsInBusiness),
              inquiries6mo: numOrNull(form.inquiries6mo),
              inquiries12mo: numOrNull(form.inquiries12mo),
              inquiries24mo: numOrNull(form.inquiries24mo),
              derogatoryMarks: numOrNull(form.derogatoryMarks),
              employees: numOrNull(form.employees),
              dnbPaydex: numOrNull(form.dnbPaydex),
              experianBis: numOrNull(form.experianBis),
              ficoSbss: numOrNull(form.ficoSbss),
            },
            existingCards: form.selectedCards.map((name) => ({
              name,
              creditLimit: numOrNull(form.cardDetails[name]?.limit ?? ''),
            })),
          },
        });

        setStackingPlan(data);
        setHasResults(true);
      } catch (e) {
        const info = toLoadError(e);
        setApiError(
          info.type === 'auth_required'
            // Only now is this true: a refresh was attempted and refused.
            ? 'Your session has ended. Sign in again to run the optimizer.'
            : info.type === 'network_error'
              ? 'Unable to reach the optimizer API.'
              // Say what the server said. Everything that was not a 401 used
              // to arrive as "Optimizer failed. Please try again.", which
              // described no problem and suggested no remedy.
              : `Optimizer failed. ${info.message}${info.status ? ` (HTTP ${info.status})` : ''}`,
        );
        // Deliberately no results: this previously set hasResults(true) with
        // no plan, which rendered the sample card stack as though it were a
        // recommendation generated for the selected business.
        setHasResults(false);
      }
    } else {
      // No business selected — use mock data (existing behavior)
      await new Promise((r) => setTimeout(r, 1200));
      setHasResults(true);
    }

    setLoading(false);
    // Depends on the whole form, not a list of five fields.
    //
    // This callback used to name `selectedBusinessId`, `targetFunding`,
    // `maxCards`, `prioritizationMode` and `excludeIssuers` — the only values
    // it read at the time. It now sends the entire profile, and any field
    // missing from this array would be read from the closure captured when one
    // of those five last changed: the advisor selects a client, then types a
    // FICO, and the run posts the empty FICO from before they typed it.
    //
    // `form` is replaced wholesale on every edit, so listing it is both correct
    // and no more work than listing its parts.
  }, [form, cuForm]);

  // Derive selected client name for toasts
  const selectedClientName = useMemo(() => {
    if (!form.selectedBusinessId) return 'Client';
    const match = clients.find((c) => c.id === form.selectedBusinessId);
    return match?.businessName ?? 'Client';
  }, [form.selectedBusinessId, clients]);

  const handleSaveStrategy = useCallback(async () => {
    // Both guards used to be defaults: no client became the literal id
    // 'mock-client', and no plan became `{ mock: true }` with a card count
    // taken from the sample panel. Each wrote a fabricated strategy to a real
    // client profile, which is worse than refusing.
    if (!form.selectedBusinessId) {
      toast.error('Select a client before saving a strategy.');
      return;
    }
    if (!stackingPlan) {
      toast.error('Run the optimizer before saving: there is no strategy to save yet.');
      return;
    }

    setSavingStrategy(true);
    try {
      await loadJson('/api/optimizer/save-strategy', {
        method: 'POST',
        body: {
          clientId: form.selectedBusinessId,
          results: stackingPlan,
        },
      });
      // Unreachable while the endpoint answers 501. Kept so that wiring real
      // persistence is a backend change, not a hunt for the success path.
      toast.success(`Strategy saved to ${selectedClientName} profile`);
    } catch (e) {
      // Reporting success here was the bug: a network failure told the user
      // the strategy had been saved to a client profile it never reached.
      const info = toLoadError(e);
      toast.error(
        info.type === 'auth_required'
          ? 'Your session has ended; the strategy was not saved. Sign in again.'
          : info.type === 'network_error'
            ? 'Could not reach the server; the strategy was not saved.'
            : `The strategy was not saved. ${info.message}`,
      );
    } finally {
      setSavingStrategy(false);
    }
  }, [form.selectedBusinessId, stackingPlan, selectedClientName, toast]);

  const handleCreateRound = useCallback(async () => {
    // A funding round is a real record. Its size used to fall back to the
    // length of the sample recommendations panel and a flat $100,000 target,
    // so clicking this without running the optimizer created a round whose
    // numbers came from nowhere.
    if (!form.selectedBusinessId) {
      toast.error('Select a client before creating a funding round.');
      return;
    }
    if (!stackingPlan) {
      toast.error('Run the optimizer before creating a round: its size comes from the plan.');
      return;
    }

    setCreatingRound(true);
    const roundNumber = stackingPlan.recommendations.length;
    const targetCredit = stackingPlan.totalEstimatedCreditTypical;
    const cardsPlanned = stackingPlan.cardCount;

    try {
      await loadJson('/api/optimizer/create-round', {
        method: 'POST',
        body: {
          clientId: form.selectedBusinessId,
          roundNumber,
          targetCredit,
          cardsPlanned,
        },
      });
      // Also unreachable at present. The navigation is deliberately gone: it
      // used to run on failure too, landing the user on a list that did not
      // contain the round they had just been told was created.
      toast.success(`Funding Round ${roundNumber} created for ${selectedClientName}`);
    } catch (e) {
      // This branch used to report the round created and navigate to the
      // funding-rounds list, where it would not be. The request failed.
      const info = toLoadError(e);
      toast.error(
        info.type === 'auth_required'
          ? 'Your session has ended; no funding round was created. Sign in again.'
          : info.type === 'network_error'
            ? 'Could not reach the server; no funding round was created.'
            : `No funding round was created. ${info.message}`,
      );
    } finally {
      setCreatingRound(false);
    }
  }, [form.selectedBusinessId, stackingPlan, selectedClientName, toast, router]);

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
                <select aria-label="Select client"
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
                            ? 'bg-brand-navy text-white border-brand-navy shadow-md ring-2 ring-brand-gold/50'
                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-white hover:text-gray-700 hover:border-brand-navy/30'
                        }`}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </FormField>

              <FormField label="Max Cards">
                <input aria-label="Maximum cards"
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
                <input aria-label="e.g. 760"
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
                  <input aria-label="e.g. 500000"
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
                  <input aria-label="2"
                    type="number"
                    min={0}
                    placeholder="2"
                    value={form.yearsInBusiness}
                    onChange={(e) => setForm({ ...form, yearsInBusiness: e.target.value })}
                    className="cf-input"
                  />
                </FormField>
                <FormField label="Employees (not used in scoring yet)">
                  <input aria-label="10"
                    type="number"
                    min={1}
                    placeholder="10"
                    value={form.employees}
                    onChange={(e) => setForm({ ...form, employees: e.target.value })}
                    className="cf-input"
                  />
                </FormField>
              </div>

              {/* Business Credit Scores */}
              <div className="border-t border-gray-100 pt-4 mt-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
                  Business Credit Scores
                  <NotYetUsed />
                </p>
                <p className="text-[11px] text-gray-500 -mt-2 mb-3">
                  Recorded and sent with the run, but the scorer does not read them yet.
                  They do not affect the recommendations below.
                </p>
                <div className="space-y-3">
                  <FormField label="D&B PAYDEX Score">
                    <input aria-label="e.g. 80"
                      type="number"
                      min={1}
                      max={100}
                      placeholder="e.g. 80"
                      value={form.dnbPaydex}
                      onChange={(e) => setForm({ ...form, dnbPaydex: e.target.value })}
                      className="cf-input"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">80+ = low risk</p>
                  </FormField>

                  <FormField label="Experian Business Intelliscore">
                    <input aria-label="e.g. 76"
                      type="number"
                      min={1}
                      max={100}
                      placeholder="e.g. 76"
                      value={form.experianBis}
                      onChange={(e) => setForm({ ...form, experianBis: e.target.value })}
                      className="cf-input"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">76+ = low risk</p>
                  </FormField>

                  <FormField label="FICO SBSS Score">
                    <input aria-label="e.g. 160"
                      type="number"
                      min={0}
                      max={300}
                      placeholder="e.g. 160"
                      value={form.ficoSbss}
                      onChange={(e) => setForm({ ...form, ficoSbss: e.target.value })}
                      className="cf-input"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">160+ for SBA programs</p>
                  </FormField>
                </div>
              </div>

              {/* Inquiry History */}
              <div className="border-t border-gray-100 pt-4 mt-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Inquiry History</p>
                <div className="grid grid-cols-3 gap-3">
                  <FormField label="6 Months">
                    <input aria-label="0"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={form.inquiries6mo}
                      onChange={(e) => setForm({ ...form, inquiries6mo: e.target.value })}
                      className="cf-input"
                    />
                  </FormField>
                  <FormField label="12 Months">
                    <input aria-label="0"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={form.inquiries12mo}
                      onChange={(e) => setForm({ ...form, inquiries12mo: e.target.value })}
                      className="cf-input"
                    />
                  </FormField>
                  <FormField label="24 Months (not used in scoring yet)">
                    <input aria-label="0"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={form.inquiries24mo}
                      onChange={(e) => setForm({ ...form, inquiries24mo: e.target.value })}
                      className="cf-input"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Chase 5/24 uses 24-month count</p>
                  </FormField>
                </div>

                {/*
                  The optimizer prioritises a derogatory count and the form had
                  no field for one, so every run reported it as assumed. A
                  banner that fires on every plan is a banner nobody reads.
                */}
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <FormField label="Derogatory Marks (not used in scoring yet)">
                    <input
                      aria-label="Derogatory marks"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={form.derogatoryMarks}
                      onChange={(e) => setForm({ ...form, derogatoryMarks: e.target.value })}
                      className="cf-input"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Collections, charge-offs, late payments. Recorded and reported in
                      Inputs Used, but the scorer does not read it yet.
                    </p>
                  </FormField>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Business Profile */}
          <SectionCard title="Business Profile">
            <div className="space-y-4">
              <FormField label="Entity Type">
                <select aria-label="Business type"
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
                  <input aria-label="e.g. 100000"
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
          <SectionCard title="Existing Cards" subtitle="Select all business cards currently open">
            <div className="space-y-1">
              {EXISTING_CARDS.map((card) => {
                const isSelected = form.selectedCards.includes(card);
                const detail = form.cardDetails[card] || { balance: '', limit: '' };
                const balNum = parseFloat(detail.balance) || 0;
                const limNum = parseFloat(detail.limit) || 0;
                const utilization = limNum > 0 ? Math.round((balNum / limNum) * 100) : 0;
                const utilColor = utilization <= 30 ? 'text-emerald-600' : utilization <= 50 ? 'text-amber-600' : 'text-red-600';
                const utilBg = utilization <= 30 ? 'bg-emerald-500' : utilization <= 50 ? 'bg-amber-500' : 'bg-red-500';

                return (
                  <div key={card}>
                    <label className="flex items-center gap-2.5 cursor-pointer group py-1.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCard(card)}
                        className="w-4 h-4 rounded border-gray-300 text-brand-navy focus:ring-brand-navy/30"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                        {card}
                      </span>
                    </label>
                    {isSelected && (
                      <div className="ml-6 mb-2 p-3 rounded-lg bg-gray-50 border border-gray-100 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Balance</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                              <input aria-label="0"
                                type="number"
                                min={0}
                                placeholder="0"
                                value={detail.balance}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    cardDetails: {
                                      ...f.cardDetails,
                                      [card]: { ...f.cardDetails[card] || { balance: '', limit: '' }, balance: e.target.value },
                                    },
                                  }))
                                }
                                className="cf-input pl-5 text-xs"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Limit</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                              <input aria-label="0"
                                type="number"
                                min={0}
                                placeholder="0"
                                value={detail.limit}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    cardDetails: {
                                      ...f.cardDetails,
                                      [card]: { ...f.cardDetails[card] || { balance: '', limit: '' }, limit: e.target.value },
                                    },
                                  }))
                                }
                                className="cf-input pl-5 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                        {limNum > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Utilization</span>
                              <span className={`text-xs font-bold ${utilColor}`}>{utilization}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                              <div className={`h-full rounded-full ${utilBg} transition-all`} style={{ width: `${Math.min(utilization, 100)}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
                    7 CUs
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

                {/*
                  An explicit decision, not an inference. Filling in a state
                  should not silently change which cards a plan recommends.
                */}
                <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-surface-border bg-gray-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={cuForm.includeInPlan}
                    onChange={(e) => setCUForm({ ...cuForm, includeInPlan: e.target.checked })}
                    className="mt-0.5 rounded border-gray-400"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-800">
                      Include credit unions in this plan
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Credit union cards require joining the credit union first. When
                      included, each recommendation states whether the client is a
                      member, how they could join, or that their standing is unknown.
                    </span>
                  </span>
                </label>

                {cuForm.includeInPlan && (
                  <div className="max-w-xs">
                    <FormField label="Max credit union cards">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={cuForm.maxCards}
                        onChange={(e) => setCUForm({ ...cuForm, maxCards: e.target.value })}
                        className="cf-input"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        Each is a membership and a hard pull, so this is capped
                        separately from the card count above.
                      </p>
                    </FormField>
                  </div>
                )}
                {/* ── Eligibility Form ────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="State of Residence">
                    <select aria-label="State"
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
                    <input aria-label="e.g. Microsoft, Intel, Boeing"
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
                        return (
                          <div
                            key={result.cu.id}
                            className={`rounded-xl border p-4 transition-all ${
                              result.eligible
                                ? 'bg-white border-gray-200 hover:border-brand-navy/30'
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

              {/* ── Capacity: did the banks cover it, and what closes the gap ── */}
              {stackingPlan.capacity && (
                <SectionCard
                  title="Capacity against target"
                  subtitle={`Target ${formatCurrencyShort(stackingPlan.capacity.targetAmount)}`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Bank cards</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrencyShort(stackingPlan.capacity.bankEstimatedCredit)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {stackingPlan.capacity.bankCardCount} card
                        {stackingPlan.capacity.bankCardCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Credit unions</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {stackingPlan.capacity.creditUnionsIncluded
                          ? formatCurrencyShort(stackingPlan.capacity.creditUnionEstimatedCredit)
                          : '--'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {stackingPlan.capacity.creditUnionsIncluded
                          ? `${stackingPlan.capacity.creditUnionCardCount} of max ${stackingPlan.capacity.creditUnionCardLimit}`
                          : 'Not included in this plan'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Still unmet</p>
                      <p
                        className={`text-2xl font-bold ${
                          stackingPlan.capacity.remainingShortfall > 0
                            ? 'text-amber-700'
                            : 'text-green-700'
                        }`}
                      >
                        {formatCurrencyShort(stackingPlan.capacity.remainingShortfall)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {stackingPlan.capacity.remainingShortfall > 0 ? 'Target not reached' : 'Target met'}
                      </p>
                    </div>
                  </div>

                  {/*
                    The shortfall is the thing an advisor is reasoning about, and
                    a single blended total hid it. Bank capacity is stated first
                    because credit unions are what extends it, not what replaces it.
                  */}
                  <p className="mt-4 text-sm text-gray-600">
                    {stackingPlan.capacity.shortfallAfterBanks === 0
                      ? 'Bank cards alone reach the target.'
                      : stackingPlan.capacity.creditUnionsIncluded
                        ? `Bank capacity falls ${formatCurrencyShort(stackingPlan.capacity.shortfallAfterBanks)} short of target. `
                          + (stackingPlan.capacity.creditUnionEstimatedCredit > 0
                            ? `Credit unions close ${formatCurrencyShort(stackingPlan.capacity.creditUnionEstimatedCredit)} of that.`
                            : 'No credit union card was eligible to close it.')
                        : `Bank capacity falls ${formatCurrencyShort(stackingPlan.capacity.shortfallAfterBanks)} short of target. `
                          + 'Credit unions are not included — turn them on above to extend the stack.'}
                  </p>
                </SectionCard>
              )}

              {/* ── Chase 5/24 ─────────────────────────────── */}
              {stackingPlan.velocitySummary && (
                <SectionCard
                  title="Chase 5/24"
                  subtitle={`${stackingPlan.velocitySummary.chase524HeadroomBefore} of 5 slots open before this plan`}
                >
                  {/*
                    A plan past the limit says so plainly. The headroom figure
                    was clamped at zero, so a plan twelve cards over reported
                    "0" — which reads as "at the limit" rather than "cannot be
                    executed as sequenced".
                  */}
                  {stackingPlan.velocitySummary.exceedsChase524 && (
                    <div
                      role="alert"
                      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900"
                    >
                      <p className="font-semibold">
                        This plan cannot be executed as sequenced —{' '}
                        {stackingPlan.velocitySummary.chase524Overage} card
                        {stackingPlan.velocitySummary.chase524Overage === 1 ? '' : 's'} past the
                        Chase 5/24 limit.
                      </p>
                      <p className="mt-1 text-amber-800">
                        Chase will decline once five cards have been opened in 24 months.
                        Reduce the card count, or sequence the Chase applications first.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Counts toward 5/24</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {stackingPlan.velocitySummary.cardsCountingToward524}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Exempt (credit union)</p>
                      <p className="text-2xl font-bold text-green-700">
                        {stackingPlan.velocitySummary.cardsExemptFrom524}
                      </p>
                      <p className="text-xs text-gray-500">Do not count against Chase</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Slots left after</p>
                      <p
                        className={`text-2xl font-bold ${
                          stackingPlan.velocitySummary.chase524HeadroomAfter < 0
                            ? 'text-amber-700'
                            : 'text-gray-900'
                        }`}
                      >
                        {stackingPlan.velocitySummary.chase524HeadroomAfter}
                      </p>
                    </div>
                  </div>
                  {stackingPlan.velocitySummary.cardsNotEvaluated > 0 && (
                    /* An issuer no rule looked at must not read as one that passed. */
                    <p className="mt-3 text-xs text-gray-600">
                      {stackingPlan.velocitySummary.cardsNotEvaluated} card
                      {stackingPlan.velocitySummary.cardsNotEvaluated === 1 ? '' : 's'} could not be
                      evaluated — the issuer was not recognised, so no 5/24 treatment was decided.
                    </p>
                  )}
                </SectionCard>
              )}

              {/* ── Inputs Used — read this before the recommendations ── */}
              {stackingPlan.inputProvenance && (
                <InputsUsedPanel provenance={stackingPlan.inputProvenance} />
              )}

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

              {/* ── Action Buttons ─────────────────────────── */}
              <OptimizerActionButtons
                savingStrategy={savingStrategy}
                creatingRound={creatingRound}
                onSaveStrategy={handleSaveStrategy}
                onCreateRound={handleCreateRound}
              />
            </>
          ) : (
            <>
              {/* ── Summary Header: Total Credit + 5/24 Badge ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-surface-border bg-white shadow-card p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Estimated Credit</p>
                  <p className="text-3xl font-bold" style={{ color: '#C9A84C' }}>$45K–$130K</p>
                  <p className="text-xs text-gray-400 mt-1">Across 3 recommended cards</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-white shadow-card p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cards Recommended</p>
                  <p className="text-3xl font-bold text-gray-900">3</p>
                  <p className="text-xs text-gray-400 mt-1">Chase + Amex + Credit Union</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-white shadow-card p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Chase 5/24 Status</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-3xl font-bold text-amber-600">2</span>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      SLOTS REMAINING
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">3 of 5 accounts used in past 24 months</p>
                </div>
              </div>

              {/* ── Card Recommendations ────────────────────────
                  Still a fixed sample list, not derived from the selected
                  client. The subtitle used to claim it was ranked "given your
                  profile", which described analysis that had not happened.
                  Labelled until it is wired to the optimizer response. */}
              <SectionCard
                title="Card Recommendations"
                subtitle="Example ranking — not calculated from this client's profile"
              >
                <div className="space-y-4 p-0">
                  <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Sample data. These cards and approval probabilities are a
                    fixed illustration and do not reflect the selected client.
                  </p>
                  {MOCK_RESULTS.map((card, i) => {
                    const timing = i < 2 ? 'Week 1' : 'Week 3';
                    return (
                      <div key={card.cardName} className="relative">
                        <CardRecommendation rank={i + 1} {...card} />
                        {/* Apply timing badge */}
                        <div className="absolute top-3 right-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            timing === 'Week 1'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {timing}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {/* ── Application Sequence Timeline ────────────── */}
              <SectionCard
                title="Application Sequence"
                subtitle="Recommended timeline for applying to maximize approvals"
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

              {/* ── Issuer Rule Warnings ─────────────────────── */}
              <SectionCard
                title="Issuer Rule Warnings"
                subtitle="Policy limits that may affect approval outcomes"
              >
                <div className="space-y-4">
                  {VIOLATIONS.map((v) => (
                    <ViolationCard key={v.rule} violation={v} />
                  ))}
                </div>
              </SectionCard>

              {/* ── Network Diversity ────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2">
                  {/* ── Action Buttons ────────────────────────── */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => toast.success('Strategy saved to client profile. You can view it under the client\'s Credit tab.')}
                      className="flex-1 py-3 px-5 rounded-xl font-semibold text-sm transition-all duration-150 bg-brand-navy text-white hover:bg-brand-navy-800 shadow-md hover:shadow-lg"
                    >
                      Save Strategy to Client &rarr;
                    </button>
                    <button
                      onClick={() => toast.success('Funding round created from optimization results. Visit Funding Rounds to manage it.')}
                      className="flex-1 py-3 px-5 rounded-xl font-semibold text-sm transition-all duration-150 border-2 border-brand-navy text-brand-navy bg-white hover:bg-brand-navy/5 shadow-md hover:shadow-lg"
                      style={{ borderColor: '#C9A84C', color: '#C9A84C' }}
                    >
                      Create Funding Round from Results &rarr;
                    </button>
                  </div>
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

              {/* ── Action Buttons ─────────────────────────── */}
              <OptimizerActionButtons
                savingStrategy={savingStrategy}
                creatingRound={creatingRound}
                onSaveStrategy={handleSaveStrategy}
                onCreateRound={handleCreateRound}
              />
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
      {/*
        A credit union card cannot be applied for without joining first. An
        advisor who carries this to a client must know that before the client
        does, and must not be told "eligible" when nothing on file says so.
      */}
      {rec.membership && (
        <div
          className={`mb-2 rounded-lg border px-3 py-2 text-xs ${
            rec.membership.status === 'member'
              ? 'border-green-300 bg-green-50 text-green-800'
              : rec.membership.status === 'eligibility_path'
                ? rec.membership.gate === 'open_enrollment'
                  ? 'border-blue-300 bg-blue-50 text-blue-900'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-gray-300 bg-gray-50 text-gray-700'
          }`}
        >
          <span className="font-semibold">
            {rec.membership.status === 'member'
              ? 'Member'
              : rec.membership.status !== 'eligibility_path'
                ? 'Membership status unknown'
                : rec.membership.gate === 'open_enrollment'
                  // Open enrollment is a step, not a barrier — an advisor can
                  // act on it in the meeting. Saying only "membership required"
                  // read the same as needing to have served in the military.
                  ? `Open enrollment${
                      typeof rec.membership.joinCost === 'number'
                        ? ` — join for $${rec.membership.joinCost}`
                        : ''
                    }`
                  : 'Qualifies — membership required before applying'}
          </span>{' '}
          {rec.membership.detail}
        </div>
      )}

      {rec.cooldownDays > 0 && (
        <div className="mt-2 rounded-lg bg-brand-navy/5 border border-brand-navy/10 px-3 py-1.5">
          <p className="text-xs text-brand-navy font-semibold">
            Wait {rec.cooldownDays} days before this application
            {rec.cooldownSource === 'unresearched_default' && (
              /* The wait is the fallback, not a published rule. Presenting it
                 like Amex's 2/90 would imply research that has not happened. */
              <span className="ml-1 text-gray-500">
                (no published velocity rule on file for this issuer — default)
              </span>
            )}
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
            {rec.cooldownSource === 'unresearched_default' && ' (default)'}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Optimizer Action Buttons (Save Strategy + Create Round) ─────────────────

function OptimizerActionButtons({
  savingStrategy,
  creatingRound,
  onSaveStrategy,
  onCreateRound,
}: {
  savingStrategy: boolean;
  creatingRound: boolean;
  onSaveStrategy: () => void;
  onCreateRound: () => void;
}) {
  // Neither endpoint writes anything — both answer 501. The buttons said
  // "Save Strategy to Client Profile" and reported success, so the only way to
  // learn the strategy had not been saved was to go looking for it. They are
  // disabled and labelled instead: an action that cannot happen should not be
  // offered as though it can.
  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Save Strategy to Client Profile — not built */}
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-400 shadow-sm cursor-not-allowed"
          disabled
          aria-disabled="true"
          title="Not built yet — no table stores a saved strategy."
          onClick={onSaveStrategy}
        >
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
          </svg>
          Save Strategy to Client Profile
          <span className="ml-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Not built
          </span>
        </button>

        {/* Create Funding Round from Results — not built */}
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-400 shadow-sm cursor-not-allowed"
          disabled
          aria-disabled="true"
          title="Not built yet — this never created a funding round."
          onClick={onCreateRound}
        >
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Funding Round from Results
          <span className="ml-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Not built
          </span>
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Saving a strategy and creating a funding round from these results are not
        implemented. Both previously reported success without writing anything.
        Create a funding round from the{' '}
        <Link href="/funding-rounds" className="font-semibold text-gray-700 underline">
          Funding Rounds
        </Link>{' '}
        page.
      </p>
      {(savingStrategy || creatingRound) && (
        <p className="text-xs text-gray-400">Working…</p>
      )}
    </div>
  );
}
