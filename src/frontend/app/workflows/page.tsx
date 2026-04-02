'use client';

// ============================================================
// /workflows — Workflow & Policy Builder
// Workflow rules table with conditions/actions preview,
// active/inactive toggle. Policy rules with priority ordering.
// Rules versioning panel: stage badges, deploy/rollback
// buttons, diff viewer placeholder. Execution log tab.
// Rule builder, edit drawers, test simulation, conflict detection.
// ============================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import WorkflowRuleCard, {
  type WorkflowRule,
  type RuleCondition,
  type RuleAction,
} from '../../components/modules/workflow-rule-card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PolicyRulePriority = 'P1' | 'P2' | 'P3';
type RuleStage = 'test' | 'staging' | 'production';
type RuleCategory = 'Compliance' | 'Underwriting' | 'Risk' | 'Product' | 'Operations';
type ConditionOperator = 'equals' | 'greater_than' | 'less_than' | 'contains';
type ActionType = 'Block Application' | 'Auto-Approve' | 'Notify Compliance' | 'Escalate to Committee' | 'Flag for Review';
type LogicOperator = 'AND' | 'OR';

interface PolicyRule {
  id: string;
  name: string;
  description: string;
  priority: PolicyRulePriority;
  active: boolean;
  category: string;
  lastModified: string;
  threshold?: number;
  thresholdLabel?: string;
}

interface RuleVersion {
  id: string;
  version: string;
  ruleset: string;
  stage: RuleStage;
  author: string;
  createdAt: string;
  changelog: string;
  linesAdded: number;
  linesRemoved: number;
  isCurrent: boolean;
}

interface BuilderCondition {
  field: string;
  operator: ConditionOperator;
  value: string;
}

interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  ruleName: string;
  ruleType: 'Workflow' | 'Policy';
  trigger: string;
  client: string;
  action: string;
  outcome: 'Fired' | 'Blocked' | 'Approved' | 'Flagged' | 'Escalated';
  advisor: string;
  conditionDetails: { field: string; expected: string; actual: string; passed: boolean }[];
}

