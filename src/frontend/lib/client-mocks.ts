// ============================================================
// CapitalForge Client Detail Mock Data
// ============================================================
// Mock data shapes MUST match what components expect.
// Used when NEXT_PUBLIC_USE_MOCK_DATA=true.
// ============================================================

import {
  MOCK_CREDIT_BUILDER_PROGRESS,
  MOCK_TRADELINES,
} from './credit-builder-mocks';

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
  createdAt: daysFromNow(-180),
};

// ── Owners ────────────────────────────────────────────────────

const MOCK_OWNERS = [
  { id: 'own_001', firstName: 'James', lastName: 'Harrington', ownershipPercent: 60, title: 'CEO & Managing Member', kycStatus: 'verified' as const, kycVerifiedAt: daysFromNow(-170), personalGuarantee: true },
  { id: 'own_002', firstName: 'Patricia', lastName: 'Chen', ownershipPercent: 30, title: 'COO', kycStatus: 'verified' as const, kycVerifiedAt: daysFromNow(-168), personalGuarantee: true },
  { id: 'own_003', firstName: 'Derek', lastName: 'Olsen', ownershipPercent: 10, title: 'CFO', kycStatus: 'pending' as const, kycVerifiedAt: null, personalGuarantee: false },
];

// ── Acknowledgments ───────────────────────────────────────────
// Shape matches AcknowledgmentsTab expectations

const MOCK_ACKNOWLEDGMENTS = [
  { id: 'ack_001', type: 'product_reality', label: 'Product Reality Acknowledgment', status: 'signed' as const, signedAt: daysFromNow(-160), signedBy: 'James Harrington', documentUrl: '/documents/ack_001.pdf' },
  { id: 'ack_002', type: 'fee_refund', label: 'Fee & Refund Policy', status: 'signed' as const, signedAt: daysFromNow(-160), signedBy: 'James Harrington', documentUrl: '/documents/ack_002.pdf' },
  { id: 'ack_003', type: 'personal_guarantee', label: 'Personal Guarantee Disclosure', status: 'signed' as const, signedAt: daysFromNow(-155), signedBy: 'Patricia Chen', documentUrl: '/documents/ack_003.pdf' },
  { id: 'ack_004', type: 'cash_advance_restriction', label: 'Cash Advance Restriction Agreement', status: 'pending' as const, signedAt: null, signedBy: null, documentUrl: null },
  { id: 'ack_005', type: 'data_sharing', label: 'Data Sharing & Privacy Consent', status: 'not_sent' as const, signedAt: null, signedBy: null, documentUrl: null },
];

// ── ACH Authorization ─────────────────────────────────────────
// Shape matches AchDebitTab expectations

const MOCK_ACH_AUTHORIZATION = {
  status: 'authorized' as const,
  clientName: 'Meridian Holdings LLC',
  authorizedAmount: 5000,
  authorizedFrequency: 'Monthly',
  authorizationDate: 'Jan 9, 2026',
  bankAccountLast4: '4521',
  bankName: 'Chase',
  accountType: 'Business Checking',
  debits: [
    { id: 'dbt-1', date: 'Mar 1, 2026', amount: 1200, status: 'processed' as const, referenceNumber: 'ACH-2026-0301' },
    { id: 'dbt-2', date: 'Feb 1, 2026', amount: 1200, status: 'processed' as const, referenceNumber: 'ACH-2026-0201' },
    { id: 'dbt-3', date: 'Jan 15, 2026', amount: 800, status: 'failed' as const, referenceNumber: 'ACH-2026-0115' },
    { id: 'dbt-4', date: 'Jan 2, 2026', amount: 1200, status: 'processed' as const, referenceNumber: 'ACH-2026-0102' },
    { id: 'dbt-5', date: 'Dec 15, 2025', amount: 1200, status: 'processed' as const, referenceNumber: 'ACH-2025-1215' },
    { id: 'dbt-6', date: 'Dec 1, 2025', amount: 1200, status: 'processed' as const, referenceNumber: 'ACH-2025-1201' },
  ],
  toleranceAlerts: [],
};

// ── Business Credit ───────────────────────────────────────────
// Shape matches CreditTab's BusinessCreditData interface

