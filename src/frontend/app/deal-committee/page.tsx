'use client';

// ============================================================
// /deal-committee — Deal Committee Workspace
// Pending reviews queue with risk tier badges, red-flag
// checklist, conditional approval conditions tracker,
// counsel/accountant signoff status, committee voting panel.
// Stats: pending reviews, avg review time, approval rate.
// ============================================================

import { useState } from 'react';
// RedFlagChecklist component available for future integration
// import RedFlagChecklist, { type ChecklistItemState } from '../../components/modules/red-flag-checklist';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskTier = 'tier1' | 'tier2' | 'tier3' | 'tier4';
type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'conditionally_approved' | 'declined';
type VoteValue = 'approve' | 'approve_with_conditions' | 'decline' | 'abstain';
type SignoffRole = 'counsel' | 'accountant' | 'compliance_officer' | 'senior_underwriter';

interface PendingReview {
  id: string;
  businessName: string;
  requestedAmount: number;
  riskTier: RiskTier;
  status: ReviewStatus;
  assignedTo: string;
  submittedAt: string;
  daysInQueue: number;
  redFlagCount: number;
  warningCount: number;
  slaHoursRemaining?: number;
  reviewers?: string[];
}

interface ConditionalApproval {
  id: string;
  condition: string;
  status: 'open' | 'met' | 'waived';
  dueDate: string;
  assignedTo: string;
  note?: string;
}

interface SignoffRecord {
  role: SignoffRole;
  name: string;
  status: 'pending' | 'signed' | 'rejected';
  signedAt?: string;
  comment?: string;
}

