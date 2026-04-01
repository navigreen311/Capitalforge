// ============================================================
// CapitalForge Application Mock Data
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

// ── Applications List ─────────────────────────────────────────

const MOCK_APPLICATIONS = {
  applications: [
    {
      id: 'APP-0091',
      client_id: 'biz_meridian_001',
      client_name: 'Meridian Holdings LLC',
      card_product: 'Ink Business Preferred',
      issuer: 'Chase',
      round_number: 2,
      round_id: 'round_mh_001',
      requested: 50000,
      approved: 45000,
      status: 'approved' as const,
      apr_days_remaining: 365,
      consent_status: 'complete' as const,
      missing_consent: null,
      acknowledgment_status: 'signed' as const,
      submitted_date: dateOnly(-10),
      approved_date: dateOnly(-3),
      declined_date: null,
      advisor: 'Sarah Chen',
      days_in_stage: 0,
      business_purpose: 'Working capital expansion',
      decline_reason: null,
    },
    {
      id: 'APP-0090',
      client_id: 'biz_apex_002',
      client_name: 'Apex Ventures Inc.',
      card_product: 'Business Platinum Card',
      issuer: 'American Express',
      round_number: 1,
      round_id: 'round_av_001',
      requested: 75000,
      approved: null,
      status: 'submitted' as const,
      apr_days_remaining: null,
      consent_status: 'complete' as const,
      missing_consent: null,
      acknowledgment_status: 'signed' as const,
      submitted_date: dateOnly(-5),
      approved_date: null,
      declined_date: null,
      advisor: 'Marcus Reid',
      days_in_stage: 5,
      business_purpose: 'Equipment financing',
      decline_reason: null,
    },
    {
      id: 'APP-0089',
      client_id: 'biz_brightline_003',
      client_name: 'Brightline Corp',
      card_product: 'Spark Cash Plus',
      issuer: 'Capital One',
      round_number: 1,
      round_id: 'round_bc_001',
      requested: 40000,
      approved: 35000,
      status: 'approved' as const,
      apr_days_remaining: 270,
      consent_status: 'complete' as const,
      missing_consent: null,
      acknowledgment_status: 'signed' as const,
      submitted_date: dateOnly(-21),
      approved_date: dateOnly(-14),
      declined_date: null,
      advisor: 'Sarah Chen',
      days_in_stage: 0,
      business_purpose: 'Marketing spend',
      decline_reason: null,
    },
    {
      id: 'APP-0088',
      client_id: 'biz_thornwood_004',
      client_name: 'Thornwood Capital',
      card_product: 'Business Advantage Cash Rewards',
      issuer: 'Bank of America',
      round_number: 1,
      round_id: 'round_tw_001',
      requested: 60000,
      approved: null,
      status: 'pending_consent' as const,
      apr_days_remaining: null,
      consent_status: 'blocked' as const,
      missing_consent: 'Product Reality Acknowledgment',
      acknowledgment_status: 'pending' as const,
      submitted_date: null,
      approved_date: null,
      declined_date: null,
      advisor: 'Olivia Torres',
      days_in_stage: 8,
      business_purpose: 'Inventory purchasing',
      decline_reason: null,
    },
    {
      id: 'APP-0087',
      client_id: 'biz_norcal_005',
      client_name: 'Norcal Transport LLC',
      card_product: 'CitiBusiness AAdvantage Platinum',
      issuer: 'Citi',
      round_number: 3,
      round_id: 'round_nt_001',
      requested: 55000,
      approved: null,
      status: 'declined' as const,
      apr_days_remaining: null,
      consent_status: 'complete' as const,
      missing_consent: null,
      acknowledgment_status: 'signed' as const,
      submitted_date: dateOnly(-18),
      approved_date: null,
      declined_date: dateOnly(-12),
      advisor: 'James Park',
      days_in_stage: 0,
      business_purpose: 'Fleet fuel costs',
      decline_reason: 'Excessive velocity — 6 cards opened in 24 months exceeds issuer 5/24 rule',
    },
    {
      id: 'APP-0086',
      client_id: 'biz_meridian_001',
      client_name: 'Meridian Holdings LLC',
      card_product: 'Business Gold Card',
      issuer: 'American Express',
      round_number: 2,
      round_id: 'round_mh_001',
      requested: 100000,
      approved: 100000,
      status: 'approved' as const,
      apr_days_remaining: 330,
      consent_status: 'complete' as const,
      missing_consent: null,
      acknowledgment_status: 'signed' as const,
      submitted_date: dateOnly(-30),
      approved_date: dateOnly(-22),
      declined_date: null,
      advisor: 'Sarah Chen',
      days_in_stage: 0,
      business_purpose: 'Office build-out',
      decline_reason: null,
    },
    {
      id: 'APP-0085',
      client_id: 'biz_apex_002',
      client_name: 'Apex Ventures Inc.',
      card_product: 'Ink Business Cash',
      issuer: 'Chase',
      round_number: 1,
      round_id: 'round_av_001',
      requested: 30000,
      approved: null,
      status: 'draft' as const,
      apr_days_remaining: null,
      consent_status: 'pending' as const,
      missing_consent: 'TCPA Consent',
      acknowledgment_status: 'not_sent' as const,
      submitted_date: null,
      approved_date: null,
      declined_date: null,
      advisor: 'Marcus Reid',
      days_in_stage: 3,
      business_purpose: 'Office supplies',
      decline_reason: null,
    },
    {
      id: 'APP-0084',
      client_id: 'biz_brightline_003',
      client_name: 'Brightline Corp',
      card_product: 'Business Customized Cash Rewards',
      issuer: 'Bank of America',
      round_number: 1,
      round_id: 'round_bc_001',
      requested: 45000,
      approved: null,
      status: 'declined' as const,
      apr_days_remaining: null,
      consent_status: 'complete' as const,
      missing_consent: null,
      acknowledgment_status: 'signed' as const,
      submitted_date: dateOnly(-25),
      approved_date: null,
      declined_date: dateOnly(-20),
      advisor: 'Sarah Chen',
      days_in_stage: 0,
      business_purpose: 'Payroll bridge',
      decline_reason: 'Insufficient business revenue relative to requested limit',
    },
  ],
  summary: {
    total: 8,
    approved_count: 3,
    funded_amount: 180000,
    approval_rate: 50.0,
    avg_days_to_decision: 7.2,
    needs_action_count: 2,
  },
  last_updated: new Date().toISOString(),
};

