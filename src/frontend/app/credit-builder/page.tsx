'use client';

// ============================================================
// /credit-builder — Business Credit Builder Track
// Integrates: client selector, business credit scores,
// DUNS steps with toggles, vendor table with drawer/filters,
// tradeline tracker, sub-progress, timeline, graduation banner
// ============================================================

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreditBuilderClientSelector,
  BusinessCreditScoresPanel,
  TradelineTracker,
  VendorDetailDrawer,
  VendorFilterBar,
  TradelineSubProgress,
  PaydexSubProgress,
  EstimatedProgressTimeline,
  GraduationBanner,
  MilestoneAlertSystem,
  checkMilestones,
} from '@/components/credit-builder';
import type { CBClient } from '@/components/credit-builder';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DunsStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  completedDate: string | null;
  estimatedDays: string;
  actionLabel?: string;
}

interface Net30Vendor {
  id: string;
  vendorName: string;
  category: string;
  bureausReported: string[];
  tier: 1 | 2 | 3;
  netTerms: number;
  creditLimit: string;
  requires: string;
  approvalDifficulty: 'easy' | 'moderate' | 'hard';
  applicationUrl?: string;
  reportingTimeline?: string;
  tips?: string[];
  setupGuide?: string[];
}

interface VendorDetailData {
  applicationUrl: string;
  setupGuide: string[];
  reportingTimeline: string;
  tips: string[];
  bureausReported: string[];
  typicalLimit: string;
  difficulty: string;
}

const VENDOR_DETAIL_MAP: Record<string, VendorDetailData> = {
  v_001: {
    applicationUrl: 'https://www.uline.com/CustomerService/NewAccount',
    setupGuide: [
      'Create a Uline business account at uline.com using your EIN and business address.',
      'Place your first order (minimum $50 recommended) and select Net-30 terms at checkout.',
      'Pay the invoice within 30 days — paying early accelerates your Paydex score.',
      'Repeat monthly orders for 3 months to establish a strong trade reference.',
    ],
    reportingTimeline: 'Uline reports to D&B within 30–60 days of your first paid invoice. Expect your Paydex to begin reflecting activity after 2 billing cycles.',
    tips: [
      'Order shipping supplies you actually need — boxes, tape, labels — to avoid waste.',
      'Pay invoices 10+ days early to push your Paydex toward the maximum 80 score.',
      'Keep your account in good standing — even one late payment resets your D&B history.',
    ],
    bureausReported: ['D&B'],
    typicalLimit: '$500–$5,000',
    difficulty: 'easy',
  },
};

interface SbssMilestone {
  id: number;
  title: string;
  target: string;
  description: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  achieved: boolean;
}

interface StackingCriteria {
  id: string;
  label: string;
  description: string;
  status: 'met' | 'in_progress' | 'not_started' | 'blocked';
  requiredForTier: number;
}

