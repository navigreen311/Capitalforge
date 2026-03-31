'use client';

// ============================================================
// /data-lineage — Data Lineage
// Visual lineage nodes (source→transform→output), field
// search, change detection alerts, snapshot management.
// ============================================================

import { useState } from 'react';

// ─── Mock data ────────────────────────────────────────────────────────────────

interface LineageNode {
  id: string;
  label: string;
  type: 'source' | 'transform' | 'output';
  description: string;
  fields: string[];
  updatedAt: string;
}

interface LineageEdge {
  from: string;
  to: string;
}

interface ChangeAlert {
  id: string;
  field: string;
  source: string;
  changeType: 'Schema Change' | 'Value Drift' | 'Null Spike' | 'Format Change';
  severity: 'Critical' | 'Warning' | 'Info';
  detectedAt: string;
  status: 'Open' | 'Acknowledged' | 'Resolved';
}

interface Snapshot {
  id: string;
  name: string;
  takenAt: string;
  nodes: number;
  fields: number;
  hash: string;
}

const NODES: LineageNode[] = [
  { id: 'src-crm',    label: 'CRM Database',         type: 'source',    description: 'Salesforce CRM client records', fields: ['client_id', 'name', 'fico', 'industry', 'revenue', 'created_at'], updatedAt: '2026-03-31 08:14' },
  { id: 'src-bureau', label: 'Credit Bureau Feed',   type: 'source',    description: 'Experian / TransUnion live feed', fields: ['ssn_hash', 'fico_score', 'inquiry_count', 'utilization', 'age_oldest_acct'], updatedAt: '2026-03-31 06:00' },
  { id: 'src-bank',   label: 'Bank Statement API',   type: 'source',    description: 'Plaid bank account aggregation', fields: ['account_id', 'balance', 'avg_monthly_revenue', 'nsf_count', 'months_data'], updatedAt: '2026-03-31 07:45' },
  { id: 'tx-enrich',  label: 'Profile Enrichment',   type: 'transform', description: 'Joins CRM + bureau, adds computed fields', fields: ['enriched_fico', 'dti_ratio', 'risk_tier', 'approval_probability'], updatedAt: '2026-03-31 08:20' },
  { id: 'tx-score',   label: 'Scoring Engine',       type: 'transform', description: 'ML model v2.4 — CatBoost ensemble', fields: ['score_v2', 'confidence', 'feature_importance_json', 'model_version'], updatedAt: '2026-03-31 08:22' },
  { id: 'tx-match',   label: 'Product Matcher',      type: 'transform', description: 'Maps score to issuer card eligibility', fields: ['card_recommendations', 'max_limit_estimate', 'round_sequence'], updatedAt: '2026-03-31 08:25' },
  { id: 'out-api',    label: 'Advisor API',          type: 'output',    description: 'REST API serving advisor dashboard', fields: ['client_profile', 'recommendations', 'approval_probability'], updatedAt: '2026-03-31 08:26' },
  { id: 'out-dw',     label: 'Data Warehouse',       type: 'output',    description: 'Snowflake analytics warehouse', fields: ['all enriched fields', 'audit_trail', 'model_outputs'], updatedAt: '2026-03-31 08:26' },
  { id: 'out-report', label: 'Compliance Reports',   type: 'output',    description: 'ECOA / FCRA automated reporting', fields: ['adverse_action', 'fair_lending_flags', 'regulatory_id'], updatedAt: '2026-03-31 08:27' },
];

const EDGES: LineageEdge[] = [
  { from: 'src-crm',    to: 'tx-enrich'  },
  { from: 'src-bureau', to: 'tx-enrich'  },
  { from: 'src-bank',   to: 'tx-enrich'  },
  { from: 'tx-enrich',  to: 'tx-score'   },
  { from: 'tx-score',   to: 'tx-match'   },
  { from: 'tx-match',   to: 'out-api'    },
  { from: 'tx-match',   to: 'out-dw'     },
  { from: 'tx-enrich',  to: 'out-dw'     },
  { from: 'tx-score',   to: 'out-report' },
];

