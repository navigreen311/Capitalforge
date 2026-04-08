'use client';

// ============================================================
// /multi-tenant — Multi-Tenant Admin
// Tenant list with plan badges, create tenant wizard, tenant detail
// (branding, feature flags, usage meters, billing, activity log).
// Impersonate, suspend/reactivate, trial banners.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ─── Types & Mock data ────────────────────────────────────────────────────────

type Plan = 'Starter' | 'Growth' | 'Enterprise' | 'White-Label';

interface Invoice {
  id: string;
  period: string;
  amount: string;
  status: 'Paid' | 'Overdue' | 'Pending';
}

interface ActivityEvent {
  timestamp: string;
  eventType: string;
  user: string;
  description: string;
}

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
  billingStatus: 'Current' | 'Overdue';
  nextBillingDate: string;
  invoices: Invoice[];
  activityLog: ActivityEvent[];
  trialExpiresIn?: number; // days remaining, only for Trial
}

const TENANTS_INITIAL: Tenant[] = [
  {
    id: 'ten-001', name: 'Apex Capital Group', slug: 'apex', plan: 'Enterprise', status: 'Active', advisors: 48, clients: 412, mrr: '$14,400', createdAt: '2024-06-01',
    primaryColor: '#1e40af', logoInitials: 'AC',
    features: { aiRecommendations: true, sandboxAccess: true, apiAccess: true, customBranding: true, ssoEnabled: true, complianceReports: true, dataExport: true, multiCurrency: false },
    usage: [{ label: 'Advisors', used: 48, limit: 60, unit: 'seats' }, { label: 'API Calls', used: 184_200, limit: 500_000, unit: 'calls/mo' }, { label: 'Storage', used: 22, limit: 100, unit: 'GB' }],
    billingStatus: 'Current', nextBillingDate: '2026-05-01',
    invoices: [
      { id: 'INV-1041', period: 'Mar 2026', amount: '$14,400', status: 'Paid' },
      { id: 'INV-1028', period: 'Feb 2026', amount: '$14,400', status: 'Paid' },
      { id: 'INV-1015', period: 'Jan 2026', amount: '$14,400', status: 'Paid' },
    ],
    activityLog: [
      { timestamp: '2026-03-31 14:22', eventType: 'Feature Flag', user: 'admin@apex.com', description: 'Enabled Multi-Currency' },
      { timestamp: '2026-03-30 09:15', eventType: 'User Login', user: 'jsmith@apex.com', description: 'Logged in from 192.168.1.42' },
      { timestamp: '2026-03-29 16:40', eventType: 'Plan Change', user: 'system', description: 'Upgraded from Growth to Enterprise' },
      { timestamp: '2026-03-28 11:05', eventType: 'Advisor Added', user: 'admin@apex.com', description: 'Added advisor sarah.chen@apex.com' },
      { timestamp: '2026-03-27 08:30', eventType: 'API Key', user: 'admin@apex.com', description: 'Regenerated API key ending in ...x4f2' },
      { timestamp: '2026-03-26 13:55', eventType: 'Billing', user: 'system', description: 'Invoice INV-1041 paid via ACH' },
      { timestamp: '2026-03-25 10:20', eventType: 'Compliance', user: 'compliance@apex.com', description: 'Generated Q1 compliance report' },
      { timestamp: '2026-03-24 15:10', eventType: 'SSO Config', user: 'admin@apex.com', description: 'Updated SAML provider to Okta' },
      { timestamp: '2026-03-23 09:45', eventType: 'Data Export', user: 'jsmith@apex.com', description: 'Exported client portfolio data (412 records)' },
      { timestamp: '2026-03-22 14:30', eventType: 'Branding', user: 'admin@apex.com', description: 'Updated logo and primary color' },
      { timestamp: '2026-03-21 11:15', eventType: 'User Removed', user: 'admin@apex.com', description: 'Removed advisor mike.ross@apex.com' },
      { timestamp: '2026-03-20 08:00', eventType: 'System', user: 'system', description: 'Scheduled maintenance completed' },
    ],
  },
  {
    id: 'ten-002', name: 'BlueSky Funding', slug: 'bluesky', plan: 'Growth', status: 'Active', advisors: 18, clients: 143, mrr: '$3,600', createdAt: '2025-01-15',
    primaryColor: '#0891b2', logoInitials: 'BF',
    features: { aiRecommendations: true, sandboxAccess: true, apiAccess: false, customBranding: true, ssoEnabled: false, complianceReports: true, dataExport: true, multiCurrency: false },
    usage: [{ label: 'Advisors', used: 18, limit: 25, unit: 'seats' }, { label: 'API Calls', used: 0, limit: 0, unit: 'calls/mo' }, { label: 'Storage', used: 5, limit: 25, unit: 'GB' }],
    billingStatus: 'Current', nextBillingDate: '2026-05-15',
    invoices: [
      { id: 'INV-2031', period: 'Mar 2026', amount: '$3,600', status: 'Paid' },
      { id: 'INV-2018', period: 'Feb 2026', amount: '$3,600', status: 'Paid' },
      { id: 'INV-2005', period: 'Jan 2026', amount: '$3,600', status: 'Paid' },
    ],
    activityLog: [
      { timestamp: '2026-03-31 10:00', eventType: 'User Login', user: 'admin@bluesky.com', description: 'Logged in from 10.0.0.5' },
      { timestamp: '2026-03-30 14:20', eventType: 'Advisor Added', user: 'admin@bluesky.com', description: 'Added advisor new.hire@bluesky.com' },
      { timestamp: '2026-03-29 09:10', eventType: 'Feature Flag', user: 'admin@bluesky.com', description: 'Enabled Custom Branding' },
      { timestamp: '2026-03-28 16:45', eventType: 'Billing', user: 'system', description: 'Invoice INV-2031 paid via card' },
      { timestamp: '2026-03-27 11:30', eventType: 'Data Export', user: 'analyst@bluesky.com', description: 'Exported Q1 reports' },
      { timestamp: '2026-03-26 08:15', eventType: 'Compliance', user: 'admin@bluesky.com', description: 'Submitted annual compliance review' },
      { timestamp: '2026-03-25 13:50', eventType: 'User Login', user: 'analyst@bluesky.com', description: 'Logged in from 10.0.0.12' },
      { timestamp: '2026-03-24 10:05', eventType: 'Branding', user: 'admin@bluesky.com', description: 'Uploaded new company logo' },
      { timestamp: '2026-03-23 15:30', eventType: 'System', user: 'system', description: 'Storage cleanup freed 2GB' },
      { timestamp: '2026-03-22 09:20', eventType: 'Advisor Added', user: 'admin@bluesky.com', description: 'Added advisor j.park@bluesky.com' },
      { timestamp: '2026-03-21 14:00', eventType: 'Feature Flag', user: 'admin@bluesky.com', description: 'Disabled Sandbox Access temporarily' },
      { timestamp: '2026-03-20 11:45', eventType: 'User Login', user: 'admin@bluesky.com', description: 'Logged in from mobile device' },
    ],
  },
  {
    id: 'ten-003', name: 'Momentum Advisors', slug: 'momentum', plan: 'Starter', status: 'Trial', advisors: 4, clients: 27, mrr: '$0', createdAt: '2026-03-10',
    primaryColor: '#7c3aed', logoInitials: 'MA', trialExpiresIn: 12,
    features: { aiRecommendations: false, sandboxAccess: true, apiAccess: false, customBranding: false, ssoEnabled: false, complianceReports: false, dataExport: false, multiCurrency: false },
    usage: [{ label: 'Advisors', used: 4, limit: 5, unit: 'seats' }, { label: 'Clients', used: 27, limit: 50, unit: 'clients' }, { label: 'Storage', used: 1, limit: 5, unit: 'GB' }],
    billingStatus: 'Current', nextBillingDate: 'N/A (Trial)',
    invoices: [
      { id: 'INV-3001', period: 'Trial', amount: '$0.00', status: 'Pending' },
      { id: 'INV-3000', period: 'Setup', amount: '$0.00', status: 'Paid' },
      { id: 'INV-2999', period: 'Activation', amount: '$0.00', status: 'Paid' },
    ],
    activityLog: [
      { timestamp: '2026-03-31 16:00', eventType: 'User Login', user: 'admin@momentum.com', description: 'Logged in from 172.16.0.3' },
      { timestamp: '2026-03-30 10:30', eventType: 'Client Added', user: 'admin@momentum.com', description: 'Added 5 new client records' },
      { timestamp: '2026-03-29 14:15', eventType: 'Feature Flag', user: 'admin@momentum.com', description: 'Enabled Sandbox Access' },
      { timestamp: '2026-03-28 09:00', eventType: 'Advisor Added', user: 'admin@momentum.com', description: 'Added advisor trial.user@momentum.com' },
      { timestamp: '2026-03-27 13:40', eventType: 'System', user: 'system', description: 'Trial period started - 14 days remaining' },
      { timestamp: '2026-03-26 11:20', eventType: 'User Login', user: 'trial.user@momentum.com', description: 'First login from new advisor' },
      { timestamp: '2026-03-25 15:55', eventType: 'Data Export', user: 'admin@momentum.com', description: 'Exported sample client data' },
      { timestamp: '2026-03-24 08:30', eventType: 'Branding', user: 'admin@momentum.com', description: 'Set primary color to purple' },
      { timestamp: '2026-03-23 12:10', eventType: 'Client Added', user: 'admin@momentum.com', description: 'Imported 22 client records from CSV' },
      { timestamp: '2026-03-22 10:00', eventType: 'System', user: 'system', description: 'Account provisioned successfully' },
      { timestamp: '2026-03-21 09:00', eventType: 'User Login', user: 'admin@momentum.com', description: 'Initial admin login' },
      { timestamp: '2026-03-20 08:00', eventType: 'System', user: 'system', description: 'Tenant created via sign-up form' },
    ],
  },
  {
    id: 'ten-004', name: 'Pinnacle Partners', slug: 'pinnacle', plan: 'White-Label', status: 'Active', advisors: 92, clients: 880, mrr: '$28,000', createdAt: '2023-11-20',
    primaryColor: '#C9A84C', logoInitials: 'PP',
    features: { aiRecommendations: true, sandboxAccess: true, apiAccess: true, customBranding: true, ssoEnabled: true, complianceReports: true, dataExport: true, multiCurrency: true },
    usage: [{ label: 'Advisors', used: 92, limit: 150, unit: 'seats' }, { label: 'API Calls', used: 1_240_000, limit: 5_000_000, unit: 'calls/mo' }, { label: 'Storage', used: 68, limit: 500, unit: 'GB' }],
    billingStatus: 'Current', nextBillingDate: '2026-04-20',
    invoices: [
      { id: 'INV-4055', period: 'Mar 2026', amount: '$28,000', status: 'Paid' },
      { id: 'INV-4042', period: 'Feb 2026', amount: '$28,000', status: 'Paid' },
      { id: 'INV-4029', period: 'Jan 2026', amount: '$28,000', status: 'Paid' },
    ],
    activityLog: [
      { timestamp: '2026-03-31 15:00', eventType: 'API Call', user: 'system', description: 'API usage reached 1.24M calls this month' },
      { timestamp: '2026-03-30 11:20', eventType: 'User Login', user: 'ceo@pinnacle.com', description: 'Executive dashboard accessed' },
      { timestamp: '2026-03-29 14:50', eventType: 'White-Label', user: 'admin@pinnacle.com', description: 'Updated custom domain DNS settings' },
      { timestamp: '2026-03-28 09:30', eventType: 'Billing', user: 'system', description: 'Invoice INV-4055 paid via wire transfer' },
      { timestamp: '2026-03-27 16:15', eventType: 'Advisor Added', user: 'admin@pinnacle.com', description: 'Bulk imported 8 new advisors' },
      { timestamp: '2026-03-26 10:40', eventType: 'SSO Config', user: 'admin@pinnacle.com', description: 'Added Azure AD as secondary IdP' },
      { timestamp: '2026-03-25 13:00', eventType: 'Compliance', user: 'legal@pinnacle.com', description: 'SOC2 audit report generated' },
      { timestamp: '2026-03-24 08:45', eventType: 'Multi-Currency', user: 'admin@pinnacle.com', description: 'Added EUR and GBP currency support' },
      { timestamp: '2026-03-23 15:20', eventType: 'Data Export', user: 'analyst@pinnacle.com', description: 'Full platform data export (880 clients)' },
      { timestamp: '2026-03-22 11:00', eventType: 'Feature Flag', user: 'admin@pinnacle.com', description: 'Enabled Multi-Currency globally' },
      { timestamp: '2026-03-21 09:30', eventType: 'System', user: 'system', description: 'Performance optimization applied' },
      { timestamp: '2026-03-20 14:15', eventType: 'User Login', user: 'admin@pinnacle.com', description: 'Logged in from corporate VPN' },
    ],
  },
  {
    id: 'ten-005', name: 'Clearview Strategies', slug: 'clearview', plan: 'Growth', status: 'Suspended', advisors: 11, clients: 78, mrr: '$2,200', createdAt: '2025-04-02',
    primaryColor: '#059669', logoInitials: 'CS',
    features: { aiRecommendations: true, sandboxAccess: false, apiAccess: false, customBranding: true, ssoEnabled: false, complianceReports: true, dataExport: true, multiCurrency: false },
    usage: [{ label: 'Advisors', used: 11, limit: 25, unit: 'seats' }, { label: 'API Calls', used: 0, limit: 0, unit: 'calls/mo' }, { label: 'Storage', used: 8, limit: 25, unit: 'GB' }],
    billingStatus: 'Overdue', nextBillingDate: '2026-03-02 (Past Due)',
    invoices: [
      { id: 'INV-5019', period: 'Mar 2026', amount: '$2,200', status: 'Overdue' },
      { id: 'INV-5006', period: 'Feb 2026', amount: '$2,200', status: 'Overdue' },
      { id: 'INV-4993', period: 'Jan 2026', amount: '$2,200', status: 'Paid' },
    ],
    activityLog: [
      { timestamp: '2026-03-15 09:00', eventType: 'Suspension', user: 'system', description: 'Account suspended due to non-payment' },
      { timestamp: '2026-03-14 16:30', eventType: 'Billing', user: 'system', description: 'Payment retry #3 failed' },
      { timestamp: '2026-03-10 10:00', eventType: 'Billing', user: 'system', description: 'Payment retry #2 failed' },
      { timestamp: '2026-03-06 10:00', eventType: 'Billing', user: 'system', description: 'Payment retry #1 failed' },
      { timestamp: '2026-03-02 00:00', eventType: 'Billing', user: 'system', description: 'Invoice INV-5019 payment failed' },
      { timestamp: '2026-02-28 14:20', eventType: 'User Login', user: 'admin@clearview.com', description: 'Last admin login before suspension' },
      { timestamp: '2026-02-25 11:00', eventType: 'Data Export', user: 'admin@clearview.com', description: 'Exported all client data' },
      { timestamp: '2026-02-20 09:30', eventType: 'Feature Flag', user: 'admin@clearview.com', description: 'Disabled Sandbox Access' },
      { timestamp: '2026-02-15 13:45', eventType: 'Compliance', user: 'admin@clearview.com', description: 'Generated compliance snapshot' },
      { timestamp: '2026-02-10 10:15', eventType: 'Billing', user: 'system', description: 'Invoice INV-5006 payment failed' },
      { timestamp: '2026-02-05 08:00', eventType: 'System', user: 'system', description: 'Billing warning email sent' },
      { timestamp: '2026-01-31 12:00', eventType: 'Billing', user: 'system', description: 'Invoice INV-4993 paid via card' },
    ],
  },
];