interface MilestoneAlert {
  id: string;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
  action?: { label: string; url: string };
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const DUNS_STEPS: DunsStep[] = [
  { id: 1, title: 'Register DUNS Number', description: 'Apply at Dun & Bradstreet. DUNS is required for all business credit activity.', completed: true, completedDate: '2026-01-09', estimatedDays: '1–3 days', actionLabel: 'Verify DUNS' },
  { id: 2, title: 'Establish Business Address & Phone', description: 'Ensure business address is a physical or registered agent address. Get a dedicated business phone line.', completed: true, completedDate: '2026-01-09', estimatedDays: 'Immediate' },
  { id: 3, title: 'Open Business Bank Account', description: 'Separate personal and business finances. Minimum 3 months of activity strengthens profile.', completed: true, completedDate: '2026-01-10', estimatedDays: '1 day', actionLabel: 'Record account' },
  { id: 4, title: 'Apply for Net-30 Vendor Accounts', description: 'Open at least 5 trade lines with Tier 1 vendors that report to Dun & Bradstreet.', completed: false, completedDate: null, estimatedDays: '2–4 weeks', actionLabel: 'View vendors' },
  { id: 5, title: 'Build Paydex Score to 80+', description: 'Pay all Net-30 invoices on time or early. Paydex 80+ is required for Tier 2 access.', completed: false, completedDate: null, estimatedDays: '60–90 days' },
  { id: 6, title: 'Apply for Business Credit Cards', description: 'Once Paydex hits 80 and 5+ trade lines are established, apply for business credit cards.', completed: false, completedDate: null, estimatedDays: '90+ days from start', actionLabel: 'View eligible cards' },
];

const NET30_VENDORS: Net30Vendor[] = [
  { id: 'v_001', vendorName: 'Uline', category: 'Shipping & Packaging', bureausReported: ['D&B'], tier: 1, netTerms: 30, creditLimit: '$500–$5,000', requires: 'EIN + Address', approvalDifficulty: 'easy', applicationUrl: 'https://uline.com' },
  { id: 'v_002', vendorName: 'Quill', category: 'Office Supplies', bureausReported: ['D&B', 'Experian Biz'], tier: 1, netTerms: 30, creditLimit: '$500–$3,000', requires: 'EIN + DUNS', approvalDifficulty: 'easy', applicationUrl: 'https://quill.com' },
  { id: 'v_003', vendorName: 'Grainger', category: 'Industrial / MRO', bureausReported: ['D&B', 'Experian Biz', 'Equifax Biz'], tier: 1, netTerms: 30, creditLimit: '$1,000–$10,000', requires: 'EIN + 1yr in business', approvalDifficulty: 'moderate', applicationUrl: 'https://grainger.com' },
  { id: 'v_004', vendorName: 'Crown Office Supplies', category: 'Office Supplies', bureausReported: ['D&B', 'Experian Biz', 'Equifax Biz'], tier: 1, netTerms: 30, creditLimit: '$100–$500', requires: 'EIN only', approvalDifficulty: 'easy', applicationUrl: 'https://crownofficesupplies.com' },
  { id: 'v_005', vendorName: 'Summa Office Supplies', category: 'Office Supplies', bureausReported: ['D&B', 'Experian Biz', 'Equifax Biz'], tier: 1, netTerms: 30, creditLimit: '$500–$2,000', requires: 'EIN only', approvalDifficulty: 'easy' },
  { id: 'v_006', vendorName: 'Home Depot Pro', category: 'Construction / Tools', bureausReported: ['D&B', 'Experian Biz'], tier: 2, netTerms: 30, creditLimit: '$5,000–$25,000', requires: 'Paydex 75+, 2+ trade lines', approvalDifficulty: 'moderate', applicationUrl: 'https://homedepot.com/pro' },
  { id: 'v_007', vendorName: 'Staples Business', category: 'Office Supplies', bureausReported: ['D&B', 'Experian Biz', 'Equifax Biz'], tier: 2, netTerms: 30, creditLimit: '$2,000–$10,000', requires: 'Paydex 70+', approvalDifficulty: 'moderate', applicationUrl: 'https://staples.com/business' },
  { id: 'v_008', vendorName: 'Costco Business Credit', category: 'Retail / Wholesale', bureausReported: ['Experian Biz'], tier: 3, netTerms: 30, creditLimit: '$10,000–$50,000', requires: 'Paydex 80+, 5+ trade lines', approvalDifficulty: 'hard', applicationUrl: 'https://costco.com/business' },
];

const SBSS_MILESTONES: SbssMilestone[] = [
  { id: 1, title: 'SBSS Score Established', target: 'Score > 0', description: 'Initial FICO SBSS score generated via 3+ business credit tradelines.', currentValue: 1, targetValue: 1, unit: 'score exists', achieved: true },
  { id: 2, title: 'SBA Loan Pre-screening Threshold', target: '≥ 140', description: 'Minimum SBSS to pass SBA automated pre-screening (7a/504 loans).', currentValue: 148, targetValue: 140, unit: 'pts', achieved: true },
  { id: 3, title: 'Preferred Lender Program Eligibility', target: '≥ 160', description: 'Score to qualify for SBA Preferred Lender expedited processing.', currentValue: 148, targetValue: 160, unit: 'pts', achieved: false },
  { id: 4, title: 'Tier 3 Stacking Unlock', target: '≥ 175', description: 'Internal threshold to unlock Tier 3 credit card stacking strategy.', currentValue: 148, targetValue: 175, unit: 'pts', achieved: false },
];

const STACKING_CRITERIA: StackingCriteria[] = [
  { id: 'sc_001', label: 'DUNS Registered & Active', description: 'D-U-N-S Number registered and at least 1 D&B tradeline reporting.', status: 'met', requiredForTier: 1 },
  { id: 'sc_002', label: '5+ Net-30 Trade Lines', description: 'Minimum 5 open trade lines with positive payment history.', status: 'in_progress', requiredForTier: 1 },
  { id: 'sc_003', label: 'Paydex Score ≥ 80', description: 'D&B Paydex at or above 80 (on-time payment average).', status: 'in_progress', requiredForTier: 1 },
  { id: 'sc_004', label: 'SBSS ≥ 140', description: 'FICO SBSS score at or above SBA pre-screen threshold.', status: 'met', requiredForTier: 2 },
  { id: 'sc_005', label: 'Experian Intelliscore ≥ 60', description: 'Experian Business Intelliscore in good standing.', status: 'in_progress', requiredForTier: 2 },
  { id: 'sc_006', label: 'Equifax Business Credit ≥ 500', description: 'Equifax Business Risk Score above 500.', status: 'not_started', requiredForTier: 2 },
  { id: 'sc_007', label: '2+ Years Business Age', description: 'Business entity must show 2+ years on credit reports.', status: 'not_started', requiredForTier: 3 },
  { id: 'sc_008', label: 'SBSS ≥ 175', description: 'FICO SBSS at Tier 3 stacking unlock threshold.', status: 'not_started', requiredForTier: 3 },
];

// Scores placeholder
const SCORES = { paydex: 72, paydexDate: '2026-03-14', experianBusiness: 54, experianDate: '2026-03-14', sbss: 148, sbssDate: '2026-03-14' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function difficultyBadge(d: string): string {
  if (d === 'easy') return 'bg-green-900 text-green-300 border-green-700';
  if (d === 'moderate') return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  return 'bg-red-900 text-red-300 border-red-700';
}

function tierBadge(tier: number): string {
  if (tier === 1) return 'bg-blue-900 text-blue-300 border-blue-700';
  if (tier === 2) return 'bg-purple-900 text-purple-300 border-purple-700';
  return 'bg-orange-900 text-orange-300 border-orange-700';
}

function criteriaStatusBadge(status: string): { cls: string; label: string } {
  const map: Record<string, { cls: string; label: string }> = {
    met: { cls: 'bg-green-900 text-green-300 border-green-700', label: 'Met' },
    in_progress: { cls: 'bg-yellow-900 text-yellow-300 border-yellow-700', label: 'In Progress' },
    not_started: { cls: 'bg-gray-800 text-gray-500 border-gray-700', label: 'Not Started' },
    blocked: { cls: 'bg-red-900 text-red-300 border-red-700', label: 'Blocked' },
  };
  return map[status] ?? map.not_started;
}

function criteriaIcon(status: string): string {
  if (status === 'met') return '✓';
  if (status === 'in_progress') return '◑';
  if (status === 'blocked') return '✗';
  return '○';
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CreditBuilderPage() {
  const router = useRouter();
  const [selectedClient, setSelectedClient] = useState<CBClient | null>(null);
  const [dunsSteps, setDunsSteps] = useState<DunsStep[]>(DUNS_STEPS);
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [bureauFilter, setBureauFilter] = useState<string>('all');
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<Net30Vendor | null>(null);
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<MilestoneAlert[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [prefillVendor, setPrefillVendor] = useState<string | null>(null);

  const completedCount = dunsSteps.filter((s) => s.completed).length;
  const overallProgress = Math.round((completedCount / dunsSteps.length) * 100);
  const metCount = STACKING_CRITERIA.filter((c) => c.status === 'met').length;
  const tradelineCount = 2; // placeholder
  const tier1Unlocked = SCORES.paydex >= 80 && tradelineCount >= 5 && completedCount >= 3;

  const toggleStep = useCallback((id: number) => {
    setDunsSteps((prev) =>
      prev.map((s) => s.id === id ? { ...s, completed: !s.completed, completedDate: !s.completed ? new Date().toISOString() : null } : s)
    );
  }, []);

  const handleStepAction = useCallback((step: DunsStep) => {
    if (step.id === 4) {
      document.getElementById('vendor-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTierFilter('1');
    } else if (step.id === 6) {
      router.push(selectedClient ? `/optimizer?client_id=${selectedClient.id}&from=credit-builder` : '/optimizer');
    }
  }, [router, selectedClient]);

  const filteredVendors = NET30_VENDORS.filter((v) => {
    const matchTier = tierFilter === 'all' || v.tier === Number(tierFilter);
    const matchBureau = bureauFilter === 'all' || v.bureausReported.some(b => b.toLowerCase().includes(bureauFilter));
    const matchSearch = !vendorSearch || v.vendorName.toLowerCase().includes(vendorSearch.toLowerCase());
    return matchTier && matchBureau && matchSearch;
  });

  const criteriaByTier = (tier: number) => STACKING_CRITERIA.filter((c) => c.requiredForTier === tier);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* Milestone Alerts */}
      <MilestoneAlertSystem alerts={alerts} onDismiss={(id) => setAlerts(prev => prev.filter(a => a.id !== id))} />

      {/* Graduation Banner */}
      <GraduationBanner clientId={selectedClient?.id ?? null} clientName={selectedClient?.legal_name ?? null} tier={1} isUnlocked={tier1Unlocked} />

      {/* ── Client Selector ──────────────────────────────────────── */}
      <CreditBuilderClientSelector
        selectedClient={selectedClient}
        onClientSelect={setSelectedClient}
        onClear={() => setSelectedClient(null)}
      />

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Business Credit Builder</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {completedCount}/{dunsSteps.length} DUNS steps complete · {metCount}/{STACKING_CRITERIA.length} stacking criteria met
            {selectedClient && <span className="text-yellow-400"> — {selectedClient.legal_name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-500">Overall Progress</p>
            <p className="text-xl font-bold text-yellow-400">{overallProgress}%</p>
          </div>
          <div className="w-20 h-2 rounded-full bg-gray-800">
            <div className="h-full rounded-full bg-yellow-600 transition-all" style={{ width: `${overallProgress}%` }} />
          </div>
        </div>
      </div>

      {/* ── Business Credit Scores ───────────────────────────────── */}
      <BusinessCreditScoresPanel
        clientName={selectedClient?.legal_name ?? null}
        paydex={SCORES.paydex} paydexDate={SCORES.paydexDate}
        experianBusiness={SCORES.experianBusiness} experianDate={SCORES.experianDate}
        sbss={SCORES.sbss} sbssDate={SCORES.sbssDate}
      />

      {/* ── DUNS Registration Steps ──────────────────────────────── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-200">DUNS Registration Track</h2>
            <p className="text-xs text-gray-500 mt-0.5">6 foundational steps to establish D&B credit profile</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 rounded-full bg-gray-800">
              <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${overallProgress}%` }} />
            </div>
            <span className="text-sm font-semibold text-green-400">{completedCount}/{dunsSteps.length}</span>
          </div>
        </div>
        <div className="space-y-2">
          {dunsSteps.map((step) => (
            <div key={step.id} className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${step.completed ? 'border-green-800 bg-green-900/20' : 'border-gray-800 bg-gray-900/50 hover:bg-gray-900'}`}>
              <button onClick={() => toggleStep(step.id)} aria-label={step.completed ? 'Mark incomplete' : 'Mark complete'} className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${step.completed ? 'bg-green-600 border-green-500 text-white' : 'border-gray-600 text-transparent hover:border-green-600'}`}>
                <span className="text-xs font-bold leading-none">✓</span>
              </button>
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center mt-0.5">
                <span className="text-xs font-bold text-gray-400">{step.id}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${step.completed ? 'text-green-300 line-through opacity-70' : 'text-gray-100'}`}>{step.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.description}</p>
                {step.completed && step.completedDate && (
                  <p className="text-xs text-green-500 mt-1">Completed {formatDate(step.completedDate)}</p>
                )}
                {step.id === 4 && !step.completed && <div className="mt-2"><TradelineSubProgress current={tradelineCount} target={5} /></div>}
                {step.id === 5 && !step.completed && <div className="mt-2"><PaydexSubProgress currentScore={SCORES.paydex} targetScore={80} /></div>}
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-gray-500 whitespace-nowrap">{step.estimatedDays}</p>
                {step.actionLabel && !step.completed && (
                  <button onClick={() => handleStepAction(step)} className="mt-1 text-xs text-yellow-500 hover:text-yellow-400 hover:underline">
                    {step.actionLabel} →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vendor Filter Bar ────────────────────────────────────── */}
      <div id="vendor-table">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-200">Net-30 Vendor Recommendations</h2>
            <p className="text-xs text-gray-500 mt-0.5">Vetted vendors that report to business credit bureaus · Click a row for details</p>
          </div>
        </div>
        <VendorFilterBar
          tierFilter={tierFilter} onTierChange={setTierFilter}
          bureauFilter={bureauFilter} onBureauChange={setBureauFilter}
          searchQuery={vendorSearch} onSearchChange={setVendorSearch}
        />

        {/* Vendor Table */}
        <div className="rounded-xl border border-gray-800 overflow-x-auto mt-3">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Vendor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Bureaus</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tier</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Credit Limit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Requires</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Difficulty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredVendors.map((v) => {
                const isExpanded = expandedVendorId === v.id;
                const detail = VENDOR_DETAIL_MAP[v.id];
                return (
                  <React.Fragment key={v.id}>
                    <tr
                      className={`hover:bg-gray-900/60 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-900/60' : ''}`}
                      onClick={() => setExpandedVendorId(isExpanded ? null : v.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-gray-500 transition-transform text-xs ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                          <div><p className="font-semibold text-white">{v.vendorName}</p><p className="text-xs text-gray-500">Net-{v.netTerms}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{v.category}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{v.bureausReported.map((b) => (<span key={b} className="text-xs bg-blue-900/50 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded">{b}</span>))}</div></td>
                      <td className="px-4 py-3 text-center"><span className={`text-xs font-bold px-2 py-0.5 rounded border ${tierBadge(v.tier)}`}>Tier {v.tier}</span></td>
                      <td className="px-4 py-3 text-xs text-gray-300">{v.creditLimit}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{v.requires}</td>
                      <td className="px-4 py-3 text-center"><span className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${difficultyBadge(v.approvalDifficulty)}`}>{v.approvalDifficulty}</span></td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="px-0 py-0">
                          <div className="bg-gray-900/80 border-t border-b border-gray-700 px-6 py-5">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              {/* Column 1: Details */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vendor Details</h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between"><span className="text-gray-500">Application URL</span>{v.applicationUrl ? <a href={v.applicationUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate ml-2">{v.applicationUrl.replace('https://', '')}</a> : <span className="text-gray-600">N/A</span>}</div>
                                  <div className="flex justify-between"><span className="text-gray-500">Bureaus</span><span className="text-gray-200">{v.bureausReported.join(', ')}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Typical Limit</span><span className="text-gray-200">{detail?.typicalLimit ?? v.creditLimit}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Difficulty</span><span className={`font-semibold capitalize ${v.approvalDifficulty === 'easy' ? 'text-green-400' : v.approvalDifficulty === 'moderate' ? 'text-yellow-400' : 'text-red-400'}`}>{v.approvalDifficulty}</span></div>
                                </div>
                                {detail?.reportingTimeline && (
                                  <div className="mt-3">
                                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Reporting Timeline</h5>
                                    <p className="text-xs text-gray-400 leading-relaxed">{detail.reportingTimeline}</p>
                                  </div>
                                )}
                              </div>
                              {/* Column 2: Setup Guide */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Setup Guide</h4>
                                {detail?.setupGuide ? (
                                  <ol className="space-y-2">
                                    {detail.setupGuide.map((step, idx) => (
                                      <li key={idx} className="flex gap-2 text-xs">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">{idx + 1}</span>
                                        <span className="text-gray-300 leading-relaxed">{step}</span>
                                      </li>
                                    ))}
                                  </ol>
                                ) : (
                                  <ol className="space-y-2 text-xs text-gray-400">
                                    <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">1</span>Visit {v.vendorName} website and create a business account.</li>
                                    <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">2</span>Submit business credit application with EIN and DUNS.</li>
                                    <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">3</span>Place first Net-{v.netTerms} order to activate tradeline.</li>
                                    <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">4</span>Pay invoice on time or early for positive reporting.</li>
                                  </ol>
                                )}
                              </div>
                              {/* Column 3: Tips + Action */}
                              <div className="space-y-3">
                                {detail?.tips && detail.tips.length > 0 && (
                                  <>
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tips</h4>
                                    <ul className="space-y-1.5">
                                      {detail.tips.map((tip, idx) => (
                                        <li key={idx} className="flex gap-2 text-xs">
                                          <span className="text-yellow-500 flex-shrink-0 mt-0.5">&#9679;</span>
                                          <span className="text-gray-300 leading-relaxed">{tip}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                <div className="pt-3 flex flex-col gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setPrefillVendor(v.vendorName); setShowAddModal(true); }}
                                    className="w-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-4 py-2.5 transition-colors"
                                  >
                                    + Add to My Tradelines
                                  </button>
                                  {v.applicationUrl && (
                                    <a
                                      href={v.applicationUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full text-center text-sm font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg px-4 py-2 transition-colors"
                                    >
                                      Apply Now &#x2197;
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tradeline Tracker ────────────────────────────────────── */}
      <TradelineTracker
        clientId={selectedClient?.id ?? null}
        clientName={selectedClient?.legal_name ?? null}
        prefillVendor={prefillVendor}
        showAddModal={showAddModal}
        onCloseAddModal={() => { setShowAddModal(false); setPrefillVendor(null); }}
      />

      {/* ── SBSS Milestones + Stacking Criteria side-by-side ───── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* SBSS Milestones */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">SBSS Milestone Progress</h2>
          <p className="text-xs text-gray-500 mb-5">FICO Small Business Scoring Service score targets</p>
          <div className="space-y-5">
            {SBSS_MILESTONES.map((m) => {
              const pct = Math.min(Math.round((m.currentValue / m.targetValue) * 100), 100);
              const barColor = m.achieved ? 'bg-green-600' : pct >= 70 ? 'bg-yellow-600' : 'bg-blue-700';
              return (
                <div key={m.id}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${m.achieved ? 'bg-green-700 text-green-200' : 'bg-gray-700 text-gray-400'}`}>{m.achieved ? '✓' : m.id}</span>
                      <p className={`text-sm font-semibold ${m.achieved ? 'text-green-300' : 'text-gray-200'}`}>{m.title}</p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">{m.target}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2 ml-7">{m.description}</p>
                  <div className="ml-7">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1"><span>{m.currentValue} {m.unit}</span><span>{m.targetValue} {m.unit}</span></div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden"><div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-gray-800 text-xs text-gray-500">
            Current SBSS: <span className="text-yellow-400 font-bold text-sm">148</span><span className="mx-2">·</span>Next milestone: 160
          </div>
        </section>

        {/* Stacking Unlock Criteria */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">Stacking Unlock Criteria</h2>
          <p className="text-xs text-gray-500 mb-5">Requirements to unlock each credit stacking tier</p>
          {[1, 2, 3].map((tier) => {
            const items = criteriaByTier(tier);
            const metItems = items.filter((c) => c.status === 'met').length;
            const allMet = metItems === items.length;
            return (
              <div key={tier} className="mb-5 last:mb-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${tierBadge(tier)}`}>Tier {tier}</span>
                    <span className={`text-xs font-semibold ${allMet ? 'text-green-400' : 'text-gray-400'}`}>{allMet ? 'Unlocked' : `${metItems}/${items.length} criteria met`}</span>
                  </div>
                  {allMet && <span className="text-xs bg-green-900 text-green-300 border border-green-700 px-2 py-0.5 rounded">UNLOCKED</span>}
                </div>
                <div className="space-y-2 pl-1">
                  {items.map((c) => {
                    const { cls, label } = criteriaStatusBadge(c.status);
                    return (
                      <div key={c.id} className={`flex items-start gap-3 p-2.5 rounded-lg border ${c.status === 'met' ? 'border-green-900 bg-green-900/10' : 'border-gray-800 bg-gray-900/40'}`}>
                        <span className={`mt-0.5 text-sm font-bold flex-shrink-0 w-4 text-center ${c.status === 'met' ? 'text-green-400' : c.status === 'in_progress' ? 'text-yellow-400' : 'text-gray-600'}`}>{criteriaIcon(c.status)}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${c.status === 'met' ? 'text-green-300' : 'text-gray-300'}`}>{c.label}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{c.description}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${cls}`}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {/* ── Estimated Progress Timeline ──────────────────────────── */}
      <EstimatedProgressTimeline
        paydex={SCORES.paydex}
        tradelineCount={tradelineCount}
        experianBusiness={SCORES.experianBusiness}
        sbss={SCORES.sbss}
        businessAgeMonths={36}
      />

      {/* ── Vendor Detail Drawer ─────────────────────────────────── */}
      <VendorDetailDrawer
        vendor={selectedVendor ? {
          name: selectedVendor.vendorName,
          category: selectedVendor.category,
          tier: `Tier ${selectedVendor.tier}`,
          reportsTo: selectedVendor.bureausReported.join(', '),
          creditLimit: selectedVendor.creditLimit,
          difficulty: selectedVendor.approvalDifficulty,
          requirements: selectedVendor.requires,
          applicationUrl: selectedVendor.applicationUrl,
        } : null}
        isOpen={!!selectedVendor}
        onClose={() => setSelectedVendor(null)}
        onTrack={() => { setSelectedVendor(null); }}
      />
    </div>
  );
}
