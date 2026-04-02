'use client';

// ============================================================
// /data-lineage — Data Lineage
// Visual lineage graph (HTML/CSS), node detail drawer, change
// detection alerts with actions, snapshot management, search,
// export, and refresh.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FieldDetail {
  name: string;
  type: string;
  nullable: boolean;
  lastUpdated: string;
  origin: string;
  pctNonNull: number;
}

interface LineageNode {
  id: string;
  label: string;
  type: 'source' | 'transform' | 'output';
  description: string;
  fields: FieldDetail[];
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
  acknowledgeNotes?: string;
  resolveMethod?: string;
}

interface PipelineSnapshot {
  id: string;
  label: string;
  createdBy: string;
  createdAt: string;
  nodes: number;
  edges: number;
  notes?: string;
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const INITIAL_NODES: LineageNode[] = [
  {
    id: 'src-crm', label: 'CRM Database', type: 'source',
    description: 'Salesforce CRM client records', updatedAt: '2026-03-31 08:14',
    fields: [
      { name: 'client_id', type: 'UUID', nullable: false, lastUpdated: '2026-03-31', origin: 'CRM', pctNonNull: 100 },
      { name: 'name', type: 'VARCHAR(255)', nullable: false, lastUpdated: '2026-03-31', origin: 'CRM', pctNonNull: 99.8 },
      { name: 'fico', type: 'INT', nullable: true, lastUpdated: '2026-03-30', origin: 'CRM', pctNonNull: 94.2 },
      { name: 'industry', type: 'VARCHAR(100)', nullable: true, lastUpdated: '2026-03-29', origin: 'CRM', pctNonNull: 97.1 },
      { name: 'revenue', type: 'DECIMAL(15,2)', nullable: true, lastUpdated: '2026-03-31', origin: 'CRM', pctNonNull: 96.5 },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false, lastUpdated: '2026-03-31', origin: 'CRM', pctNonNull: 100 },
    ],
  },
  {
    id: 'src-bureau', label: 'Credit Bureau Feed', type: 'source',
    description: 'Experian / TransUnion live feed', updatedAt: '2026-03-31 06:00',
    fields: [
      { name: 'ssn_hash', type: 'CHAR(64)', nullable: false, lastUpdated: '2026-03-31', origin: 'Bureau', pctNonNull: 100 },
      { name: 'fico_score', type: 'INT', nullable: false, lastUpdated: '2026-03-31', origin: 'Bureau', pctNonNull: 99.9 },
      { name: 'inquiry_count', type: 'INT', nullable: true, lastUpdated: '2026-03-30', origin: 'Bureau', pctNonNull: 98.3 },
      { name: 'utilization', type: 'DECIMAL(5,2)', nullable: true, lastUpdated: '2026-03-31', origin: 'Bureau', pctNonNull: 97.6 },
      { name: 'age_oldest_acct', type: 'INT', nullable: true, lastUpdated: '2026-03-31', origin: 'Bureau', pctNonNull: 93.1 },
    ],
  },
  {
    id: 'src-bank', label: 'Bank Statement API', type: 'source',
    description: 'Plaid bank account aggregation', updatedAt: '2026-03-31 07:45',
    fields: [
      { name: 'account_id', type: 'UUID', nullable: false, lastUpdated: '2026-03-31', origin: 'Plaid', pctNonNull: 100 },
      { name: 'balance', type: 'DECIMAL(15,2)', nullable: false, lastUpdated: '2026-03-31', origin: 'Plaid', pctNonNull: 100 },
      { name: 'avg_monthly_revenue', type: 'DECIMAL(15,2)', nullable: true, lastUpdated: '2026-03-31', origin: 'Plaid', pctNonNull: 91.4 },
      { name: 'nsf_count', type: 'INT', nullable: true, lastUpdated: '2026-03-31', origin: 'Plaid', pctNonNull: 96.8 },
      { name: 'months_data', type: 'INT', nullable: true, lastUpdated: '2026-03-31', origin: 'Plaid', pctNonNull: 98.2 },
    ],
  },
  {
    id: 'tx-enrich', label: 'Profile Enrichment', type: 'transform',
    description: 'Joins CRM + bureau, adds computed fields', updatedAt: '2026-03-31 08:20',
    fields: [
      { name: 'enriched_fico', type: 'INT', nullable: true, lastUpdated: '2026-03-31', origin: 'Computed', pctNonNull: 98.7 },
      { name: 'dti_ratio', type: 'DECIMAL(5,4)', nullable: true, lastUpdated: '2026-03-31', origin: 'Computed', pctNonNull: 95.3 },
      { name: 'risk_tier', type: 'VARCHAR(20)', nullable: false, lastUpdated: '2026-03-31', origin: 'Computed', pctNonNull: 100 },
      { name: 'approval_probability', type: 'DECIMAL(5,4)', nullable: true, lastUpdated: '2026-03-31', origin: 'Computed', pctNonNull: 97.9 },
    ],
  },
  {
    id: 'tx-score', label: 'Scoring Engine', type: 'transform',
    description: 'ML model v2.4 — CatBoost ensemble', updatedAt: '2026-03-31 08:22',
    fields: [
      { name: 'score_v2', type: 'DECIMAL(7,4)', nullable: false, lastUpdated: '2026-03-31', origin: 'Model', pctNonNull: 100 },
      { name: 'confidence', type: 'DECIMAL(5,4)', nullable: false, lastUpdated: '2026-03-31', origin: 'Model', pctNonNull: 100 },
      { name: 'feature_importance_json', type: 'JSONB', nullable: true, lastUpdated: '2026-03-31', origin: 'Model', pctNonNull: 99.1 },
      { name: 'model_version', type: 'VARCHAR(20)', nullable: false, lastUpdated: '2026-03-31', origin: 'Model', pctNonNull: 100 },
    ],
  },
  {
    id: 'tx-match', label: 'Product Matcher', type: 'transform',
    description: 'Maps score to issuer card eligibility', updatedAt: '2026-03-31 08:25',
    fields: [
      { name: 'card_recommendations', type: 'JSONB', nullable: true, lastUpdated: '2026-03-31', origin: 'Matcher', pctNonNull: 96.4 },
      { name: 'max_limit_estimate', type: 'DECIMAL(12,2)', nullable: true, lastUpdated: '2026-03-31', origin: 'Matcher', pctNonNull: 94.8 },
      { name: 'round_sequence', type: 'INT', nullable: false, lastUpdated: '2026-03-31', origin: 'Matcher', pctNonNull: 100 },
    ],
  },
  {
    id: 'out-api', label: 'Advisor API', type: 'output',
    description: 'REST API serving advisor dashboard', updatedAt: '2026-03-31 08:26',
    fields: [
      { name: 'client_profile', type: 'JSONB', nullable: false, lastUpdated: '2026-03-31', origin: 'API', pctNonNull: 100 },
      { name: 'recommendations', type: 'JSONB', nullable: true, lastUpdated: '2026-03-31', origin: 'API', pctNonNull: 98.5 },
      { name: 'approval_probability', type: 'DECIMAL(5,4)', nullable: true, lastUpdated: '2026-03-31', origin: 'API', pctNonNull: 97.9 },
    ],
  },
  {
    id: 'out-dw', label: 'Data Warehouse', type: 'output',
    description: 'Snowflake analytics warehouse', updatedAt: '2026-03-31 08:26',
    fields: [
      { name: 'all_enriched_fields', type: 'JSONB', nullable: false, lastUpdated: '2026-03-31', origin: 'Warehouse', pctNonNull: 100 },
      { name: 'audit_trail', type: 'JSONB', nullable: false, lastUpdated: '2026-03-31', origin: 'Warehouse', pctNonNull: 100 },
      { name: 'model_outputs', type: 'JSONB', nullable: true, lastUpdated: '2026-03-31', origin: 'Warehouse', pctNonNull: 99.7 },
    ],
  },
  {
    id: 'out-report', label: 'Compliance Reports', type: 'output',
    description: 'ECOA / FCRA automated reporting', updatedAt: '2026-03-31 08:27',
    fields: [
      { name: 'adverse_action', type: 'JSONB', nullable: true, lastUpdated: '2026-03-31', origin: 'Compliance', pctNonNull: 88.2 },
      { name: 'fair_lending_flags', type: 'BOOLEAN[]', nullable: true, lastUpdated: '2026-03-31', origin: 'Compliance', pctNonNull: 92.4 },
      { name: 'regulatory_id', type: 'VARCHAR(50)', nullable: false, lastUpdated: '2026-03-31', origin: 'Compliance', pctNonNull: 100 },
    ],
  },
];

