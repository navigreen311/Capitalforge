'use client';

// ============================================================
// RedFlagChecklist — interactive 10-item due-diligence checklist
// States: pass | fail | warning | pending
// Features: expandable notes per item, overall risk summary
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChecklistItemState = 'pass' | 'fail' | 'warning' | 'pending';

export interface RedFlagItem {
  id: string;
  category: string;
  label: string;
  description: string;
  state: ChecklistItemState;
  note?: string;
  flaggedBy?: string;
  flaggedAt?: string;
}

interface RedFlagChecklistProps {
  items?: RedFlagItem[];
  readOnly?: boolean;
  onItemChange?: (id: string, state: ChecklistItemState, note: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Default 10-item checklist
// ---------------------------------------------------------------------------

const DEFAULT_ITEMS: RedFlagItem[] = [
  {
    id: 'rf_01',
    category: 'Identity',
    label: 'Beneficial Ownership Verified',
    description: 'All owners ≥ 25% stake have been identified and identity documents collected.',
    state: 'pass',
    flaggedBy: 'System',
    flaggedAt: '2026-03-29T10:00:00Z',
  },
  {
    id: 'rf_02',
    category: 'Credit',
    label: 'No Active Bankruptcy or Insolvency',
    description: 'Principal and entity show no active Chapter 7/11/13 filings or insolvency proceedings.',
    state: 'pass',
    flaggedBy: 'System',
    flaggedAt: '2026-03-29T10:01:00Z',
  },
  {
    id: 'rf_03',
    category: 'Credit',
    label: 'Personal FICO ≥ 680',
    description: 'Primary guarantor personal credit score meets minimum threshold.',
    state: 'warning',
    note: 'FICO 672 — marginally below threshold. Compensating factors documented.',
    flaggedBy: 'Ana Reyes',
    flaggedAt: '2026-03-29T11:00:00Z',
  },
  {
    id: 'rf_04',
    category: 'Business',
    label: 'Business Operating ≥ 2 Years',
    description: 'Entity formation date and proof of operations confirm minimum seasoning.',
    state: 'pass',
    flaggedBy: 'System',
    flaggedAt: '2026-03-29T10:02:00Z',
  },
  {
    id: 'rf_05',
    category: 'Business',
    label: 'Revenue Substantiation on File',
    description: '3 months of bank statements or verified financial statements confirming stated revenue.',
    state: 'pass',
    flaggedBy: 'Marcus Chen',
    flaggedAt: '2026-03-30T09:00:00Z',
  },
  {
    id: 'rf_06',
    category: 'Compliance',
    label: 'No OFAC / Sanctions Match',
    description: 'Entity and all beneficial owners cleared against OFAC SDN list and EU/UK sanctions.',
    state: 'pass',
    flaggedBy: 'System',
    flaggedAt: '2026-03-29T10:03:00Z',
  },
  {
    id: 'rf_07',
    category: 'Compliance',
    label: 'No Active Regulatory Actions',
    description: 'No open CFPB, FTC, or state AG enforcement actions against entity or principals.',
    state: 'fail',
    note: 'Principal listed in 2025 NY AG inquiry. Legal review escalated.',
    flaggedBy: 'Compliance Engine',
    flaggedAt: '2026-03-30T14:00:00Z',
  },
  {
    id: 'rf_08',
    category: 'Structure',
    label: 'Acceptable Business Entity Type',
    description: 'Entity is LLC, S-Corp, C-Corp, or equivalent — no sole proprietorships accepted.',
    state: 'pass',
    flaggedBy: 'System',
    flaggedAt: '2026-03-29T10:04:00Z',
  },
  {
    id: 'rf_09',
    category: 'Debt Service',
    label: 'Debt-to-Income Below 50%',
    description: 'Combined personal and business obligations do not exceed 50% of verified monthly income.',
    state: 'warning',
    note: 'DTI estimated at 47%. Close to ceiling — flagged for committee review.',
    flaggedBy: 'Risk Engine',
    flaggedAt: '2026-03-30T15:00:00Z',
  },
  {
    id: 'rf_10',
    category: 'Industry',
    label: 'Industry Not on Restricted List',
    description: 'Business SIC/NAICS code does not fall within prohibited or high-restriction categories.',
    state: 'pending',
    flaggedBy: undefined,
    flaggedAt: undefined,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_CONFIG: Record<ChecklistItemState, {
  label: string;
  icon: string;
  rowClass: string;
  badgeClass: string;
  iconClass: string;
}> = {
  pass: {
    label: 'Pass',
    icon: '✓',
    rowClass: 'border-green-800 bg-green-950/40',
    badgeClass: 'bg-green-900 text-green-300 border-green-700',
    iconClass: 'text-green-400',
  },
  fail: {
    label: 'Fail',
    icon: '✗',
    rowClass: 'border-red-800 bg-red-950/40',
    badgeClass: 'bg-red-900 text-red-300 border-red-700',
    iconClass: 'text-red-400',
  },
  warning: {
    label: 'Warning',
    icon: '!',
    rowClass: 'border-yellow-800 bg-yellow-950/30',
    badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    iconClass: 'text-yellow-400',
  },
  pending: {
    label: 'Pending',
    icon: '?',
    rowClass: 'border-gray-700 bg-gray-900',
    badgeClass: 'bg-gray-800 text-gray-400 border-gray-600',
    iconClass: 'text-gray-400',
  },
};

const STATE_CYCLE: ChecklistItemState[] = ['pending', 'pass', 'warning', 'fail'];

function formatTs(iso?: string) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function computeRiskSummary(items: RedFlagItem[]) {
  const fails = items.filter((i) => i.state === 'fail').length;
  const warnings = items.filter((i) => i.state === 'warning').length;
  const passes = items.filter((i) => i.state === 'pass').length;
  const pending = items.filter((i) => i.state === 'pending').length;

  let overallRisk: 'clear' | 'caution' | 'review' | 'blocked' = 'clear';
  if (fails >= 1) overallRisk = 'blocked';
  else if (warnings >= 2) overallRisk = 'review';
  else if (warnings === 1 || pending > 0) overallRisk = 'caution';

  return { fails, warnings, passes, pending, overallRisk };
}

const RISK_SUMMARY_CONFIG = {
  clear:   { label: 'All Clear', barClass: 'bg-green-500', textClass: 'text-green-400', borderClass: 'border-green-800' },
  caution: { label: 'Caution',   barClass: 'bg-yellow-500', textClass: 'text-yellow-400', borderClass: 'border-yellow-800' },
  review:  { label: 'Needs Review', barClass: 'bg-orange-500', textClass: 'text-orange-400', borderClass: 'border-orange-800' },
  blocked: { label: 'Blocked — Fail(s) Present', barClass: 'bg-red-600', textClass: 'text-red-400', borderClass: 'border-red-800' },
};

// ---------------------------------------------------------------------------
// Single checklist item
// ---------------------------------------------------------------------------

function ChecklistRow({
  item,
  index,
  readOnly,
  onStateChange,
}: {
  item: RedFlagItem;
  index: number;
  readOnly: boolean;
  onStateChange: (id: string, state: ChecklistItemState, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(item.note ?? '');
  const cfg = STATE_CONFIG[item.state];

  const cycleState = () => {
    if (readOnly) return;
    const idx = STATE_CYCLE.indexOf(item.state);
    const next = STATE_CYCLE[(idx + 1) % STATE_CYCLE.length];
    onStateChange(item.id, next, note);
  };

  const saveNote = () => onStateChange(item.id, item.state, note);

  return (
    <div className={`rounded-xl border transition-colors ${cfg.rowClass}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        {/* Index */}
        <span className="text-xs text-gray-600 font-mono w-5 flex-shrink-0 text-right">{index + 1}</span>

        {/* State toggle button */}
        <button
          onClick={cycleState}
          disabled={readOnly}
          title={readOnly ? cfg.label : `Click to cycle state (current: ${cfg.label})`}
          className={`h-8 w-8 rounded-lg border font-bold text-sm flex-shrink-0 transition-all ${cfg.badgeClass} ${readOnly ? 'cursor-default' : 'hover:opacity-80 cursor-pointer'}`}
        >
          {cfg.icon}
        </button>

        {/* Label + category */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-100">{item.label}</p>
            <span className="text-[10px] bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded">
              {item.category}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{item.description}</p>
        </div>

        {/* State badge */}
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.badgeClass}`}>
          {cfg.label}
        </span>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-600 hover:text-gray-400 flex-shrink-0 transition-colors text-sm w-5"
          title={expanded ? 'Collapse' : 'Expand notes'}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded notes panel */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-3">
          {/* Flagged by / at */}
          {(item.flaggedBy || item.flaggedAt) && (
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {item.flaggedBy && <span>Reviewed by <span className="text-gray-300 font-medium">{item.flaggedBy}</span></span>}
              {item.flaggedAt && <span>{formatTs(item.flaggedAt)}</span>}
            </div>
          )}

          {/* Note editor */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold block mb-1.5">
              Notes / Rationale
            </label>
            {readOnly ? (
              <p className="text-xs text-gray-300 bg-gray-800 rounded-lg p-3 min-h-[48px]">
                {note || <span className="text-gray-600 italic">No notes recorded.</span>}
              </p>
            ) : (
              <div className="flex gap-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Add rationale, exception notes, or escalation details…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                />
                <button
                  onClick={saveNote}
                  className="px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-xs font-semibold self-start transition-colors"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk summary banner
// ---------------------------------------------------------------------------

function RiskSummaryBanner({ items }: { items: RedFlagItem[] }) {
  const { fails, warnings, passes, pending, overallRisk } = computeRiskSummary(items);
  const cfg = RISK_SUMMARY_CONFIG[overallRisk];
  const total = items.length;

  return (
    <div className={`rounded-xl border p-4 ${cfg.borderClass} bg-gray-900`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Overall Risk Assessment
        </p>
        <span className={`text-sm font-bold ${cfg.textClass}`}>{cfg.label}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${cfg.barClass}`}
          style={{ width: `${(passes / total) * 100}%` }}
        />
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="bg-green-900 text-green-300 border border-green-800 px-2 py-0.5 rounded-full font-semibold">
          {passes} Pass
        </span>
        <span className="bg-yellow-900 text-yellow-300 border border-yellow-800 px-2 py-0.5 rounded-full font-semibold">
          {warnings} Warning
        </span>
        <span className="bg-red-900 text-red-300 border border-red-800 px-2 py-0.5 rounded-full font-semibold">
          {fails} Fail
        </span>
        <span className="bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full font-semibold">
          {pending} Pending
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RedFlagChecklist({
  items: externalItems,
  readOnly = false,
  onItemChange,
  className = '',
}: RedFlagChecklistProps) {
  const [items, setItems] = useState<RedFlagItem[]>(externalItems ?? DEFAULT_ITEMS);

  const handleItemChange = (id: string, state: ChecklistItemState, note: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, state, note, flaggedAt: new Date().toISOString() }
          : it,
      ),
    );
    onItemChange?.(id, state, note);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Summary banner */}
      <RiskSummaryBanner items={items} />

      {/* Checklist items */}
      {items.map((item, i) => (
        <ChecklistRow
          key={item.id}
          item={item}
          index={i}
          readOnly={readOnly}
          onStateChange={handleItemChange}
        />
      ))}
    </div>
  );
}
