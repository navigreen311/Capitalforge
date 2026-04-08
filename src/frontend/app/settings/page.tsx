'use client';

// ============================================================
// /settings — Tenant settings, integrations, API keys, users
// ============================================================

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────

type TabId = 'profile' | 'firm' | 'billing' | 'notifications' | 'integrations' | 'api-keys' | 'tenant' | 'users' | 'security';

type IntegrationCategory = 'Voice & Communication' | 'AI & Intelligence' | 'Credit Bureaus' | 'Financial Data' | 'Documents';

interface Integration {
  id: string;
  provider: string;
  label: string;
  description: string;
  icon: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSynced?: string;
  category: IntegrationCategory;
}

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
  status: 'active' | 'revoked';
}

type UserRole = 'tenant_admin' | 'advisor' | 'compliance_officer' | 'read_only' | 'committee';
type MfaStatus = 'enabled' | 'not_set' | 'pending';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive' | 'invited';
  mfa: MfaStatus;
  lastLogin?: string;
}

// ── Toast ────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 border border-emerald-700 text-emerald-200 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in">
      <span className="text-sm">{message}</span>
      <button onClick={onClose} className="text-emerald-400 hover:text-emerald-200 text-lg leading-none">&times;</button>
    </div>
  );
}

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  }, []);
  return { msg, show, clear: () => setMsg(null) };
}

// ── Modal Shell ──────────────────────────────────────────────

function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: React.ReactNode; width?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 ${width ?? 'w-full max-w-md'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Mock data ────────────────────────────────────────────────

const INTEGRATIONS_INIT: Integration[] = [
  // Voice & Communication
  { id: 'voiceforge', provider: 'voiceforge', label: 'VoiceForge', description: 'AI-powered voice workflows & IVR', icon: 'VF', status: 'disconnected', category: 'Voice & Communication' },
  { id: 'twilio', provider: 'twilio', label: 'Twilio', description: 'SMS, voice, and WhatsApp messaging', icon: 'TW', status: 'disconnected', category: 'Voice & Communication' },
  { id: 'sendgrid', provider: 'sendgrid', label: 'SendGrid', description: 'Transactional & marketing email delivery', icon: 'SG', status: 'disconnected', category: 'Voice & Communication' },
  { id: 'slack', provider: 'slack', label: 'Slack', description: 'Team notifications & workflow alerts', icon: 'SL', status: 'disconnected', category: 'Voice & Communication' },
  // AI & Intelligence
  { id: 'visionaudioforge', provider: 'visionaudioforge', label: 'VisionAudioForge', description: 'Document OCR, audio transcription & AI analysis', icon: 'VA', status: 'disconnected', category: 'AI & Intelligence' },
  // Credit Bureaus
  { id: 'equifax', provider: 'equifax', label: 'Equifax Business', description: 'Commercial credit reports & risk scores', icon: 'EQ', status: 'disconnected', category: 'Credit Bureaus' },
  { id: 'experian', provider: 'experian', label: 'Experian Business', description: 'Business credit data & trade-line history', icon: 'EX', status: 'disconnected', category: 'Credit Bureaus' },
  { id: 'dnb', provider: 'dnb', label: 'Dun & Bradstreet', description: 'D-U-N-S profiles, PAYDEX scores', icon: 'DB', status: 'disconnected', category: 'Credit Bureaus' },
  // Financial Data
  { id: 'plaid', provider: 'plaid', label: 'Plaid', description: 'Bank account verification & cash flow data', icon: 'PL', status: 'connected', lastSynced: '2026-03-31T09:00:00Z', category: 'Financial Data' },
  { id: 'quickbooks', provider: 'quickbooks', label: 'QuickBooks Online', description: 'Accounting sync — P&L, Balance Sheet, invoices', icon: 'QB', status: 'disconnected', category: 'Financial Data' },
  { id: 'xero', provider: 'xero', label: 'Xero', description: 'Alternative accounting integration', icon: 'XE', status: 'disconnected', category: 'Financial Data' },
  { id: 'stripe', provider: 'stripe', label: 'Stripe', description: 'Billing & payment processing', icon: 'ST', status: 'connected', lastSynced: '2026-03-31T08:30:00Z', category: 'Financial Data' },
  // Documents
  { id: 'docusign', provider: 'docusign', label: 'DocuSign', description: 'E-signatures for consent records & agreements', icon: 'DS', status: 'connected', lastSynced: '2026-03-30T18:00:00Z', category: 'Documents' },
];

const API_KEYS_INIT: ApiKeyRow[] = [
  { id: 'key_1', name: 'Production API', prefix: 'cf_prod1234', scopes: ['read', 'write'], createdAt: '2026-01-15', lastUsed: '2026-03-31', status: 'active' },
  { id: 'key_2', name: 'Analytics Dashboard', prefix: 'cf_anlt5678', scopes: ['read'], createdAt: '2026-02-01', lastUsed: '2026-03-30', expiresAt: '2026-12-31', status: 'active' },
];

const USERS_INIT: UserRow[] = [
  { id: 'u1', name: 'Alex Morgan', email: 'alex@capitalforge.io', role: 'tenant_admin', status: 'active', mfa: 'enabled', lastLogin: '2026-03-31' },
  { id: 'u2', name: 'Sarah Chen', email: 'sarah@capitalforge.io', role: 'advisor', status: 'active', mfa: 'enabled', lastLogin: '2026-03-30' },
  { id: 'u3', name: 'Marcus Webb', email: 'marcus@capitalforge.io', role: 'compliance_officer', status: 'active', mfa: 'not_set', lastLogin: '2026-03-29' },
  { id: 'u4', name: 'Priya Patel', email: 'priya@capitalforge.io', role: 'advisor', status: 'inactive', mfa: 'not_set', lastLogin: '2026-02-15' },
];

const ALL_SCOPES = ['read', 'write', 'webhooks', 'admin', 'billing'] as const;

// ── Status badge styles ───────────────────────────────────────

const STATUS_BADGE: Record<Integration['status'], string> = {
  connected:    'bg-emerald-900 text-emerald-300 border border-emerald-700',
  disconnected: 'bg-gray-800 text-gray-400 border border-gray-700',
  error:        'bg-red-900 text-red-300 border border-red-700',
};

const SYNC_DOT_COLOR: Record<string, string> = {
  green:  'bg-emerald-400',
  amber:  'bg-amber-400',
  red:    'bg-red-400',
};

const ROLE_LABELS: Record<string, string> = {
  tenant_admin:       'Admin',
  advisor:            'Advisor',
  compliance_officer: 'Compliance',
  read_only:          'Read-Only',
  committee:          'Committee',
  super_admin:        'Super Admin',
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'tenant_admin', label: 'Admin' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'compliance_officer', label: 'Compliance' },
  { value: 'read_only', label: 'Read-Only' },
  { value: 'committee', label: 'Committee' },
];

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

