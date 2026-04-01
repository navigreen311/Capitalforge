// ============================================================
// CapitalForge Client Detail Mock Data
// ============================================================
// Comprehensive mock data for all client-detail endpoints.
// Used when NEXT_PUBLIC_USE_MOCK_DATA=true.
// Wire into dashboard-mocks.ts via getClientMockData().
// ============================================================

// ── Date helpers (mirrors dashboard-mocks) ────────────────────

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

// ── Client Profile ────────────────────────────────────────────

const MOCK_CLIENT_PROFILE = {
  id: 'biz_meridian_001',
  legalName: 'Meridian Holdings LLC',
  dba: 'Meridian Financial Services',
  ein: '82-1234567',
  entityType: 'LLC',
  stateOfFormation: 'DE',
  annualRevenue: 4800000,
  monthlyRevenue: 400000,
  industry: 'Financial Services',
  naicsCode: '523910',
  mcc: '6012',
  status: 'active',
  advisorName: 'Sarah Chen',
  fundingReadinessScore: 92,
  website: 'https://meridianholdings.example.com',
  employees: 24,
  dateOfFormation: '2019-03-15',
  address: {
    street: '1200 Market Street, Suite 400',
    city: 'Wilmington',
    state: 'DE',
    zip: '19801',
  },
  phone: '(302) 555-0142',
  email: 'admin@meridianholdings.example.com',
  createdAt: daysFromNow(-180),
  updatedAt: daysFromNow(-2),
};

// ── Owners ────────────────────────────────────────────────────

const MOCK_OWNERS = [
  {
    id: 'own_001',
    firstName: 'James',
    lastName: 'Harrington',
    ownershipPercent: 60,
    title: 'CEO & Managing Member',
    kycStatus: 'verified' as const,
    kycVerifiedAt: daysFromNow(-170),
    personalGuarantee: true,
    ssn_last4: '4821',
    email: 'james.h@meridianholdings.example.com',
    phone: '(302) 555-0143',
  },
  {
    id: 'own_002',
    firstName: 'Patricia',
    lastName: 'Chen',
    ownershipPercent: 30,
    title: 'COO',
    kycStatus: 'verified' as const,
    kycVerifiedAt: daysFromNow(-168),
    personalGuarantee: true,
    ssn_last4: '7193',
    email: 'patricia.c@meridianholdings.example.com',
    phone: '(302) 555-0144',
  },
  {
    id: 'own_003',
    firstName: 'Derek',
    lastName: 'Olsen',
    ownershipPercent: 10,
    title: 'CFO',
    kycStatus: 'pending' as const,
    kycVerifiedAt: null,
    personalGuarantee: false,
    ssn_last4: '3356',
    email: 'derek.o@meridianholdings.example.com',
    phone: '(302) 555-0145',
  },
];

// ── Acknowledgments ───────────────────────────────────────────

const MOCK_ACKNOWLEDGMENTS = [
  {
    id: 'ack_001',
    type: 'product_reality',
    label: 'Product Reality Acknowledgment',
    status: 'signed' as const,
    signedAt: daysFromNow(-160),
    signedBy: 'James Harrington',
    documentUrl: '/documents/ack_product_reality_001.pdf',
  },
  {
    id: 'ack_002',
    type: 'fee_refund',
    label: 'Fee & Refund Policy',
    status: 'signed' as const,
    signedAt: daysFromNow(-160),
    signedBy: 'James Harrington',
    documentUrl: '/documents/ack_fee_refund_001.pdf',
  },
  {
    id: 'ack_003',
    type: 'personal_guarantee',
    label: 'Personal Guarantee Disclosure',
    status: 'signed' as const,
    signedAt: daysFromNow(-155),
    signedBy: 'Patricia Chen',
    documentUrl: '/documents/ack_pg_001.pdf',
  },
  {
    id: 'ack_004',
    type: 'cash_advance_restriction',
    label: 'Cash Advance Restriction Agreement',
    status: 'pending' as const,
    signedAt: null,
    signedBy: null,
    documentUrl: null,
  },
  {
    id: 'ack_005',
    type: 'data_sharing',
    label: 'Data Sharing & Privacy Consent',
    status: 'not_sent' as const,
    signedAt: null,
    signedBy: null,
    documentUrl: null,
  },
];

// ── ACH Authorization ─────────────────────────────────────────

const MOCK_ACH_AUTHORIZATION = {
  id: 'ach_001',
  status: 'active' as const,
  authorizedAmount: 25000,
  frequency: 'monthly' as const,
  bankLast4: '6789',
  bankName: 'Chase Business Checking',
  authorizedAt: daysFromNow(-150),
  toleranceStatus: 'within_limit' as const,
  debitHistory: Array.from({ length: 6 }, (_, i) => ({
    id: `dbt_${String(i + 1).padStart(3, '0')}`,
    date: dateOnly(-(i * 15 + 5)),
    amount: 4200 + Math.round(Math.random() * 800),
    status: i === 0 ? ('pending' as const) : ('completed' as const),
    returnCode: null,
  })),
};

