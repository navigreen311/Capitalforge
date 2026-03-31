'use client';

// ============================================================
// /hardship — Hardship & Workout Center
//
// Sections:
//   1. Stats (open cases, avg resolution days, settlement rate)
//   2. Open cases table with severity badges
//   3. Payment plan details panel (select a case)
//   4. Settlement offers with status
//   5. Card closure sequence view
//   6. Counselor referral links
// ============================================================

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CaseSeverity = 'minor' | 'serious' | 'critical';
type CaseStatus   = 'open' | 'in_review' | 'negotiating' | 'resolved' | 'closed';
type SettlementStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'countered';
type ClosureStage = 'active' | 'freeze_requested' | 'in_closure' | 'closed' | 'charged_off';

interface HardshipCase {
  id: string;
  clientName: string;
  businessName: string;
  openedAt: string;
  severity: CaseSeverity;
  status: CaseStatus;
  assignedAdvisor: string;
  cardsAffected: number;
  totalDebt: number;
  missedPayments: number;
  resolutionDays?: number;
  notes?: string;
}

interface PaymentPlanDetail {
  caseId: string;
  cardName: string;
  issuer: string;
  originalBalance: number;
  reducedPayment: number;
  originalMinPayment: number;
  rateReduction?: number; // percentage points
  feeWaiver: boolean;
  planStartDate: string;
  planEndDate: string;
  monthsRemaining: number;
}

interface SettlementOffer {
  id: string;
  caseId: string;
  cardName: string;
  issuer: string;
  originalBalance: number;
  offerAmount: number;
  offerPct: number; // % of balance
  expiresAt: string;
  status: SettlementStatus;
  submittedAt: string;
}

interface ClosureCard {
  id: string;
  caseId: string;
  cardName: string;
  issuer: string;
  balance: number;
  stage: ClosureStage;
  requestedAt?: string;
  closedAt?: string;
}

