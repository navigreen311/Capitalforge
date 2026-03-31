'use client';

// ============================================================
// /workflows — Workflow & Policy Builder
// Workflow rules table with conditions/actions preview,
// active/inactive toggle. Policy rules with priority ordering.
// Rules versioning panel: stage badges, deploy/rollback
// buttons, diff viewer placeholder.
// ============================================================

import { useState } from 'react';
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

interface PolicyRule {
  id: string;
  name: string;
  description: string;
  priority: PolicyRulePriority;
  active: boolean;
  category: string;
  lastModified: string;
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
  { id: 'pr_001', name: 'Minimum FICO Score Gate',          description: 'No personal guarantor below 580 FICO for unsecured products.',              priority: 'P1', active: true,  category: 'Underwriting', lastModified: '2026-03-27' },
  { id: 'pr_002', name: 'Debt Service Coverage Ratio Floor',description: 'Business DSCR must exceed 1.15x for revolving credit facilities.',          priority: 'P1', active: true,  category: 'Underwriting', lastModified: '2026-03-26' },
  { id: 'pr_003', name: 'Prohibited Industry List',          description: 'Applications from prohibited SIC/MCC sectors auto-declined.',                priority: 'P1', active: true,  category: 'Compliance',   lastModified: '2026-03-20' },
  { id: 'pr_004', name: 'Broker Compensation Cap',           description: 'Broker fees capped at 5% of funded amount per NY/CA disclosure rules.',      priority: 'P2', active: true,  category: 'Compliance',   lastModified: '2026-03-18' },
  { id: 'pr_005', name: 'Concentration Risk Limit',          description: 'Single-industry portfolio concentration not to exceed 30%.',                  priority: 'P2', active: true,  category: 'Risk',         lastModified: '2026-03-15' },
  { id: 'pr_006', name: 'Prepayment Penalty Waiver',         description: 'No prepayment penalties for advances under 90-day term.',                     priority: 'P3', active: false, category: 'Product',      lastModified: '2026-03-10' },
  { id: 'pr_007', name: 'Alternative Data Scoring Pilot',    description: 'Allows Plaid-verified cash-flow score to substitute missing FICO.',          priority: 'P3', active: false, category: 'Underwriting', lastModified: '2026-03-05' },
];

const PLACEHOLDER_VERSIONS: RuleVersion[] = [
  { id: 'rv_001', version: 'v4.2.1', ruleset: 'Core Workflow Rules', stage: 'production', author: 'J. Martinez', createdAt: '2026-03-28T10:00:00Z', changelog: 'Added High-Risk Merchant Block; updated MCC list from CFPB enforcement advisory.', linesAdded: 42, linesRemoved: 7, isCurrent: true },
  { id: 'rv_002', version: 'v4.3.0-rc1', ruleset: 'Core Workflow Rules', stage: 'staging', author: 'K. Oduya', createdAt: '2026-03-30T14:00:00Z', changelog: 'New State Usury Cap rule; refactored AML escalation conditions for precision.', linesAdded: 89, linesRemoved: 31, isCurrent: false },
  { id: 'rv_003', version: 'v4.3.0-beta2', ruleset: 'Core Workflow Rules', stage: 'test', author: 'A. Singh', createdAt: '2026-03-31T08:00:00Z', changelog: 'Pilot: Alternative data scoring integration with Plaid cash-flow API.', linesAdded: 114, linesRemoved: 0, isCurrent: false },
  { id: 'rv_004', version: 'v2.1.0', ruleset: 'Policy Ruleset', stage: 'production', author: 'J. Martinez', createdAt: '2026-03-20T10:00:00Z', changelog: 'Broker compensation cap rule added; concentration risk threshold updated to 30%.', linesAdded: 55, linesRemoved: 12, isCurrent: true },
  { id: 'rv_005', version: 'v2.2.0-rc1', ruleset: 'Policy Ruleset', stage: 'staging', author: 'K. Oduya', createdAt: '2026-03-29T11:00:00Z', changelog: 'Adding prepayment penalty waiver rule for sub-90-day products.', linesAdded: 28, linesRemoved: 3, isCurrent: false },
];

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
// Sub-components
// ---------------------------------------------------------------------------

