// ============================================================
// CapitalForge Referrals, Issuers & Workflows Mock Data
// ============================================================
// Mock data for referral partner performance, issuer velocity rules,
// issuer contact logs, recon history, and workflow execution logs.
// ============================================================

// ── Date helpers ───────────────────────────────────────────────────────────

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function hoursFromNow(hours: number): string {
  const d = new Date();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}

// ── Referrals: Partner Performance ───────────────────────────────────────

const MOCK_PARTNER_PERFORMANCE = {
  partners: [
    {
      id: 'ref_partner_001',
      name: 'Meridian Capital Brokers',
      referrals: 4,
      conversion_rate_pct: 75,
      avg_deal_size: 330000,
      total_fees_earned: 10950,
      status: 'active' as const,
    },
    {
      id: 'ref_partner_002',
      name: 'Atlas Referral Network',
      referrals: 3,
      conversion_rate_pct: 67,
      avg_deal_size: 95000,
      total_fees_earned: 4200,
      status: 'active' as const,
    },
    {
      id: 'ref_partner_003',
      name: 'Westside Referral Group',
      referrals: 1,
      conversion_rate_pct: 0,
      avg_deal_size: 0,
      total_fees_earned: 0,
      status: 'inactive' as const,
    },
  ],
  total_referrals: 8,
  overall_conversion_pct: 62.5,
  last_updated: new Date().toISOString(),
};

// ── Issuers: Velocity Rules ──────────────────────────────────────────────