const INITIAL_EDGES: LineageEdge[] = [
  { from: 'src-crm', to: 'tx-enrich' },
  { from: 'src-bureau', to: 'tx-enrich' },
  { from: 'src-bank', to: 'tx-enrich' },
  { from: 'tx-enrich', to: 'tx-score' },
  { from: 'tx-score', to: 'tx-match' },
  { from: 'tx-match', to: 'out-api' },
  { from: 'tx-match', to: 'out-dw' },
  { from: 'tx-enrich', to: 'out-dw' },
  { from: 'tx-score', to: 'out-report' },
];

const INITIAL_ALERTS: ChangeAlert[] = [
  { id: 'ca-001', field: 'fico_score', source: 'Credit Bureau Feed', changeType: 'Value Drift', severity: 'Warning', detectedAt: '2026-03-31 06:12', status: 'Open' },
  { id: 'ca-002', field: 'avg_monthly_revenue', source: 'Bank Statement API', changeType: 'Null Spike', severity: 'Critical', detectedAt: '2026-03-31 07:55', status: 'Open' },
  { id: 'ca-003', field: 'inquiry_count', source: 'Credit Bureau Feed', changeType: 'Schema Change', severity: 'Critical', detectedAt: '2026-03-30 14:22', status: 'Acknowledged' },
  { id: 'ca-004', field: 'industry', source: 'CRM Database', changeType: 'Format Change', severity: 'Info', detectedAt: '2026-03-29 09:44', status: 'Resolved' },
  { id: 'ca-005', field: 'nsf_count', source: 'Bank Statement API', changeType: 'Value Drift', severity: 'Warning', detectedAt: '2026-03-28 16:30', status: 'Acknowledged' },
];