const MOCK_BUSINESS_CREDIT = {
  scores: [
    { bureau: 'dnb_paydex', score: 80, maxScore: 100, pullDate: daysFromNow(-14), trend: 'up' as const, trendDelta: 3, tradelines: 12, paymentRating: 'Prompt' },
    { bureau: 'experian_business', score: 68, maxScore: 100, pullDate: daysFromNow(-14), trend: 'stable' as const, trendDelta: 0, tradelines: 9, paymentRating: 'Mostly Prompt' },
    { bureau: 'fico_sbss', score: 210, maxScore: 300, pullDate: daysFromNow(-14), trend: 'up' as const, trendDelta: 8, tradelines: 15, paymentRating: 'Satisfactory' },
  ],
  bestScore: 210,
  totalTradelines: 36,
  businessAgeDays: 1095,
  lastPullDate: daysFromNow(-14),
};

// ── Credit History (12 months) ────────────────────────────────
// Shape matches CreditTab's CreditHistoryData interface

const MOCK_CREDIT_HISTORY = {
  history: Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (11 - i));
    return {
      month: d.toISOString().slice(0, 7),
      experian: Math.min(850, Math.max(650, 700 + i * 4 + Math.round(Math.random() * 8))),
      equifax: Math.min(850, Math.max(650, 695 + i * 3 + Math.round(Math.random() * 10))),
      transunion: Math.min(850, Math.max(650, 710 + i * 3 + Math.round(Math.random() * 6))),
    };
  }),
};

// ── Credit Recommendations ────────────────────────────────────
// Shape matches CreditTab's CreditRecommendationsData interface

const MOCK_CREDIT_RECOMMENDATIONS = {
  recommendations: [
    { id: 'rec_001', description: 'Reduce Equifax utilization from 31% to below 10%', estimatedPointImpact: 18, priority: 'high' as const, category: 'utilization' },
    { id: 'rec_002', description: 'No new credit applications for 60 days (3 recent inquiries)', estimatedPointImpact: 8, priority: 'medium' as const, category: 'inquiries' },
    { id: 'rec_003', description: 'Request CLI on Chase Ink — increases total available credit', estimatedPointImpact: 5, priority: 'low' as const, category: 'limits' },
    { id: 'rec_004', description: 'Add authorized user on seasoned account for age improvement', estimatedPointImpact: 12, priority: 'medium' as const, category: 'account_age' },
    { id: 'rec_005', description: 'Maintain on-time payment streak — 4 more months to next tier', estimatedPointImpact: 6, priority: 'low' as const, category: 'payment_history' },
  ],
};

// ── Repayment ─────────────────────────────────────────────────
// Shape matches RepaymentTab's RepaymentData interface

const MOCK_REPAYMENT = {
  summary: {
    nextPaymentDate: dateOnly(5),
    nextPaymentAmount: 1200,
    nextPaymentCard: 'Ink Business Preferred',
    totalMonthlyObligations: 4800,
    autopayPercent: 67,
    cardsAtRisk: 1,
  },
  payments: [
    { date: dateOnly(5), card: 'Ink Business Preferred', issuer: 'Chase', amount: 1200, type: 'autopay' as const, status: 'upcoming' as const },
    { date: dateOnly(8), card: 'Business Advantage Cash', issuer: 'BofA', amount: 800, type: 'manual' as const, status: 'upcoming' as const },
    { date: dateOnly(15), card: 'Ink Business Cash', issuer: 'Chase', amount: 400, type: 'autopay' as const, status: 'upcoming' as const },
    { date: dateOnly(-2), card: 'Business Advantage Cash', issuer: 'BofA', amount: 800, type: 'manual' as const, status: 'overdue' as const },
    { date: dateOnly(20), card: 'Spark Cash Plus', issuer: 'Capital One', amount: 600, type: 'autopay' as const, status: 'upcoming' as const },
    { date: dateOnly(25), card: 'Ink Business Preferred', issuer: 'Chase', amount: 1200, type: 'autopay' as const, status: 'upcoming' as const },
  ],
  aprExpiry: [
    { cardName: 'Ink Business Preferred', limit: 45000, currentBalance: 12400, expiryDate: dateOnly(49), daysLeft: 49, regularApr: 29.99 },
    { cardName: 'Business Advantage Cash', limit: 35000, currentBalance: 8200, expiryDate: dateOnly(90), daysLeft: 90, regularApr: 26.99 },
  ],
  interestShockMonthly: 592,
  payoffWaterfall: [
    { card: 'Ink Business Preferred', balance: 12400, apr: 29.99, monthlyMinimum: 248, priority: 1, payoffRecommendation: 'Pay off first — highest APR after promo' },
    { card: 'Business Advantage Cash', balance: 8200, apr: 26.99, monthlyMinimum: 164, priority: 2, payoffRecommendation: 'Second priority — 90 days until APR increase' },
    { card: 'Ink Business Cash', balance: 3100, apr: 24.99, monthlyMinimum: 62, priority: 3, payoffRecommendation: 'Low balance — consider full payoff' },
  ],
};