const MOCK_VELOCITY_RULES = {
  issuers: [
    {
      issuer: 'Chase',
      rules: ['5/24 rule — max 5 new cards across all issuers in 24 months', 'Max 2 Chase cards in 30 days'],
      min_credit_score: 680,
      notes: 'Strictly enforced; no exceptions for business cards since 2023.',
    },
    {
      issuer: 'American Express',
      rules: ['Popup jail — system-generated denial based on spending history', 'Lifetime language — bonus limited to once per product per lifetime'],
      min_credit_score: null,
      notes: 'Popup can appear even with excellent credit. No official score minimum published.',
    },
    {
      issuer: 'Capital One',
      rules: ['1 approval per 6 months', 'Pulls all 3 bureaus (Experian, TransUnion, Equifax)'],
      min_credit_score: null,
      notes: 'Very inquiry-sensitive; triple pull makes timing critical.',
    },
    {
      issuer: 'Citi',
      rules: ['1/8 rule — max 1 Citi card per 8 days', '2/65 rule — max 2 Citi cards per 65 days', '6/6 rule — max 6 inquiries in 6 months'],
      min_credit_score: null,
      notes: 'Rules apply independently; violating any one triggers denial.',
    },
    {
      issuer: 'Bank of America',
      rules: ['7/12 rule — max 7 cards across all issuers in 12 months', '2/3/4 rule — max 2 BofA cards per 2 months, 3 per 12 months, 4 total'],
      min_credit_score: null,
      notes: 'Preferred Rewards status may relax limits for existing customers.',
    },
    {
      issuer: 'US Bank',
      rules: ['Existing relationship preferred — checking/savings account strongly recommended', 'Experian primary bureau — most weight on Experian report'],
      min_credit_score: null,
      notes: 'Very conservative with new-to-bank applicants. Pre-existing deposit relationship nearly required.',
    },
    {
      issuer: 'Wells Fargo',
      rules: ['Prefers existing Wells Fargo customers with deposit accounts', 'Conservative underwriting — favors low utilization and long history'],
      min_credit_score: null,
      notes: 'Rarely approves non-customers. Branch relationship can help.',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Issuers: Contact Log ─────────────────────────────────────────────────

const MOCK_CONTACT_LOG = {
  entries: [
    {
      id: 'contact_001',
      issuer: 'Chase',
      date: daysFromNow(-2),
      banker: 'Lisa Reynolds',
      call_type: 'recon' as const,
      outcome: 'approved' as const,
      notes: 'Successfully overturned initial denial for Ink Business Preferred. Client provided additional revenue documentation.',
    },
    {
      id: 'contact_002',
      issuer: 'American Express',
      date: daysFromNow(-5),
      banker: 'Customer Service Rep',
      call_type: 'status_inquiry' as const,
      outcome: 'pending' as const,
      notes: 'Application still under review. Advised 7-10 business days for decision.',
    },
    {
      id: 'contact_003',
      issuer: 'Capital One',
      date: daysFromNow(-7),
      banker: 'Derek Nguyen',
      call_type: 'recon' as const,
      outcome: 'denied' as const,
      notes: 'Too many recent inquiries. Advised to wait 6 months before reapplying.',
    },
    {
      id: 'contact_004',
      issuer: 'Citi',
      date: daysFromNow(-10),
      banker: 'Maria Santos',
      call_type: 'credit_limit_increase' as const,
      outcome: 'approved' as const,
      notes: 'CLI approved from $15K to $25K on Citi Double Cash. No hard pull required.',
    },
    {
      id: 'contact_005',
      issuer: 'US Bank',
      date: daysFromNow(-14),
      banker: 'Branch Manager — Kevin Cho',
      call_type: 'relationship_review' as const,
      outcome: 'approved' as const,
      notes: 'Established business checking account as prerequisite for future card applications.',
    },
    {
      id: 'contact_006',
      issuer: 'Wells Fargo',
      date: daysFromNow(-18),
      banker: 'Amanda Torres',
      call_type: 'recon' as const,
      outcome: 'denied' as const,
      notes: 'Denied due to no existing Wells Fargo relationship. Recommended opening deposit account first.',
    },
  ],
  total_entries: 6,
  last_updated: new Date().toISOString(),
};

// ── Issuers: Recon History ───────────────────────────────────────────────

const MOCK_RECON_HISTORY = {
  attempts: [
    {
      id: 'recon_001',
      app_id: 'APP-0091',
      client: 'Meridian Holdings LLC',
      date: daysFromNow(-2),
      issuer: 'Chase',
      outcome: 'overturned' as const,
      resolution_time: '35 minutes',
      notes: 'Denial reason was "too many recent accounts." Provided business revenue docs and 3-year tax returns.',
    },
    {
      id: 'recon_002',
      app_id: 'APP-0088',
      client: 'Thornwood Capital',
      date: daysFromNow(-5),
      issuer: 'Capital One',
      outcome: 'upheld' as const,
      resolution_time: '20 minutes',
      notes: 'Velocity limit — 1 per 6 months rule. No flexibility from recon agent.',
    },
    {
      id: 'recon_003',
      app_id: 'APP-0089',
      client: 'Brightline Corp',
      date: daysFromNow(-8),
      issuer: 'Citi',
      outcome: 'overturned' as const,
      resolution_time: '45 minutes',
      notes: 'Initially denied for 6/6 inquiry rule. Escalated to supervisor; approved with credit reallocation.',
    },
    {
      id: 'recon_004',
      app_id: 'APP-0090',
      client: 'Apex Ventures Inc.',
      date: daysFromNow(-12),
      issuer: 'Bank of America',
      outcome: 'partial' as const,
      resolution_time: '1 hour 10 minutes',
      notes: 'Requested $50K limit, approved for $30K. BofA cited 2/3/4 rule proximity.',
    },
    {
      id: 'recon_005',
      app_id: 'APP-0087',
      client: 'Norcal Transport LLC',
      date: daysFromNow(-18),
      issuer: 'Wells Fargo',
      outcome: 'upheld' as const,
      resolution_time: '15 minutes',
      notes: 'No existing relationship. Recon agent would not budge. Advised opening checking account.',
    },
  ],
  success_rate_pct: 40,
  avg_resolution_time: '33 minutes',
  last_updated: new Date().toISOString(),
};

// ── Workflows: Execution Log ─────────────────────────────────────────────

const MOCK_EXECUTION_LOG = {
  entries: [
    {
      id: 'wf_001',
      timestamp: hoursFromNow(-1),
      rule_name: 'APR Expiry Alert',
      rule_type: 'alert' as const,
      trigger: 'apr_days_remaining <= 7',
      client: 'Thornwood Capital',
      action: 'Send urgent notification to advisor and client',
      outcome: 'success' as const,
      advisor: 'Sarah Chen',
    },
    {
      id: 'wf_002',
      timestamp: hoursFromNow(-2),
      rule_name: 'Auto-Pay Reminder',
      rule_type: 'notification' as const,
      trigger: 'payment_due_date - 3 days',
      client: 'Meridian Holdings LLC',
      action: 'Send payment reminder email',
      outcome: 'success' as const,
      advisor: 'Marcus Reid',
    },
    {
      id: 'wf_003',
      timestamp: hoursFromNow(-3),
      rule_name: 'Velocity Check — Pre-Application',
      rule_type: 'validation' as const,
      trigger: 'new_application_submitted',
      client: 'Apex Ventures Inc.',
      action: 'Validate issuer velocity rules before submission',
      outcome: 'blocked' as const,
      advisor: 'James Park',
    },
    {
      id: 'wf_004',
      timestamp: hoursFromNow(-4),
      rule_name: 'Credit Utilization Monitor',
      rule_type: 'alert' as const,
      trigger: 'utilization_pct > 30',
      client: 'Brightline Corp',
      action: 'Flag high utilization for advisor review',
      outcome: 'success' as const,
      advisor: 'Olivia Torres',
    },
    {
      id: 'wf_005',
      timestamp: hoursFromNow(-6),
      rule_name: 'Consent Expiry Workflow',
      rule_type: 'compliance' as const,
      trigger: 'consent_expiry_date - 14 days',
      client: 'Norcal Transport LLC',
      action: 'Generate consent renewal task in action queue',
      outcome: 'success' as const,
      advisor: 'Sarah Chen',
    },
    {
      id: 'wf_006',
      timestamp: hoursFromNow(-8),
      rule_name: 'Recon Follow-Up',
      rule_type: 'task' as const,
      trigger: 'recon_outcome = denied',
      client: 'Thornwood Capital',
      action: 'Schedule follow-up recon attempt in 30 days',
      outcome: 'success' as const,
      advisor: 'Marcus Reid',
    },
    {
      id: 'wf_007',
      timestamp: hoursFromNow(-10),
      rule_name: 'New Client Onboarding',
      rule_type: 'workflow' as const,
      trigger: 'client_status = new',
      client: 'Apex Ventures Inc.',
      action: 'Initialize onboarding checklist and assign advisor',
      outcome: 'success' as const,
      advisor: 'James Park',
    },
    {
      id: 'wf_008',
      timestamp: hoursFromNow(-12),
      rule_name: 'Deal Committee Escalation',
      rule_type: 'escalation' as const,
      trigger: 'deal_amount > 200000',
      client: 'Meridian Holdings LLC',
      action: 'Route deal to committee for review',
      outcome: 'success' as const,
      advisor: 'Olivia Torres',
    },
    {
      id: 'wf_009',
      timestamp: hoursFromNow(-18),
      rule_name: 'Disclosure Filing Reminder',
      rule_type: 'compliance' as const,
      trigger: 'disclosure_deadline - 14 days',
      client: 'Norcal Transport LLC',
      action: 'Create compliance task for SB 1235 filing',
      outcome: 'success' as const,
      advisor: 'Sarah Chen',
    },
    {
      id: 'wf_010',
      timestamp: hoursFromNow(-24),
      rule_name: 'Re-Stack Eligibility Check',
      rule_type: 'validation' as const,
      trigger: 'round_completion_pct >= 80',
      client: 'Meridian Holdings LLC',
      action: 'Evaluate client for next funding round',
      outcome: 'success' as const,
      advisor: 'Marcus Reid',
    },
    {
      id: 'wf_011',
      timestamp: hoursFromNow(-30),
      rule_name: 'Velocity Check — Pre-Application',
      rule_type: 'validation' as const,
      trigger: 'new_application_submitted',
      client: 'Brightline Corp',
      action: 'Validate issuer velocity rules before submission',
      outcome: 'success' as const,
      advisor: 'Olivia Torres',
    },
    {
      id: 'wf_012',
      timestamp: hoursFromNow(-36),
      rule_name: 'Payment Missed — Escalation',
      rule_type: 'escalation' as const,
      trigger: 'payment_status = missed AND days_past_due > 30',
      client: 'Thornwood Capital',
      action: 'Escalate to senior advisor and flag in risk matrix',
      outcome: 'success' as const,
      advisor: 'Sarah Chen',
    },
  ],
  total_executions: 12,
  success_count: 11,
  blocked_count: 1,
  failure_count: 0,
  last_updated: new Date().toISOString(),
};

// ── Endpoint resolver ─────────────────────────────────────────────────────

const endpointMap: Record<string, unknown> = {
  '/api/v1/referrals/partner-performance': MOCK_PARTNER_PERFORMANCE,
  '/api/v1/issuers/velocity-rules': MOCK_VELOCITY_RULES,
  '/api/v1/issuers/contact-log': MOCK_CONTACT_LOG,
  '/api/v1/issuers/recon-history': MOCK_RECON_HISTORY,
  '/api/v1/workflows/execution-log': MOCK_EXECUTION_LOG,
};

export function getRefIssWfMockData(endpoint: string): unknown | null {
  return endpointMap[endpoint] ?? null;
}