const CHANGE_ALERTS: ChangeAlert[] = [
  { id: 'ca-001', field: 'fico_score',        source: 'Credit Bureau Feed',  changeType: 'Value Drift',    severity: 'Warning',  detectedAt: '2026-03-31 06:12', status: 'Open' },
  { id: 'ca-002', field: 'avg_monthly_revenue', source: 'Bank Statement API', changeType: 'Null Spike',     severity: 'Critical', detectedAt: '2026-03-31 07:55', status: 'Open' },
  { id: 'ca-003', field: 'inquiry_count',     source: 'Credit Bureau Feed',  changeType: 'Schema Change',  severity: 'Critical', detectedAt: '2026-03-30 14:22', status: 'Acknowledged' },
  { id: 'ca-004', field: 'industry',          source: 'CRM Database',        changeType: 'Format Change',  severity: 'Info',     detectedAt: '2026-03-29 09:44', status: 'Resolved' },
  { id: 'ca-005', field: 'nsf_count',         source: 'Bank Statement API',  changeType: 'Value Drift',    severity: 'Warning',  detectedAt: '2026-03-28 16:30', status: 'Acknowledged' },
];

const SNAPSHOTS: Snapshot[] = [
  { id: 'snap-001', name: 'Pre-v2.4 Model Deploy',  takenAt: '2026-03-28 10:00', nodes: 9, fields: 42, hash: 'a1b2c3d4' },
  { id: 'snap-002', name: 'Post-v2.4 Model Deploy', takenAt: '2026-03-29 14:15', nodes: 9, fields: 44, hash: 'e5f6g7h8' },
  { id: 'snap-003', name: 'Bureau Schema Change',   takenAt: '2026-03-30 14:25', nodes: 9, fields: 43, hash: 'i9j0k1l2' },
  { id: 'snap-004', name: 'Q1 2026 Baseline',       takenAt: '2026-03-31 08:30', nodes: 9, fields: 43, hash: 'm3n4o5p6' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nodeColor(type: LineageNode['type']): { bg: string; border: string; label: string } {
  if (type === 'source')    return { bg: 'bg-blue-900/40',    border: 'border-blue-700',    label: 'Source'    };
  if (type === 'transform') return { bg: 'bg-[#0A1628]',      border: 'border-[#C9A84C]/50', label: 'Transform' };
  return                           { bg: 'bg-emerald-900/40', border: 'border-emerald-700', label: 'Output'    };
}

function severityBadge(s: ChangeAlert['severity']): string {
  if (s === 'Critical') return 'bg-red-900/50 text-red-300 border border-red-700';
  if (s === 'Warning')  return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
  return 'bg-blue-900/50 text-blue-300 border border-blue-700';
}

function statusBadge(s: ChangeAlert['status']): string {
  if (s === 'Open')         return 'bg-red-900/40 text-red-300';
  if (s === 'Acknowledged') return 'bg-yellow-900/40 text-yellow-300';
  return 'bg-emerald-900/40 text-emerald-300';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LineageGraph({ search }: { search: string }) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const byType = (type: LineageNode['type']) =>
    NODES.filter((n) => n.type === type && (
      search === '' ||
      n.label.toLowerCase().includes(search.toLowerCase()) ||
      n.fields.some((f) => f.toLowerCase().includes(search.toLowerCase()))
    ));

  const sources    = byType('source');
  const transforms = byType('transform');
  const outputs    = byType('output');

  const selected = NODES.find((n) => n.id === selectedNode);

  return (
    <div className="space-y-4">
      {/* Visual graph columns */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 overflow-x-auto">
        <div className="flex gap-8 min-w-[700px]">
          {[
            { label: 'Sources',    nodes: sources    },
            { label: 'Transforms', nodes: transforms },
            { label: 'Outputs',    nodes: outputs    },
          ].map(({ label, nodes }, colIdx) => (
            <div key={label} className="flex-1 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
              {nodes.map((node) => {
                const style = nodeColor(node.type);
                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                    className={`rounded-lg border p-3 cursor-pointer transition-all ${style.bg} ${style.border} ${
                      selectedNode === node.id ? 'ring-2 ring-[#C9A84C]' : 'hover:ring-1 hover:ring-gray-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-gray-100 leading-tight">{node.label}</p>
                      <span className="text-[9px] font-medium text-gray-500 uppercase tracking-wide flex-shrink-0">{style.label}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">{node.fields.length} fields</p>
                  </div>
                );
              })}
              {/* Arrow connector between columns */}
              {colIdx < 2 && (
                <div className="absolute hidden" aria-hidden />
              )}
            </div>
          ))}
        </div>

        {/* Edge summary */}
        <p className="text-[10px] text-gray-600 mt-4">
          {EDGES.length} lineage edges mapped — Placeholder: render with D3 / ReactFlow at /api/lineage/graph
        </p>
      </div>

      {/* Selected node detail */}
      {selected && (
        <div className="rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/5 p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-100">{selected.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{selected.description}</p>
            </div>
            <span className="text-[10px] text-gray-500">Updated {selected.updatedAt}</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Fields</p>
            <div className="flex flex-wrap gap-1.5">
              {selected.fields.map((f) => (
                <span key={f} className="text-[10px] font-mono bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded">
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">Upstream edges</p>
            <div className="flex flex-wrap gap-1.5">
              {EDGES.filter((e) => e.to === selected.id).map((e) => (
                <span key={e.from} className="text-[10px] text-blue-300 bg-blue-900/30 border border-blue-800 px-2 py-0.5 rounded">
                  {NODES.find((n) => n.id === e.from)?.label}
                </span>
              ))}
              {EDGES.filter((e) => e.to === selected.id).length === 0 && (
                <span className="text-[10px] text-gray-600">No upstream sources</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">Downstream edges</p>
            <div className="flex flex-wrap gap-1.5">
              {EDGES.filter((e) => e.from === selected.id).map((e) => (
                <span key={e.to} className="text-[10px] text-emerald-300 bg-emerald-900/30 border border-emerald-800 px-2 py-0.5 rounded">
                  {NODES.find((n) => n.id === e.to)?.label}
                </span>
              ))}
              {EDGES.filter((e) => e.from === selected.id).length === 0 && (
                <span className="text-[10px] text-gray-600">No downstream outputs</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeAlertsTable() {
  const [filter, setFilter] = useState<'All' | 'Open' | 'Acknowledged' | 'Resolved'>('All');

  const filtered = CHANGE_ALERTS.filter((a) => filter === 'All' || a.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-200">Change Detection Alerts</h3>
        <div className="flex gap-1.5">
          {(['All', 'Open', 'Acknowledged', 'Resolved'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filter === s ? 'bg-[#C9A84C] text-[#0A1628]' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">Field</th>
              <th className="px-4 py-3 text-left font-semibold">Source</th>
              <th className="px-4 py-3 text-left font-semibold">Change Type</th>
              <th className="px-4 py-3 text-left font-semibold">Severity</th>
              <th className="px-4 py-3 text-left font-semibold">Detected</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((alert) => (
              <tr key={alert.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                <td className="px-4 py-3 font-mono text-[11px] text-gray-200">{alert.field}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{alert.source}</td>
                <td className="px-4 py-3 text-gray-300 text-xs">{alert.changeType}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${severityBadge(alert.severity)}`}>
                    {alert.severity}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">{alert.detectedAt}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(alert.status)}`}>
                    {alert.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SnapshotManager() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-200">Snapshot Management</h3>
        <button className="px-4 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-xs font-semibold transition-colors">
          Take Snapshot
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SNAPSHOTS.map((snap) => (
          <div
            key={snap.id}
            onClick={() => setSelected(selected === snap.id ? null : snap.id)}
            className={`rounded-xl border p-4 cursor-pointer transition-all ${
              selected === snap.id
                ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                : 'border-gray-800 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-gray-100">{snap.name}</p>
              <button className="text-[10px] text-[#C9A84C] hover:underline flex-shrink-0">Restore</button>
            </div>
            <p className="text-xs text-gray-500 mt-1">{snap.takenAt}</p>
            <div className="flex gap-4 mt-2 text-xs text-gray-400 tabular-nums">
              <span>{snap.nodes} nodes</span>
              <span>{snap.fields} fields</span>
              <span className="font-mono text-[10px]">#{snap.hash}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-600">Placeholder — connect to /api/lineage/snapshots</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataLineagePage() {
  const [search, setSearch] = useState('');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Lineage</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Trace field origins, monitor schema changes, and manage pipeline snapshots.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Export Graph
          </button>
          <button className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
            Refresh Lineage
          </button>
        </div>
      </div>

      {/* ── Field Search ────────────────────────────────────────── */}
      <div className="max-w-md">
        <input
          type="text"
          placeholder="Search fields, nodes, or sources…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
        />
      </div>

      {/* ── Lineage Graph ────────────────────────────────────────── */}
      <section aria-label="Lineage Graph">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Pipeline Graph — Source → Transform → Output
        </h2>
        <LineageGraph search={search} />
      </section>

      {/* ── Change Alerts ───────────────────────────────────────── */}
      <section aria-label="Change Alerts">
        <ChangeAlertsTable />
      </section>

      {/* ── Snapshots ───────────────────────────────────────────── */}
      <section aria-label="Snapshots">
        <SnapshotManager />
      </section>

    </div>
  );
}
