'use client';

// ============================================================
// /financial-control/hardship — Hardship Case Manager
//
// Sections:
//   1. Client selector filtered to "at risk" clients
//   2. Hardship flag type selector
//   3. Resolution tracker (open > in_negotiation > resolved > written_off)
//   4. Workout proposal section (text area for notes)
//   5. Table of active hardship cases
//   6. New case creation modal
//   7. Case detail panel with debt summary, timeline, and actions (3A)
//   8. Interactive 4-stage pipeline dots (3B)
// ============================================================

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HardshipFlag = 'missed_payment' | 'high_utilization' | 'income_change' | 'business_closure';
type ResolutionStatus = 'open' | 'in_negotiation' | 'resolved' | 'written_off';
type ProposedResolution = 'payment_plan' | 'settlement' | 'card_closure' | 'deferral' | 'balance_transfer' | 'undetermined';

/** 4-stage pipeline for case advancement (3B) */
const STAGE_LABELS = ['Initial Contact', 'Proposal Sent', 'Negotiation', 'Resolved'] as const;
type StageIndex = 0 | 1 | 2 | 3;

interface ActivityEvent {
  id: string;
  caseId: string;
  timestamp: string;
  label: string;
  type: 'call' | 'email' | 'note' | 'status' | 'system';
}

interface AtRiskClient {
  id: string;
  name: string;
  businessName: string;
  fico: number;
  utilization: number;
  missedPayments: number;
  totalDebt: number;
}

interface MockCard {
  id: string;
  label: string;
}

