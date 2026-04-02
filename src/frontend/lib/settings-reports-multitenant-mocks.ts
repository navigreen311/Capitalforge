// ============================================================
// CapitalForge Settings, Reports & Multi-Tenant Mock Data
// ============================================================
// Mock data for settings integrations, API keys, revenue
// analytics, issuer benchmarks, and tenant activity log.
// Activate via NEXT_PUBLIC_USE_MOCK_DATA=true in .env.local
// ============================================================

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function hoursFromNow(hours: number): string {
  const d = new Date();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}

// ── Settings: Integrations ────────────────────────────────────

const MOCK_INTEGRATIONS = {
  integrations: [
    {
      provider: 'Plaid',
      status: 'connected' as const,
      category: 'banking',
      lastSync: hoursFromNow(-1),
    },
    {
      provider: 'DocuSign',
      status: 'connected' as const,
      category: 'documents',
      lastSync: hoursFromNow(-3),
    },
    {
      provider: 'Stripe',
      status: 'connected' as const,
      category: 'payments',
      lastSync: hoursFromNow(-0.5),
    },
    {
      provider: 'QuickBooks',
      status: 'disconnected' as const,
      category: 'accounting',
      lastSync: null,
    },
    {
      provider: 'Xero',
      status: 'disconnected' as const,
      category: 'accounting',
      lastSync: null,
    },
    {
      provider: 'VoiceForge',
      status: 'disconnected' as const,
      category: 'communications',
      lastSync: null,
    },
    {
      provider: 'Twilio',
      status: 'disconnected' as const,
      category: 'communications',
      lastSync: null,
    },
    {
      provider: 'SendGrid',
      status: 'disconnected' as const,
      category: 'email',
      lastSync: null,
    },
    {
      provider: 'Slack',
      status: 'disconnected' as const,
      category: 'notifications',
      lastSync: null,
    },
    {
      provider: 'VisionAudioForge',
      status: 'disconnected' as const,
      category: 'media',
      lastSync: null,
    },
    {
      provider: 'Equifax Business',
      status: 'disconnected' as const,
      category: 'credit_bureau',
      lastSync: null,
    },
    {
      provider: 'Experian Business',
      status: 'disconnected' as const,
      category: 'credit_bureau',
      lastSync: null,
    },
    {
      provider: 'Dun & Bradstreet',
      status: 'disconnected' as const,
      category: 'credit_bureau',
      lastSync: null,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Settings: API Keys ────────────────────────────────────────

const MOCK_API_KEYS = {
  keys: [
    {
      id: 'key_prod_001',
      name: 'Production Key',
      scopes: ['read:clients', 'write:applications'],
      created: daysFromNow(-90),
      lastUsed: hoursFromNow(-2),
      status: 'active' as const,
    },
    {
      id: 'key_wh_002',
      name: 'Webhook Listener',
      scopes: ['read:events'],
      created: daysFromNow(-45),
      lastUsed: hoursFromNow(-0.25),
      status: 'active' as const,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Reports: Revenue Analytics ────────────────────────────────

const MOCK_REVENUE_ANALYTICS = {
  stats: {
    total_ytd: 900400,
    avg_per_client: 6022,
    fee_retention: 68,
    gross_margin: 74,
  },
  monthly: [
    { month: 'Jan', program_fees: 62000, funding_fees: 18500, annual_fees: 4200 },
    { month: 'Feb', program_fees: 58000, funding_fees: 17200, annual_fees: 4200 },
    { month: 'Mar', program_fees: 71000, funding_fees: 21000, annual_fees: 4200 },
    { month: 'Apr', program_fees: 68000, funding_fees: 19800, annual_fees: 4200 },
    { month: 'May', program_fees: 74000, funding_fees: 22500, annual_fees: 4200 },
    { month: 'Jun', program_fees: 80000, funding_fees: 24000, annual_fees: 4200 },
    { month: 'Jul', program_fees: 76000, funding_fees: 23100, annual_fees: 4200 },
    { month: 'Aug', program_fees: 82000, funding_fees: 25000, annual_fees: 4200 },
    { month: 'Sep', program_fees: 79000, funding_fees: 23800, annual_fees: 4200 },
    { month: 'Oct', program_fees: 85000, funding_fees: 26200, annual_fees: 4200 },
    { month: 'Nov', program_fees: 88000, funding_fees: 27500, annual_fees: 4200 },
    { month: 'Dec', program_fees: 91000, funding_fees: 28800, annual_fees: 4200 },
  ],
  advisor_revenue: [
    { advisor: 'Sarah Chen', revenue: 312000, clients: 48 },
    { advisor: 'Marcus Reid', revenue: 258000, clients: 39 },
    { advisor: 'Olivia Torres', revenue: 198000, clients: 32 },
    { advisor: 'James Park', revenue: 132400, clients: 22 },
  ],
  fee_breakdown: [
    { type: 'Program Fees', percentage: 58 },
    { type: 'Funding Fees', percentage: 24 },
    { type: 'Annual Fees', percentage: 11 },
    { type: 'Late / Penalty Fees', percentage: 7 },
  ],
  last_updated: new Date().toISOString(),
};

// ── Reports: Issuer Benchmarks ────────────────────────────────

const MOCK_BENCHMARKS = {
  issuers: [
    { issuer: 'Chase', approval_rate: 68 },
    { issuer: 'American Express', approval_rate: 62 },
    { issuer: 'Capital One', approval_rate: 59 },
    { issuer: 'Citi', approval_rate: 55 },
    { issuer: 'Bank of America', approval_rate: 61 },
    { issuer: 'US Bank', approval_rate: 54 },
    { issuer: 'Discover', approval_rate: 57 },
  ],
  last_updated: new Date().toISOString(),
};

// ── Tenants: Activity Log ─────────────────────────────────────

const MOCK_TENANT_ACTIVITY_LOG = {
  tenant: 'Apex Capital Group',
  events: [
    { id: 'evt_001', type: 'login', actor: 'admin@apexcapital.com', detail: 'Logged in from 192.168.1.42', timestamp: hoursFromNow(-0.5) },
    { id: 'evt_002', type: 'config_change', actor: 'admin@apexcapital.com', detail: 'Updated default funding round target to $300K', timestamp: hoursFromNow(-1) },
    { id: 'evt_003', type: 'user_invite', actor: 'admin@apexcapital.com', detail: 'Invited jessica.lee@apexcapital.com as Advisor', timestamp: hoursFromNow(-2) },
    { id: 'evt_004', type: 'feature_flag_toggle', actor: 'admin@apexcapital.com', detail: 'Enabled feature flag: credit-builder-v2', timestamp: hoursFromNow(-3) },
    { id: 'evt_005', type: 'login', actor: 'jessica.lee@apexcapital.com', detail: 'Logged in from 10.0.0.15', timestamp: hoursFromNow(-4) },
    { id: 'evt_006', type: 'config_change', actor: 'jessica.lee@apexcapital.com', detail: 'Changed notification preferences to email-only', timestamp: hoursFromNow(-5) },
    { id: 'evt_007', type: 'impersonation', actor: 'superadmin@capitalforge.io', detail: 'Impersonated admin@apexcapital.com for support ticket #4821', timestamp: hoursFromNow(-8) },
    { id: 'evt_008', type: 'user_invite', actor: 'admin@apexcapital.com', detail: 'Invited mark.tanaka@apexcapital.com as Read-Only', timestamp: hoursFromNow(-12) },
    { id: 'evt_009', type: 'feature_flag_toggle', actor: 'superadmin@capitalforge.io', detail: 'Disabled feature flag: experimental-ai-scoring', timestamp: hoursFromNow(-18) },
    { id: 'evt_010', type: 'login', actor: 'mark.tanaka@apexcapital.com', detail: 'Logged in from 172.16.0.88', timestamp: hoursFromNow(-24) },
    { id: 'evt_011', type: 'config_change', actor: 'admin@apexcapital.com', detail: 'Set auto-pay reminder cadence to 3 days before due', timestamp: hoursFromNow(-36) },
    { id: 'evt_012', type: 'impersonation', actor: 'superadmin@capitalforge.io', detail: 'Impersonated jessica.lee@apexcapital.com for onboarding walkthrough', timestamp: hoursFromNow(-48) },
  ],
  last_updated: new Date().toISOString(),
};

// ── Endpoint resolver ─────────────────────────────────────────

const SETTINGS_REPORTS_MT_MAP: Record<string, unknown> = {
  '/api/v1/settings/integrations': MOCK_INTEGRATIONS,
  '/api/v1/settings/api-keys': MOCK_API_KEYS,
  '/api/v1/reports/revenue-analytics': MOCK_REVENUE_ANALYTICS,
  '/api/v1/reports/benchmarks': MOCK_BENCHMARKS,
  '/api/v1/tenants/activity-log': MOCK_TENANT_ACTIVITY_LOG,
};

export function getSettingsReportsMTMockData(endpoint: string): unknown | null {
  return SETTINGS_REPORTS_MT_MAP[endpoint] ?? null;
}
