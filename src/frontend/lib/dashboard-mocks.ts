// ============================================================
// CapitalForge Dashboard Mock Data
// ============================================================
// Comprehensive mock data for all dashboard endpoints.
// All dates are relative to new Date(). Sparklines are 30-point arrays.
// Activate via NEXT_PUBLIC_USE_MOCK_DATA=true in .env.local
// ============================================================

// ── Client constants ───────────────────────────────────────────────────────

const CLIENTS = {
  meridian: { id: 'biz_meridian_001', name: 'Meridian Holdings LLC', initials: 'MH' },
  apex: { id: 'biz_apex_002', name: 'Apex Ventures Inc.', initials: 'AV' },
  brightline: { id: 'biz_brightline_003', name: 'Brightline Corp', initials: 'BC' },
  thornwood: { id: 'biz_thornwood_004', name: 'Thornwood Capital', initials: 'TC' },
  norcal: { id: 'biz_norcal_005', name: 'Norcal Transport LLC', initials: 'NT' },
} as const;

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

function dayLabel(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function dateOnly(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// ── Sparkline generator ────────────────────────────────────────────────────

function generateSparkline(base: number, variance: number): number[] {
  const points: number[] = [];
  let current = base * 0.7;
  for (let i = 0; i < 30; i++) {
    current += (Math.random() - 0.4) * variance;
    current = Math.max(base * 0.5, Math.min(base * 1.1, current));
    points.push(Math.round(current));
  }
  return points;
}

// ── KPI Summary ────────────────────────────────────────────────────────────
// Consumed by: StatsBar

export const MOCK_KPI_SUMMARY = {
  clients: 42,
  applications: 15,
  funding: 5200000,
  approval_rate: 73.5,
  fees_mtd: 45000,
  trends: {
    clients: '+5 this month',
    applications: '+12 since Monday',
    funding: '+$1.2M this quarter',
    approval_rate: '-2.1pts vs last quarter',
    fees_mtd: '+14% vs last month',
  },
  sparklines: {
    clients: generateSparkline(42, 3),
    applications: generateSparkline(15, 2),
    funding: generateSparkline(5200000, 200000),
    approval_rate: generateSparkline(73, 3),
    fees_mtd: generateSparkline(45000, 3000),
  },
  last_updated: new Date().toISOString(),
};

// ── Consent Status ─────────────────────────────────────────────────────────
// Consumed by: ConsentAlertBanner

export const MOCK_CONSENT_STATUS = {
  missing_acknowledgments: 2,
  expired_consents: 1,
  blocked_applications: 1,
  all_clear: false,
  items: [
    {
      client_id: CLIENTS.meridian.id,
      client_name: CLIENTS.meridian.name,
      issue_type: 'missing_acknowledgment' as const,
      details: 'TCPA acknowledgment not recorded for credit pull authorization',
    },
    {
      client_id: CLIENTS.apex.id,
      client_name: CLIENTS.apex.name,
      issue_type: 'missing_acknowledgment' as const,
      details: 'E-Sign consent form not completed during onboarding',
    },
    {
      client_id: CLIENTS.brightline.id,
      client_name: CLIENTS.brightline.name,
      issue_type: 'expired_consent' as const,
      details: 'Annual credit monitoring consent expired 3 days ago',
    },
    {
      client_id: CLIENTS.norcal.id,
      client_name: CLIENTS.norcal.name,
      issue_type: 'blocked_application' as const,
      details: 'Round 2 application blocked — missing TCPA opt-in for outbound calls',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── APR Expiry Alerts ──────────────────────────────────────────────────────
// Consumed by: AprExpiryPanel
// 1 critical @ 5 days, 2 warning @ 20-30 days, 3 upcoming @ 45-55 days

export const MOCK_APR_EXPIRY = {
  all_clear: false,
  counts: {
    critical: 1,
    warning: 2,
    upcoming: 3,
  },
  alerts: [
    // Critical: 5 days
    {
      client_id: CLIENTS.thornwood.id,
      client_name: CLIENTS.thornwood.name,
      issuer: 'Chase',
      card_last_four: '4821',
      credit_limit: 75000,
      expiry_date: daysFromNow(5),
      days_remaining: 5,
      tier: 'critical' as const,
      card_id: 'card_tw_chase_001',
      funding_round_id: 'round_tw_002',
    },
    // Warning: 22 days
    {
      client_id: CLIENTS.meridian.id,
      client_name: CLIENTS.meridian.name,
      issuer: 'American Express',
      card_last_four: '9173',
      credit_limit: 150000,
      expiry_date: daysFromNow(22),
      days_remaining: 22,
      tier: 'warning' as const,
      card_id: 'card_mh_amex_001',
      funding_round_id: 'round_mh_001',
    },
    // Warning: 28 days
    {
      client_id: CLIENTS.apex.id,
      client_name: CLIENTS.apex.name,
      issuer: 'Capital One',
      card_last_four: '6502',
      credit_limit: 100000,
      expiry_date: daysFromNow(28),
      days_remaining: 28,
      tier: 'warning' as const,
      card_id: 'card_av_cap1_001',
      funding_round_id: 'round_av_001',
    },
    // Upcoming: 45 days
    {
      client_id: CLIENTS.brightline.id,
      client_name: CLIENTS.brightline.name,
      issuer: 'Wells Fargo',
      card_last_four: '3347',
      credit_limit: 50000,
      expiry_date: daysFromNow(45),
      days_remaining: 45,
      tier: 'upcoming' as const,
      card_id: 'card_bc_wf_001',
      funding_round_id: 'round_bc_001',
    },
    // Upcoming: 50 days
    {
      client_id: CLIENTS.norcal.id,
      client_name: CLIENTS.norcal.name,
      issuer: 'US Bank',
      card_last_four: '8814',
      credit_limit: 200000,
      expiry_date: daysFromNow(50),
      days_remaining: 50,
      tier: 'upcoming' as const,
      card_id: 'card_nt_usb_001',
      funding_round_id: null,
    },
    // Upcoming: 55 days
    {
      client_id: CLIENTS.meridian.id,
      client_name: CLIENTS.meridian.name,
      issuer: 'Citi',
      card_last_four: '2290',
      credit_limit: 125000,
      expiry_date: daysFromNow(55),
      days_remaining: 55,
      tier: 'upcoming' as const,
      card_id: 'card_mh_citi_001',
      funding_round_id: 'round_mh_001',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Action Queue ───────────────────────────────────────────────────────────
// Consumed by: ActionQueue — 7 tasks

export const MOCK_ACTION_QUEUE = {
  total_count: 7,
  tasks: [
    {
      id: 'task_001',
      priority: 'critical' as const,
      type: 'expired_consent',
      client_name: CLIENTS.brightline.name,
      client_id: CLIENTS.brightline.id,
      description: 'Annual credit monitoring consent expired — renewal required before next pull',
      due_date: daysFromNow(-1),
      action_url: `/compliance/consent-center?client=${CLIENTS.brightline.id}`,
      action_label: 'Renew Consent',
    },
    {
      id: 'task_002',
      priority: 'critical' as const,
      type: 'apr_expiry',
      client_name: CLIENTS.thornwood.name,
      client_id: CLIENTS.thornwood.id,
      description: 'Chase card ****4821 APR intro period expires in 5 days — contact client',
      due_date: daysFromNow(5),
      action_url: `/voiceforge/outreach?client_id=${CLIENTS.thornwood.id}`,
      action_label: 'Contact Client',
    },
    {
      id: 'task_003',
      priority: 'high' as const,
      type: 'pending_consent',
      client_name: CLIENTS.meridian.name,
      client_id: CLIENTS.meridian.id,
      description: 'TCPA acknowledgment not recorded — required for credit pull authorization',
      due_date: daysFromNow(2),
      action_url: `/compliance/consent-center?client=${CLIENTS.meridian.id}`,
      action_label: 'Request Consent',
    },
    {
      id: 'task_004',
      priority: 'high' as const,
      type: 'pending_deal_review',
      client_name: CLIENTS.apex.name,
      client_id: CLIENTS.apex.id,
      description: 'Round 1 deal package ($250K) awaiting committee review — SLA 4h remaining',
      due_date: daysFromNow(0),
      action_url: `/applications/app_apex_r1/committee`,
      action_label: 'Review Deal',
    },
    {
      id: 'task_005',
      priority: 'high' as const,
      type: 'missing_acknowledgment',
      client_name: CLIENTS.apex.name,
      client_id: CLIENTS.apex.id,
      description: 'E-Sign consent form not completed during onboarding',
      due_date: daysFromNow(3),
      action_url: `/clients/${CLIENTS.apex.id}/documents`,
      action_label: 'Send E-Sign',
    },
    {
      id: 'task_006',
      priority: 'medium' as const,
      type: 'unresolved_compliance',
      client_name: CLIENTS.norcal.name,
      client_id: CLIENTS.norcal.id,
      description: 'California SB 1235 disclosure filing due within 14 days',
      due_date: daysFromNow(14),
      action_url: `/compliance/disclosures/new?state=CA&client=${CLIENTS.norcal.id}`,
      action_label: 'File Disclosure',
    },
    {
      id: 'task_007',
      priority: 'medium' as const,
      type: 'pending_consent',
      client_name: CLIENTS.norcal.name,
      client_id: CLIENTS.norcal.id,
      description: 'TCPA opt-in for outbound calls needed — Round 2 application blocked',
      due_date: daysFromNow(7),
      action_url: `/compliance/consent-center?client=${CLIENTS.norcal.id}`,
      action_label: 'Request Opt-In',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Active Funding Rounds ──────────────────────────────────────────────────
// Consumed by: ActiveFundingRounds — 4 rounds

export const MOCK_ACTIVE_ROUNDS = {
  total_count: 4,
  total_target: 975000,
  total_achieved: 612500,
  rounds: [
    {
      id: 'round_mh_001',
      client_name: CLIENTS.meridian.name,
      client_id: CLIENTS.meridian.id,
      round_number: 2,
      target_credit: 350000,
      achieved_credit: 287500,
      progress_pct: 82,
      cards_approved: 5,
      apr_expiry_soonest: daysFromNow(22),
      apr_days_remaining: 22,
      status: 'in_progress',
    },
    {
      id: 'round_av_001',
      client_name: CLIENTS.apex.name,
      client_id: CLIENTS.apex.id,
      round_number: 1,
      target_credit: 250000,
      achieved_credit: 150000,
      progress_pct: 60,
      cards_approved: 3,
      apr_expiry_soonest: daysFromNow(28),
      apr_days_remaining: 28,
      status: 'in_progress',
    },
    {
      id: 'round_bc_001',
      client_name: CLIENTS.brightline.name,
      client_id: CLIENTS.brightline.id,
      round_number: 1,
      target_credit: 175000,
      achieved_credit: 75000,
      progress_pct: 43,
      cards_approved: 2,
      apr_expiry_soonest: daysFromNow(45),
      apr_days_remaining: 45,
      status: 'in_progress',
    },
    {
      id: 'round_nt_001',
      client_name: CLIENTS.norcal.name,
      client_id: CLIENTS.norcal.id,
      round_number: 3,
      target_credit: 200000,
      achieved_credit: 100000,
      progress_pct: 50,
      cards_approved: 4,
      apr_expiry_soonest: null,
      apr_days_remaining: null,
      status: 'planning',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Portfolio Risk Matrix ──────────────────────────────────────────────────
// Consumed by: PortfolioRiskHeatmap — 5 risk types x 4 severity levels

export const MOCK_RISK_MATRIX = {
  matrix: {
    apr_expiry: {
      low: { count: 12, client_ids: ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12'] },
      medium: { count: 5, client_ids: [CLIENTS.meridian.id, CLIENTS.brightline.id, 'c13', 'c14', 'c15'] },
      high: { count: 2, client_ids: [CLIENTS.apex.id, CLIENTS.norcal.id] },
      critical: { count: 1, client_ids: [CLIENTS.thornwood.id] },
    },
    utilization_spike: {
      low: { count: 18, client_ids: ['c16', 'c17', 'c18', 'c19', 'c20', 'c21', 'c22', 'c23', 'c24', 'c25', 'c26', 'c27', 'c28', 'c29', 'c30', 'c31', 'c32', 'c33'] },
      medium: { count: 7, client_ids: [CLIENTS.apex.id, 'c34', 'c35', 'c36', 'c37', 'c38', 'c39'] },
      high: { count: 3, client_ids: [CLIENTS.meridian.id, CLIENTS.norcal.id, 'c40'] },
      critical: { count: 0, client_ids: [] },
    },
    missed_payment: {
      low: { count: 8, client_ids: ['c41', 'c42', 'c43', 'c44', 'c45', 'c46', 'c47', 'c48'] },
      medium: { count: 3, client_ids: [CLIENTS.brightline.id, 'c49', 'c50'] },
      high: { count: 1, client_ids: [CLIENTS.norcal.id] },
      critical: { count: 1, client_ids: [CLIENTS.thornwood.id] },
    },
    hardship_flag: {
      low: { count: 4, client_ids: ['c51', 'c52', 'c53', 'c54'] },
      medium: { count: 2, client_ids: ['c55', 'c56'] },
      high: { count: 0, client_ids: [] },
      critical: { count: 1, client_ids: [CLIENTS.thornwood.id] },
    },
    processor_risk: {
      low: { count: 15, client_ids: ['c57', 'c58', 'c59', 'c60', 'c61', 'c62', 'c63', 'c64', 'c65', 'c66', 'c67', 'c68', 'c69', 'c70', 'c71'] },
      medium: { count: 4, client_ids: [CLIENTS.meridian.id, CLIENTS.apex.id, 'c72', 'c73'] },
      high: { count: 2, client_ids: [CLIENTS.brightline.id, 'c74'] },
      critical: { count: 0, client_ids: [] },
    },
  },
  critical_count: 3,
  critical_clients: [
    {
      id: CLIENTS.thornwood.id,
      name: CLIENTS.thornwood.name,
      risk_type: 'apr_expiry',
      detail: 'Chase card ****4821 intro APR expires in 5 days — $75K credit limit at risk',
    },
    {
      id: CLIENTS.thornwood.id,
      name: CLIENTS.thornwood.name,
      risk_type: 'missed_payment',
      detail: 'Missed minimum payment on US Bank card — 32 days past due, penalty APR applied',
    },
    {
      id: CLIENTS.thornwood.id,
      name: CLIENTS.thornwood.name,
      risk_type: 'hardship_flag',
      detail: 'Client reported cash flow hardship — revenue dropped 40% in Q1, requesting payment deferral',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Re-Stack Opportunities ─────────────────────────────────────────────────
// Consumed by: RestackOpportunities — 3 opportunities

export const MOCK_RESTACK = {
  total_pipeline_value: 625000,
  opportunities: [
    {
      client_id: CLIENTS.meridian.id,
      client_name: CLIENTS.meridian.name,
      client_initials: CLIENTS.meridian.initials,
      current_round: 2,
      next_round: 3,
      estimated_additional_credit: 275000,
      readiness_score: 92,
      last_funded_date: daysFromNow(-45),
    },
    {
      client_id: CLIENTS.norcal.id,
      client_name: CLIENTS.norcal.name,
      client_initials: CLIENTS.norcal.initials,
      current_round: 3,
      next_round: 4,
      estimated_additional_credit: 200000,
      readiness_score: 78,
      last_funded_date: daysFromNow(-60),
    },
    {
      client_id: CLIENTS.brightline.id,
      client_name: CLIENTS.brightline.name,
      client_initials: CLIENTS.brightline.initials,
      current_round: 1,
      next_round: 2,
      estimated_additional_credit: 150000,
      readiness_score: 65,
      last_funded_date: daysFromNow(-90),
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Upcoming Payments ──────────────────────────────────────────────────────
// Consumed by: UpcomingPayments — 7 days

export const MOCK_PAYMENTS = {
  week_summary: {
    total_due: 47250,
    autopay_pct: 68,
    manual_reminders_needed: 4,
  },
  days: [
    {
      date: dateOnly(0),
      day_label: dayLabel(0),
      payment_count: 3,
      total_amount: 8750,
      status: 'some_manual' as const,
      payments: [
        { client_name: CLIENTS.meridian.name, client_id: CLIENTS.meridian.id, issuer: 'Chase', amount: 3500, payment_type: 'autopay' as const, status: 'upcoming' as const },
        { client_name: CLIENTS.apex.name, client_id: CLIENTS.apex.id, issuer: 'American Express', amount: 2750, payment_type: 'manual' as const, status: 'upcoming' as const },
        { client_name: CLIENTS.brightline.name, client_id: CLIENTS.brightline.id, issuer: 'Capital One', amount: 2500, payment_type: 'autopay' as const, status: 'upcoming' as const },
      ],
    },
    {
      date: dateOnly(1),
      day_label: dayLabel(1),
      payment_count: 2,
      total_amount: 6200,
      status: 'all_autopay' as const,
      payments: [
        { client_name: CLIENTS.thornwood.name, client_id: CLIENTS.thornwood.id, issuer: 'Wells Fargo', amount: 4200, payment_type: 'autopay' as const, status: 'upcoming' as const },
        { client_name: CLIENTS.norcal.name, client_id: CLIENTS.norcal.id, issuer: 'US Bank', amount: 2000, payment_type: 'autopay' as const, status: 'upcoming' as const },
      ],
    },
    {
      date: dateOnly(2),
      day_label: dayLabel(2),
      payment_count: 2,
      total_amount: 9100,
      status: 'some_manual' as const,
      payments: [
        { client_name: CLIENTS.meridian.name, client_id: CLIENTS.meridian.id, issuer: 'American Express', amount: 5600, payment_type: 'manual' as const, status: 'upcoming' as const },
        { client_name: CLIENTS.norcal.name, client_id: CLIENTS.norcal.id, issuer: 'Citi', amount: 3500, payment_type: 'autopay' as const, status: 'upcoming' as const },
      ],
    },
    {
      date: dateOnly(3),
      day_label: dayLabel(3),
      payment_count: 3,
      total_amount: 11500,
      status: 'some_manual' as const,
      payments: [
        { client_name: CLIENTS.apex.name, client_id: CLIENTS.apex.id, issuer: 'Chase', amount: 4800, payment_type: 'autopay' as const, status: 'upcoming' as const },
        { client_name: CLIENTS.brightline.name, client_id: CLIENTS.brightline.id, issuer: 'Wells Fargo', amount: 3200, payment_type: 'manual' as const, status: 'upcoming' as const },
        { client_name: CLIENTS.thornwood.name, client_id: CLIENTS.thornwood.id, issuer: 'Capital One', amount: 3500, payment_type: 'manual' as const, status: 'upcoming' as const },
      ],
    },
    {
      date: dateOnly(4),
      day_label: dayLabel(4),
      payment_count: 1,
      total_amount: 2800,
      status: 'all_autopay' as const,
      payments: [
        { client_name: CLIENTS.norcal.name, client_id: CLIENTS.norcal.id, issuer: 'Chase', amount: 2800, payment_type: 'autopay' as const, status: 'upcoming' as const },
      ],
    },
    {
      date: dateOnly(5),
      day_label: dayLabel(5),
      payment_count: 2,
      total_amount: 5400,
      status: 'all_autopay' as const,
      payments: [
        { client_name: CLIENTS.meridian.name, client_id: CLIENTS.meridian.id, issuer: 'Citi', amount: 3100, payment_type: 'autopay' as const, status: 'upcoming' as const },
        { client_name: CLIENTS.apex.name, client_id: CLIENTS.apex.id, issuer: 'US Bank', amount: 2300, payment_type: 'autopay' as const, status: 'upcoming' as const },
      ],
    },
    {
      date: dateOnly(6),
      day_label: dayLabel(6),
      payment_count: 1,
      total_amount: 3500,
      status: 'has_missed' as const,
      payments: [
        { client_name: CLIENTS.thornwood.name, client_id: CLIENTS.thornwood.id, issuer: 'US Bank', amount: 3500, payment_type: 'manual' as const, status: 'missed' as const },
      ],
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Compliance Deadlines ───────────────────────────────────────────────────
// Consumed by: StateDisclosureDeadlines — 3 states

export const MOCK_COMPLIANCE_DEADLINES = {
  all_clear: false,
  due_within_7_days: 1,
  deadlines: [
    {
      id: 'dl_001',
      state: 'CA',
      regulation_name: 'SB 1235 Commercial Financing Disclosure',
      client_name: CLIENTS.norcal.name,
      client_id: CLIENTS.norcal.id,
      deadline_date: daysFromNow(5),
      days_remaining: 5,
      status: 'pending' as const,
    },
    {
      id: 'dl_002',
      state: 'NY',
      regulation_name: 'Commercial Finance Disclosure Law',
      client_name: CLIENTS.meridian.name,
      client_id: CLIENTS.meridian.id,
      deadline_date: daysFromNow(18),
      days_remaining: 18,
      status: 'pending' as const,
    },
    {
      id: 'dl_003',
      state: 'VA',
      regulation_name: 'Virginia Commercial Financing Disclosure',
      client_name: CLIENTS.apex.name,
      client_id: CLIENTS.apex.id,
      deadline_date: daysFromNow(-3),
      days_remaining: -3,
      status: 'overdue' as const,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Deal Committee Queue ───────────────────────────────────────────────────
// Consumed by: DealCommitteeQueue — 2 deals

export const MOCK_COMMITTEE_QUEUE = {
  queue_count: 2,
  deals: [
    {
      id: 'deal_001',
      client_name: CLIENTS.apex.name,
      client_id: CLIENTS.apex.id,
      deal_amount: 250000,
      risk_tier: 'High',
      submitted_date: daysFromNow(-1),
      reviewers: [
        { name: 'Sarah Chen', responded: true },
        { name: 'Marcus Reid', responded: true },
        { name: 'Olivia Torres', responded: false },
      ],
      consensus: 'split — awaiting third vote',
      sla_hours_remaining: 4.5,
      application_id: 'app_apex_r1',
    },
    {
      id: 'deal_002',
      client_name: CLIENTS.thornwood.name,
      client_id: CLIENTS.thornwood.id,
      deal_amount: 175000,
      risk_tier: 'Critical',
      submitted_date: daysFromNow(-2),
      reviewers: [
        { name: 'Sarah Chen', responded: false },
        { name: 'James Park', responded: false },
        { name: 'Olivia Torres', responded: false },
      ],
      consensus: 'pending',
      sla_hours_remaining: 1.25,
      application_id: 'app_thornwood_r2',
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── VoiceForge Activity ────────────────────────────────────────────────────
// Consumed by: VoiceForgeActivity

export const MOCK_VOICEFORGE = {
  connected: true,
  today_calls: {
    completed: 18,
    scheduled: 7,
    missed: 2,
  },
  campaigns: [
    {
      id: 'camp_001',
      name: 'APR Expiry Outreach — Q2',
      contacted: 34,
      total: 42,
      completion_pct: 81,
      paused: false,
    },
    {
      id: 'camp_002',
      name: 'Re-Stack Round 3 Eligibility',
      contacted: 12,
      total: 28,
      completion_pct: 43,
      paused: false,
    },
    {
      id: 'camp_003',
      name: 'Payment Reminder Follow-Up',
      contacted: 8,
      total: 15,
      completion_pct: 53,
      paused: true,
    },
  ],
  compliance_flags: [
    {
      advisor_name: 'James Park',
      call_time: hoursFromNow(-2),
      flag_type: 'disclosure_missing',
      call_id: 'call_vf_001',
    },
    {
      advisor_name: 'Sarah Chen',
      call_time: hoursFromNow(-5),
      flag_type: 'consent_not_recorded',
      call_id: 'call_vf_002',
    },
    {
      advisor_name: 'Marcus Reid',
      call_time: hoursFromNow(-8),
      flag_type: 'script_deviation',
      call_id: 'call_vf_003',
    },
  ],
  qa_scores: {
    average: 82,
    distribution: [72, 85, 91, 78, 88, 65, 94, 80, 76, 89, 83, 70, 92, 87, 74],
  },
  last_updated: new Date().toISOString(),
};

// ── Nav Badge Counts ───────────────────────────────────────────────────────
// Consumed by: NavBadgeProvider
// These are derived from other mocks but provided as a convenience for
// the /api/v1/dashboard/nav-counts endpoint pattern.

export const MOCK_NAV_COUNTS = {
  dashboardBadge: MOCK_ACTION_QUEUE.total_count,
  applicationsBadge: MOCK_COMMITTEE_QUEUE.queue_count,
  fundingRoundsBadge: MOCK_ACTIVE_ROUNDS.total_count,
};

// ── Feature flag: should we use mocks? ─────────────────────────────────────

export function shouldUseMocks(): boolean {
  return (
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
  );
}

// ── Endpoint → Mock data resolver ──────────────────────────────────────────

export function getMockData(endpoint: string): unknown | null {
  const map: Record<string, unknown> = {
    '/api/v1/dashboard/kpi-summary': MOCK_KPI_SUMMARY,
    '/api/v1/dashboard/consent-status': MOCK_CONSENT_STATUS,
    '/api/v1/dashboard/apr-expiry-alerts': MOCK_APR_EXPIRY,
    '/api/v1/dashboard/action-queue': MOCK_ACTION_QUEUE,
    '/api/v1/dashboard/active-rounds': MOCK_ACTIVE_ROUNDS,
    '/api/v1/dashboard/portfolio-risk-matrix': MOCK_RISK_MATRIX,
    '/api/v1/dashboard/restack-opportunities': MOCK_RESTACK,
    '/api/v1/dashboard/upcoming-payments': MOCK_PAYMENTS,
    '/api/v1/dashboard/compliance-deadlines': MOCK_COMPLIANCE_DEADLINES,
    '/api/v1/dashboard/committee-queue': MOCK_COMMITTEE_QUEUE,
    '/api/v1/dashboard/voiceforge': MOCK_VOICEFORGE,
    '/api/v1/dashboard/nav-counts': MOCK_NAV_COUNTS,
  };
  return map[endpoint] ?? null;
}