// ── Business Credit ───────────────────────────────────────────

const MOCK_BUSINESS_CREDIT = {
  scores: [
    {
      bureau: 'dnb_paydex',
      score: 80,
      maxScore: 100,
      rating: 'Good',
      pullDate: daysFromNow(-14),
      tradelines: 12,
      paymentRating: 'Prompt',
    },
    {
      bureau: 'experian_business',
      score: 68,
      maxScore: 100,
      rating: 'Fair',
      pullDate: daysFromNow(-14),
      tradelines: 9,
      paymentRating: 'Mostly Prompt',
    },
    {
      bureau: 'fico_sbss',
      score: 210,
      maxScore: 300,
      rating: 'Good',
      pullDate: daysFromNow(-14),
      tradelines: 15,
      paymentRating: 'Satisfactory',
    },
  ],
  lastPullDate: daysFromNow(-14),
  nextScheduledPull: daysFromNow(16),
};

// ── Credit History (12 months) ────────────────────────────────

const MOCK_CREDIT_HISTORY = {
  months: Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (11 - i));
    return {
      month: d.toISOString().slice(0, 7),
      experian: Math.min(850, Math.max(580, 680 + Math.round((i - 3) * 5 + Math.random() * 15))),
      equifax: Math.min(850, Math.max(580, 695 + Math.round((i - 2) * 4 + Math.random() * 12))),
      transunion: Math.min(850, Math.max(580, 670 + Math.round((i - 4) * 6 + Math.random() * 10))),
    };
  }),
  currentScores: {
    experian: 742,
    equifax: 738,
    transunion: 729,
  },
  trend: 'improving' as const,
};

// ── Credit Recommendations ────────────────────────────────────

const MOCK_CREDIT_RECOMMENDATIONS = [
  {
    id: 'rec_001',
    priority: 'high' as const,
    title: 'Reduce credit utilization below 30%',
    description:
      'Current utilization is at 47%. Paying down $18,500 across two cards would bring utilization to 28%, potentially boosting scores by 25-40 points.',
    estimatedPointImpact: { min: 25, max: 40 },
    category: 'utilization',
    actionable: true,
  },
  {
    id: 'rec_002',
    priority: 'high' as const,
    title: 'Dispute inaccurate late payment on Experian',
    description:
      'A 30-day late payment reported on the Capital One tradeline (Mar 2025) appears to have been paid on time per ACH records. Disputing could recover 15-20 points.',
    estimatedPointImpact: { min: 15, max: 20 },
    category: 'accuracy',
    actionable: true,
  },
  {
    id: 'rec_003',
    priority: 'medium' as const,
    title: 'Add authorized user on a seasoned card',
    description:
      'Adding the business as an authorized user on a 10+ year account with perfect history can add 10-15 points via age-of-accounts improvement.',
    estimatedPointImpact: { min: 10, max: 15 },
    category: 'account_age',
    actionable: true,
  },
  {
    id: 'rec_004',
    priority: 'medium' as const,
    title: 'Open a business credit builder tradeline',
    description:
      'Establishing a new Net-30 vendor account (e.g., Uline, Grainger) that reports to D&B can improve Paydex by 5-10 points within 90 days.',
    estimatedPointImpact: { min: 5, max: 10 },
    category: 'tradelines',
    actionable: true,
  },
  {
    id: 'rec_005',
    priority: 'low' as const,
    title: 'Maintain on-time payment streak',
    description:
      'Current streak is 8 months. Reaching 12 consecutive months of on-time payments will unlock the next scoring tier.',
    estimatedPointImpact: { min: 5, max: 8 },
    category: 'payment_history',
    actionable: false,
  },
];

// ── Repayment ─────────────────────────────────────────────────