const INITIAL_SNAPSHOTS: PipelineSnapshot[] = [
  { id: 'snap-001', label: 'Pre-v2.4 Model Deploy', createdBy: 'Sarah Chen', createdAt: '2026-03-28 10:00', nodes: 9, edges: 9, notes: 'Baseline before model upgrade' },
  { id: 'snap-002', label: 'Post-v2.4 Model Deploy', createdBy: 'Alex Rivera', createdAt: '2026-03-29 14:15', nodes: 9, edges: 9, notes: 'After CatBoost v2.4 rollout' },
  { id: 'snap-003', label: 'Bureau Schema Change', createdBy: 'System', createdAt: '2026-03-30 14:25', nodes: 9, edges: 9, notes: 'Auto-captured on schema drift' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nodeColor(type: LineageNode['type']): { bg: string; border: string; label: string; textColor: string; badgeBg: string } {
  if (type === 'source') return { bg: 'bg-blue-900/40', border: 'border-blue-700', label: 'Source', textColor: 'text-blue-300', badgeBg: 'bg-blue-800/60' };
  if (type === 'transform') return { bg: 'bg-purple-900/40', border: 'border-purple-700', label: 'Transform', textColor: 'text-purple-300', badgeBg: 'bg-purple-800/60' };
  return { bg: 'bg-teal-900/40', border: 'border-teal-700', label: 'Output', textColor: 'text-teal-300', badgeBg: 'bg-teal-800/60' };
}

function severityBadge(s: ChangeAlert['severity']): string {
  if (s === 'Critical') return 'bg-red-900/50 text-red-300 border border-red-700';
  if (s === 'Warning') return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
  return 'bg-blue-900/50 text-blue-300 border border-blue-700';
}

function statusBadge(s: ChangeAlert['status']): string {
  if (s === 'Open') return 'bg-red-900/40 text-red-300';
  if (s === 'Acknowledged') return 'bg-yellow-900/40 text-yellow-300';
  return 'bg-emerald-900/40 text-emerald-300';
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

// ─── Toast component ─────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-emerald-900/90 border border-emerald-700 text-emerald-100 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium animate-in flex items-center gap-3">
      <span className="text-emerald-400">&#10003;</span>
      {message}
      <button onClick={onClose} className="ml-2 text-emerald-400 hover:text-white text-lg leading-none">&times;</button>
    </div>
  );
}

// ─── Modal component ─────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Node Detail Drawer ─────────────────────────────────────────────────────

function NodeDrawer({ node, onClose }: { node: LineageNode; onClose: () => void }) {
  const style = nodeColor(node.type);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[560px] max-w-full h-full bg-gray-950 border-l border-gray-800 overflow-y-auto shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-gray-950 border-b border-gray-800 p-5 z-10">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{node.label}</h2>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${style.badgeBg} ${style.textColor}`}>
                  {style.label}
                </span>
              </div>
              <p className="text-xs text-gray-400">{node.description}</p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{node.fields.length} fields</span>
                <span>Updated {node.updatedAt}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none p-1">&times;</button>
          </div>
        </div>

        {/* Fields table */}
        <div className="p-5 space-y-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fields</h3>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-900 text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Nullable</th>
                  <th className="px-3 py-2 text-left font-semibold">Updated</th>
                  <th className="px-3 py-2 text-left font-semibold">Origin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {node.fields.map((f) => (
                  <tr key={f.name} className="bg-gray-950 hover:bg-gray-900">
                    <td className="px-3 py-2 font-mono text-gray-200">{f.name}</td>
                    <td className="px-3 py-2 text-gray-400">{f.type}</td>
                    <td className="px-3 py-2 text-gray-400">{f.nullable ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 text-gray-500 tabular-nums">{f.lastUpdated}</td>
                    <td className="px-3 py-2 text-gray-400">{f.origin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Data quality */}
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-6">Data Quality (% Non-Null)</h3>
          <div className="space-y-2">
            {node.fields.map((f) => {
              const isAmber = f.pctNonNull < 95;
              return (
                <div key={f.name} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-300 w-40 truncate">{f.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isAmber ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${f.pctNonNull}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold tabular-nums w-14 text-right ${isAmber ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {f.pctNonNull}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CSS Graph with edges ────────────────────────────────────────────────────

function LineageGraph({
  nodes,
  edges,
  search,
  selectedNode,
  onSelectNode,
  refreshing,
}: {
  nodes: LineageNode[];
  edges: LineageEdge[];
  search: string;
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  refreshing: boolean;
}) {
  const sources = nodes.filter((n) => n.type === 'source');
  const transforms = nodes.filter((n) => n.type === 'transform');
  const outputs = nodes.filter((n) => n.type === 'output');

  const isMatch = (node: LineageNode) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return node.label.toLowerCase().includes(s) || node.fields.some((f) => f.name.toLowerCase().includes(s));
  };

  // Edge drawing helpers — we position nodes in a 3-col grid, each column ~33%.
  // Edges are drawn as SVG lines overlaid on the graph.
  const graphRef = useRef<HTMLDivElement>(null);
  const [nodeRects, setNodeRects] = useState<Record<string, DOMRect>>({});

  const measureNodes = useCallback(() => {
    if (!graphRef.current) return;
    const container = graphRef.current.getBoundingClientRect();
    const rects: Record<string, DOMRect> = {};
    graphRef.current.querySelectorAll('[data-node-id]').forEach((el) => {
      const id = el.getAttribute('data-node-id')!;
      const r = el.getBoundingClientRect();
      rects[id] = new DOMRect(r.x - container.x, r.y - container.y, r.width, r.height);
    });
    setNodeRects(rects);
  }, []);

  useEffect(() => {
    measureNodes();
    window.addEventListener('resize', measureNodes);
    return () => window.removeEventListener('resize', measureNodes);
  }, [measureNodes, nodes]);

  // Re-measure once after initial render
  useEffect(() => {
    const t = setTimeout(measureNodes, 100);
    return () => clearTimeout(t);
  }, [measureNodes]);

  const columns = [
    { label: 'Sources', color: 'text-blue-400', nodes: sources },
    { label: 'Transforms', color: 'text-purple-400', nodes: transforms },
    { label: 'Outputs', color: 'text-teal-400', nodes: outputs },
  ];

  return (
    <div className="relative rounded-xl border border-gray-800 bg-gray-900 p-6 overflow-hidden">
      {/* Refreshing overlay */}
      {refreshing && (
        <div className="absolute inset-0 z-20 bg-gray-900/80 flex items-center justify-center rounded-xl">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-300">Refreshing lineage data...</span>
          </div>
        </div>
      )}

      <div ref={graphRef} className="relative min-h-[320px]">
        {/* SVG edges overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ overflow: 'visible' }}>
          {edges.map((edge) => {
            const fromRect = nodeRects[edge.from];
            const toRect = nodeRects[edge.to];
            if (!fromRect || !toRect) return null;
            const x1 = fromRect.x + fromRect.width;
            const y1 = fromRect.y + fromRect.height / 2;
            const x2 = toRect.x;
            const y2 = toRect.y + toRect.height / 2;
            const cx1 = x1 + (x2 - x1) * 0.4;
            const cx2 = x2 - (x2 - x1) * 0.4;
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                stroke="rgba(201,168,76,0.35)"
                strokeWidth="2"
                fill="none"
                markerEnd="url(#arrowhead)"
              />
            );
          })}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="rgba(201,168,76,0.5)" />
            </marker>
          </defs>
        </svg>

        {/* 3-column layout */}
        <div className="flex gap-8 relative z-0">
          {columns.map(({ label, color, nodes: colNodes }) => (
            <div key={label} className="flex-1 space-y-3">
              <p className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</p>
              <div className="space-y-3">
                {colNodes.map((node) => {
                  const style = nodeColor(node.type);
                  const matched = isMatch(node);
                  const isSelected = selectedNode === node.id;
                  return (
                    <div
                      key={node.id}
                      data-node-id={node.id}
                      onClick={() => onSelectNode(isSelected ? null : node.id)}
                      className={`rounded-lg border p-3 cursor-pointer transition-all ${style.bg} ${style.border} ${
                        isSelected ? 'ring-2 ring-[#C9A84C]' : 'hover:ring-1 hover:ring-gray-600'
                      } ${search && matched ? 'ring-2 ring-yellow-500/70 shadow-lg shadow-yellow-500/10' : ''} ${
                        search && !matched ? 'opacity-30' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-gray-100 leading-tight">{node.label}</p>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${style.badgeBg} ${style.textColor}`}>
                          {style.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-gray-500">{node.fields.length} fields</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${style.badgeBg} ${style.textColor}`}>
                          {node.fields.length}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edge summary */}
      <p className="text-[10px] text-gray-600 mt-4">
        {edges.length} lineage edges mapped across {nodes.length} nodes
      </p>
    </div>
  );
}

// ─── Change Alerts Table ─────────────────────────────────────────────────────

function ChangeAlertsTable({
  alerts,
  onUpdateAlert,
  search,
  showToast,
}: {
  alerts: ChangeAlert[];
  onUpdateAlert: (id: string, updates: Partial<ChangeAlert>) => void;
  search: string;
  showToast: (msg: string) => void;
}) {
  const [filter, setFilter] = useState<'All' | 'Open' | 'Acknowledged' | 'Resolved'>('All');
  const [ackModal, setAckModal] = useState<string | null>(null);
  const [resolveModal, setResolveModal] = useState<string | null>(null);
  const [ackNotes, setAckNotes] = useState('');
  const [resolveMethod, setResolveMethod] = useState('Schema updated');

  const filtered = alerts.filter((a) => {
    const statusMatch = filter === 'All' || a.status === filter;
    if (!search) return statusMatch;
    const s = search.toLowerCase();
    const textMatch = a.field.toLowerCase().includes(s) || a.source.toLowerCase().includes(s) || a.changeType.toLowerCase().includes(s);
    return statusMatch && textMatch;
  });

  const handleAcknowledge = () => {
    if (!ackModal || !ackNotes.trim()) return;
    onUpdateAlert(ackModal, { status: 'Acknowledged', acknowledgeNotes: ackNotes.trim() });
    showToast(`Alert acknowledged: ${alerts.find((a) => a.id === ackModal)?.field}`);
    setAckModal(null);
    setAckNotes('');
  };

  const handleResolve = () => {
    if (!resolveModal) return;
    onUpdateAlert(resolveModal, { status: 'Resolved', resolveMethod });
    showToast(`Alert resolved: ${alerts.find((a) => a.id === resolveModal)?.field}`);
    setResolveModal(null);
    setResolveMethod('Schema updated');
  };

  const handleEscalate = (alert: ChangeAlert) => {
    showToast(`Escalated: ${alert.field} (${alert.severity}) — Ops team notified`);
  };

  return (
    <div className="space-y-3">
      {/* Acknowledge modal */}
      {ackModal && (
        <Modal title="Acknowledge Alert" onClose={() => { setAckModal(null); setAckNotes(''); }}>
          <p className="text-xs text-gray-400">
            Acknowledging alert for <span className="font-mono text-gray-200">{alerts.find((a) => a.id === ackModal)?.field}</span>
          </p>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Notes (required)</label>
            <textarea
              value={ackNotes}
              onChange={(e) => setAckNotes(e.target.value)}
              placeholder="Describe the investigation or rationale..."
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] min-h-[80px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAckModal(null); setAckNotes(''); }} className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700">Cancel</button>
            <button
              onClick={handleAcknowledge}
              disabled={!ackNotes.trim()}
              className="px-4 py-2 rounded-lg bg-yellow-600 text-white text-xs font-semibold hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Acknowledge
            </button>
          </div>
        </Modal>
      )}

      {/* Resolve modal */}
      {resolveModal && (
        <Modal title="Resolve Alert" onClose={() => setResolveModal(null)}>
          <p className="text-xs text-gray-400">
            Resolving alert for <span className="font-mono text-gray-200">{alerts.find((a) => a.id === resolveModal)?.field}</span>
          </p>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Resolution method</label>
            <select
              value={resolveMethod}
              onChange={(e) => setResolveMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
            >
              <option>Schema updated</option>
              <option>Data corrected</option>
              <option>False positive</option>
              <option>Escalated</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setResolveModal(null)} className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700">Cancel</button>
            <button onClick={handleResolve} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">Resolve</button>
          </div>
        </Modal>
      )}

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
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
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
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    {alert.status === 'Open' && (
                      <>
                        <button
                          onClick={() => setAckModal(alert.id)}
                          className="px-2 py-1 rounded text-[10px] font-semibold bg-yellow-900/40 text-yellow-300 border border-yellow-800 hover:bg-yellow-900/60"
                        >
                          Acknowledge
                        </button>
                        {alert.severity === 'Critical' && (
                          <button
                            onClick={() => handleEscalate(alert)}
                            className="px-2 py-1 rounded text-[10px] font-semibold bg-red-900/40 text-red-300 border border-red-800 hover:bg-red-900/60"
                          >
                            Escalate
                          </button>
                        )}
                      </>
                    )}
                    {alert.status === 'Acknowledged' && (
                      <button
                        onClick={() => setResolveModal(alert.id)}
                        className="px-2 py-1 rounded text-[10px] font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/60"
                      >
                        Resolve
                      </button>
                    )}
                    {alert.status === 'Resolved' && (
                      <span className="text-[10px] text-gray-600">--</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-600 text-xs">No alerts match current filters</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Snapshot Manager ────────────────────────────────────────────────────────

function SnapshotManager({
  snapshots,
  onAddSnapshot,
  onDeleteSnapshot,
  nodes,
  edges,
  showToast,
}: {
  snapshots: PipelineSnapshot[];
  onAddSnapshot: (snap: PipelineSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  nodes: LineageNode[];
  edges: LineageEdge[];
  showToast: (msg: string) => void;
}) {
  const [createModal, setCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const handleCreate = () => {
    if (!newLabel.trim()) return;
    const snap: PipelineSnapshot = {
      id: `snap-${Date.now()}`,
      label: newLabel.trim(),
      createdBy: 'Current User',
      createdAt: formatDateTime(new Date()),
      nodes: nodes.length,
      edges: edges.length,
      notes: newNotes.trim() || undefined,
    };
    onAddSnapshot(snap);
    showToast(`Snapshot created: ${snap.label}`);
    setCreateModal(false);
    setNewLabel('');
    setNewNotes('');
  };

  const handleDownload = (snap: PipelineSnapshot) => {
    const data = {
      snapshot: snap,
      nodes: nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, fieldCount: n.fields.length })),
      edges,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `capitalforge-snapshot-${snap.id}-${formatDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded snapshot: ${snap.label}`);
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    const snap = snapshots.find((s) => s.id === deleteConfirm);
    onDeleteSnapshot(deleteConfirm);
    showToast(`Deleted snapshot: ${snap?.label}`);
    setDeleteConfirm(null);
  };

  // Mock diff data for compare
  const diffData = compareId ? {
    added: [{ type: 'node' as const, detail: 'Product Matcher v2 — added round_sequence field' }],
    removed: [{ type: 'edge' as const, detail: 'tx-enrich -> out-report (deprecated path)' }],
    modified: [
      { type: 'node' as const, detail: 'Credit Bureau Feed — field count changed 5 -> 6' },
      { type: 'edge' as const, detail: 'tx-score -> out-report — weight updated' },
    ],
  } : null;

  return (
    <div className="space-y-3">
      {/* Create modal */}
      {createModal && (
        <Modal title="Create Pipeline Snapshot" onClose={() => { setCreateModal(false); setNewLabel(''); setNewNotes(''); }}>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Label (required)</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g., Pre-deployment baseline"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Notes (optional)</label>
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Describe the reason for this snapshot..."
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] min-h-[60px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setCreateModal(false); setNewLabel(''); setNewNotes(''); }} className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={!newLabel.trim()}
              className="px-4 py-2 rounded-lg bg-[#C9A84C] text-[#0A1628] text-xs font-semibold hover:bg-[#b8933e] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create Snapshot
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <Modal title="Delete Snapshot" onClose={() => setDeleteConfirm(null)}>
          <p className="text-xs text-gray-400">
            Are you sure you want to delete <span className="text-gray-200 font-semibold">{snapshots.find((s) => s.id === deleteConfirm)?.label}</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700">Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500">Delete</button>
          </div>
        </Modal>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-200">Pipeline Snapshots</h3>
        <button
          onClick={() => setCreateModal(true)}
          className="px-4 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-xs font-semibold transition-colors"
        >
          + Create Snapshot
        </button>
      </div>

      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">Label</th>
              <th className="px-4 py-3 text-left font-semibold">Created By</th>
              <th className="px-4 py-3 text-left font-semibold">Created At</th>
              <th className="px-4 py-3 text-left font-semibold">Nodes</th>
              <th className="px-4 py-3 text-left font-semibold">Edges</th>
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {snapshots.map((snap) => (
              <tr key={snap.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-xs font-semibold text-gray-200">{snap.label}</p>
                  {snap.notes && <p className="text-[10px] text-gray-500 mt-0.5">{snap.notes}</p>}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{snap.createdBy}</td>
                <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">{snap.createdAt}</td>
                <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{snap.nodes}</td>
                <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{snap.edges}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setCompareId(compareId === snap.id ? null : snap.id)}
                      className="px-2 py-1 rounded text-[10px] font-semibold bg-purple-900/40 text-purple-300 border border-purple-800 hover:bg-purple-900/60"
                    >
                      Compare
                    </button>
                    <button
                      onClick={() => handleDownload(snap)}
                      className="px-2 py-1 rounded text-[10px] font-semibold bg-blue-900/40 text-blue-300 border border-blue-800 hover:bg-blue-900/60"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(snap.id)}
                      className="px-2 py-1 rounded text-[10px] font-semibold bg-red-900/40 text-red-300 border border-red-800 hover:bg-red-900/60"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Compare diff panel */}
      {compareId && diffData && (
        <div className="rounded-xl border border-purple-800/50 bg-purple-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
              Diff: {snapshots.find((s) => s.id === compareId)?.label} vs Current
            </h4>
            <button onClick={() => setCompareId(null)} className="text-gray-500 hover:text-gray-300 text-sm">&times;</button>
          </div>
          <div className="space-y-2">
            {diffData.added.map((d, i) => (
              <div key={`add-${i}`} className="flex items-start gap-2 text-xs">
                <span className="text-emerald-400 font-bold w-4 flex-shrink-0">+</span>
                <span className="bg-emerald-900/30 text-emerald-300 border border-emerald-800/50 rounded px-2 py-1 flex-1">
                  {d.detail}
                </span>
              </div>
            ))}
            {diffData.removed.map((d, i) => (
              <div key={`rem-${i}`} className="flex items-start gap-2 text-xs">
                <span className="text-red-400 font-bold w-4 flex-shrink-0">-</span>
                <span className="bg-red-900/30 text-red-300 border border-red-800/50 rounded px-2 py-1 flex-1">
                  {d.detail}
                </span>
              </div>
            ))}
            {diffData.modified.map((d, i) => (
              <div key={`mod-${i}`} className="flex items-start gap-2 text-xs">
                <span className="text-amber-400 font-bold w-4 flex-shrink-0">~</span>
                <span className="bg-amber-900/30 text-amber-300 border border-amber-800/50 rounded px-2 py-1 flex-1">
                  {d.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DataLineagePage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodes, setNodes] = useState<LineageNode[]>(INITIAL_NODES);
  const [edges] = useState<LineageEdge[]>(INITIAL_EDGES);
  const [alerts, setAlerts] = useState<ChangeAlert[]>(INITIAL_ALERTS);
  const [snapshots, setSnapshots] = useState<PipelineSnapshot[]>(INITIAL_SNAPSHOTS);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  // Search match counts
  const matchedNodes = debouncedSearch
    ? nodes.filter((n) => {
        const s = debouncedSearch.toLowerCase();
        return n.label.toLowerCase().includes(s) || n.fields.some((f) => f.name.toLowerCase().includes(s));
      }).length
    : nodes.length;

  const matchedAlerts = debouncedSearch
    ? alerts.filter((a) => {
        const s = debouncedSearch.toLowerCase();
        return a.field.toLowerCase().includes(s) || a.source.toLowerCase().includes(s) || a.changeType.toLowerCase().includes(s);
      }).length
    : alerts.length;

  // Export graph
  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      const data = {
        exportedAt: new Date().toISOString(),
        nodes: nodes.map((n) => ({
          id: n.id,
          label: n.label,
          type: n.type,
          description: n.description,
          fieldCount: n.fields.length,
          fields: n.fields.map((f) => ({ name: f.name, type: f.type, nullable: f.nullable, pctNonNull: f.pctNonNull })),
          updatedAt: n.updatedAt,
        })),
        edges,
        alerts: alerts.map((a) => ({ id: a.id, field: a.field, source: a.source, changeType: a.changeType, severity: a.severity, status: a.status })),
        stats: { totalNodes: nodes.length, totalEdges: edges.length, totalFields: nodes.reduce((acc, n) => acc + n.fields.length, 0) },
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `capitalforge-lineage-export-${formatDate(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExporting(false);
      showToast('Lineage graph exported successfully');
    }, 600);
  };

  // Refresh lineage
  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      // Update Credit Bureau to 6 fields
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === 'src-bureau') {
            const hasDelinquency = n.fields.some((f) => f.name === 'delinquency_flag');
            if (!hasDelinquency) {
              return {
                ...n,
                updatedAt: formatDateTime(new Date()),
                fields: [
                  ...n.fields,
                  { name: 'delinquency_flag', type: 'BOOLEAN', nullable: true, lastUpdated: formatDate(new Date()), origin: 'Bureau', pctNonNull: 91.3 },
                ],
              };
            }
          }
          return n;
        })
      );

      // Add new warning alert
      const newAlertId = `ca-${Date.now()}`;
      setAlerts((prev) => {
        const exists = prev.some((a) => a.field === 'delinquency_flag' && a.changeType === 'Schema Change');
        if (exists) return prev;
        return [
          {
            id: newAlertId,
            field: 'delinquency_flag',
            source: 'Credit Bureau Feed',
            changeType: 'Schema Change' as const,
            severity: 'Warning' as const,
            detectedAt: formatDateTime(new Date()),
            status: 'Open' as const,
          },
          ...prev,
        ];
      });

      setRefreshing(false);
      showToast('Lineage refreshed — 9 edges, 1 schema change detected');
    }, 1500);
  };

  // Alert update handler
  const handleUpdateAlert = (id: string, updates: Partial<ChangeAlert>) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  // Get selected node for drawer
  const drawerNode = selectedNode ? nodes.find((n) => n.id === selectedNode) : null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">
      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Node drawer */}
      {drawerNode && <NodeDrawer node={drawerNode} onClose={() => setSelectedNode(null)} />}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Lineage</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Trace field origins, monitor schema changes, and manage pipeline snapshots.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {exporting && <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />}
            Export Graph
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {refreshing && <span className="w-3 h-3 border-2 border-[#0A1628] border-t-transparent rounded-full animate-spin" />}
            Refresh Lineage
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-md space-y-1">
        <input
          type="text"
          placeholder="Search fields, nodes, or sources..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
        />
        {debouncedSearch && (
          <p className="text-[10px] text-gray-500">
            {matchedNodes} node{matchedNodes !== 1 ? 's' : ''} &middot; {matchedAlerts} alert{matchedAlerts !== 1 ? 's' : ''} matched
          </p>
        )}
      </div>

      {/* Lineage Graph */}
      <section aria-label="Lineage Graph">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Pipeline Graph — Source &rarr; Transform &rarr; Output
        </h2>
        <LineageGraph
          nodes={nodes}
          edges={edges}
          search={debouncedSearch}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          refreshing={refreshing}
        />
      </section>

      {/* Change Alerts */}
      <section aria-label="Change Alerts">
        <ChangeAlertsTable alerts={alerts} onUpdateAlert={handleUpdateAlert} search={debouncedSearch} showToast={showToast} />
      </section>

      {/* Pipeline Snapshots */}
      <section aria-label="Pipeline Snapshots">
        <SnapshotManager
          snapshots={snapshots}
          onAddSnapshot={(snap) => setSnapshots((prev) => [...prev, snap])}
          onDeleteSnapshot={(id) => setSnapshots((prev) => prev.filter((s) => s.id !== id))}
          nodes={nodes}
          edges={edges}
          showToast={showToast}
        />
      </section>

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.25s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-in {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
