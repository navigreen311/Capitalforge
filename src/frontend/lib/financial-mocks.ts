// ============================================================
// CapitalForge Financial Control Mock Data
// ============================================================
// Mock data for repayment, spend governance, and rewards endpoints.
// Used when NEXT_PUBLIC_USE_MOCK_DATA=true.
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

function monthLabel(offsetMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── Repayment ─────────────────────────────────────────────────────────────

const MOCK_REPAYMENT = {
  kpis: {
    total_balance: 55050,
    monthly_payment: 6400,
    avg_apr: 22.95,
    min_payments: 1101,
  },
  at_risk_count: 1,
  interest_shock_alerts: [
    {
      id: 'isa_001',
      card: 'Chase Ink Business Preferred',
      issuer: 'Chase',
      last_four: '4821',
      status: 'expired',
      promo_apr: 0,
      regular_apr: 24.99,
      balance: 18500,
      monthly_interest: 385,
      days_remaining: 0,
      description: 'Intro APR expired — now accruing at 24.99%',
    },
    {
      id: 'isa_002',
      card: 'Amex Blue Business Plus',
      issuer: 'American Express',
      last_four: '9173',
      status: 'expiring',
      promo_apr: 0,
      regular_apr: 21.49,
      balance: 22000,
      monthly_interest: 394,
      days_remaining: 18,
      description: 'Intro APR expires in 18 days — plan payoff or transfer',
    },
    {
      id: 'isa_003',
      card: 'Capital One Spark Cash Plus',
      issuer: 'Capital One',
      last_four: '6502',
      status: 'expiring',
      promo_apr: 0,
      regular_apr: 22.49,
      balance: 14550,
      monthly_interest: 273,
      days_remaining: 44,
      description: 'Intro APR expires in 44 days — consider accelerated paydown',
    },
  ],
  plans: [
    {
      id: 'plan_001',
      card: 'Chase Ink Business Preferred',
      issuer: 'Chase',
      last_four: '4821',
      balance: 18500,
      apr: 24.99,
      payment: 2200,
      min_payment: 370,
      progress: 26,
      eta: '2027-01-15',
      status: 'at_risk' as const,
      autopay: false,
    },
    {
      id: 'plan_002',
      card: 'Amex Blue Business Plus',
      issuer: 'American Express',
      last_four: '9173',
      balance: 22000,
      apr: 21.49,
      payment: 2400,
      min_payment: 440,
      progress: 12,
      eta: '2027-03-01',
      status: 'on_track' as const,
      autopay: true,
    },
    {
      id: 'plan_003',
      card: 'Capital One Spark Cash Plus',
      issuer: 'Capital One',
      last_four: '6502',
      balance: 14550,
      apr: 22.49,
      payment: 1200,
      min_payment: 291,
      progress: 38,
      eta: '2027-05-10',
      status: 'on_track' as const,
      autopay: true,
    },
    {
      id: 'plan_004',
      card: 'Wells Fargo Business Elite',
      issuer: 'Wells Fargo',
      last_four: '3347',
      balance: 0,
      apr: 19.99,
      payment: 600,
      min_payment: 0,
      progress: 100,
      eta: null,
      status: 'paid_off' as const,
      autopay: false,
    },
  ],
  method_comparison: {
    avalanche: {
      method: 'avalanche',
      total_interest: 8420,
      payoff_date: '2027-03-01',
      monthly_payment: 6400,
    },
    snowball: {
      method: 'snowball',
      total_interest: 9180,
      payoff_date: '2027-04-15',
      monthly_payment: 6400,
    },
    savings: 760,
  },
  calendar: [
    { date: dateOnly(2), card: 'Chase Ink Business Preferred', last_four: '4821', amount: 2200, autopay: false, status: 'upcoming' as const },
    { date: dateOnly(5), card: 'Amex Blue Business Plus', last_four: '9173', amount: 2400, autopay: true, status: 'upcoming' as const },
    { date: dateOnly(10), card: 'Capital One Spark Cash Plus', last_four: '6502', amount: 1200, autopay: true, status: 'upcoming' as const },
    { date: dateOnly(18), card: 'Wells Fargo Business Elite', last_four: '3347', amount: 600, autopay: false, status: 'scheduled' as const },
  ],
  last_updated: new Date().toISOString(),
};

// ── Spend Governance ──────────────────────────────────────────────────────

const MOCK_SPEND_GOVERNANCE = {
  kpis: {
    total_transactions: 10,
    flagged: 4,
    cash_like: 4,
    chargeback_ratio: 10.0,
  },
  violations: [
    {
      id: 'viol_001',
      card_network: 'Visa',
      type: 'quasi_cash',
      merchant: 'CoinFlip ATM',
      mcc: '6051',
      amount: 2500,
      severity: 'critical' as const,
      description: 'Quasi-cash transaction at crypto ATM — violates card network terms',
      date: daysFromNow(-1),
    },
    {
      id: 'viol_002',
      card_network: 'Mastercard',
      type: 'cash_like',
      merchant: 'Western Union',
      mcc: '4829',
      amount: 1800,
      severity: 'warning' as const,
      description: 'Cash-like money transfer — may trigger issuer review',
      date: daysFromNow(-2),
    },
    {
      id: 'viol_003',
      card_network: 'American Express',
      type: 'velocity',
      merchant: 'Multiple',
      mcc: 'various',
      amount: 8400,
      severity: 'caution' as const,
      description: 'High-velocity spending pattern — 6 transactions in 45 minutes',
      date: daysFromNow(-1),
    },
  ],
  transactions: [
    {
      id: 'txn_001',
      merchant: 'CoinFlip ATM',
      mcc: '6051',
      category: 'Crypto / Quasi-Cash',
      amount: 2500,
      risk_score: 95,
      flags: ['quasi_cash', 'crypto'],
      business_purpose: null,
      card: 'Visa ****7742',
      date: daysFromNow(-1),
    },
    {
      id: 'txn_002',
      merchant: 'Western Union',
      mcc: '4829',
      category: 'Money Transfer',
      amount: 1800,
      risk_score: 82,
      flags: ['cash_like', 'money_transfer'],
      business_purpose: null,
      card: 'Mastercard ****3310',
      date: daysFromNow(-2),
    },
    {
      id: 'txn_003',
      merchant: 'PayPal Holdings',
      mcc: '6211',
      category: 'Financial Services',
      amount: 3200,
      risk_score: 65,
      flags: ['cash_like'],
      business_purpose: 'Vendor payment — invoice #4412',
      card: 'Visa ****7742',
      date: daysFromNow(-1),
    },
    {
      id: 'txn_004',
      merchant: 'Venmo Transfer',
      mcc: '6051',
      category: 'P2P Transfer',
      amount: 900,
      risk_score: 78,
      flags: ['cash_like', 'p2p'],
      business_purpose: null,
      card: 'Amex ****9173',
      date: daysFromNow(-1),
    },
    {
      id: 'txn_005',
      merchant: 'Office Depot',
      mcc: '5943',
      category: 'Office Supplies',
      amount: 450,
      risk_score: 5,
      flags: [],
      business_purpose: 'Q2 office supply restock',
      card: 'Visa ****7742',
      date: daysFromNow(-3),
    },
    {
      id: 'txn_006',
      merchant: 'Delta Airlines',
      mcc: '3058',
      category: 'Travel',
      amount: 1250,
      risk_score: 8,
      flags: [],
      business_purpose: 'Client meeting — Dallas trip',
      card: 'Amex ****9173',
      date: daysFromNow(-2),
    },
    {
      id: 'txn_007',
      merchant: 'AWS Cloud Services',
      mcc: '7372',
      category: 'Software / SaaS',
      amount: 2800,
      risk_score: 3,
      flags: [],
      business_purpose: 'Monthly infrastructure hosting',
      card: 'Mastercard ****3310',
      date: daysFromNow(-1),
    },
    {
      id: 'txn_008',
      merchant: 'Staples Business',
      mcc: '5943',
      category: 'Office Supplies',
      amount: 200,
      risk_score: 2,
      flags: [],
      business_purpose: 'Printer cartridges',
      card: 'Visa ****7742',
      date: daysFromNow(-4),
    },
  ],
  spend_by_category: [
    { category: 'Crypto / Quasi-Cash', amount: 2500, risk_flags: ['quasi_cash'] },
    { category: 'Money Transfer', amount: 1800, risk_flags: ['cash_like'] },
    { category: 'Financial Services', amount: 3200, risk_flags: ['cash_like'] },
    { category: 'P2P Transfer', amount: 900, risk_flags: ['p2p'] },
    { category: 'Office Supplies', amount: 650, risk_flags: [] },
    { category: 'Travel', amount: 1250, risk_flags: [] },
  ],
  last_updated: new Date().toISOString(),
};

// ── Rewards ───────────────────────────────────────────────────────────────

const MOCK_REWARDS = {
  kpis: {
    total_rewards: 15712,
    total_fees: 1539,
    net_benefit: 14173,
    monthly_spend: 33600,
  },
  routing_recommendations: [
    {
      category: 'Travel',
      best_card: 'Chase Ink Business Preferred',
      rate: 3.0,
      type: 'points',
      spend: 8200,
      projected: 246,
    },
    {
      category: 'Advertising',
      best_card: 'Amex Blue Business Plus',
      rate: 2.0,
      type: 'points',
      spend: 6400,
      projected: 128,
    },
    {
      category: 'Shipping',
      best_card: 'Capital One Spark Cash Plus',
      rate: 5.0,
      type: 'cash_back',
      spend: 3800,
      projected: 190,
    },
    {
      category: 'Internet / Telecom',
      best_card: 'Chase Ink Business Cash',
      rate: 5.0,
      type: 'cash_back',
      spend: 2200,
      projected: 110,
    },
    {
      category: 'Office Supplies',
      best_card: 'Chase Ink Business Cash',
      rate: 5.0,
      type: 'cash_back',
      spend: 4800,
      projected: 240,
    },
    {
      category: 'Dining',
      best_card: 'Capital One Spark Miles',
      rate: 2.0,
      type: 'miles',
      spend: 8200,
      projected: 164,
    },
  ],
  card_summary: [
    {
      card: 'Chase Ink Business Preferred',
      last_four: '4821',
      annual_fee: 95,
      rewards_earned: 4850,
      net_benefit: 4755,
      recommendation: 'keep',
      renewal_date: daysFromNow(120),
    },
    {
      card: 'Amex Blue Business Plus',
      last_four: '9173',
      annual_fee: 0,
      rewards_earned: 3200,
      net_benefit: 3200,
      recommendation: 'keep',
      renewal_date: daysFromNow(200),
    },
    {
      card: 'Capital One Spark Cash Plus',
      last_four: '6502',
      annual_fee: 150,
      rewards_earned: 3100,
      net_benefit: 2950,
      recommendation: 'keep',
      renewal_date: daysFromNow(90),
    },
    {
      card: 'Chase Ink Business Cash',
      last_four: '8814',
      annual_fee: 0,
      rewards_earned: 2862,
      net_benefit: 2862,
      recommendation: 'keep',
      renewal_date: daysFromNow(180),
    },
    {
      card: 'Capital One Spark Miles',
      last_four: '2290',
      annual_fee: 1294,
      rewards_earned: 1700,
      net_benefit: 406,
      recommendation: 'evaluate',
      renewal_date: daysFromNow(45),
    },
  ],
  opportunity_gap: {
    current: 15712,
    optimal: 18400,
    gap: 2688,
  },
  trend: [
    { month: monthLabel(-5), rewards: 2180 },
    { month: monthLabel(-4), rewards: 2340 },
    { month: monthLabel(-3), rewards: 2560 },
    { month: monthLabel(-2), rewards: 2720 },
    { month: monthLabel(-1), rewards: 2890 },
    { month: monthLabel(0), rewards: 3022 },
  ],
  last_updated: new Date().toISOString(),
};

// ── Endpoint → Mock data map ──────────────────────────────────────────────

export const FINANCIAL_MOCK_MAP: Record<string, unknown> = {
  '/api/v1/repayment': MOCK_REPAYMENT,
  '/api/v1/spend-governance': MOCK_SPEND_GOVERNANCE,
  '/api/v1/rewards': MOCK_REWARDS,
};

// ── Resolver ──────────────────────────────────────────────────────────────

export function getFinancialMockData(endpoint: string): unknown | null {
  // Direct key match first
  const direct = FINANCIAL_MOCK_MAP[endpoint];
  if (direct !== undefined) return direct;

  // Substring-based fallback for sub-paths
  if (endpoint.includes('/repayment')) return MOCK_REPAYMENT;
  if (endpoint.includes('/spend-governance')) return MOCK_SPEND_GOVERNANCE;
  if (endpoint.includes('/rewards')) return MOCK_REWARDS;

  return null;
}