const MOCK_REPAYMENT = {
  nextPayment: {
    date: dateOnly(3),
    amount: 8750,
    cards: 3,
    autopay: true,
  },
  totalMonthlyObligations: 34200,
  autopayPct: 72,
  cardsAtRisk: 1,
  paymentCalendar: Array.from({ length: 30 }, (_, i) => ({
    date: dateOnly(i),
    amount: i % 3 === 0 ? 0 : 2500 + Math.round(Math.random() * 3000),
    cardCount: i % 3 === 0 ? 0 : 1 + Math.floor(Math.random() * 3),
    status: i < 0 ? 'paid' : i === 0 ? 'due_today' : 'upcoming',
  })),
  aprExpirySchedule: [
    { issuer: 'Chase', cardLast4: '4821', expiryDate: dateOnly(5), currentApr: 0, postExpiryApr: 24.99, creditLimit: 75000 },
    { issuer: 'American Express', cardLast4: '9173', expiryDate: dateOnly(22), currentApr: 0, postExpiryApr: 21.99, creditLimit: 150000 },
    { issuer: 'Capital One', cardLast4: '6502', expiryDate: dateOnly(28), currentApr: 2.99, postExpiryApr: 26.49, creditLimit: 100000 },
  ],
  payoffWaterfall: [
    { issuer: 'Chase', cardLast4: '4821', balance: 62000, minimumPayment: 1240, suggestedPayment: 5000, priority: 1, reason: 'APR expiry in 5 days' },
    { issuer: 'Capital One', cardLast4: '6502', balance: 48000, minimumPayment: 960, suggestedPayment: 3500, priority: 2, reason: 'Highest post-expiry APR' },
    { issuer: 'American Express', cardLast4: '9173', balance: 95000, minimumPayment: 1900, suggestedPayment: 2500, priority: 3, reason: '0% APR for 22 more days' },
  ],
};

// ── Timeline ──────────────────────────────────────────────────

const MOCK_TIMELINE = [
  { id: 'evt_001', type: 'application', title: 'Round 2 Application Submitted', description: 'Target: $350,000 across 5 cards', timestamp: daysFromNow(-2), actor: 'Sarah Chen', metadata: { roundId: 'round_mh_001' } },
  { id: 'evt_002', type: 'consent', title: 'TCPA Acknowledgment Signed', description: 'Credit pull authorization consent recorded', timestamp: daysFromNow(-3), actor: 'James Harrington', metadata: { documentId: 'doc_tcpa_001' } },
  { id: 'evt_003', type: 'payment', title: 'Autopay Processed — Chase ****4821', description: '$3,500 minimum payment debited', timestamp: daysFromNow(-5), actor: 'System', metadata: { amount: 3500, cardId: 'card_mh_chase_001' } },
  { id: 'evt_004', type: 'call', title: 'APR Expiry Outreach Call', description: 'Discussed Chase card expiry timeline and balance transfer options', timestamp: daysFromNow(-7), actor: 'Sarah Chen', metadata: { callId: 'call_001', duration: '12m 34s' } },
  { id: 'evt_005', type: 'document', title: 'Bank Statement Uploaded', description: 'Chase Business Checking — March 2026', timestamp: daysFromNow(-8), actor: 'James Harrington', metadata: { documentId: 'doc_stmt_001' } },
  { id: 'evt_006', type: 'compliance', title: 'NY Disclosure Filed', description: 'Commercial Finance Disclosure Law — Round 1 filing complete', timestamp: daysFromNow(-10), actor: 'System', metadata: { state: 'NY', filingId: 'fil_001' } },
  { id: 'evt_007', type: 'payment', title: 'Manual Payment Confirmed — Amex ****9173', description: '$5,600 payment verified', timestamp: daysFromNow(-12), actor: 'System', metadata: { amount: 5600 } },
  { id: 'evt_008', type: 'application', title: 'Round 1 Funding Complete', description: '$287,500 total credit secured across 5 cards', timestamp: daysFromNow(-45), actor: 'Sarah Chen', metadata: { roundId: 'round_mh_r1' } },
  { id: 'evt_009', type: 'consent', title: 'Fee & Refund Policy Signed', description: 'Acknowledged fee structure and refund terms', timestamp: daysFromNow(-160), actor: 'James Harrington', metadata: {} },
  { id: 'evt_010', type: 'consent', title: 'Product Reality Acknowledgment Signed', description: 'Client confirmed understanding of product limitations', timestamp: daysFromNow(-160), actor: 'James Harrington', metadata: {} },
  { id: 'evt_011', type: 'compliance', title: 'KYC Verification Complete — James Harrington', description: 'Identity verified via Persona', timestamp: daysFromNow(-170), actor: 'System', metadata: { ownerId: 'own_001' } },
  { id: 'evt_012', type: 'compliance', title: 'KYC Verification Complete — Patricia Chen', description: 'Identity verified via Persona', timestamp: daysFromNow(-168), actor: 'System', metadata: { ownerId: 'own_002' } },
  { id: 'evt_013', type: 'application', title: 'Business Onboarded', description: 'Meridian Holdings LLC created in system', timestamp: daysFromNow(-180), actor: 'Sarah Chen', metadata: {} },
  { id: 'evt_014', type: 'call', title: 'Initial Consultation Call', description: 'Discussed business credit profile and funding strategy', timestamp: daysFromNow(-182), actor: 'Sarah Chen', metadata: { callId: 'call_000', duration: '28m 15s' } },
  { id: 'evt_015', type: 'document', title: 'Articles of Organization Uploaded', description: 'Delaware LLC formation documents', timestamp: daysFromNow(-178), actor: 'James Harrington', metadata: { documentId: 'doc_articles_001' } },
  { id: 'evt_016', type: 'payment', title: 'Enrollment Fee Collected', description: '$2,500 initial enrollment fee processed', timestamp: daysFromNow(-179), actor: 'System', metadata: { amount: 2500 } },
  { id: 'evt_017', type: 'compliance', title: 'EIN Verification Complete', description: 'IRS EIN confirmed via CP 575 letter', timestamp: daysFromNow(-175), actor: 'System', metadata: {} },
  { id: 'evt_018', type: 'call', title: 'Re-stack Strategy Call', description: 'Planned Round 2 timeline and target issuers', timestamp: daysFromNow(-15), actor: 'Sarah Chen', metadata: { callId: 'call_002', duration: '18m 42s' } },
];

