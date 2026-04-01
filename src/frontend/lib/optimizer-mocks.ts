// ============================================================
// CapitalForge Optimizer Mock Data
// ============================================================
// Full optimization engine mock data: run results, clients,
// and optimization history.
// Activate via NEXT_PUBLIC_USE_MOCK_DATA=true in .env.local
// ============================================================

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function dateOnly(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// ── Optimizer Run Results ────────────────────────────────────────

const MOCK_OPTIMIZER_RUN = {
  recommendations: [
    {
      rank: 1,
      card_product: 'Ink Business Preferred Credit Card',
      issuer: 'Chase',
      network: 'Visa',
      approval_probability: 0.91,
      intro_apr_months: 12,
      ongoing_apr_min: 18.49,
      ongoing_apr_max: 23.49,
      annual_fee: 95,
      credit_limit_min: 50000,
      credit_limit_max: 100000,
      rewards: '3x on travel, shipping, internet, advertising (up to $150K/yr)',
      projected_apr_expiry: daysFromNow(365),
      velocity_warnings: [],
      score_breakdown: {
        positives: [
          'Strong personal FICO (780+) aligns with Chase tier-1 criteria',
          'Business vintage >2 years satisfies underwriting threshold',
          'No Chase cards opened in past 12 months — clean velocity window',
          'Annual revenue exceeds $250K minimum for Ink Preferred',
        ],
        negatives: [
          'Client approaching 4/24 — one more card will trigger Chase 5/24 block',
        ],
      },
    },
    {
      rank: 2,
      card_product: 'Blue Business Plus Credit Card',
      issuer: 'American Express',
      network: 'Amex',
      approval_probability: 0.87,
      intro_apr_months: 12,
      ongoing_apr_min: 17.49,
      ongoing_apr_max: 25.49,
      annual_fee: 0,
      credit_limit_min: 30000,
      credit_limit_max: 75000,
      rewards: '2x on all purchases up to $50K/yr, then 1x',
      projected_apr_expiry: daysFromNow(365),
      velocity_warnings: [],
      score_breakdown: {
        positives: [
          'No annual fee reduces cost-of-capital drag',
          'Amex tends to grant higher limits after 60-day CLI requests',
          'Client has existing Amex relationship — increases approval odds',
        ],
        negatives: [
          'Amex 2/90 rule limits stacking speed — must wait 90 days before next Amex app',
          'Lower initial limit compared to Chase Ink Preferred',
        ],
      },
    },
    {
      rank: 3,
      card_product: 'Spark Cash Plus',
      issuer: 'Capital One',
      network: 'Visa',
      approval_probability: 0.79,
      intro_apr_months: 9,
      ongoing_apr_min: 22.99,
      ongoing_apr_max: 28.99,
      annual_fee: 150,
      credit_limit_min: 25000,
      credit_limit_max: 50000,
      rewards: '2% cash back on all purchases, unlimited',
      projected_apr_expiry: daysFromNow(270),
      velocity_warnings: [
        'Capital One may restrict limit if >3 inquiries in 6 months',
      ],
      score_breakdown: {
        positives: [
          'Capital One has higher approval rates for sub-3-year businesses',
          'Unlimited 2% back provides predictable rewards value',
        ],
        negatives: [
          'Higher ongoing APR range than Ink Preferred or Blue Business Plus',
          '$150 annual fee with shorter intro APR period reduces net value',
          '3 inquiries in past 6 months may trigger conservative limit',
        ],
      },
    },
    {
      rank: 4,
      card_product: 'World Elite Business Card',
      issuer: 'US Bank',
      network: 'Mastercard',
      approval_probability: 0.68,
      intro_apr_months: 15,
      ongoing_apr_min: 15.49,
      ongoing_apr_max: 24.49,
      annual_fee: 0,
      credit_limit_min: 20000,
      credit_limit_max: 45000,
      rewards: '3% on gas/EV, office supplies; 1% everything else',
      projected_apr_expiry: daysFromNow(456),
      velocity_warnings: [
        'US Bank pulls Experian in most states — client Experian score is 12 pts lower than TransUnion',
      ],
      score_breakdown: {
        positives: [
          'Longest intro APR period (15 months) maximizes 0% runway',
          'No annual fee — pure capital tool',
          'Diversifies network exposure to Mastercard',
        ],
        negatives: [
          'Lower approval probability due to US Bank conservative underwriting',
          'US Bank typically assigns lower initial limits',
          'Experian pull may yield lower score than TransUnion-pulling issuers',
        ],
      },
    },
  ],
  suitability: {
    score: 84,
    label: 'Strong Candidate',
    max_safe_leverage: 425000,
    current_outstanding: 112500,
    remaining_capacity: 312500,
    recommended_stack_size: 3,
    strategy: 'Aggressive stacking viable — strong personal credit and business fundamentals support 3-card round. Recommend Chase first (highest probability), then Amex after 30 days, then Capital One or US Bank after 60 days. Avoid exceeding 4 new accounts to preserve Chase 5/24 eligibility for future rounds.',
  },
  issuer_violations: [
    {
      issuer: 'Chase',
      rule: '5/24',
      severity: 'block',
      detail: 'Client currently at 4/24. Opening the recommended Ink Preferred will push to 5/24, permanently blocking further Chase applications until oldest card ages out in 14 months. Proceed only if Chase is the priority issuer.',
      cards_contributing: 4,
      max_allowed: 5,
      cooldown_months: null,
    },
    {
      issuer: 'American Express',
      rule: '2/90',
      severity: 'caution',
      detail: 'Client opened an Amex Gold 47 days ago. Must wait at least 43 more days before applying for Blue Business Plus to comply with the 2/90 velocity rule.',
      cards_contributing: 1,
      max_allowed: 2,
      cooldown_months: 1.4,
    },
  ],
  sequencing: [
    {
      round: 1,
      cards: ['Ink Business Preferred Credit Card'],
      rationale: 'Chase first — highest approval probability and best limit range. Apply before hitting 5/24 ceiling.',
      wait_days: 0,
      credit_estimate_min: 50000,
      credit_estimate_max: 100000,
    },
    {
      round: 2,
      cards: ['Blue Business Plus Credit Card'],
      rationale: 'Amex second — wait 45 days to clear 2/90 window. Existing Amex relationship boosts approval odds.',
      wait_days: 45,
      credit_estimate_min: 30000,
      credit_estimate_max: 75000,
    },
    {
      round: 3,
      cards: ['Spark Cash Plus', 'World Elite Business Card'],
      rationale: 'Batch Capital One and US Bank together — different bureaus pulled, no cross-issuer velocity conflicts.',
      wait_days: 30,
      credit_estimate_min: 45000,
      credit_estimate_max: 95000,
    },
  ],
  network_diversity: {
    visa: { count: 2, recommendation: 'Primary network — strong merchant acceptance' },
    mastercard: { count: 1, recommendation: 'Good secondary diversification for processor redundancy' },
    amex: { count: 1, recommendation: 'Lower merchant acceptance but higher limits and rewards' },
    discover: { count: 0, recommendation: 'Not recommended for this stack — limited business card options' },
  },
  stack_summary: {
    round1_cards: 4,
    round1_credit_min: 125000,
    round1_credit_max: 270000,
    apr_expiry_range: {
      earliest: daysFromNow(270),
      latest: daysFromNow(456),
    },
    total_annual_fees: 245,
    net_capital_estimate_min: 124755,
    net_capital_estimate_max: 269755,
  },
  last_updated: new Date().toISOString(),
};

// ── Optimizer Clients ────────────────────────────────────────────

const MOCK_OPTIMIZER_CLIENTS = {
  clients: [
    {
      id: 'biz_apex_002',
      legal_name: 'Apex Ventures Inc.',
      entity_type: 'C-Corp',
      state: 'DE',
      readiness_score: 94,
      credit: {
        best_personal_score: 782,
        total_limit: 325000,
        total_balance: 47200,
        inquiries_90d: 1,
      },
      business_credit: {
        fico_sbss: 210,
        paydex: 78,
      },
      annual_revenue: 1850000,
      employees: 22,
      months_in_business: 38,
      active_business_cards: [
        { issuer: 'Chase', product: 'Ink Business Unlimited', limit: 75000, balance: 12300 },
        { issuer: 'American Express', product: 'Business Gold Card', limit: 100000, balance: 18500 },
        { issuer: 'Capital One', product: 'Spark Miles', limit: 50000, balance: 6400 },
      ],
    },
    {
      id: 'biz_novago_006',
      legal_name: 'NovaGo Solutions LLC',
      entity_type: 'LLC',
      state: 'TX',
      readiness_score: 88,
      credit: {
        best_personal_score: 755,
        total_limit: 210000,
        total_balance: 31800,
        inquiries_90d: 2,
      },
      business_credit: {
        fico_sbss: 185,
        paydex: 72,
      },
      annual_revenue: 920000,
      employees: 11,
      months_in_business: 26,
      active_business_cards: [
        { issuer: 'Chase', product: 'Ink Business Preferred', limit: 60000, balance: 9800 },
        { issuer: 'Wells Fargo', product: 'Business Platinum', limit: 40000, balance: 7200 },
      ],
    },
    {
      id: 'biz_meridian_001',
      legal_name: 'Meridian Holdings LLC',
      entity_type: 'LLC',
      state: 'NY',
      readiness_score: 82,
      credit: {
        best_personal_score: 741,
        total_limit: 450000,
        total_balance: 112500,
        inquiries_90d: 3,
      },
      business_credit: {
        fico_sbss: 195,
        paydex: 68,
      },
      annual_revenue: 2400000,
      employees: 34,
      months_in_business: 54,
      active_business_cards: [
        { issuer: 'American Express', product: 'Business Platinum', limit: 150000, balance: 42000 },
        { issuer: 'Chase', product: 'Ink Business Cash', limit: 85000, balance: 21300 },
        { issuer: 'Citi', product: 'Custom Cash Business', limit: 65000, balance: 16700 },
        { issuer: 'Capital One', product: 'Spark Cash Plus', limit: 50000, balance: 12500 },
      ],
    },
    {
      id: 'biz_brightline_003',
      legal_name: 'Brightline Corp',
      entity_type: 'S-Corp',
      state: 'FL',
      readiness_score: 76,
      credit: {
        best_personal_score: 718,
        total_limit: 175000,
        total_balance: 48200,
        inquiries_90d: 4,
      },
      business_credit: {
        fico_sbss: 168,
        paydex: 65,
      },
      annual_revenue: 680000,
      employees: 8,
      months_in_business: 19,
      active_business_cards: [
        { issuer: 'Wells Fargo', product: 'Business Elite Card', limit: 50000, balance: 14800 },
        { issuer: 'US Bank', product: 'Business Cash Rewards', limit: 35000, balance: 8900 },
      ],
    },
    {
      id: 'biz_thornwood_004',
      legal_name: 'Thornwood Capital LLC',
      entity_type: 'LLC',
      state: 'CA',
      readiness_score: 61,
      credit: {
        best_personal_score: 698,
        total_limit: 280000,
        total_balance: 134400,
        inquiries_90d: 5,
      },
      business_credit: {
        fico_sbss: 152,
        paydex: 58,
      },
      annual_revenue: 520000,
      employees: 5,
      months_in_business: 14,
      active_business_cards: [
        { issuer: 'Chase', product: 'Ink Business Unlimited', limit: 40000, balance: 28700 },
        { issuer: 'Capital One', product: 'Spark Cash Plus', limit: 30000, balance: 19200 },
        { issuer: 'US Bank', product: 'Triple Cash Rewards', limit: 25000, balance: 11500 },
      ],
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Optimizer History ────────────────────────────────────────────

const MOCK_OPTIMIZER_HISTORY = {
  runs: [
    {
      id: 'opt_run_001',
      date: dateOnly(-3),
      client_name: 'Apex Ventures Inc.',
      client_id: 'biz_apex_002',
      top_card: 'Ink Business Preferred Credit Card',
      top_probability: 0.91,
      inputs: {
        personal_score: 782,
        business_vintage_months: 38,
        annual_revenue: 1850000,
        existing_cards: 3,
        target_capital: 250000,
      },
    },
    {
      id: 'opt_run_002',
      date: dateOnly(-8),
      client_name: 'NovaGo Solutions LLC',
      client_id: 'biz_novago_006',
      top_card: 'Blue Business Plus Credit Card',
      top_probability: 0.85,
      inputs: {
        personal_score: 755,
        business_vintage_months: 26,
        annual_revenue: 920000,
        existing_cards: 2,
        target_capital: 150000,
      },
    },
    {
      id: 'opt_run_003',
      date: dateOnly(-15),
      client_name: 'Meridian Holdings LLC',
      client_id: 'biz_meridian_001',
      top_card: 'Spark Cash Plus',
      top_probability: 0.79,
      inputs: {
        personal_score: 741,
        business_vintage_months: 54,
        annual_revenue: 2400000,
        existing_cards: 4,
        target_capital: 350000,
      },
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Endpoint → mock data map ─────────────────────────────────────

export const OPTIMIZER_MOCK_MAP: Record<string, unknown> = {
  'optimizer/run': MOCK_OPTIMIZER_RUN,
  'optimizer/clients': MOCK_OPTIMIZER_CLIENTS,
  'optimizer/history': MOCK_OPTIMIZER_HISTORY,
};

// ── Resolver ─────────────────────────────────────────────────────

export function getOptimizerMockData(
  endpoint: string,
  _params?: Record<string, string>,
): unknown | null {
  const normalized = endpoint.replace(/^\/api\/v1\//, '');

  if (OPTIMIZER_MOCK_MAP[normalized] !== undefined) {
    return OPTIMIZER_MOCK_MAP[normalized];
  }

  return null;
}
