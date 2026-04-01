// ============================================================
// CapitalForge Funding Round Detail Mock Data
// ============================================================
// Mock data shapes MUST match what components expect.
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

// ── Repayment ────────────────────────────────────────────────

const MOCK_FUNDING_ROUND_REPAYMENT = {
  cards: [
    {
      name: 'Ink Business Preferred',
      issuer: 'Chase',
      next_due: dateOnly(5),
      amount: 1200,
      type: 'autopay' as const,
      status: 'upcoming' as const,
      balance: 12400,
      apr_post_promo: 29.99,
      expiry_date: dateOnly(49),
      days_remaining: 49,
    },
    {
      name: 'Business Advantage Cash',
      issuer: 'BofA',
      next_due: dateOnly(8),
      amount: 800,
      type: 'manual' as const,
      status: 'overdue' as const,
      balance: 8200,
      apr_post_promo: 26.99,
      expiry_date: dateOnly(90),
      days_remaining: 90,
    },
    {
      name: 'Ink Business Cash',
      issuer: 'Chase',
      next_due: dateOnly(15),
      amount: 400,
      type: 'autopay' as const,
      status: 'upcoming' as const,
      balance: 3100,
      apr_post_promo: 24.99,
      expiry_date: dateOnly(120),
      days_remaining: 120,
    },
    {
      name: 'Business Gold Card',
      issuer: 'American Express',
      next_due: dateOnly(12),
      amount: 1500,
      type: 'manual' as const,
      status: 'upcoming' as const,
      balance: 18500,
      apr_post_promo: 28.49,
      expiry_date: dateOnly(65),
      days_remaining: 65,
    },
  ],
  interest_shock: {
    total_balance_at_risk: 42200,
    monthly_interest: 1035,
    annual_interest: 12420,
    action_deadline: dateOnly(49),
  },
};

// ── Timeline ─────────────────────────────────────────────────

const MOCK_FUNDING_ROUND_TIMELINE = {
  events: [
    {
      id: 'fre_001',
      date: daysFromNow(-30),
      type: 'round_created',
      title: 'Funding round created',
      detail: 'Round 2 initiated — targeting $350,000 in new credit lines',
      actor: 'Sarah Chen',
    },
    {
      id: 'fre_002',
      date: daysFromNow(-25),
      type: 'app_drafted',
      title: 'Application drafted',
      detail: 'Ink Business Preferred application prepared for Chase submission',
      actor: 'Sarah Chen',
    },
    {
      id: 'fre_003',
      date: daysFromNow(-20),
      type: 'app_submitted',
      title: 'Application submitted',
      detail: 'Submitted to Chase via business portal — requested $50,000',
      actor: 'Sarah Chen',
    },
    {
      id: 'fre_004',
      date: daysFromNow(-10),
      type: 'app_approved',
      title: 'Application approved',
      detail: 'Chase approved Ink Business Preferred for $45,000 credit limit',
      actor: 'System',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Funding Round Detail ─────────────────────────────────────

const MOCK_FUNDING_ROUND_DETAIL = {
  id: 'round_mh_001',
  businessId: 'biz_meridian_001',
  businessName: 'Meridian Holdings LLC',
  roundNumber: 2,
  status: 'in_progress',
  targetAmount: 350000,
  obtainedAmount: 287500,
  advisorName: 'Sarah Chen',
  startedAt: daysFromNow(-30),
  targetCloseAt: daysFromNow(60),
  notes: 'Phase 2 stack — targeting Chase + Amex',
  clientReadinessScore: 82,
  cards: [
    {
      id: 'card_mh_chase_001',
      product: 'Ink Business Preferred',
      issuer: 'Chase',
      limit: 45000,
      balance: 12400,
      utilization: 27.6,
      consentStatus: 'complete' as const,
    },
    {
      id: 'card_mh_bofa_001',
      product: 'Business Advantage Cash',
      issuer: 'BofA',
      limit: 35000,
      balance: 8200,
      utilization: 23.4,
      consentStatus: 'complete' as const,
    },
    {
      id: 'card_mh_chase_002',
      product: 'Ink Business Cash',
      issuer: 'Chase',
      limit: 25000,
      balance: 3100,
      utilization: 12.4,
      consentStatus: 'complete' as const,
    },
    {
      id: 'card_mh_amex_001',
      product: 'Business Gold Card',
      issuer: 'American Express',
      limit: 150000,
      balance: 18500,
      utilization: 12.3,
      consentStatus: 'pending' as const,
    },
  ],
  economics: {
    totalCreditObtained: 287500,
    estimatedFees: 14375,
    feePercent: 5.0,
    netToClient: 273125,
  },
  previousRounds: [
    {
      roundNumber: 1,
      status: 'completed',
      targetAmount: 200000,
      obtainedAmount: 195000,
      cardsApproved: 3,
      completedAt: daysFromNow(-90),
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Optimizer Round Suggestion ───────────────────────────────

const MOCK_OPTIMIZER_ROUND_SUGGESTION = {
  suggestedTarget: 85000,
  reason:
    'Client has 2 remaining 5/24 slots with Chase and strong payment history. Amex has no velocity cap — high probability of $50K+ approval on Business Platinum.',
  remainingLeverage: 162500,
};

// ── Endpoint → mock data map ─────────────────────────────────

export const FUNDING_ROUND_MOCK_MAP: Record<string, unknown> = {
  'funding-rounds/{id}/repayment': MOCK_FUNDING_ROUND_REPAYMENT,
  'funding-rounds/{id}/timeline': MOCK_FUNDING_ROUND_TIMELINE,
  'funding-rounds/{id}': MOCK_FUNDING_ROUND_DETAIL,
  'optimizer/round-suggestion': MOCK_OPTIMIZER_ROUND_SUGGESTION,
};

// ── Resolver ─────────────────────────────────────────────────

export function getFundingRoundMockData(
  endpoint: string,
  _params?: Record<string, string>,
): unknown | null {
  const normalized = endpoint.replace(/^\/api\/v1\//, '');

  // Direct match first (e.g. 'optimizer/round-suggestion')
  if (FUNDING_ROUND_MOCK_MAP[normalized] !== undefined) {
    return FUNDING_ROUND_MOCK_MAP[normalized];
  }

  // Replace funding-round IDs with {id} placeholder
  const withPlaceholder = normalized.replace(
    /^funding-rounds\/[^/]+/,
    'funding-rounds/{id}',
  );
  return FUNDING_ROUND_MOCK_MAP[withPlaceholder] ?? null;
}
