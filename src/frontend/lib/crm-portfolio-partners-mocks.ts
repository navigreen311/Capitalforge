// ============================================================
// CapitalForge CRM, Portfolio Analytics & Partners Mock Data
// ============================================================
// Mock data for CRM advisor performance, lead sources, follow-up
// queue, churn analysis, portfolio analytics, and partner endpoints.
// ============================================================

// ── Date helpers ───────────────────────────────────────────────────────────

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function monthLabel(offsetMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── CRM: Advisor Performance ──────────────────────────────────────────────

const MOCK_ADVISOR_PERFORMANCE = {
  advisors: [
    {
      name: 'Sarah Chen',
      clients: 12,
      deals_closed: 8,
      close_rate_pct: 71,
      avg_deal_size: 48000,
      revenue_mtd: 24000,
      nps: 82,
      performance_status: 'Exceeding' as const,
    },
    {
      name: 'Marcus Webb',
      clients: 9,
      deals_closed: 5,
      close_rate_pct: 64,
      avg_deal_size: 41000,
      revenue_mtd: 18000,
      nps: 74,
      performance_status: 'On Target' as const,
    },
    {
      name: 'Diana Ross',
      clients: 7,
      deals_closed: 3,
      close_rate_pct: 58,
      avg_deal_size: 39000,
      revenue_mtd: 12000,
      nps: 68,
      performance_status: 'Behind' as const,
    },
    {
      name: 'Admin',
      clients: 14,
      deals_closed: 11,
      close_rate_pct: 74,
      avg_deal_size: 52000,
      revenue_mtd: 31000,
      nps: 88,
      performance_status: 'Exceeding' as const,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── CRM: Lead Sources ─────────────────────────────────────────────────────

const MOCK_LEAD_SOURCES = {
  sources: [
    { name: 'Referral', share_pct: 38, delta_vs_last_month: 4.2 },
    { name: 'Direct Outreach', share_pct: 24, delta_vs_last_month: -1.8 },
    { name: 'Affiliate', share_pct: 19, delta_vs_last_month: 2.1 },
    { name: 'Organic Web', share_pct: 11, delta_vs_last_month: -0.5 },
    { name: 'Partner', share_pct: 8, delta_vs_last_month: -1.3 },
  ],
  last_updated: new Date().toISOString(),
};

// ── CRM: Follow-Up Queue ──────────────────────────────────────────────────

const MOCK_FOLLOWUP_QUEUE = {
  total: 6,
  items: [
    {
      client_name: 'Meridian Holdings LLC',
      stage: 'Negotiation',
      last_contact: daysFromNow(-3),
      followup_type: 'Call',
      advisor: 'Sarah Chen',
      overdue: true,
    },
    {
      client_name: 'Apex Ventures Inc.',
      stage: 'Proposal Sent',
      last_contact: daysFromNow(-1),
      followup_type: 'Email',
      advisor: 'Marcus Webb',
      overdue: false,
    },
    {
      client_name: 'Brightline Corp',
      stage: 'Qualification',
      last_contact: daysFromNow(-5),
      followup_type: 'Meeting',
      advisor: 'Diana Ross',
      overdue: true,
    },
    {
      client_name: 'Thornwood Capital',
      stage: 'Onboarding',
      last_contact: daysFromNow(-2),
      followup_type: 'Call',
      advisor: 'Admin',
      overdue: false,
    },
    {
      client_name: 'Norcal Transport LLC',
      stage: 'Re-engagement',
      last_contact: daysFromNow(-7),
      followup_type: 'Email',
      advisor: 'Sarah Chen',
      overdue: true,
    },
    {
      client_name: 'Summit Financial Group',
      stage: 'Discovery',
      last_contact: daysFromNow(-1),
      followup_type: 'Call',
      advisor: 'Marcus Webb',
      overdue: false,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── CRM: Churn Analysis ──────────────────────────────────────────────────

const MOCK_CHURN_ANALYSIS = {
  reasons: [
    { reason: 'Fees too high', pct: 32 },
    { reason: 'Found alternative provider', pct: 28 },
    { reason: 'Credit issues / denial', pct: 22 },
    { reason: 'Personal / business closure', pct: 12 },
    { reason: 'Other', pct: 6 },
  ],
  avg_time_to_churn_months: 4.2,
  trend: [
    { month: monthLabel(-5), churned: 3 },
    { month: monthLabel(-4), churned: 5 },
    { month: monthLabel(-3), churned: 2 },
    { month: monthLabel(-2), churned: 4 },
    { month: monthLabel(-1), churned: 6 },
    { month: monthLabel(0), churned: 3 },
  ],
  re_engagement: [
    { client_name: 'Delta Logistics', left_date: daysFromNow(-90), reason: 'Fees too high', win_back_probability: 0.65 },
    { client_name: 'Orion Consulting', left_date: daysFromNow(-60), reason: 'Found alternative provider', win_back_probability: 0.42 },
    { client_name: 'Pinecrest Holdings', left_date: daysFromNow(-45), reason: 'Credit issues / denial', win_back_probability: 0.78 },
  ],
  last_updated: new Date().toISOString(),
};

// ── Analytics: Promo Survival ─────────────────────────────────────────────

const MOCK_PROMO_SURVIVAL = {
  survival_rate: 74,
  curve_data: {
    issuers: ['Chase', 'American Express', 'Capital One', 'Citi', 'US Bank'],
    time_points: Array.from({ length: 12 }, (_, i) => i + 1),
    curves: {
      Chase:            [100, 97, 94, 90, 86, 82, 78, 75, 72, 70, 68, 66],
      'American Express': [100, 98, 95, 92, 88, 84, 80, 77, 74, 71, 69, 67],
      'Capital One':    [100, 96, 91, 86, 81, 76, 72, 68, 65, 62, 59, 57],
      Citi:             [100, 97, 93, 89, 85, 81, 77, 74, 71, 69, 67, 65],
      'US Bank':        [100, 98, 96, 93, 90, 87, 84, 82, 80, 78, 76, 74],
    } as Record<string, number[]>,
  },
  at_risk: [
    { urgency: 'critical', count: 4, total_credit: 320000 },
    { urgency: 'high', count: 8, total_credit: 580000 },
    { urgency: 'moderate', count: 12, total_credit: 720000 },
  ],
  avg_days_to_payoff: {
    Chase: 245,
    'American Express': 268,
    'Capital One': 210,
    Citi: 252,
    'US Bank': 290,
  },
  last_updated: new Date().toISOString(),
};

// ── Analytics: Complaint Rates ────────────────────────────────────────────

const MOCK_COMPLAINT_RATES = {
  total: {
    mtd: 14,
    qtd: 38,
    ytd: 112,
  },
  type_breakdown: [
    { type: 'Billing dispute', count: 5 },
    { type: 'Service quality', count: 4 },
    { type: 'Unauthorized charge', count: 2 },
    { type: 'Disclosure issue', count: 2 },
    { type: 'Other', count: 1 },
  ],
  resolution: {
    avg_days: 3.8,
    open: 6,
    closed: 8,
    escalated: 2,
  },
  regulatory_escalation: {
    state_ag: 0,
    cfpb: 0,
  },
  trend: [
    { month: monthLabel(-5), complaints: 18 },
    { month: monthLabel(-4), complaints: 22 },
    { month: monthLabel(-3), complaints: 16 },
    { month: monthLabel(-2), complaints: 20 },
    { month: monthLabel(-1), complaints: 24 },
    { month: monthLabel(0), complaints: 14 },
  ],
  last_updated: new Date().toISOString(),
};

// ── Analytics: Cohort Profitability ───────────────────────────────────────

const MOCK_COHORT_PROFITABILITY = {
  ltv_by_tier: [
    { tier: 'Platinum', avg_ltv: 18500, clients: 8 },
    { tier: 'Gold', avg_ltv: 12200, clients: 14 },
    { tier: 'Silver', avg_ltv: 7800, clients: 22 },
    { tier: 'Bronze', avg_ltv: 3400, clients: 31 },
  ],
  cohort_table: [
    { cohort: 'Q1 2025', clients: 12, retained_pct: 88, avg_revenue: 4200 },
    { cohort: 'Q2 2025', clients: 18, retained_pct: 82, avg_revenue: 3800 },
    { cohort: 'Q3 2025', clients: 15, retained_pct: 76, avg_revenue: 3500 },
    { cohort: 'Q4 2025', clients: 20, retained_pct: 71, avg_revenue: 3100 },
  ],
  fee_retention_rate_pct: 62,
  last_updated: new Date().toISOString(),
};

// ── Analytics: Risk Heatmap ───────────────────────────────────────────────

const MOCK_RISK_HEATMAP = {
  fico_bands: ['300-499', '500-579', '580-669', '670-739', '740-799', '800-850'],
  issuers: ['Chase', 'American Express', 'Capital One', 'Citi', 'Wells Fargo', 'US Bank', 'Discover'],
  scores: [
    // 300-499
    [92, 88, 95, 90, 87, 93, 91],
    // 500-579
    [74, 70, 78, 72, 69, 76, 73],
    // 580-669
    [52, 48, 58, 50, 46, 55, 51],
    // 670-739
    [30, 26, 35, 28, 24, 32, 29],
    // 740-799
    [14, 12, 18, 13, 11, 16, 14],
    // 800-850
    [5, 4, 8, 5, 3, 6, 5],
  ],
  last_updated: new Date().toISOString(),
};

// ── Partners: Enforcement Check ───────────────────────────────────────────

const MOCK_ENFORCEMENT_CHECK = {
  status: 'clear',
  last_checked: new Date().toISOString(),
  flags: [],
  summary: 'No active enforcement actions found.',
};

// ── Endpoint resolver ─────────────────────────────────────────────────────

const endpointMap: Record<string, unknown> = {
  '/api/v1/crm/advisor-performance': MOCK_ADVISOR_PERFORMANCE,
  '/api/v1/crm/lead-sources': MOCK_LEAD_SOURCES,
  '/api/v1/crm/followup-queue': MOCK_FOLLOWUP_QUEUE,
  '/api/v1/crm/churn-analysis': MOCK_CHURN_ANALYSIS,
  '/api/v1/analytics/promo-survival': MOCK_PROMO_SURVIVAL,
  '/api/v1/analytics/complaint-rates': MOCK_COMPLAINT_RATES,
  '/api/v1/analytics/cohort-profitability': MOCK_COHORT_PROFITABILITY,
  '/api/v1/analytics/risk-heatmap': MOCK_RISK_HEATMAP,
  '/api/v1/partners/enforcement-check': MOCK_ENFORCEMENT_CHECK,
};

export function getCrmPortfolioPartnersMockData(endpoint: string): unknown | null {
  return endpointMap[endpoint] ?? null;
}