function PolicyRuleRow({
  rule,
  index,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  rule: PolicyRule;
  index: number;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const pCfg = PRIORITY_CONFIG[rule.priority];

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${
      rule.active ? 'border-gray-700 bg-gray-800/40' : 'border-gray-800 bg-gray-900/60 opacity-50'
    }`}>
      {/* Drag-order controls */}
      <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
        <button
          onClick={() => onMoveUp(rule.id)}
          disabled={isFirst}
          className="h-5 w-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
          aria-label="Move rule up"
        >
          ▲
        </button>
        <span className="text-xs text-gray-600 text-center tabular-nums">{index + 1}</span>
        <button
          onClick={() => onMoveDown(rule.id)}
          disabled={isLast}
          className="h-5 w-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs"
          aria-label="Move rule down"
        >
          ▼
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
            {rule.active ? '● Active' : '○ Inactive'}
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
        <span className="text-gray-400">{version.ruleset} — {version.version}</span>
        <div className="flex gap-3 text-xs">
          <span className="text-green-400 font-semibold">+{version.linesAdded}</span>
          <span className="text-red-400 font-semibold">−{version.linesRemoved}</span>
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
            <span className="text-red-600 select-none w-3">−</span>
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
// Page
// ---------------------------------------------------------------------------

export default function WorkflowsPage() {
  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>(PLACEHOLDER_WORKFLOW_RULES);
  const [policyRules, setPolicyRules] = useState<PolicyRule[]>(PLACEHOLDER_POLICY_RULES);
  const [versions] = useState<RuleVersion[]>(PLACEHOLDER_VERSIONS);
  const [activeTab, setActiveTab] = useState<'workflows' | 'policies' | 'versions'>('workflows');
  const [selectedVersionId, setSelectedVersionId] = useState<string>(PLACEHOLDER_VERSIONS[0].id);
  const [deployedMsg, setDeployedMsg] = useState<string | null>(null);

  const activeWorkflows = workflowRules.filter((r) => r.active).length;
  const activePolicies  = policyRules.filter((r) => r.active).length;
  const prodVersions    = versions.filter((v) => v.stage === 'production').length;
  const pendingVersions = versions.filter((v) => v.stage !== 'production').length;

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
    setDeployedMsg(`${version.version} promoted to Production.`);
    setTimeout(() => setDeployedMsg(null), 3500);
  }

  function handleRollback(version: RuleVersion) {
    setDeployedMsg(`Rollback initiated for ${version.ruleset}.`);
    setTimeout(() => setDeployedMsg(null), 3500);
  }

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? versions[0];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflow & Policy Builder</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {workflowRules.length} workflow rules · {policyRules.length} policy rules
          </p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-sm font-semibold text-black transition-colors">
          + New Rule
        </button>
      </div>

      {/* Toast notification */}
      {deployedMsg && (
        <div className="mb-4 rounded-lg border border-green-700 bg-green-950 text-green-300 text-sm font-semibold px-4 py-2.5 flex items-center gap-2">
          <span className="text-green-400">✓</span>
          {deployedMsg}
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
        {(['workflows', 'policies', 'versions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-yellow-500 text-yellow-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab === 'workflows' ? 'Workflow Rules' : tab === 'policies' ? 'Policy Rules' : 'Versions & Deploy'}
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
            {workflowRules.map((rule) => (
              <WorkflowRuleCard
                key={rule.id}
                rule={rule}
                onToggleActive={handleToggleWorkflow}
              />
            ))}
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
                <p className="text-xs text-gray-400">{selectedVersion.ruleset} · by {selectedVersion.author}</p>
                <p className="text-xs text-gray-500">{formatDateTime(selectedVersion.createdAt)}</p>
              </div>

              {/* Deploy / Rollback */}
              <div className="flex gap-2 shrink-0">
                {selectedVersion.stage !== 'production' && (
                  <button
                    onClick={() => handleDeploy(selectedVersion)}
                    className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-xs font-semibold text-white transition-colors"
                  >
                    Deploy to Prod
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
                {selectedVersion.stage === 'staging' && (
                  <button
                    onClick={() => handleRollback(selectedVersion)}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-semibold text-gray-200 transition-colors"
                  >
                    Rollback Staging
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
                <span className="text-red-400 font-semibold">−{selectedVersion.linesRemoved}</span> lines removed
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