interface HardshipCase {
  id: string;
  clientId: string;
  clientName: string;
  businessName: string;
  flag: HardshipFlag;
  status: ResolutionStatus;
  totalDebt: number;
  cardsAffected: number;
  missedPayments: number;
  utilization: number;
  openedAt: string;
  lastUpdated: string;
  assignedAdvisor: string;
  workoutNotes: string;
  stageIndex: StageIndex;
  debtAtRisk?: number;
  affectedCards?: string[];
  proposedResolution?: ProposedResolution;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const AT_RISK_CLIENTS: AtRiskClient[] = [
  { id: 'arc_1', name: 'Carlos Mendez', businessName: 'Mendez Trucking LLC', fico: 620, utilization: 92, missedPayments: 3, totalDebt: 84_500 },
  { id: 'arc_2', name: 'Patricia Wong', businessName: 'Wong Consulting Group', fico: 645, utilization: 87, missedPayments: 2, totalDebt: 62_300 },
  { id: 'arc_3', name: 'James Thornton', businessName: 'Thornton Construction Inc', fico: 590, utilization: 95, missedPayments: 4, totalDebt: 128_700 },
  { id: 'arc_4', name: 'Maria Santos', businessName: 'Santos Bakery & Cafe', fico: 660, utilization: 78, missedPayments: 1, totalDebt: 34_200 },
  { id: 'arc_5', name: 'Robert Kim', businessName: 'Kim Auto Parts LLC', fico: 610, utilization: 88, missedPayments: 3, totalDebt: 95_600 },
];

const MOCK_CARDS: MockCard[] = [
  { id: 'card_1', label: 'Chase Ink Business Preferred' },
  { id: 'card_2', label: 'Amex Business Gold' },
  { id: 'card_3', label: 'Capital One Spark Cash Plus' },
  { id: 'card_4', label: 'Citi Business Platinum' },
  { id: 'card_5', label: 'Bank of America Business Advantage' },
  { id: 'card_6', label: 'Wells Fargo Business Elite' },
];

const RESOLUTION_OPTIONS: { value: ProposedResolution; label: string }[] = [
  { value: 'undetermined', label: 'Undetermined' },
  { value: 'payment_plan', label: 'Payment Plan' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'card_closure', label: 'Card Closure' },
  { value: 'deferral', label: 'Deferral' },
  { value: 'balance_transfer', label: 'Balance Transfer' },
];

const PLACEHOLDER_CASES: HardshipCase[] = [
  {
    id: 'hc_001', clientId: 'arc_1', clientName: 'Carlos Mendez', businessName: 'Mendez Trucking LLC',
    flag: 'missed_payment', status: 'in_negotiation', totalDebt: 84_500, cardsAffected: 3, missedPayments: 3,
    utilization: 92, openedAt: '2026-02-15', lastUpdated: '2026-03-28',
    assignedAdvisor: 'Sarah Mitchell', stageIndex: 2,
    workoutNotes: 'Client experiencing cash flow disruption due to fleet maintenance costs. Proposed 6-month reduced payment plan at 60% of minimum. Awaiting issuer response on Chase Ink account.',
  },
  {
    id: 'hc_002', clientId: 'arc_3', clientName: 'James Thornton', businessName: 'Thornton Construction Inc',
    flag: 'high_utilization', status: 'open', totalDebt: 128_700, cardsAffected: 5, missedPayments: 4,
    utilization: 95, openedAt: '2026-03-05', lastUpdated: '2026-03-30',
    assignedAdvisor: 'David Park', stageIndex: 0,
    workoutNotes: 'High utilization across 5 cards. Construction project delayed 90 days. Evaluating settlement offers from Amex and Capital One.',
  },
  {
    id: 'hc_003', clientId: 'arc_2', clientName: 'Patricia Wong', businessName: 'Wong Consulting Group',
    flag: 'income_change', status: 'in_negotiation', totalDebt: 62_300, cardsAffected: 2, missedPayments: 2,
    utilization: 87, openedAt: '2026-01-20', lastUpdated: '2026-03-15',
    assignedAdvisor: 'Sarah Mitchell', stageIndex: 1,
    workoutNotes: 'Lost major client (35% of revenue). Negotiating hardship rate reduction with Chase and Citi. Client enrolled in business counseling program.',
  },
  {
    id: 'hc_004', clientId: 'arc_5', clientName: 'Robert Kim', businessName: 'Kim Auto Parts LLC',
    flag: 'business_closure', status: 'open', totalDebt: 95_600, cardsAffected: 4, missedPayments: 3,
    utilization: 88, openedAt: '2026-03-20', lastUpdated: '2026-04-01',
    assignedAdvisor: 'David Park', stageIndex: 0,
    workoutNotes: 'Business winding down operations. Exploring settlement options for all outstanding balances. Priority: negotiate below 50 cents on the dollar where possible.',
  },
  {
    id: 'hc_005', clientId: 'arc_4', clientName: 'Maria Santos', businessName: 'Santos Bakery & Cafe',
    flag: 'missed_payment', status: 'resolved', totalDebt: 34_200, cardsAffected: 1, missedPayments: 1,
    utilization: 78, openedAt: '2025-12-10', lastUpdated: '2026-02-28',
    assignedAdvisor: 'Sarah Mitchell', stageIndex: 3,
    workoutNotes: 'Resolved. Client enrolled in 12-month payment plan. First two payments received on time. Late fees waived by Amex.',
  },
];

// ---------------------------------------------------------------------------
// Mock activity timeline events (3A)
// ---------------------------------------------------------------------------

const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: 'ev_01', caseId: 'hc_001', timestamp: '2026-03-28T14:30:00', label: 'Follow-up call with client — confirmed receipt of proposal', type: 'call' },
  { id: 'ev_02', caseId: 'hc_001', timestamp: '2026-03-20T09:00:00', label: 'Proposal emailed to Chase Ink issuer relations', type: 'email' },
  { id: 'ev_03', caseId: 'hc_001', timestamp: '2026-02-15T11:15:00', label: 'Case opened — missed payment flag triggered', type: 'system' },
  { id: 'ev_04', caseId: 'hc_002', timestamp: '2026-03-30T10:00:00', label: 'Initial assessment completed — 5 cards identified', type: 'note' },
  { id: 'ev_05', caseId: 'hc_002', timestamp: '2026-03-05T08:45:00', label: 'Case opened — high utilization flag triggered', type: 'system' },
  { id: 'ev_06', caseId: 'hc_003', timestamp: '2026-03-15T16:00:00', label: 'Rate reduction proposal sent to Chase and Citi', type: 'email' },
  { id: 'ev_07', caseId: 'hc_003', timestamp: '2026-02-10T13:30:00', label: 'Client enrolled in business counseling program', type: 'note' },
  { id: 'ev_08', caseId: 'hc_003', timestamp: '2026-01-20T09:00:00', label: 'Case opened — income change flag triggered', type: 'system' },
  { id: 'ev_09', caseId: 'hc_004', timestamp: '2026-04-01T11:00:00', label: 'Settlement evaluation started for all balances', type: 'note' },
  { id: 'ev_10', caseId: 'hc_004', timestamp: '2026-03-20T09:30:00', label: 'Case opened — business closure flag triggered', type: 'system' },
  { id: 'ev_11', caseId: 'hc_005', timestamp: '2026-02-28T15:00:00', label: 'Case resolved — payment plan confirmed, late fees waived', type: 'status' },
  { id: 'ev_12', caseId: 'hc_005', timestamp: '2026-01-15T10:00:00', label: 'Amex agreed to waive late fees and reduce APR', type: 'email' },
  { id: 'ev_13', caseId: 'hc_005', timestamp: '2025-12-10T08:00:00', label: 'Case opened — missed payment flag triggered', type: 'system' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FLAG_CONFIG: Record<HardshipFlag, { label: string; badgeClass: string }> = {
  missed_payment:    { label: 'Missed Payment',    badgeClass: 'bg-red-900 text-red-300 border-red-700' },
  high_utilization:  { label: 'High Utilization',   badgeClass: 'bg-orange-900 text-orange-300 border-orange-700' },
  income_change:     { label: 'Income Change',      badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  business_closure:  { label: 'Business Closure',   badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
};

const STATUS_CONFIG: Record<ResolutionStatus, { label: string; badgeClass: string; step: number }> = {
  open:             { label: 'Open',            badgeClass: 'bg-red-900 text-red-300 border-red-700', step: 0 },
  in_negotiation:   { label: 'In Negotiation',  badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700', step: 1 },
  resolved:         { label: 'Resolved',         badgeClass: 'bg-green-900 text-green-300 border-green-700', step: 2 },
  written_off:      { label: 'Written Off',      badgeClass: 'bg-gray-800 text-gray-400 border-gray-600', step: 3 },
};

const STATUS_STEPS: ResolutionStatus[] = ['open', 'in_negotiation', 'resolved', 'written_off'];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string): string {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

// ---------------------------------------------------------------------------
// Workout Proposal Generator — mock AI content
// ---------------------------------------------------------------------------

function generateWorkoutProposal(c: HardshipCase): string {
  const reducedPayment = Math.round(c.totalDebt * 0.02);
  const monthlyOriginal = Math.round(c.totalDebt * 0.035);
  const settlementPct = c.missedPayments >= 3 ? 55 : 65;
  const settlementAmt = Math.round(c.totalDebt * (settlementPct / 100));
  const timeline = c.missedPayments >= 3 ? 24 : 18;

  return `WORKOUT PROPOSAL — ${c.clientName}
${c.businessName}
Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
Advisor: ${c.assignedAdvisor}
─────────────────────────────────────────

Dear ${c.clientName},

We understand that ${c.businessName} is experiencing financial difficulties, and we want to work with you to find a sustainable path forward. After a thorough review of your account, we are pleased to present the following workout proposal for your consideration.

CURRENT SITUATION:
- Outstanding Balance: ${formatCurrency(c.totalDebt)}
- Missed Payments: ${c.missedPayments}
- Credit Utilization: ${c.utilization}%
- Current Status: ${STATUS_CONFIG[c.status].label}

PROPOSED TERMS:
1. Reduced Monthly Payment: ${formatCurrency(reducedPayment)}/mo (down from ${formatCurrency(monthlyOriginal)}/mo) for the first 6 months
2. Interest Rate Reduction: Temporary reduction to 9.99% APR (from current variable rate) during the workout period
3. Late Fee Waiver: All accumulated late fees (estimated ${formatCurrency(c.missedPayments * 39)}) will be waived upon enrollment
4. Settlement Option: One-time lump sum settlement at ${settlementPct}% (${formatCurrency(settlementAmt)}) if paid within 90 days
5. Timeline: ${timeline}-month structured repayment plan with quarterly reviews

TAX CONSIDERATIONS:
Note: Per IRC Section 163(j), business interest expense deductions may be limited to 30% of adjusted taxable income. Any forgiven debt exceeding $600 may be reported on Form 1099-C. We recommend consulting with your tax advisor regarding the implications of debt settlement or forgiveness on your business tax obligations.

NEXT STEPS:
- Review and sign the enclosed workout agreement
- Set up automatic payment via ACH (reduces rate by additional 0.25%)
- Schedule quarterly financial review with your assigned advisor
- Maintain communication regarding any changes in business revenue

This proposal is valid for 30 days from the date above. We are committed to supporting ${c.businessName} through this challenging period and are confident that, together, we can establish a manageable repayment plan.

Respectfully,
CapitalForge Hardship Resolution Team`;
}

// ---------------------------------------------------------------------------
// VoiceForge Call Script Guidance — stage-based
// ---------------------------------------------------------------------------

type VoiceForgeStage = 1 | 2 | 3 | 4;

interface VoiceForgeScript {
  stage: VoiceForgeStage;
  title: string;
  objective: string;
  keyPoints: string[];
  openingScript: string;
  toneGuidance: string;
}

function getVoiceForgeScript(c: HardshipCase): VoiceForgeScript {
  const stageMap: Record<ResolutionStatus, VoiceForgeStage> = {
    open: 1,
    in_negotiation: 2,
    resolved: 3,
    written_off: 4,
  };

  const stage = stageMap[c.status];

  const scripts: Record<VoiceForgeStage, VoiceForgeScript> = {
    1: {
      stage: 1,
      title: 'Empathetic Introduction',
      objective: 'Understand the client\'s current financial situation and express willingness to help.',
      keyPoints: [
        'Introduce yourself and CapitalForge\'s hardship program',
        'Express empathy — acknowledge the difficulty of the situation',
        'Ask open-ended questions about their business challenges',
        'Listen actively — do not push solutions yet',
        'Gather information about income changes, expenses, and timeline expectations',
        'Confirm contact preferences and best times to reach them',
      ],
      openingScript: `"Good [morning/afternoon], ${c.clientName}. This is [Your Name] from CapitalForge's Client Support team. I'm reaching out because we noticed some recent changes on your account with ${c.businessName}, and I wanted to personally check in to see how things are going. We have programs designed specifically to help businesses through challenging periods, and I'd love to understand your situation better so we can explore what options might work for you."`,
      toneGuidance: 'Warm, patient, non-judgmental. Avoid financial jargon. Let the client lead the conversation.',
    },
    2: {
      stage: 2,
      title: 'Proposal Follow-Up',
      objective: 'Review the workout proposal, answer questions, and address concerns.',
      keyPoints: [
        'Reference the previously sent workout proposal',
        'Walk through each proposed term clearly',
        'Address any questions about payment amounts or timeline',
        'Explain the interest rate reduction and fee waiver benefits',
        'Discuss the settlement option if appropriate',
        'Mention the Section 163(j) tax consideration and recommend their tax advisor',
        'Set clear next steps and timeline for decision',
      ],
      openingScript: `"Hi ${c.clientName}, this is [Your Name] from CapitalForge. I'm following up on the workout proposal we prepared for ${c.businessName}. I wanted to make sure you had a chance to review it and answer any questions you might have about the proposed terms. Our goal is to find an arrangement that works for both sides — shall we walk through the details together?"`,
      toneGuidance: 'Professional yet approachable. Be prepared with specific numbers. Show flexibility on terms.',
    },
    3: {
      stage: 3,
      title: 'Terms Discussion & Modification',
      objective: 'Negotiate final terms and explore modifications if needed.',
      keyPoints: [
        'Review any counter-proposals from the client',
        'Discuss modified payment schedules if standard terms don\'t fit',
        'Explore alternative structures (longer timeline, different payment cadence)',
        'Confirm the client\'s ability to meet proposed obligations',
        'Document any agreed modifications',
        'Prepare the final agreement for signature',
        'Discuss monitoring and quarterly review process',
      ],
      openingScript: `"Hello ${c.clientName}, thank you for getting back to us regarding ${c.businessName}'s workout plan. I understand you had some thoughts on the proposed terms, and I'm here to work with you on finding the right balance. Let's discuss what adjustments might make this plan more sustainable for your business."`,
      toneGuidance: 'Collaborative and solution-oriented. Be ready to offer alternatives. Document everything discussed.',
    },
    4: {
      stage: 4,
      title: 'Confirm Agreed Plan & Next Steps',
      objective: 'Finalize the agreed-upon workout plan and establish clear next steps.',
      keyPoints: [
        'Summarize all agreed terms clearly',
        'Confirm the start date and first payment date',
        'Explain the ACH setup process for automatic payments',
        'Provide contact information for ongoing support',
        'Schedule the first quarterly review',
        'Send written confirmation and agreement documents',
        'Express confidence in the plan and continued partnership',
      ],
      openingScript: `"${c.clientName}, great news — I have the finalized workout agreement ready for ${c.businessName}. I'd like to walk through the confirmed terms one more time to make sure everything aligns with what we discussed, and then we can get you set up with the new payment schedule. This is a positive step forward, and we're here to support you throughout the process."`,
      toneGuidance: 'Confident and reassuring. Celebrate the resolution. Be clear on logistics and deadlines.',
    },
  };

  return scripts[stage];
}

function showToast(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  el.className =
    'fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-100 shadow-2xl';
  el.style.animation = 'fadeInUp 0.3s ease, fadeOut 0.3s ease 2.5s forwards';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------------------------------------------------------------------------
// Resolution Tracker component (status-based, read-only)
// ---------------------------------------------------------------------------

function ResolutionTracker({ status }: { status: ResolutionStatus }) {
  const currentStep = STATUS_CONFIG[status].step;

  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, i) => {
        const cfg = STATUS_CONFIG[step];
        const isActive = i <= currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold border transition-colors ${
                isCurrent
                  ? 'bg-[#C9A84C] text-[#0A1628] border-[#C9A84C]'
                  : isActive
                  ? 'bg-gray-700 text-gray-300 border-gray-600'
                  : 'bg-gray-900 text-gray-600 border-gray-800'
              }`}
              title={cfg.label}
            >
              {i + 1}
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={`w-4 h-0.5 ${i < currentStep ? 'bg-[#C9A84C]' : 'bg-gray-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage Dots component (3B) — Interactive 4-stage pipeline
// ---------------------------------------------------------------------------

function StageDots({
  stageIndex,
  onAdvance,
}: {
  stageIndex: StageIndex;
  onAdvance: (nextStage: StageIndex) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {STAGE_LABELS.map((label, i) => {
        const isCompleted = i < stageIndex;
        const isCurrent = i === stageIndex;
        const isNext = i === stageIndex + 1;
        const isFuture = i > stageIndex + 1;
        const canClick = isNext;

        return (
          <div key={label} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canClick}
              onClick={() => {
                if (canClick) onAdvance(i as StageIndex);
              }}
              title={
                canClick
                  ? `Advance to Stage ${i + 1}: ${label}`
                  : isCompleted
                  ? `Completed: ${label}`
                  : isCurrent
                  ? `Current: ${label}`
                  : label
              }
              className={`flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold border-2 transition-all ${
                isCompleted
                  ? 'bg-green-600 text-white border-green-500 cursor-default'
                  : isCurrent
                  ? 'bg-[#C9A84C] text-[#0A1628] border-[#C9A84C] cursor-default ring-2 ring-[#C9A84C]/30'
                  : canClick
                  ? 'bg-gray-900 text-[#C9A84C] border-[#C9A84C]/50 hover:bg-[#C9A84C]/20 hover:border-[#C9A84C] cursor-pointer'
                  : 'bg-gray-900 text-gray-600 border-gray-800 cursor-default'
              }`}
            >
              {isCompleted ? '\u2713' : i + 1}
            </button>
            {i < STAGE_LABELS.length - 1 && (
              <div className={`w-5 h-0.5 ${isCompleted ? 'bg-green-500' : isCurrent && !isFuture ? 'bg-[#C9A84C]/40' : 'bg-gray-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity event type icon helper
// ---------------------------------------------------------------------------

const ACTIVITY_ICON: Record<ActivityEvent['type'], { icon: string; color: string }> = {
  call:   { icon: '\u260E', color: 'text-blue-400' },
  email:  { icon: '\u2709', color: 'text-purple-400' },
  note:   { icon: '\u270E', color: 'text-gray-400' },
  status: { icon: '\u25CF', color: 'text-green-400' },
  system: { icon: '\u26A0', color: 'text-yellow-400' },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancialControlHardshipPage() {
  const [cases, setCases] = useState<HardshipCase[]>(PLACEHOLDER_CASES);
  const [filterFlag, setFilterFlag] = useState<HardshipFlag | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<ResolutionStatus | 'all'>('all');
  const [selectedCase, setSelectedCase] = useState<HardshipCase | null>(PLACEHOLDER_CASES[0]);
  const [editingNotes, setEditingNotes] = useState(PLACEHOLDER_CASES[0].workoutNotes);
  const [showNewCase, setShowNewCase] = useState(false);

  // Workout Proposal Generator (3D)
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalText, setProposalText] = useState('');
  const [proposalDisplayed, setProposalDisplayed] = useState('');
  const [proposalGenerating, setProposalGenerating] = useState(false);
  const [proposalDone, setProposalDone] = useState(false);
  const proposalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // VoiceForge Call Trigger (3E)
  const [showVoiceForgeModal, setShowVoiceForgeModal] = useState(false);
  const [voiceForgeScript, setVoiceForgeScript] = useState<VoiceForgeScript | null>(null);

  // New case form
  const [newCaseClient, setNewCaseClient] = useState('');
  const [newCaseFlag, setNewCaseFlag] = useState<HardshipFlag>('missed_payment');
  const [newCaseNotes, setNewCaseNotes] = useState('');
  const [newCaseDebtAtRisk, setNewCaseDebtAtRisk] = useState<number | ''>('');
  const [newCaseAffectedCards, setNewCaseAffectedCards] = useState<string[]>([]);
  const [newCaseResolution, setNewCaseResolution] = useState<ProposedResolution>('undetermined');

  const filtered = useMemo(
    () => cases.filter((c) => {
      if (filterFlag !== 'all' && c.flag !== filterFlag) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      return true;
    }),
    [cases, filterFlag, filterStatus],
  );

  const openCount = cases.filter((c) => c.status === 'open').length;
  const negotiatingCount = cases.filter((c) => c.status === 'in_negotiation').length;
  const resolvedCount = cases.filter((c) => c.status === 'resolved').length;
  const totalDebtAtRisk = cases
    .filter((c) => c.status === 'open' || c.status === 'in_negotiation')
    .reduce((s, c) => s + c.totalDebt, 0);

  function handleSelectCase(c: HardshipCase) {
    setSelectedCase(c);
    setEditingNotes(c.workoutNotes);
  }

  function handleSaveNotes() {
    if (!selectedCase) return;
    setCases((prev) =>
      prev.map((c) =>
        c.id === selectedCase.id
          ? { ...c, workoutNotes: editingNotes, lastUpdated: new Date().toISOString().split('T')[0] }
          : c,
      ),
    );
    setSelectedCase({ ...selectedCase, workoutNotes: editingNotes });
    showToast('Workout notes saved.');
  }

  function handleUpdateStatus(caseId: string, newStatus: ResolutionStatus) {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? { ...c, status: newStatus, lastUpdated: new Date().toISOString().split('T')[0] }
          : c,
      ),
    );
    if (selectedCase?.id === caseId) {
      setSelectedCase({ ...selectedCase, status: newStatus });
    }
    showToast(`Case status updated to ${STATUS_CONFIG[newStatus].label}.`);
  }

  function handleAdvanceStage(caseId: string, nextStage: StageIndex) {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? { ...c, stageIndex: nextStage, lastUpdated: new Date().toISOString().split('T')[0] }
          : c,
      ),
    );
    if (selectedCase?.id === caseId) {
      setSelectedCase({ ...selectedCase, stageIndex: nextStage });
    }
    showToast(`Case advanced to Stage ${nextStage + 1}: ${STAGE_LABELS[nextStage]}`);
  }

  function handleMarkResolved(caseId: string) {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? { ...c, status: 'resolved' as ResolutionStatus, stageIndex: 3 as StageIndex, lastUpdated: new Date().toISOString().split('T')[0] }
          : c,
      ),
    );
    if (selectedCase?.id === caseId) {
      setSelectedCase({ ...selectedCase, status: 'resolved', stageIndex: 3 });
    }
    showToast('Case marked as Resolved.');
  }

  function handleWriteOff(caseId: string) {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? { ...c, status: 'written_off' as ResolutionStatus, lastUpdated: new Date().toISOString().split('T')[0] }
          : c,
      ),
    );
    if (selectedCase?.id === caseId) {
      setSelectedCase({ ...selectedCase, status: 'written_off' });
    }
    showToast('Case written off.');
  }

  // Activity events for selected case
  const caseActivity = selectedCase
    ? MOCK_ACTIVITY.filter((e) => e.caseId === selectedCase.id).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
    : [];

  function handleCreateCase() {
    const client = AT_RISK_CLIENTS.find((c) => c.id === newCaseClient);
    if (!client) {
      showToast('Please select a client.');
      return;
    }

    const newCase: HardshipCase = {
      id: `hc_new_${Date.now()}`,
      clientId: client.id,
      clientName: client.name,
      businessName: client.businessName,
      flag: newCaseFlag,
      status: 'open',
      totalDebt: client.totalDebt,
      cardsAffected: Math.floor(Math.random() * 4) + 1,
      missedPayments: client.missedPayments,
      utilization: client.utilization,
      openedAt: new Date().toISOString().split('T')[0],
      lastUpdated: new Date().toISOString().split('T')[0],
      assignedAdvisor: 'Unassigned',
      workoutNotes: newCaseNotes,
      stageIndex: 0,
      debtAtRisk: newCaseDebtAtRisk === '' ? undefined : newCaseDebtAtRisk,
      affectedCards: newCaseAffectedCards.length > 0 ? [...newCaseAffectedCards] : undefined,
      proposedResolution: newCaseResolution,
    };

    setCases((prev) => [newCase, ...prev]);
    setSelectedCase(newCase);
    setEditingNotes(newCase.workoutNotes);
    setShowNewCase(false);
    setNewCaseClient('');
    setNewCaseFlag('missed_payment');
    setNewCaseNotes('');
    setNewCaseDebtAtRisk('');
    setNewCaseAffectedCards([]);
    setNewCaseResolution('undetermined');
    showToast(`Hardship case opened for ${client.name}.`);
  }

  // ── 3D: Workout Proposal Generator handlers ──

  const handleOpenProposalModal = useCallback(() => {
    if (!selectedCase) return;
    const fullText = generateWorkoutProposal(selectedCase);
    setProposalText(fullText);
    setProposalDisplayed('');
    setProposalDone(false);
    setProposalGenerating(true);
    setShowProposalModal(true);

    // Typing effect — reveal characters in chunks
    let idx = 0;
    const chunkSize = 4;
    if (proposalIntervalRef.current) clearInterval(proposalIntervalRef.current);
    proposalIntervalRef.current = setInterval(() => {
      idx += chunkSize;
      if (idx >= fullText.length) {
        idx = fullText.length;
        if (proposalIntervalRef.current) clearInterval(proposalIntervalRef.current);
        setProposalGenerating(false);
        setProposalDone(true);
      }
      setProposalDisplayed(fullText.slice(0, idx));
    }, 12);
  }, [selectedCase]);

  const handleRegenerateProposal = useCallback(() => {
    if (!selectedCase) return;
    handleOpenProposalModal();
  }, [selectedCase, handleOpenProposalModal]);

  function handleSaveProposal() {
    if (!selectedCase) return;
    // Update the workout notes with the proposal
    const updated = proposalDisplayed || proposalText;
    setCases((prev) =>
      prev.map((c) =>
        c.id === selectedCase.id
          ? { ...c, workoutNotes: updated, lastUpdated: new Date().toISOString().split('T')[0] }
          : c,
      ),
    );
    setSelectedCase({ ...selectedCase, workoutNotes: updated });
    setEditingNotes(updated);
    setShowProposalModal(false);
    if (proposalIntervalRef.current) clearInterval(proposalIntervalRef.current);
    showToast('Proposal saved to Document Vault');
  }

  function handleCopyProposal() {
    const text = proposalDisplayed || proposalText;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Proposal copied to clipboard.');
    }).catch(() => {
      showToast('Failed to copy — please select and copy manually.');
    });
  }

  function handleCloseProposalModal() {
    setShowProposalModal(false);
    if (proposalIntervalRef.current) clearInterval(proposalIntervalRef.current);
    setProposalGenerating(false);
  }

  // ── 3E: VoiceForge Call Trigger handlers ──

  function handleOpenVoiceForge() {
    if (!selectedCase) return;
    const script = getVoiceForgeScript(selectedCase);
    setVoiceForgeScript(script);
    setShowVoiceForgeModal(true);
  }

  function handleInitiateVoiceForge() {
    if (!selectedCase) return;
    setShowVoiceForgeModal(false);
    showToast(`VoiceForge outreach initiated for ${selectedCase.clientName}`);
  }

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (proposalIntervalRef.current) clearInterval(proposalIntervalRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      {/* Toast animation styles */}
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Hardship Case Manager</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Track at-risk clients, manage hardship flags, and resolve workout proposals.
          </p>
        </div>
        <button
          onClick={() => setShowNewCase(true)}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-semibold transition-colors"
        >
          + New Hardship Case
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Open Cases</p>
          <p className={`text-2xl font-bold ${openCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{openCount}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">In Negotiation</p>
          <p className="text-2xl font-bold text-yellow-400">{negotiatingCount}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Resolved</p>
          <p className="text-2xl font-bold text-green-400">{resolvedCount}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Debt at Risk</p>
          <p className="text-2xl font-bold text-[#C9A84C]">{formatCurrency(totalDebtAtRisk)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold uppercase">Flag:</span>
          <div className="flex gap-1">
            {(['all', 'missed_payment', 'high_utilization', 'income_change', 'business_closure'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterFlag(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  filterFlag === f
                    ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'
                }`}
              >
                {f === 'all' ? 'All' : FLAG_CONFIG[f].label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold uppercase">Status:</span>
          <div className="flex gap-1">
            {(['all', 'open', 'in_negotiation', 'resolved', 'written_off'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  filterStatus === s
                    ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content: table + detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cases table */}
        <div className="lg:col-span-2 rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-base font-semibold text-white">Active Hardship Cases</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {filterFlag !== 'all' || filterStatus !== 'all'
                ? `Showing ${filtered.length} of ${cases.length} cases`
                : `${filtered.length} case${filtered.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-semibold">Client / Business</th>
                  <th className="text-center px-4 py-3 font-semibold">Flag</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Debt</th>
                  <th className="text-center px-4 py-3 font-semibold">Stage</th>
                  <th className="text-right px-4 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map((c) => {
                  const flagCfg = FLAG_CONFIG[c.flag];
                  const statusCfg = STATUS_CONFIG[c.status];
                  const isSelected = selectedCase?.id === c.id;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleSelectCase(c)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#C9A84C]/10' : 'bg-[#0A1628] hover:bg-gray-900/50'
                      }`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-100">{c.clientName}</p>
                        <p className="text-xs text-gray-500">{c.businessName}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${flagCfg.badgeClass}`}>
                          {flagCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-white">{formatCurrency(c.totalDebt)}</span>
                        <p className="text-[10px] text-gray-500">{c.missedPayments} missed | {c.utilization}% util</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          {STAGE_LABELS.map((label, si) => (
                            <div key={label} className="flex items-center gap-0.5">
                              <div
                                className={`w-4 h-4 rounded-full text-[7px] font-bold flex items-center justify-center border ${
                                  si < c.stageIndex
                                    ? 'bg-green-600 text-white border-green-500'
                                    : si === c.stageIndex
                                    ? 'bg-[#C9A84C] text-[#0A1628] border-[#C9A84C]'
                                    : 'bg-gray-900 text-gray-600 border-gray-800'
                                }`}
                                title={`${label}${si < c.stageIndex ? ' (done)' : si === c.stageIndex ? ' (current)' : ''}`}
                              >
                                {si < c.stageIndex ? '\u2713' : si + 1}
                              </div>
                              {si < STAGE_LABELS.length - 1 && (
                                <div className={`w-2 h-px ${si < c.stageIndex ? 'bg-green-500' : 'bg-gray-800'}`} />
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-[9px] text-gray-500 mt-0.5">{STAGE_LABELS[c.stageIndex]}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400">
                        {formatDate(c.lastUpdated)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center text-gray-600 text-sm">
                No hardship cases match the current filters.
              </div>
            )}
          </div>
        </div>

        {/* Detail / Workout panel (3A) */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 max-h-[calc(100vh-12rem)] overflow-y-auto">
          {selectedCase ? (
            <div className="space-y-5">
              {/* Client header + badges */}
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">{selectedCase.clientName}</h3>
                    <p className="text-xs text-gray-400">{selectedCase.businessName}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[selectedCase.status].badgeClass}`}>
                    {STATUS_CONFIG[selectedCase.status].label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${FLAG_CONFIG[selectedCase.flag].badgeClass}`}>
                    {FLAG_CONFIG[selectedCase.flag].label}
                  </span>
                  <span className="text-[10px] text-gray-500">Advisor: {selectedCase.assignedAdvisor}</span>
                </div>
              </div>

              {/* Stage dots (3B) */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2 font-semibold">Pipeline Stage</p>
                <StageDots
                  stageIndex={selectedCase.stageIndex}
                  onAdvance={(next) => handleAdvanceStage(selectedCase.id, next)}
                />
                <p className="text-[10px] text-gray-500 mt-1.5">
                  Stage {selectedCase.stageIndex + 1} of 4: <span className="text-gray-300">{STAGE_LABELS[selectedCase.stageIndex]}</span>
                  {selectedCase.stageIndex < 3 && (
                    <span className="text-gray-600"> &mdash; click next dot to advance</span>
                  )}
                </p>
              </div>

              {/* Debt summary */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2 font-semibold">Debt Summary</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-800/60 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase">Total Debt</p>
                    <p className="text-sm font-bold text-white">{formatCurrency(selectedCase.totalDebt)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-800/60 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase">Cards Affected</p>
                    <p className="text-sm font-bold text-blue-400">{selectedCase.cardsAffected}</p>
                  </div>
                  <div className="rounded-lg bg-gray-800/60 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase">Missed Payments</p>
                    <p className="text-sm font-bold text-red-400">{selectedCase.missedPayments}</p>
                  </div>
                  <div className="rounded-lg bg-gray-800/60 px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase">Utilization</p>
                    <p className="text-sm font-bold text-orange-400">{selectedCase.utilization}%</p>
                  </div>
                </div>
              </div>

              {/* Activity timeline */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2 font-semibold">Activity Timeline</p>
                {caseActivity.length > 0 ? (
                  <div className="space-y-0 border-l-2 border-gray-800 ml-2">
                    {caseActivity.map((ev) => {
                      const iconCfg = ACTIVITY_ICON[ev.type];
                      return (
                        <div key={ev.id} className="relative pl-5 pb-3">
                          <span className={`absolute -left-[7px] top-0.5 text-xs ${iconCfg.color}`}>{iconCfg.icon}</span>
                          <p className="text-xs text-gray-200 leading-snug">{ev.label}</p>
                          <p className="text-[10px] text-gray-600 mt-0.5">{formatDate(ev.timestamp.split('T')[0])}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 italic">No activity recorded yet.</p>
                )}
              </div>

              {/* Action buttons */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2 font-semibold">Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => showToast(`Contacting ${selectedCase.clientName}...`)}
                    className="px-3 py-2 rounded-lg bg-blue-900/40 border border-blue-800 text-blue-300 text-xs font-semibold hover:bg-blue-900/60 transition-colors"
                  >
                    Contact Client
                  </button>
                  <button
                    onClick={() => {
                      if (selectedCase.stageIndex < 3) {
                        handleAdvanceStage(selectedCase.id, (selectedCase.stageIndex + 1) as StageIndex);
                      } else {
                        showToast('Case is already at the final stage.');
                      }
                    }}
                    disabled={selectedCase.stageIndex >= 3}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      selectedCase.stageIndex < 3
                        ? 'bg-[#C9A84C]/20 border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#C9A84C]/30'
                        : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    Advance Stage
                  </button>
                  <button
                    onClick={() => showToast(`Generating proposal for ${selectedCase.clientName}...`)}
                    className="px-3 py-2 rounded-lg bg-purple-900/40 border border-purple-800 text-purple-300 text-xs font-semibold hover:bg-purple-900/60 transition-colors"
                  >
                    Generate Proposal
                  </button>
                  <button
                    onClick={() => handleMarkResolved(selectedCase.id)}
                    disabled={selectedCase.status === 'resolved'}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      selectedCase.status !== 'resolved'
                        ? 'bg-green-900/40 border border-green-800 text-green-300 hover:bg-green-900/60'
                        : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    Mark Resolved
                  </button>
                  <button
                    onClick={() => handleWriteOff(selectedCase.id)}
                    disabled={selectedCase.status === 'written_off'}
                    className={`col-span-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      selectedCase.status !== 'written_off'
                        ? 'bg-red-900/30 border border-red-900 text-red-400 hover:bg-red-900/50'
                        : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    Write Off
                  </button>
                </div>
              </div>

              {/* Workout notes */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2 font-semibold">Workout Notes</p>
                <textarea
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] resize-none"
                  placeholder="Enter workout proposal details, negotiation notes, or resolution plan..."
                />
                <button
                  onClick={handleSaveNotes}
                  className="mt-2 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-xs font-semibold transition-colors"
                >
                  Save Notes
                </button>
              </div>

              {/* AI Actions: Workout Proposal + VoiceForge */}
              <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
                <button
                  onClick={handleOpenProposalModal}
                  className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#C9A84C] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-[#0A1628] text-xs font-bold transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2"
                >
                  <span>Generate Workout Proposal</span>
                  <span className="text-sm">&#10022;</span>
                </button>
                <button
                  onClick={handleOpenVoiceForge}
                  className="w-full px-4 py-2.5 rounded-lg bg-[#0A1628] border border-[#C9A84C]/40 hover:border-[#C9A84C] text-[#C9A84C] text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <span>Contact Client (VoiceForge)</span>
                  <span>&rarr;</span>
                </button>
              </div>

              <div className="text-xs text-gray-600 pt-2 border-t border-gray-800">
                Opened {formatDate(selectedCase.openedAt)} | Last updated {formatDate(selectedCase.lastUpdated)}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3">
                <span className="text-xl text-gray-600">&#128203;</span>
              </div>
              <p className="text-sm text-gray-500 font-medium">Select a case to view details</p>
              <p className="text-xs text-gray-600 mt-1">Click a row in the table to load case information.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Case Modal */}
      {showNewCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">New Hardship Case</h2>
              <button onClick={() => setShowNewCase(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
                &#215;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                  At-Risk Client
                </label>
                <select
                  value={newCaseClient}
                  onChange={(e) => setNewCaseClient(e.target.value)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
                >
                  <option value="">Select a client...</option>
                  {AT_RISK_CLIENTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.businessName} (FICO {c.fico}, {c.utilization}% util)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                  Hardship Flag Type
                </label>
                <select
                  value={newCaseFlag}
                  onChange={(e) => setNewCaseFlag(e.target.value as HardshipFlag)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
                >
                  {(Object.keys(FLAG_CONFIG) as HardshipFlag[]).map((f) => (
                    <option key={f} value={f}>{FLAG_CONFIG[f].label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                  Total Debt at Risk ($)
                </label>
                <input
                  type="number"
                  min={0}
                  value={newCaseDebtAtRisk}
                  onChange={(e) => setNewCaseDebtAtRisk(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 50000"
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                  Affected Cards
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MOCK_CARDS.map((card) => (
                    <label
                      key={card.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 cursor-pointer hover:border-gray-600 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={newCaseAffectedCards.includes(card.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewCaseAffectedCards((prev) => [...prev, card.id]);
                          } else {
                            setNewCaseAffectedCards((prev) => prev.filter((id) => id !== card.id));
                          }
                        }}
                        className="accent-[#C9A84C] w-3.5 h-3.5"
                      />
                      <span className="text-xs text-gray-300">{card.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                  Initial Proposed Resolution
                </label>
                <select
                  value={newCaseResolution}
                  onChange={(e) => setNewCaseResolution(e.target.value as ProposedResolution)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
                >
                  {RESOLUTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                  Initial Notes
                </label>
                <textarea
                  value={newCaseNotes}
                  onChange={(e) => setNewCaseNotes(e.target.value)}
                  rows={4}
                  placeholder="Describe the hardship situation..."
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewCase(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCase}
                className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-semibold transition-colors"
              >
                Open Case
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D: Workout Proposal Generator Modal */}
      {showProposalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C9A84C] to-amber-500 flex items-center justify-center text-[#0A1628] text-sm font-bold">
                  &#10022;
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">AI Workout Proposal</h2>
                  <p className="text-xs text-gray-400">
                    {proposalGenerating ? 'Generating proposal...' : proposalDone ? 'Proposal ready — review and edit below' : 'Preparing...'}
                  </p>
                </div>
              </div>
              <button onClick={handleCloseProposalModal} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
                &#215;
              </button>
            </div>

            {/* Generating indicator */}
            {proposalGenerating && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" style={{ animationDelay: '0.4s' }} />
                </div>
                <span className="text-xs text-[#C9A84C] font-semibold">AI analyzing case data...</span>
              </div>
            )}

            {/* Proposal content — read-only during generation, editable after */}
            <div className="flex-1 overflow-hidden mb-4">
              {proposalDone ? (
                <textarea
                  value={proposalDisplayed}
                  onChange={(e) => setProposalDisplayed(e.target.value)}
                  className="w-full h-full min-h-[350px] rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-sm text-gray-100 font-mono leading-relaxed placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] resize-none"
                />
              ) : (
                <div className="w-full h-full min-h-[350px] rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-sm text-gray-100 font-mono leading-relaxed overflow-y-auto whitespace-pre-wrap">
                  {proposalDisplayed}
                  {proposalGenerating && <span className="inline-block w-2 h-4 bg-[#C9A84C] animate-pulse ml-0.5 align-text-bottom" />}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCloseProposalModal}
                className="px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateProposal}
                disabled={proposalGenerating}
                className="px-4 py-2 rounded-lg border border-[#C9A84C]/40 text-sm font-semibold text-[#C9A84C] hover:border-[#C9A84C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Regenerate
              </button>
              <button
                onClick={handleCopyProposal}
                disabled={proposalGenerating}
                className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-semibold text-gray-300 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Copy
              </button>
              <button
                onClick={handleSaveProposal}
                disabled={proposalGenerating}
                className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-[#0A1628] text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save to Document Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3E: VoiceForge Call Trigger Modal */}
      {showVoiceForgeModal && voiceForgeScript && selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0A1628] border border-[#C9A84C]/40 flex items-center justify-center text-[#C9A84C] text-sm">
                  &#9742;
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">VoiceForge Call Script</h2>
                  <p className="text-xs text-gray-400">Stage {voiceForgeScript.stage}: {voiceForgeScript.title}</p>
                </div>
              </div>
              <button onClick={() => setShowVoiceForgeModal(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
                &#215;
              </button>
            </div>

            {/* Stage indicator */}
            <div className="flex items-center gap-2 mb-5">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                      s === voiceForgeScript.stage
                        ? 'bg-[#C9A84C] text-[#0A1628] border-[#C9A84C]'
                        : s < voiceForgeScript.stage
                        ? 'bg-gray-700 text-gray-300 border-gray-600'
                        : 'bg-gray-900 text-gray-600 border-gray-800'
                    }`}
                  >
                    {s}
                  </div>
                  {s < 4 && (
                    <div className={`w-6 h-0.5 ${s < voiceForgeScript.stage ? 'bg-[#C9A84C]' : 'bg-gray-800'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Client info */}
            <div className="rounded-lg bg-[#0A1628] border border-gray-800 px-4 py-3 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{selectedCase.clientName}</p>
                  <p className="text-xs text-gray-400">{selectedCase.businessName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Debt: <span className="text-white font-bold">{formatCurrency(selectedCase.totalDebt)}</span></p>
                  <p className="text-xs text-gray-500">Status: <span className="text-[#C9A84C] font-bold">{STATUS_CONFIG[selectedCase.status].label}</span></p>
                </div>
              </div>
            </div>

            {/* Objective */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Objective</p>
              <p className="text-sm text-gray-200">{voiceForgeScript.objective}</p>
            </div>

            {/* Key Points */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Key Points</p>
              <ul className="space-y-1.5">
                {voiceForgeScript.keyPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-[#C9A84C] mt-0.5 text-xs">&#9679;</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            {/* Opening Script */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Suggested Opening</p>
              <div className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-sm text-gray-200 italic leading-relaxed">
                {voiceForgeScript.openingScript}
              </div>
            </div>

            {/* Tone Guidance */}
            <div className="mb-5">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Tone Guidance</p>
              <p className="text-sm text-amber-300/80">{voiceForgeScript.toneGuidance}</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowVoiceForgeModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiateVoiceForge}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-[#0A1628] text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                <span>Initiate Call</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