interface ConflictInfo {
  ruleId: string;
  conflictsWith: string[];
  reason: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_WORKFLOW_RULES: WorkflowRule[] = [
  {
    id: 'wr_001',
    name: 'High-Risk Merchant Block',
    description: 'Blocks funding for merchants in high-risk MCC codes.',
    priority: 1,
    active: true,
    updatedAt: '2026-03-28T10:00:00Z',
    conditions: [
      { field: 'merchant.mcc', operator: 'in', value: '5933, 7995, 6211' },
      { field: 'funding.amount', operator: 'gte', value: '$50,000' },
    ],
    actions: [
      { type: 'block', label: 'Block Application', variant: 'block' },
      { type: 'notify', label: 'Notify Compliance', variant: 'notify' },
    ],
  },
  {
    id: 'wr_002',
    name: 'Auto-Approve Returning Clients',
    description: 'Fast-track approval for clients with 3+ successful cycles.',
    priority: 2,
    active: true,
    updatedAt: '2026-03-25T14:00:00Z',
    conditions: [
      { field: 'client.cycles_completed', operator: 'gte', value: '3' },
      { field: 'client.default_history', operator: 'equals', value: 'none' },
      { field: 'funding.amount', operator: 'lte', value: '$150,000' },
    ],
    actions: [
      { type: 'approve', label: 'Auto-Approve', variant: 'approve' },
      { type: 'notify', label: 'Notify Account Manager', variant: 'notify' },
    ],
  },
  {
    id: 'wr_003',
    name: 'State Usury Cap Enforcement',
    description: 'Caps APR according to applicant state law.',
    priority: 3,
    active: true,
    updatedAt: '2026-03-22T09:00:00Z',
    conditions: [
      { field: 'applicant.state', operator: 'in', value: 'CA, NY, TX, FL' },
      { field: 'product.effective_apr', operator: 'gt', value: 'state_cap' },
    ],
    actions: [
      { type: 'warn', label: 'Flag for Review', variant: 'warn' },
      { type: 'block', label: 'Prevent Submission', variant: 'block' },
    ],
  },
  {
    id: 'wr_004',
    name: 'Large Transaction AML Escalation',
    description: 'Triggers enhanced due diligence on large single-draw requests.',
    priority: 4,
    active: false,
    updatedAt: '2026-03-18T16:00:00Z',
    conditions: [
      { field: 'transaction.amount', operator: 'gte', value: '$500,000' },
      { field: 'kyb.score', operator: 'lt', value: '70' },
    ],
    actions: [
      { type: 'notify', label: 'Escalate to AML Team', variant: 'notify' },
      { type: 'warn', label: 'Hold for Manual Review', variant: 'warn' },
    ],
  },
  {
    id: 'wr_005',
    name: 'New Business Funding Cap',
    description: 'Limits funding for businesses under 12 months old.',
    priority: 5,
    active: true,
    updatedAt: '2026-03-14T11:00:00Z',
    conditions: [
      { field: 'business.age_months', operator: 'lt', value: '12' },
      { field: 'funding.amount', operator: 'gt', value: '$25,000' },
    ],
    actions: [
      { type: 'warn', label: 'Cap at $25K', variant: 'warn' },
      { type: 'notify', label: 'Notify Underwriter', variant: 'notify' },
    ],
  },
];

const PLACEHOLDER_POLICY_RULES: PolicyRule[] = [
  { id: 'pr_001', name: 'Minimum FICO Score Gate',          description: 'No personal guarantor below 580 FICO for unsecured products.',              priority: 'P1', active: true,  category: 'Underwriting', lastModified: '2026-03-27', threshold: 580, thresholdLabel: 'FICO' },
  { id: 'pr_002', name: 'Debt Service Coverage Ratio Floor',description: 'Business DSCR must exceed 1.15x for revolving credit facilities.',          priority: 'P1', active: true,  category: 'Underwriting', lastModified: '2026-03-26', threshold: 1.15, thresholdLabel: 'DSCR' },
  { id: 'pr_003', name: 'Prohibited Industry List',          description: 'Applications from prohibited SIC/MCC sectors auto-declined.',                priority: 'P1', active: true,  category: 'Compliance',   lastModified: '2026-03-20' },
  { id: 'pr_004', name: 'Broker Compensation Cap',           description: 'Broker fees capped at 5% of funded amount per NY/CA disclosure rules.',      priority: 'P2', active: true,  category: 'Compliance',   lastModified: '2026-03-18', threshold: 5, thresholdLabel: '%' },
  { id: 'pr_005', name: 'Concentration Risk Limit',          description: 'Single-industry portfolio concentration not to exceed 30%.',                  priority: 'P2', active: true,  category: 'Risk',         lastModified: '2026-03-15', threshold: 30, thresholdLabel: '%' },
  { id: 'pr_006', name: 'Prepayment Penalty Waiver',         description: 'No prepayment penalties for advances under 90-day term.',                     priority: 'P3', active: false, category: 'Product',      lastModified: '2026-03-10', threshold: 90, thresholdLabel: 'days' },
  { id: 'pr_007', name: 'Alternative Data Scoring Pilot',    description: 'Allows Plaid-verified cash-flow score to substitute missing FICO.',          priority: 'P3', active: false, category: 'Underwriting', lastModified: '2026-03-05' },
];

const PLACEHOLDER_VERSIONS: RuleVersion[] = [
  { id: 'rv_001', version: 'v4.2.1', ruleset: 'Core Workflow Rules', stage: 'production', author: 'J. Martinez', createdAt: '2026-03-28T10:00:00Z', changelog: 'Added High-Risk Merchant Block; updated MCC list from CFPB enforcement advisory.', linesAdded: 42, linesRemoved: 7, isCurrent: true },
  { id: 'rv_002', version: 'v4.3.0-rc1', ruleset: 'Core Workflow Rules', stage: 'staging', author: 'K. Oduya', createdAt: '2026-03-30T14:00:00Z', changelog: 'New State Usury Cap rule; refactored AML escalation conditions for precision.', linesAdded: 89, linesRemoved: 31, isCurrent: false },
  { id: 'rv_003', version: 'v4.3.0-beta2', ruleset: 'Core Workflow Rules', stage: 'test', author: 'A. Singh', createdAt: '2026-03-31T08:00:00Z', changelog: 'Pilot: Alternative data scoring integration with Plaid cash-flow API.', linesAdded: 114, linesRemoved: 0, isCurrent: false },
  { id: 'rv_004', version: 'v2.1.0', ruleset: 'Policy Ruleset', stage: 'production', author: 'J. Martinez', createdAt: '2026-03-20T10:00:00Z', changelog: 'Broker compensation cap rule added; concentration risk threshold updated to 30%.', linesAdded: 55, linesRemoved: 12, isCurrent: true },
  { id: 'rv_005', version: 'v2.2.0-rc1', ruleset: 'Policy Ruleset', stage: 'staging', author: 'K. Oduya', createdAt: '2026-03-29T11:00:00Z', changelog: 'Adding prepayment penalty waiver rule for sub-90-day products.', linesAdded: 28, linesRemoved: 3, isCurrent: false },
];

const PLACEHOLDER_EXECUTION_LOG: ExecutionLogEntry[] = [
  { id: 'el_001', timestamp: '2026-03-31T14:22:00Z', ruleName: 'High-Risk Merchant Block', ruleType: 'Workflow', trigger: 'Application Submit', client: 'QuickCash LLC', action: 'Block Application', outcome: 'Blocked', advisor: 'J. Martinez', conditionDetails: [{ field: 'merchant.mcc', expected: 'in [5933, 7995, 6211]', actual: '7995', passed: true }, { field: 'funding.amount', expected: '>= $50,000', actual: '$72,000', passed: true }] },
  { id: 'el_002', timestamp: '2026-03-31T13:45:00Z', ruleName: 'Auto-Approve Returning Clients', ruleType: 'Workflow', trigger: 'Application Submit', client: 'Stellar Retail Inc', action: 'Auto-Approve', outcome: 'Approved', advisor: 'K. Oduya', conditionDetails: [{ field: 'client.cycles_completed', expected: '>= 3', actual: '5', passed: true }, { field: 'client.default_history', expected: '= none', actual: 'none', passed: true }, { field: 'funding.amount', expected: '<= $150,000', actual: '$85,000', passed: true }] },
  { id: 'el_003', timestamp: '2026-03-31T12:10:00Z', ruleName: 'State Usury Cap Enforcement', ruleType: 'Workflow', trigger: 'Rate Calculation', client: 'Empire Goods NY', action: 'Flag for Review', outcome: 'Flagged', advisor: 'A. Singh', conditionDetails: [{ field: 'applicant.state', expected: 'in [CA, NY, TX, FL]', actual: 'NY', passed: true }, { field: 'product.effective_apr', expected: '> state_cap', actual: '18.5%', passed: true }] },
  { id: 'el_004', timestamp: '2026-03-31T11:30:00Z', ruleName: 'Minimum FICO Score Gate', ruleType: 'Policy', trigger: 'Credit Pull', client: 'Delta Services Corp', action: 'Block Application', outcome: 'Blocked', advisor: 'J. Martinez', conditionDetails: [{ field: 'client.fico', expected: '>= 580', actual: '542', passed: false }] },
  { id: 'el_005', timestamp: '2026-03-31T10:55:00Z', ruleName: 'New Business Funding Cap', ruleType: 'Workflow', trigger: 'Application Submit', client: 'FreshStart Holdings', action: 'Cap at $25K', outcome: 'Flagged', advisor: 'K. Oduya', conditionDetails: [{ field: 'business.age_months', expected: '< 12', actual: '4', passed: true }, { field: 'funding.amount', expected: '> $25,000', actual: '$40,000', passed: true }] },
  { id: 'el_006', timestamp: '2026-03-30T16:42:00Z', ruleName: 'Broker Compensation Cap', ruleType: 'Policy', trigger: 'Fee Calculation', client: 'Summit Finance LLC', action: 'Flag for Review', outcome: 'Flagged', advisor: 'A. Singh', conditionDetails: [{ field: 'broker.fee_pct', expected: '<= 5%', actual: '6.2%', passed: false }] },
  { id: 'el_007', timestamp: '2026-03-30T15:18:00Z', ruleName: 'Concentration Risk Limit', ruleType: 'Policy', trigger: 'Portfolio Check', client: 'MegaRetail Group', action: 'Escalate to Committee', outcome: 'Escalated', advisor: 'J. Martinez', conditionDetails: [{ field: 'portfolio.industry_concentration', expected: '<= 30%', actual: '32.1%', passed: false }] },
  { id: 'el_008', timestamp: '2026-03-30T14:05:00Z', ruleName: 'Auto-Approve Returning Clients', ruleType: 'Workflow', trigger: 'Application Submit', client: 'Apex Trading Co', action: 'Auto-Approve', outcome: 'Approved', advisor: 'K. Oduya', conditionDetails: [{ field: 'client.cycles_completed', expected: '>= 3', actual: '7', passed: true }, { field: 'client.default_history', expected: '= none', actual: 'none', passed: true }, { field: 'funding.amount', expected: '<= $150,000', actual: '$120,000', passed: true }] },
  { id: 'el_009', timestamp: '2026-03-30T11:22:00Z', ruleName: 'High-Risk Merchant Block', ruleType: 'Workflow', trigger: 'Application Submit', client: 'LuckyStar Gaming', action: 'Block Application', outcome: 'Blocked', advisor: 'A. Singh', conditionDetails: [{ field: 'merchant.mcc', expected: 'in [5933, 7995, 6211]', actual: '6211', passed: true }, { field: 'funding.amount', expected: '>= $50,000', actual: '$95,000', passed: true }] },
  { id: 'el_010', timestamp: '2026-03-29T17:30:00Z', ruleName: 'Debt Service Coverage Ratio Floor', ruleType: 'Policy', trigger: 'Financial Review', client: 'Riverside Ventures', action: 'Block Application', outcome: 'Blocked', advisor: 'J. Martinez', conditionDetails: [{ field: 'business.dscr', expected: '>= 1.15x', actual: '0.92x', passed: false }] },
  { id: 'el_011', timestamp: '2026-03-29T15:12:00Z', ruleName: 'State Usury Cap Enforcement', ruleType: 'Workflow', trigger: 'Rate Calculation', client: 'SunCoast Capital FL', action: 'Prevent Submission', outcome: 'Blocked', advisor: 'K. Oduya', conditionDetails: [{ field: 'applicant.state', expected: 'in [CA, NY, TX, FL]', actual: 'FL', passed: true }, { field: 'product.effective_apr', expected: '> state_cap', actual: '22.1%', passed: true }] },
  { id: 'el_012', timestamp: '2026-03-29T13:48:00Z', ruleName: 'New Business Funding Cap', ruleType: 'Workflow', trigger: 'Application Submit', client: 'NovaTech Startup', action: 'Notify Underwriter', outcome: 'Flagged', advisor: 'A. Singh', conditionDetails: [{ field: 'business.age_months', expected: '< 12', actual: '8', passed: true }, { field: 'funding.amount', expected: '> $25,000', actual: '$35,000', passed: true }] },
];

const CONDITION_FIELDS = ['merchant.mcc', 'client.fico', 'client.cycles', 'funding.amount'] as const;
const CONDITION_OPERATORS: ConditionOperator[] = ['equals', 'greater_than', 'less_than', 'contains'];
const ACTION_TYPES: ActionType[] = ['Block Application', 'Auto-Approve', 'Notify Compliance', 'Escalate to Committee', 'Flag for Review'];
const RULE_CATEGORIES: RuleCategory[] = ['Compliance', 'Underwriting', 'Risk', 'Product', 'Operations'];
const SAMPLE_CLIENTS = ['QuickCash LLC', 'Stellar Retail Inc', 'Empire Goods NY', 'Delta Services Corp', 'FreshStart Holdings', 'Apex Trading Co'];

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

const STAGE_CONFIG: Record<RuleStage, { label: string; cls: string; dotClass: string }> = {
  test:       { label: 'Test',       cls: 'bg-gray-800 text-gray-300 border-gray-600',         dotClass: 'bg-gray-400' },
  staging:    { label: 'Staging',    cls: 'bg-yellow-900 text-yellow-300 border-yellow-700',   dotClass: 'bg-yellow-400' },
  production: { label: 'Production', cls: 'bg-green-900 text-green-300 border-green-700',      dotClass: 'bg-green-400' },
};

const PRIORITY_CONFIG: Record<PolicyRulePriority, { cls: string; label: string }> = {
  P1: { label: 'P1', cls: 'bg-red-900 text-red-300 border-red-700' },
  P2: { label: 'P2', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  P3: { label: 'P3', cls: 'bg-gray-800 text-gray-400 border-gray-600' },
};

const OUTCOME_CONFIG: Record<ExecutionLogEntry['outcome'], string> = {
  Fired: 'text-blue-400',
  Blocked: 'text-red-400',
  Approved: 'text-green-400',
  Flagged: 'text-yellow-400',
  Escalated: 'text-orange-400',
};

function formatDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

function formatDateTime(s: string) {
  try {
    return new Date(s).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return s; }
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

function detectConflicts(rules: WorkflowRule[]): ConflictInfo[] {
  const activeRules = rules.filter((r) => r.active);
  const conflicts: ConflictInfo[] = [];

  for (let i = 0; i < activeRules.length; i++) {
    for (let j = i + 1; j < activeRules.length; j++) {
      const a = activeRules[i];
      const b = activeRules[j];
      const aFields = a.conditions.map((c) => c.field);
      const bFields = b.conditions.map((c) => c.field);
      const overlap = aFields.filter((f) => bFields.includes(f));

      if (overlap.length > 0) {
        // Check if actions conflict (e.g., one blocks and one approves)
        const aHasBlock = a.actions.some((act) => act.variant === 'block');
        const bHasBlock = b.actions.some((act) => act.variant === 'block');
        const aHasApprove = a.actions.some((act) => act.variant === 'approve');
        const bHasApprove = b.actions.some((act) => act.variant === 'approve');

        if ((aHasBlock && bHasApprove) || (aHasApprove && bHasBlock)) {
          const existing = conflicts.find((c) => c.ruleId === a.id);
          if (existing) {
            existing.conflictsWith.push(b.id);
          } else {
            conflicts.push({ ruleId: a.id, conflictsWith: [b.id], reason: `Overlapping field(s): ${overlap.join(', ')} with conflicting actions` });
          }
          const existingB = conflicts.find((c) => c.ruleId === b.id);
          if (existingB) {
            existingB.conflictsWith.push(a.id);
          } else {
            conflicts.push({ ruleId: b.id, conflictsWith: [a.id], reason: `Overlapping field(s): ${overlap.join(', ')} with conflicting actions` });
          }
        }
      }
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PolicyRuleRow({
  rule,
  index,
  onMoveUp,
  onMoveDown,
  onClick,
  isFirst,
  isLast,
}: {
  rule: PolicyRule;
  index: number;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onClick: (rule: PolicyRule) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const pCfg = PRIORITY_CONFIG[rule.priority];

  return (
    <div
      onClick={() => onClick(rule)}
      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:border-yellow-700 transition-colors ${
        rule.active ? 'border-gray-700 bg-gray-800/40' : 'border-gray-800 bg-gray-900/60 opacity-50'
      }`}
    >
      {/* Drag-order controls */}
      <div className="flex flex-col gap-0.5 shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onMoveUp(rule.id)}
          disabled={isFirst}
          className="h-5 w-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
          aria-label="Move rule up"
        >
          &#9650;
        </button>
        <span className="text-xs text-gray-600 text-center tabular-nums">{index + 1}</span>
        <button
          onClick={() => onMoveDown(rule.id)}
          disabled={isLast}
          className="h-5 w-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
          aria-label="Move rule down"
        >
          &#9660;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${pCfg.cls}`}>
            {pCfg.label}
          </span>
          <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
            {rule.category}
          </span>
          <span className={`text-xs font-semibold ${rule.active ? 'text-green-400' : 'text-gray-500'}`}>
            {rule.active ? '\u25CF Active' : '\u25CB Inactive'}
          </span>
        </div>
        <p className="text-sm font-semibold text-gray-100">{rule.name}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{rule.description}</p>
      </div>

      {/* Modified date */}
      <p className="text-xs text-gray-600 shrink-0 whitespace-nowrap">{rule.lastModified}</p>
    </div>
  );
}

function DiffViewerPlaceholder({ version }: { version: RuleVersion }) {
  const lines = version.changelog.split(';').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 font-mono text-xs">
      <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2">
        <span className="text-gray-400">{version.ruleset} &mdash; {version.version}</span>
        <div className="flex gap-3 text-xs">
          <span className="text-green-400 font-semibold">+{version.linesAdded}</span>
          <span className="text-red-400 font-semibold">&minus;{version.linesRemoved}</span>
        </div>
      </div>
      <div className="space-y-1">
        {version.linesAdded > 0 && lines.map((line, i) => (
          <div key={`add-${i}`} className="flex gap-2">
            <span className="text-green-600 select-none w-3">+</span>
            <span className="text-green-300">{line}</span>
          </div>
        ))}
        {version.linesRemoved > 0 && (
          <div className="flex gap-2">
            <span className="text-red-600 select-none w-3">&minus;</span>
            <span className="text-red-400">{version.linesRemoved} lines removed from prior version</span>
          </div>
        )}
        {version.linesAdded === 0 && version.linesRemoved === 0 && (
          <span className="text-gray-600">No changes</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer overlay
// ---------------------------------------------------------------------------

function DrawerOverlay({ open, onClose, children, width = 640 }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-gray-900 border-l border-gray-700 overflow-y-auto animate-slide-in"
        style={{ width: `${width}px`, maxWidth: '100vw' }}
      >
        <div className="p-6">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 text-lg">
            &#10005;
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Rule Builder Modal (3-step)
// ---------------------------------------------------------------------------

function NewRuleBuilder({ open, onClose, onSubmit }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (rule: WorkflowRule) => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RuleCategory>('Compliance');
  const [priority, setPriority] = useState<PolicyRulePriority>('P2');
  const [startDate, setStartDate] = useState('');
  const [conditions, setConditions] = useState<BuilderCondition[]>([{ field: 'merchant.mcc', operator: 'equals', value: '' }]);
  const [logicOps, setLogicOps] = useState<LogicOperator[]>([]);
  const [actionType, setActionType] = useState<ActionType>('Block Application');
  const [actionParams, setActionParams] = useState('');

  function resetForm() {
    setStep(1);
    setName('');
    setDescription('');
    setCategory('Compliance');
    setPriority('P2');
    setStartDate('');
    setConditions([{ field: 'merchant.mcc', operator: 'equals', value: '' }]);
    setLogicOps([]);
    setActionType('Block Application');
    setActionParams('');
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function addCondition() {
    setConditions([...conditions, { field: 'merchant.mcc', operator: 'equals', value: '' }]);
    setLogicOps([...logicOps, 'AND']);
  }

  function removeCondition(idx: number) {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((_, i) => i !== idx));
    if (idx > 0) {
      setLogicOps(logicOps.filter((_, i) => i !== idx - 1));
    } else if (logicOps.length > 0) {
      setLogicOps(logicOps.slice(1));
    }
  }

  function updateCondition(idx: number, field: keyof BuilderCondition, value: string) {
    setConditions(conditions.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  function toggleLogicOp(idx: number) {
    setLogicOps(logicOps.map((op, i) => i === idx ? (op === 'AND' ? 'OR' : 'AND') : op));
  }

  const actionVariantMap: Record<ActionType, RuleAction['variant']> = {
    'Block Application': 'block',
    'Auto-Approve': 'approve',
    'Notify Compliance': 'notify',
    'Escalate to Committee': 'warn',
    'Flag for Review': 'warn',
  };

  function handleSubmit() {
    const operatorMap: Record<ConditionOperator, RuleCondition['operator']> = {
      equals: 'equals',
      greater_than: 'gte',
      less_than: 'lte',
      contains: 'contains',
    };

    const newRule: WorkflowRule = {
      id: `wr_${Date.now()}`,
      name,
      description,
      priority: priority === 'P1' ? 1 : priority === 'P2' ? 2 : 3,
      active: false,
      updatedAt: new Date().toISOString(),
      conditions: conditions.map((c) => ({
        field: c.field,
        operator: operatorMap[c.operator],
        value: c.value,
      })),
      actions: [{
        type: actionType.toLowerCase().replace(/ /g, '_'),
        label: actionType,
        variant: actionVariantMap[actionType],
      }],
    };

    onSubmit(newRule);
    handleClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white">New Rule Builder</h2>
            <button onClick={handleClose} className="text-gray-500 hover:text-gray-300 text-lg">&#10005;</button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border ${
                  step === s ? 'bg-yellow-600 border-yellow-500 text-black' :
                  step > s ? 'bg-green-800 border-green-600 text-green-300' :
                  'bg-gray-800 border-gray-600 text-gray-500'
                }`}>
                  {step > s ? '\u2713' : s}
                </div>
                <span className={`text-xs font-semibold ${step === s ? 'text-yellow-400' : 'text-gray-500'}`}>
                  {s === 1 ? 'Details' : s === 2 ? 'Conditions' : 'Actions'}
                </span>
                {s < 3 && <div className="w-8 h-px bg-gray-700" />}
              </div>
            ))}
          </div>

          {/* Step 1: Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Rule Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600"
                  placeholder="e.g., High-Risk MCC Block"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600 resize-none"
                  placeholder="What does this rule do?"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as RuleCategory)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600"
                  >
                    {RULE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as PolicyRulePriority)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600"
                  >
                    <option value="P1">P1 - Critical</option>
                    <option value="P2">P2 - Important</option>
                    <option value="P3">P3 - Normal</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep(2)}
                  disabled={!name.trim()}
                  className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-sm font-semibold text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next: Conditions &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Conditions */}
          {step === 2 && (
            <div className="space-y-4">
              {conditions.map((cond, idx) => (
                <div key={idx}>
                  {idx > 0 && (
                    <button
                      onClick={() => toggleLogicOp(idx - 1)}
                      className="mb-2 px-3 py-1 rounded-full text-xs font-bold border border-yellow-700 bg-yellow-900 text-yellow-300 hover:bg-yellow-800 transition-colors"
                    >
                      {logicOps[idx - 1] || 'AND'}
                    </button>
                  )}
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <select
                        value={cond.field}
                        onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-100 focus:outline-none focus:border-yellow-600"
                      >
                        {CONDITION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select
                        value={cond.operator}
                        onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-100 focus:outline-none focus:border-yellow-600"
                      >
                        {CONDITION_OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                      </select>
                      <input
                        value={cond.value}
                        onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                        placeholder="Value"
                        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-gray-100 focus:outline-none focus:border-yellow-600"
                      />
                    </div>
                    {conditions.length > 1 && (
                      <button
                        onClick={() => removeCondition(idx)}
                        className="text-gray-500 hover:text-red-400 text-xs mt-2"
                      >
                        &#10005;
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={addCondition}
                className="text-xs text-yellow-400 hover:text-yellow-300 font-semibold"
              >
                + Add Condition
              </button>

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-200 transition-colors">
                  &larr; Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={conditions.some((c) => !c.value.trim())}
                  className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-sm font-semibold text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next: Actions &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Actions */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Action</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as ActionType)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600"
                >
                  {ACTION_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Parameters (optional)</label>
                <input
                  value={actionParams}
                  onChange={(e) => setActionParams(e.target.value)}
                  placeholder="e.g., notify_email=compliance@company.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600"
                />
              </div>

              {/* Preview */}
              <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Rule Preview</p>
                <p className="text-sm font-semibold text-gray-100">{name}</p>
                <p className="text-xs text-gray-400 mt-1">{description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {conditions.map((c, i) => (
                    <span key={i} className="text-xs bg-gray-700 text-gray-300 rounded-full px-2 py-0.5">
                      {c.field} {c.operator} {c.value}
                    </span>
                  ))}
                </div>
                <div className="mt-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    actionType === 'Block Application' ? 'bg-red-900 text-red-300 border-red-700' :
                    actionType === 'Auto-Approve' ? 'bg-green-900 text-green-300 border-green-700' :
                    'bg-yellow-900 text-yellow-300 border-yellow-700'
                  }`}>
                    {actionType}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">Status: Inactive (will be created as inactive)</p>
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-200 transition-colors">
                  &larr; Back
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-sm font-semibold text-white transition-colors"
                >
                  Create Rule (Inactive)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workflow Rule Edit Drawer
// ---------------------------------------------------------------------------

function WorkflowRuleEditDrawer({ rule, onClose, onDuplicate, onArchive }: {
  rule: WorkflowRule;
  onClose: () => void;
  onDuplicate: (rule: WorkflowRule) => void;
  onArchive: (id: string) => void;
}) {
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testClient, setTestClient] = useState(SAMPLE_CLIENTS[0]);
  const [testResults, setTestResults] = useState<{ field: string; expected: string; actual: string; passed: boolean }[] | null>(null);

  function runSimulation() {
    const simResults = rule.conditions.map((c) => {
      const passed = Math.random() > 0.3;
      const actualValues: Record<string, string> = {
        'merchant.mcc': '7995',
        'funding.amount': '$65,000',
        'client.cycles_completed': '4',
        'client.default_history': 'none',
        'applicant.state': 'NY',
        'product.effective_apr': '16.2%',
        'transaction.amount': '$320,000',
        'kyb.score': '55',
        'business.age_months': '8',
      };
      return {
        field: c.field,
        expected: `${c.operator} ${c.value}`,
        actual: actualValues[c.field] || 'N/A',
        passed,
      };
    });
    setTestResults(simResults);
  }

  const wouldFire = testResults ? testResults.every((r) => r.passed) : null;

  return (
    <DrawerOverlay open onClose={onClose}>
      <h2 className="text-lg font-bold text-white mb-1">{rule.name}</h2>
      <p className="text-xs text-gray-400 mb-4">{rule.description}</p>

      {/* Rule Status */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
          rule.active ? 'bg-green-900 text-green-300 border-green-700' : 'bg-gray-800 text-gray-400 border-gray-600'
        }`}>
          {rule.active ? 'Active' : 'Inactive'}
        </span>
        <span className="text-xs bg-yellow-900 text-yellow-300 border border-yellow-700 px-2 py-0.5 rounded-full font-bold">
          Priority {rule.priority}
        </span>
      </div>

      {/* Conditions */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Conditions</p>
        <div className="space-y-2">
          {rule.conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg p-2.5">
              <span className="text-xs text-gray-400 font-medium flex-1">{c.field}</span>
              <span className="text-xs text-yellow-500 font-bold">{c.operator}</span>
              <span className="text-xs text-gray-200 font-semibold flex-1 text-right">{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Actions</p>
        <div className="flex flex-wrap gap-1.5">
          {rule.actions.map((a, i) => {
            const variantCls = a.variant === 'block' ? 'bg-red-900 text-red-300 border-red-700' :
              a.variant === 'approve' ? 'bg-green-900 text-green-300 border-green-700' :
              a.variant === 'notify' ? 'bg-blue-900 text-blue-300 border-blue-700' :
              a.variant === 'warn' ? 'bg-yellow-900 text-yellow-300 border-yellow-700' :
              'bg-gray-800 text-gray-300 border-gray-600';
            return (
              <span key={i} className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${variantCls}`}>
                {a.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Rule History */}
      <div className="mb-4 p-3 rounded-lg bg-gray-800/60 border border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Rule History</p>
        <div className="space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Created</span>
            <span className="text-gray-300">{rule.updatedAt ? formatDateTime(rule.updatedAt) : 'Unknown'}</span>
          </div>
          <div className="flex justify-between">
            <span>Last Modified</span>
            <span className="text-gray-300">{rule.updatedAt ? formatDateTime(rule.updatedAt) : 'Unknown'}</span>
          </div>
        </div>
      </div>

      {/* Execution Stats */}
      <div className="mb-4 p-3 rounded-lg bg-gray-800/60 border border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Execution Stats</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-black text-blue-400">{Math.floor(Math.random() * 150 + 20)}</p>
            <p className="text-xs text-gray-500">Times Fired</p>
          </div>
          <div>
            <p className="text-2xl font-black text-green-400">{Math.floor(Math.random() * 40 + 5)}</p>
            <p className="text-xs text-gray-500">Last 30d</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-300 mt-1">Mar 31</p>
            <p className="text-xs text-gray-500">Last Fired</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowTestPanel(!showTestPanel)}
          className="flex-1 px-3 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-xs font-semibold text-blue-200 transition-colors"
        >
          {showTestPanel ? 'Hide Test Panel' : 'Test Rule'}
        </button>
        <button
          onClick={() => onDuplicate(rule)}
          className="flex-1 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-semibold text-gray-200 transition-colors"
        >
          Duplicate
        </button>
        <button
          onClick={() => onArchive(rule.id)}
          className="flex-1 px-3 py-2 rounded-lg bg-red-900 hover:bg-red-800 text-xs font-semibold text-red-300 transition-colors"
        >
          Archive
        </button>
      </div>

      {/* Test Rule Panel */}
      {showTestPanel && (
        <div className="p-4 rounded-lg border border-blue-800 bg-blue-950/30">
          <p className="text-xs text-blue-300 uppercase tracking-wide font-semibold mb-3">Rule Test Simulation</p>
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1">Select Client</label>
            <select
              value={testClient}
              onChange={(e) => { setTestClient(e.target.value); setTestResults(null); }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-600"
            >
              {SAMPLE_CLIENTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={runSimulation}
            className="w-full px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-sm font-semibold text-white transition-colors mb-3"
          >
            Run Simulation
          </button>

          {testResults && (
            <div>
              <div className="space-y-2 mb-3">
                {testResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                    r.passed ? 'border-green-800 bg-green-950/30' : 'border-red-800 bg-red-950/30'
                  }`}>
                    <span className={`font-bold ${r.passed ? 'text-green-400' : 'text-red-400'}`}>
                      {r.passed ? '\u2713' : '\u2717'}
                    </span>
                    <span className="text-gray-400 flex-1">{r.field}</span>
                    <span className="text-gray-500">{r.expected}</span>
                    <span className={`font-semibold ${r.passed ? 'text-green-300' : 'text-red-300'}`}>{r.actual}</span>
                  </div>
                ))}
              </div>
              <div className={`p-3 rounded-lg border text-center font-bold text-sm ${
                wouldFire
                  ? 'border-green-700 bg-green-950/40 text-green-300'
                  : 'border-red-700 bg-red-950/40 text-red-300'
              }`}>
                Rule {wouldFire ? 'WOULD fire' : 'would NOT fire'} for {testClient}
              </div>
            </div>
          )}
        </div>
      )}
    </DrawerOverlay>
  );
}

// ---------------------------------------------------------------------------
// Policy Rule Edit Drawer
// ---------------------------------------------------------------------------

function PolicyRuleEditDrawer({ rule, onClose, onSave }: {
  rule: PolicyRule;
  onClose: () => void;
  onSave: (updated: PolicyRule) => void;
}) {
  const [threshold, setThreshold] = useState(rule.threshold ?? 0);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testClient, setTestClient] = useState(SAMPLE_CLIENTS[0]);
  const [testResults, setTestResults] = useState<{ field: string; expected: string; actual: string; passed: boolean }[] | null>(null);

  function runSimulation() {
    const passed = Math.random() > 0.4;
    const actualVal = rule.thresholdLabel === 'FICO' ? (passed ? '622' : '548') :
      rule.thresholdLabel === 'DSCR' ? (passed ? '1.32x' : '0.89x') :
      rule.thresholdLabel === '%' ? (passed ? `${threshold - 1}%` : `${threshold + 2}%`) :
      rule.thresholdLabel === 'days' ? (passed ? `${threshold - 10}` : `${threshold + 5}`) : 'N/A';

    setTestResults([{
      field: rule.name,
      expected: `${rule.thresholdLabel === 'DSCR' ? '>= ' : rule.thresholdLabel === 'FICO' ? '>= ' : '<= '}${threshold}${rule.thresholdLabel ? ` ${rule.thresholdLabel}` : ''}`,
      actual: actualVal,
      passed,
    }]);
  }

  const wouldFire = testResults ? testResults.every((r) => r.passed) : null;

  return (
    <DrawerOverlay open onClose={onClose}>
      <h2 className="text-lg font-bold text-white mb-1">{rule.name}</h2>
      <p className="text-xs text-gray-400 mb-4">{rule.description}</p>

      <div className="flex items-center gap-2 mb-4">
        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${PRIORITY_CONFIG[rule.priority].cls}`}>
          {rule.priority}
        </span>
        <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded">
          {rule.category}
        </span>
        <span className={`text-xs font-semibold ${rule.active ? 'text-green-400' : 'text-gray-500'}`}>
          {rule.active ? '\u25CF Active' : '\u25CB Inactive'}
        </span>
      </div>

      {/* Editable threshold */}
      {rule.threshold !== undefined && rule.thresholdLabel && (
        <div className="mb-4 p-3 rounded-lg bg-gray-800/60 border border-gray-700">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Threshold Value</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
              step={rule.thresholdLabel === 'DSCR' ? 0.01 : 1}
              className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600"
            />
            <span className="text-sm text-gray-400 font-semibold">{rule.thresholdLabel}</span>
            <button
              onClick={() => onSave({ ...rule, threshold })}
              className="ml-auto px-3 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-xs font-semibold text-black transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Rule History */}
      <div className="mb-4 p-3 rounded-lg bg-gray-800/60 border border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Rule History</p>
        <div className="space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Created</span>
            <span className="text-gray-300">{rule.lastModified}</span>
          </div>
          <div className="flex justify-between">
            <span>Last Modified</span>
            <span className="text-gray-300">{rule.lastModified}</span>
          </div>
        </div>
      </div>

      {/* Execution Stats */}
      <div className="mb-4 p-3 rounded-lg bg-gray-800/60 border border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Execution Stats</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-black text-blue-400">{Math.floor(Math.random() * 200 + 30)}</p>
            <p className="text-xs text-gray-500">Times Fired</p>
          </div>
          <div>
            <p className="text-2xl font-black text-green-400">{Math.floor(Math.random() * 50 + 10)}</p>
            <p className="text-xs text-gray-500">Last 30d</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-300 mt-1">Mar 30</p>
            <p className="text-xs text-gray-500">Last Fired</p>
          </div>
        </div>
      </div>

      {/* Test Rule */}
      <button
        onClick={() => setShowTestPanel(!showTestPanel)}
        className="w-full px-3 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-xs font-semibold text-blue-200 transition-colors mb-4"
      >
        {showTestPanel ? 'Hide Test Panel' : 'Test Rule'}
      </button>

      {showTestPanel && (
        <div className="p-4 rounded-lg border border-blue-800 bg-blue-950/30">
          <p className="text-xs text-blue-300 uppercase tracking-wide font-semibold mb-3">Rule Test Simulation</p>
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1">Select Client</label>
            <select
              value={testClient}
              onChange={(e) => { setTestClient(e.target.value); setTestResults(null); }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-600"
            >
              {SAMPLE_CLIENTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={runSimulation}
            className="w-full px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-sm font-semibold text-white transition-colors mb-3"
          >
            Run Simulation
          </button>

          {testResults && (
            <div>
              <div className="space-y-2 mb-3">
                {testResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                    r.passed ? 'border-green-800 bg-green-950/30' : 'border-red-800 bg-red-950/30'
                  }`}>
                    <span className={`font-bold ${r.passed ? 'text-green-400' : 'text-red-400'}`}>
                      {r.passed ? '\u2713' : '\u2717'}
                    </span>
                    <span className="text-gray-400 flex-1">{r.field}</span>
                    <span className="text-gray-500">{r.expected}</span>
                    <span className={`font-semibold ${r.passed ? 'text-green-300' : 'text-red-300'}`}>{r.actual}</span>
                  </div>
                ))}
              </div>
              <div className={`p-3 rounded-lg border text-center font-bold text-sm ${
                wouldFire
                  ? 'border-green-700 bg-green-950/40 text-green-300'
                  : 'border-red-700 bg-red-950/40 text-red-300'
              }`}>
                Rule {wouldFire ? 'WOULD fire' : 'would NOT fire'} for {testClient}
              </div>
            </div>
          )}
        </div>
      )}
    </DrawerOverlay>
  );
}

// ---------------------------------------------------------------------------
// Deploy Confirmation Modal
// ---------------------------------------------------------------------------

function DeployConfirmationModal({ version, onClose, onConfirm }: {
  version: RuleVersion;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4">
        <div className="p-6">
          <h2 className="text-lg font-bold text-white mb-1">Promote to Production</h2>
          <p className="text-xs text-gray-400 mb-4">
            You are about to deploy <span className="font-bold text-yellow-400">{version.version}</span> of <span className="font-semibold text-gray-300">{version.ruleset}</span> to production.
          </p>

          {/* Diff Preview */}
          <div className="mb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Diff Preview</p>
            <DiffViewerPlaceholder version={version} />
          </div>

          {/* Deploy Reason */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Deploy Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why are you deploying this version?"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-green-600 resize-none"
            />
          </div>

          {/* Acknowledgment */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-green-600 focus:ring-green-500"
            />
            <span className="text-xs text-gray-300">
              I acknowledge this will affect live production rules and have reviewed the changes.
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-200 transition-colors">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!reason.trim() || !acknowledged}
              className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm Deploy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rollback Confirmation Modal
// ---------------------------------------------------------------------------

function RollbackConfirmationModal({ version, currentVersion, onClose, onConfirm }: {
  version: RuleVersion;
  currentVersion?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-red-800 rounded-xl w-full max-w-lg mx-4">
        <div className="p-6">
          <h2 className="text-lg font-bold text-red-400 mb-1">Rollback Confirmation</h2>

          {/* Warning */}
          <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800">
            <p className="text-sm text-red-300">
              <span className="font-bold">Warning:</span> This will roll back{' '}
              <span className="font-semibold text-red-200">{version.ruleset}</span>.
              {currentVersion && (
                <> The current live version is <span className="font-mono font-bold text-red-200">{currentVersion}</span>.</>
              )}
            </p>
          </div>

          {/* Rollback Reason */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Rollback Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why are you rolling back?"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-red-600 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-200 transition-colors">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!reason.trim()}
              className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm Rollback
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorkflowsPage() {
  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>(PLACEHOLDER_WORKFLOW_RULES);
  const [policyRules, setPolicyRules] = useState<PolicyRule[]>(PLACEHOLDER_POLICY_RULES);
  const [versions] = useState<RuleVersion[]>(PLACEHOLDER_VERSIONS);
  const [activeTab, setActiveTab] = useState<'workflows' | 'policies' | 'versions' | 'execution-log'>('workflows');
  const [selectedVersionId, setSelectedVersionId] = useState<string>(PLACEHOLDER_VERSIONS[0].id);
  const [deployedMsg, setDeployedMsg] = useState<string | null>(null);

  // New Rule Builder
  const [showNewRuleBuilder, setShowNewRuleBuilder] = useState(false);

  // Edit drawers
  const [selectedWorkflowRule, setSelectedWorkflowRule] = useState<WorkflowRule | null>(null);
  const [selectedPolicyRule, setSelectedPolicyRule] = useState<PolicyRule | null>(null);

  // Deploy/Rollback modals
  const [deployVersion, setDeployVersion] = useState<RuleVersion | null>(null);
  const [rollbackVersion, setRollbackVersion] = useState<RuleVersion | null>(null);

  // Execution log
  const [executionLog] = useState<ExecutionLogEntry[]>(PLACEHOLDER_EXECUTION_LOG);
  const [logFilterName, setLogFilterName] = useState('');
  const [logFilterOutcome, setLogFilterOutcome] = useState('');
  const [selectedLogEntry, setSelectedLogEntry] = useState<ExecutionLogEntry | null>(null);

  // Conflict detection
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);

  useEffect(() => {
    setConflicts(detectConflicts(workflowRules));
  }, [workflowRules]);

  const activeWorkflows = workflowRules.filter((r) => r.active).length;
  const activePolicies  = policyRules.filter((r) => r.active).length;
  const prodVersions    = versions.filter((v) => v.stage === 'production').length;
  const pendingVersions = versions.filter((v) => v.stage !== 'production').length;

  function showToast(msg: string) {
    setDeployedMsg(msg);
    setTimeout(() => setDeployedMsg(null), 3500);
  }

  function handleToggleWorkflow(id: string, active: boolean) {
    setWorkflowRules((prev) => prev.map((r) => r.id === id ? { ...r, active } : r));
  }

  function handleMovePolicyUp(id: string) {
    setPolicyRules((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function handleMovePolicyDown(id: string) {
    setPolicyRules((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  function handleDeploy(version: RuleVersion) {
    setDeployVersion(version);
  }

  function handleConfirmDeploy() {
    if (deployVersion) {
      showToast(`${deployVersion.version} promoted to Production successfully.`);
      setDeployVersion(null);
    }
  }

  function handleRollback(version: RuleVersion) {
    setRollbackVersion(version);
  }

  function handleConfirmRollback() {
    if (rollbackVersion) {
      showToast(`Rollback initiated for ${rollbackVersion.ruleset}. Previous version restored.`);
      setRollbackVersion(null);
    }
  }

  function handleNewRuleSubmit(rule: WorkflowRule) {
    setWorkflowRules((prev) => [...prev, rule]);
    showToast(`Rule "${rule.name}" created as Inactive.`);
  }

  function handleDuplicateWorkflowRule(rule: WorkflowRule) {
    const dup: WorkflowRule = {
      ...rule,
      id: `wr_${Date.now()}`,
      name: `${rule.name} (Copy)`,
      active: false,
      updatedAt: new Date().toISOString(),
    };
    setWorkflowRules((prev) => [...prev, dup]);
    setSelectedWorkflowRule(null);
    showToast(`Rule "${dup.name}" duplicated as Inactive.`);
  }

  function handleArchiveWorkflowRule(id: string) {
    setWorkflowRules((prev) => prev.filter((r) => r.id !== id));
    setSelectedWorkflowRule(null);
    showToast('Rule archived.');
  }

  function handleSavePolicyRule(updated: PolicyRule) {
    setPolicyRules((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    showToast(`Threshold for "${updated.name}" updated.`);
  }

  function getConflictForRule(ruleId: string): ConflictInfo | undefined {
    return conflicts.find((c) => c.ruleId === ruleId);
  }

  // Find current production version for a ruleset
  function getCurrentVersionForRuleset(ruleset: string): string | undefined {
    const current = versions.find((v) => v.ruleset === ruleset && v.isCurrent);
    return current?.version;
  }

  // Filtered execution log
  const filteredLog = useMemo(() => {
    return executionLog.filter((entry) => {
      if (logFilterName && !entry.ruleName.toLowerCase().includes(logFilterName.toLowerCase())) return false;
      if (logFilterOutcome && entry.outcome !== logFilterOutcome) return false;
      return true;
    });
  }, [executionLog, logFilterName, logFilterOutcome]);

  function exportLogCsv() {
    const headers = ['Timestamp', 'Rule Name', 'Type', 'Trigger', 'Client', 'Action', 'Outcome', 'Advisor'];
    const rows = filteredLog.map((e) => [
      e.timestamp, e.ruleName, e.ruleType, e.trigger, e.client, e.action, e.outcome, e.advisor,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'execution-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? versions[0];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflow & Policy Builder</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {workflowRules.length} workflow rules &middot; {policyRules.length} policy rules
          </p>
        </div>
        <button
          onClick={() => setShowNewRuleBuilder(true)}
          className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-sm font-semibold text-black transition-colors"
        >
          + New Rule
        </button>
      </div>

      {/* Toast notification */}
      {deployedMsg && (
        <div className="mb-4 rounded-lg border border-green-700 bg-green-950 text-green-300 text-sm font-semibold px-4 py-2.5 flex items-center gap-2">
          <span className="text-green-400">{'\u2713'}</span>
          {deployedMsg}
        </div>
      )}

      {/* Conflict warnings */}
      {conflicts.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/40 text-amber-300 text-sm px-4 py-2.5 flex items-center gap-2">
          <span className="text-amber-400">{'\u26A0'}</span>
          <span className="font-semibold">{conflicts.length} potential rule conflict(s) detected.</span>
          <span className="text-xs text-amber-400/70 ml-1">Check workflow rules for overlapping conditions.</span>
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active Workflows', value: activeWorkflows,  color: 'text-green-400' },
          { label: 'Active Policies',  value: activePolicies,   color: 'text-green-400' },
          { label: 'Live Rulesets',    value: prodVersions,     color: 'text-blue-400' },
          { label: 'Pending Deploys',  value: pendingVersions,  color: pendingVersions > 0 ? 'text-yellow-400' : 'text-gray-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800">
        {(['workflows', 'policies', 'versions', 'execution-log'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-yellow-500 text-yellow-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab === 'workflows' ? 'Workflow Rules' : tab === 'policies' ? 'Policy Rules' : tab === 'versions' ? 'Versions & Deploy' : 'Execution Log'}
          </button>
        ))}
      </div>

      {/* ── Workflow Rules ─────────────────────────────────────── */}
      {activeTab === 'workflows' && (
        <div>
          {/* Table header for desktop */}
          <div className="hidden md:grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-5 pb-2 text-xs text-gray-500 uppercase tracking-wide font-semibold border-b border-gray-800 mb-2">
            <span className="w-8 text-center">#</span>
            <span>Rule</span>
            <span>Conditions / Actions</span>
            <span>Status</span>
          </div>

          {/* Cards */}
          <div className="space-y-3">
            {workflowRules.map((rule) => {
              const conflict = getConflictForRule(rule.id);
              return (
                <div key={rule.id} className="relative">
                  {conflict && (
                    <div className="absolute -top-1 -right-1 z-10 group">
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-900 text-amber-300 border border-amber-700 cursor-help">
                        {'\u26A0'} Potential Conflict
                      </span>
                      <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-64 p-2 rounded-lg bg-gray-800 border border-amber-700 text-xs text-amber-200 shadow-xl z-20">
                        {conflict.reason}
                      </div>
                    </div>
                  )}
                  <div onClick={() => setSelectedWorkflowRule(rule)} className="cursor-pointer">
                    <WorkflowRuleCard
                      rule={rule}
                      onToggleActive={handleToggleWorkflow}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Policy Rules ───────────────────────────────────────── */}
      {activeTab === 'policies' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500">
              Drag or use arrows to reorder. P1 rules are evaluated first.
            </p>
            <div className="flex gap-2 text-xs">
              {(['P1', 'P2', 'P3'] as PolicyRulePriority[]).map((p) => {
                const cnt = policyRules.filter((r) => r.priority === p).length;
                const cfg = PRIORITY_CONFIG[p];
                return (
                  <span key={p} className={`px-2 py-0.5 rounded border font-semibold ${cfg.cls}`}>
                    {cnt} {p}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            {policyRules.map((rule, i) => (
              <PolicyRuleRow
                key={rule.id}
                rule={rule}
                index={i}
                isFirst={i === 0}
                isLast={i === policyRules.length - 1}
                onMoveUp={handleMovePolicyUp}
                onMoveDown={handleMovePolicyDown}
                onClick={setSelectedPolicyRule}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Versions & Deploy ──────────────────────────────────── */}
      {activeTab === 'versions' && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Version list */}
          <div className="xl:col-span-2 space-y-3">
            {versions.map((v) => {
              const stageCfg = STAGE_CONFIG[v.stage];
              const isSelected = v.id === selectedVersionId;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersionId(v.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${
                    isSelected
                      ? 'border-yellow-600 bg-yellow-950/20'
                      : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${stageCfg.dotClass}`} />
                      <span className="font-mono text-sm font-bold text-gray-100">{v.version}</span>
                      {v.isCurrent && (
                        <span className="text-xs bg-blue-900 text-blue-300 border border-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                          Current
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${stageCfg.cls}`}>
                      {stageCfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-1">{v.ruleset}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{v.author}</span>
                    <span>{formatDateTime(v.createdAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Version detail + diff */}
          <div className="xl:col-span-3 rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-lg font-black text-gray-100">{selectedVersion.version}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STAGE_CONFIG[selectedVersion.stage].cls}`}>
                    {STAGE_CONFIG[selectedVersion.stage].label}
                  </span>
                  {selectedVersion.isCurrent && (
                    <span className="text-xs bg-blue-900 text-blue-300 border border-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                      Live
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">{selectedVersion.ruleset} &middot; by {selectedVersion.author}</p>
                <p className="text-xs text-gray-500">{formatDateTime(selectedVersion.createdAt)}</p>
              </div>

              {/* Deploy / Rollback */}
              <div className="flex gap-2 shrink-0">
                {selectedVersion.stage === 'staging' && (
                  <button
                    onClick={() => handleDeploy(selectedVersion)}
                    className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-xs font-semibold text-white transition-colors"
                  >
                    Promote to Production
                  </button>
                )}
                {selectedVersion.stage === 'production' && !selectedVersion.isCurrent && (
                  <button
                    onClick={() => handleRollback(selectedVersion)}
                    className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-xs font-semibold text-white transition-colors"
                  >
                    Rollback
                  </button>
                )}
                {selectedVersion.stage === 'production' && selectedVersion.isCurrent && (
                  <button
                    onClick={() => handleRollback(selectedVersion)}
                    className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-xs font-semibold text-white transition-colors"
                  >
                    Rollback
                  </button>
                )}
              </div>
            </div>

            {/* Changelog summary */}
            <div className="mb-4 p-3 rounded-lg bg-gray-800/60 border border-gray-700">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">
                Changelog
              </p>
              <p className="text-sm text-gray-200 leading-relaxed">{selectedVersion.changelog}</p>
            </div>

            {/* Diff viewer */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">
                Diff Preview
              </p>
              <DiffViewerPlaceholder version={selectedVersion} />
            </div>

            {/* Stats */}
            <div className="mt-4 flex gap-6 text-xs text-gray-500 border-t border-gray-800 pt-3">
              <span>
                <span className="text-green-400 font-semibold">+{selectedVersion.linesAdded}</span> lines added
              </span>
              <span>
                <span className="text-red-400 font-semibold">&minus;{selectedVersion.linesRemoved}</span> lines removed
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Execution Log ──────────────────────────────────────── */}
      {activeTab === 'execution-log' && (
        <div>
          {/* Filter bar */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <input
              value={logFilterName}
              onChange={(e) => setLogFilterName(e.target.value)}
              placeholder="Filter by rule name..."
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600 w-64"
            />
            <select
              value={logFilterOutcome}
              onChange={(e) => setLogFilterOutcome(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-600"
            >
              <option value="">All Outcomes</option>
              <option value="Fired">Fired</option>
              <option value="Blocked">Blocked</option>
              <option value="Approved">Approved</option>
              <option value="Flagged">Flagged</option>
              <option value="Escalated">Escalated</option>
            </select>
            <div className="flex-1" />
            <button
              onClick={exportLogCsv}
              className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-semibold text-gray-200 transition-colors"
            >
              Export CSV
            </button>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-semibold">Timestamp</th>
                    <th className="text-left px-4 py-3 font-semibold">Rule Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Type</th>
                    <th className="text-left px-4 py-3 font-semibold">Trigger</th>
                    <th className="text-left px-4 py-3 font-semibold">Client</th>
                    <th className="text-left px-4 py-3 font-semibold">Action</th>
                    <th className="text-left px-4 py-3 font-semibold">Outcome</th>
                    <th className="text-left px-4 py-3 font-semibold">Advisor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedLogEntry(selectedLogEntry?.id === entry.id ? null : entry)}
                      className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                        selectedLogEntry?.id === entry.id ? 'bg-yellow-950/20' : 'hover:bg-gray-800/40'
                      }`}
                    >
                      <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{formatDateTime(entry.timestamp)}</td>
                      <td className="px-4 py-2.5 text-gray-200 font-semibold">{entry.ruleName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded border text-xs font-semibold ${
                          entry.ruleType === 'Workflow' ? 'bg-blue-900 text-blue-300 border-blue-700' : 'bg-purple-900 text-purple-300 border-purple-700'
                        }`}>
                          {entry.ruleType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">{entry.trigger}</td>
                      <td className="px-4 py-2.5 text-gray-300">{entry.client}</td>
                      <td className="px-4 py-2.5 text-gray-400">{entry.action}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-bold ${OUTCOME_CONFIG[entry.outcome]}`}>{entry.outcome}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{entry.advisor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected log entry detail */}
          {selectedLogEntry && (
            <div className="mt-4 rounded-xl border border-gray-700 bg-gray-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">Condition Evaluation Detail</h3>
                <button onClick={() => setSelectedLogEntry(null)} className="text-gray-500 hover:text-gray-300 text-xs">
                  Close
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                {selectedLogEntry.ruleName} &middot; {selectedLogEntry.client} &middot; {formatDateTime(selectedLogEntry.timestamp)}
              </p>
              <div className="space-y-2">
                {selectedLogEntry.conditionDetails.map((d, i) => (
                  <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs ${
                    d.passed ? 'border-green-800 bg-green-950/30' : 'border-red-800 bg-red-950/30'
                  }`}>
                    <span className={`font-bold text-sm ${d.passed ? 'text-green-400' : 'text-red-400'}`}>
                      {d.passed ? '\u2713' : '\u2717'}
                    </span>
                    <span className="text-gray-300 font-medium flex-1">{d.field}</span>
                    <span className="text-gray-500">Expected: {d.expected}</span>
                    <span className={`font-semibold ${d.passed ? 'text-green-300' : 'text-red-300'}`}>
                      Actual: {d.actual}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-600 mt-3">{filteredLog.length} entries shown</p>
        </div>
      )}

      {/* ── Modals & Drawers ───────────────────────────────────── */}

      {/* New Rule Builder */}
      <NewRuleBuilder
        open={showNewRuleBuilder}
        onClose={() => setShowNewRuleBuilder(false)}
        onSubmit={handleNewRuleSubmit}
      />

      {/* Workflow Rule Edit Drawer */}
      {selectedWorkflowRule && (
        <WorkflowRuleEditDrawer
          rule={selectedWorkflowRule}
          onClose={() => setSelectedWorkflowRule(null)}
          onDuplicate={handleDuplicateWorkflowRule}
          onArchive={handleArchiveWorkflowRule}
        />
      )}

      {/* Policy Rule Edit Drawer */}
      {selectedPolicyRule && (
        <PolicyRuleEditDrawer
          rule={selectedPolicyRule}
          onClose={() => setSelectedPolicyRule(null)}
          onSave={(updated) => {
            handleSavePolicyRule(updated);
            setSelectedPolicyRule(null);
          }}
        />
      )}

      {/* Deploy Confirmation */}
      {deployVersion && (
        <DeployConfirmationModal
          version={deployVersion}
          onClose={() => setDeployVersion(null)}
          onConfirm={handleConfirmDeploy}
        />
      )}

      {/* Rollback Confirmation */}
      {rollbackVersion && (
        <RollbackConfirmationModal
          version={rollbackVersion}
          currentVersion={getCurrentVersionForRuleset(rollbackVersion.ruleset)}
          onClose={() => setRollbackVersion(null)}
          onConfirm={handleConfirmRollback}
        />
      )}
    </div>
  );
}