// ── Application Detail (APP-0091) ─────────────────────────────

const MOCK_APPLICATION_DETAIL = {
  id: 'APP-0091',
  client_id: 'biz_meridian_001',
  client_name: 'Meridian Holdings LLC',
  card_product: 'Ink Business Preferred',
  issuer: 'Chase',
  round_number: 2,
  round_id: 'round_mh_001',
  requested: 50000,
  approved: 45000,
  status: 'approved' as const,
  apr_days_remaining: 365,
  consent_status: 'complete' as const,
  missing_consent: null,
  acknowledgment_status: 'signed' as const,
  submitted_date: dateOnly(-10),
  approved_date: dateOnly(-3),
  declined_date: null,
  advisor: 'Sarah Chen',
  days_in_stage: 0,
  business_purpose: 'Working capital expansion',
  decline_reason: null,
  timeline: [
    { id: 'evt_001', type: 'status_change', title: 'Application approved', timestamp: daysFromNow(-3), actor: 'System', detail: 'Approved for $45,000 credit limit' },
    { id: 'evt_002', type: 'review', title: 'Underwriting review completed', timestamp: daysFromNow(-5), actor: 'Marcus Reid', detail: 'Risk assessment passed — tier 1 approval' },
    { id: 'evt_003', type: 'submission', title: 'Application submitted to issuer', timestamp: daysFromNow(-10), actor: 'Sarah Chen', detail: 'Submitted via Chase business portal' },
    { id: 'evt_004', type: 'consent', title: 'All consents verified', timestamp: daysFromNow(-11), actor: 'System', detail: 'TCPA, E-Sign, and Product Reality acknowledgments confirmed' },
    { id: 'evt_005', type: 'creation', title: 'Application created', timestamp: daysFromNow(-14), actor: 'Sarah Chen', detail: 'Draft created for Round 2 — Ink Business Preferred' },
  ],
  documents: [
    { id: 'doc_001', name: 'Chase Approval Letter', type: 'approval_letter', uploaded_at: daysFromNow(-3), uploaded_by: 'System', url: '/documents/app_0091_approval.pdf' },
    { id: 'doc_002', name: 'Business Financial Statement', type: 'financial_statement', uploaded_at: daysFromNow(-12), uploaded_by: 'James Harrington', url: '/documents/app_0091_financials.pdf' },
  ],
  compliance: {
    score: 95,
    status: 'pass' as const,
    checks: [
      { name: 'TCPA Consent', status: 'pass' as const, detail: 'Valid consent on file' },
      { name: 'E-Sign Agreement', status: 'pass' as const, detail: 'Signed by all owners' },
      { name: 'Product Reality Acknowledgment', status: 'pass' as const, detail: 'Signed and witnessed' },
      { name: 'State Disclosure', status: 'pass' as const, detail: 'NY disclosure filed' },
    ],
  },
  last_updated: new Date().toISOString(),
};