const PLAN_SEAT_DEFAULTS: Record<Plan, number> = { Starter: 5, Growth: 25, Enterprise: 100, 'White-Label': 250 };

const EXISTING_SLUGS = ['apex', 'bluesky', 'momentum', 'pinnacle', 'clearview'];

const FEATURE_LABELS: Record<string, string> = {
  aiRecommendations: 'AI Recommendations',
  sandboxAccess: 'Sandbox Access',
  apiAccess: 'API Access',
  customBranding: 'Custom Branding',
  ssoEnabled: 'SSO / SAML',
  complianceReports: 'Compliance Reports',
  dataExport: 'Data Export',
  multiCurrency: 'Multi-Currency',
};

// Minimum plan required for each feature flag
const FEATURE_REQUIRED_PLAN: Record<string, Plan> = {
  aiRecommendations: 'Growth',
  sandboxAccess: 'Starter',
  apiAccess: 'Enterprise',
  customBranding: 'Growth',
  ssoEnabled: 'Enterprise',
  complianceReports: 'Growth',
  dataExport: 'Growth',
  multiCurrency: 'Enterprise',
};

const PLAN_RANK: Record<Plan, number> = { Starter: 0, Growth: 1, Enterprise: 2, 'White-Label': 3 };

// Default feature flags per plan
const PLAN_FEATURE_DEFAULTS: Record<Plan, Record<string, boolean>> = {
  Starter: {
    aiRecommendations: false, sandboxAccess: true, apiAccess: false, customBranding: false,
    ssoEnabled: false, complianceReports: false, dataExport: false, multiCurrency: false,
  },
  Growth: {
    aiRecommendations: false, sandboxAccess: true, apiAccess: false, customBranding: true,
    ssoEnabled: false, complianceReports: true, dataExport: true, multiCurrency: false,
  },
  Enterprise: {
    aiRecommendations: true, sandboxAccess: true, apiAccess: true, customBranding: true,
    ssoEnabled: true, complianceReports: true, dataExport: true, multiCurrency: true,
  },
  'White-Label': {
    aiRecommendations: true, sandboxAccess: true, apiAccess: true, customBranding: true,
    ssoEnabled: true, complianceReports: true, dataExport: true, multiCurrency: true,
  },
};