// ── Timeline ──────────────────────────────────────────────────

const MOCK_TIMELINE = {
  events: [
    { id: 'e1', type: 'application', title: 'Application submitted — Ink Business Preferred', timestamp: daysFromNow(-2), actor: 'Sarah Chen', detail: 'Requested $50,000', link: '/applications/APP-0091' },
    { id: 'e2', type: 'application', title: 'Application approved — Ink Business Preferred', timestamp: daysFromNow(-1), actor: 'System', detail: 'Approved for $45,000', link: '/applications/APP-0091' },
    { id: 'e3', type: 'credit', title: 'Credit bureau pulled — all 3 bureaus', timestamp: daysFromNow(-14), actor: 'Sarah Chen', detail: 'Best score: 750 (TransUnion)', link: null },
    { id: 'e4', type: 'consent', title: 'Voice consent granted', timestamp: daysFromNow(-160), actor: 'Client', detail: 'TCPA consent captured', link: null },
    { id: 'e5', type: 'compliance', title: 'KYB verification passed', timestamp: daysFromNow(-170), actor: 'System', detail: 'All beneficial owners verified', link: null },
    { id: 'e6', type: 'payment', title: 'Autopay processed — Chase ****4821', timestamp: daysFromNow(-5), actor: 'System', detail: '$1,200 minimum payment', link: null },
    { id: 'e7', type: 'document', title: 'Bank statement uploaded', timestamp: daysFromNow(-8), actor: 'James Harrington', detail: 'Chase Business Checking — Feb 2026', link: null },
    { id: 'e8', type: 'call', title: 'APR expiry outreach call', timestamp: daysFromNow(-7), actor: 'Sarah Chen', detail: '12m 34s — discussed balance transfer', link: null },
    { id: 'e9', type: 'note', title: 'Client confirmed business expansion plans', timestamp: daysFromNow(-18), actor: 'Sarah Chen', detail: 'Opening second location in Q3', link: null },
    { id: 'e10', type: 'compliance', title: 'NY disclosure filed', timestamp: daysFromNow(-10), actor: 'System', detail: 'Commercial Finance Disclosure Law', link: null },
  ],
  last_updated: new Date().toISOString(),
};

// ── Compliance Status ─────────────────────────────────────────

const MOCK_COMPLIANCE_STATUS = {
  complianceScore: 78,
  checks: [
    { id: 'chk_001', name: 'KYC — All Owners', status: 'warning' as const, detail: '2 of 3 verified', lastChecked: daysFromNow(-1) },
    { id: 'chk_002', name: 'TCPA Consent', status: 'pass' as const, detail: 'Valid, expires in 180d', lastChecked: daysFromNow(-1) },
    { id: 'chk_003', name: 'Cash Advance Restriction', status: 'fail' as const, detail: 'Not yet signed', lastChecked: daysFromNow(-1) },
  ],
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
  'clients/{id}/credit-builder-progress': MOCK_CREDIT_BUILDER_PROGRESS,
  'clients/{id}/tradelines': MOCK_TRADELINES,
};

// ── Resolver ──────────────────────────────────────────────────

export function getClientMockData(
  endpoint: string,
  _params?: Record<string, string>,
): unknown | null {
  const normalized = endpoint.replace(/^\/api\/v1\//, '');
  const withPlaceholder = normalized.replace(/^clients\/[^/]+/, 'clients/{id}');
  return CLIENT_MOCK_MAP[withPlaceholder] ?? null;
}
