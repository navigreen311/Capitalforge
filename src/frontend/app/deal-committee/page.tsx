'use client';

// ============================================================
// /deal-committee — Deal Committee Workspace
// Pending reviews queue with risk tier badges, red-flag
// checklist, conditional approval conditions tracker,
// counsel/accountant signoff status, committee voting panel.
// Stats: pending reviews, avg review time, approval rate.
// ============================================================

import { useState } from 'react';
import RedFlagChecklist, { type RedFlagItem, type ChecklistItemState } from '../../components/modules/red-flag-checklist';

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

const PLACEHOLDER_REVIEWS: PendingReview[] = [
  { id: 'rev_001', businessName: 'Apex Ventures LLC',         requestedAmount: 250000, riskTier: 'tier2', status: 'in_review',              assignedTo: 'Ana Reyes',    submittedAt: '2026-03-28', daysInQueue: 3, redFlagCount: 0, warningCount: 2 },
  { id: 'rev_002', businessName: 'Summit Capital Group',      requestedAmount: 500000, riskTier: 'tier1', status: 'pending',                 assignedTo: 'Marcus Chen',  submittedAt: '2026-03-29', daysInQueue: 2, redFlagCount: 0, warningCount: 1 },
  { id: 'rev_003', businessName: 'Blue Ridge Consulting',     requestedAmount: 180000, riskTier: 'tier3', status: 'pending',                 assignedTo: 'Sofia Park',   submittedAt: '2026-03-30', daysInQueue: 1, redFlagCount: 1, warningCount: 1 },
  { id: 'rev_004', businessName: 'NovaTech Solutions Inc.',   requestedAmount: 320000, riskTier: 'tier2', status: 'conditionally_approved',  assignedTo: 'Ana Reyes',    submittedAt: '2026-03-25', daysInQueue: 6, redFlagCount: 0, warningCount: 0 },
  { id: 'rev_005', businessName: 'Pinnacle Freight Corp',     requestedAmount: 750000, riskTier: 'tier1', status: 'in_review',              assignedTo: 'Marcus Chen',  submittedAt: '2026-03-27', daysInQueue: 4, redFlagCount: 0, warningCount: 3 },
  { id: 'rev_006', businessName: 'Horizon Retail Partners',   requestedAmount: 95000,  riskTier: 'tier4', status: 'pending',                 assignedTo: 'Sofia Park',   submittedAt: '2026-03-31', daysInQueue: 0, redFlagCount: 2, warningCount: 1 },
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
  return (
    <div className="overflow-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900">
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Business</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Amount</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Risk Tier</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Flags</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Assigned</th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Days</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => {
            const tierCfg = RISK_TIER_CONFIG[r.riskTier];
            const statusCfg = REVIEW_STATUS_CONFIG[r.status];
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
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
                    {statusCfg.label}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1.5">
                    {r.redFlagCount > 0 && (
                      <span className="text-xs font-bold bg-red-900 text-red-300 border border-red-700 px-1.5 py-0.5 rounded">
                        {r.redFlagCount} FAIL
                      </span>
                    )}
                    {r.warningCount > 0 && (
                      <span className="text-xs font-bold bg-yellow-900 text-yellow-300 border border-yellow-700 px-1.5 py-0.5 rounded">
                        {r.warningCount} WARN
                      </span>
                    )}
                    {r.redFlagCount === 0 && r.warningCount === 0 && (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-xs text-gray-400">{r.assignedTo}</td>
                <td className="py-3 px-4 text-right">
                  <span className={`text-xs font-bold ${r.daysInQueue >= 5 ? 'text-red-400' : r.daysInQueue >= 3 ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {r.daysInQueue}d
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
}: {
  conditions: ConditionalApproval[];
  onToggle: (id: string, status: ConditionalApproval['status']) => void;
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
                <button onClick={() => onToggle(c.id, 'met')} className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-800 hover:bg-green-700 text-green-200 transition-colors">
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

function SignoffPanel({ signoffs, onSign }: { signoffs: SignoffRecord[]; onSign: (role: SignoffRole) => void }) {
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
        return (
          <div key={s.role} className={`rounded-xl border p-4 ${isSigned ? 'border-gray-700 bg-gray-900' : 'border-yellow-800 bg-yellow-950/10'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-gray-300">{s.name}</span>
                  <span className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded">
                    {SIGNOFF_ROLE_LABELS[s.role]}
                  </span>
                </div>
                {s.comment && <p className="text-xs text-gray-400 mt-1 italic">"{s.comment}"</p>}
                {s.signedAt && <p className="text-[10px] text-gray-600 mt-1">{formatDateTime(s.signedAt)}</p>}
              </div>
              <div className="flex-shrink-0">
                {isSigned ? (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-green-900 text-green-300 border-green-700">
                    Signed
                  </span>
                ) : (
                  <button
                    onClick={() => onSign(s.role)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
                  >
                    Sign Off
                  </button>
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
  const totalEligible = votes.filter((v) => v.vote !== 'abstain').length;
  const majorityReached = approveCount > Math.floor(totalEligible / 2);

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

      {/* Majority indicator */}
      {castVotes.length > 0 && (
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
                {v.comment && <p className="text-xs text-gray-400 italic mt-1">"{v.comment}"</p>}
                {v.votedAt && <p className="text-[10px] text-gray-600 mt-1">{formatDateTime(v.votedAt)}</p>}
              </div>
              <div className="flex-shrink-0">
                {v.vote !== null ? (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${VOTE_CONFIG[v.vote].badgeClass}`}>
                    {VOTE_CONFIG[v.vote].label}
                  </span>
                ) : (
                  <div className="flex gap-1.5">
                    {(['approve', 'approve_with_conditions', 'decline'] as VoteValue[]).map((val) => (
                      <button
                        key={val}
                        onClick={() => onVote(v.member, val)}
                        className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
                          val === 'approve' ? 'border-green-700 text-green-300 hover:bg-green-900' :
                          val === 'approve_with_conditions' ? 'border-teal-700 text-teal-300 hover:bg-teal-900' :
                          'border-red-700 text-red-300 hover:bg-red-900'
                        }`}
                      >
                        {val === 'approve' ? 'Approve' : val === 'approve_with_conditions' ? 'Cond.' : 'Decline'}
                      </button>
                    ))}
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
  const [reviews] = useState<PendingReview[]>(PLACEHOLDER_REVIEWS);
  const [conditions, setConditions] = useState<ConditionalApproval[]>(PLACEHOLDER_CONDITIONS);
  const [signoffs, setSignoffs] = useState<SignoffRecord[]>(PLACEHOLDER_SIGNOFFS);
  const [votes, setVotes] = useState<CommitteeVote[]>(PLACEHOLDER_VOTES);

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
      s.role === role ? { ...s, status: 'signed', signedAt: new Date().toISOString(), comment: 'Signed via committee workspace.' } : s
    ));
  };

  const handleVote = (member: string, vote: VoteValue) => {
    setVotes((prev) => prev.map((v) =>
      v.member === member ? { ...v, vote, votedAt: new Date().toISOString() } : v
    ));
  };

  // Mock red-flag items for selected review
  const handleRedFlagChange = (_id: string, _state: ChecklistItemState, _note: string) => {
    // In production: persist via API
  };

  const TABS: { id: WorkspaceTab; label: string; count?: number }[] = [
    { id: 'queue',      label: 'Review Queue',    count: pending },
    { id: 'checklist',  label: 'Red Flag Review' },
    { id: 'conditions', label: 'Conditions',       count: conditions.filter((c) => c.status === 'open').length },
    { id: 'signoffs',   label: 'Signoffs',         count: signoffs.filter((s) => s.status === 'pending').length },
    { id: 'voting',     label: 'Committee Vote',   count: votes.filter((v) => v.vote === null).length },
  ];

  const selectedReview = reviews.find((r) => r.id === selectedReviewId);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Deal Committee Workspace</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {selectedReview
              ? <span>Reviewing <span className="text-[#C9A84C] font-semibold">{selectedReview.businessName}</span> · {RISK_TIER_CONFIG[selectedReview.riskTier].label}</span>
              : 'Select a deal from the queue to begin review'}
          </p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
          + Assign Review
        </button>
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
          onSelect={setSelectedReviewId}
        />
      )}

      {/* Tab: Red Flag Checklist */}
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
          <RedFlagChecklist onItemChange={handleRedFlagChange} />
        </div>
      )}

      {/* Tab: Conditions */}
      {activeTab === 'conditions' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">
              {conditions.filter((c) => c.status === 'open').length} open ·{' '}
              {conditions.filter((c) => c.status === 'met').length} met ·{' '}
              {conditions.filter((c) => c.status === 'waived').length} waived
            </p>
            <button className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">
              + Add Condition
            </button>
          </div>
          <ConditionsTracker conditions={conditions} onToggle={handleConditionToggle} />
        </div>
      )}

      {/* Tab: Signoffs */}
      {activeTab === 'signoffs' && (
        <SignoffPanel signoffs={signoffs} onSign={handleSignOff} />
      )}

      {/* Tab: Committee Voting */}
      {activeTab === 'voting' && (
        <VotingPanel votes={votes} onVote={handleVote} />
      )}
    </div>
  );
}