// ── Compliance Status ─────────────────────────────────────────

const MOCK_COMPLIANCE_STATUS = {
  complianceScore: 78,
  maxScore: 100,
  overallStatus: 'needs_attention' as const,
  checks: [
    { id: 'chk_001', name: 'KYC — All Owners Verified', status: 'warning' as const, detail: '2 of 3 owners verified; Derek Olsen pending', lastChecked: daysFromNow(-1) },
    { id: 'chk_002', name: 'TCPA Consent Active', status: 'pass' as const, detail: 'Valid consent on file, expires in 180 days', lastChecked: daysFromNow(-1) },
    { id: 'chk_003', name: 'Product Reality Acknowledgment', status: 'pass' as const, detail: 'Signed by James Harrington', lastChecked: daysFromNow(-1) },
    { id: 'chk_004', name: 'Fee & Refund Policy', status: 'pass' as const, detail: 'Signed by James Harrington', lastChecked: daysFromNow(-1) },
    { id: 'chk_005', name: 'Personal Guarantee Disclosure', status: 'pass' as const, detail: 'Signed by Patricia Chen', lastChecked: daysFromNow(-1) },
    { id: 'chk_006', name: 'Cash Advance Restriction', status: 'fail' as const, detail: 'Not yet signed — required before Round 2 disbursement', lastChecked: daysFromNow(-1) },
    { id: 'chk_007', name: 'Data Sharing Consent', status: 'fail' as const, detail: 'Consent form not yet sent', lastChecked: daysFromNow(-1) },
    { id: 'chk_008', name: 'State Disclosure — NY', status: 'pass' as const, detail: 'Filed on time for Round 1', lastChecked: daysFromNow(-10) },
    { id: 'chk_009', name: 'ACH Authorization Active', status: 'pass' as const, detail: 'Authorized for $25,000/month', lastChecked: daysFromNow(-1) },
    { id: 'chk_010', name: 'Annual Revenue Verification', status: 'pass' as const, detail: 'Bank statements verified $4.8M annual revenue', lastChecked: daysFromNow(-30) },
  ],
  lastFullAudit: daysFromNow(-30),
  nextScheduledAudit: daysFromNow(60),
};

// ── Endpoint → mock data map ──────────────────────────────────

export const CLIENT_MOCK_MAP: Record<string, unknown> = {
  'clients/{id}': MOCK_CLIENT_PROFILE,
  'clients/{id}/owners': MOCK_OWNERS,
  'clients/{id}/acknowledgments': MOCK_ACKNOWLEDGMENTS,
  'clients/{id}/ach-authorization': MOCK_ACH_AUTHORIZATION,
  'clients/{id}/credit/business': MOCK_BUSINESS_CREDIT,
  'clients/{id}/credit/history': MOCK_CREDIT_HISTORY,
  'clients/{id}/credit/recommendations': MOCK_CREDIT_RECOMMENDATIONS,
  'clients/{id}/repayment': MOCK_REPAYMENT,
  'clients/{id}/timeline': MOCK_TIMELINE,
  'clients/{id}/compliance/status': MOCK_COMPLIANCE_STATUS,
};

// ── Resolver ──────────────────────────────────────────────────
// Strips the actual client ID from the endpoint path so that any
// ID returns the same mock data.  Example:
//   /api/v1/clients/biz_meridian_001/owners  →  'clients/{id}/owners'

export function getClientMockData(
  endpoint: string,
  _params?: Record<string, string>,
): unknown | null {
  // Strip leading /api/v1/ prefix if present
  const normalized = endpoint.replace(/^\/api\/v1\//, '');

  // Replace the actual client ID segment with {id}
  const withPlaceholder = normalized.replace(
    /^clients\/[^/]+/,
    'clients/{id}',
  );

  return CLIENT_MOCK_MAP[withPlaceholder] ?? null;
}
