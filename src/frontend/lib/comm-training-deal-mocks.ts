// ============================================================
// CapitalForge Comm Compliance, Training & Deal Committee Mocks
// ============================================================
// Mock data for /api/v1/comm-compliance, /api/v1/training,
// and /api/v1/deal-committee endpoints.
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

// ── Comm Compliance: Scripts ──────────────────────────────────

const MOCK_COMM_SCRIPTS = {
  scripts: [
    {
      id: 'script_001',
      category: 'outbound',
      name: 'Outbound Sales',
      version: '2.3',
      status: 'approved' as const,
      tags: ['sales', 'outbound', 'TCPA'],
      content: `Hello, this is [Advisor Name] calling from [Company Name]. This call may be recorded for quality and compliance purposes.

I'm reaching out regarding business financing options that may be available to your company. Before we proceed, I want to confirm — are you authorized to discuss financial matters on behalf of [Business Name]?

[DISCLOSURE] Please note that our services involve facilitating business credit card applications. Approval is subject to each issuer's underwriting criteria. We do not guarantee approval, credit limits, or specific interest rates.

I'd like to ask a few questions about your business needs to determine which programs may be a good fit. Is now a convenient time?

[If yes, proceed with needs assessment]
[If no, schedule callback]

Thank you for your time. As a reminder, this call has been recorded and you may request a copy at any time.`,
    },
    {
      id: 'script_002',
      category: 'inbound',
      name: 'Inbound Inquiry',
      version: '1.5',
      status: 'approved' as const,
      tags: ['inbound', 'inquiry', 'disclosure'],
      content: `Thank you for calling [Company Name]. My name is [Advisor Name] and I'll be assisting you today. This call may be recorded for quality and compliance purposes.

Before we get started, I'd like to provide some important information:

[DISCLOSURE] Our company facilitates business credit card applications with multiple issuers. We are not a lender and do not make credit decisions. Approval, credit limits, and APR terms are determined solely by each card issuer based on their underwriting criteria.

[DISCLOSURE] There is no cost to apply. Our service fees are only charged upon successful funding and are outlined in our service agreement.

How can I help you today?

[Proceed with caller's inquiry]
[If discussing specific products, reference approved product fact sheets only]

Is there anything else I can assist you with? Thank you for contacting us.`,
    },
    {
      id: 'script_003',
      category: 'rate_discussion',
      name: 'Rate Discussion',
      version: '3.0',
      status: 'approved' as const,
      tags: ['rates', 'APR', 'compliance', 'UDAP'],
      content: `I'd like to discuss the rate structure for the cards in your current stack.

[DISCLOSURE] All interest rates quoted are subject to change based on the issuer's terms and conditions. Introductory or promotional rates are temporary and will convert to the standard variable APR after the promotional period ends.

[MANDATORY] I am not able to guarantee any specific interest rate. The rate you receive will be determined by the issuer based on your creditworthiness at the time of application.

Here's what I can share about the current offers:
- [Card Product]: Introductory APR of [X]% for [Y] months, then variable [Z]%
- Please review the full terms in the issuer's cardholder agreement

[DISCLOSURE] If you are relying on an introductory rate for your business plan, please be aware that rates may increase significantly after the promotional period. We recommend planning for the standard rate.

Do you have any questions about how rates may affect your funding timeline?`,
    },
    {
      id: 'script_004',
      category: 'hardship',
      name: 'Hardship Escalation',
      version: '1.0',
      status: 'pending' as const,
      tags: ['hardship', 'escalation', 'sensitivity', 'draft'],
      content: `I understand you're experiencing financial difficulty with your business. I want you to know that we take this seriously and there are options available.

[DISCLOSURE] This conversation is confidential and will be documented in our hardship case management system. You have the right to request a copy of any notes taken during this call.

Let me ask a few questions to understand your situation:
1. What is the nature of the financial hardship? (revenue decline, unexpected expenses, market conditions)
2. Which accounts or cards are most affected?
3. Have you contacted any of the card issuers directly about hardship programs?

[MANDATORY - DO NOT SKIP] I want to be transparent — entering a hardship program may affect your credit utilization strategy and could impact future funding rounds. I'll connect you with our hardship specialist who can walk you through all implications.

[ESCALATION] Transferring to hardship case manager. Case reference: [Auto-generated]

Please hold while I connect you. Is there anything else you'd like me to note before the transfer?`,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Comm Compliance: QA Scorecard ─────────────────────────────

const MOCK_QA_SCORECARD = {
  advisors: [
    {
      name: 'Sarah Chen',
      initials: 'SC',
      overall: 92,
      compliance: 95,
      script_adherence: 90,
      consent_capture: 91,
      calls_reviewed: 48,
      recent_calls: [
        { date: dateOnly(-1), client: 'Meridian Holdings LLC', score: 94, flags: [] },
        { date: dateOnly(-2), client: 'Apex Ventures Inc.', score: 90, flags: ['minor_script_deviation'] },
        { date: dateOnly(-3), client: 'Brightline Corp', score: 92, flags: [] },
      ],
    },
    {
      name: 'Marcus Williams',
      initials: 'MW',
      overall: 84,
      compliance: 88,
      script_adherence: 82,
      consent_capture: 80,
      calls_reviewed: 42,
      recent_calls: [
        { date: dateOnly(-1), client: 'Norcal Transport LLC', score: 86, flags: [] },
        { date: dateOnly(-2), client: 'Thornwood Capital', score: 80, flags: ['disclosure_rushed'] },
        { date: dateOnly(-4), client: 'Meridian Holdings LLC', score: 85, flags: [] },
      ],
    },
    {
      name: 'Jordan Mitchell',
      initials: 'JM',
      overall: 78,
      compliance: 80,
      script_adherence: 74,
      consent_capture: 79,
      calls_reviewed: 36,
      recent_calls: [
        { date: dateOnly(-1), client: 'Apex Ventures Inc.', score: 76, flags: ['consent_timing'] },
        { date: dateOnly(-3), client: 'Brightline Corp', score: 82, flags: [] },
        { date: dateOnly(-5), client: 'Norcal Transport LLC', score: 75, flags: ['script_deviation', 'disclosure_missing'] },
      ],
    },
    {
      name: 'Sam Delgado',
      initials: 'SD',
      overall: 61,
      compliance: 58,
      script_adherence: 55,
      consent_capture: 64,
      calls_reviewed: 30,
      recent_calls: [
        { date: dateOnly(-1), client: 'Thornwood Capital', score: 58, flags: ['disclosure_missing', 'unauthorized_claim'] },
        { date: dateOnly(-2), client: 'Meridian Holdings LLC', score: 65, flags: ['consent_not_recorded'] },
        { date: dateOnly(-4), client: 'Apex Ventures Inc.', score: 60, flags: ['script_deviation', 'rate_misrepresentation'] },
      ],
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Training: Tracks ──────────────────────────────────────────

const MOCK_TRAINING_TRACKS = {
  tracks: [
    {
      id: 'track_001',
      name: 'New Advisor Onboarding',
      status: 'complete' as const,
      progress_pct: 100,
      modules_completed: 5,
      modules_total: 5,
      modules: [
        { id: 'mod_001', name: 'Company Overview & Mission', status: 'complete' as const, duration_min: 30 },
        { id: 'mod_002', name: 'Compliance Fundamentals', status: 'complete' as const, duration_min: 60 },
        { id: 'mod_003', name: 'Product Knowledge — Card Programs', status: 'complete' as const, duration_min: 45 },
        { id: 'mod_004', name: 'Script Adherence & Call Quality', status: 'complete' as const, duration_min: 45 },
        { id: 'mod_005', name: 'Systems Training — CRM & Dialer', status: 'complete' as const, duration_min: 60 },
      ],
      assigned_advisors: [
        { name: 'Jordan Mitchell', completion_pct: 100 },
        { name: 'Sam Delgado', completion_pct: 100 },
      ],
    },
    {
      id: 'track_002',
      name: 'Annual Compliance Recertification',
      status: 'in_progress' as const,
      progress_pct: 40,
      modules_completed: 2,
      modules_total: 5,
      expiry_date: daysFromNow(30),
      modules: [
        { id: 'mod_006', name: 'TCPA & Consent Requirements', status: 'complete' as const, duration_min: 45 },
        { id: 'mod_007', name: 'UDAP / UDAAP Refresher', status: 'complete' as const, duration_min: 30 },
        { id: 'mod_008', name: 'State Disclosure Laws Update', status: 'not_started' as const, duration_min: 40 },
        { id: 'mod_009', name: 'Data Privacy & Security', status: 'not_started' as const, duration_min: 35 },
        { id: 'mod_010', name: 'Final Certification Exam', status: 'not_started' as const, duration_min: 60 },
      ],
      assigned_advisors: [
        { name: 'Sarah Chen', completion_pct: 80 },
        { name: 'Marcus Williams', completion_pct: 40 },
        { name: 'Jordan Mitchell', completion_pct: 40 },
        { name: 'Sam Delgado', completion_pct: 0 },
        { name: 'Morgan Park', completion_pct: 0 },
      ],
    },
    {
      id: 'track_003',
      name: 'Advanced Stacking Certification',
      status: 'not_started' as const,
      progress_pct: 0,
      modules_completed: 0,
      modules_total: 5,
      modules: [
        { id: 'mod_011', name: 'Multi-Issuer Strategy Design', status: 'not_started' as const, duration_min: 60 },
        { id: 'mod_012', name: 'Risk Assessment & Underwriting', status: 'not_started' as const, duration_min: 45 },
        { id: 'mod_013', name: 'APR Optimization Techniques', status: 'not_started' as const, duration_min: 50 },
        { id: 'mod_014', name: 'Client Communication & Objections', status: 'not_started' as const, duration_min: 40 },
        { id: 'mod_015', name: 'Advanced Certification Exam', status: 'not_started' as const, duration_min: 60 },
      ],
      assigned_advisors: [
        { name: 'Sarah Chen', completion_pct: 0 },
        { name: 'Casey Rivera', completion_pct: 0 },
      ],
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Training: Banned Claims ───────────────────────────────────

const MOCK_BANNED_CLAIMS = {
  claims: [
    {
      id: 'ban_001',
      phrase: 'guaranteed approval',
      severity: 'critical' as const,
      category: 'misleading_outcome',
      regulation: 'UDAP — Unfair, Deceptive, or Abusive Acts or Practices',
      explanation: 'No credit product can guarantee approval. Approval is determined by the issuer based on creditworthiness. Stating otherwise is deceptive under federal and state consumer protection laws.',
      compliant_alternative: 'We can help you apply for cards where your profile may be a strong fit, but approval is always at the issuer\'s discretion.',
      cases: [
        { advisor: 'Sam Delgado', date: dateOnly(-5), call_id: 'call_ban_001', action_taken: 'verbal_warning' },
        { advisor: 'Jordan Mitchell', date: dateOnly(-30), call_id: 'call_ban_002', action_taken: 'retraining' },
      ],
    },
    {
      id: 'ban_002',
      phrase: '0% APR forever',
      severity: 'critical' as const,
      category: 'misleading_rate',
      regulation: 'TILA — Truth in Lending Act; Regulation Z',
      explanation: 'Introductory 0% APR offers are temporary. Implying a permanent 0% rate is a material misrepresentation that violates Truth in Lending requirements.',
      compliant_alternative: 'Some cards offer an introductory 0% APR for a limited period, typically 12 to 21 months, after which the standard variable rate applies.',
      cases: [
        { advisor: 'Sam Delgado', date: dateOnly(-12), call_id: 'call_ban_003', action_taken: 'written_warning' },
      ],
    },
    {
      id: 'ban_003',
      phrase: 'no hard pull on your credit',
      severity: 'high' as const,
      category: 'misleading_process',
      regulation: 'FCRA — Fair Credit Reporting Act',
      explanation: 'Most business credit card applications involve a hard inquiry. Stating otherwise misrepresents the application process and could constitute a deceptive practice.',
      compliant_alternative: 'Some issuers may do a soft pull for pre-qualification, but a hard inquiry is typically required for a formal application.',
      cases: [
        { advisor: 'Jordan Mitchell', date: dateOnly(-18), call_id: 'call_ban_004', action_taken: 'verbal_warning' },
      ],
    },
    {
      id: 'ban_004',
      phrase: 'best rates in the industry',
      severity: 'medium' as const,
      category: 'unsubstantiated_claim',
      regulation: 'FTC Act — Section 5; UDAP',
      explanation: 'Superlative claims like "best rates" require substantiation. Without verifiable comparative data, this claim is deceptive under FTC guidelines.',
      compliant_alternative: 'We work with multiple issuers to find competitive rates that match your business profile.',
      cases: [],
    },
    {
      id: 'ban_005',
      phrase: 'no credit check required',
      severity: 'critical' as const,
      category: 'misleading_process',
      regulation: 'FCRA — Fair Credit Reporting Act; ECOA',
      explanation: 'Credit card issuers are required to evaluate creditworthiness. Stating no credit check is required is factually incorrect and violates fair lending and credit reporting regulations.',
      compliant_alternative: 'A credit evaluation will be part of the application process. We can discuss what issuers typically look for.',
      cases: [
        { advisor: 'Sam Delgado', date: dateOnly(-8), call_id: 'call_ban_005', action_taken: 'suspension_pending_review' },
      ],
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Training: Gaps ────────────────────────────────────────────

const MOCK_TRAINING_GAPS = {
  gaps: [
    {
      advisor: 'Sam Delgado',
      advisor_initials: 'SD',
      severity: 'critical' as const,
      gap_type: 'compliance_violation',
      description: 'UDAP compliance training incomplete — multiple banned claim violations recorded in last 30 days',
      track: 'Annual Compliance Recertification',
      track_id: 'track_002',
      module: 'UDAP / UDAAP Refresher',
      module_id: 'mod_007',
      days_overdue: 15,
    },
    {
      advisor: 'Morgan Park',
      advisor_initials: 'MP',
      severity: 'critical' as const,
      gap_type: 'certification_expired',
      description: 'Annual Compliance Recertification expired — advisor cannot take client calls until completed',
      track: 'Annual Compliance Recertification',
      track_id: 'track_002',
      module: 'Final Certification Exam',
      module_id: 'mod_010',
      days_overdue: 45,
    },
    {
      advisor: 'Casey Rivera',
      advisor_initials: 'CR',
      severity: 'medium' as const,
      gap_type: 'skill_gap',
      description: 'Advanced Stacking Certification not started — required for Tier II and III deal participation',
      track: 'Advanced Stacking Certification',
      track_id: 'track_003',
      module: null,
      module_id: null,
      days_overdue: 0,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Deal Committee: Queue ─────────────────────────────────────

const MOCK_DEAL_QUEUE = {
  deals: [
    {
      id: 'deal_dc_001',
      client_name: 'Apex Ventures Inc.',
      client_id: 'biz_apex_002',
      deal_amount: 250000,
      tier: 'Tier II' as const,
      risk_status: 'blocked' as const,
      sla_remaining_hours: 2.5,
      submitted_date: daysFromNow(-2),
      reviewer_count: 3,
      votes_in: 1,
    },
    {
      id: 'deal_dc_002',
      client_name: 'Summit Partners LLC',
      client_id: 'biz_summit_006',
      deal_amount: 95000,
      tier: 'Tier I' as const,
      risk_status: 'warning' as const,
      sla_remaining_hours: 6.0,
      submitted_date: daysFromNow(-1),
      reviewer_count: 3,
      votes_in: 2,
    },
    {
      id: 'deal_dc_003',
      client_name: 'Meridian Holdings LLC',
      client_id: 'biz_meridian_001',
      deal_amount: 175000,
      tier: 'Tier I' as const,
      risk_status: 'clear' as const,
      sla_remaining_hours: 18.0,
      submitted_date: daysFromNow(0),
      reviewer_count: 3,
      votes_in: 3,
    },
    {
      id: 'deal_dc_004',
      client_name: 'Brightline Corp',
      client_id: 'biz_brightline_003',
      deal_amount: 350000,
      tier: 'Tier III' as const,
      risk_status: 'warning' as const,
      sla_remaining_hours: 4.0,
      submitted_date: daysFromNow(-1),
      reviewer_count: 3,
      votes_in: 1,
    },
    {
      id: 'deal_dc_005',
      client_name: 'Norcal Transport LLC',
      client_id: 'biz_norcal_005',
      deal_amount: 120000,
      tier: 'Tier I' as const,
      risk_status: 'clear' as const,
      sla_remaining_hours: 22.0,
      submitted_date: daysFromNow(0),
      reviewer_count: 3,
      votes_in: 3,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Deal Committee: Deal Detail ───────────────────────────────

const MOCK_DEAL_DETAIL = {
  id: 'deal_dc_001',
  client_name: 'Apex Ventures Inc.',
  client_id: 'biz_apex_002',
  deal_amount: 250000,
  tier: 'Tier II' as const,
  risk_status: 'blocked' as const,
  submitted_date: daysFromNow(-2),
  sla_remaining_hours: 2.5,
  summary: 'Round 1 credit stack application for Apex Ventures — 5 cards across 3 issuers, $250K total requested credit.',
  red_flag_criteria: [
    { id: 'rf_01', label: 'Business age < 2 years', status: 'flagged' as const, detail: 'Apex Ventures incorporated 14 months ago' },
    { id: 'rf_02', label: 'Revenue below $500K annual', status: 'flagged' as const, detail: 'Reported annual revenue: $380K' },
    { id: 'rf_03', label: 'Personal guarantee required', status: 'clear' as const, detail: 'PG signed by CEO on file' },
    { id: 'rf_04', label: 'Existing debt-to-income > 40%', status: 'clear' as const, detail: 'DTI at 32%, within acceptable range' },
    { id: 'rf_05', label: 'Prior bankruptcy (7 years)', status: 'clear' as const, detail: 'No bankruptcy on record' },
    { id: 'rf_06', label: 'Industry risk classification', status: 'warning' as const, detail: 'Technology startup — moderate risk category per underwriting guidelines' },
    { id: 'rf_07', label: 'Credit score below 680', status: 'clear' as const, detail: 'Primary applicant FICO: 712' },
    { id: 'rf_08', label: 'Multiple recent inquiries (>5 in 90 days)', status: 'flagged' as const, detail: '7 hard inquiries in last 90 days' },
    { id: 'rf_09', label: 'Inconsistent documentation', status: 'clear' as const, detail: 'All submitted documents verified and consistent' },
    { id: 'rf_10', label: 'State regulatory restrictions', status: 'clear' as const, detail: 'Operating in compliant jurisdiction (Delaware)' },
  ],
  conditions: [
    { id: 'cond_01', description: 'Obtain updated bank statements (last 3 months)', status: 'pending' as const, assigned_to: 'Sarah Chen' },
    { id: 'cond_02', description: 'Verify business revenue via tax returns or P&L', status: 'pending' as const, assigned_to: 'Marcus Williams' },
    { id: 'cond_03', description: 'Cap total credit request at $200K pending revenue verification', status: 'proposed' as const, assigned_to: null },
    { id: 'cond_04', description: 'Add 6-month utilization monitoring requirement', status: 'approved' as const, assigned_to: 'Olivia Torres' },
  ],
  signoffs: [
    { role: 'Compliance Officer', name: 'Olivia Torres', status: 'approved' as const, date: daysFromNow(-1), notes: 'All disclosures and consent records in order. Approved with utilization monitoring condition.' },
    { role: 'Senior Advisor', name: 'Sarah Chen', status: 'pending' as const, date: null, notes: null },
  ],
  votes: [
    { reviewer: 'Marcus Williams', vote: 'approve_with_conditions' as const, date: daysFromNow(-1), comment: 'Revenue is borderline but business trajectory is positive. Recommend capping at $200K and monitoring.' },
    { reviewer: 'Olivia Torres', vote: 'approve_with_conditions' as const, date: daysFromNow(-1), comment: 'Compliance clear. Agree with reduced cap and monitoring period.' },
    { reviewer: 'James Park', vote: 'pending' as const, date: null, comment: null },
  ],
  last_updated: new Date().toISOString(),
};

// ── Endpoint resolver ─────────────────────────────────────────

export function getCommTrainDealMockData(endpoint: string): unknown | null {
  // Comm compliance endpoints
  if (endpoint.includes('/comm-compliance/scripts')) return MOCK_COMM_SCRIPTS;
  if (endpoint.includes('/comm-compliance/qa-scorecard')) return MOCK_QA_SCORECARD;

  // Training endpoints
  if (endpoint.includes('/training/tracks')) return MOCK_TRAINING_TRACKS;
  if (endpoint.includes('/training/banned-claims')) return MOCK_BANNED_CLAIMS;
  if (endpoint.includes('/training/gaps')) return MOCK_TRAINING_GAPS;

  // Deal committee endpoints
  if (endpoint.includes('/deal-committee/queue')) return MOCK_DEAL_QUEUE;
  if (endpoint.includes('/deal-committee/deal/')) return MOCK_DEAL_DETAIL;

  return null;
}
