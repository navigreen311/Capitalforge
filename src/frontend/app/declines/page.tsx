'use client';

// ============================================================
// /declines — Decline Recovery Center
// Sections:
//   1. Declines table (issuer, reason badge, recon status,
//      cooldown timer)
//   2. Reconsideration letter generator button
//   3. Reapply calendar (eligibility dates per issuer)
//   4. Adverse action notice parser upload
// ============================================================

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getReconGuidance } from '@/lib/issuer-recon-guidance';
import type { IssuerReconGuidance } from '@/lib/issuer-recon-guidance';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReasonCategory = 'too_many_inquiries' | 'insufficient_history' | 'high_utilization' | 'income_verification' | 'velocity' | 'internal_policy' | 'derogatory_marks' | 'unknown';
type ReconStatus = 'not_started' | 'in_review' | 'approved' | 'denied' | 'scheduled';
type RecoveryStage = 'new' | 'letter_sent' | 'recon_call_scheduled' | 'recon_call_completed' | 'reapplication_ready' | 'reapplied' | 'won' | 'lost';

interface DeclineRecord {
  id: string;
  businessName: string;
  issuer: string;
  cardProduct: string;
  declinedDate: string;
  reasonCategory: ReasonCategory;
  reasonDetail: string;
  reconStatus: ReconStatus;
  cooldownEndsDate: string | null; // null = eligible now
  requestedLimit: number;
  appId: string;
  recoveryStage: RecoveryStage;
  resolvedAt: string | null;
}

