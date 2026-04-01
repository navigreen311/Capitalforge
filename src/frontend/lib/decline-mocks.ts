// ============================================================
// CapitalForge Decline Mock Data
// ============================================================
// Mock data for /api/v1/declines endpoints.
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

// ── Decline Records (list) ────────────────────────────────────

const MOCK_DECLINES = {
  records: [
    {
      id: 'dec_001',
      businessName: 'Horizon Retail Partners',
      issuer: 'Citi',
      cardProduct: 'Citi\u00AE Business Platinum',
      declinedDate: '2026-03-25',
      reasonCategory: 'too_many_inquiries',
      reasonDetail: 'Too many recent credit inquiries in 12-month window.',
      reconStatus: 'not_started',
      cooldownEndsDate: '2026-04-25',
      requestedLimit: 15000,
      appId: 'APP-0087',
    },
    {
      id: 'dec_002',
      businessName: 'Apex Ventures LLC',
      issuer: 'Chase',
      cardProduct: 'Ink Business Unlimited',
      declinedDate: '2026-03-18',
      reasonCategory: 'velocity',
      reasonDetail: '5/24 rule \u2014 too many new accounts in 24 months.',
      reconStatus: 'in_review',
      cooldownEndsDate: '2026-05-18',
      requestedLimit: 20000,
      appId: 'APP-0081',
    },
    {
      id: 'dec_003',
      businessName: 'Crestline Medical LLC',
      issuer: 'Amex',
      cardProduct: 'Business Platinum Card',
      declinedDate: '2026-03-10',
      reasonCategory: 'income_verification',
      reasonDetail: 'Stated income could not be verified via credit file data.',
      reconStatus: 'scheduled',
      cooldownEndsDate: null,
      requestedLimit: 50000,
      appId: 'APP-0077',
    },
    {
      id: 'dec_004',
      businessName: 'NovaTech Solutions Inc.',
      issuer: 'Capital One',
      cardProduct: 'Spark Cash Select',
      declinedDate: '2026-03-05',
      reasonCategory: 'insufficient_history',
      reasonDetail: 'Business credit history too thin \u2014 fewer than 3 trade lines.',
      reconStatus: 'denied',
      cooldownEndsDate: '2026-09-05',
      requestedLimit: 10000,
      appId: 'APP-0074',
    },
    {
      id: 'dec_005',
      businessName: 'Blue Ridge Consulting',
      issuer: 'US Bank',
      cardProduct: 'Business Altitude Connect',
      declinedDate: '2026-02-28',
      reasonCategory: 'high_utilization',
      reasonDetail: 'Personal credit utilization exceeds 70% on revolving accounts.',
      reconStatus: 'approved',
      cooldownEndsDate: null,
      requestedLimit: 18000,
      appId: 'APP-0069',
    },
    {
      id: 'dec_006',
      businessName: 'Summit Capital Group',
      issuer: 'Bank of America',
      cardProduct: 'Business Advantage Travel Rewards',
      declinedDate: '2026-02-20',
      reasonCategory: 'internal_policy',
      reasonDetail: 'Application declined per issuer internal risk policy \u2014 no further details provided.',
      reconStatus: 'not_started',
      cooldownEndsDate: '2026-04-20',
      requestedLimit: 30000,
      appId: 'APP-0063',
    },
    {
      id: 'dec_007',
      businessName: 'Pinnacle Freight Corp',
      issuer: 'Wells Fargo',
      cardProduct: 'Business Platinum Credit Card',
      declinedDate: '2026-02-14',
      reasonCategory: 'derogatory_marks',
      reasonDetail: 'Derogatory public record (tax lien) present on personal credit.',
      reconStatus: 'not_started',
      cooldownEndsDate: '2026-08-14',
      requestedLimit: 25000,
      appId: 'APP-0058',
    },
  ],
  stats: {
    total: 7,
    recon_in_review: 1,
    reversed: 1,
    eligible_now: 1,
    recons_initiated: 4,
    win_rate: 25,
  },
  patterns: [
    { reason: 'too_many_inquiries', label: 'Too Many Inquiries', count: 2, pct: 28.6, avg_cooldown: 30 },
    { reason: 'velocity',           label: 'Velocity Rule',      count: 1, pct: 14.3, avg_cooldown: 60 },
    { reason: 'income_verification', label: 'Income Verify',     count: 1, pct: 14.3, avg_cooldown: 0  },
    { reason: 'high_utilization',   label: 'High Utilization',   count: 1, pct: 14.3, avg_cooldown: 0  },
    { reason: 'insufficient_history', label: 'Thin File',        count: 2, pct: 28.6, avg_cooldown: 150 },
  ],
  last_updated: new Date().toISOString(),
};

