// ============================================================
// CapitalForge Hardship, Compliance, Documents & Contracts Mock Data
// ============================================================
// Mock data for /api/v1/hardship, /compliance, /documents, /contracts endpoints.
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

// ── Hardship Cases ────────────────────────────────────────────

const MOCK_HARDSHIP_CASES = {
  cases: [
    {
      id: 'hard_001',
      client_name: 'Thornwood Capital',
      business: 'Thornwood Capital LLC',
      severity: 'critical' as const,
      status: 'active' as const,
      total_debt: 185000,
      card_count: 3,
      reason: 'Revenue dropped 40% in Q1 due to lost anchor client; requesting payment deferral on all cards',
      cards: [
        { card_id: 'card_tw_chase_001', issuer: 'Chase', last_four: '4821', balance: 72000, apr: 24.99, missed: 2, negotiation_status: 'in_progress' as const },
        { card_id: 'card_tw_usb_001', issuer: 'US Bank', last_four: '8814', balance: 63000, apr: 22.49, missed: 1, negotiation_status: 'pending' as const },
        { card_id: 'card_tw_cap1_001', issuer: 'Capital One', last_four: '3390', balance: 50000, apr: 19.99, missed: 0, negotiation_status: 'not_started' as const },
      ],
      settlement_offers: [
        { issuer: 'Chase', offer_pct: 65, offer_amount: 46800, expires: daysFromNow(14), status: 'pending_client_review' as const },
      ],
    },
    {
      id: 'hard_002',
      client_name: 'Norcal Transport LLC',
      business: 'Norcal Transport LLC',
      severity: 'high' as const,
      status: 'under_review' as const,
      total_debt: 94000,
      card_count: 2,
      reason: 'Fleet maintenance costs doubled unexpectedly; temporary cash flow disruption',
      cards: [
        { card_id: 'card_nt_citi_001', issuer: 'Citi', last_four: '5501', balance: 55000, apr: 21.99, missed: 1, negotiation_status: 'in_progress' as const },
        { card_id: 'card_nt_wf_001', issuer: 'Wells Fargo', last_four: '7742', balance: 39000, apr: 18.49, missed: 0, negotiation_status: 'not_started' as const },
      ],
      settlement_offers: [],
    },
    {
      id: 'hard_003',
      client_name: 'Brightline Corp',
      business: 'Brightline Corp',
      severity: 'moderate' as const,
      status: 'monitoring' as const,
      total_debt: 42000,
      card_count: 1,
      reason: 'Seasonal revenue dip; expects recovery within 60 days',
      cards: [
        { card_id: 'card_bc_amex_001', issuer: 'American Express', last_four: '1188', balance: 42000, apr: 17.99, missed: 0, negotiation_status: 'not_started' as const },
      ],
      settlement_offers: [],
    },
  ],
  counselor_referrals: [
    { id: 'ref_nfcc', name: 'NFCC (National Foundation for Credit Counseling)', url: 'https://www.nfcc.org', phone: '1-800-388-2227', type: 'nonprofit' as const },
    { id: 'ref_accc', name: 'ACCC (American Consumer Credit Counseling)', url: 'https://www.consumercredit.com', phone: '1-800-769-3571', type: 'nonprofit' as const },
    { id: 'ref_cfpb', name: 'CFPB (Consumer Financial Protection Bureau)', url: 'https://www.consumerfinance.gov', phone: '1-855-411-2372', type: 'government' as const },
    { id: 'ref_internal', name: 'CapitalForge Internal Hardship Advisor', url: null, phone: 'ext. 4400', type: 'internal' as const },
  ],
  last_updated: new Date().toISOString(),
};

// ── Compliance Dashboard ──────────────────────────────────────

const MOCK_COMPLIANCE_DASHBOARD = {
  health_score: 84,
  heatmap: {
    disclosure_filing: { low: 18, medium: 5, high: 2, critical: 1 },
    consent_verification: { low: 22, medium: 8, high: 3, critical: 0 },
    rate_cap_check: { low: 30, medium: 4, high: 1, critical: 1 },
    licensing_status: { low: 15, medium: 3, high: 0, critical: 0 },
    adverse_action_notice: { low: 10, medium: 6, high: 2, critical: 0 },
  },
  recent_checks: [
    { id: 'chk_001', type: 'disclosure_filing', client: 'Norcal Transport LLC', risk: 'critical' as const, status: 'failed' as const, date: daysFromNow(-1) },
    { id: 'chk_002', type: 'consent_verification', client: 'Meridian Holdings LLC', risk: 'high' as const, status: 'warning' as const, date: daysFromNow(-1) },
    { id: 'chk_003', type: 'rate_cap_check', client: 'Apex Ventures Inc.', risk: 'medium' as const, status: 'passed' as const, date: daysFromNow(-2) },
    { id: 'chk_004', type: 'licensing_status', client: 'Brightline Corp', risk: 'low' as const, status: 'passed' as const, date: daysFromNow(-2) },
    { id: 'chk_005', type: 'adverse_action_notice', client: 'Thornwood Capital', risk: 'high' as const, status: 'warning' as const, date: daysFromNow(-3) },
    { id: 'chk_006', type: 'rate_cap_check', client: 'Thornwood Capital', risk: 'critical' as const, status: 'failed' as const, date: daysFromNow(-3) },
  ],
  state_law_alerts: [
    { id: 'sla_001', state: 'NY', regulation: 'Commercial Finance Disclosure Law', status: 'overdue' as const, due_date: daysFromNow(-5), detail: 'Annual disclosure filing for 3 active clients overdue by 5 days' },
    { id: 'sla_002', state: 'CA', regulation: 'SB 1235 Commercial Financing Disclosure', status: 'upcoming' as const, due_date: daysFromNow(12), detail: 'Quarterly APR disclosure update required for CA-based borrowers' },
    { id: 'sla_003', state: 'IL', regulation: 'Illinois Commercial Lending Disclosure Act', status: 'upcoming' as const, due_date: daysFromNow(30), detail: 'New regulation effective next month; template updates needed' },
  ],
  last_updated: new Date().toISOString(),
};

