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

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReasonCategory = 'too_many_inquiries' | 'insufficient_history' | 'high_utilization' | 'income_verification' | 'velocity' | 'internal_policy' | 'derogatory_marks';
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

  // Avg days from decline to resolution
  const resolvedWithDates = resolved.filter(r => r.resolvedAt);
  let avgDays = 0;
  if (resolvedWithDates.length > 0) {
    const total = resolvedWithDates.reduce((sum, r) => {
      const days = Math.ceil(
        (new Date(r.resolvedAt!).getTime() - new Date(r.declinedDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      return sum + days;
    }, 0);
    avgDays = Math.round(total / resolvedWithDates.length);
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
// Adverse Action Parser
// ---------------------------------------------------------------------------

function AdverseActionParser() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    setFileName(file.name);
    // Simulate parsing — replace with real OCR/parse logic
    setTimeout(() => {
      setParseResult(
        `Parsed from: ${file.name}\n\nIssuer: [Detected from letterhead]\nDate: [Extracted]\nPrimary Reason Codes:\n  • [Reason 1 extracted from notice]\n  • [Reason 2 extracted from notice]\nAction Required: Review reasons, add to decline record, schedule recon call.\n\nNote: Connect to OCR service to extract full reason codes automatically.`
      );
    }, 900);
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
        <div className="text-3xl mb-2 opacity-40">📄</div>
        <p className="text-sm text-gray-400">
          {fileName
            ? <span className="text-yellow-400 font-semibold">{fileName} — parsing…</span>
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

      {/* Parse result */}
      {parseResult && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-green-400">Parse Complete</p>
            <button
              onClick={() => { setParseResult(null); setFileName(null); }}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              Clear
            </button>
          </div>
          <pre className="text-xs text-gray-300 bg-gray-950 rounded-lg p-3 whitespace-pre-wrap font-mono border border-gray-800">
            {parseResult}
          </pre>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => alert('Parsed data added to decline records.')}
              className="px-3 py-1.5 rounded-lg bg-blue-800 hover:bg-blue-700 text-xs font-semibold text-blue-200 transition-colors"
            >
              Add to Decline Record
            </button>
            <button
              onClick={() => {
                const blob = new Blob([parseResult ?? ''], { type: 'application/json' });
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

  const handleLogDecline = () => {
    showToast('Log Decline form coming soon — use the Applications pipeline to track new declines.');
  };

  const handleReapply = (item: ReapplyItem) => {
    router.push(`/applications/new?issuer=${encodeURIComponent(item.issuer)}&card=${encodeURIComponent(item.cardProduct)}`);
  };

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
                return (
                  <tr key={d.id} className="hover:bg-gray-900/60 transition-colors">
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
                        onClick={() => setSelectedRecord(d)}
                        className="text-xs px-2 py-1 rounded bg-yellow-900 hover:bg-yellow-800 text-yellow-300 border border-yellow-700 transition-colors whitespace-nowrap"
                      >
                        Write Letter
                      </button>
                    </td>
                  </tr>
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

                  {/* Reapply button */}
                  {r.eligible && (
                    <button
                      onClick={() => handleReapply(r)}
                      className="flex-shrink-0 px-2.5 py-1 rounded bg-green-900 hover:bg-green-800 text-green-300 text-xs font-semibold border border-green-700 transition-colors"
                    >
                      Reapply
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Section 4: Adverse Action Parser ─────────────────────── */}
      <AdverseActionParser />

      {/* ── Letter Generator Modal ────────────────────────────────── */}
      {selectedRecord && (
        <LetterGeneratorModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onToast={showToast}
        />
      )}
    </div>
  );
}
