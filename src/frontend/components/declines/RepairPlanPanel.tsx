'use client';

// ============================================================
// RepairPlanPanel — auto-generated repair plan based on decline
// reason category. Compact dark-theme layout for slide-overs
// or expandable table rows.
// ============================================================

// ── Types ────────────────────────────────────────────────────

export interface RepairPlanPanelProps {
  reasonCategory: string;
  clientId?: string;
}

interface RepairStep {
  step: number;
  action: string;
}

interface RepairPlan {
  title: string;
  estimatedImprovement: string;
  estimatedTime: string;
  steps: RepairStep[];
  actionLabel: string;
  actionHref: (clientId?: string) => string;
}

// ── Repair Plans ─────────────────────────────────────────────

const REPAIR_PLANS: Record<string, RepairPlan> = {
  too_many_inquiries: {
    title: 'REPAIR PLAN \u2014 TOO MANY INQUIRIES',
    estimatedImprovement: '+15 to +25 points',
    estimatedTime: '90 days',
    steps: [
      { step: 1, action: 'Pause all new applications for 90 days to let inquiry impact decay' },
      { step: 2, action: 'Verify no unauthorized inquiries appear on credit report' },
      { step: 3, action: 'Dispute any invalid or unrecognized hard inquiries with the bureaus' },
    ],
    actionLabel: 'View Credit Report',
    actionHref: (clientId) => clientId ? `/clients/${clientId}?tab=credit` : '/clients',
  },
  high_utilization: {
    title: 'REPAIR PLAN \u2014 HIGH UTILIZATION',
    estimatedImprovement: '+20 to +40 points',
    estimatedTime: '30 days',
    steps: [
      { step: 1, action: 'Pay down revolving balances to 10% or less of each credit limit' },
      { step: 2, action: 'Request credit limit increases on existing accounts' },
      { step: 3, action: 'Avoid adding new charges until utilization is reported below threshold' },
    ],
    actionLabel: 'View Client Credit Tab',
    actionHref: (clientId) => clientId ? `/clients/${clientId}?tab=credit` : '/clients',
  },
  insufficient_history: {
    title: 'REPAIR PLAN \u2014 INSUFFICIENT HISTORY',
    estimatedImprovement: '+15 to +30 points',
    estimatedTime: '60 days',
    steps: [
      { step: 1, action: 'Add 2\u20133 Net-30 vendor tradelines that report to business credit bureaus' },
      { step: 2, action: 'Register a DUNS number and ensure business profile is complete' },
      { step: 3, action: 'Open a credit builder account to establish payment history' },
    ],
    actionLabel: 'Start Credit Builder',
    actionHref: (clientId) => clientId ? `/credit-builder?client_id=${clientId}` : '/credit-builder',
  },
  income_verification: {
    title: 'REPAIR PLAN \u2014 INCOME VERIFICATION',
    estimatedImprovement: 'Removes decline blocker',
    estimatedTime: '14 days',
    steps: [
      { step: 1, action: 'Prepare 3 months of business bank statements showing consistent deposits' },
      { step: 2, action: 'Gather most recent personal and business tax return (Schedule C or 1120S)' },
      { step: 3, action: 'Draft a brief business description including revenue sources and projections' },
    ],
    actionLabel: 'Request Documents',
    actionHref: (clientId) => clientId ? `/documents?client_id=${clientId}&action=request` : '/documents',
  },
  velocity: {
    title: 'REPAIR PLAN \u2014 APPLICATION VELOCITY',
    estimatedImprovement: '+10 to +20 points',
    estimatedTime: '30 days',
    steps: [
      { step: 1, action: 'Wait for the issuer\u2019s application window to reset (typically 30\u201390 days)' },
      { step: 2, action: 'Do not re-apply with the same issuer during the cooldown period' },
      { step: 3, action: 'Use the Funding Optimizer to identify the best timing and card match' },
    ],
    actionLabel: 'Run Optimizer',
    actionHref: (clientId) => clientId ? `/optimizer?client_id=${clientId}` : '/optimizer',
  },
  derogatory_marks: {
    title: 'REPAIR PLAN \u2014 DEROGATORY MARKS',
    estimatedImprovement: '+25 to +50 points',
    estimatedTime: '45 days',
    steps: [
      { step: 1, action: 'Pull full credit report and identify all derogatory items with dates' },
      { step: 2, action: 'Dispute any inaccurate or unverifiable derogatory entries with the bureaus' },
      { step: 3, action: 'Negotiate pay-for-delete agreements on legitimate collection accounts' },
      { step: 4, action: 'Document all disputes and settlement agreements for compliance records' },
    ],
    actionLabel: 'Generate Dispute Letter',
    actionHref: (clientId) => clientId ? `/clients/${clientId}?tab=credit&action=dispute` : '/clients',
  },
  internal_policy: {
    title: 'REPAIR PLAN \u2014 INTERNAL POLICY',
    estimatedImprovement: 'May overturn decline',
    estimatedTime: '7 days',
    steps: [
      { step: 1, action: 'Call the issuer\u2019s reconsideration line and reference the application number' },
      { step: 2, action: 'Request a written explanation of the specific policy that triggered the decline' },
      { step: 3, action: 'If recon fails, apply for a different product from the same issuer' },
    ],
    actionLabel: 'Call Recon Line',
    actionHref: (clientId) => clientId ? `/clients/${clientId}?tab=applications` : '/clients',
  },
};

// ── Component ────────────────────────────────────────────────

export function RepairPlanPanel({ reasonCategory, clientId }: RepairPlanPanelProps) {
  const plan = REPAIR_PLANS[reasonCategory];

  if (!plan) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <p className="text-xs text-gray-500 italic">
          No repair plan available for reason: {reasonCategory}
        </p>
      </div>
    );
  }

  const href = plan.actionHref(clientId);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2.5">
        <h3 className="text-xs font-bold tracking-wider text-gray-200">
          {plan.title}
        </h3>
      </div>

      {/* Estimates row */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-gray-800">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Est. Improvement
          </span>
          <span className="text-xs font-bold text-green-400">
            {plan.estimatedImprovement}
          </span>
        </div>
        <div className="w-px h-3.5 bg-gray-700" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Timeline
          </span>
          <span className="text-xs font-bold text-blue-400">
            {plan.estimatedTime}
          </span>
        </div>
      </div>

      {/* Steps */}
      <div className="px-4 py-3 space-y-2">
        {plan.steps.map(({ step, action }) => (
          <div key={step} className="flex gap-2.5 items-start">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-800 border border-gray-600 text-[10px] font-bold text-gray-300 flex items-center justify-center mt-px">
              {step}
            </span>
            <p className="text-xs text-gray-300 leading-relaxed">
              {action}
            </p>
          </div>
        ))}
      </div>

      {/* Action button */}
      <div className="px-4 pb-3 pt-1">
        <a
          href={href}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-xs font-semibold transition-colors"
        >
          {plan.actionLabel}
          <span className="text-[10px]">&rarr;</span>
        </a>
      </div>
    </div>
  );
}