// ── Application Timeline ──────────────────────────────────────

const MOCK_APPLICATION_TIMELINE = {
  events: [
    { id: 'evt_001', type: 'status_change', title: 'Application approved', timestamp: daysFromNow(-3), actor: 'System', detail: 'Approved for $45,000 credit limit' },
    { id: 'evt_002', type: 'review', title: 'Underwriting review completed', timestamp: daysFromNow(-5), actor: 'Marcus Reid', detail: 'Risk assessment passed — tier 1 approval' },
    { id: 'evt_003', type: 'submission', title: 'Application submitted to issuer', timestamp: daysFromNow(-10), actor: 'Sarah Chen', detail: 'Submitted via Chase business portal' },
    { id: 'evt_004', type: 'consent', title: 'All consents verified', timestamp: daysFromNow(-11), actor: 'System', detail: 'TCPA, E-Sign, and Product Reality acknowledgments confirmed' },
    { id: 'evt_005', type: 'creation', title: 'Application created', timestamp: daysFromNow(-14), actor: 'Sarah Chen', detail: 'Draft created for Round 2 — Ink Business Preferred' },
  ],
  last_updated: new Date().toISOString(),
};

// ── Optimizer Recommend ───────────────────────────────────────

const MOCK_OPTIMIZER_RECOMMEND = {
  recommendation: {
    card_product: 'Ink Business Unlimited',
    issuer: 'Chase',
    approval_probability: 0.87,
    apr_months: 12,
    estimated_limit: 35000,
    reason: 'Strong payment history with Chase and low current utilization across existing Chase cards',
  },
  alternatives: [
    {
      card_product: 'Business Gold Card',
      issuer: 'American Express',
      approval_probability: 0.82,
      apr_months: 12,
      estimated_limit: 50000,
      reason: 'No existing Amex relationship — new issuer diversification with high limit potential',
    },
    {
      card_product: 'Spark Cash Plus',
      issuer: 'Capital One',
      approval_probability: 0.74,
      apr_months: 9,
      estimated_limit: 25000,
      reason: 'Capital One has higher approval rates for businesses under 3 years — lower limit but faster approval',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Optimizer Velocity Check ──────────────────────────────────

const MOCK_VELOCITY_CHECK = {
  issuer: 'Chase',
  eligible: true,
  rule: '5/24',
  cards_in_24_months: 3,
  max_allowed: 5,
  note: 'Client has 2 remaining slots under Chase 5/24 rule. Recommend applying before Q3 when oldest card ages out of window.',
  last_updated: new Date().toISOString(),
};

// ── Endpoint → mock data map ──────────────────────────────────

export const APPLICATION_MOCK_MAP: Record<string, unknown> = {
  'applications': MOCK_APPLICATIONS,
  'applications/{id}': MOCK_APPLICATION_DETAIL,
  'applications/{id}/timeline': MOCK_APPLICATION_TIMELINE,
  'optimizer/recommend': MOCK_OPTIMIZER_RECOMMEND,
  'optimizer/velocity-check': MOCK_VELOCITY_CHECK,
};

// ── Resolver ──────────────────────────────────────────────────

export function getApplicationMockData(
  endpoint: string,
  _params?: Record<string, string>,
): unknown | null {
  const normalized = endpoint.replace(/^\/api\/v1\//, '');

  // Direct match first (e.g. 'applications', 'optimizer/recommend')
  if (APPLICATION_MOCK_MAP[normalized] !== undefined) {
    return APPLICATION_MOCK_MAP[normalized];
  }

  // Replace application IDs with {id} placeholder
  const withPlaceholder = normalized.replace(/^applications\/[^/]+/, 'applications/{id}');
  return APPLICATION_MOCK_MAP[withPlaceholder] ?? null;
}
