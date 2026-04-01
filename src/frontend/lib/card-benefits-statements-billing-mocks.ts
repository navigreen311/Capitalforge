// ============================================================
// CapitalForge Card Benefits, Statements & Billing Mock Data
// ============================================================
// Mock data for card-benefits, statements, and billing endpoints.
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

// ── Card Benefits ─────────────────────────────────────────────────────────

const MOCK_CARD_BENEFITS = {
  kpis: {
    total_value: 3190,
    benefits_used: 2610,
    utilization_pct: 82,
    unused_count: 6,
    total_fees: 1389,
    net_benefit: 1221,
  },
  cards: [
    {
      id: 'card_amex_biz_plat',
      issuer: 'American Express',
      name: 'Business Platinum',
      annual_fee: 695,
      recommendation: 'keep' as const,
      benefits: [
        { id: 'ben_001', name: 'Airline Fee Credit', value: 200, used: true, expiry: daysFromNow(90), how_to_claim: 'Enroll via Amex portal, charges auto-credited within 2 billing cycles' },
        { id: 'ben_002', name: 'Dell Technologies Credit', value: 200, used: true, expiry: daysFromNow(60), how_to_claim: 'Use enrolled Amex card at dell.com/amex; semiannual $100 credits' },
        { id: 'ben_003', name: 'Global Lounge Collection', value: 650, used: true, expiry: daysFromNow(180), how_to_claim: 'Access via Amex app or Priority Pass; present card at lounge entrance' },
        { id: 'ben_004', name: 'Fine Hotels & Resorts Credit', value: 200, used: false, expiry: daysFromNow(120), how_to_claim: 'Book through Amex Travel FHR portal to receive statement credit' },
        { id: 'ben_005', name: 'Wireless Telephone Credit', value: 120, used: true, expiry: daysFromNow(30), how_to_claim: 'Pay wireless bill with Amex card; $10/month auto-credited' },
        { id: 'ben_006', name: 'Clear Plus Credit', value: 199, used: true, expiry: daysFromNow(240), how_to_claim: 'Enroll at clearme.com with Amex; annual membership auto-credited' },
        { id: 'ben_007', name: '5x Points on Flights', value: 400, used: true, expiry: daysFromNow(365), how_to_claim: 'Book flights directly with airlines or via Amex Travel; points auto-earned' },
      ],
    },
    {
      id: 'card_chase_ink_pref',
      issuer: 'Chase',
      name: 'Ink Business Preferred',
      annual_fee: 95,
      recommendation: 'keep' as const,
      benefits: [
        { id: 'ben_008', name: '3x Points on Travel & Shipping', value: 360, used: true, expiry: daysFromNow(365), how_to_claim: 'Use card for travel, shipping, internet, cable, or phone purchases' },
        { id: 'ben_009', name: 'Trip Cancellation Insurance', value: 150, used: false, expiry: daysFromNow(365), how_to_claim: 'Book travel with Chase Ink; file claim via eclaimsline.com within 60 days' },
        { id: 'ben_010', name: 'Cell Phone Protection', value: 100, used: false, expiry: daysFromNow(365), how_to_claim: 'Pay monthly cell bill with card; file claims at cardbenefitservices.com' },
        { id: 'ben_011', name: 'Purchase Protection', value: 100, used: false, expiry: daysFromNow(365), how_to_claim: 'Purchases covered for 120 days against damage/theft up to $10K per claim' },
      ],
    },
    {
      id: 'card_wf_biz_elite',
      issuer: 'Wells Fargo',
      name: 'Business Elite',
      annual_fee: 125,
      recommendation: 'cancel' as const,
      benefits: [
        { id: 'ben_012', name: 'Cell Phone Protection', value: 110, used: false, expiry: daysFromNow(180), how_to_claim: 'Pay monthly wireless bill with card; file claim within 90 days of incident' },
      ],
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Statements ────────────────────────────────────────────────────────────

const MOCK_STATEMENTS = {
  kpis: {
    total: 5,
    reconciled: 2,
    mismatches: 1,
    anomalies: 3,
  },
  anomalies: [
    {
      id: 'anom_001',
      severity: 'high' as const,
      type: 'fee_anomaly',
      issuer: 'American Express',
      description: 'Double charge detected on annual fee — $695 billed twice on statement closing date',
      detected_date: dateOnly(-2),
      amount: 695,
      status: 'open' as const,
    },
    {
      id: 'anom_002',
      severity: 'medium' as const,
      type: 'balance_mismatch',
      issuer: 'Chase',
      description: 'Statement closing balance differs from internal ledger by $142.50',
      detected_date: dateOnly(-5),
      amount: 142.5,
      status: 'investigating' as const,
    },
    {
      id: 'anom_003',
      severity: 'low' as const,
      type: 'missing_transaction',
      issuer: 'Capital One',
      description: 'Refund transaction from vendor not appearing on latest statement',
      detected_date: dateOnly(-1),
      amount: 89.99,
      status: 'open' as const,
    },
  ],
  statements: [
    {
      id: 'stmt_001',
      issuer: 'Chase',
      card_last_four: '4821',
      period_start: dateOnly(-30),
      period_end: dateOnly(0),
      closing_balance: 12450.0,
      minimum_due: 375.0,
      due_date: daysFromNow(21),
      status: 'reconciled' as const,
    },
    {
      id: 'stmt_002',
      issuer: 'American Express',
      card_last_four: '1098',
      period_start: dateOnly(-30),
      period_end: dateOnly(0),
      closing_balance: 28900.0,
      minimum_due: 867.0,
      due_date: daysFromNow(15),
      status: 'mismatch' as const,
    },
    {
      id: 'stmt_003',
      issuer: 'Capital One',
      card_last_four: '7733',
      period_start: dateOnly(-30),
      period_end: dateOnly(0),
      closing_balance: 5200.0,
      minimum_due: 156.0,
      due_date: daysFromNow(25),
      status: 'pending' as const,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Billing / Invoices ────────────────────────────────────────────────────

const MOCK_BILLING_INVOICES = {
  invoices: [
    {
      id: 'INV-0042',
      amount: 4750,
      status: 'paid' as const,
      issued_date: dateOnly(-30),
      due_date: dateOnly(-15),
      paid_date: dateOnly(-14),
      description: 'Monthly advisory fee — March 2026',
    },
    {
      id: 'INV-0041',
      amount: 1900,
      status: 'overdue' as const,
      issued_date: dateOnly(-45),
      due_date: dateOnly(-10),
      paid_date: null,
      description: 'Credit optimization retainer — February 2026',
    },
    {
      id: 'INV-0040',
      amount: 3200,
      status: 'paid' as const,
      issued_date: dateOnly(-60),
      due_date: dateOnly(-45),
      paid_date: dateOnly(-43),
      description: 'Portfolio setup fee — onboarding package',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Billing / Commissions ─────────────────────────────────────────────────

const MOCK_BILLING_COMMISSIONS = {
  commissions: [
    {
      id: 'comm_001',
      amount: 2375,
      status: 'pending' as const,
      deal_reference: 'DEAL-MH-R2-001',
      client_name: 'Meridian Holdings LLC',
      description: 'Round 2 funding commission — $287,500 funded at 0.825%',
      created_date: dateOnly(-3),
    },
    {
      id: 'comm_002',
      amount: 1500,
      status: 'pending' as const,
      deal_reference: 'DEAL-AV-R1-001',
      client_name: 'Apex Ventures Inc.',
      description: 'Round 1 funding commission — $150,000 funded at 1.0%',
      created_date: dateOnly(-7),
    },
    {
      id: 'comm_003',
      amount: 875,
      status: 'approved' as const,
      deal_reference: 'DEAL-BC-R1-001',
      client_name: 'Brightline Corp',
      description: 'Round 1 funding commission — $75,000 funded at 1.167%',
      created_date: dateOnly(-14),
    },
    {
      id: 'comm_004',
      amount: 3200,
      status: 'paid' as const,
      deal_reference: 'DEAL-NT-R2-001',
      client_name: 'Norcal Transport LLC',
      description: 'Round 2 funding commission — $200,000 funded at 1.6%',
      created_date: dateOnly(-30),
      paid_date: dateOnly(-20),
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Mock Map ──────────────────────────────────────────────────────────────

export const CARD_BENEFITS_STMT_BILLING_MOCK_MAP: Record<string, unknown> = {
  '/api/v1/card-benefits': MOCK_CARD_BENEFITS,
  '/api/v1/statements': MOCK_STATEMENTS,
  '/api/v1/billing/invoices': MOCK_BILLING_INVOICES,
  '/api/v1/billing/commissions': MOCK_BILLING_COMMISSIONS,
};

// ── Resolver ──────────────────────────────────────────────────────────────

export function getCardBenefitsStmtBillingMockData(endpoint: string): unknown | null {
  // Direct key match first
  const direct = CARD_BENEFITS_STMT_BILLING_MOCK_MAP[endpoint];
  if (direct !== undefined) return direct;

  // Substring-based fallback for sub-paths
  if (endpoint.includes('/card-benefits')) return MOCK_CARD_BENEFITS;
  if (endpoint.includes('/statements')) return MOCK_STATEMENTS;
  if (endpoint.includes('/billing/invoices')) return MOCK_BILLING_INVOICES;
  if (endpoint.includes('/billing/commissions')) return MOCK_BILLING_COMMISSIONS;
  if (endpoint.includes('/billing')) return MOCK_BILLING_INVOICES;

  return null;
}