function IntegrationCard({
  integration,
  onConnect,
  onDisconnect,
  onTest,
}: {
  integration: Integration;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onTest: (id: string) => void;
}) {
  const { status } = integration;

  // Determine sync dot color: connected < 1h = green, < 24h = amber, else red
  let syncDot: string | null = null;
  if (status === 'connected' && integration.lastSynced) {
    const elapsed = Date.now() - new Date(integration.lastSynced).getTime();
    const hours = elapsed / (1000 * 60 * 60);
    syncDot = hours < 1 ? 'green' : hours < 24 ? 'amber' : 'red';
  }

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-700 bg-gray-900 hover:bg-gray-800/60 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-[#0A1628] border border-[#C9A84C]/30 flex items-center justify-center text-xs font-bold text-[#C9A84C] flex-shrink-0">
        {integration.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-100">{integration.label}</p>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
            {status}
          </span>
          {syncDot && (
            <span className={`w-2 h-2 rounded-full ${SYNC_DOT_COLOR[syncDot]} inline-block`} title={`Sync: ${syncDot}`} />
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{integration.description}</p>
        {integration.lastSynced && status === 'connected' && (
          <p className="text-[11px] text-gray-600 mt-1">
            Last synced: {new Date(integration.lastSynced).toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {status === 'connected' && (
          <button
            onClick={() => onTest(integration.id)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
          >
            Test
          </button>
        )}
        <button
          onClick={() => status === 'connected' ? onDisconnect(integration.id) : onConnect(integration.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            status === 'connected'
              ? 'bg-red-900 hover:bg-red-800 text-red-300 border border-red-700'
              : 'bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628]'
          }`}
        >
          {status === 'connected' ? 'Disconnect' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

// ── Notification Preferences ──────────────────────────────────

const NOTIFICATION_EVENTS = [
  { id: 'loan_submitted', label: 'Loan Application Submitted' },
  { id: 'loan_approved', label: 'Loan Approved / Denied' },
  { id: 'doc_uploaded', label: 'Document Uploaded' },
  { id: 'compliance_alert', label: 'Compliance Alert' },
  { id: 'payment_received', label: 'Payment Received' },
  { id: 'user_invited', label: 'New User Invited' },
] as const;

type NotifChannel = 'email' | 'sms' | 'slack';

// ── Billing Tab Component ────────────────────────────────────

const BILLING_API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

interface MockInvoice {
  id: string;
  date: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  description: string;
}

const MOCK_INVOICES: MockInvoice[] = [
  { id: 'inv_001', date: '2026-04-01', amount: '$697.00', status: 'paid', description: 'Pro Plan - April 2026' },
  { id: 'inv_002', date: '2026-03-01', amount: '$697.00', status: 'paid', description: 'Pro Plan - March 2026' },
  { id: 'inv_003', date: '2026-02-01', amount: '$697.00', status: 'paid', description: 'Pro Plan - February 2026' },
  { id: 'inv_004', date: '2026-01-01', amount: '$297.00', status: 'paid', description: 'Starter Plan - January 2026' },
];

function BillingTab({
  goldBtn,
  grayBtn,
  toast,
}: {
  goldBtn: string;
  grayBtn: string;
  toast: { show: (m: string) => void };
}) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState<boolean | null>(null);

  // Check Stripe status on mount
  useState(() => {
    fetch(`${BILLING_API}/stripe/status`)
      .then((r) => r.json())
      .then((json) => setStripeConfigured(json?.data?.configured ?? false))
      .catch(() => setStripeConfigured(false));
  });

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      const res = await fetch(`${BILLING_API}/stripe/portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error('Failed to create billing portal session');
      }

      const json = await res.json();
      const { url, mock } = json.data;

      if (mock) {
        toast.show('Stripe is not configured. Set STRIPE_SECRET_KEY in your environment to enable billing management.');
      } else {
        window.location.href = url;
      }
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const INVOICE_STATUS_BADGE: Record<string, string> = {
    paid: 'bg-emerald-900 text-emerald-300 border border-emerald-700',
    pending: 'bg-amber-900 text-amber-300 border border-amber-700',
    failed: 'bg-red-900 text-red-300 border border-red-700',
  };

  return (
    <section className="max-w-3xl space-y-6">
      {/* Stripe Configuration Warning */}
      {stripeConfigured === false && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-300">Configure Stripe in Settings</p>
            <p className="text-xs text-amber-400/80 mt-1">
              Stripe keys are not configured. Add <code className="bg-amber-900/50 px-1 rounded text-amber-300">STRIPE_SECRET_KEY</code> and <code className="bg-amber-900/50 px-1 rounded text-amber-300">STRIPE_PUBLISHABLE_KEY</code> to your <code className="bg-amber-900/50 px-1 rounded text-amber-300">.env</code> file to enable real payment processing.
            </p>
          </div>
        </div>
      )}

      {/* Current Plan */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">Current Plan</h3>
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-900 text-emerald-300 border border-emerald-700">
            Active
          </span>
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-white">Pro</span>
          <span className="text-gray-400 text-sm">$697/month</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Status</p>
            <p className="text-sm text-emerald-400 font-medium mt-0.5">Active</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Billing Cycle</p>
            <p className="text-sm text-gray-200 font-medium mt-0.5">Monthly</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Next Invoice</p>
            <p className="text-sm text-gray-200 font-medium mt-0.5">May 1, 2026</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Payment Method</p>
            <p className="text-sm text-gray-200 font-medium mt-0.5">Visa **** 4242</p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleManageSubscription}
            disabled={portalLoading}
            className={`${goldBtn} flex items-center gap-2 ${portalLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {portalLoading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {portalLoading ? 'Opening Portal...' : 'Manage Subscription'}
          </button>
          <a href="/pricing" className={grayBtn}>
            View Plans
          </a>
        </div>
      </div>

      {/* Invoice History */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-200">Invoice History</h3>
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Description</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-right">Amount</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {MOCK_INVOICES.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="py-3 px-4 text-sm text-gray-300">{inv.date}</td>
                  <td className="py-3 px-4 text-sm text-gray-300">{inv.description}</td>
                  <td className="py-3 px-4 text-sm text-gray-200 font-medium text-right">{inv.amount}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${INVOICE_STATUS_BADGE[inv.status] ?? ''}`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-600">
          Invoice history is placeholder data. Connect Stripe for real invoice data.
        </p>
      </div>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────

const VALID_TABS: TabId[] = ['profile', 'firm', 'billing', 'notifications', 'integrations', 'api-keys', 'tenant', 'users', 'security'];

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const toast = useToast();

  // Honour ?tab= query param (e.g. from billing "View Full Plan" link)
  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabId | null;
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // ── Profile state ─────────────────────────────────────────
  const [profileName, setProfileName] = useState('Jonathan Wright');
  const [profileEmail, setProfileEmail] = useState('jonathan@capitalforge.io');
  const [profilePhone, setProfilePhone] = useState('+1 (555) 234-5678');
  const [profileTimezone, setProfileTimezone] = useState('America/New_York');

  const [profileSaving, setProfileSaving] = useState(false);
  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      // Mock POST — replace with real API call
      await new Promise((resolve) => setTimeout(resolve, 800));
      toast.show('Profile saved');
    } catch {
      toast.show('Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Firm save state ────────────────────────────────────────
  const [firmSaving, setFirmSaving] = useState(false);
  const saveFirm = async () => {
    setFirmSaving(true);
    try {
      // Mock POST — replace with real API call
      await new Promise((resolve) => setTimeout(resolve, 800));
      toast.show('Firm settings saved');
    } catch {
      toast.show('Failed to save firm settings');
    } finally {
      setFirmSaving(false);
    }
  };

  // ── Security state ─────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) { toast.show('Passwords do not match'); return; }
    if (newPassword.length < 8) { toast.show('Password must be at least 8 characters'); return; }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toast.show('Password changed successfully');
  };

  // ── Integration state ──────────────────────────────────────
  const [integrations, setIntegrations] = useState<Integration[]>(INTEGRATIONS_INIT);
  const [connectModal, setConnectModal] = useState<{ id: string; provider: string; phase: 'redirecting' | 'done' } | null>(null);
  const [disconnectModal, setDisconnectModal] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ms: number } | null>(null);

  const handleConnect = (id: string) => {
    const integ = integrations.find((i) => i.id === id);
    if (!integ) return;
    setConnectModal({ id, provider: integ.label, phase: 'redirecting' });
    setTimeout(() => {
      setIntegrations((prev) => prev.map((i) => i.id === id ? { ...i, status: 'connected', lastSynced: new Date().toISOString() } : i));
      setConnectModal((prev) => prev ? { ...prev, phase: 'done' } : null);
      setTimeout(() => {
        setConnectModal(null);
        toast.show(`${integ.label} connected successfully`);
      }, 600);
    }, 1500);
  };

  const confirmDisconnect = () => {
    if (!disconnectModal) return;
    const integ = integrations.find((i) => i.id === disconnectModal);
    setIntegrations((prev) => prev.map((i) => i.id === disconnectModal ? { ...i, status: 'disconnected', lastSynced: undefined } : i));
    setDisconnectModal(null);
    toast.show(`${integ?.label ?? 'Integration'} disconnected`);
  };

  const handleTest = (id: string) => {
    const ms = 80 + Math.floor(Math.random() * 120);
    setTestResult({ id, ms });
    setTimeout(() => setTestResult(null), 4000);
  };

  // Group integrations by category
  const categories = Array.from(new Set(integrations.map((i) => i.category)));
  const grouped = categories.map((cat) => ({ category: cat, items: integrations.filter((i) => i.category === cat) }));

  // ── API Keys state ─────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>(API_KEYS_INIT);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['read']);
  const [newKeyExpiration, setNewKeyExpiration] = useState('never');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);

  const createKey = () => {
    if (!newKeyName.trim()) return;
    const fullKey = `cf_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const newKey: ApiKeyRow = {
      id: `key_${Date.now()}`,
      name: newKeyName,
      prefix: fullKey.slice(0, 12),
      scopes: newKeyScopes,
      createdAt: new Date().toISOString().slice(0, 10),
      expiresAt: newKeyExpiration === 'never' ? undefined : newKeyExpiration,
      status: 'active',
    };
    setApiKeys((prev) => [newKey, ...prev]);
    setRevealedKey(fullKey);
    setNewKeyName('');
    setNewKeyScopes(['read']);
    setNewKeyExpiration('never');
    setShowNewKeyModal(false);
    toast.show('API key created — copy it now, it won\'t be shown again');
  };

  const revokeKey = (id: string) => {
    setApiKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: 'revoked' as const } : k));
    setRevokeConfirm(null);
    toast.show('API key revoked');
  };

  // ── Users state ────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>(USERS_INIT);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; email: string; role: UserRole; status: 'active' | 'inactive' }>({ name: '', email: '', role: 'advisor', status: 'active' });
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('advisor');
  const [inviteMessage, setInviteMessage] = useState('');
  const [mfaConfirm, setMfaConfirm] = useState<string | null>(null);

  const openEditUser = (user: UserRow) => {
    setEditUser(user);
    setEditForm({ name: user.name, email: user.email, role: user.role, status: user.status === 'invited' ? 'active' : user.status });
  };

  const saveEditUser = () => {
    if (!editUser) return;
    // Block self-demotion from Admin (assume u1 is current user)
    if (editUser.id === 'u1' && editUser.role === 'tenant_admin' && editForm.role !== 'tenant_admin') {
      toast.show('Cannot demote yourself from Admin');
      return;
    }
    setUsers((prev) => prev.map((u) => u.id === editUser.id ? { ...u, name: editForm.name, email: editForm.email, role: editForm.role, status: editForm.status } : u));
    setEditUser(null);
    toast.show('User updated successfully');
  };

  const submitInvite = () => {
    if (!inviteEmail.trim()) return;
    const newUser: UserRow = {
      id: `u_${Date.now()}`,
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      role: inviteRole,
      status: 'invited',
      mfa: 'not_set',
    };
    setUsers((prev) => [...prev, newUser]);
    setInviteModal(false);
    setInviteEmail('');
    setInviteRole('advisor');
    setInviteMessage('');
    toast.show(`Invitation sent to ${inviteEmail}`);
  };

  const requireMfa = (userId: string) => {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, mfa: 'pending' as MfaStatus } : u));
    setMfaConfirm(null);
    toast.show('MFA requirement sent to user');
  };

  // ── Tenant Config state ────────────────────────────────────
  const [tenantFirm, setTenantFirm] = useState({ name: 'CapitalForge Demo Corp', primaryColor: '#0A1628', accentColor: '#C9A84C' });
  const [tenantBiz, setTenantBiz] = useState({ timezone: 'America/New_York', currency: 'USD', hours: '9:00 AM - 5:00 PM', fiscalYear: 'January' });
  const [tenantEmail, setTenantEmail] = useState({ fromName: 'CapitalForge', replyTo: 'support@capitalforge.io', footer: 'CapitalForge Inc. | 123 Finance St' });
  const [notifPrefs, setNotifPrefs] = useState<Record<string, Record<NotifChannel, boolean>>>(() => {
    const init: Record<string, Record<NotifChannel, boolean>> = {};
    NOTIFICATION_EVENTS.forEach((e) => { init[e.id] = { email: true, sms: false, slack: false }; });
    return init;
  });
  const [dragOver, setDragOver] = useState(false);
  const [logoName, setLogoName] = useState<string | null>(null);

  const toggleNotif = (eventId: string, channel: NotifChannel) => {
    setNotifPrefs((prev) => ({
      ...prev,
      [eventId]: { ...prev[eventId], [channel]: !prev[eventId][channel] },
    }));
  };

  const saveTenantConfig = () => {
    toast.show('Tenant configuration saved');
  };

  // ── Shared styles ──────────────────────────────────────────
  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-[#C9A84C]';
  const labelCls = 'text-xs text-gray-400 mb-1.5 block font-medium';
  const goldBtn = 'px-4 py-2 bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] rounded-lg text-sm font-semibold transition-colors';
  const grayBtn = 'px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition-colors';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Toast */}
      {toast.msg && <Toast message={toast.msg} onClose={toast.clear} />}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Integrations, API access, tenant config, and user management</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit flex-wrap">
        <Tab id="profile"       label="Profile"        active={activeTab === 'profile'}       onClick={setActiveTab} />
        <Tab id="firm"          label="Firm"            active={activeTab === 'firm'}          onClick={setActiveTab} />
        <Tab id="billing"       label="Billing"         active={activeTab === 'billing'}       onClick={setActiveTab} />
        <Tab id="notifications" label="Notifications"   active={activeTab === 'notifications'} onClick={setActiveTab} />
        <Tab id="users"         label="Team"            active={activeTab === 'users'}         onClick={setActiveTab} />
        <Tab id="security"      label="Security"        active={activeTab === 'security'}      onClick={setActiveTab} />
        <Tab id="integrations"  label="Integrations"    active={activeTab === 'integrations'}  onClick={setActiveTab} />
        <Tab id="api-keys"      label="API"             active={activeTab === 'api-keys'}      onClick={setActiveTab} />
        <Tab id="tenant"        label="Tenant Config"   active={activeTab === 'tenant'}        onClick={setActiveTab} />
      </div>

      {/* ── Profile Tab ───────────────────────────────────── */}
      {activeTab === 'profile' && (
        <section className="max-w-2xl space-y-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-200">Personal Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full Name</label>
                <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email Address</label>
                <input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} type="email" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone Number</label>
                <input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Timezone</label>
                <select value={profileTimezone} onChange={(e) => setProfileTimezone(e.target.value)} className={inputCls}>
                  {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC', 'Europe/London'].map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveProfile} disabled={profileSaving} className={`${goldBtn} flex items-center gap-2 ${profileSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {profileSaving && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </section>
      )}

      {/* ── Firm Tab ────────────────────────────────────────── */}
      {activeTab === 'firm' && (
        <section className="max-w-2xl space-y-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-200">Firm Details</h3>
            <div>
              <label className={labelCls}>Firm Name</label>
              <input value={tenantFirm.name} onChange={(e) => setTenantFirm({ ...tenantFirm, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Logo</label>
              <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragOver ? 'border-[#C9A84C] bg-[#0A1628]/50' : 'border-gray-700 bg-gray-800/30'
              }`}>
                {logoName ? (
                  <p className="text-sm text-emerald-300">{logoName}</p>
                ) : (
                  <p className="text-sm text-gray-500">Drag &amp; drop logo here, or click Browse</p>
                )}
                <label className="mt-2 inline-block text-xs text-[#C9A84C] hover:underline cursor-pointer">Browse files</label>
              </div>
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <textarea
                rows={2}
                defaultValue="123 Finance District, Suite 400, New York, NY 10005"
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={saveFirm} disabled={firmSaving} className={`${goldBtn} flex items-center gap-2 ${firmSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {firmSaving && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {firmSaving ? 'Saving...' : 'Save Firm Settings'}
            </button>
          </div>
        </section>
      )}

      {/* ── Billing Tab ──────────────────────────────────────── */}
      {activeTab === 'billing' && (
        <BillingTab goldBtn={goldBtn} grayBtn={grayBtn} toast={toast} />
      )}

      {/* ── Notifications Tab ───────────────────────────────── */}
      {activeTab === 'notifications' && (
        <section className="max-w-3xl space-y-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-200">Notification Preferences</h3>
            <p className="text-xs text-gray-500">Toggle notifications for each event type by channel.</p>
            <div className="overflow-hidden rounded-lg border border-gray-800">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/80">
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Event</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-center">Email</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-center">SMS</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-center">Slack</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTIFICATION_EVENTS.map((evt) => (
                    <tr key={evt.id} className="border-b border-gray-800">
                      <td className="py-2.5 px-4 text-sm text-gray-300">{evt.label}</td>
                      {(['email', 'sms', 'slack'] as NotifChannel[]).map((ch) => (
                        <td key={ch} className="py-2.5 px-4 text-center">
                          <button
                            onClick={() => toggleNotif(evt.id, ch)}
                            className={`w-9 h-5 rounded-full relative transition-colors ${
                              notifPrefs[evt.id]?.[ch] ? 'bg-[#C9A84C]' : 'bg-gray-700'
                            }`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              notifPrefs[evt.id]?.[ch] ? 'translate-x-4' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => toast.show('Notification preferences saved')} className={goldBtn}>Save Preferences</button>
          </div>
        </section>
      )}

      {/* ── Security Tab ────────────────────────────────────── */}
      {activeTab === 'security' && (
        <section className="max-w-2xl space-y-6">
          {/* Change Password */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-200">Change Password</h3>
            <div>
              <label className={labelCls}>Current Password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleChangePassword} className={goldBtn}>Update Password</button>
            </div>
          </div>

          {/* Two-Factor Authentication */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Two-Factor Authentication</h3>
                <p className="text-xs text-gray-500 mt-1">Add an extra layer of security to your account</p>
              </div>
              <button
                onClick={() => { setTwoFactorEnabled(!twoFactorEnabled); toast.show(twoFactorEnabled ? '2FA disabled' : '2FA enabled'); }}
                className={`w-11 h-6 rounded-full relative transition-colors ${twoFactorEnabled ? 'bg-emerald-600' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${twoFactorEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4 text-xs text-gray-400">
              {twoFactorEnabled ? (
                <p className="text-emerald-400">Two-factor authentication is enabled. You will be prompted for a verification code on each login.</p>
              ) : (
                <p>Enable 2FA to require a verification code from an authenticator app when signing in.</p>
              )}
            </div>
          </div>

          {/* Session info */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-200">Session Information</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500">Last Password Change</span>
                <p className="text-gray-300 mt-0.5">February 15, 2026</p>
              </div>
              <div>
                <span className="text-gray-500">Last Login</span>
                <p className="text-gray-300 mt-0.5">April 7, 2026 at 9:15 AM</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Integrations Tab ────────────────────────────────── */}
      {activeTab === 'integrations' && (
        <section>
          {/* Connect modal */}
          {connectModal && (
            <Modal title={connectModal.phase === 'redirecting' ? 'Connecting...' : 'Connected!'} onClose={() => setConnectModal(null)}>
              <div className="text-center py-4">
                {connectModal.phase === 'redirecting' ? (
                  <>
                    <div className="w-10 h-10 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm text-gray-300">Redirecting to {connectModal.provider}...</p>
                  </>
                ) : (
                  <p className="text-sm text-emerald-300">Successfully connected!</p>
                )}
              </div>
            </Modal>
          )}

          {/* Disconnect confirm */}
          {disconnectModal && (
            <Modal title="Confirm Disconnect" onClose={() => setDisconnectModal(null)}>
              <p className="text-sm text-gray-400 mb-5">
                Are you sure you want to disconnect <strong className="text-white">{integrations.find((i) => i.id === disconnectModal)?.label}</strong>? Synced data will be retained but new syncs will stop.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDisconnectModal(null)} className={grayBtn}>Cancel</button>
                <button onClick={confirmDisconnect} className="px-4 py-2 bg-red-900 hover:bg-red-800 text-red-300 border border-red-700 rounded-lg text-sm font-semibold">Disconnect</button>
              </div>
            </Modal>
          )}

          {grouped.map(({ category, items }) => (
            <div key={category} className="mb-8">
              <h2 className="text-base font-semibold text-white mb-3">{category}</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {items.map((i) => (
                  <div key={i.id} className="relative">
                    <IntegrationCard
                      integration={i}
                      onConnect={handleConnect}
                      onDisconnect={(id) => setDisconnectModal(id)}
                      onTest={handleTest}
                    />
                    {testResult?.id === i.id && (
                      <div className="absolute top-2 right-2 bg-emerald-900 border border-emerald-700 text-emerald-300 text-[11px] font-semibold px-2.5 py-1 rounded-lg">
                        Healthy {testResult.ms}ms
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-2 p-4 rounded-xl border border-yellow-700 bg-yellow-900/20 text-sm text-yellow-300">
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
            <button onClick={() => setShowNewKeyModal(true)} className={goldBtn}>
              + Generate New Key
            </button>
          </div>

          {/* Revealed key banner */}
          {revealedKey && (
            <div className="mb-4 p-4 rounded-xl border border-amber-600 bg-amber-900/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-300 text-xs font-bold uppercase">Your new API key (shown once)</span>
              </div>
              <div className="flex items-center gap-3">
                <code className="flex-1 text-sm font-mono bg-gray-900 text-gray-100 px-3 py-2 rounded-lg border border-gray-700 select-all break-all">{revealedKey}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(revealedKey); toast.show('Copied to clipboard'); }}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium border border-gray-700"
                >
                  Copy
                </button>
              </div>
              <p className="text-[11px] text-amber-400 mt-2">Store this key securely. You will not be able to see it again.</p>
              <button onClick={() => setRevealedKey(null)} className="mt-2 text-xs text-gray-500 hover:text-gray-300">Dismiss</button>
            </div>
          )}

          {/* Generate key modal */}
          {showNewKeyModal && (
            <Modal title="Generate New API Key" onClose={() => setShowNewKeyModal(false)}>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Key Name</label>
                  <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g. Mobile App Production" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Scopes</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_SCOPES.map((scope) => (
                      <button
                        key={scope}
                        onClick={() => setNewKeyScopes((prev) => prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope])}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          newKeyScopes.includes(scope)
                            ? 'bg-blue-900 text-blue-300 border-blue-700'
                            : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
                        }`}
                      >
                        {scope}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Expiration</label>
                  <select
                    value={newKeyExpiration}
                    onChange={(e) => setNewKeyExpiration(e.target.value)}
                    className={inputCls}
                  >
                    <option value="never">Never</option>
                    <option value="2026-07-01">90 days</option>
                    <option value="2027-04-01">1 year</option>
                    <option value="2026-05-01">30 days</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowNewKeyModal(false)} className={grayBtn}>Cancel</button>
                  <button onClick={createKey} className={goldBtn} disabled={!newKeyName.trim()}>Generate Key</button>
                </div>
              </div>
            </Modal>
          )}

          {/* Revoke confirmation */}
          {revokeConfirm && (
            <Modal title="Revoke API Key" onClose={() => setRevokeConfirm(null)}>
              <p className="text-sm text-gray-400 mb-5">
                Are you sure you want to revoke <strong className="text-white">{apiKeys.find((k) => k.id === revokeConfirm)?.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setRevokeConfirm(null)} className={grayBtn}>Cancel</button>
                <button onClick={() => revokeKey(revokeConfirm)} className="px-4 py-2 bg-red-900 hover:bg-red-800 text-red-300 border border-red-700 rounded-lg text-sm font-semibold">Revoke</button>
              </div>
            </Modal>
          )}

          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/80">
                  {['Name', 'Key Prefix', 'Scopes', 'Created', 'Last Used', 'Status', ''].map((h) => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id} className="border-b border-gray-800">
                    <td className="py-3 px-4 text-sm text-gray-100">{k.name}</td>
                    <td className="py-3 px-4">
                      <code className="text-xs font-mono bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{k.prefix}...</code>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1 flex-wrap">
                        {k.scopes.map((s) => (
                          <span key={s} className="text-[10px] bg-blue-900 text-blue-300 border border-blue-700 px-1.5 py-0.5 rounded-full">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">{k.createdAt}</td>
                    <td className="py-3 px-4 text-xs text-gray-500">{k.lastUsed ?? '---'}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        k.status === 'active' ? 'bg-emerald-900 text-emerald-300 border-emerald-700' : 'bg-red-900 text-red-300 border-red-700'
                      }`}>
                        {k.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {k.status === 'active' && (
                        <button onClick={() => setRevokeConfirm(k.id)} className="text-xs text-red-400 hover:text-red-300 hover:underline">
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {apiKeys.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-600 text-sm">
                      No API keys. Generate one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-600">
            API keys grant programmatic access to the CapitalForge API. Keys are shown once on creation -- store them securely.
          </p>
        </section>
      )}

      {/* ── Tenant Config Tab ───────────────────────────────── */}
      {activeTab === 'tenant' && (
        <section className="max-w-3xl space-y-6">
          {/* Firm Branding */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-200">Firm Branding</h3>
            <div>
              <label className={labelCls}>Firm Name</label>
              <input value={tenantFirm.name} onChange={(e) => setTenantFirm({ ...tenantFirm, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Logo</label>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragOver ? 'border-[#C9A84C] bg-[#0A1628]/50' : 'border-gray-700 bg-gray-800/30'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) { setLogoName(file.name); toast.show(`Logo "${file.name}" uploaded`); }
                }}
              >
                {logoName ? (
                  <p className="text-sm text-emerald-300">{logoName}</p>
                ) : (
                  <p className="text-sm text-gray-500">Drag & drop logo here, or click to browse</p>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="logo-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { setLogoName(file.name); toast.show(`Logo "${file.name}" uploaded`); }
                  }}
                />
                <label htmlFor="logo-upload" className="mt-2 inline-block text-xs text-[#C9A84C] hover:underline cursor-pointer">Browse files</label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Primary Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={tenantFirm.primaryColor} onChange={(e) => setTenantFirm({ ...tenantFirm, primaryColor: e.target.value })} className="h-9 w-16 rounded cursor-pointer bg-transparent border-0" />
                  <span className="text-xs text-gray-400">{tenantFirm.primaryColor}</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>Accent Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={tenantFirm.accentColor} onChange={(e) => setTenantFirm({ ...tenantFirm, accentColor: e.target.value })} className="h-9 w-16 rounded cursor-pointer bg-transparent border-0" />
                  <span className="text-xs text-gray-400">{tenantFirm.accentColor}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Business Settings */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-200">Business Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Timezone</label>
                <select value={tenantBiz.timezone} onChange={(e) => setTenantBiz({ ...tenantBiz, timezone: e.target.value })} className={inputCls}>
                  {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC', 'Europe/London'].map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <select value={tenantBiz.currency} onChange={(e) => setTenantBiz({ ...tenantBiz, currency: e.target.value })} className={inputCls}>
                  {['USD', 'EUR', 'GBP', 'CAD'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Business Hours</label>
                <input value={tenantBiz.hours} onChange={(e) => setTenantBiz({ ...tenantBiz, hours: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fiscal Year Start</label>
                <select value={tenantBiz.fiscalYear} onChange={(e) => setTenantBiz({ ...tenantBiz, fiscalYear: e.target.value })} className={inputCls}>
                  {['January', 'February', 'March', 'April', 'July', 'October'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Email Settings */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-200">Email Settings</h3>
            <div>
              <label className={labelCls}>From Name</label>
              <input value={tenantEmail.fromName} onChange={(e) => setTenantEmail({ ...tenantEmail, fromName: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Reply-To Address</label>
              <input value={tenantEmail.replyTo} onChange={(e) => setTenantEmail({ ...tenantEmail, replyTo: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email Footer</label>
              <textarea value={tenantEmail.footer} onChange={(e) => setTenantEmail({ ...tenantEmail, footer: e.target.value })} rows={2} className={inputCls} />
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-200">Notification Preferences</h3>
            <div className="overflow-hidden rounded-lg border border-gray-800">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/80">
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Event</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-center">Email</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-center">SMS</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase text-center">Slack</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTIFICATION_EVENTS.map((evt) => (
                    <tr key={evt.id} className="border-b border-gray-800">
                      <td className="py-2.5 px-4 text-sm text-gray-300">{evt.label}</td>
                      {(['email', 'sms', 'slack'] as NotifChannel[]).map((ch) => (
                        <td key={ch} className="py-2.5 px-4 text-center">
                          <button
                            onClick={() => toggleNotif(evt.id, ch)}
                            className={`w-9 h-5 rounded-full relative transition-colors ${
                              notifPrefs[evt.id]?.[ch] ? 'bg-[#C9A84C]' : 'bg-gray-700'
                            }`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              notifPrefs[evt.id]?.[ch] ? 'translate-x-4' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <button onClick={saveTenantConfig} className={goldBtn}>Save Changes</button>
          </div>
        </section>
      )}

      {/* ── Users Tab ───────────────────────────────────────── */}
      {activeTab === 'users' && (
        <section>
          {/* Edit user modal */}
          {editUser && (
            <Modal title={`Edit User: ${editUser.name}`} onClose={() => setEditUser(null)}>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Name</label>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })} className={inputCls}>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  {editUser.id === 'u1' && editUser.role === 'tenant_admin' && editForm.role !== 'tenant_admin' && (
                    <p className="text-xs text-red-400 mt-1">You cannot demote yourself from Admin.</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditForm({ ...editForm, status: editForm.status === 'active' ? 'inactive' : 'active' })}
                      className={`w-11 h-6 rounded-full relative transition-colors ${
                        editForm.status === 'active' ? 'bg-emerald-600' : 'bg-gray-700'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        editForm.status === 'active' ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                    <span className="text-sm text-gray-300">{editForm.status === 'active' ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>MFA</label>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    editUser.mfa === 'enabled' ? 'bg-emerald-900 text-emerald-300 border-emerald-700' :
                    editUser.mfa === 'pending' ? 'bg-amber-900 text-amber-300 border-amber-700' :
                    'bg-gray-800 text-gray-500 border-gray-700'
                  }`}>
                    {editUser.mfa === 'enabled' ? 'Enabled' : editUser.mfa === 'pending' ? 'Pending' : 'Not Set'}
                  </span>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setEditUser(null)} className={grayBtn}>Cancel</button>
                  <button onClick={saveEditUser} className={goldBtn}>Save Changes</button>
                </div>
              </div>
            </Modal>
          )}

          {/* Invite user modal */}
          {inviteModal && (
            <Modal title="Invite User" onClose={() => setInviteModal(false)}>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Email Address</label>
                  <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@company.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)} className={inputCls}>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Message (optional)</label>
                  <textarea value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} rows={2} placeholder="Welcome to the team..." className={inputCls} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setInviteModal(false)} className={grayBtn}>Cancel</button>
                  <button onClick={submitInvite} className={goldBtn} disabled={!inviteEmail.trim()}>Send Invite</button>
                </div>
              </div>
            </Modal>
          )}

          {/* MFA confirm */}
          {mfaConfirm && (
            <Modal title="Require MFA" onClose={() => setMfaConfirm(null)}>
              <p className="text-sm text-gray-400 mb-5">
                This will require <strong className="text-white">{users.find((u) => u.id === mfaConfirm)?.name}</strong> to set up multi-factor authentication on their next login.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setMfaConfirm(null)} className={grayBtn}>Cancel</button>
                <button onClick={() => requireMfa(mfaConfirm)} className={goldBtn}>Require MFA</button>
              </div>
            </Modal>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">User Management</h2>
            <button onClick={() => setInviteModal(true)} className={goldBtn}>
              + Invite User
            </button>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Name', 'Email', 'Role', 'Status', 'MFA', 'Last Login', ''].map((h) => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
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
                          : user.status === 'invited'
                          ? 'bg-amber-900 text-amber-300 border-amber-700'
                          : 'bg-gray-800 text-gray-500 border-gray-700'
                      }`}>
                        {user.status === 'invited' ? 'Invited' : user.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {user.mfa === 'enabled' ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-900 text-emerald-300 border-emerald-700">Enabled</span>
                      ) : user.mfa === 'pending' ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-900 text-amber-300 border-amber-700">Pending</span>
                      ) : (
                        <button
                          onClick={() => setMfaConfirm(user.id)}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-500 cursor-pointer"
                        >
                          Not Set
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">{user.lastLogin ?? '---'}</td>
                    <td className="py-3 px-4">
                      <button onClick={() => openEditUser(user)} className="text-xs text-gray-500 hover:text-gray-300">Edit</button>
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

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A1628]" />}>
      <SettingsPageInner />
    </Suspense>
  );
}