// ── Documents Vault ───────────────────────────────────────────

const MOCK_DOCUMENTS_VAULT = {
  documents: [
    { id: 'doc_001', type: 'contract' as const, filename: 'apex_mca_agreement_v2.pdf', business: 'Apex Ventures Inc.', size: '2.4 MB', uploaded: daysFromNow(-10), legal_hold: true, tags: ['MCA', 'signed', 'legal-hold'] },
    { id: 'doc_002', type: 'disclosure' as const, filename: 'norcal_sb1235_disclosure.pdf', business: 'Norcal Transport LLC', size: '890 KB', uploaded: daysFromNow(-5), legal_hold: false, tags: ['CA', 'SB-1235', 'disclosure'] },
    { id: 'doc_003', type: 'consent' as const, filename: 'meridian_tcpa_consent.pdf', business: 'Meridian Holdings LLC', size: '320 KB', uploaded: daysFromNow(-14), legal_hold: false, tags: ['TCPA', 'consent', 'signed'] },
    { id: 'doc_004', type: 'financial' as const, filename: 'thornwood_q1_financials.xlsx', business: 'Thornwood Capital', size: '1.8 MB', uploaded: daysFromNow(-3), legal_hold: true, tags: ['financials', 'Q1', 'legal-hold'] },
    { id: 'doc_005', type: 'application' as const, filename: 'brightline_loc_application.pdf', business: 'Brightline Corp', size: '1.1 MB', uploaded: daysFromNow(-7), legal_hold: false, tags: ['LOC', 'application'] },
    { id: 'doc_006', type: 'contract' as const, filename: 'meridian_round2_terms.pdf', business: 'Meridian Holdings LLC', size: '3.2 MB', uploaded: daysFromNow(-20), legal_hold: false, tags: ['terms', 'round-2', 'signed'] },
    { id: 'doc_007', type: 'compliance' as const, filename: 'apex_adverse_action_notice.pdf', business: 'Apex Ventures Inc.', size: '450 KB', uploaded: daysFromNow(-2), legal_hold: false, tags: ['adverse-action', 'notice'] },
    { id: 'doc_008', type: 'consent' as const, filename: 'norcal_esign_consent.pdf', business: 'Norcal Transport LLC', size: '280 KB', uploaded: daysFromNow(-8), legal_hold: false, tags: ['E-Sign', 'consent'] },
  ],
  stats: {
    total: 8,
    legal_hold: 2,
  },
  last_updated: new Date().toISOString(),
};

// ── Contracts List ────────────────────────────────────────────

const MOCK_CONTRACTS_LIST = {
  contracts: [
    {
      id: 'ctr_001',
      name: 'Apex MCA Agreement',
      slug: 'apex_mca',
      business: 'Apex Ventures Inc.',
      type: 'MCA' as const,
      risk_level: 'high_risk' as const,
      status: 'active' as const,
      executed_date: dateOnly(-45),
      expiry_date: dateOnly(320),
      total_amount: 250000,
      red_flags: [
        { id: 'rf_001', severity: 'high' as const, description: 'Confession of judgment clause present — banned in several states' },
        { id: 'rf_002', severity: 'medium' as const, description: 'Personal guarantee scope exceeds standard market terms' },
        { id: 'rf_003', severity: 'medium' as const, description: 'Reconciliation rights language is ambiguous and may not comply with NY disclosure law' },
      ],
      missing_protections: [
        'Right to cure default period',
        'Prepayment discount clause',
        'Itemized fee schedule',
      ],
    },
    {
      id: 'ctr_002',
      name: 'Summit Line of Credit',
      slug: 'summit_loc',
      business: 'Summit Partners LLC',
      type: 'LOC' as const,
      risk_level: 'moderate' as const,
      status: 'active' as const,
      executed_date: dateOnly(-90),
      expiry_date: dateOnly(275),
      total_amount: 175000,
      red_flags: [
        { id: 'rf_004', severity: 'low' as const, description: 'Auto-renewal clause with 60-day notice window — shorter than industry standard 90 days' },
      ],
      missing_protections: [
        'Rate cap on variable interest',
      ],
    },
    {
      id: 'ctr_003',
      name: 'Brightline Advisor Agreement',
      slug: 'brightline_advisor',
      business: 'Brightline Corp',
      type: 'Advisory' as const,
      risk_level: 'low_risk' as const,
      status: 'active' as const,
      executed_date: dateOnly(-120),
      expiry_date: dateOnly(245),
      total_amount: 50000,
      red_flags: [],
      missing_protections: [],
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Endpoint resolver ─────────────────────────────────────────

export function getHardshipCompDocsMockData(endpoint: string): unknown | null {
  const map: Record<string, unknown> = {
    '/api/v1/hardship/cases': MOCK_HARDSHIP_CASES,
    '/api/v1/compliance/dashboard': MOCK_COMPLIANCE_DASHBOARD,
    '/api/v1/documents/vault': MOCK_DOCUMENTS_VAULT,
    '/api/v1/contracts/list': MOCK_CONTRACTS_LIST,
  };

  return map[endpoint] ?? null;
}
