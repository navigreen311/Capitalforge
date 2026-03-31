'use client';

// ============================================================
// WorkflowRuleCard — rule name, conditions as readable chips,
// actions as badges, priority number, active toggle.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConditionOperator = 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'not_in';

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value: string;
}

export interface RuleAction {
  type: string;
  label: string;
  variant?: 'default' | 'warn' | 'block' | 'approve' | 'notify';
}

export interface WorkflowRule {
  id: string;
  name: string;
  description?: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  active: boolean;
  updatedAt?: string;
}

export interface WorkflowRuleCardProps {
  rule: WorkflowRule;
  onToggleActive?: (id: string, active: boolean) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals:     '=',
  not_equals: '≠',
  gt:         '>',
  gte:        '≥',
  lt:         '<',
  lte:        '≤',
  contains:   'contains',
  in:         'in',
  not_in:     'not in',
};

const ACTION_VARIANT_CONFIG: Record<NonNullable<RuleAction['variant']>, { cls: string }> = {
  default:  { cls: 'bg-gray-800 text-gray-300 border-gray-600' },
  warn:     { cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  block:    { cls: 'bg-red-900 text-red-300 border-red-700' },
  approve:  { cls: 'bg-green-900 text-green-300 border-green-700' },
  notify:   { cls: 'bg-blue-900 text-blue-300 border-blue-700' },
};

function formatDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkflowRuleCard({
  rule,
  onToggleActive,
  className = '',
}: WorkflowRuleCardProps) {
  const [active, setActive] = useState(rule.active);

  function handleToggle() {
    const next = !active;
    setActive(next);
    onToggleActive?.(rule.id, next);
  }

  return (
    <div
      className={`rounded-xl border bg-gray-900 p-5 transition-colors ${
        active ? 'border-gray-700' : 'border-gray-800 opacity-60'
      } ${className}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Priority badge */}
          <div
            className="shrink-0 h-8 w-8 rounded-lg bg-yellow-900 border border-yellow-700 flex items-center justify-center"
            title={`Priority ${rule.priority}`}
          >
            <span className="text-xs font-black text-yellow-300">{rule.priority}</span>
          </div>

          {/* Name & description */}
          <div className="min-w-0">
            <p className="font-semibold text-gray-100 text-sm leading-snug truncate">
              {rule.name}
            </p>
            {rule.description && (
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{rule.description}</p>
            )}
          </div>
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold ${active ? 'text-green-400' : 'text-gray-500'}`}>
            {active ? 'Active' : 'Inactive'}
          </span>
          <button
            role="switch"
            aria-checked={active}
            aria-label={`Toggle rule ${rule.name}`}
            onClick={handleToggle}
            className={`relative inline-flex h-5 w-9 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
              active
                ? 'bg-green-600 border-green-500'
                : 'bg-gray-700 border-gray-600'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm mt-[3px] transition-transform ${
                active ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Conditions — readable chips */}
      {rule.conditions.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1.5">
            Conditions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rule.conditions.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded-full px-2.5 py-1"
              >
                <span className="text-gray-400 font-medium">{c.field}</span>
                <span className="text-yellow-500 font-bold">{OPERATOR_LABELS[c.operator]}</span>
                <span className="text-gray-200 font-semibold">{c.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions — badges */}
      {rule.actions.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1.5">
            Actions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rule.actions.map((a, i) => {
              const variant = a.variant ?? 'default';
              const { cls } = ACTION_VARIANT_CONFIG[variant];
              return (
                <span
                  key={i}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}
                >
                  {a.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      {rule.updatedAt && (
        <p className="text-xs text-gray-600 border-t border-gray-800 pt-2 mt-1">
          Updated {formatDate(rule.updatedAt)}
        </p>
      )}
    </div>
  );
}
