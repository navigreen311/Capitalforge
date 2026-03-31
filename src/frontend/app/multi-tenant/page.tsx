'use client';

// ============================================================
// /multi-tenant — Multi-Tenant Admin
// Tenant list with plan badges, create tenant, tenant detail
// (branding, feature flags, usage meters, billing).
// ============================================================

import { useState } from 'react';

// ─── Types & Mock data ────────────────────────────────────────────────────────

type Plan = 'Starter' | 'Growth' | 'Enterprise' | 'White-Label';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  status: 'Active' | 'Trial' | 'Suspended';
  advisors: number;
  clients: number;
  mrr: string;
  createdAt: string;
  primaryColor: string;
  logoInitials: string;
  features: Record<string, boolean>;
  usage: { label: string; used: number; limit: number; unit: string }[];
}

const TENANTS: Tenant[] = [
  {
    id: 'ten-001', name: 'Apex Capital Group',    slug: 'apex',    plan: 'Enterprise',  status: 'Active',    advisors: 48, clients: 412, mrr: '$14,400', createdAt: '2024-06-01',
    primaryColor: '#1e40af', logoInitials: 'AC',
    features: { aiRecommendations: true, sandboxAccess: true, apiAccess: true, customBranding: true, ssoEnabled: true, complianceReports: true, dataExport: true, multiCurrency: false },
    usage: [{ label: 'Advisors', used: 48, limit: 60, unit: 'seats' }, { label: 'API Calls', used: 184_200, limit: 500_000, unit: 'calls/mo' }, { label: 'Storage', used: 22, limit: 100, unit: 'GB' }],
  },
  {
    id: 'ten-002', name: 'BlueSky Funding',        slug: 'bluesky', plan: 'Growth',      status: 'Active',    advisors: 18, clients: 143, mrr: '$3,600',  createdAt: '2025-01-15',
    primaryColor: '#0891b2', logoInitials: 'BF',
    features: { aiRecommendations: true, sandboxAccess: true, apiAccess: false, customBranding: true, ssoEnabled: false, complianceReports: true, dataExport: true, multiCurrency: false },
    usage: [{ label: 'Advisors', used: 18, limit: 25, unit: 'seats' }, { label: 'API Calls', used: 0, limit: 0, unit: 'calls/mo' }, { label: 'Storage', used: 5, limit: 25, unit: 'GB' }],
  },
  {
    id: 'ten-003', name: 'Momentum Advisors',      slug: 'momentum', plan: 'Starter',   status: 'Trial',     advisors: 4,  clients: 27,  mrr: '$0',      createdAt: '2026-03-10',
    primaryColor: '#7c3aed', logoInitials: 'MA',
    features: { aiRecommendations: false, sandboxAccess: true, apiAccess: false, customBranding: false, ssoEnabled: false, complianceReports: false, dataExport: false, multiCurrency: false },
    usage: [{ label: 'Advisors', used: 4, limit: 5, unit: 'seats' }, { label: 'Clients', used: 27, limit: 50, unit: 'clients' }, { label: 'Storage', used: 1, limit: 5, unit: 'GB' }],
  },
  {
    id: 'ten-004', name: 'Pinnacle Partners',       slug: 'pinnacle', plan: 'White-Label', status: 'Active', advisors: 92, clients: 880, mrr: '$28,000', createdAt: '2023-11-20',
    primaryColor: '#C9A84C', logoInitials: 'PP',
    features: { aiRecommendations: true, sandboxAccess: true, apiAccess: true, customBranding: true, ssoEnabled: true, complianceReports: true, dataExport: true, multiCurrency: true },
    usage: [{ label: 'Advisors', used: 92, limit: 150, unit: 'seats' }, { label: 'API Calls', used: 1_240_000, limit: 5_000_000, unit: 'calls/mo' }, { label: 'Storage', used: 68, limit: 500, unit: 'GB' }],
  },
  {
    id: 'ten-005', name: 'Clearview Strategies',   slug: 'clearview', plan: 'Growth',   status: 'Suspended', advisors: 11, clients: 78,  mrr: '$2,200',  createdAt: '2025-04-02',
    primaryColor: '#059669', logoInitials: 'CS',
    features: { aiRecommendations: true, sandboxAccess: false, apiAccess: false, customBranding: true, ssoEnabled: false, complianceReports: true, dataExport: true, multiCurrency: false },
    usage: [{ label: 'Advisors', used: 11, limit: 25, unit: 'seats' }, { label: 'API Calls', used: 0, limit: 0, unit: 'calls/mo' }, { label: 'Storage', used: 8, limit: 25, unit: 'GB' }],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planBadge(plan: Plan): string {
  if (plan === 'Enterprise')   return 'bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/40';
  if (plan === 'White-Label')  return 'bg-purple-900/50 text-purple-300 border border-purple-700';
  if (plan === 'Growth')       return 'bg-blue-900/50 text-blue-300 border border-blue-700';
  return 'bg-gray-800 text-gray-400 border border-gray-700';
}

function statusBadge(s: Tenant['status']): string {
  if (s === 'Active')    return 'bg-emerald-900/50 text-emerald-300';
  if (s === 'Trial')     return 'bg-yellow-900/50 text-yellow-300';
  return 'bg-red-900/50 text-red-300';
}

function usageColor(pct: number): string {
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#C9A84C';
  return '#22c55e';
}

function fmtUsage(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CreateTenantModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Create New Tenant</h2>
            <p className="text-xs text-gray-500 mt-0.5">Provision a new organization workspace.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onClose(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-gray-400 font-medium">Organization Name</label>
              <input placeholder="e.g. Apex Capital Group" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Slug / Subdomain</label>
              <input placeholder="apex" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Plan</label>
              <select className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
                <option>Starter</option>
                <option>Growth</option>
                <option>Enterprise</option>
                <option>White-Label</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Admin Email</label>
              <input type="email" placeholder="admin@company.com" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Primary Color</label>
              <input type="color" defaultValue="#C9A84C" className="w-full h-9 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none cursor-pointer" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
              Create Tenant
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TenantDetail({ tenant }: { tenant: Tenant }) {
  const [flags, setFlags] = useState(tenant.features);

  function toggleFlag(key: string) {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const FEATURE_LABELS: Record<string, string> = {
    aiRecommendations: 'AI Recommendations',
    sandboxAccess:     'Sandbox Access',
    apiAccess:         'API Access',
    customBranding:    'Custom Branding',
    ssoEnabled:        'SSO / SAML',
    complianceReports: 'Compliance Reports',
    dataExport:        'Data Export',
    multiCurrency:     'Multi-Currency',
  };

  return (
    <div className="space-y-6">
      {/* Branding */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Branding</h4>
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black text-white shadow"
            style={{ backgroundColor: tenant.primaryColor }}
          >
            {tenant.logoInitials}
          </div>
          <div className="space-y-2 flex-1">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Primary Color</label>
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded-full border border-gray-600 inline-block"
                  style={{ backgroundColor: tenant.primaryColor }}
                />
                <span className="text-xs font-mono text-gray-300">{tenant.primaryColor}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
                Upload Logo
              </button>
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
                Edit Color
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feature flags */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Feature Flags</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(flags).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800">
              <span className="text-xs text-gray-300">{FEATURE_LABELS[key] ?? key}</span>
              <button
                onClick={() => toggleFlag(key)}
                className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? 'bg-[#C9A84C]' : 'bg-gray-700'}`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-5' : 'left-0.5'}`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Usage meters */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Usage Meters</h4>
        <div className="space-y-4">
          {tenant.usage.map((meter) => {
            const pct = meter.limit > 0 ? Math.round((meter.used / meter.limit) * 100) : 0;
            return (
              <div key={meter.label} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-300 font-medium">{meter.label}</span>
                  <span className="text-gray-500 tabular-nums">
                    {meter.limit > 0 ? `${fmtUsage(meter.used)} / ${fmtUsage(meter.limit)} ${meter.unit}` : 'Unlimited'}
                  </span>
                </div>
                {meter.limit > 0 && (
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: usageColor(pct) }}
                    />
                  </div>
                )}
                {meter.limit > 0 && (
                  <p className="text-[10px] text-gray-600">{pct}% used</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Billing</h4>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-lg font-bold text-white tabular-nums">{tenant.mrr}</p>
            <p className="text-xs text-gray-500">Monthly recurring revenue</p>
          </div>
          <div className="flex gap-2">
            <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
              View Invoices
            </button>
            <button className="text-xs px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] font-semibold transition-colors">
              Change Plan
            </button>
          </div>
        </div>
        <p className="text-[10px] text-gray-600">Placeholder — connect to /api/billing/tenant/{tenant.id}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MultiTenantPage() {
  const [selected, setSelected] = useState<string | null>(TENANTS[0].id);
  const [showCreate, setShowCreate] = useState(false);

  const selectedTenant = TENANTS.find((t) => t.id === selected) ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {showCreate && <CreateTenantModal onClose={() => setShowCreate(false)} />}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Multi-Tenant Admin</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage tenant organizations, feature flags, usage limits, and billing.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Export CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
          >
            + Create Tenant
          </button>
        </div>
      </div>

      {/* ── Summary cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Tenants',  value: '5',       sub: '4 active'          },
          { label: 'Total Advisors', value: '173',      sub: 'Across all orgs'   },
          { label: 'Total Clients',  value: '1,540',    sub: 'Active enrollments' },
          { label: 'Platform MRR',   value: '$48,200',  sub: 'March 2026'        },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{c.label}</p>
            <p className="text-2xl font-bold text-white tabular-nums">{c.value}</p>
            <p className="text-xs text-gray-500">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Tenant list */}
        <div className="xl:col-span-1 space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tenants</h2>
          {TENANTS.map((tenant) => (
            <div
              key={tenant.id}
              onClick={() => setSelected(tenant.id)}
              className={`rounded-xl border p-4 cursor-pointer transition-all ${
                selected === tenant.id
                  ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                  : 'border-gray-800 bg-gray-900 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                  style={{ backgroundColor: tenant.primaryColor }}
                >
                  {tenant.logoInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-100 truncate">{tenant.name}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusBadge(tenant.status)}`}>
                      {tenant.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${planBadge(tenant.plan)}`}>
                      {tenant.plan}
                    </span>
                    <span className="text-[10px] text-gray-500">{tenant.advisors} advisors · {tenant.clients} clients</span>
                  </div>
                </div>
                <span className="text-xs font-semibold text-gray-300 tabular-nums flex-shrink-0">{tenant.mrr}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Tenant detail */}
        <div className="xl:col-span-2">
          {selectedTenant ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-200">{selectedTenant.name}</h2>
                <div className="flex gap-2">
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
                    Impersonate
                  </button>
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors">
                    Suspend
                  </button>
                </div>
              </div>
              <TenantDetail tenant={selectedTenant} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center text-gray-600 text-sm">
              Select a tenant to view details.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