// ── Decline Detail (single record) ────────────────────────────

const MOCK_DECLINE_DETAIL = {
  id: 'dec_001',
  businessName: 'Horizon Retail Partners',
  businessId: 'biz_horizon_010',
  issuer: 'Citi',
  cardProduct: 'Citi\u00AE Business Platinum',
  declinedDate: '2026-03-25',
  reasonCategory: 'too_many_inquiries',
  reasonDetail: 'Too many recent credit inquiries in 12-month window.',
  reconStatus: 'not_started',
  cooldownEndsDate: '2026-04-25',
  requestedLimit: 15000,
  appId: 'APP-0087',
  advisorName: 'Sarah Chen',
  creditScoreAtApplication: 712,
  inquiriesLast12Months: 8,
  existingRelationship: false,

  timeline: [
    {
      id: 'evt_001',
      timestamp: '2026-03-25T14:30:00Z',
      type: 'application_declined',
      description: 'Application APP-0087 declined by Citi. Reason: too many inquiries in 12-month window.',
      actor: 'system',
    },
    {
      id: 'evt_002',
      timestamp: '2026-03-26T09:15:00Z',
      type: 'adverse_action_received',
      description: 'Adverse action notice received and parsed. 2 reason codes extracted.',
      actor: 'system',
    },
    {
      id: 'evt_003',
      timestamp: '2026-03-27T11:00:00Z',
      type: 'advisor_note',
      description: 'Advisor reviewed decline. Recommend waiting until cooldown expires before recon attempt. Client has 8 inquiries in last 12 months.',
      actor: 'Sarah Chen',
    },
  ],

  repair_plan: {
    steps: [
      { order: 1, action: 'Wait for cooldown period to expire (2026-04-25)', status: 'pending' as const },
      { order: 2, action: 'Reduce inquiry count — freeze non-essential pulls', status: 'in_progress' as const },
      { order: 3, action: 'Prepare reconsideration letter with updated business financials', status: 'not_started' as const },
      { order: 4, action: 'Call Citi recon line and reference application APP-0087', status: 'not_started' as const },
    ],
    estimated_recon_date: dateOnly(25),
    confidence: 'moderate',
  },

  adverse_action_notice: {
    received: true,
    received_date: '2026-03-26',
    issuer_reference: 'CIT-ADV-2026-88412',
    reason_codes: [
      { code: 'RC-04', description: 'Number of recent inquiries on credit bureau report' },
      { code: 'RC-11', description: 'Length of time accounts have been established' },
    ],
    bureau: 'Experian',
    document_url: '/documents/adverse-action/dec_001_citi_20260326.pdf',
  },

  last_updated: daysFromNow(0),
};

// ── Endpoint → mock data map ──────────────────────────────────

export const DECLINE_MOCK_MAP: Record<string, unknown> = {
  'declines': MOCK_DECLINES,
  'declines/{id}': MOCK_DECLINE_DETAIL,
};

// ── Resolver ──────────────────────────────────────────────────

export function getDeclineMockData(
  endpoint: string,
): unknown | null {
  const normalized = endpoint.replace(/^\/api\/v1\//, '');

  // Exact match for list endpoint
  if (normalized === 'declines') return DECLINE_MOCK_MAP['declines'];

  // Detail: declines/<any-id>
  if (/^declines\/[^/]+$/.test(normalized)) return DECLINE_MOCK_MAP['declines/{id}'];

  return null;
}