interface CommitteeVote {
  member: string;
  role: string;
  vote: VoteValue | null;
  comment?: string;
  votedAt?: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_DEALS = [
  { id: 'deal_001', name: 'Apex Ventures LLC — Series A Bridge' },
  { id: 'deal_002', name: 'Summit Capital Group — Working Capital' },
  { id: 'deal_003', name: 'Blue Ridge Consulting — Expansion Line' },
  { id: 'deal_004', name: 'NovaTech Solutions Inc. — Equipment Lease' },
  { id: 'deal_005', name: 'Pinnacle Freight Corp — Fleet Financing' },
];

const COMMITTEE_MEMBERS = [
  'Ana Reyes',
  'Marcus Chen',
  'Sofia Park',
];

const PLACEHOLDER_REVIEWS: PendingReview[] = [
  { id: 'rev_001', businessName: 'Apex Ventures LLC',         requestedAmount: 250000, riskTier: 'tier2', status: 'in_review',              assignedTo: 'Ana Reyes',    submittedAt: '2026-03-28', daysInQueue: 3, redFlagCount: 0, warningCount: 2, slaHoursRemaining: 44, reviewers: ['Ana Reyes', 'Marcus Chen'] },
  { id: 'rev_002', businessName: 'Summit Capital Group',      requestedAmount: 500000, riskTier: 'tier1', status: 'pending',                 assignedTo: 'Marcus Chen',  submittedAt: '2026-03-29', daysInQueue: 2, redFlagCount: 0, warningCount: 1, slaHoursRemaining: 68, reviewers: ['Marcus Chen'] },
  { id: 'rev_003', businessName: 'Blue Ridge Consulting',     requestedAmount: 180000, riskTier: 'tier3', status: 'pending',                 assignedTo: 'Sofia Park',   submittedAt: '2026-03-30', daysInQueue: 1, redFlagCount: 1, warningCount: 1, slaHoursRemaining: 20, reviewers: ['Sofia Park'] },
  { id: 'rev_004', businessName: 'NovaTech Solutions Inc.',   requestedAmount: 320000, riskTier: 'tier2', status: 'conditionally_approved',  assignedTo: 'Ana Reyes',    submittedAt: '2026-03-25', daysInQueue: 6, redFlagCount: 0, warningCount: 0, slaHoursRemaining: 96, reviewers: ['Ana Reyes'] },
  { id: 'rev_005', businessName: 'Pinnacle Freight Corp',     requestedAmount: 750000, riskTier: 'tier1', status: 'in_review',              assignedTo: 'Marcus Chen',  submittedAt: '2026-03-27', daysInQueue: 4, redFlagCount: 0, warningCount: 3, slaHoursRemaining: 8,  reviewers: ['Marcus Chen', 'Sofia Park'] },
  { id: 'rev_006', businessName: 'Horizon Retail Partners',   requestedAmount: 95000,  riskTier: 'tier4', status: 'pending',                 assignedTo: 'Sofia Park',   submittedAt: '2026-03-31', daysInQueue: 0, redFlagCount: 2, warningCount: 1, slaHoursRemaining: 72, reviewers: ['Sofia Park'] },
];

const PLACEHOLDER_CONDITIONS: ConditionalApproval[] = [
  { id: 'cond_001', condition: 'Provide 6 months personal bank statements for primary guarantor', status: 'open',   dueDate: '2026-04-05', assignedTo: 'Client',      note: 'Initial request sent 2026-03-30.' },
  { id: 'cond_002', condition: 'Resolution letter for 2025 NY AG inquiry provided by legal counsel', status: 'open', dueDate: '2026-04-10', assignedTo: 'Counsel',    note: 'Awaiting Greenberg Traurig response.' },
  { id: 'cond_003', condition: 'CPA-certified P&L for FY 2025 on file', status: 'met',    dueDate: '2026-03-28', assignedTo: 'Client',  note: 'Received and reviewed 2026-03-27.' },
  { id: 'cond_004', condition: 'DTI re-verification after debt payoff confirmation', status: 'waived', dueDate: '2026-04-01', assignedTo: 'Underwriter', note: 'Waived — compensating assets documented.' },
];

const PLACEHOLDER_SIGNOFFS: SignoffRecord[] = [
  { role: 'counsel',             name: 'Jordan Blake, Esq.',   status: 'signed',  signedAt: '2026-03-30T16:00:00Z', comment: 'Legal review complete. No material issues.' },
  { role: 'accountant',          name: 'Dr. Patricia Osei',    status: 'signed',  signedAt: '2026-03-30T17:30:00Z', comment: 'Financials verified. Revenue credible.' },
  { role: 'compliance_officer',  name: 'Marcus Chen',          status: 'pending', signedAt: undefined,              comment: undefined },
  { role: 'senior_underwriter',  name: 'Ana Reyes',            status: 'signed',  signedAt: '2026-03-31T09:00:00Z', comment: 'DTI borderline but approachable with conditions.' },
];

const PLACEHOLDER_VOTES: CommitteeVote[] = [
  { member: 'Diana Walsh',  role: 'Chief Credit Officer',     vote: 'approve_with_conditions', comment: 'Approve subject to NY AG resolution.',         votedAt: '2026-03-31T10:00:00Z' },
  { member: 'Raj Patel',    role: 'Managing Director',         vote: 'approve',                 comment: 'Strong revenue profile. Proceed.',             votedAt: '2026-03-31T10:15:00Z' },
  { member: 'Sofia Park',   role: 'Senior Risk Analyst',       vote: null,                      comment: undefined,                                      votedAt: undefined },
  { member: 'Tom Nguyen',   role: 'Compliance Director',       vote: 'abstain',                 comment: 'Recused — prior advisory relationship.',       votedAt: '2026-03-31T10:30:00Z' },
];

// Red flag criteria extended data for expand
const RED_FLAG_CRITERIA_DATA: Record<string, { dataSource: string; actualValue: string; threshold: string }> = {
  rf_01: { dataSource: 'KYC Engine v3.1', actualValue: '3 owners identified, all verified', threshold: 'All owners >= 25% stake verified' },
  rf_02: { dataSource: 'PACER / LexisNexis', actualValue: 'No filings found', threshold: 'Zero active bankruptcy proceedings' },
  rf_03: { dataSource: 'Experian Pull 03/29', actualValue: 'FICO 672', threshold: 'FICO >= 680' },
  rf_04: { dataSource: 'Secretary of State Filing', actualValue: 'Incorporated 2019-06-14 (6.8 yrs)', threshold: '>= 2 years operating' },
  rf_05: { dataSource: 'Bank Statement Analysis', actualValue: '$142K avg monthly deposits', threshold: '3+ months verified statements' },
  rf_06: { dataSource: 'OFAC SDN List / EU Sanctions DB', actualValue: 'No matches', threshold: 'Zero matches' },
  rf_07: { dataSource: 'Compliance Engine / CFPB / FTC', actualValue: '1 active NY AG inquiry (2025)', threshold: 'Zero active actions' },
  rf_08: { dataSource: 'Secretary of State Filing', actualValue: 'LLC — Delaware', threshold: 'LLC, S-Corp, C-Corp or equivalent' },
  rf_09: { dataSource: 'Debt Service Calculator v2', actualValue: 'DTI 47%', threshold: 'DTI < 50%' },
  rf_10: { dataSource: 'Industry Classification Engine', actualValue: 'Pending review', threshold: 'SIC/NAICS not on restricted list' },
};

// ---------------------------------------------------------------------------
// Helpers & config
// ---------------------------------------------------------------------------

const RISK_TIER_CONFIG: Record<RiskTier, { label: string; badgeClass: string; dotClass: string }> = {
  tier1: { label: 'Tier I',  badgeClass: 'bg-green-900 text-green-300 border-green-700',   dotClass: 'bg-green-400' },
  tier2: { label: 'Tier II', badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700', dotClass: 'bg-yellow-400' },
  tier3: { label: 'Tier III',badgeClass: 'bg-orange-900 text-orange-300 border-orange-700', dotClass: 'bg-orange-400' },
  tier4: { label: 'Tier IV', badgeClass: 'bg-red-900 text-red-300 border-red-700',          dotClass: 'bg-red-400' },
};

const REVIEW_STATUS_CONFIG: Record<ReviewStatus, { label: string; badgeClass: string }> = {
  pending:                 { label: 'Pending',           badgeClass: 'bg-gray-800 text-gray-300 border-gray-700' },
  in_review:               { label: 'In Review',         badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  approved:                { label: 'Approved',          badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  conditionally_approved:  { label: 'Cond. Approved',    badgeClass: 'bg-teal-900 text-teal-300 border-teal-700' },
  declined:                { label: 'Declined',          badgeClass: 'bg-red-900 text-red-300 border-red-700' },
};

const VOTE_CONFIG: Record<VoteValue, { label: string; badgeClass: string }> = {
  approve:                 { label: 'Approve',               badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  approve_with_conditions: { label: 'Approve w/ Conditions', badgeClass: 'bg-teal-900 text-teal-300 border-teal-700' },
  decline:                 { label: 'Decline',               badgeClass: 'bg-red-900 text-red-300 border-red-700' },
  abstain:                 { label: 'Abstain',               badgeClass: 'bg-gray-800 text-gray-400 border-gray-700' },
};

const SIGNOFF_ROLE_LABELS: Record<SignoffRole, string> = {
  counsel:            'Legal Counsel',
  accountant:         'Accountant / CPA',
  compliance_officer: 'Compliance Officer',
  senior_underwriter: 'Senior Underwriter',
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function formatDateTime(iso: string) {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

type WorkspaceTab = 'queue' | 'checklist' | 'conditions' | 'signoffs' | 'voting';

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3">
        <span className="text-green-400 font-bold text-sm">&#10003;</span>
        <span className="text-sm text-gray-100">{message}</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 ml-2 text-lg leading-none">&times;</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal backdrop
// ---------------------------------------------------------------------------

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, valueClass = 'text-white' }: { label: string; value: string | number; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">{label}</p>
      <p className={`text-3xl font-black ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function ReviewQueueTable({
  reviews,
  selectedId,
  onSelect,
}: {
  reviews: PendingReview[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  function getRiskStatusBadge(r: PendingReview) {
    if (r.redFlagCount > 0) return { emoji: '\uD83D\uDD34', label: 'Blocked', cls: 'bg-red-900 text-red-300 border-red-700' };
    if (r.warningCount > 0) return { emoji: '\u26A0\uFE0F', label: 'Warning', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' };
    return { emoji: '\uD83D\uDFE2', label: 'Clear', cls: 'bg-green-900 text-green-300 border-green-700' };
  }

  return (
    <div className="overflow-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900">
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Business</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Amount</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Risk Tier</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Risk Status</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Assigned</th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">SLA (hrs)</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => {
            const tierCfg = RISK_TIER_CONFIG[r.riskTier];
            const statusCfg = REVIEW_STATUS_CONFIG[r.status];
            const riskBadge = getRiskStatusBadge(r);
            const isSelected = r.id === selectedId;
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`border-b border-gray-800 cursor-pointer transition-colors ${isSelected ? 'bg-[#0A1628] border-l-2 border-l-[#C9A84C]' : 'bg-gray-900 hover:bg-gray-800'}`}
              >
                <td className="py-3 px-4">
                  <p className="font-semibold text-gray-100">{r.businessName}</p>
                  <p className="text-xs text-gray-500">Submitted {r.submittedAt}</p>
                </td>
                <td className="py-3 px-4 text-gray-200 font-semibold">{formatCurrency(r.requestedAmount)}</td>
                <td className="py-3 px-4">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${tierCfg.badgeClass}`}>
                    {tierCfg.label}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${riskBadge.cls}`}>
                    {riskBadge.emoji} {riskBadge.label}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
                    {statusCfg.label}
                  </span>
                </td>
                <td className="py-3 px-4 text-xs text-gray-400">{r.assignedTo}</td>
                <td className="py-3 px-4 text-right">
                  <span className={`text-xs font-bold ${(r.slaHoursRemaining ?? 0) <= 12 ? 'text-red-400' : (r.slaHoursRemaining ?? 0) <= 24 ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {r.slaHoursRemaining ?? '—'}h
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConditionsTracker({
  conditions,
  onToggle,
  onMarkMet,
}: {
  conditions: ConditionalApproval[];
  onToggle: (id: string, status: ConditionalApproval['status']) => void;
  onMarkMet: (id: string) => void;
}) {
  const STATUS_CFG = {
    open:   { label: 'Open',   cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
    met:    { label: 'Met',    cls: 'bg-green-900 text-green-300 border-green-700' },
    waived: { label: 'Waived', cls: 'bg-gray-800 text-gray-400 border-gray-600' },
  };

  return (
    <div className="space-y-3">
      {conditions.map((c) => {
        const cfg = STATUS_CFG[c.status];
        return (
          <div key={c.id} className={`rounded-xl border p-4 ${c.status === 'open' ? 'border-yellow-800 bg-yellow-950/20' : c.status === 'met' ? 'border-green-800 bg-green-950/20' : 'border-gray-700 bg-gray-900'}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-gray-100 flex-1">{c.condition}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.cls}`}>
                {cfg.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
              <span>Due <span className="text-gray-300">{c.dueDate}</span></span>
              <span>Assigned to <span className="text-gray-300">{c.assignedTo}</span></span>
            </div>
            {c.note && <p className="text-xs text-gray-400 italic">{c.note}</p>}
            {c.status === 'open' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => onMarkMet(c.id)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-800 hover:bg-green-700 text-green-200 transition-colors">
                  Mark Met
                </button>
                <button onClick={() => onToggle(c.id, 'waived')} className="px-3 py-1 rounded-lg text-xs font-semibold border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
                  Waive
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SignoffPanel({ signoffs, onSign, onDecline }: { signoffs: SignoffRecord[]; onSign: (role: SignoffRole) => void; onDecline: (role: SignoffRole) => void }) {
  const allSigned = signoffs.every((s) => s.status === 'signed');

  return (
    <div className="space-y-3">
      {/* Overall status */}
      <div className={`rounded-xl border p-4 mb-2 ${allSigned ? 'border-green-800 bg-green-950/30' : 'border-yellow-800 bg-yellow-950/20'}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${allSigned ? 'bg-green-400' : 'bg-yellow-400'}`} />
          <p className={`text-sm font-semibold ${allSigned ? 'text-green-300' : 'text-yellow-300'}`}>
            {allSigned ? 'All signoffs complete — deal eligible for committee vote' : `${signoffs.filter((s) => s.status === 'pending').length} signoff(s) outstanding`}
          </p>
        </div>
      </div>

      {signoffs.map((s) => {
        const isSigned = s.status === 'signed';
        const isRejected = s.status === 'rejected';
        return (
          <div key={s.role} className={`rounded-xl border p-4 ${isSigned ? 'border-gray-700 bg-gray-900' : isRejected ? 'border-red-800 bg-red-950/10' : 'border-yellow-800 bg-yellow-950/10'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-gray-300">{s.name}</span>
                  <span className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded">
                    {SIGNOFF_ROLE_LABELS[s.role]}
                  </span>
                </div>
                {s.comment && <p className="text-xs text-gray-400 mt-1 italic">&quot;{s.comment}&quot;</p>}
                {s.signedAt && <p className="text-[10px] text-gray-600 mt-1">{formatDateTime(s.signedAt)}</p>}
              </div>
              <div className="flex-shrink-0">
                {isSigned ? (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-green-900 text-green-300 border-green-700">
                    &#10003; Signed {s.signedAt ? formatDate(s.signedAt) : ''}
                  </span>
                ) : isRejected ? (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-red-900 text-red-300 border-red-700">
                    Declined
                  </span>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSign(s.role)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
                    >
                      Sign Off
                    </button>
                    <button
                      onClick={() => onDecline(s.role)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold border border-red-700 text-red-400 hover:bg-red-900 transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VotingPanel({ votes, onVote }: { votes: CommitteeVote[]; onVote: (member: string, vote: VoteValue) => void }) {
  const castVotes = votes.filter((v) => v.vote !== null);
  const approveCount = castVotes.filter((v) => v.vote === 'approve' || v.vote === 'approve_with_conditions').length;
  const declineCount = castVotes.filter((v) => v.vote === 'decline').length;
  const abstainCount = castVotes.filter((v) => v.vote === 'abstain').length;
  const pendingCount = votes.filter((v) => v.vote === null).length;
  const totalEligible = votes.length - abstainCount;
  const majorityReached = approveCount > Math.floor(totalEligible / 2);
  const allVotesCast = pendingCount === 0;

  return (
    <div className="space-y-4">
      {/* Tally */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Approve',  value: approveCount,  cls: 'text-green-400' },
          { label: 'Decline',  value: declineCount,  cls: 'text-red-400' },
          { label: 'Abstain',  value: abstainCount,  cls: 'text-gray-400' },
          { label: 'Pending',  value: pendingCount,  cls: 'text-yellow-400' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
            <p className={`text-2xl font-black ${cls}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Outcome summary when all votes are cast */}
      {allVotesCast && (
        <div className={`rounded-xl border p-4 text-center ${majorityReached ? 'border-green-800 bg-green-950/30' : 'border-red-800 bg-red-950/30'}`}>
          <p className={`text-xl font-black ${majorityReached ? 'text-green-400' : 'text-red-400'}`}>
            {majorityReached ? 'APPROVED' : 'DECLINED'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {approveCount} approve / {declineCount} decline / {abstainCount} abstain ({votes.length} total votes)
          </p>
        </div>
      )}

      {/* Majority indicator (while votes still pending) */}
      {!allVotesCast && castVotes.length > 0 && (
        <div className={`rounded-xl border p-3 text-center text-sm font-semibold ${majorityReached ? 'border-green-800 bg-green-950/30 text-green-300' : 'border-gray-700 bg-gray-900 text-gray-400'}`}>
          {majorityReached ? 'Majority reached — deal approved by committee' : 'Majority not yet reached'}
        </div>
      )}

      {/* Vote rows */}
      <div className="space-y-3">
        {votes.map((v) => (
          <div key={v.member} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-gray-100">{v.member}</p>
                  <span className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded">
                    {v.role}
                  </span>
                </div>
                {v.comment && <p className="text-xs text-gray-400 italic mt-1">&quot;{v.comment}&quot;</p>}
                {v.votedAt && <p className="text-[10px] text-gray-600 mt-1">{formatDateTime(v.votedAt)}</p>}
              </div>
              <div className="flex-shrink-0">
                {v.vote !== null ? (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${VOTE_CONFIG[v.vote].badgeClass}`}>
                    {VOTE_CONFIG[v.vote].label}
                  </span>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => onVote(v.member, 'approve')}
                      className="px-3 py-1 rounded text-xs font-semibold border border-green-700 text-green-300 hover:bg-green-900 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => onVote(v.member, 'decline')}
                      className="px-3 py-1 rounded text-xs font-semibold border border-red-700 text-red-300 hover:bg-red-900 transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DealCommitteePage() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('queue');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>('rev_001');
  const [reviews, setReviews] = useState<PendingReview[]>(PLACEHOLDER_REVIEWS);
  const [conditions, setConditions] = useState<ConditionalApproval[]>(PLACEHOLDER_CONDITIONS);
  const [signoffs, setSignoffs] = useState<SignoffRecord[]>(PLACEHOLDER_SIGNOFFS);
  const [votes, setVotes] = useState<CommitteeVote[]>(PLACEHOLDER_VOTES);

  // Toast state
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // --- Modal: Assign Review ---
  const [showAssignReview, setShowAssignReview] = useState(false);
  const [assignDeal, setAssignDeal] = useState(PLACEHOLDER_DEALS[0].id);
  const [assignTier, setAssignTier] = useState<RiskTier>('tier1');
  const [assignReviewers, setAssignReviewers] = useState<string[]>([]);
  const [assignSlaDate, setAssignSlaDate] = useState('');

  const handleAssignReviewSubmit = () => {
    if (assignReviewers.length === 0) return;
    const deal = PLACEHOLDER_DEALS.find((d) => d.id === assignDeal);
    showToast(`Review assigned: ${deal?.name?.split(' — ')[0] ?? 'Deal'} to ${assignReviewers.join(', ')}`);
    setShowAssignReview(false);
    setAssignReviewers([]);
    setAssignSlaDate('');
  };

  // --- Modal: Add Condition ---
  const [showAddCondition, setShowAddCondition] = useState(false);
  const [newCondDesc, setNewCondDesc] = useState('');
  const [newCondDue, setNewCondDue] = useState('');
  const [newCondAssignee, setNewCondAssignee] = useState('Client');

  const handleAddConditionSubmit = () => {
    if (!newCondDesc.trim()) return;
    const newCond: ConditionalApproval = {
      id: `cond_${Date.now()}`,
      condition: newCondDesc.trim(),
      status: 'open',
      dueDate: newCondDue || '2026-04-15',
      assignedTo: newCondAssignee,
    };
    setConditions((prev) => [newCond, ...prev]);
    showToast('Condition added successfully');
    setShowAddCondition(false);
    setNewCondDesc('');
    setNewCondDue('');
    setNewCondAssignee('Client');
  };

  // --- Modal: Mark Condition Met (confirmation with note) ---
  const [markMetId, setMarkMetId] = useState<string | null>(null);
  const [markMetNote, setMarkMetNote] = useState('');

  const handleMarkMetConfirm = () => {
    if (!markMetNote.trim() || !markMetId) return;
    setConditions((prev) => prev.map((c) =>
      c.id === markMetId ? { ...c, status: 'met' as const, note: markMetNote.trim() } : c
    ));
    showToast('Condition marked as met');
    setMarkMetId(null);
    setMarkMetNote('');
  };

  // --- Red flag criteria expand ---
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set());
  const [overrideTexts, setOverrideTexts] = useState<Record<string, string>>({});

  const toggleCriteriaExpand = (id: string) => {
    setExpandedCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Stats
  const pending = reviews.filter((r) => r.status === 'pending' || r.status === 'in_review').length;
  const avgDays = Math.round(reviews.reduce((s, r) => s + r.daysInQueue, 0) / reviews.length);
  const approved = reviews.filter((r) => r.status === 'approved' || r.status === 'conditionally_approved').length;
  const approvalRate = Math.round((approved / reviews.length) * 100);

  const handleConditionToggle = (id: string, status: ConditionalApproval['status']) => {
    setConditions((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
  };

  const handleSignOff = (role: SignoffRole) => {
    setSignoffs((prev) => prev.map((s) =>
      s.role === role ? { ...s, status: 'signed' as const, signedAt: new Date().toISOString(), comment: 'Signed via committee workspace.' } : s
    ));
    const roleName = SIGNOFF_ROLE_LABELS[role];
    showToast(`${roleName} signoff recorded`);
  };

  const handleSignOffDecline = (role: SignoffRole) => {
    setSignoffs((prev) => prev.map((s) =>
      s.role === role ? { ...s, status: 'rejected' as const, signedAt: new Date().toISOString(), comment: 'Declined via committee workspace.' } : s
    ));
    const roleName = SIGNOFF_ROLE_LABELS[role];
    showToast(`${roleName} signoff declined`);
  };

  const handleVote = (member: string, vote: VoteValue) => {
    setVotes((prev) => prev.map((v) =>
      v.member === member ? { ...v, vote, votedAt: new Date().toISOString() } : v
    ));
    showToast(`Vote recorded: ${member} — ${vote.replace(/_/g, ' ')}`);
  };

  const handleGenerateMemo = () => {
    showToast('Committee memo generated');
  };

  const TABS: { id: WorkspaceTab; label: string; count?: number }[] = [
    { id: 'queue',      label: 'Review Queue',    count: pending },
    { id: 'checklist',  label: 'Red Flag Review' },
    { id: 'conditions', label: 'Conditions',       count: conditions.filter((c) => c.status === 'open').length },
    { id: 'signoffs',   label: 'Signoffs',         count: signoffs.filter((s) => s.status === 'pending').length },
    { id: 'voting',     label: 'Committee Vote',   count: votes.filter((v) => v.vote === null).length },
  ];

  const selectedReview = reviews.find((r) => r.id === selectedReviewId);

  // Red flag items with expanded criteria data
  const RED_FLAG_ITEMS: { id: string; label: string; state: 'pass' | 'fail' | 'warning' | 'pending'; category: string; description: string; note?: string }[] = [
    { id: 'rf_01', category: 'Identity',   label: 'Beneficial Ownership Verified',      state: 'pass',    description: 'All owners >= 25% stake have been identified and identity documents collected.' },
    { id: 'rf_02', category: 'Credit',     label: 'No Active Bankruptcy or Insolvency', state: 'pass',    description: 'No active Chapter 7/11/13 filings.' },
    { id: 'rf_03', category: 'Credit',     label: 'Personal FICO >= 680',               state: 'warning', description: 'Primary guarantor credit score meets minimum.', note: 'FICO 672 — marginally below threshold.' },
    { id: 'rf_04', category: 'Business',   label: 'Business Operating >= 2 Years',      state: 'pass',    description: 'Minimum seasoning confirmed.' },
    { id: 'rf_05', category: 'Business',   label: 'Revenue Substantiation on File',     state: 'pass',    description: '3 months verified statements.' },
    { id: 'rf_06', category: 'Compliance', label: 'No OFAC / Sanctions Match',          state: 'pass',    description: 'Cleared against OFAC SDN list.' },
    { id: 'rf_07', category: 'Compliance', label: 'No Active Regulatory Actions',       state: 'fail',    description: 'No open enforcement actions.', note: 'Principal listed in 2025 NY AG inquiry.' },
    { id: 'rf_08', category: 'Structure',  label: 'Acceptable Business Entity Type',    state: 'pass',    description: 'LLC, S-Corp, C-Corp or equivalent.' },
    { id: 'rf_09', category: 'Debt Service', label: 'Debt-to-Income Below 50%',         state: 'warning', description: 'Combined DTI under 50%.', note: 'DTI estimated at 47%.' },
    { id: 'rf_10', category: 'Industry',   label: 'Industry Not on Restricted List',    state: 'pending', description: 'Business SIC/NAICS not restricted.' },
  ];

  const STATE_BADGE: Record<string, { icon: string; cls: string; label: string }> = {
    pass:    { icon: '\u2713', cls: 'bg-green-900 text-green-300 border-green-700', label: 'Pass' },
    fail:    { icon: '\u2717', cls: 'bg-red-900 text-red-300 border-red-700', label: 'Fail' },
    warning: { icon: '!',      cls: 'bg-yellow-900 text-yellow-300 border-yellow-700', label: 'Warning' },
    pending: { icon: '?',      cls: 'bg-gray-800 text-gray-400 border-gray-600', label: 'Pending' },
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* --- Modal: Assign Review --- */}
      {showAssignReview && (
        <ModalBackdrop onClose={() => setShowAssignReview(false)}>
          <div className="p-6">
            <h2 className="text-lg font-bold text-white mb-4">Assign Review</h2>

            {/* Deal */}
            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Client / Deal</label>
            <select
              value={assignDeal}
              onChange={(e) => setAssignDeal(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mb-4 focus:outline-none focus:border-[#C9A84C]"
            >
              {PLACEHOLDER_DEALS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            {/* Tier */}
            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Risk Tier</label>
            <select
              value={assignTier}
              onChange={(e) => setAssignTier(e.target.value as RiskTier)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mb-4 focus:outline-none focus:border-[#C9A84C]"
            >
              <option value="tier1">Tier I</option>
              <option value="tier2">Tier II</option>
              <option value="tier3">Tier III</option>
              <option value="tier4">Tier IV</option>
            </select>

            {/* Reviewers multi-select */}
            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Reviewers</label>
            <div className="space-y-2 mb-4">
              {COMMITTEE_MEMBERS.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignReviewers.includes(m)}
                    onChange={(e) => {
                      if (e.target.checked) setAssignReviewers((prev) => [...prev, m]);
                      else setAssignReviewers((prev) => prev.filter((r) => r !== m));
                    }}
                    className="rounded border-gray-600 bg-gray-800 text-[#C9A84C] focus:ring-[#C9A84C]"
                  />
                  {m}
                </label>
              ))}
            </div>

            {/* SLA Deadline */}
            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">SLA Deadline</label>
            <input
              type="date"
              value={assignSlaDate}
              onChange={(e) => setAssignSlaDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mb-6 focus:outline-none focus:border-[#C9A84C]"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAssignReview(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignReviewSubmit}
                disabled={assignReviewers.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign Review
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* --- Modal: Add Condition --- */}
      {showAddCondition && (
        <ModalBackdrop onClose={() => setShowAddCondition(false)}>
          <div className="p-6">
            <h2 className="text-lg font-bold text-white mb-4">Add Condition</h2>

            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Description</label>
            <textarea
              value={newCondDesc}
              onChange={(e) => setNewCondDesc(e.target.value)}
              rows={3}
              placeholder="Describe the condition..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 mb-4 focus:outline-none focus:border-[#C9A84C] resize-none"
            />

            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Due Date</label>
            <input
              type="date"
              value={newCondDue}
              onChange={(e) => setNewCondDue(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mb-4 focus:outline-none focus:border-[#C9A84C]"
            />

            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Assignee</label>
            <select
              value={newCondAssignee}
              onChange={(e) => setNewCondAssignee(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 mb-6 focus:outline-none focus:border-[#C9A84C]"
            >
              <option value="Client">Client</option>
              <option value="Advisor">Advisor</option>
              <option value="Counsel">Counsel</option>
              <option value="Underwriter">Underwriter</option>
            </select>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAddCondition(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddConditionSubmit}
                disabled={!newCondDesc.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Condition
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* --- Modal: Mark Met Confirmation --- */}
      {markMetId && (
        <ModalBackdrop onClose={() => { setMarkMetId(null); setMarkMetNote(''); }}>
          <div className="p-6">
            <h2 className="text-lg font-bold text-white mb-2">Confirm Condition Met</h2>
            <p className="text-sm text-gray-400 mb-4">
              {conditions.find((c) => c.id === markMetId)?.condition}
            </p>

            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Note (required)</label>
            <textarea
              value={markMetNote}
              onChange={(e) => setMarkMetNote(e.target.value)}
              rows={3}
              placeholder="Provide evidence or justification for marking this condition as met..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 mb-4 focus:outline-none focus:border-[#C9A84C] resize-none"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setMarkMetId(null); setMarkMetNote(''); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkMetConfirm}
                disabled={!markMetNote.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Met
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Deal Committee Workspace</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {selectedReview
              ? <span>Reviewing <span className="text-[#C9A84C] font-semibold">{selectedReview.businessName}</span> &middot; {RISK_TIER_CONFIG[selectedReview.riskTier].label}</span>
              : 'Select a deal from the queue to begin review'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateMemo}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 text-sm font-semibold transition-colors"
          >
            Generate Committee Memo
          </button>
          <button
            onClick={() => setShowAssignReview(true)}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
          >
            + Assign Review
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending Reviews"  value={pending}         sub={`${reviews.length} total in system`}    valueClass={pending > 4 ? 'text-yellow-400' : 'text-white'} />
        <StatCard label="Avg Review Time"  value={`${avgDays}d`}   sub="Days from submission"                  valueClass={avgDays >= 5 ? 'text-red-400' : 'text-white'} />
        <StatCard label="Approval Rate"    value={`${approvalRate}%`} sub="This period"                        valueClass="text-[#C9A84C]" />
        <StatCard label="Open Conditions"  value={conditions.filter((c) => c.status === 'open').length} sub="Across all deals" valueClass="text-orange-400" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span className="bg-gray-700 text-gray-300 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Review Queue */}
      {activeTab === 'queue' && (
        <ReviewQueueTable
          reviews={reviews}
          selectedId={selectedReviewId}
          onSelect={(id) => { setSelectedReviewId(id); }}
        />
      )}

      {/* Tab: Red Flag Checklist with expandable criteria */}
      {activeTab === 'checklist' && (
        <div>
          {selectedReview && (
            <div className="mb-4 p-3 rounded-xl border border-gray-800 bg-gray-900 flex items-center gap-3">
              <div className={`h-2.5 w-2.5 rounded-full ${RISK_TIER_CONFIG[selectedReview.riskTier].dotClass}`} />
              <p className="text-sm font-semibold text-gray-200">{selectedReview.businessName}</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RISK_TIER_CONFIG[selectedReview.riskTier].badgeClass}`}>
                {RISK_TIER_CONFIG[selectedReview.riskTier].label}
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                {formatCurrency(selectedReview.requestedAmount)} requested
              </span>
            </div>
          )}

          {/* Custom red flag criteria with expand */}
          <div className="space-y-3">
            {/* Summary banner */}
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Overall Risk Assessment</p>
                {(() => {
                  const fails = RED_FLAG_ITEMS.filter((i) => i.state === 'fail').length;
                  const warns = RED_FLAG_ITEMS.filter((i) => i.state === 'warning').length;
                  if (fails > 0) return <span className="text-sm font-bold text-red-400">Blocked — Fail(s) Present</span>;
                  if (warns >= 2) return <span className="text-sm font-bold text-orange-400">Needs Review</span>;
                  if (warns === 1) return <span className="text-sm font-bold text-yellow-400">Caution</span>;
                  return <span className="text-sm font-bold text-green-400">All Clear</span>;
                })()}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-green-900 text-green-300 border border-green-800 px-2 py-0.5 rounded-full font-semibold">
                  {RED_FLAG_ITEMS.filter((i) => i.state === 'pass').length} Pass
                </span>
                <span className="bg-yellow-900 text-yellow-300 border border-yellow-800 px-2 py-0.5 rounded-full font-semibold">
                  {RED_FLAG_ITEMS.filter((i) => i.state === 'warning').length} Warning
                </span>
                <span className="bg-red-900 text-red-300 border border-red-800 px-2 py-0.5 rounded-full font-semibold">
                  {RED_FLAG_ITEMS.filter((i) => i.state === 'fail').length} Fail
                </span>
                <span className="bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full font-semibold">
                  {RED_FLAG_ITEMS.filter((i) => i.state === 'pending').length} Pending
                </span>
              </div>
            </div>

            {RED_FLAG_ITEMS.map((item, idx) => {
              const badge = STATE_BADGE[item.state];
              const isExpanded = expandedCriteria.has(item.id);
              const extData = RED_FLAG_CRITERIA_DATA[item.id];
              const rowCls = item.state === 'pass' ? 'border-green-800 bg-green-950/40'
                : item.state === 'fail' ? 'border-red-800 bg-red-950/40'
                : item.state === 'warning' ? 'border-yellow-800 bg-yellow-950/30'
                : 'border-gray-700 bg-gray-900';

              return (
                <div key={item.id} className={`rounded-xl border transition-colors ${rowCls}`}>
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer"
                    onClick={() => toggleCriteriaExpand(item.id)}
                  >
                    <span className="text-xs text-gray-600 font-mono w-5 flex-shrink-0 text-right">{idx + 1}</span>
                    <span className={`h-8 w-8 rounded-lg border font-bold text-sm flex-shrink-0 flex items-center justify-center ${badge.cls}`}>
                      {badge.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-100">{item.label}</p>
                        <span className="text-[10px] bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="text-gray-600 flex-shrink-0 text-sm w-5">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                  </div>

                  {isExpanded && extData && (
                    <div className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-gray-500 uppercase tracking-wide font-semibold">Data Source</span>
                          <p className="text-gray-300 mt-0.5">{extData.dataSource}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 uppercase tracking-wide font-semibold">Threshold</span>
                          <p className="text-gray-300 mt-0.5">{extData.threshold}</p>
                        </div>
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-500 uppercase tracking-wide font-semibold">Actual Value</span>
                        <p className={`mt-0.5 font-semibold ${item.state === 'fail' ? 'text-red-300' : item.state === 'warning' ? 'text-yellow-300' : 'text-green-300'}`}>
                          {extData.actualValue}
                        </p>
                      </div>
                      {item.note && (
                        <p className="text-xs text-gray-400 italic">{item.note}</p>
                      )}

                      {/* Warning items: compensating factor override */}
                      {item.state === 'warning' && (
                        <div className="mt-2 pt-3 border-t border-gray-800">
                          <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold block mb-1.5">
                            Document Compensating Factor
                          </label>
                          <textarea
                            value={overrideTexts[item.id] ?? ''}
                            onChange={(e) => setOverrideTexts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            rows={2}
                            placeholder="Describe the compensating factor or exception justification..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-[#C9A84C] resize-none"
                          />
                          <button
                            onClick={() => {
                              showToast(`Override applied for: ${item.label}`);
                              setOverrideTexts((prev) => ({ ...prev, [item.id]: '' }));
                            }}
                            disabled={!(overrideTexts[item.id] ?? '').trim()}
                            className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Apply Override
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Conditions */}
      {activeTab === 'conditions' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">
              {conditions.filter((c) => c.status === 'open').length} open &middot;{' '}
              {conditions.filter((c) => c.status === 'met').length} met &middot;{' '}
              {conditions.filter((c) => c.status === 'waived').length} waived
            </p>
            <button
              onClick={() => setShowAddCondition(true)}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
            >
              + Add Condition
            </button>
          </div>
          <ConditionsTracker conditions={conditions} onToggle={handleConditionToggle} onMarkMet={(id) => setMarkMetId(id)} />
        </div>
      )}

      {/* Tab: Signoffs */}
      {activeTab === 'signoffs' && (
        <SignoffPanel signoffs={signoffs} onSign={handleSignOff} onDecline={handleSignOffDecline} />
      )}

      {/* Tab: Committee Voting */}
      {activeTab === 'voting' && (
        <VotingPanel votes={votes} onVote={handleVote} />
      )}
    </div>
  );
}