interface ReapplyItem {
  issuer: string;
  cardProduct: string;
  businessName: string;
  declinedDate: string;
  eligibleDate: string;
  daysRemaining: number;
  eligible: boolean;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const DECLINE_RECORDS: DeclineRecord[] = [
  {
    id: 'dec_001', businessName: 'Horizon Retail Partners', issuer: 'Citi',
    cardProduct: 'Citi® Business Platinum', declinedDate: '2026-03-25',
    reasonCategory: 'too_many_inquiries', reasonDetail: 'Too many recent credit inquiries in 12-month window.',
    reconStatus: 'not_started', cooldownEndsDate: '2026-04-25',
    requestedLimit: 15000, appId: 'APP-0087',
    recoveryStage: 'new', resolvedAt: null,
  },
  {
    id: 'dec_002', businessName: 'Apex Ventures LLC', issuer: 'Chase',
    cardProduct: 'Ink Business Unlimited', declinedDate: '2026-03-18',
    reasonCategory: 'velocity', reasonDetail: '5/24 rule — too many new accounts in 24 months.',
    reconStatus: 'in_review', cooldownEndsDate: '2026-05-18',
    requestedLimit: 20000, appId: 'APP-0081',
    recoveryStage: 'recon_call_scheduled', resolvedAt: null,
  },
  {
    id: 'dec_003', businessName: 'Crestline Medical LLC', issuer: 'Amex',
    cardProduct: 'Business Platinum Card', declinedDate: '2026-03-10',
    reasonCategory: 'income_verification', reasonDetail: 'Stated income could not be verified via credit file data.',
    reconStatus: 'scheduled', cooldownEndsDate: null,
    requestedLimit: 50000, appId: 'APP-0077',
    recoveryStage: 'recon_call_completed', resolvedAt: null,
  },
  {
    id: 'dec_004', businessName: 'NovaTech Solutions Inc.', issuer: 'Capital One',
    cardProduct: 'Spark Cash Select', declinedDate: '2026-03-05',
    reasonCategory: 'insufficient_history', reasonDetail: 'Business credit history too thin — fewer than 3 trade lines.',
    reconStatus: 'denied', cooldownEndsDate: '2026-09-05',
    requestedLimit: 10000, appId: 'APP-0074',
    recoveryStage: 'lost', resolvedAt: '2026-03-20',
  },
  {
    id: 'dec_005', businessName: 'Blue Ridge Consulting', issuer: 'US Bank',
    cardProduct: 'Business Altitude Connect', declinedDate: '2026-02-28',
    reasonCategory: 'high_utilization', reasonDetail: 'Personal credit utilization exceeds 70% on revolving accounts.',
    reconStatus: 'approved', cooldownEndsDate: null,
    requestedLimit: 18000, appId: 'APP-0069',
    recoveryStage: 'won', resolvedAt: '2026-03-15',
  },
  {
    id: 'dec_006', businessName: 'Summit Capital Group', issuer: 'Bank of America',
    cardProduct: 'Business Advantage Travel Rewards', declinedDate: '2026-02-20',
    reasonCategory: 'internal_policy', reasonDetail: 'Application declined per issuer internal risk policy — no further details provided.',
    reconStatus: 'not_started', cooldownEndsDate: '2026-04-20',
    requestedLimit: 30000, appId: 'APP-0063',
    recoveryStage: 'letter_sent', resolvedAt: null,
  },
  {
    id: 'dec_007', businessName: 'Pinnacle Freight Corp', issuer: 'Wells Fargo',
    cardProduct: 'Business Platinum Credit Card', declinedDate: '2026-02-14',
    reasonCategory: 'derogatory_marks', reasonDetail: 'Derogatory public record (tax lien) present on personal credit.',
    reconStatus: 'not_started', cooldownEndsDate: '2026-08-14',
    requestedLimit: 25000, appId: 'APP-0058',
    recoveryStage: 'reapplication_ready', resolvedAt: null,
  },
];

const REAPPLY_CALENDAR: ReapplyItem[] = [
  { issuer: 'Amex',          cardProduct: 'Business Platinum Card',         businessName: 'Crestline Medical LLC',     declinedDate: '2026-03-10', eligibleDate: '2026-03-31', daysRemaining: 0,   eligible: true  },
  { issuer: 'Citi',          cardProduct: 'Citi® Business Platinum',        businessName: 'Horizon Retail Partners',   declinedDate: '2026-03-25', eligibleDate: '2026-04-25', daysRemaining: 25,  eligible: false },
  { issuer: 'Bank of America',cardProduct: 'Business Advantage Travel',     businessName: 'Summit Capital Group',      declinedDate: '2026-02-20', eligibleDate: '2026-04-20', daysRemaining: 20,  eligible: false },
  { issuer: 'Chase',         cardProduct: 'Ink Business Unlimited',         businessName: 'Apex Ventures LLC',         declinedDate: '2026-03-18', eligibleDate: '2026-05-18', daysRemaining: 48,  eligible: false },
  { issuer: 'Capital One',   cardProduct: 'Spark Cash Select',              businessName: 'NovaTech Solutions Inc.',   declinedDate: '2026-03-05', eligibleDate: '2026-09-05', daysRemaining: 157, eligible: false },
  { issuer: 'Wells Fargo',   cardProduct: 'Business Platinum Credit Card',  businessName: 'Pinnacle Freight Corp',     declinedDate: '2026-02-14', eligibleDate: '2026-08-14', daysRemaining: 135, eligible: false },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REASON_LABELS: Record<ReasonCategory, { label: string; cls: string }> = {
  too_many_inquiries:    { label: 'Too Many Inquiries',  cls: 'bg-orange-900 text-orange-300 border-orange-700' },
  insufficient_history:  { label: 'Thin File',           cls: 'bg-blue-900 text-blue-300 border-blue-700'       },
  high_utilization:      { label: 'High Utilization',    cls: 'bg-red-900 text-red-300 border-red-700'           },
  income_verification:   { label: 'Income Verify',       cls: 'bg-purple-900 text-purple-300 border-purple-700'  },
  velocity:              { label: 'Velocity Rule',        cls: 'bg-yellow-900 text-yellow-300 border-yellow-700'  },
  internal_policy:       { label: 'Internal Policy',     cls: 'bg-gray-700 text-gray-300 border-gray-600'        },
  derogatory_marks:      { label: 'Derogatory',          cls: 'bg-red-950 text-red-400 border-red-800'           },
  unknown:               { label: 'Unknown',             cls: 'bg-gray-800 text-gray-400 border-gray-700'        },
};

const RECON_STATUS_LABELS: Record<ReconStatus, { label: string; cls: string }> = {
  not_started: { label: 'Not Started', cls: 'bg-gray-800 text-gray-500 border-gray-700'        },
  in_review:   { label: 'In Review',   cls: 'bg-yellow-900 text-yellow-300 border-yellow-700'  },
  approved:    { label: 'Approved',    cls: 'bg-green-900 text-green-300 border-green-700'      },
  denied:      { label: 'Denied',      cls: 'bg-red-900 text-red-300 border-red-700'            },
  scheduled:   { label: 'Scheduled',   cls: 'bg-blue-900 text-blue-300 border-blue-700'         },
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function cooldownDisplay(endsDate: string | null): { text: string; cls: string } {
  if (!endsDate) return { text: 'Eligible Now', cls: 'text-green-400 font-semibold' };
  const today = new Date('2026-03-31');
  const end = new Date(endsDate);
  const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return { text: 'Eligible Now', cls: 'text-green-400 font-semibold' };
  if (days <= 30) return { text: `${days}d remaining`, cls: 'text-yellow-400' };
  return { text: `${days}d remaining`, cls: 'text-red-400' };
}

// ---------------------------------------------------------------------------
// Recovery Stage Helpers
// ---------------------------------------------------------------------------

const RECOVERY_STAGE_ORDER: RecoveryStage[] = [
  'new', 'letter_sent', 'recon_call_scheduled', 'recon_call_completed',
  'reapplication_ready', 'reapplied', 'won', 'lost',
];

const RECOVERY_STAGE_LABELS: Record<RecoveryStage, string> = {
  new: 'New',
  letter_sent: 'Letter Sent',
  recon_call_scheduled: 'Recon Call Scheduled',
  recon_call_completed: 'Recon Call Completed',
  reapplication_ready: 'Reapplication Ready',
  reapplied: 'Reapplied',
  won: 'Won',
  lost: 'Lost',
};

const RECOVERY_STAGE_COLORS: Record<RecoveryStage, string> = {
  new: 'bg-gray-700 text-gray-300',
  letter_sent: 'bg-blue-900 text-blue-300',
  recon_call_scheduled: 'bg-purple-900 text-purple-300',
  recon_call_completed: 'bg-indigo-900 text-indigo-300',
  reapplication_ready: 'bg-yellow-900 text-yellow-300',
  reapplied: 'bg-cyan-900 text-cyan-300',
  won: 'bg-green-900 text-green-300',
  lost: 'bg-red-900 text-red-300',
};

function getNextStages(current: RecoveryStage): { stage: RecoveryStage; label: string }[] {
  if (current === 'won' || current === 'lost') return [];
  const idx = RECOVERY_STAGE_ORDER.indexOf(current);
  // Offer the natural next stage + won/lost as terminal options
  const next: { stage: RecoveryStage; label: string }[] = [];
  if (idx < 6) { // before 'won'
    const nextStage = RECOVERY_STAGE_ORDER[idx + 1];
    if (nextStage && nextStage !== 'lost') {
      next.push({ stage: nextStage, label: `Mark ${RECOVERY_STAGE_LABELS[nextStage]}` });
    }
  }
  if (current !== 'new') {
    next.push({ stage: 'won', label: 'Mark Won' });
    next.push({ stage: 'lost', label: 'Mark Lost' });
  }
  return next;
}

function computeRecoveryStats(records: DeclineRecord[]) {
  const resolved = records.filter(r => r.recoveryStage === 'won' || r.recoveryStage === 'lost');
  const won = resolved.filter(r => r.recoveryStage === 'won').length;
  const winRate = resolved.length > 0 ? Math.round((won / resolved.length) * 100) : 0;

  // Avg days from declined_at to won_at for won records only
  const wonWithDates = records.filter(r => r.recoveryStage === 'won' && r.resolvedAt);
  let avgDays = 0;
  if (wonWithDates.length > 0) {
    const total = wonWithDates.reduce((sum, r) => {
      const days = Math.ceil(
        (new Date(r.resolvedAt!).getTime() - new Date(r.declinedDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      return sum + days;
    }, 0);
    avgDays = Math.round(total / wonWithDates.length);
  }

  return { winRate, won, lost: resolved.length - won, avgDays, totalResolved: resolved.length };
}

// ---------------------------------------------------------------------------
// Recovery Tracker Component
// ---------------------------------------------------------------------------

function RecoveryTracker({
  records,
  onAdvance,
  advancingId,
}: {
  records: DeclineRecord[];
  onAdvance: (id: string, stage: RecoveryStage) => void;
  advancingId: string | null;
}) {
  const activeRecoveries = records.filter(r => r.recoveryStage !== 'won' && r.recoveryStage !== 'lost');
  const stats = computeRecoveryStats(records);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-200">Recovery Tracker</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Track each decline through the recovery pipeline
          </p>
        </div>
        <div className="flex gap-3">
          <div className="text-center px-3 py-1 rounded-lg bg-gray-800 border border-gray-700">
            <p className="text-lg font-bold text-[#C9A84C]">{stats.winRate}%</p>
            <p className="text-xs text-gray-500">Win Rate</p>
          </div>
          <div className="text-center px-3 py-1 rounded-lg bg-gray-800 border border-gray-700">
            <p className="text-lg font-bold text-blue-400">{stats.avgDays}d</p>
            <p className="text-xs text-gray-500">Avg Recovery</p>
          </div>
        </div>
      </div>

      {/* Stage summary bar */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {RECOVERY_STAGE_ORDER.map((stage) => {
          const count = records.filter(r => r.recoveryStage === stage).length;
          return (
            <div
              key={stage}
              className={`flex-1 min-w-[80px] rounded-lg px-2 py-1.5 text-center border border-gray-700 ${
                count > 0 ? 'bg-gray-800' : 'bg-gray-900/30'
              }`}
            >
              <p className="text-xs font-bold text-white">{count}</p>
              <p className="text-xs text-gray-500 truncate">{RECOVERY_STAGE_LABELS[stage]}</p>
            </div>
          );
        })}
      </div>

      {/* Active recovery cards */}
      {activeRecoveries.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-4">
          No active recoveries — all declines have been resolved.
        </p>
      ) : (
        <div className="space-y-2">
          {activeRecoveries.map((r) => {
            const stageIdx = RECOVERY_STAGE_ORDER.indexOf(r.recoveryStage);
            const progressPct = Math.round(((stageIdx + 1) / 7) * 100); // 7 stages before terminal
            const nextActions = getNextStages(r.recoveryStage);

            return (
              <div
                key={r.id}
                className="rounded-lg border border-gray-800 bg-gray-950/50 px-4 py-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-gray-100">{r.businessName}</p>
                    <span className="font-mono text-xs text-gray-600">{r.appId}</span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${RECOVERY_STAGE_COLORS[r.recoveryStage]}`}>
                    {RECOVERY_STAGE_LABELS[r.recoveryStage]}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-gray-800 mb-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#C9A84C] transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {r.issuer} · {r.cardProduct} · {formatCurrency(r.requestedLimit)}
                  </p>
                  <div className="flex gap-1.5">
                    {nextActions.map((action) => {
                      const isLoading = advancingId === r.id;
                      return (
                        <button
                          key={action.stage}
                          onClick={() => onAdvance(r.id, action.stage)}
                          disabled={isLoading}
                          className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            action.stage === 'won'
                              ? 'bg-green-900 hover:bg-green-800 text-green-300 border border-green-700'
                              : action.stage === 'lost'
                              ? 'bg-red-900 hover:bg-red-800 text-red-300 border border-red-700'
                              : 'bg-[#C9A84C]/20 hover:bg-[#C9A84C]/30 text-[#C9A84C] border border-[#C9A84C]/40'
                          }`}
                        >
                          {isLoading ? 'Updating...' : action.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CooldownTimer({ endsDate }: { endsDate: string | null }) {
  const { text, cls } = cooldownDisplay(endsDate);
  return <span className={`text-xs ${cls}`}>{text}</span>;
}

// ---------------------------------------------------------------------------
// Mock AI Letter Generation (typing effect)
// ---------------------------------------------------------------------------

function generateMockLetter(record: DeclineRecord): string {
  const reasonRebuttals: Record<ReasonCategory, string> = {
    too_many_inquiries: `The recent credit inquiries reflect a one-time strategic initiative to establish business credit lines for ${record.businessName}. This was a planned, short-term effort and does not represent ongoing credit-seeking behavior. No additional applications are planned for the next 12 months.`,
    insufficient_history: `While ${record.businessName} is a newer entity on business credit bureaus, the company has been operating successfully for over 18 months with consistent monthly revenue of $45,000+. We have attached bank statements demonstrating strong deposit activity and cash reserves.`,
    high_utilization: `The elevated utilization on personal revolving accounts was a temporary situation related to a business expansion investment. Since the application date, we have paid down balances by over 40%, bringing personal utilization below 30%. Updated credit reports should reflect this improvement.`,
    income_verification: `${record.businessName} generates annual revenue of approximately $540,000, supported by our most recent tax filing (Form 1120S) and 6 months of business bank statements enclosed. Our net operating income comfortably supports the requested ${formatCurrency(record.requestedLimit)} credit line.`,
    velocity: `We understand ${record.issuer}'s policy regarding new account velocity. The recent accounts were part of a deliberate business credit strategy and each serves a distinct operational purpose. ${record.businessName} maintains excellent payment history across all existing accounts with zero late payments.`,
    internal_policy: `We respectfully request that a senior analyst review this application with the additional documentation we are providing. ${record.businessName} has a strong financial profile with consistent revenue growth, no derogatory marks, and a clear business need for the ${record.cardProduct}.`,
    derogatory_marks: `The tax lien referenced in our credit file has been fully resolved and satisfied as of [RESOLUTION DATE]. We have attached the Certificate of Release from the relevant tax authority. This was an isolated event related to a prior accounting error that has since been corrected.`,
    unknown: `We respectfully request reconsideration of the recent decision regarding our application for the ${record.cardProduct}. ${record.businessName} has a strong financial profile and we believe a second review of our application with the enclosed supplemental documentation will demonstrate our creditworthiness.`,
  };

  return `[DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}]

To: ${record.issuer} Reconsideration Department
Re: Application #${record.appId} — ${record.cardProduct}
Business: ${record.businessName}
Requested Credit Line: ${formatCurrency(record.requestedLimit)}

Dear ${record.issuer} Credit Analyst,

I am writing to respectfully request reconsideration of my recent business credit card application (App ID: ${record.appId}) for the ${record.cardProduct}, which was declined on ${record.declinedDate}.

I understand the application was declined due to: ${record.reasonDetail}

I would like to provide the following context to support reconsideration:

REBUTTAL — ${REASON_LABELS[record.reasonCategory].label}:
${reasonRebuttals[record.reasonCategory]}

BUSINESS STRENGTH:
${record.businessName} has demonstrated consistent revenue growth over the past 12 months, maintaining strong cash flow with monthly deposits averaging $45,000. Our business accounts with other financial institutions remain in excellent standing with zero missed payments.

TALKING POINTS FOR PHONE RECON:
- Emphasize the specific business need for this credit product
- Offer to provide additional documentation (bank statements, tax returns, P&L)
- Ask if a secured deposit or reduced credit line would facilitate approval
- Mention existing positive relationship with ${record.issuer} if applicable
- Request the specific department or analyst code for follow-up

I am confident that upon review of the additional context provided, ${record.issuer} will find our application merits approval. I am available to provide any supporting documentation at your earliest convenience.

Sincerely,
[AUTHORIZED SIGNER NAME]
[TITLE]
${record.businessName}
[ADDRESS]
[PHONE] | [EMAIL]`;
}

function LetterGeneratorModal({
  record,
  onClose,
  onToast,
}: {
  record: DeclineRecord;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const fullLetter = useRef(generateMockLetter(record));
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [editableText, setEditableText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charIndexRef = useRef(0);

  const startTypingEffect = useCallback(() => {
    // Reset state
    charIndexRef.current = 0;
    setDisplayedText('');
    setIsTyping(true);
    setIsEditing(false);

    // Clear any previous interval
    if (typingRef.current) clearInterval(typingRef.current);

    const text = fullLetter.current;
    typingRef.current = setInterval(() => {
      charIndexRef.current += 3; // type 3 chars at a time for speed
      if (charIndexRef.current >= text.length) {
        charIndexRef.current = text.length;
        if (typingRef.current) clearInterval(typingRef.current);
        setDisplayedText(text);
        setEditableText(text);
        setIsTyping(false);
      } else {
        setDisplayedText(text.slice(0, charIndexRef.current));
      }
    }, 8);
  }, []);

  // Start typing on mount
  useEffect(() => {
    startTypingEffect();
    return () => {
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, [startTypingEffect]);

  const handleRegenerate = () => {
    fullLetter.current = generateMockLetter(record);
    startTypingEffect();
  };

  const handleCopy = () => {
    const text = isEditing ? editableText : displayedText;
    navigator.clipboard.writeText(text).then(() => {
      onToast('Letter copied to clipboard');
    });
  };

  const handleSaveToVault = () => {
    onToast('Letter saved to Vault');
  };

  const handleEmailToClient = () => {
    onToast('Letter queued for email delivery to client');
  };

  const currentText = isEditing ? editableText : displayedText;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              AI Reconsideration Letter
              {isTyping && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-[#C9A84C]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
                  Generating...
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {record.issuer} · {record.cardProduct} · {record.businessName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Letter body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-yellow-500 mb-3 bg-yellow-900/20 border border-yellow-800 rounded-lg px-3 py-2">
            AI-generated reconsideration letter with tailored rebuttal for &quot;{REASON_LABELS[record.reasonCategory].label}&quot;. Review and edit before sending.
          </p>

          {isEditing ? (
            <textarea
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              className="w-full text-xs text-gray-300 bg-gray-950 rounded-lg p-4 font-mono leading-relaxed border border-[#C9A84C]/40 focus:border-[#C9A84C] focus:outline-none resize-none"
              style={{ minHeight: '400px' }}
            />
          ) : (
            <div
              onClick={() => {
                if (!isTyping) {
                  setIsEditing(true);
                  setEditableText(displayedText);
                }
              }}
              className={`text-xs text-gray-300 bg-gray-950 rounded-lg p-4 whitespace-pre-wrap font-mono leading-relaxed border border-gray-800 ${
                !isTyping ? 'cursor-text hover:border-gray-600' : ''
              }`}
              title={!isTyping ? 'Click to edit' : undefined}
            >
              {currentText}
              {isTyping && <span className="inline-block w-2 h-4 bg-[#C9A84C] ml-0.5 animate-pulse" />}
            </div>
          )}

          {!isTyping && !isEditing && (
            <p className="text-xs text-gray-600 mt-1.5">Click the letter text to edit</p>
          )}
        </div>

        {/* Modal footer — action buttons */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-800">
          <button
            onClick={handleRegenerate}
            disabled={isTyping}
            className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <svg className={`w-3.5 h-3.5 ${isTyping ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerate
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveToVault}
              disabled={isTyping}
              className="px-3 py-2 rounded-lg border border-blue-700 bg-blue-900/40 hover:bg-blue-900/70 text-sm text-blue-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save to Vault
            </button>
            <button
              onClick={handleCopy}
              disabled={isTyping}
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Copy
            </button>
            <button
              onClick={handleEmailToClient}
              disabled={isTyping}
              className="px-3 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#B89A3F] text-sm font-semibold text-[#0A1628] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Email to Client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Searchable Client List (mock data)
// ---------------------------------------------------------------------------

const MOCK_CLIENTS = [
  'Horizon Retail Partners',
  'Apex Ventures LLC',
  'Crestline Medical LLC',
  'NovaTech Solutions Inc.',
  'Blue Ridge Consulting',
  'Summit Capital Group',
  'Pinnacle Freight Corp',
  'Evergreen Holdings',
  'Pacific Coast Logistics',
  'Redwood Capital Partners',
];

const ISSUER_LIST = ['Chase', 'Amex', 'Citi', 'Capital One', 'Bank of America', 'US Bank', 'Wells Fargo', 'Barclays', 'Discover'];

const DECLINE_REASON_OPTIONS: { value: ReasonCategory; label: string }[] = [
  { value: 'too_many_inquiries', label: 'Too Many Inquiries' },
  { value: 'velocity', label: 'Velocity Rule' },
  { value: 'insufficient_history', label: 'Thin File' },
  { value: 'income_verification', label: 'Income Verify' },
  { value: 'derogatory_marks', label: 'Derogatory' },
  { value: 'high_utilization', label: 'High Utilization' },
  { value: 'internal_policy', label: 'Internal Policy' },
  { value: 'unknown', label: 'Unknown' },
];

// ---------------------------------------------------------------------------
// Adverse Action Parsed Result type
// ---------------------------------------------------------------------------

interface AdverseActionParsedData {
  issuer: string;
  reasonCodes: string[];
  creditBureau: string;
  score: number;
  dateIssued: string;
}

// ---------------------------------------------------------------------------
// Adverse Action Parser (Feature 4C)
// ---------------------------------------------------------------------------

function AdverseActionParser({
  onCreateDeclineFromNotice,
}: {
  onCreateDeclineFromNotice: (data: AdverseActionParsedData) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<AdverseActionParsedData | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    setFileName(file.name);
    setParsing(true);
    setParsedData(null);

    // Simulate 2-second parsing delay with mock result
    setTimeout(() => {
      setParsing(false);
      setParsedData({
        issuer: 'Chase',
        reasonCodes: ['Too many recent inquiries (6 in 12 months)', 'Insufficient business credit history', 'High revolving utilization (72%)'],
        creditBureau: 'Experian',
        score: 682,
        dateIssued: '2026-03-28',
      });
    }, 2000);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <h2 className="text-base font-semibold text-gray-200 mb-1">Adverse Action Notice Parser</h2>
      <p className="text-xs text-gray-500 mb-4">
        Upload a decline letter (PDF or image) to auto-extract reason codes and issuer details.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors
          ${dragging
            ? 'border-yellow-600 bg-yellow-900/10'
            : 'border-gray-700 hover:border-gray-600 hover:bg-gray-900'}`}
      >
        <div className="text-3xl mb-2 opacity-40">{parsing ? '...' : String.fromCodePoint(0x1F4C4)}</div>
        <p className="text-sm text-gray-400">
          {parsing
            ? <span className="text-yellow-400 font-semibold animate-pulse">Parsing {fileName}...</span>
            : fileName && parsedData
              ? <span className="text-green-400 font-semibold">{fileName} — parsed successfully</span>
              : <>Drop adverse action notice here, or <span className="text-yellow-500 underline">browse files</span></>}
        </p>
        <p className="text-xs text-gray-600 mt-1">PDF, PNG, JPG accepted</p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {/* Parsing state */}
      {parsing && (
        <div className="mt-4 flex items-center gap-2 text-yellow-400 text-sm">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Extracting reason codes, issuer info, and credit data...
        </div>
      )}

      {/* Parsed result */}
      {parsedData && !parsing && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-green-400">Parse Complete</p>
            <button
              onClick={() => { setParsedData(null); setFileName(null); }}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              Clear
            </button>
          </div>

          {/* Structured result cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Issuer</p>
              <p className="text-sm font-semibold text-white">{parsedData.issuer}</p>
            </div>
            <div className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Credit Bureau</p>
              <p className="text-sm font-semibold text-white">{parsedData.creditBureau}</p>
            </div>
            <div className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Credit Score</p>
              <p className="text-sm font-semibold text-red-400">{parsedData.score}</p>
            </div>
            <div className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Date Issued</p>
              <p className="text-sm font-semibold text-white">{parsedData.dateIssued}</p>
            </div>
          </div>

          {/* Reason codes */}
          <div className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 mb-3">
            <p className="text-xs text-gray-500 mb-1.5">Reason Codes</p>
            <ul className="space-y-1">
              {parsedData.reasonCodes.map((code, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="text-red-500 mt-0.5 flex-shrink-0">&#x2022;</span>
                  {code}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onCreateDeclineFromNotice(parsedData)}
              className="px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8993f] text-xs font-semibold text-gray-900 transition-colors"
            >
              Create Decline Record from This Notice
            </button>
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(parsedData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `adverse-action-${fileName?.replace(/\.[^.]+$/, '') ?? 'parsed'}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 text-xs text-gray-400 transition-colors"
            >
              Export JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log Decline Modal (Feature 5A)
// ---------------------------------------------------------------------------

interface LogDeclineFormData {
  client: string;
  issuer: string;
  cardName: string;
  appId: string;
  declinedDate: string;
  reasonCategory: ReasonCategory;
  requestedLimit: number;
  notes: string;
}

function LogDeclineModal({
  onClose,
  onSubmit,
  prefill,
}: {
  onClose: () => void;
  onSubmit: (data: LogDeclineFormData) => void;
  prefill?: Partial<LogDeclineFormData>;
}) {
  const [form, setForm] = useState<LogDeclineFormData>({
    client: prefill?.client ?? '',
    issuer: prefill?.issuer ?? '',
    cardName: prefill?.cardName ?? '',
    appId: prefill?.appId ?? '',
    declinedDate: prefill?.declinedDate ?? new Date().toISOString().split('T')[0],
    reasonCategory: prefill?.reasonCategory ?? 'unknown',
    requestedLimit: prefill?.requestedLimit ?? 0,
    notes: prefill?.notes ?? '',
  });
  const [clientSearch, setClientSearch] = useState(prefill?.client ?? '');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const filteredClients = useMemo(
    () =>
      clientSearch.length > 0
        ? MOCK_CLIENTS.filter((c) => c.toLowerCase().includes(clientSearch.toLowerCase()))
        : MOCK_CLIENTS,
    [clientSearch],
  );

  const handleChange = (field: keyof LogDeclineFormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client || !form.issuer || !form.cardName) return;
    onSubmit(form);
  };

  const inputCls =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C] transition-colors';
  const labelCls = 'block text-xs font-semibold text-gray-400 mb-1';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-white">Log Decline</h3>
            <p className="text-xs text-gray-400 mt-0.5">Record a new application decline</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none p-1"
            aria-label="Close"
          >
            {String.fromCharCode(10005)}
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Client — searchable dropdown */}
          <div className="relative">
            <label className={labelCls}>Client *</label>
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value);
                handleChange('client', e.target.value);
                setShowClientDropdown(true);
              }}
              onFocus={() => setShowClientDropdown(true)}
              onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
              placeholder="Search client..."
              className={inputCls}
              required
            />
            {showClientDropdown && filteredClients.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredClients.map((c) => (
                  <li
                    key={c}
                    onMouseDown={() => {
                      setClientSearch(c);
                      handleChange('client', c);
                      setShowClientDropdown(false);
                    }}
                    className="px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Issuer */}
          <div>
            <label className={labelCls}>Issuer *</label>
            <select
              value={form.issuer}
              onChange={(e) => handleChange('issuer', e.target.value)}
              className={inputCls}
              required
            >
              <option value="">Select issuer...</option>
              {ISSUER_LIST.map((iss) => (
                <option key={iss} value={iss}>{iss}</option>
              ))}
            </select>
          </div>

          {/* Card Name */}
          <div>
            <label className={labelCls}>Card Name *</label>
            <input
              type="text"
              value={form.cardName}
              onChange={(e) => handleChange('cardName', e.target.value)}
              placeholder="e.g. Ink Business Preferred"
              className={inputCls}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Application ID (optional) */}
            <div>
              <label className={labelCls}>Application ID</label>
              <input
                type="text"
                value={form.appId}
                onChange={(e) => handleChange('appId', e.target.value)}
                placeholder="APP-XXXX"
                className={inputCls}
              />
            </div>

            {/* Declined Date */}
            <div>
              <label className={labelCls}>Declined Date *</label>
              <input
                type="date"
                value={form.declinedDate}
                onChange={(e) => handleChange('declinedDate', e.target.value)}
                className={inputCls}
                required
              />
            </div>
          </div>

          {/* Decline Reason */}
          <div>
            <label className={labelCls}>Decline Reason *</label>
            <select
              value={form.reasonCategory}
              onChange={(e) => handleChange('reasonCategory', e.target.value)}
              className={inputCls}
              required
            >
              {DECLINE_REASON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Requested Limit */}
          <div>
            <label className={labelCls}>Requested Limit</label>
            <input
              type="number"
              value={form.requestedLimit || ''}
              onChange={(e) => handleChange('requestedLimit', Number(e.target.value))}
              placeholder="0"
              min={0}
              className={inputCls}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Additional details about the decline..."
              rows={3}
              className={inputCls + ' resize-none'}
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!form.client || !form.issuer || !form.cardName) return;
              onSubmit(form);
            }}
            disabled={!form.client || !form.issuer || !form.cardName}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8993f] text-sm font-semibold text-gray-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Log Decline
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decline Analytics Chart (Feature 5C)
// ---------------------------------------------------------------------------

interface AnalyticsDataPoint {
  reason: string;
  count: number;
  winRate: number;
}

const ANALYTICS_MOCK_DATA: AnalyticsDataPoint[] = [
  { reason: 'Too Many Inquiries', count: 2, winRate: 35 },
  { reason: 'Velocity Rule',      count: 2, winRate: 20 },
  { reason: 'Thin File',          count: 1, winRate: 10 },
  { reason: 'Income Verify',      count: 1, winRate: 40 },
  { reason: 'Derogatory',         count: 1, winRate: 5 },
];

function getWinRateColor(winRate: number): string {
  if (winRate >= 30) return '#22c55e'; // green
  if (winRate >= 15) return '#f59e0b'; // amber
  return '#ef4444';                     // red
}

function DeclineAnalyticsChart() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-900/60 transition-colors rounded-xl"
      >
        <div>
          <h2 className="text-base font-semibold text-gray-200">Decline Analytics</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Decline reasons by count, colored by historical win rate
          </p>
        </div>
        <span className="text-gray-500 text-sm font-medium px-3 py-1 rounded-lg border border-gray-700 bg-gray-800">
          {expanded ? 'Hide Analytics' : 'View Analytics'}
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ANALYTICS_MOCK_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <XAxis
                  dataKey="reason"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  axisLine={{ stroke: '#374151' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  axisLine={{ stroke: '#374151' }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#f3f4f6', fontWeight: 600 }}
                  formatter={(value: any, _name: any, props: any) => [
                    `${value} decline${value !== 1 ? 's' : ''} (${props.payload.winRate}% win rate)`,
                    'Count',
                  ]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {ANALYTICS_MOCK_DATA.map((entry, index) => (
                    <Cell key={index} fill={getWinRateColor(entry.winRate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#22c55e' }} />
              High win rate (30%+)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
              Medium (15-29%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
              Low (&lt;15%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issuer Recon Guidance Panel (Feature 5B)
// ---------------------------------------------------------------------------

function IssuerGuidancePanel({ guidance }: { guidance: IssuerReconGuidance }) {
  return (
    <tr>
      <td colSpan={10} className="px-4 py-0">
        <div className="rounded-lg border border-[#C9A84C]/30 bg-[#0A1628] px-5 py-4 mb-2 mt-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#C9A84C]">
              {guidance.issuer} Reconsideration Guidance
            </h3>
            <span className="text-xs text-gray-500">
              Historical success: <span className="font-bold text-green-400">{guidance.historicalSuccessRate}%</span>
              {' | '}Avg reversal: <span className="font-bold text-blue-400">{guidance.avgReversalDays}d</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
            <div className="rounded-lg bg-gray-900/60 border border-gray-800 px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Phone</p>
              <p className="text-sm font-semibold text-white">{guidance.phone}</p>
            </div>
            <div className="rounded-lg bg-gray-900/60 border border-gray-800 px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Department</p>
              <p className="text-sm font-semibold text-white">{guidance.department}</p>
            </div>
            <div className="rounded-lg bg-gray-900/60 border border-gray-800 px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Best Time to Call</p>
              <p className="text-sm font-semibold text-white">{guidance.bestTimeToCall}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2">Talking Points</p>
            <ul className="space-y-1.5">
              {guidance.talkingPoints.map((point, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-300">
                  <span className="text-[#C9A84C] font-bold flex-shrink-0">{i + 1}.</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DeclinesPage() {
  const router = useRouter();
  const [declineRecords, setDeclineRecords] = useState<DeclineRecord[]>(DECLINE_RECORDS);
  const [selectedRecord, setSelectedRecord] = useState<DeclineRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [showLogDeclineModal, setShowLogDeclineModal] = useState(false);
  const [logDeclinePrefill, setLogDeclinePrefill] = useState<Partial<LogDeclineFormData> | undefined>(undefined);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const handleAdvanceStage = useCallback((id: string, stage: RecoveryStage) => {
    // Simulate mock PATCH /api/declines/:id/stage
    setAdvancingId(id);
    setTimeout(() => {
      setDeclineRecords(prev => prev.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, recoveryStage: stage };
        if (stage === 'won' || stage === 'lost') {
          updated.resolvedAt = new Date().toISOString().split('T')[0];
          updated.reconStatus = stage === 'won' ? 'approved' : 'denied';
        }
        return updated;
      }));
      setAdvancingId(null);
      showToast(`Stage updated to ${RECOVERY_STAGE_LABELS[stage]}`);
    }, 350); // Brief delay to simulate network round-trip
  }, [showToast]);

  // Feature 5A — open Log Decline modal
  const handleLogDecline = () => {
    setLogDeclinePrefill(undefined);
    setShowLogDeclineModal(true);
  };

  // Feature 5A — submit handler
  const handleLogDeclineSubmit = useCallback((data: LogDeclineFormData) => {
    const newRecord: DeclineRecord = {
      id: `dec_${String(Date.now()).slice(-6)}`,
      businessName: data.client,
      issuer: data.issuer,
      cardProduct: data.cardName,
      declinedDate: data.declinedDate,
      reasonCategory: data.reasonCategory,
      reasonDetail: data.notes || REASON_LABELS[data.reasonCategory]?.label || 'No details provided.',
      reconStatus: 'not_started',
      cooldownEndsDate: null,
      requestedLimit: data.requestedLimit,
      appId: data.appId || `APP-${String(Date.now()).slice(-4)}`,
      recoveryStage: 'new',
      resolvedAt: null,
    };
    setDeclineRecords(prev => [newRecord, ...prev]);
    setShowLogDeclineModal(false);
    showToast(`Decline logged for ${data.client}`);
  }, [showToast]);

  // Feature 4D — Reapply handler
  const handleReapply = (item: ReapplyItem) => {
    if (item.eligible) {
      router.push(`/applications?issuer=${encodeURIComponent(item.issuer)}&card=${encodeURIComponent(item.cardProduct)}`);
    }
  };

  // Feature 4D — Set Reminder handler
  const handleSetReminder = useCallback((item: ReapplyItem) => {
    showToast(`Reminder set for ${item.eligibleDate} — ${item.issuer} ${item.cardProduct}`);
  }, [showToast]);

  // Feature 4C — Create decline record from adverse action notice
  const handleCreateDeclineFromNotice = useCallback((data: AdverseActionParsedData) => {
    // Map the first reason code to a category
    let category: ReasonCategory = 'unknown';
    const firstReason = (data.reasonCodes[0] ?? '').toLowerCase();
    if (firstReason.includes('inquir')) category = 'too_many_inquiries';
    else if (firstReason.includes('history') || firstReason.includes('thin')) category = 'insufficient_history';
    else if (firstReason.includes('utilization')) category = 'high_utilization';
    else if (firstReason.includes('income') || firstReason.includes('verif')) category = 'income_verification';
    else if (firstReason.includes('velocity') || firstReason.includes('5/24')) category = 'velocity';
    else if (firstReason.includes('derogatory') || firstReason.includes('lien')) category = 'derogatory_marks';
    else if (firstReason.includes('policy') || firstReason.includes('internal')) category = 'internal_policy';

    setLogDeclinePrefill({
      issuer: data.issuer,
      declinedDate: data.dateIssued,
      reasonCategory: category,
      notes: `Parsed from adverse action notice.\nCredit Bureau: ${data.creditBureau}\nScore: ${data.score}\nReasons:\n${data.reasonCodes.map(r => `  - ${r}`).join('\n')}`,
    });
    setShowLogDeclineModal(true);
  }, []);

  const filteredDeclines = declineRecords.filter((d) => {
    const matchStatus = statusFilter === 'all' || d.reconStatus === statusFilter;
    const matchReason = reasonFilter === 'all' || d.reasonCategory === reasonFilter;
    const matchSearch = !search ||
      d.businessName.toLowerCase().includes(search.toLowerCase()) ||
      d.issuer.toLowerCase().includes(search.toLowerCase()) ||
      d.cardProduct.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchReason && matchSearch;
  });

  const totalDeclines = declineRecords.length;
  const inReview = declineRecords.filter((d) => d.reconStatus === 'in_review').length;
  const reconApproved = declineRecords.filter((d) => d.reconStatus === 'approved').length;
  const eligibleNow = REAPPLY_CALENDAR.filter((r) => r.eligible).length;
  const recoveryStats = computeRecoveryStats(declineRecords);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Decline Recovery</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalDeclines} total declines · {inReview} in recon review · {reconApproved} reversed · {eligibleNow} eligible to reapply
          </p>
        </div>
        <button
          onClick={handleLogDecline}
          className="px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm font-semibold text-white transition-colors"
        >
          + Log Decline
        </button>
      </div>

      {/* ── KPI summary ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Declines', value: totalDeclines, cls: 'text-white' },
          { label: 'Recon In Review', value: inReview, cls: 'text-yellow-400' },
          { label: 'Reversed', value: reconApproved, cls: 'text-green-400' },
          { label: 'Eligible Now', value: eligibleNow, cls: 'text-blue-400' },
          { label: 'Win Rate', value: `${recoveryStats.winRate}%`, cls: 'text-[#C9A84C]' },
          { label: 'Avg Recovery', value: `${recoveryStats.avgDays}d`, cls: 'text-purple-400' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Recovery Tracker ─────────────────────────────────────── */}
      <RecoveryTracker records={declineRecords} onAdvance={handleAdvanceStage} advancingId={advancingId} />

      {/* ── Section 5C: Decline Analytics Chart ──────────────────── */}
      <DeclineAnalyticsChart />

      {/* ── Section 1: Declines Table ─────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-base font-semibold text-gray-200">Decline Records</h2>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Search business or issuer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-600 w-52"
            />
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-yellow-600"
            >
              <option value="all">All Reasons</option>
              {Object.entries(REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-yellow-600"
            >
              <option value="all">All Statuses</option>
              {Object.entries(RECON_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">App ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Business</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Issuer / Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Declined</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Recon Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Recovery Stage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Cooldown</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Limit</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredDeclines.map((d) => {
                const reason = REASON_LABELS[d.reasonCategory];
                const recon = RECON_STATUS_LABELS[d.reconStatus];
                const isExpanded = expandedRowId === d.id;
                const guidance = getReconGuidance(d.issuer);
                return (
                  <React.Fragment key={d.id}>
                    <tr
                      onClick={() => setExpandedRowId(isExpanded ? null : d.id)}
                      className={`hover:bg-gray-900/60 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-900/40' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{d.appId}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-100 text-xs">{d.businessName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white text-xs">{d.issuer}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{d.cardProduct}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{d.declinedDate}</td>
                      <td className="px-4 py-3">
                        <span
                          title={d.reasonDetail}
                          className={`text-xs font-semibold px-2 py-0.5 rounded border cursor-help ${reason.cls}`}
                        >
                          {reason.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${recon.cls}`}>
                          {recon.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${RECOVERY_STAGE_COLORS[d.recoveryStage]}`}>
                          {RECOVERY_STAGE_LABELS[d.recoveryStage]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <CooldownTimer endsDate={d.cooldownEndsDate} />
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-300 font-semibold">
                        {formatCurrency(d.requestedLimit)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedRecord(d); }}
                          className="text-xs px-2 py-1 rounded bg-yellow-900 hover:bg-yellow-800 text-yellow-300 border border-yellow-700 transition-colors whitespace-nowrap"
                        >
                          Write Letter
                        </button>
                      </td>
                    </tr>
                    {isExpanded && guidance && <IssuerGuidancePanel guidance={guidance} />}
                  </React.Fragment>
                );
              })}
              {filteredDeclines.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-gray-600 text-sm">
                    No decline records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 2 & 3: Recon CTA + Reapply Calendar ──────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Section 2: Reconsideration Letter Generator */}
        <section className="xl:col-span-2 rounded-xl border border-gray-800 bg-gray-900/40 p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-200 mb-1">Reconsideration Generator</h2>
            <p className="text-xs text-gray-500">
              Select a decline record from the table above and click "Write Letter" to generate a tailored reconsideration letter for that issuer.
            </p>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center py-6 border-2 border-dashed border-gray-800 rounded-lg text-center gap-2">
            <p className="text-3xl opacity-30">✉</p>
            <p className="text-sm text-gray-500">No letter selected</p>
            <p className="text-xs text-gray-600">Click "Write Letter" in any decline row</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-white">{declineRecords.filter(d => d.reconStatus !== 'not_started').length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Recons Initiated</p>
            </div>
            <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-green-400">{reconApproved}</p>
              <p className="text-xs text-gray-500 mt-0.5">Reversals Won</p>
            </div>
          </div>
        </section>

        {/* Section 3: Reapply Calendar */}
        <section className="xl:col-span-3 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">Reapply Eligibility Calendar</h2>
          <p className="text-xs text-gray-500 mb-4">When each declined issuer becomes eligible for reapplication</p>

          <div className="space-y-2">
            {REAPPLY_CALENDAR.sort((a, b) => a.daysRemaining - b.daysRemaining).map((r, i) => {
              const barPct = r.eligible ? 100 : Math.max(0, 100 - Math.round((r.daysRemaining / 180) * 100));
              const barColor = r.eligible
                ? 'bg-green-600'
                : r.daysRemaining <= 30 ? 'bg-yellow-600'
                  : r.daysRemaining <= 90 ? 'bg-orange-700'
                    : 'bg-gray-700';

              return (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors
                  ${r.eligible ? 'border-green-800 bg-green-900/10' : 'border-gray-800 bg-gray-900/30'}`}>
                  {/* Issuer */}
                  <div className="w-28 flex-shrink-0">
                    <p className="text-xs font-semibold text-gray-100 truncate">{r.issuer}</p>
                    <p className="text-xs text-gray-600 truncate">{r.businessName.split(' ').slice(0, 2).join(' ')}</p>
                  </div>

                  {/* Progress bar */}
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Date */}
                  <div className="w-28 text-right flex-shrink-0">
                    {r.eligible ? (
                      <span className="text-xs font-bold text-green-400">Eligible Now</span>
                    ) : (
                      <>
                        <p className="text-xs text-gray-300 font-semibold">{r.eligibleDate}</p>
                        <p className="text-xs text-gray-600">{r.daysRemaining}d away</p>
                      </>
                    )}
                  </div>

                  {/* Reapply / Set Reminder button (Feature 4D) */}
                  <div className="flex-shrink-0">
                    {r.eligible ? (
                      <button
                        onClick={() => handleReapply(r)}
                        className="px-2.5 py-1 rounded bg-green-900 hover:bg-green-800 text-green-300 text-xs font-semibold border border-green-700 transition-colors"
                      >
                        Reapply
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSetReminder(r)}
                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold border border-gray-600 transition-colors"
                      >
                        Set Reminder
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Section 4: Adverse Action Parser (Feature 4C) ──────── */}
      <AdverseActionParser onCreateDeclineFromNotice={handleCreateDeclineFromNotice} />

      {/* ── Letter Generator Modal ────────────────────────────────── */}
      {selectedRecord && (
        <LetterGeneratorModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onToast={showToast}
        />
      )}

      {/* ── Log Decline Modal (Feature 5A) ────────────────────────── */}
      {showLogDeclineModal && (
        <LogDeclineModal
          onClose={() => setShowLogDeclineModal(false)}
          onSubmit={handleLogDeclineSubmit}
          prefill={logDeclinePrefill}
        />
      )}
    </div>
  );
}