interface CounselorRef {
  id: string;
  name: string;
  organization: string;
  phone: string;
  website: string;
  specialty: string;
  free: boolean;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_CASES: HardshipCase[] = [
  {
    id: 'hc_001',
    clientName: 'James Okafor',
    businessName: 'Crestline Medical LLC',
    openedAt: '2026-03-01T10:00:00Z',
    severity: 'critical',
    status: 'negotiating',
    assignedAdvisor: 'Sarah Chen',
    cardsAffected: 4,
    totalDebt: 87_400,
    missedPayments: 3,
    notes: 'Client experiencing cash flow crisis post-contract loss.',
  },
  {
    id: 'hc_002',
    clientName: 'Lisa Park',
    businessName: 'Summit Retail LLC',
    openedAt: '2026-03-10T09:30:00Z',
    severity: 'serious',
    status: 'in_review',
    assignedAdvisor: 'Marcus Williams',
    cardsAffected: 2,
    totalDebt: 34_200,
    missedPayments: 1,
    notes: 'Seeking rate reduction and fee waiver from issuers.',
  },
  {
    id: 'hc_003',
    clientName: 'Troy Bennett',
    businessName: 'Horizon Freight Inc.',
    openedAt: '2026-02-20T14:00:00Z',
    severity: 'serious',
    status: 'open',
    assignedAdvisor: 'James Okafor',
    cardsAffected: 3,
    totalDebt: 52_000,
    missedPayments: 2,
  },
  {
    id: 'hc_004',
    clientName: 'Angela Reyes',
    businessName: 'Coastal Events Co.',
    openedAt: '2026-03-15T11:00:00Z',
    severity: 'minor',
    status: 'open',
    assignedAdvisor: 'Sarah Chen',
    cardsAffected: 1,
    totalDebt: 9_800,
    missedPayments: 0,
    notes: 'Proactive hardship inquiry — seasonal revenue dip.',
  },
  {
    id: 'hc_005',
    clientName: 'David Kim',
    businessName: 'NovaTech Solutions',
    openedAt: '2026-01-15T08:00:00Z',
    severity: 'critical',
    status: 'resolved',
    assignedAdvisor: 'Marcus Williams',
    cardsAffected: 5,
    totalDebt: 112_000,
    missedPayments: 4,
    resolutionDays: 38,
  },
  {
    id: 'hc_006',
    clientName: 'Maria Santos',
    businessName: 'Blue Ridge Consulting',
    openedAt: '2026-02-05T10:00:00Z',
    severity: 'minor',
    status: 'resolved',
    assignedAdvisor: 'James Okafor',
    cardsAffected: 1,
    totalDebt: 7_200,
    missedPayments: 1,
    resolutionDays: 14,
  },
];

const PLACEHOLDER_PLANS: PaymentPlanDetail[] = [
  {
    caseId: 'hc_001',
    cardName: 'Ink Business Cash',
    issuer: 'Chase',
    originalBalance: 28_000,
    reducedPayment: 420,
    originalMinPayment: 560,
    rateReduction: 8,
    feeWaiver: true,
    planStartDate: '2026-03-10',
    planEndDate: '2027-03-10',
    monthsRemaining: 11,
  },
  {
    caseId: 'hc_001',
    cardName: 'Business Gold Card',
    issuer: 'Amex',
    originalBalance: 22_000,
    reducedPayment: 300,
    originalMinPayment: 440,
    rateReduction: 12,
    feeWaiver: true,
    planStartDate: '2026-03-12',
    planEndDate: '2027-03-12',
    monthsRemaining: 11,
  },
  {
    caseId: 'hc_002',
    cardName: 'Spark Cash Plus',
    issuer: 'Capital One',
    originalBalance: 18_000,
    reducedPayment: 280,
    originalMinPayment: 360,
    rateReduction: 6,
    feeWaiver: false,
    planStartDate: '2026-03-18',
    planEndDate: '2027-03-18',
    monthsRemaining: 11,
  },
];

const PLACEHOLDER_SETTLEMENTS: SettlementOffer[] = [
  {
    id: 'so_001',
    caseId: 'hc_001',
    cardName: 'Venture X Business',
    issuer: 'Capital One',
    originalBalance: 19_500,
    offerAmount: 11_700,
    offerPct: 60,
    expiresAt: '2026-04-15T00:00:00Z',
    status: 'pending',
    submittedAt: '2026-03-25T10:00:00Z',
  },
  {
    id: 'so_002',
    caseId: 'hc_001',
    cardName: 'Business Platinum',
    issuer: 'Amex',
    originalBalance: 17_900,
    offerAmount: 10_025,
    offerPct: 56,
    expiresAt: '2026-04-10T00:00:00Z',
    status: 'countered',
    submittedAt: '2026-03-20T09:00:00Z',
  },
  {
    id: 'so_003',
    caseId: 'hc_005',
    cardName: 'Ink Business Preferred',
    issuer: 'Chase',
    originalBalance: 31_000,
    offerAmount: 15_500,
    offerPct: 50,
    expiresAt: '2026-03-01T00:00:00Z',
    status: 'accepted',
    submittedAt: '2026-02-10T08:00:00Z',
  },
];

const PLACEHOLDER_CLOSURES: ClosureCard[] = [
  { id: 'cc_001', caseId: 'hc_001', cardName: 'Ink Business Cash', issuer: 'Chase', balance: 28_000, stage: 'freeze_requested', requestedAt: '2026-03-05' },
  { id: 'cc_002', caseId: 'hc_001', cardName: 'Business Gold Card', issuer: 'Amex', balance: 22_000, stage: 'in_closure', requestedAt: '2026-03-08' },
  { id: 'cc_003', caseId: 'hc_001', cardName: 'Venture X Business', issuer: 'Capital One', balance: 19_500, stage: 'active' },
  { id: 'cc_004', caseId: 'hc_001', cardName: 'Business Platinum', issuer: 'Amex', balance: 17_900, stage: 'active' },
];

const COUNSELOR_REFS: CounselorRef[] = [
  {
    id: 'cr_001',
    name: 'NFCC Member Agency',
    organization: 'National Foundation for Credit Counseling',
    phone: '1-800-388-2227',
    website: 'https://www.nfcc.org',
    specialty: 'Debt management plans, credit counseling',
    free: true,
  },
  {
    id: 'cr_002',
    name: 'SCORE Business Mentoring',
    organization: 'SCORE Association',
    phone: '1-800-634-0245',
    website: 'https://www.score.org',
    specialty: 'Small business financial restructuring',
    free: true,
  },
  {
    id: 'cr_003',
    name: 'SBA Financial Assistance',
    organization: 'U.S. Small Business Administration',
    phone: '1-800-659-2955',
    website: 'https://www.sba.gov',
    specialty: 'Disaster loans, EIDL hardship programs',
    free: true,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

const SEVERITY_STYLES: Record<CaseSeverity, { bg: string; border: string; text: string; label: string }> = {
  minor:    { bg: 'bg-blue-900/40',   border: 'border-blue-700',   text: 'text-blue-300',   label: 'Minor'    },
  serious:  { bg: 'bg-yellow-900/40', border: 'border-yellow-700', text: 'text-yellow-300', label: 'Serious'  },
  critical: { bg: 'bg-red-900/40',    border: 'border-red-700',    text: 'text-red-300',    label: 'Critical' },
};

const CASE_STATUS_STYLES: Record<CaseStatus, { bg: string; text: string; label: string }> = {
  open:        { bg: 'bg-gray-800',    text: 'text-gray-300',   label: 'Open'        },
  in_review:   { bg: 'bg-blue-900/60', text: 'text-blue-300',   label: 'In Review'   },
  negotiating: { bg: 'bg-yellow-900/60', text: 'text-yellow-300', label: 'Negotiating' },
  resolved:    { bg: 'bg-green-900/60', text: 'text-green-300',  label: 'Resolved'    },
  closed:      { bg: 'bg-gray-900',    text: 'text-gray-500',   label: 'Closed'      },
};

const SETTLEMENT_STYLES: Record<SettlementStatus, { bg: string; border: string; text: string; label: string }> = {
  pending:   { bg: 'bg-yellow-900/40', border: 'border-yellow-700', text: 'text-yellow-300', label: 'Pending'   },
  accepted:  { bg: 'bg-green-900/40',  border: 'border-green-700',  text: 'text-green-300',  label: 'Accepted'  },
  declined:  { bg: 'bg-red-900/40',    border: 'border-red-700',    text: 'text-red-300',    label: 'Declined'  },
  expired:   { bg: 'bg-gray-800',      border: 'border-gray-700',   text: 'text-gray-400',   label: 'Expired'   },
  countered: { bg: 'bg-purple-900/40', border: 'border-purple-700', text: 'text-purple-300', label: 'Countered' },
};

const CLOSURE_STAGE_STYLES: Record<ClosureStage, { dot: string; text: string; label: string }> = {
  active:            { dot: 'bg-green-500',  text: 'text-green-400',  label: 'Active'           },
  freeze_requested:  { dot: 'bg-yellow-400', text: 'text-yellow-400', label: 'Freeze Requested' },
  in_closure:        { dot: 'bg-orange-400', text: 'text-orange-400', label: 'In Closure'       },
  closed:            { dot: 'bg-gray-500',   text: 'text-gray-400',   label: 'Closed'           },
  charged_off:       { dot: 'bg-red-500',    text: 'text-red-400',    label: 'Charged Off'      },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HardshipPage() {
  const [cases]              = useState<HardshipCase[]>(PLACEHOLDER_CASES);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plans' | 'settlements' | 'closures'>('plans');

  useEffect(() => {
    // Future: fetch from API
  }, []);

  const openCases      = cases.filter(c => c.status !== 'resolved' && c.status !== 'closed');
  const resolvedCases  = cases.filter(c => c.status === 'resolved');
  const avgResolutionDays = resolvedCases.length > 0
    ? Math.round(resolvedCases.reduce((s, c) => s + (c.resolutionDays ?? 0), 0) / resolvedCases.length)
    : 0;
  const acceptedSettlements = PLACEHOLDER_SETTLEMENTS.filter(s => s.status === 'accepted').length;
  const settlementRate = PLACEHOLDER_SETTLEMENTS.length > 0
    ? Math.round((acceptedSettlements / PLACEHOLDER_SETTLEMENTS.length) * 100)
    : 0;

  const selectedCase = selectedCaseId ? cases.find(c => c.id === selectedCaseId) : null;
  const casePlans     = PLACEHOLDER_PLANS.filter(p => p.caseId === selectedCaseId);
  const caseSettlements = PLACEHOLDER_SETTLEMENTS.filter(s => s.caseId === selectedCaseId);
  const caseClosures  = PLACEHOLDER_CLOSURES.filter(c => c.caseId === selectedCaseId);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Hardship &amp; Workout Center</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Manage open hardship cases, negotiate settlements, and coordinate card closures.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Open Cases</p>
          <p className="text-2xl font-bold text-red-300">{openCases.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            {openCases.filter(c => c.severity === 'critical').length} critical
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Avg Resolution</p>
          <p className="text-2xl font-bold text-[#C9A84C]">{avgResolutionDays}d</p>
          <p className="text-xs text-gray-500 mt-1">across {resolvedCases.length} resolved</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Settlement Rate</p>
          <p className="text-2xl font-bold text-green-300">{settlementRate}%</p>
          <p className="text-xs text-gray-500 mt-1">{acceptedSettlements} of {PLACEHOLDER_SETTLEMENTS.length} offers</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Total Debt at Risk</p>
          <p className="text-2xl font-bold text-yellow-300">
            {formatCurrency(openCases.reduce((s, c) => s + c.totalDebt, 0))}
          </p>
          <p className="text-xs text-gray-500 mt-1">across open cases</p>
        </div>
      </div>

      {/* Open cases table */}
      <div className="rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">Open Cases</h3>
          <span className="text-xs text-gray-400">{openCases.length} active · {resolvedCases.length} resolved</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Client / Business</th>
                <th className="text-center px-4 py-3 font-semibold">Severity</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Total Debt</th>
                <th className="text-center px-4 py-3 font-semibold">Cards</th>
                <th className="text-center px-4 py-3 font-semibold">Missed Pmts</th>
                <th className="text-left px-4 py-3 font-semibold">Advisor</th>
                <th className="text-right px-4 py-3 font-semibold">Opened</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {cases.map((c) => {
                const sev = SEVERITY_STYLES[c.severity];
                const sta = CASE_STATUS_STYLES[c.status];
                const isSelected = selectedCaseId === c.id;

                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCaseId(isSelected ? null : c.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#C9A84C]/10 border-l-2 border-l-[#C9A84C]'
                        : 'bg-[#0A1628] hover:bg-gray-900/50'
                    }`}
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-100">{c.clientName}</p>
                      <p className="text-xs text-gray-500">{c.businessName}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${sev.bg} ${sev.border} ${sev.text}`}>
                        {sev.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sta.bg} ${sta.text}`}>
                        {sta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-white">
                      {formatCurrency(c.totalDebt)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">{c.cardsAffected}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={c.missedPayments > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                        {c.missedPayments}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{c.assignedAdvisor}</td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">{formatDate(c.openedAt)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{isSelected ? '▲' : '▼'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Case detail panel */}
      {selectedCase && (
        <div className="rounded-xl border border-[#C9A84C]/30 bg-[#0A1628] overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-[#C9A84C]/5">
            <div>
              <h3 className="text-base font-semibold text-white">
                {selectedCase.clientName} — {selectedCase.businessName}
              </h3>
              {selectedCase.notes && (
                <p className="text-xs text-gray-400 mt-0.5">{selectedCase.notes}</p>
              )}
            </div>
            <button
              onClick={() => setSelectedCaseId(null)}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors px-2"
            >
              ✕ Close
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 px-5 pt-4 border-b border-gray-800">
            {(['plans', 'settlements', 'closures'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors capitalize border-b-2 ${
                  activeTab === tab
                    ? 'border-[#C9A84C] text-[#C9A84C]'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab === 'plans' ? 'Payment Plans' : tab === 'settlements' ? 'Settlement Offers' : 'Card Closures'}
              </button>
            ))}
          </div>

          <div className="p-5">

            {/* Payment plans tab */}
            {activeTab === 'plans' && (
              <>
                {casePlans.length === 0 ? (
                  <p className="text-gray-500 text-sm">No payment plans on file for this case.</p>
                ) : (
                  <div className="space-y-3">
                    {casePlans.map((plan, idx) => (
                      <div key={idx} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-gray-100">{plan.cardName}</p>
                            <p className="text-xs text-gray-500">{plan.issuer}</p>
                          </div>
                          <div className="flex gap-2">
                            {plan.feeWaiver && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-900 text-green-300 border border-green-700">
                                Fee Waiver
                              </span>
                            )}
                            {plan.rateReduction && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900 text-blue-300 border border-blue-700">
                                -{plan.rateReduction}% APR
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Balance</p>
                            <p className="text-sm font-bold text-white">{formatCurrency(plan.originalBalance)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Reduced Payment</p>
                            <p className="text-sm font-bold text-green-400">{formatCurrency(plan.reducedPayment)}</p>
                            <p className="text-[10px] text-gray-600">was {formatCurrency(plan.originalMinPayment)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Plan Period</p>
                            <p className="text-xs text-gray-300">
                              {plan.planStartDate} → {plan.planEndDate}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Months Remaining</p>
                            <p className="text-sm font-bold text-[#C9A84C]">{plan.monthsRemaining}mo</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Settlement offers tab */}
            {activeTab === 'settlements' && (
              <>
                {caseSettlements.length === 0 ? (
                  <p className="text-gray-500 text-sm">No settlement offers for this case.</p>
                ) : (
                  <div className="space-y-3">
                    {caseSettlements.map((offer) => {
                      const st = SETTLEMENT_STYLES[offer.status];
                      const savings = offer.originalBalance - offer.offerAmount;
                      const isExpired = new Date(offer.expiresAt) < new Date();
                      return (
                        <div key={offer.id} className={`rounded-xl border p-4 ${st.bg} ${st.border}`}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-semibold text-gray-100">{offer.cardName}</p>
                              <p className="text-xs text-gray-500">{offer.issuer}</p>
                            </div>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${st.bg} ${st.border} ${st.text}`}>
                              {st.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Original Balance</p>
                              <p className="text-sm font-bold text-white">{formatCurrency(offer.originalBalance)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Settlement Offer</p>
                              <p className={`text-sm font-bold ${st.text}`}>{formatCurrency(offer.offerAmount)}</p>
                              <p className="text-[10px] text-gray-600">{offer.offerPct}% of balance</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Savings</p>
                              <p className="text-sm font-bold text-green-400">{formatCurrency(savings)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Expires</p>
                              <p className={`text-xs font-semibold ${isExpired ? 'text-red-400' : 'text-gray-300'}`}>
                                {formatDate(offer.expiresAt)}
                                {isExpired && ' (expired)'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Card closures tab */}
            {activeTab === 'closures' && (
              <>
                {caseClosures.length === 0 ? (
                  <p className="text-gray-500 text-sm">No card closure sequences initiated for this case.</p>
                ) : (
                  <div className="space-y-2">
                    {caseClosures.map((card) => {
                      const stage = CLOSURE_STAGE_STYLES[card.stage];
                      return (
                        <div key={card.id} className="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${stage.dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-100">{card.cardName}</p>
                            <p className="text-xs text-gray-500">{card.issuer}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-white">{formatCurrency(card.balance)}</p>
                            <p className="text-[10px] text-gray-500">balance</p>
                          </div>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-800 ${stage.text} min-w-[110px] text-center`}>
                            {stage.label}
                          </span>
                          {card.requestedAt && (
                            <p className="text-[10px] text-gray-600 min-w-[80px] text-right">
                              {formatDate(card.requestedAt)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {/* Closure sequence legend */}
                    <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap gap-3 text-[10px] text-gray-500">
                      <span className="font-semibold text-gray-400">Sequence:</span>
                      {(['active', 'freeze_requested', 'in_closure', 'closed', 'charged_off'] as ClosureStage[]).map(s => (
                        <span key={s} className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${CLOSURE_STAGE_STYLES[s].dot}`} />
                          {CLOSURE_STAGE_STYLES[s].label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Counselor referrals */}
      <div className="rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">Counselor Referrals</h3>
          <p className="text-xs text-gray-400 mt-0.5">Approved third-party resources for hardship clients.</p>
        </div>
        <div className="p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COUNSELOR_REFS.map((ref) => (
            <div key={ref.id} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-100 text-sm">{ref.name}</p>
                  <p className="text-xs text-gray-500">{ref.organization}</p>
                </div>
                {ref.free && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-900 text-green-300 border border-green-700 flex-shrink-0">
                    Free
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">{ref.specialty}</p>
              <div className="flex gap-3 mt-auto pt-1">
                <a
                  href={`tel:${ref.phone.replace(/\D/g, '')}`}
                  className="text-xs text-[#C9A84C] hover:underline font-medium"
                >
                  {ref.phone}
                </a>
                <a
                  href={ref.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:underline font-medium ml-auto"
                >
                  Visit Site →
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
