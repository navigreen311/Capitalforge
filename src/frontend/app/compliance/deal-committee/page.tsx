'use client';

// ============================================================
// /compliance/deal-committee — Deal Committee Workspace
// Application summary cards for high-value deals (>$100K),
// reviewer list with vote status, quorum tracking, SLA timer,
// consensus display, and comments thread.
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────

type VoteStatus = 'approve' | 'decline' | 'abstain' | 'pending';
type Consensus = 'Pending' | 'Approved' | 'Declined' | 'Tie';

interface Reviewer {
  id: string;
  name: string;
  role: string;
  vote: VoteStatus;
  votedAt: string | null;
}

interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

interface Deal {
  id: string;
  applicant: string;
  amount: number;
  type: string;
  submittedAt: string;
  slaDeadline: string;
  reviewers: Reviewer[];
  comments: Comment[];
  quorumRequired: number;
  quorumTotal: number;
}

// ── Mock Data ────────────────────────────────────────────────

const INITIAL_DEALS: Deal[] = [
  {
    id: 'deal_001',
    applicant: 'Apex Industrial LLC',
    amount: 250000,
    type: 'Business Line of Credit',
    submittedAt: '2026-04-05T10:30:00Z',
    slaDeadline: '2026-04-08T10:30:00Z',
    quorumRequired: 2,
    quorumTotal: 3,
    reviewers: [
      { id: 'rev_01', name: 'Sarah Chen', role: 'Chief Credit Officer', vote: 'approve', votedAt: '2026-04-06T09:15:00Z' },
      { id: 'rev_02', name: 'Marcus Webb', role: 'Risk Director', vote: 'pending', votedAt: null },
      { id: 'rev_03', name: 'Diana Ortiz', role: 'Compliance Lead', vote: 'pending', votedAt: null },
    ],
    comments: [
      { id: 'c1', author: 'Sarah Chen', text: 'Strong cash flow history. Recommend approval with standard covenants.', timestamp: '2026-04-06T09:16:00Z' },
      { id: 'c2', author: 'System', text: 'Automated credit score check passed (FICO 742).', timestamp: '2026-04-05T10:35:00Z' },
    ],
  },
  {
    id: 'deal_002',
    applicant: 'Meridian Health Partners',
    amount: 350000,
    type: 'Equipment Financing',
    submittedAt: '2026-04-03T14:00:00Z',
    slaDeadline: '2026-04-07T14:00:00Z',
    quorumRequired: 2,
    quorumTotal: 3,
    reviewers: [
      { id: 'rev_04', name: 'Sarah Chen', role: 'Chief Credit Officer', vote: 'approve', votedAt: '2026-04-04T11:00:00Z' },
      { id: 'rev_05', name: 'Marcus Webb', role: 'Risk Director', vote: 'approve', votedAt: '2026-04-05T16:30:00Z' },
      { id: 'rev_06', name: 'Diana Ortiz', role: 'Compliance Lead', vote: 'pending', votedAt: null },
    ],
    comments: [
      { id: 'c3', author: 'Sarah Chen', text: 'Excellent collateral coverage on the medical equipment. Low LTV ratio.', timestamp: '2026-04-04T11:02:00Z' },
      { id: 'c4', author: 'Marcus Webb', text: 'Verified financials — 3yr avg revenue $1.2M. Approve.', timestamp: '2026-04-05T16:32:00Z' },
      { id: 'c5', author: 'System', text: 'KYC/AML screening completed — no flags.', timestamp: '2026-04-03T14:10:00Z' },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function computeConsensus(reviewers: Reviewer[], quorumRequired: number): Consensus {
  const approves = reviewers.filter(r => r.vote === 'approve').length;
  const declines = reviewers.filter(r => r.vote === 'decline').length;
  const voted = approves + declines + reviewers.filter(r => r.vote === 'abstain').length;

  if (approves >= quorumRequired) return 'Approved';
  if (declines >= quorumRequired) return 'Declined';
  if (voted >= reviewers.length && approves === declines) return 'Tie';
  return 'Pending';
}

function votesReceived(reviewers: Reviewer[]): number {
  return reviewers.filter(r => r.vote !== 'pending').length;
}

function slaRemaining(deadline: string): string {
  const now = new Date();
  const end = new Date(deadline);
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 'Overdue';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function slaUrgent(deadline: string): boolean {
  const diffMs = new Date(deadline).getTime() - Date.now();
  return diffMs > 0 && diffMs < 12 * 60 * 60 * 1000; // under 12 hours
}

function slaOverdue(deadline: string): boolean {
  return new Date(deadline).getTime() - Date.now() <= 0;
}

// ── Vote Badge ──────────────────────────────────────────────

function VoteBadge({ vote }: { vote: VoteStatus }) {
  const styles: Record<VoteStatus, string> = {
    approve: 'bg-emerald-900/40 text-emerald-400',
    decline: 'bg-red-900/40 text-red-400',
    abstain: 'bg-gray-700/50 text-gray-400',
    pending: 'bg-yellow-900/30 text-yellow-400',
  };
  const labels: Record<VoteStatus, string> = {
    approve: 'Approve',
    decline: 'Decline',
    abstain: 'Abstain',
    pending: 'Pending',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[vote]}`}>
      {labels[vote]}
    </span>
  );
}

// ── Consensus Badge ─────────────────────────────────────────

function ConsensusBadge({ consensus }: { consensus: Consensus }) {
  const styles: Record<Consensus, string> = {
    Pending: 'border-yellow-600/50 bg-yellow-900/20 text-yellow-400',
    Approved: 'border-emerald-600/50 bg-emerald-900/20 text-emerald-400',
    Declined: 'border-red-600/50 bg-red-900/20 text-red-400',
    Tie: 'border-gray-600/50 bg-gray-800/40 text-gray-300',
  };
  return (
    <span className={`px-3 py-1 rounded-lg text-sm font-bold border ${styles[consensus]}`}>
      {consensus}
    </span>
  );
}

// ── Deal Card ───────────────────────────────────────────────

function DealCard({ deal, onVote, onComment }: {
  deal: Deal;
  onVote: (dealId: string, reviewerId: string, vote: VoteStatus) => void;
  onComment: (dealId: string, text: string) => void;
}) {
  const [commentText, setCommentText] = useState('');
  const [votingReviewer, setVotingReviewer] = useState<string | null>(null);
  const consensus = computeConsensus(deal.reviewers, deal.quorumRequired);
  const voteCount = votesReceived(deal.reviewers);
  const overdue = slaOverdue(deal.slaDeadline);
  const urgent = slaUrgent(deal.slaDeadline);

  const handleSubmitComment = () => {
    if (!commentText.trim()) return;
    onComment(deal.id, commentText.trim());
    setCommentText('');
  };

  const handleCastVote = (vote: VoteStatus) => {
    if (!votingReviewer) return;
    onVote(deal.id, votingReviewer, vote);
    setVotingReviewer(null);
  };

  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold text-white">{deal.applicant}</h3>
          <p className="text-sm text-gray-400 mt-0.5">{deal.type}</p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-2xl font-bold text-[#C9A84C]">{money(deal.amount)}</p>
          <ConsensusBadge consensus={consensus} />
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-4 border-b border-gray-800">
        <div>
          <p className="text-[10px] text-gray-500 uppercase">Submitted</p>
          <p className="text-sm font-medium text-gray-200 mt-0.5">
            {new Date(deal.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500 uppercase">Quorum</p>
          <p className="text-sm font-medium text-gray-200 mt-0.5">
            {voteCount}/{deal.quorumTotal} voted ({deal.quorumRequired} required)
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500 uppercase">SLA Timer</p>
          <p className={`text-sm font-semibold mt-0.5 ${
            overdue ? 'text-red-400' : urgent ? 'text-yellow-400' : 'text-gray-200'
          }`}>
            {overdue ? 'OVERDUE' : `Decision required in ${slaRemaining(deal.slaDeadline)}`}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500 uppercase">Deal ID</p>
          <p className="text-sm font-mono text-gray-400 mt-0.5">{deal.id}</p>
        </div>
      </div>

      {/* Reviewer List */}
      <div className="px-6 py-4 border-b border-gray-800">
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">Committee Reviewers</h4>
        <div className="space-y-2">
          {deal.reviewers.map((rev) => (
            <div key={rev.id} className="flex items-center justify-between rounded-lg bg-gray-800/50 border border-gray-700/40 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/40 flex items-center justify-center text-xs font-bold text-[#C9A84C]">
                  {rev.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">{rev.name}</p>
                  <p className="text-xs text-gray-500">{rev.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {rev.votedAt && (
                  <span className="text-xs text-gray-500">
                    {new Date(rev.votedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
                <VoteBadge vote={rev.vote} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cast Vote Section */}
      {consensus === 'Pending' && (
        <div className="px-6 py-4 border-b border-gray-800">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">Cast Vote</h4>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={votingReviewer || ''}
              onChange={(e) => setVotingReviewer(e.target.value || null)}
              className="rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 px-3 py-2 focus:outline-none focus:border-[#C9A84C]/60"
            >
              <option value="">Select reviewer...</option>
              {deal.reviewers.filter(r => r.vote === 'pending').map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button
              onClick={() => handleCastVote('approve')}
              disabled={!votingReviewer}
              className="px-4 py-2 rounded-lg bg-emerald-900/40 border border-emerald-700/50 text-emerald-400 text-sm font-medium hover:bg-emerald-900/60 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Approve
            </button>
            <button
              onClick={() => handleCastVote('decline')}
              disabled={!votingReviewer}
              className="px-4 py-2 rounded-lg bg-red-900/40 border border-red-700/50 text-red-400 text-sm font-medium hover:bg-red-900/60 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Decline
            </button>
            <button
              onClick={() => handleCastVote('abstain')}
              disabled={!votingReviewer}
              className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Abstain
            </button>
          </div>
        </div>
      )}

      {/* Comments Thread */}
      <div className="px-6 py-4">
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">
          Comments ({deal.comments.length})
        </h4>
        <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
          {deal.comments
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map((c) => (
            <div key={c.id} className="rounded-lg bg-gray-800/40 border border-gray-700/30 px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${c.author === 'System' ? 'text-gray-500' : 'text-[#C9A84C]'}`}>
                  {c.author}
                </span>
                <span className="text-xs text-gray-600">
                  {new Date(c.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-gray-300">{c.text}</p>
            </div>
          ))}
        </div>

        {/* Add Comment */}
        <div className="flex gap-3">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
            placeholder="Add a comment..."
            className="flex-1 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 px-4 py-2 placeholder:text-gray-600 focus:outline-none focus:border-[#C9A84C]/60"
          />
          <button
            onClick={handleSubmitComment}
            disabled={!commentText.trim()}
            className="px-4 py-2 rounded-lg bg-[#C9A84C]/20 border border-[#C9A84C]/40 text-[#C9A84C] text-sm font-medium hover:bg-[#C9A84C]/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add Comment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function DealCommitteePage() {
  const [deals, setDeals] = useState<Deal[]>(INITIAL_DEALS);
  const [, setTick] = useState(0);

  // Refresh SLA timers every minute
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleVote = useCallback((dealId: string, reviewerId: string, vote: VoteStatus) => {
    setDeals(prev => prev.map(deal => {
      if (deal.id !== dealId) return deal;
      return {
        ...deal,
        reviewers: deal.reviewers.map(r =>
          r.id === reviewerId
            ? { ...r, vote, votedAt: new Date().toISOString() }
            : r
        ),
      };
    }));
  }, []);

  const handleComment = useCallback((dealId: string, text: string) => {
    setDeals(prev => prev.map(deal => {
      if (deal.id !== dealId) return deal;
      return {
        ...deal,
        comments: [
          ...deal.comments,
          {
            id: `c_${Date.now()}`,
            author: 'Current User',
            text,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }));
  }, []);

  // Aggregate stats
  const totalValue = deals.reduce((s, d) => s + d.amount, 0);
  const pendingCount = deals.filter(d => computeConsensus(d.reviewers, d.quorumRequired) === 'Pending').length;
  const approvedCount = deals.filter(d => computeConsensus(d.reviewers, d.quorumRequired) === 'Approved').length;
  const overdueCount = deals.filter(d => slaOverdue(d.slaDeadline)).length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Deal Committee Workspace</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review and vote on high-value applications (&gt;$100K) requiring committee approval
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase">Active Deals</p>
          <p className="text-2xl font-bold text-white mt-1">{deals.length}</p>
        </div>
        <div className="rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/5 p-4">
          <p className="text-xs text-gray-500 uppercase">Total Value</p>
          <p className="text-2xl font-bold text-[#C9A84C] mt-1">{money(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-yellow-600/40 bg-yellow-900/10 p-4">
          <p className="text-xs text-gray-500 uppercase">Pending Review</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{pendingCount}</p>
          {approvedCount > 0 && (
            <p className="text-xs text-emerald-400 mt-1">{approvedCount} approved</p>
          )}
        </div>
        <div className={`rounded-xl border p-4 ${
          overdueCount > 0
            ? 'border-red-600/40 bg-red-900/10'
            : 'border-gray-700/60 bg-gray-900/60'
        }`}>
          <p className="text-xs text-gray-500 uppercase">SLA Status</p>
          <p className={`text-2xl font-bold mt-1 ${overdueCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {overdueCount > 0 ? `${overdueCount} Overdue` : 'On Track'}
          </p>
        </div>
      </div>

      {/* Deal Cards */}
      <div className="space-y-6">
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            onVote={handleVote}
            onComment={handleComment}
          />
        ))}
      </div>
    </div>
  );
}
