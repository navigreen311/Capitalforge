'use client';

// ============================================================
// /settings — Tenant settings, integrations, API keys, users
// ============================================================

import { useState } from 'react';

// ── Types ────────────────────────────────────────────────────

type TabId = 'integrations' | 'api-keys' | 'tenant' | 'users';

interface Integration {
  id: string;
  provider: string;
  label: string;
  description: string;
  icon: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSynced?: string;
}

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  lastLogin?: string;
}

// ── Mock data ────────────────────────────────────────────────

const INTEGRATIONS: Integration[] = [
  {
    id: 'plaid', provider: 'plaid', label: 'Plaid',
    description: 'Bank account verification & cash flow data',
    icon: 'PL',
    status: 'connected', lastSynced: '2026-03-31T09:00:00Z',
  },
  {
    id: 'quickbooks', provider: 'quickbooks', label: 'QuickBooks Online',
    description: 'Accounting sync — P&L, Balance Sheet, invoices',
    icon: 'QB',
    status: 'disconnected',
  },
  {
    id: 'xero', provider: 'xero', label: 'Xero',
    description: 'Alternative accounting integration',
    icon: 'XE',
    status: 'disconnected',
  },
  {
    id: 'docusign', provider: 'docusign', label: 'DocuSign',
    description: 'E-signatures for consent records & agreements',
    icon: 'DS',
    status: 'connected', lastSynced: '2026-03-30T18:00:00Z',
  },
  {
    id: 'stripe', provider: 'stripe', label: 'Stripe',
    description: 'Billing & payment processing',
    icon: 'ST',
    status: 'connected', lastSynced: '2026-03-31T08:30:00Z',
  },
];

const API_KEYS: ApiKeyRow[] = [
  {
    id: 'key_1', name: 'Production API', prefix: 'cf_prod1234',
    scopes: ['read', 'write'], createdAt: '2026-01-15', lastUsed: '2026-03-31',
  },
  {
    id: 'key_2', name: 'Analytics Dashboard', prefix: 'cf_anlt5678',
    scopes: ['read'], createdAt: '2026-02-01', lastUsed: '2026-03-30',
    expiresAt: '2026-12-31',
  },
  {
    id: 'key_3', name: 'Webhook Processor', prefix: 'cf_wbhk9012',
    scopes: ['webhooks'], createdAt: '2026-03-01',
  },
];

const USERS: UserRow[] = [
  { id: 'u1', name: 'Alex Morgan', email: 'alex@capitalforge.io', role: 'tenant_admin', status: 'active', lastLogin: '2026-03-31' },
  { id: 'u2', name: 'Sarah Chen', email: 'sarah@capitalforge.io', role: 'advisor', status: 'active', lastLogin: '2026-03-30' },
  { id: 'u3', name: 'Marcus Webb', email: 'marcus@capitalforge.io', role: 'compliance_officer', status: 'active', lastLogin: '2026-03-29' },
  { id: 'u4', name: 'Priya Patel', email: 'priya@capitalforge.io', role: 'advisor', status: 'inactive', lastLogin: '2026-02-15' },
];

// ── Status badge styles ───────────────────────────────────────

const STATUS_BADGE: Record<Integration['status'], string> = {
  connected:    'bg-emerald-900 text-emerald-300 border border-emerald-700',
  disconnected: 'bg-gray-800 text-gray-400 border border-gray-700',
  error:        'bg-red-900 text-red-300 border border-red-700',
};

const ROLE_LABELS: Record<string, string> = {
  tenant_admin:       'Admin',
  advisor:            'Advisor',
  compliance_officer: 'Compliance',
  super_admin:        'Super Admin',
};

// ── Tab component ─────────────────────────────────────────────

function Tab({ id, label, active, onClick }: { id: TabId; label: string; active: boolean; onClick: (id: TabId) => void }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-[#0A1628] text-[#C9A84C]'
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  );
}

// ── Integration Card ──────────────────────────────────────────

