// ============================================================
// CapitalForge Decisions, Fair Lending & AI Governance Mock Data
// ============================================================
// Mock data for /api/v1/decisions, /api/v1/fair-lending,
// and /api/v1/ai-governance endpoints.
// Used when NEXT_PUBLIC_USE_MOCK_DATA=true.
// ============================================================

function hoursFromNow(hours: number): string {
  const d = new Date();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}

function dateOnly(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// ── Decisions Log ─────────────────────────────────────────────

const MOCK_DECISIONS_LOG = {
  decisions: [
    {
      id: 'dec_log_001',
      timestamp: hoursFromNow(-2),
      business_name: 'Meridian Holdings LLC',
      module: 'Suitability Engine',
      decision_type: 'Score',
      summary: 'Business profile scored favorably across all suitability dimensions.',
      confidence_pct: 94,
      override_status: null,
      factors: [
        'Revenue consistency over 24 months',
        'Low debt-to-income ratio',
        'Industry vertical in preferred tier',
        'Strong personal guarantor credit',
      ],
      inputs: {
        annual_revenue: 2400000,
        time_in_business_months: 48,
        guarantor_fico: 762,
        industry_code: 'NAICS-5415',
      },
    },
    {
      id: 'dec_log_002',
      timestamp: hoursFromNow(-3),
      business_name: 'Apex Ventures Inc.',
      module: 'Card Match',
      decision_type: 'Recommend',
      summary: 'Matched to Chase Ink Business Preferred based on spend profile and reward optimization.',
      confidence_pct: 88,
      override_status: null,
      factors: [
        'High travel spend category',
        'Projected annual spend exceeds $150K',
        'Chase relationship already established',
      ],
      inputs: {
        projected_annual_spend: 185000,
        top_spend_categories: ['travel', 'advertising', 'software'],
        existing_issuer_relationships: ['Chase', 'Amex'],
      },
    },
    {
      id: 'dec_log_003',
      timestamp: hoursFromNow(-5),
      business_name: 'Brightline Corp',
      module: 'Card Match',
      decision_type: 'Exclude',
      summary: 'Excluded from Capital One Spark due to recent inquiry volume and velocity rules.',
      confidence_pct: 87,
      override_status: null,
      factors: [
        'More than 5 hard inquiries in past 6 months',
        'Capital One velocity rule triggered (5/12)',
        'Recent denial from same issuer within 90 days',
      ],
      inputs: {
        hard_inquiries_6mo: 7,
        last_cap1_app_date: dateOnly(-45),
        last_cap1_result: 'denied',
      },
    },
    {
      id: 'dec_log_004',
      timestamp: hoursFromNow(-6),
      business_name: 'Thornwood Capital',
      module: 'Credit Model',
      decision_type: 'Flag',
      summary: 'Flagged for manual review — borderline credit utilization and inconsistent revenue reporting.',
      confidence_pct: 85,
      override_status: 'pending_review',
      factors: [
        'Credit utilization at 72% (threshold: 70%)',
        'Revenue variance >20% across tax returns vs bank statements',
        'Guarantor has recent 30-day late payment',
      ],
      inputs: {
        credit_utilization_pct: 72,
        revenue_variance_pct: 23,
        guarantor_late_payments_12mo: 1,
      },
    },
    {
      id: 'dec_log_005',
      timestamp: hoursFromNow(-8),
      business_name: 'Norcal Transport LLC',
      module: 'Compliance Check',
      decision_type: 'Pass',
      summary: 'All compliance checks passed — OFAC, SAM, state licensing verified.',
      confidence_pct: 97,
      override_status: null,
      factors: [
        'OFAC screening clear',
        'SAM.gov registration active',
        'CA DOT operating authority confirmed',
        'No pending regulatory actions',
      ],
      inputs: {
        ofac_match: false,
        sam_status: 'active',
        state_license_valid: true,
        ein: '**-***4521',
      },
    },
    {
      id: 'dec_log_006',
      timestamp: hoursFromNow(-10),
      business_name: 'Summit Digital Group',
      module: 'Card Match',
      decision_type: 'Recommend',
      summary: 'Recommended Amex Business Gold based on advertising spend volume and cash-flow timing.',
      confidence_pct: 82,
      override_status: null,
      factors: [
        'Heavy advertising spend (>$40K/mo)',
        'Benefit from extended payment terms',
        'No existing Amex business card',
      ],
      inputs: {
        monthly_ad_spend: 47000,
        cash_flow_cycle_days: 45,
        existing_amex_cards: 0,
      },
    },
    {
      id: 'dec_log_007',
      timestamp: hoursFromNow(-12),
      business_name: 'Ironclad Security Solutions',
      module: 'Fraud Detector',
      decision_type: 'Escalate',
      summary: 'Application escalated — address mismatch and anomalous entity registration pattern detected.',
      confidence_pct: 79,
      override_status: null,
      factors: [
        'Business address does not match Secretary of State filing',
        'Entity registered less than 90 days ago',
        'Guarantor SSN linked to 3+ recent applications',
      ],
      inputs: {
        address_match: false,
        entity_age_days: 67,
        ssn_app_count_90d: 4,
      },
    },
    {
      id: 'dec_log_008',
      timestamp: hoursFromNow(-14),
      business_name: 'Greenfield Organics LLC',
      module: 'Risk Scorer',
      decision_type: 'Approval',
      summary: 'Approved with standard terms — risk score within acceptable band after human override of initial caution flag.',
      confidence_pct: 91,
      override_status: 'human_override',
      override_by: 'Sarah Chen (Senior Underwriter)',
      override_reason: 'Seasonal revenue pattern is normal for agricultural businesses; caution flag was a false positive.',
      override_at: hoursFromNow(-13),
      factors: [
        'Risk score 91 (threshold 85)',
        'Seasonal revenue dip flagged but explained by industry pattern',
        'Strong guarantor profile',
        'Existing client with positive payment history',
      ],
      inputs: {
        risk_score: 91,
        industry: 'Agriculture',
        guarantor_fico: 748,
        existing_client: true,
        payment_history_status: 'current',
      },
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Fair Lending Overview ─────────────────────────────────────

const MOCK_FAIR_LENDING_OVERVIEW = {
  coverage_threshold: 87,
  ytd_applications: 87,
  deals_until_trigger: 13,
  overall_approval_rate: 65,
  adverse_actions_issued: 5,
  undelivered_notices: 1,
  data_completeness_score: 83,
  undelivered_notice_detail: {
    app_id: 'APP-0074',
    business_name: 'NovaGo',
    reason: 'Bounced email — no valid delivery address on file',
  },
  approval_rates_by_entity: [
    { entity_type: 'LLC', approval_rate: 68 },
    { entity_type: 'Corp', approval_rate: 72 },
    { entity_type: 'S-Corp', approval_rate: 58 },
    { entity_type: 'Partnership', approval_rate: 0 },
  ],
  adverse_actions: [
    {
      app_id: 'APP-0061',
      business: 'QuickHaul Logistics',
      date: dateOnly(-18),
      stated_reason: 'Insufficient business revenue',
      ai_reason: 'Revenue below minimum threshold ($150K annual)',
      match: true,
      delivered: true,
    },
    {
      app_id: 'APP-0067',
      business: 'Petal & Bloom Florists',
      date: dateOnly(-12),
      stated_reason: 'Time in business too short',
      ai_reason: 'Entity age < 24 months',
      match: true,
      delivered: true,
    },
    {
      app_id: 'APP-0070',
      business: 'TrueNorth Consulting',
      date: dateOnly(-9),
      stated_reason: 'Excessive credit utilization',
      ai_reason: 'Credit utilization 81% exceeds 75% cap',
      match: true,
      delivered: true,
    },
    {
      app_id: 'APP-0074',
      business: 'NovaGo',
      date: dateOnly(-5),
      stated_reason: 'Insufficient credit history',
      ai_reason: 'Thin file — fewer than 3 trade lines',
      match: false,
      delivered: false,
    },
    {
      app_id: 'APP-0079',
      business: 'Forge & Anvil Metalworks',
      date: dateOnly(-2),
      stated_reason: 'High debt-to-income ratio',
      ai_reason: 'DTI 62% exceeds 55% threshold',
      match: true,
      delivered: true,
    },
  ],
  section_1071_checklist: [
    { item: 'Collect applicant demographic data', status: 'complete' },
    { item: 'Record action taken and reasons', status: 'complete' },
    { item: 'Track pricing and credit terms offered', status: 'complete' },
    { item: 'Report census tract of principal place of business', status: 'incomplete' },
    { item: 'Maintain firewall between demographic data and decisioning', status: 'complete' },
    { item: 'Annual LAR submission to CFPB', status: 'not_started' },
  ],
  last_updated: new Date().toISOString(),
};

// ── AI Governance Log ─────────────────────────────────────────

const MOCK_AI_GOVERNANCE_LOG = {
  decisions: [
    {
      module: 'Credit Underwriter',
      type: 'approval',
      entity: 'Meridian Holdings LLC',
      confidence: 0.94,
      model_version: 'cu-v2.3.1',
      time: hoursFromNow(-1),
      override_status: null,
      inputs: {
        annual_revenue: 2400000,
        guarantor_fico: 762,
        years_in_business: 4,
        requested_amount: 250000,
      },
      output_summary: 'Approved for $250,000 credit line at 12.9% APR — all underwriting criteria met.',
    },
    {
      module: 'Credit Underwriter',
      type: 'denial',
      entity: 'QuickHaul Logistics',
      confidence: 0.89,
      model_version: 'cu-v2.3.1',
      time: hoursFromNow(-4),
      override_status: null,
      inputs: {
        annual_revenue: 95000,
        guarantor_fico: 640,
        years_in_business: 1,
        requested_amount: 100000,
      },
      output_summary: 'Denied — revenue below $150K minimum and guarantor FICO below 660 threshold.',
    },
    {
      module: 'Credit Underwriter',
      type: 'approval',
      entity: 'Greenfield Organics LLC',
      confidence: 0.76,
      model_version: 'cu-v2.3.1',
      time: hoursFromNow(-13),
      override_status: 'overridden',
      inputs: {
        annual_revenue: 520000,
        guarantor_fico: 748,
        years_in_business: 6,
        requested_amount: 175000,
      },
      output_summary: 'Initially flagged for seasonal revenue variance; overridden by Senior Underwriter — approved at $175,000.',
    },
    {
      module: 'KYB Extractor',
      type: 'extraction',
      entity: 'Ironclad Security Solutions',
      confidence: 0.83,
      model_version: 'kyb-v1.8.0',
      time: hoursFromNow(-6),
      override_status: null,
      inputs: {
        document_type: 'Articles of Incorporation',
        page_count: 4,
        ocr_quality_score: 0.91,
      },
      output_summary: 'Extracted entity name, EIN, registered agent, and formation date. Address mismatch flagged for review.',
    },
    {
      module: 'Compliance Screener',
      type: 'flag',
      entity: 'Brightline Corp',
      confidence: 0.88,
      model_version: 'cs-v3.1.2',
      time: hoursFromNow(-8),
      override_status: null,
      inputs: {
        screening_type: 'OFAC + PEP',
        entity_names_checked: 3,
        jurisdiction: 'US-CA',
      },
      output_summary: 'Partial name match on OFAC SDN list — flagged for manual review. Likely false positive based on entity details.',
    },
    {
      module: 'Product Recommender',
      type: 'recommendation',
      entity: 'Apex Ventures Inc.',
      confidence: 0.88,
      model_version: 'pr-v1.5.4',
      time: hoursFromNow(-3),
      override_status: null,
      inputs: {
        spend_profile: { travel: 45000, advertising: 62000, software: 28000 },
        existing_cards: ['Chase Ink Preferred'],
        optimization_goal: 'maximize_rewards',
      },
      output_summary: 'Recommended Amex Business Gold for advertising spend category and Capital One Spark for flat-rate backup.',
    },
  ],
  consistency_checks: [
    {
      id: 'cc_001',
      check_name: 'Denial reason consistency',
      description: 'Verify AI-stated denial reasons match adverse action notices.',
      status: 'fail',
      details: 'APP-0074 (NovaGo): AI reason "thin file" does not match stated reason "insufficient credit history" — semantic overlap but not identical wording.',
      checked_at: hoursFromNow(-1),
    },
    {
      id: 'cc_002',
      check_name: 'Approval threshold adherence',
      description: 'All approvals must have confidence >= 0.80 or human override.',
      status: 'pass',
      details: 'All 14 approvals in past 30 days meet threshold or have documented override.',
      checked_at: hoursFromNow(-1),
    },
    {
      id: 'cc_003',
      check_name: 'Model version consistency',
      description: 'All active decisions use the currently deployed model version.',
      status: 'pass',
      details: 'Credit Underwriter v2.3.1, KYB Extractor v1.8.0, Compliance Screener v3.1.2, Product Recommender v1.5.4 — all current.',
      checked_at: hoursFromNow(-1),
    },
    {
      id: 'cc_004',
      check_name: 'Override documentation completeness',
      description: 'All overridden decisions have override_by, override_reason, and override_at fields.',
      status: 'pass',
      details: '3 overrides in past 30 days — all fully documented.',
      checked_at: hoursFromNow(-1),
    },
  ],
  model_versions: [
    {
      module: 'Credit Underwriter',
      versions: [
        {
          version: 'cu-v2.3.1',
          deployed_date: dateOnly(-15),
          avg_confidence: 0.88,
          override_rate: 0.04,
          change_summary: 'Improved seasonal revenue handling; reduced false flags for agricultural and tourism sectors.',
        },
        {
          version: 'cu-v2.2.0',
          deployed_date: dateOnly(-75),
          avg_confidence: 0.85,
          override_rate: 0.08,
          change_summary: 'Added guarantor credit trend analysis; expanded industry code mappings.',
        },
        {
          version: 'cu-v2.1.0',
          deployed_date: dateOnly(-150),
          avg_confidence: 0.82,
          override_rate: 0.11,
          change_summary: 'Initial multi-factor underwriting model with bank statement integration.',
        },
      ],
    },
    {
      module: 'KYB Extractor',
      versions: [
        {
          version: 'kyb-v1.8.0',
          deployed_date: dateOnly(-30),
          avg_confidence: 0.86,
          override_rate: 0.02,
          change_summary: 'Enhanced OCR pipeline for handwritten documents; added address normalization.',
        },
        {
          version: 'kyb-v1.7.2',
          deployed_date: dateOnly(-90),
          avg_confidence: 0.83,
          override_rate: 0.05,
          change_summary: 'Fixed EIN extraction for multi-entity filings; improved date parsing.',
        },
      ],
    },
    {
      module: 'Product Recommender',
      versions: [
        {
          version: 'pr-v1.5.4',
          deployed_date: dateOnly(-10),
          avg_confidence: 0.87,
          override_rate: 0.03,
          change_summary: 'Added issuer velocity rules to recommendation filtering; improved reward optimization scoring.',
        },
        {
          version: 'pr-v1.4.0',
          deployed_date: dateOnly(-60),
          avg_confidence: 0.84,
          override_rate: 0.06,
          change_summary: 'Introduced spend category analysis and multi-card portfolio optimization.',
        },
        {
          version: 'pr-v1.3.1',
          deployed_date: dateOnly(-120),
          avg_confidence: 0.80,
          override_rate: 0.09,
          change_summary: 'Initial recommendation engine with basic issuer matching and credit profile scoring.',
        },
      ],
    },
  ],
  module_performance: [
    {
      module: 'Credit Underwriter',
      decision_count: 34,
      avg_confidence: 0.88,
      override_rate: 0.04,
      below_threshold_rate: 0.06,
    },
    {
      module: 'KYB Extractor',
      decision_count: 28,
      avg_confidence: 0.86,
      override_rate: 0.02,
      below_threshold_rate: 0.04,
    },
    {
      module: 'Compliance Screener',
      decision_count: 41,
      avg_confidence: 0.91,
      override_rate: 0.01,
      below_threshold_rate: 0.02,
    },
    {
      module: 'Product Recommender',
      decision_count: 22,
      avg_confidence: 0.87,
      override_rate: 0.03,
      below_threshold_rate: 0.05,
    },
    {
      module: 'Fraud Detector',
      decision_count: 19,
      avg_confidence: 0.82,
      override_rate: 0.07,
      below_threshold_rate: 0.11,
    },
  ],
  last_updated: new Date().toISOString(),
};

// ── Endpoint resolver ─────────────────────────────────────────

const endpointMap: Record<string, unknown> = {
  '/api/v1/decisions/log': MOCK_DECISIONS_LOG,
  '/api/v1/fair-lending/overview': MOCK_FAIR_LENDING_OVERVIEW,
  '/api/v1/ai-governance/log': MOCK_AI_GOVERNANCE_LOG,
};

export function getDecFLAIMockData(endpoint: string): unknown | null {
  const exact = endpointMap[endpoint];
  if (exact !== undefined) return exact;

  // Fallback: match by path segment
  if (endpoint.includes('decisions')) return MOCK_DECISIONS_LOG;
  if (endpoint.includes('fair-lending')) return MOCK_FAIR_LENDING_OVERVIEW;
  if (endpoint.includes('ai-governance')) return MOCK_AI_GOVERNANCE_LOG;

  return null;
}
