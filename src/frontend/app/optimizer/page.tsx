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

import { useState } from 'react';
import { SectionCard } from '@/components/ui/card';
import {
  CardRecommendation,
  type CardRecommendationProps,
} from '@/components/modules/card-recommendation';

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

// ─── Form state type ──────────────────────────────────────────────────────────

interface FormState {
  fico: string;
  selectedCards: string[];
  businessType: string;
  annualRevenue: string;
  yearsInBusiness: string;
  employees: string;
  targetFunding: string;
}

const INITIAL_FORM: FormState = {
  fico: '',
  selectedCards: ['Chase Sapphire Preferred', 'Amex Platinum'],
  businessType: 'LLC',
  annualRevenue: '',
  yearsInBusiness: '',
  employees: '',
  targetFunding: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OptimizerPage() {
  const [form, setForm]           = useState<FormState>(INITIAL_FORM);
  const [hasResults, setHasResults] = useState(false);
  const [loading, setLoading]     = useState(false);

  function toggleCard(card: string) {
    setForm((f) => ({
      ...f,
      selectedCards: f.selectedCards.includes(card)
        ? f.selectedCards.filter((c) => c !== card)
        : [...f.selectedCards, card],
    }));
  }

  function handleRun() {
    setLoading(true);
    // Simulate async optimization
    setTimeout(() => {
      setLoading(false);
      setHasResults(true);
    }, 1200);
  }

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
          {!hasResults ? (
            <EmptyState />
          ) : (
            <>
              {/* ── Card Recommendations ──────────────────── */}
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

              {/* ── Issuer Rule Violations ────────────────── */}
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

              {/* ── Sequencing Timeline + Network Diversity ── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Timeline (2/3) */}
                <div className="md:col-span-2">
                  <SectionCard
                    title="Multi-Round Sequencing"
                    subtitle="Optimal application order to maximize approvals"
                  >
                    <div className="relative">
                      {/* Vertical line */}
                      <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200" aria-hidden="true" />
                      <div className="space-y-6 pl-10">
                        {SEQUENCE_ROUNDS.map((r) => (
                          <SequenceStep key={r.round} step={r} />
                        ))}
                      </div>
                    </div>
                  </SectionCard>
                </div>

                {/* Network diversity (1/3) */}
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