function IntegrationCard({ integration }: { integration: Integration }) {
  const [status, setStatus] = useState(integration.status);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    // STUB — call POST /api/integrations/:provider/connect or DELETE .../disconnect
    await new Promise((r) => setTimeout(r, 800));
    setStatus((prev) => prev === 'connected' ? 'disconnected' : 'connected');
    setLoading(false);
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-700 bg-gray-900 hover:bg-gray-850 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-[#0A1628] border border-[#C9A84C]/30 flex items-center justify-center text-xs font-bold text-[#C9A84C] flex-shrink-0">
        {integration.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-100">{integration.label}</p>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
            {status}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{integration.description}</p>
        {integration.lastSynced && status === 'connected' && (
          <p className="text-[11px] text-gray-600 mt-1">
            Last synced: {new Date(integration.lastSynced).toLocaleString()}
          </p>
        )}
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
          status === 'connected'
            ? 'bg-red-900 hover:bg-red-800 text-red-300 border border-red-700'
            : 'bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628]'
        } disabled:opacity-50`}
      >
        {loading ? '…' : status === 'connected' ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  );
}

// ── API Key Row ───────────────────────────────────────────────

function ApiKeyRow({ row, onRevoke }: { row: ApiKeyRow; onRevoke: (id: string) => void }) {
  return (
    <tr className="border-b border-gray-800">
      <td className="py-3 px-4 text-sm text-gray-100">{row.name}</td>
      <td className="py-3 px-4">
        <code className="text-xs font-mono bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{row.prefix}…</code>
      </td>
      <td className="py-3 px-4">
        <div className="flex gap-1 flex-wrap">
          {row.scopes.map((s) => (
            <span key={s} className="text-[10px] bg-blue-900 text-blue-300 border border-blue-700 px-1.5 py-0.5 rounded-full">
              {s}
            </span>
          ))}
        </div>
      </td>
      <td className="py-3 px-4 text-xs text-gray-500">{row.lastUsed ?? '—'}</td>
      <td className="py-3 px-4 text-xs text-gray-500">{row.expiresAt ?? 'Never'}</td>
      <td className="py-3 px-4">
        <button
          onClick={() => onRevoke(row.id)}
          className="text-xs text-red-400 hover:text-red-300 hover:underline"
        >
          Revoke
        </button>
      </td>
    </tr>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab]   = useState<TabId>('integrations');
  const [apiKeys, setApiKeys]       = useState<ApiKeyRow[]>(API_KEYS);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');

  const revokeKey = (id: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const createKey = () => {
    if (!newKeyName.trim()) return;
    const newKey: ApiKeyRow = {
      id:        `key_${Date.now()}`,
      name:      newKeyName,
      prefix:    `cf_${Math.random().toString(36).slice(2, 10)}`,
      scopes:    ['read'],
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setApiKeys((prev) => [newKey, ...prev]);
    setNewKeyName('');
    setShowNewKey(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Integrations, API access, tenant config, and user management</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        <Tab id="integrations" label="Integrations"   active={activeTab === 'integrations'} onClick={setActiveTab} />
        <Tab id="api-keys"     label="API Keys"        active={activeTab === 'api-keys'}     onClick={setActiveTab} />
        <Tab id="tenant"       label="Tenant Config"   active={activeTab === 'tenant'}        onClick={setActiveTab} />
        <Tab id="users"        label="Users"           active={activeTab === 'users'}         onClick={setActiveTab} />
      </div>

      {/* ── Integrations Tab ────────────────────────────────── */}
      {activeTab === 'integrations' && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Connected Integrations</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {INTEGRATIONS.map((i) => (
              <IntegrationCard key={i.id} integration={i} />
            ))}
          </div>
          <div className="mt-6 p-4 rounded-xl border border-yellow-700 bg-yellow-900/20 text-sm text-yellow-300">
            <strong>Note:</strong> OAuth flows redirect to provider authorization pages.
            Webhook endpoints are auto-registered on connect.
          </div>
        </section>
      )}

      {/* ── API Keys Tab ────────────────────────────────────── */}
      {activeTab === 'api-keys' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">API Keys</h2>
            <button
              onClick={() => setShowNewKey(true)}
              className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
            >
              + Generate Key
            </button>
          </div>

          {/* New key form */}
          {showNewKey && (
            <div className="mb-4 p-4 rounded-xl border border-[#C9A84C]/40 bg-[#0A1628] flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Key Name</label>
                <input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Mobile App Production"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C]"
                />
              </div>
              <button onClick={createKey} className="px-4 py-2 bg-[#C9A84C] text-[#0A1628] rounded-lg text-sm font-semibold hover:bg-[#b8933e]">
                Create
              </button>
              <button onClick={() => setShowNewKey(false)} className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          )}

          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/80">
                  {['Name', 'Key Prefix', 'Scopes', 'Last Used', 'Expires', ''].map((h) => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <ApiKeyRow key={k.id} row={k} onRevoke={revokeKey} />
                ))}
                {apiKeys.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-600 text-sm">
                      No active API keys. Generate one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-600">
            API keys grant programmatic access to the CapitalForge API. Keys are shown once on creation — store them securely.
          </p>
        </section>
      )}

      {/* ── Tenant Config Tab ───────────────────────────────── */}
      {activeTab === 'tenant' && (
        <section className="max-w-2xl space-y-6">
          <h2 className="text-lg font-semibold text-white">Tenant Configuration</h2>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Organization Name</label>
              <input
                defaultValue="CapitalForge Demo Corp"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Tenant Slug</label>
              <input
                defaultValue="demo-corp"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Plan</label>
              <div className="flex items-center gap-3">
                <span className="bg-[#C9A84C] text-[#0A1628] text-xs font-bold px-3 py-1 rounded-full">Growth</span>
                <a href="#" className="text-xs text-[#C9A84C] hover:underline">Upgrade plan</a>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">Primary Brand Color</label>
              <div className="flex items-center gap-3">
                <input type="color" defaultValue="#0A1628" className="h-9 w-20 rounded cursor-pointer bg-transparent border-0" />
                <span className="text-sm text-gray-400">#0A1628 (Navy)</span>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-800 flex justify-end">
              <button className="px-4 py-2 bg-[#C9A84C] text-[#0A1628] rounded-lg text-sm font-semibold hover:bg-[#b8933e]">
                Save Changes
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Rate Limits</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Requests / Minute', value: '120' },
                { label: 'Requests / Day',    value: '10,000' },
                { label: 'Burst Allowance',   value: '30' },
                { label: 'Webhook Retries',   value: '5' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className="text-sm font-semibold text-gray-200">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Users Tab ───────────────────────────────────────── */}
      {activeTab === 'users' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">User Management</h2>
            <button className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold">
              + Invite User
            </button>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Name', 'Email', 'Role', 'Status', 'Last Login', ''].map((h) => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {USERS.map((user) => (
                  <tr key={user.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-3 px-4 text-sm font-medium text-gray-100">{user.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-400">{user.email}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/30 px-2 py-0.5 rounded-full">
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        user.status === 'active'
                          ? 'bg-emerald-900 text-emerald-300 border-emerald-700'
                          : 'bg-gray-800 text-gray-500 border-gray-700'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">{user.lastLogin ?? '—'}</td>
                    <td className="py-3 px-4">
                      <button className="text-xs text-gray-500 hover:text-gray-300">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