const PLAN_PRICES: Record<Plan, string> = { Starter: '$900', Growth: '$3,600', Enterprise: '$14,400', 'White-Label': '$28,000' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planBadge(plan: Plan): string {
  if (plan === 'Enterprise') return 'bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/40';
  if (plan === 'White-Label') return 'bg-purple-900/50 text-purple-300 border border-purple-700';
  if (plan === 'Growth') return 'bg-blue-900/50 text-blue-300 border border-blue-700';
  return 'bg-gray-800 text-gray-400 border border-gray-700';
}

function statusBadge(s: Tenant['status']): string {
  if (s === 'Active') return 'bg-emerald-900/50 text-emerald-300';
  if (s === 'Trial') return 'bg-yellow-900/50 text-yellow-300';
  return 'bg-red-900/50 text-red-300';
}

function usageColor(pct: number): string {
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#C9A84C';
  return '#22c55e';
}

function usageBgClass(pct: number): string {
  if (pct >= 90) return 'text-red-400 bg-red-900/30';
  if (pct >= 70) return 'text-amber-400 bg-amber-900/30';
  return '';
}

function fmtUsage(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Toast system ─────────────────────────────────────────────────────────────

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

let toastCounter = 0;

function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-3 animate-slide-up ${
            t.type === 'success' ? 'bg-emerald-900 text-emerald-200 border border-emerald-700' :
            t.type === 'error' ? 'bg-red-900 text-red-200 border border-red-700' :
            'bg-blue-900 text-blue-200 border border-blue-700'
          }`}
        >
          <span className="flex-1">{t.text}</span>
          <button onClick={() => onDismiss(t.id)} className="text-xs opacity-60 hover:opacity-100">x</button>
        </div>
      ))}
    </div>
  );
}

// ─── Impersonation Confirmation Modal ─────────────────────────────────────────

function ImpersonateModal({ tenant, onConfirm, onClose }: { tenant: Tenant; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Impersonate Tenant</h2>
            <p className="text-xs text-gray-500 mt-0.5">You will view the platform as a <strong>{tenant.name}</strong> admin.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>
        <div className="rounded-lg bg-amber-900/20 border border-amber-700/50 p-3 text-xs text-amber-300">
          <strong>Warning:</strong> Impersonation is logged and audited. All actions taken while impersonating will be attributed to your admin account on behalf of the tenant.
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Reason for Impersonation <span className="text-red-400">*</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe why you need to impersonate this tenant..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none"
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => { if (reason.trim()) onConfirm(reason); }}
            disabled={!reason.trim()}
            className="flex-1 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Impersonation
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Suspend Modal ────────────────────────────────────────────────────────────

function SuspendModal({ tenant, onConfirm, onClose }: { tenant: Tenant; onConfirm: (reason: string, notifyAdmin: boolean, duration: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('Billing');
  const [notifyAdmin, setNotifyAdmin] = useState(true);
  const [duration, setDuration] = useState('Indefinite');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Suspend Tenant</h2>
            <p className="text-xs text-gray-500 mt-0.5">Suspend <strong>{tenant.name}</strong> access to the platform.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Suspension Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
            >
              <option>Billing</option>
              <option>Compliance</option>
              <option>Security</option>
              <option>Other</option>
            </select>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800">
            <span className="text-xs text-gray-300">Notify Tenant Admin</span>
            <button
              onClick={() => setNotifyAdmin(!notifyAdmin)}
              className={`w-10 h-5 rounded-full relative transition-colors ${notifyAdmin ? 'bg-[#C9A84C]' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${notifyAdmin ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
            >
              <option>Indefinite</option>
              <option>30 days</option>
              <option>60 days</option>
              <option>90 days</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => onConfirm(reason, notifyAdmin, duration)}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
          >
            Suspend Tenant
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reactivate Confirmation Modal ────────────────────────────────────────────

function ReactivateModal({ tenant, onConfirm, onClose }: { tenant: Tenant; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Reactivate Tenant</h2>
            <p className="text-xs text-gray-500 mt-0.5">Restore <strong>{tenant.name}</strong> access to the platform.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>
        <div className="rounded-lg bg-emerald-900/20 border border-emerald-700/50 p-3 text-xs text-emerald-300">
          This will immediately restore full platform access for all users under this tenant. Any outstanding billing issues should be resolved first.
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
          >
            Reactivate Tenant
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Tenant 3-Step Wizard ──────────────────────────────────────────────

function CreateTenantWizard({ onClose, onSubmit, allSlugs }: { onClose: () => void; onSubmit: (tenant: Tenant) => void; allSlugs: string[] }) {
  const [step, setStep] = useState(1);

  // Step 1
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState<Plan>('Starter');
  const [adminEmail, setAdminEmail] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#C9A84C');

  // Step 2
  const [advisorSeats, setAdvisorSeats] = useState(PLAN_SEAT_DEFAULTS['Starter']);
  const [clientSeats, setClientSeats] = useState(50);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({
    aiRecommendations: false, sandboxAccess: true, apiAccess: false, customBranding: false,
    ssoEnabled: false, complianceReports: false, dataExport: false, multiCurrency: false,
  });
  const [trialEnabled, setTrialEnabled] = useState(false);

  // Step 3
  const [sendWelcome, setSendWelcome] = useState(true);

  const autoSlug = useMemo(() => slugify(orgName), [orgName]);
  const actualSlug = slug || autoSlug;
  const slugTaken = allSlugs.includes(actualSlug);
  const step1Valid = orgName.trim() && actualSlug && !slugTaken && adminEmail.includes('@');

  useEffect(() => {
    setAdvisorSeats(PLAN_SEAT_DEFAULTS[plan]);
    setFeatureFlags({ ...PLAN_FEATURE_DEFAULTS[plan] });
  }, [plan]);

  function handleSubmit() {
    const initials = orgName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const newTenant: Tenant = {
      id: `ten-${Date.now()}`,
      name: orgName,
      slug: actualSlug,
      plan,
      status: trialEnabled ? 'Trial' : 'Active',
      advisors: 0,
      clients: 0,
      mrr: trialEnabled ? '$0' : PLAN_PRICES[plan],
      createdAt: new Date().toISOString().slice(0, 10),
      primaryColor,
      logoInitials: initials || 'NT',
      features: { ...featureFlags },
      usage: [
        { label: 'Advisors', used: 0, limit: advisorSeats, unit: 'seats' },
        { label: 'Clients', used: 0, limit: clientSeats, unit: 'clients' },
        { label: 'Storage', used: 0, limit: plan === 'Starter' ? 5 : plan === 'Growth' ? 25 : plan === 'Enterprise' ? 100 : 500, unit: 'GB' },
      ],
      billingStatus: 'Current',
      nextBillingDate: trialEnabled ? 'N/A (Trial)' : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      invoices: [],
      activityLog: [{ timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16), eventType: 'System', user: 'system', description: 'Tenant created' }],
      trialExpiresIn: trialEnabled ? 14 : undefined,
    };
    onSubmit(newTenant);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Create New Tenant</h2>
            <p className="text-xs text-gray-500 mt-0.5">Step {step} of 3 &mdash; {step === 1 ? 'Organization Details' : step === 2 ? 'Feature Configuration' : 'Review & Create'}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${s <= step ? 'bg-[#C9A84C]' : 'bg-gray-800'}`} />
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Organization Name</label>
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Apex Capital Group"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Slug / Subdomain</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={autoSlug || 'auto-generated'}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
              />
              {actualSlug && (
                <p className={`text-[10px] font-medium ${slugTaken ? 'text-red-400' : 'text-emerald-400'}`}>
                  {slugTaken ? `"${actualSlug}" is already taken` : `"${actualSlug}" is available`}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Plan</label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as Plan)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
                >
                  <option>Starter</option>
                  <option>Growth</option>
                  <option>Enterprise</option>
                  <option>White-Label</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Primary Color</label>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full h-9 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none cursor-pointer"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Admin Email</label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@company.com"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
          </div>
        )}

        {/* Step 2 — Feature Configuration */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-900/20 border border-blue-700/50 p-3 text-xs text-blue-300">
              Features are pre-configured for the <strong>{plan}</strong> plan. Toggle any available feature on or off.
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-400 font-medium">Feature Flags</label>
              <div className="space-y-1.5">
                {Object.entries(featureFlags).map(([key, enabled]) => {
                  const requiredPlan = FEATURE_REQUIRED_PLAN[key];
                  const available = PLAN_RANK[plan] >= PLAN_RANK[requiredPlan];
                  return (
                    <div key={key} className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${available ? 'bg-gray-800' : 'bg-gray-800/50 opacity-60'}`}>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium ${available ? 'text-gray-200' : 'text-gray-500'}`}>
                          {FEATURE_LABELS[key] ?? key}
                        </span>
                        {!available && (
                          <p className="text-[10px] text-amber-400/80 mt-0.5">Requires {requiredPlan} plan or above</p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!available}
                        onClick={() => setFeatureFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className={`w-9 h-[18px] rounded-full relative transition-colors flex-shrink-0 ml-3 ${
                          !available ? 'bg-gray-700 cursor-not-allowed' :
                          enabled ? 'bg-[#C9A84C]' : 'bg-gray-700'
                        }`}
                      >
                        <span className={`absolute top-[1px] w-4 h-4 rounded-full bg-white shadow transition-all ${enabled && available ? 'left-[18px]' : 'left-[1px]'}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800">
              <div>
                <span className="text-xs text-gray-300">Trial Period</span>
                <p className="text-[10px] text-gray-500">14-day free trial before billing starts</p>
              </div>
              <button
                type="button"
                onClick={() => setTrialEnabled(!trialEnabled)}
                className={`w-10 h-5 rounded-full relative transition-colors ${trialEnabled ? 'bg-[#C9A84C]' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${trialEnabled ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Review & Create */}
        {step === 3 && (() => {
          const enabledCount = Object.values(featureFlags).filter(Boolean).length;
          const monthlyPrice = trialEnabled ? '$0 (trial)' : PLAN_PRICES[plan];
          return (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-4 space-y-3 text-xs">
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tenant Summary</h3>
                <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                  <div><span className="text-gray-500">Organization:</span> <span className="text-gray-100 font-medium">{orgName}</span></div>
                  <div><span className="text-gray-500">Subdomain:</span> <span className="text-gray-100 font-mono">{actualSlug}.capitalforge.io</span></div>
                  <div><span className="text-gray-500">Plan:</span> <span className={`px-1.5 py-0.5 rounded ${planBadge(plan)} text-[10px] font-semibold`}>{plan}</span></div>
                  <div><span className="text-gray-500">Admin Email:</span> <span className="text-gray-100">{adminEmail}</span></div>
                  <div><span className="text-gray-500">Features Enabled:</span> <span className="text-gray-100 font-medium">{enabledCount} of {Object.keys(featureFlags).length}</span></div>
                  <div><span className="text-gray-500">Monthly Price:</span> <span className="text-[#C9A84C] font-semibold">{monthlyPrice}</span></div>
                </div>
                <div>
                  <span className="text-gray-500">Features:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(featureFlags).filter(([, v]) => v).map(([k]) => (
                      <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-800">
                        {FEATURE_LABELS[k]}
                      </span>
                    ))}
                    {enabledCount === 0 && <span className="text-gray-500">None selected</span>}
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-900/20 border border-blue-700/50 p-3 text-xs text-blue-300 flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span>An invitation email will be sent to <strong>{adminEmail}</strong> with account setup instructions.</span>
              </div>
            </div>
          );
        })()}

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !step1Valid}
              className="px-6 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-6 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
            >
              Create Tenant &amp; Send Invitation
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tenant Detail ────────────────────────────────────────────────────────────

function TenantDetail({
  tenant,
  onToggleFlag,
  flagSaveStatus,
  addToast,
  setTenants,
}: {
  tenant: Tenant;
  onToggleFlag: (tenantId: string, key: string) => void;
  flagSaveStatus: Record<string, 'saving' | 'saved' | 'error' | null>;
  addToast: (text: string, type: ToastMessage['type']) => void;
  setTenants: React.Dispatch<React.SetStateAction<Tenant[]>>;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details');

  function exportActivityCSV() {
    const header = 'Timestamp,Event Type,User,Description';
    const rows = tenant.activityLog.map(e => `"${e.timestamp}","${e.eventType}","${e.user}","${e.description}"`);
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tenant.slug}-activity-log.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Activity log exported as CSV', 'success');
  }

  return (
    <div className="space-y-4">
      {/* Trial banner for trial tenants */}
      {tenant.status === 'Trial' && tenant.trialExpiresIn != null && (
        <div className="rounded-lg bg-amber-900/20 border border-amber-700/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-sm">&#9888;</span>
            <span className="text-xs text-amber-300">
              Trial expires in <strong>{tenant.trialExpiresIn} days</strong> ({new Date(Date.now() + tenant.trialExpiresIn * 86400000).toLocaleDateString()})
            </span>
          </div>
          <button
            onClick={() => addToast(`${tenant.name} converted to paid ${tenant.plan} plan`, 'success')}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] font-semibold transition-colors"
          >
            Convert to Paid Plan
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800 w-fit">
        <button
          onClick={() => setActiveTab('details')}
          className={`text-xs px-4 py-1.5 rounded-md font-medium transition-colors ${activeTab === 'details' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`text-xs px-4 py-1.5 rounded-md font-medium transition-colors ${activeTab === 'activity' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Activity Log
        </button>
      </div>

      {activeTab === 'details' ? (
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
                    <span className="w-5 h-5 rounded-full border border-gray-600 inline-block" style={{ backgroundColor: tenant.primaryColor }} />
                    <span className="text-xs font-mono text-gray-300">{tenant.primaryColor}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">Upload Logo</button>
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">Edit Color</button>
                </div>
              </div>
            </div>
          </div>

          {/* Feature flags */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Feature Flags</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(tenant.features).map(([key, enabled]) => {
                const status = flagSaveStatus[`${tenant.id}-${key}`];
                return (
                  <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800">
                    <span className="text-xs text-gray-300">{FEATURE_LABELS[key] ?? key}</span>
                    <div className="flex items-center gap-2">
                      {status === 'saved' && (
                        <span className="text-[10px] text-emerald-400 font-medium animate-fade-out">Saved</span>
                      )}
                      {status === 'error' && (
                        <span className="text-[10px] text-red-400 font-medium">Failed</span>
                      )}
                      <button
                        onClick={() => onToggleFlag(tenant.id, key)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? 'bg-[#C9A84C]' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Billing section */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Billing</h4>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${planBadge(tenant.plan)}`}>{tenant.plan}</span>
                  <span className="text-lg font-bold text-white tabular-nums">{tenant.mrr}</span>
                  <span className="text-xs text-gray-500">/ mo</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-gray-500">Status: </span>
                    <span className={tenant.billingStatus === 'Current' ? 'text-emerald-400' : 'text-red-400 font-semibold'}>
                      {tenant.billingStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Next Billing: </span>
                    <span className="text-gray-300">{tenant.nextBillingDate}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const plans: Plan[] = ['Starter', 'Growth', 'Enterprise', 'White-Label'];
                    const idx = plans.indexOf(tenant.plan);
                    if (idx < plans.length - 1) {
                      const next = plans[idx + 1];
                      setTenants((prev) => prev.map((t) => t.id === tenant.id ? { ...t, plan: next } : t));
                      addToast(`Upgraded ${tenant.name} to ${next}`, 'success');
                    } else {
                      addToast('Already on highest plan', 'info');
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
                >
                  Upgrade
                </button>
                <button
                  onClick={() => {
                    const plans: Plan[] = ['Starter', 'Growth', 'Enterprise', 'White-Label'];
                    const idx = plans.indexOf(tenant.plan);
                    if (idx > 0) {
                      const prev = plans[idx - 1];
                      setTenants((p) => p.map((t) => t.id === tenant.id ? { ...t, plan: prev } : t));
                      addToast(`Downgraded ${tenant.name} to ${prev}`, 'info');
                    } else {
                      addToast('Already on lowest plan', 'info');
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 hover:bg-gray-800 text-gray-300 font-semibold transition-colors"
                >
                  Downgrade
                </button>
              </div>
            </div>

            {/* Invoices table */}
            {tenant.invoices.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Recent Invoices</h5>
                <div className="rounded-lg border border-gray-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-800/50 text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">Invoice #</th>
                        <th className="text-left px-3 py-2 font-medium">Period</th>
                        <th className="text-right px-3 py-2 font-medium">Amount</th>
                        <th className="text-right px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {tenant.invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-800/30">
                          <td className="px-3 py-2 text-gray-300 font-mono">{inv.id}</td>
                          <td className="px-3 py-2 text-gray-300">{inv.period}</td>
                          <td className="px-3 py-2 text-gray-300 text-right tabular-nums">{inv.amount}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              inv.status === 'Paid' ? 'bg-emerald-900/50 text-emerald-300' :
                              inv.status === 'Overdue' ? 'bg-red-900/50 text-red-300' :
                              'bg-yellow-900/50 text-yellow-300'
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={() => addToast('Full invoice history would load here', 'info')}
                  className="text-[10px] text-[#C9A84C] hover:underline"
                >
                  View All Invoices &rarr;
                </button>
              </div>
            )}
          </div>

          {/* Usage meters */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Usage Meters</h4>
            <div className="space-y-4">
              {tenant.usage.map((meter) => {
                const pct = meter.limit > 0 ? Math.round((meter.used / meter.limit) * 100) : 0;
                const colorClass = usageBgClass(pct);
                return (
                  <div key={meter.label} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-300 font-medium">{meter.label}</span>
                        {pct >= 70 && pct < 90 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${colorClass}`}>Approaching Limit</span>
                        )}
                        {pct >= 90 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${colorClass}`}>At Limit</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 tabular-nums">
                          {meter.limit > 0 ? `${fmtUsage(meter.used)} / ${fmtUsage(meter.limit)} ${meter.unit}` : 'Unlimited'}
                        </span>
                        {meter.limit > 0 && (
                          <button
                            onClick={() => addToast(`Limit increase requested for ${meter.label}`, 'success')}
                            className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                          >
                            Increase Limit
                          </button>
                        )}
                      </div>
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
        </div>
      ) : (
        /* Activity Log tab */
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Activity Log</h4>
            <button
              onClick={exportActivityCSV}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Export CSV
            </button>
          </div>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800/50 text-gray-500">
                  <th className="text-left px-3 py-2 font-medium">Timestamp</th>
                  <th className="text-left px-3 py-2 font-medium">Event Type</th>
                  <th className="text-left px-3 py-2 font-medium">User</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tenant.activityLog.map((event, i) => (
                  <tr key={i} className="hover:bg-gray-800/30">
                    <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{event.timestamp}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 font-medium">
                        {event.eventType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-300">{event.user}</td>
                    <td className="px-3 py-2 text-gray-400">{event.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MultiTenantPage() {
  const [tenants, setTenants] = useState<Tenant[]>(TENANTS_INITIAL);
  const [selected, setSelected] = useState<string | null>(TENANTS_INITIAL[0].id);
  const [showCreate, setShowCreate] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Impersonation state
  const [impersonating, setImpersonating] = useState<{ tenantId: string; tenantName: string } | null>(null);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);

  // Suspend / Reactivate modals
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);

  // Feature flag save status
  const [flagSaveStatus, setFlagSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error' | null>>({});

  // Hydrate impersonation from localStorage on mount
  useEffect(() => {
    const storedId = localStorage.getItem('impersonatedTenantId');
    const storedName = localStorage.getItem('impersonatedTenantName');
    if (storedId && storedName) {
      setImpersonating({ tenantId: storedId, tenantName: storedName });
    }
  }, []);

  const selectedTenant = tenants.find((t) => t.id === selected) ?? null;
  const allSlugs = tenants.map(t => t.slug);

  const addToast = useCallback((text: string, type: ToastMessage['type'] = 'success') => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Impersonation ──
  function handleImpersonate(reason: string) {
    if (!selectedTenant) return;
    setShowImpersonateModal(false);
    setImpersonating({ tenantId: selectedTenant.id, tenantName: selectedTenant.name });
    // Store tenantId in localStorage for testing/impersonation
    localStorage.setItem('impersonatedTenantId', selectedTenant.id);
    localStorage.setItem('impersonatedTenantName', selectedTenant.name);
    addToast(`Now impersonating ${selectedTenant.name}`, 'info');
  }

  function exitImpersonation() {
    const name = impersonating?.tenantName;
    setImpersonating(null);
    // Clear impersonation from localStorage
    localStorage.removeItem('impersonatedTenantId');
    localStorage.removeItem('impersonatedTenantName');
    addToast(`Exited impersonation of ${name}`, 'success');
  }

  // ── Suspend ──
  function handleSuspend(reason: string, notifyAdmin: boolean, duration: string) {
    if (!selectedTenant) return;
    setShowSuspendModal(false);
    setTenants((prev) =>
      prev.map((t) => (t.id === selectedTenant.id ? { ...t, status: 'Suspended' as const } : t))
    );
    addToast(`${selectedTenant.name} suspended`, 'success');
  }

  // ── Reactivate ──
  function handleReactivate() {
    if (!selectedTenant) return;
    setShowReactivateModal(false);
    setTenants((prev) =>
      prev.map((t) => (t.id === selectedTenant.id ? { ...t, status: 'Active' as const } : t))
    );
    addToast(`${selectedTenant.name} reactivated successfully`, 'success');
  }

  // ── Feature flag toggle with optimistic update ──
  function handleToggleFlag(tenantId: string, key: string) {
    const statusKey = `${tenantId}-${key}`;
    const currentTenant = tenants.find((t) => t.id === tenantId);
    const currentValue = currentTenant?.features[key] ?? false;
    const newValue = !currentValue;

    // Optimistic update
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tenantId ? { ...t, features: { ...t.features, [key]: newValue } } : t
      )
    );
    setFlagSaveStatus((prev) => ({ ...prev, [statusKey]: 'saving' }));

    // Mock API PATCH /api/tenants/:id/features
    // In production, replace with: fetch(`/api/tenants/${tenantId}/features`, { method: 'PATCH', body: JSON.stringify({ [key]: newValue }) })
    setTimeout(() => {
      // 90% success rate simulation
      const success = Math.random() > 0.1;
      if (success) {
        setFlagSaveStatus((prev) => ({ ...prev, [statusKey]: 'saved' }));
        // Show toast with flag name and tenant
        const flagLabel = FEATURE_LABELS[key] ?? key;
        addToast(
          `${flagLabel} ${newValue ? 'enabled' : 'disabled'} for ${currentTenant?.name ?? 'tenant'}`,
          'success'
        );
        // Clear "Saved" after 2s
        setTimeout(() => {
          setFlagSaveStatus((prev) => ({ ...prev, [statusKey]: null }));
        }, 2000);
      } else {
        // Revert
        setTenants((prev) =>
          prev.map((t) =>
            t.id === tenantId ? { ...t, features: { ...t.features, [key]: !t.features[key] } } : t
          )
        );
        setFlagSaveStatus((prev) => ({ ...prev, [statusKey]: 'error' }));
        addToast(`Failed to update ${FEATURE_LABELS[key] ?? key}. Reverted.`, 'error');
        setTimeout(() => {
          setFlagSaveStatus((prev) => ({ ...prev, [statusKey]: null }));
        }, 3000);
      }
    }, 600);
  }

  // ── Create tenant ──
  function handleCreateTenant(tenant: Tenant) {
    setTenants((prev) => [...prev, tenant]);
    setSelected(tenant.id);
    setShowCreate(false);
    addToast(`${tenant.name} created successfully — invitation sent`, 'success');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">
      {/* Animation styles */}
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-up { animation: slideUp 0.3s ease-out; }
        @keyframes fadeOut { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
        .animate-fade-out { animation: fadeOut 2s ease-out forwards; }
      `}</style>

      {/* Toast container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Modals */}
      {showCreate && (
        <CreateTenantWizard
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreateTenant}
          allSlugs={allSlugs}
        />
      )}
      {showImpersonateModal && selectedTenant && (
        <ImpersonateModal
          tenant={selectedTenant}
          onConfirm={handleImpersonate}
          onClose={() => setShowImpersonateModal(false)}
        />
      )}
      {showSuspendModal && selectedTenant && (
        <SuspendModal
          tenant={selectedTenant}
          onConfirm={handleSuspend}
          onClose={() => setShowSuspendModal(false)}
        />
      )}
      {showReactivateModal && selectedTenant && (
        <ReactivateModal
          tenant={selectedTenant}
          onConfirm={handleReactivate}
          onClose={() => setShowReactivateModal(false)}
        />
      )}

      {/* ── Impersonation Banner ──────────────────────────────── */}
      {impersonating && (
        <div className="rounded-lg bg-amber-900/30 border border-amber-700/60 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <span>&#9888;</span>
            <span><strong>Impersonation Mode:</strong> Viewing as <strong>{impersonating.tenantName}</strong> admin.</span>
          </div>
          <button
            onClick={exitImpersonation}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
          >
            End Session
          </button>
        </div>
      )}

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
          { label: 'Total Tenants', value: String(tenants.length), sub: `${tenants.filter(t => t.status === 'Active').length} active` },
          { label: 'Total Advisors', value: String(tenants.reduce((s, t) => s + t.advisors, 0)), sub: 'Across all orgs' },
          { label: 'Total Clients', value: tenants.reduce((s, t) => s + t.clients, 0).toLocaleString(), sub: 'Active enrollments' },
          { label: 'Platform MRR', value: '$' + tenants.reduce((s, t) => s + Number(t.mrr.replace(/[$,]/g, '')), 0).toLocaleString(), sub: 'March 2026' },
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
          {tenants.map((tenant) => (
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
                    {tenant.status === 'Trial' && tenant.trialExpiresIn != null && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700">
                        Trial expires in {tenant.trialExpiresIn} days
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${planBadge(tenant.plan)}`}>
                      {tenant.plan}
                    </span>
                    <span className="text-[10px] text-gray-500">{tenant.advisors} advisors &middot; {tenant.clients} clients</span>
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
                  <button
                    onClick={() => setShowImpersonateModal(true)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    Impersonate
                  </button>
                  {selectedTenant.status === 'Suspended' ? (
                    <button
                      onClick={() => setShowReactivateModal(true)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] font-semibold transition-colors"
                    >
                      Reactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowSuspendModal(true)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors"
                    >
                      Suspend
                    </button>
                  )}
                </div>
              </div>
              <TenantDetail
                tenant={selectedTenant}
                onToggleFlag={handleToggleFlag}
                flagSaveStatus={flagSaveStatus}
                addToast={addToast}
                setTenants={setTenants}
              />
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
