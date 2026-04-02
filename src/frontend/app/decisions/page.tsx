'use client';

// ============================================================
// /decisions — Decision Explainability
// AI decision log table with module source, decision type,
// confidence score, override status. "Why this card" panel.
// "Why not" exclusion reasons. Suitability decision breakdown.
// Override audit trail. Row expand with factor breakdown.
// Client selector, export CSV, fraud actions, decision chain.
// ============================================================

import React, { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DecisionType = 'recommend' | 'exclude' | 'flag' | 'score' | 'override' | 'escalate';
type OverrideStatus = 'none' | 'human_override' | 'auto_corrected' | 'pending_review';
type ModuleSource =
  | 'suitability_engine'
  | 'credit_model'
  | 'compliance_check'
  | 'card_match'
  | 'risk_scorer'
  | 'fraud_detector';

interface FactorBreakdown {
  name: string;
  value: string;
  contribution: number; // 0–100
}

interface InputSnapshot {
  label: string;
  value: string;
}

interface AIDecisionLog {
  id: string;
  timestamp: string;
  businessName: string;
  module: ModuleSource;
  decisionType: DecisionType;
  summary: string;
  confidence: number; // 0–100
  overrideStatus: OverrideStatus;
  overrideBy?: string;
  overrideReason?: string;
  linkedCardId?: string;
  factors?: FactorBreakdown[];
  inputSnapshot?: InputSnapshot[];
}

interface WhyThisCard {
  cardProduct: string;
  issuer: string;
  score: number;
  topReasons: { factor: string; impact: 'high' | 'medium' | 'low'; detail: string }[];
  dataPoints: { label: string; value: string }[];
}

interface WhyThisFactorEntry {
  name: string;
  value: string;
  contribution: number; // 0–100
  detail: string;
}

interface WhyNotReason {
  cardProduct: string;
  issuer: string;
  reasons: { code: string; description: string; severity: 'hard_stop' | 'soft_decline' | 'mismatch' }[];
  confidence?: number;
}

interface SuitabilityBreakdown {
  overallScore: number;
  components: { dimension: string; score: number; weight: number; detail: string }[];
  supportingData: { label: string; value: string; source: string }[];
  recommendation: string;
}

interface OverrideAuditEntry {
  id: string;
  timestamp: string;
  decisionId: string;
  businessName: string;
  module: string;
  decisionType: string;
  advisor: string;
  originalDecision: string;
  newDecision: string;
  overrideBy: string;
  reason: string;
  approvedBy?: string;
  approvedAt?: string;
  documented: boolean;
}

// ---------------------------------------------------------------------------
// Client data
// ---------------------------------------------------------------------------

interface ClientProfile {
  id: string;
  name: string;
  businessName: string;
}

const CLIENTS: ClientProfile[] = [
  { id: 'client_001', name: 'Marcus Chen', businessName: 'Apex Ventures LLC' },
  { id: 'client_002', name: 'Sarah Dalton', businessName: 'Summit Capital Group' },
  { id: 'client_003', name: 'James Porter', businessName: 'Blue Ridge Consulting' },
  { id: 'client_004', name: 'Lina Patel', businessName: 'NovaTech Solutions Inc.' },
  { id: 'client_005', name: 'Derek Hoffman', businessName: 'Horizon Retail Partners' },
  { id: 'client_006', name: 'Catherine Wu', businessName: 'Pinnacle Freight Corp' },
];

// ---------------------------------------------------------------------------
// Why This Card — per-client factor data
// ---------------------------------------------------------------------------

const WHY_THIS_FACTORS: Record<string, WhyThisFactorEntry[]> = {
  client_001: [
    { name: 'FICO Score', value: '742', contribution: 85, detail: 'FICO 742 exceeds Chase Ink minimum of 680. Strong credit profile contributes positively to match score.' },
    { name: 'Revenue', value: '$2.4M', contribution: 78, detail: 'Annual revenue $2.4M falls within Chase Ink preferred range ($500K-$5M). Revenue tier compatibility is high.' },
    { name: '5/24 Count', value: '2', contribution: 92, detail: 'Only 2 new accounts in 24 months. Well below Chase 5/24 threshold, maximizing approval probability.' },
    { name: 'Inquiries', value: '2 in 12mo', contribution: 70, detail: '2 hard inquiries in the last 12 months. Low inquiry count signals responsible credit-seeking behavior.' },
  ],
  client_002: [
    { name: 'FICO Score', value: '698', contribution: 55, detail: 'FICO 698 is above minimum but near soft floor. Some issuers may require manual review.' },
    { name: 'Revenue', value: '$1.1M', contribution: 62, detail: 'Revenue $1.1M is acceptable but on the lower end for premium business cards.' },
    { name: '5/24 Count', value: '4', contribution: 40, detail: '4 new accounts in 24 months. Approaching Chase 5/24 limit, which restricts card options.' },
    { name: 'Inquiries', value: '5 in 12mo', contribution: 30, detail: '5 hard inquiries is elevated. Some issuers may flag this for additional scrutiny.' },
  ],
  client_003: [
    { name: 'FICO Score', value: '780', contribution: 95, detail: 'Excellent credit score of 780. Qualifies for all premium products with best terms.' },
    { name: 'Revenue', value: '$3.8M', contribution: 88, detail: 'Strong revenue of $3.8M opens access to higher credit limits and premium tier products.' },
    { name: '5/24 Count', value: '1', contribution: 96, detail: 'Only 1 new account in 24 months. Maximum flexibility for issuer selection.' },
    { name: 'Inquiries', value: '1 in 12mo', contribution: 90, detail: 'Minimal inquiry activity demonstrates disciplined credit management.' },
  ],
  client_004: [
    { name: 'FICO Score', value: '725', contribution: 72, detail: 'FICO 725 is solid but not premium tier. Good fit for mid-range business cards.' },
    { name: 'Revenue', value: '$4.2M', contribution: 90, detail: 'Revenue of $4.2M is strong, qualifying for higher limit products.' },
    { name: '5/24 Count', value: '3', contribution: 60, detail: '3 new accounts in 24 months. Some Chase products may still be available.' },
    { name: 'Inquiries', value: '3 in 12mo', contribution: 55, detail: 'Moderate inquiry count. May trigger additional review with some issuers.' },
  ],
  client_005: [
    { name: 'FICO Score', value: '710', contribution: 65, detail: 'FICO 710 is acceptable but limits access to the most premium offerings.' },
    { name: 'Revenue', value: '$890K', contribution: 50, detail: 'Revenue under $1M restricts access to some high-limit business card programs.' },
    { name: '5/24 Count', value: '5', contribution: 25, detail: 'At the Chase 5/24 limit. Chase products are effectively unavailable.' },
    { name: 'Inquiries', value: '6 in 12mo', contribution: 20, detail: 'High inquiry count signals aggressive credit seeking. Multiple issuers will flag this.' },
  ],
  client_006: [
    { name: 'FICO Score', value: '755', contribution: 82, detail: 'FICO 755 is strong, qualifying for most business card products.' },
    { name: 'Revenue', value: '$5.1M', contribution: 92, detail: 'Revenue of $5.1M exceeds most issuer thresholds for premium business products.' },
    { name: '5/24 Count', value: '0', contribution: 98, detail: 'No new accounts in 24 months. Maximum approval probability across all issuers.' },
    { name: 'Inquiries', value: '0 in 12mo', contribution: 98, detail: 'Zero recent inquiries. Clean inquiry profile is the strongest possible signal.' },
  ],
};

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_LOG: AIDecisionLog[] = [
  {
    id: 'dec_001', timestamp: '2026-03-31T09:12:00Z', businessName: 'Apex Ventures LLC',
    module: 'suitability_engine', decisionType: 'score',
    summary: 'Suitability score calculated: 78/100. Band: Good.', confidence: 94, overrideStatus: 'none',
    factors: [
      { name: 'Credit Quality', value: '80/100', contribution: 80 },
      { name: 'Revenue Stability', value: '85/100', contribution: 85 },
      { name: 'Debt Service Ratio', value: '65/100', contribution: 65 },
      { name: 'Business Maturity', value: '78/100', contribution: 78 },
    ],
    inputSnapshot: [
      { label: 'FICO Score', value: '742' },
      { label: 'Annual Revenue', value: '$2,400,000' },
      { label: 'DTI', value: '47%' },
      { label: 'Business Age', value: '4 yrs 3 mos' },
    ],
  },
  {
    id: 'dec_002', timestamp: '2026-03-31T09:13:00Z', businessName: 'Apex Ventures LLC',
    module: 'card_match', decisionType: 'recommend',
    summary: 'Chase Ink Business Cash recommended as primary match.', confidence: 88, overrideStatus: 'none',
    linkedCardId: 'card_chase_ink_cash',
    factors: [
      { name: 'Spend Category Match', value: '62% office/telecom', contribution: 90 },
      { name: 'Revenue Tier', value: '$2.4M', contribution: 78 },
      { name: 'Credit Profile Fit', value: 'FICO 742', contribution: 72 },
      { name: 'Inquiry Count', value: '2 in 12mo', contribution: 85 },
    ],
    inputSnapshot: [
      { label: 'Top Spend Category', value: 'Office Supplies (38%)' },
      { label: 'Second Category', value: 'Telecom (24%)' },
      { label: 'Requested Limit', value: '$25,000' },
    ],
  },
  {
    id: 'dec_003', timestamp: '2026-03-31T09:13:30Z', businessName: 'Apex Ventures LLC',
    module: 'card_match', decisionType: 'exclude',
    summary: 'Amex Plum Card excluded — spend pattern mismatch.', confidence: 92, overrideStatus: 'none',
    linkedCardId: 'card_amex_plum',
    factors: [
      { name: 'Spend Pattern Match', value: 'Import/Export vs Domestic', contribution: 15 },
      { name: 'Cash Flow Pattern', value: 'Partial payoff history', contribution: 25 },
    ],
    inputSnapshot: [
      { label: 'Primary Spend Type', value: 'Domestic Office/Telecom' },
      { label: 'Payment Pattern', value: 'Partial balance payoff' },
    ],
  },
  {
    id: 'dec_004', timestamp: '2026-03-31T09:14:00Z', businessName: 'Summit Capital Group',
    module: 'credit_model', decisionType: 'flag',
    summary: 'FICO proximity to floor detected. DTI at 47%.', confidence: 85, overrideStatus: 'pending_review',
    factors: [
      { name: 'FICO Distance to Floor', value: '698 vs 680 min', contribution: 35 },
      { name: 'DTI Ratio', value: '47%', contribution: 42 },
      { name: 'Payment History', value: '96% on-time', contribution: 70 },
    ],
    inputSnapshot: [
      { label: 'FICO Score', value: '698' },
      { label: 'DTI', value: '47%' },
      { label: 'Total Monthly Debt', value: '$14,100' },
      { label: 'Monthly Income', value: '$30,000' },
    ],
  },
  {
    id: 'dec_005', timestamp: '2026-03-31T09:15:00Z', businessName: 'Blue Ridge Consulting',
    module: 'compliance_check', decisionType: 'flag',
    summary: 'NY AG inquiry match on principal. Legal review triggered.', confidence: 99, overrideStatus: 'none',
    factors: [
      { name: 'AG Database Match', value: 'NY AG Inquiry #2024-1847', contribution: 95 },
      { name: 'Match Confidence', value: 'Name + SSN partial', contribution: 88 },
    ],
    inputSnapshot: [
      { label: 'Principal Name', value: 'James Porter' },
      { label: 'State', value: 'New York' },
      { label: 'Match Type', value: 'Name + SSN partial' },
    ],
  },
  {
    id: 'dec_006', timestamp: '2026-03-31T09:16:00Z', businessName: 'NovaTech Solutions Inc.',
    module: 'risk_scorer', decisionType: 'score',
    summary: 'Risk score 42/100. Category: Moderate. DTI acceptable.', confidence: 80, overrideStatus: 'human_override',
    overrideBy: 'Ana Reyes', overrideReason: 'Strong revenue trend offsets DTI concern.',
    factors: [
      { name: 'Credit Risk', value: '42/100', contribution: 42 },
      { name: 'Revenue Trend', value: '+18% YoY', contribution: 82 },
      { name: 'DTI Impact', value: 'Borderline', contribution: 50 },
    ],
    inputSnapshot: [
      { label: 'Risk Score', value: '42/100' },
      { label: 'Revenue Growth', value: '+18% YoY' },
      { label: 'Avg Bank Balance', value: '$88,000' },
    ],
  },
  {
    id: 'dec_007', timestamp: '2026-03-31T09:17:00Z', businessName: 'Horizon Retail Partners',
    module: 'fraud_detector', decisionType: 'escalate',
    summary: 'Bank statement inconsistency detected. Velocity anomaly flagged.', confidence: 76, overrideStatus: 'none',
    factors: [
      { name: 'Statement Consistency', value: 'Mismatch detected', contribution: 30 },
      { name: 'Velocity Anomaly', value: '4x normal rate', contribution: 22 },
      { name: 'Address Verification', value: 'Partial match', contribution: 55 },
    ],
    inputSnapshot: [
      { label: 'Statement Source', value: 'Uploaded PDF' },
      { label: 'Velocity', value: '4 applications in 48 hrs' },
      { label: 'Address Match', value: 'Partial (ZIP only)' },
    ],
  },
  {
    id: 'dec_008', timestamp: '2026-03-31T09:18:00Z', businessName: 'Pinnacle Freight Corp',
    module: 'suitability_engine', decisionType: 'recommend',
    summary: 'Capital One Spark Cash Plus recommended. Travel category match.', confidence: 91, overrideStatus: 'auto_corrected',
    factors: [
      { name: 'Cash Back Alignment', value: 'High spend match', contribution: 88 },
      { name: 'Credit Profile', value: 'FICO 755', contribution: 82 },
      { name: 'Revenue Tier', value: '$5.1M', contribution: 92 },
    ],
    inputSnapshot: [
      { label: 'FICO Score', value: '755' },
      { label: 'Annual Revenue', value: '$5,100,000' },
      { label: 'Travel Budget', value: '$0 (updated)' },
    ],
  },
];

const PLACEHOLDER_WHY_THIS: WhyThisCard = {
  cardProduct: 'Chase Ink Business Cash',
  issuer: 'Chase',
  score: 94,
  topReasons: [
    { factor: 'Spend Category Match',       impact: 'high',   detail: 'Business has >60% office supply and telecom spend — aligns with 5% cashback categories.' },
    { factor: 'Revenue Tier Compatibility', impact: 'high',   detail: 'Annual revenue $2.4M matches Chase Ink preferred range ($500K–$5M).' },
    { factor: 'Credit Profile Fit',         impact: 'medium', detail: 'FICO 742 and 4yr business age exceed Chase underwriting minimum.' },
    { factor: 'Low Personal Inquiry Count', impact: 'medium', detail: '2 inquiries in 12 months — below Chase 5/24 threshold.' },
    { factor: 'Industry Compatibility',     impact: 'low',    detail: 'B2B professional services SIC code has high Chase Ink approval history.' },
  ],
  dataPoints: [
    { label: 'Annual Revenue',       value: '$2,400,000' },
    { label: 'Personal FICO',        value: '742' },
    { label: 'Business Age',         value: '4 yrs 3 mos' },
    { label: 'Inquiries (12 mo)',     value: '2' },
    { label: 'Requested Limit',      value: '$25,000' },
    { label: 'Suitability Score',    value: '78 / 100' },
  ],
};

const PLACEHOLDER_WHY_NOT: WhyNotReason[] = [
  {
    cardProduct: 'Amex Plum Card', issuer: 'Amex',
    confidence: 92,
    reasons: [
      { code: 'SPEND_MISMATCH',    description: 'Plum Card targets import/export businesses; client spend is domestic office/telecom.', severity: 'soft_decline' },
      { code: 'CASH_FLOW_PATTERN', description: 'Amex Plum requires consistent full balance payoff; cash flow analysis shows partial payment history.', severity: 'hard_stop' },
    ],
  },
  {
    cardProduct: 'Citi Business Platinum', issuer: 'Citi',
    confidence: 78,
    reasons: [
      { code: 'CREDIT_THRESHOLD',  description: 'Citi preferred minimum FICO 750+. Current 742 is below soft floor.', severity: 'soft_decline' },
      { code: 'INQUIRY_COUNT',     description: 'Citi internal scoring penalizes 2+ inquiries in 6 months. Client has 2 in 5 months.', severity: 'mismatch' },
    ],
  },
  {
    cardProduct: 'US Bank Business Altitude Connect', issuer: 'US Bank',
    confidence: 85,
    reasons: [
      { code: 'INDUSTRY_MISMATCH', description: 'Product optimized for T&E spend. Client has minimal travel budget.', severity: 'mismatch' },
    ],
  },
];

const PLACEHOLDER_SUITABILITY: SuitabilityBreakdown = {
  overallScore: 78,
  recommendation: 'Client is suitable for a 3-card stack up to $75,000 combined limit. Primary card recommendation: Chase Ink Business Cash. Proceed with conditional approval pending bank statement verification.',
  components: [
    { dimension: 'Credit Quality',       score: 80, weight: 30, detail: 'FICO 742, 4yr history, 2 inquiries — strong.' },
    { dimension: 'Revenue Stability',    score: 85, weight: 25, detail: 'YoY revenue growth 18%. 3-month trend positive.' },
    { dimension: 'Debt Service Ratio',   score: 65, weight: 20, detail: 'DTI 47% — borderline. Monitored.' },
    { dimension: 'Business Maturity',    score: 78, weight: 15, detail: '4+ years operations, documented clients.' },
    { dimension: 'Industry Risk',        score: 90, weight: 10, detail: 'Professional services — low default category.' },
  ],
  supportingData: [
    { label: 'FICO Score',             value: '742',        source: 'Experian pull 2026-03-28' },
    { label: 'Annual Revenue',         value: '$2,400,000', source: 'Bank statement avg (3 mo)' },
    { label: 'Monthly Net Cash Flow',  value: '$42,000',    source: 'Bank statement verified' },
    { label: 'Total Monthly Debt',     value: '$19,740',    source: 'Credit bureau + stated' },
    { label: 'DTI',                    value: '47%',        source: 'Calculated' },
    { label: 'Derogatory Marks',       value: '0',          source: 'All 3 bureaus' },
    { label: 'Bank Account Age',       value: '6 years',    source: 'Bank statement header' },
    { label: 'Avg Monthly Balance',    value: '$88,000',    source: 'Bank statement avg (3 mo)' },
  ],
};

// Per-client suitability data
const CLIENT_SUITABILITY: Record<string, { overallScore: number; factors: { name: string; score: number; weight: number }[] }> = {
  client_001: { overallScore: 72, factors: [
    { name: 'Credit', score: 82, weight: 30 },
    { name: 'Financials', score: 75, weight: 25 },
    { name: 'Leverage', score: 68, weight: 20 },
    { name: 'Repayment', score: 70, weight: 15 },
    { name: 'Stability', score: 60, weight: 10 },
  ]},
  client_002: { overallScore: 58, factors: [
    { name: 'Credit', score: 55, weight: 30 },
    { name: 'Financials', score: 60, weight: 25 },
    { name: 'Leverage', score: 48, weight: 20 },
    { name: 'Repayment', score: 65, weight: 15 },
    { name: 'Stability', score: 55, weight: 10 },
  ]},
  client_003: { overallScore: 88, factors: [
    { name: 'Credit', score: 95, weight: 30 },
    { name: 'Financials', score: 88, weight: 25 },
    { name: 'Leverage', score: 82, weight: 20 },
    { name: 'Repayment', score: 85, weight: 15 },
    { name: 'Stability', score: 80, weight: 10 },
  ]},
  client_004: { overallScore: 70, factors: [
    { name: 'Credit', score: 72, weight: 30 },
    { name: 'Financials', score: 80, weight: 25 },
    { name: 'Leverage', score: 58, weight: 20 },
    { name: 'Repayment', score: 68, weight: 15 },
    { name: 'Stability', score: 62, weight: 10 },
  ]},
  client_005: { overallScore: 45, factors: [
    { name: 'Credit', score: 50, weight: 30 },
    { name: 'Financials', score: 42, weight: 25 },
    { name: 'Leverage', score: 38, weight: 20 },
    { name: 'Repayment', score: 48, weight: 15 },
    { name: 'Stability', score: 40, weight: 10 },
  ]},
  client_006: { overallScore: 82, factors: [
    { name: 'Credit', score: 85, weight: 30 },
    { name: 'Financials', score: 90, weight: 25 },
    { name: 'Leverage', score: 75, weight: 20 },
    { name: 'Repayment', score: 78, weight: 15 },
    { name: 'Stability', score: 72, weight: 10 },
  ]},
};

const PLACEHOLDER_OVERRIDE_TRAIL: OverrideAuditEntry[] = [
  {
    id: 'ov_001',
    timestamp: '2026-03-31T10:00:00Z',
    decisionId: 'dec_006',
    businessName: 'NovaTech Solutions Inc.',
    module: 'Risk Scorer',
    decisionType: 'Score',
    advisor: 'Ana Reyes',
    originalDecision: 'Risk score 42/100 — Borderline Decline recommendation issued by risk_scorer.',
    newDecision: 'Approved with conditions — DTI compensating factor documented.',
    overrideBy: 'Ana Reyes',
    reason: 'Strong revenue growth trend (18% YoY) and bank account depth ($88K avg) offset DTI concern. DTI borderline, not disqualifying.',
    approvedBy: 'Diana Walsh (Chief Credit Officer)',
    approvedAt: '2026-03-31T10:30:00Z',
    documented: true,
  },
  {
    id: 'ov_002',
    timestamp: '2026-03-30T14:00:00Z',
    decisionId: 'dec_008',
    businessName: 'Pinnacle Freight Corp',
    module: 'Suitability Engine',
    decisionType: 'Recommend',
    advisor: 'System',
    originalDecision: 'Capital One Spark Miles recommended as primary (score: 88).',
    newDecision: 'Capital One Spark Cash Plus promoted to primary — client confirmed no travel program.',
    overrideBy: 'System (auto_corrected)',
    reason: 'Client profile update: travel budget marked $0. Miles card re-ranked below cash card.',
    approvedBy: undefined,
    approvedAt: undefined,
    documented: true,
  },
  {
    id: 'ov_003',
    timestamp: '2026-03-29T11:15:00Z',
    decisionId: 'dec_004',
    businessName: 'Summit Capital Group',
    module: 'Credit Model',
    decisionType: 'Flag',
    advisor: 'Kevin Brooks',
    originalDecision: 'FICO proximity flag — recommended decline pending further review.',
    newDecision: 'Override to conditional approval — advisor vouched for client relationship.',
    overrideBy: 'Kevin Brooks',
    reason: '',
    approvedBy: undefined,
    approvedAt: undefined,
    documented: false,
  },
  {
    id: 'ov_004',
    timestamp: '2026-03-28T16:45:00Z',
    decisionId: 'dec_002',
    businessName: 'Apex Ventures LLC',
    module: 'Card Match',
    decisionType: 'Recommend',
    advisor: 'Maria Santos',
    originalDecision: 'Chase Ink Business Unlimited recommended as primary.',
    newDecision: 'Switched to Chase Ink Business Cash — client prefers category cashback over flat rate.',
    overrideBy: 'Maria Santos',
    reason: '',
    approvedBy: undefined,
    approvedAt: undefined,
    documented: false,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODULE_LABELS: Record<ModuleSource, string> = {
  suitability_engine: 'Suitability Engine',
  credit_model:       'Credit Model',
  compliance_check:   'Compliance Check',
  card_match:         'Card Match',
  risk_scorer:        'Risk Scorer',
  fraud_detector:     'Fraud Detector',
};

const MODULE_COLORS: Record<ModuleSource, string> = {
  suitability_engine: 'bg-blue-900 text-blue-300 border-blue-700',
  credit_model:       'bg-purple-900 text-purple-300 border-purple-700',
  compliance_check:   'bg-orange-900 text-orange-300 border-orange-700',
  card_match:         'bg-teal-900 text-teal-300 border-teal-700',
  risk_scorer:        'bg-yellow-900 text-yellow-300 border-yellow-700',
  fraud_detector:     'bg-red-900 text-red-300 border-red-700',
};

const DECISION_TYPE_CONFIG: Record<DecisionType, { label: string; badgeClass: string }> = {
  recommend: { label: 'Recommend', badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  exclude:   { label: 'Exclude',   badgeClass: 'bg-gray-800 text-gray-400 border-gray-700' },
  flag:      { label: 'Flag',      badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  score:     { label: 'Score',     badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  override:  { label: 'Override',  badgeClass: 'bg-orange-900 text-orange-300 border-orange-700' },
  escalate:  { label: 'Escalate',  badgeClass: 'bg-red-900 text-red-300 border-red-700' },
};

const OVERRIDE_STATUS_CONFIG: Record<OverrideStatus, { label: string; cls: string }> = {
  none:            { label: 'No Override',      cls: 'text-gray-500' },
  human_override:  { label: 'Human Override',   cls: 'text-orange-400 font-semibold' },
  auto_corrected:  { label: 'Auto-Corrected',   cls: 'text-blue-400 font-semibold' },
  pending_review:  { label: 'Pending Review',   cls: 'text-yellow-400 font-semibold' },
};

const SEVERITY_CONFIG = {
  hard_stop:    { label: 'Hard Stop',    cls: 'bg-red-900 text-red-300 border-red-700' },
  soft_decline: { label: 'Soft Decline', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  mismatch:     { label: 'Mismatch',     cls: 'bg-gray-800 text-gray-400 border-gray-700' },
};

const IMPACT_CONFIG = {
  high:   { dot: 'bg-green-400',  label: 'High Impact' },
  medium: { dot: 'bg-yellow-400', label: 'Medium Impact' },
  low:    { dot: 'bg-gray-500',   label: 'Low Impact' },
};

function formatDateTime(iso: string) {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 85 ? 'bg-green-500' : score >= 65 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-300">{score}%</span>
    </div>
  );
}

function ContributionBar({ value, label }: { value: number; label?: string }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 45 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-400 w-8 text-right">{label ?? `${value}%`}</span>
    </div>
  );
}

// Score ring SVG component
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1f2937" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-black text-white">{score}</span>
        <span className="text-[10px] text-gray-500">/ 100</span>
      </div>
    </div>
  );
}

type DecisionsTab = 'log' | 'why_this' | 'why_not' | 'suitability' | 'overrides';

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-green-900 border border-green-700 text-green-300 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold animate-pulse">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DecisionsPage() {
  const [activeTab, setActiveTab] = useState<DecisionsTab>('log');
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<ModuleSource | 'all'>('all');
  const [overrideFilter, setOverrideFilter] = useState<OverrideStatus | 'all'>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>('client_001');
  const [clientChainFilter, setClientChainFilter] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  }, []);

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredLog = PLACEHOLDER_LOG.filter((d) => {
    const moduleOk = moduleFilter === 'all' || d.module === moduleFilter;
    const overrideOk = overrideFilter === 'all' || d.overrideStatus === overrideFilter;
    const clientChainOk = !clientChainFilter || d.businessName === clientChainFilter;
    return moduleOk && overrideOk && clientChainOk;
  });

  const selectedDecision = PLACEHOLDER_LOG.find((d) => d.id === selectedDecisionId);
  const currentClient = CLIENTS.find((c) => c.id === selectedClient);

  // Export CSV handler
  const handleExportCSV = useCallback(() => {
    const headers = ['Timestamp', 'Business', 'Module', 'Decision Type', 'Summary', 'Confidence', 'Override Status'];
    const rows = PLACEHOLDER_LOG.map((d) => [
      d.timestamp,
      d.businessName,
      MODULE_LABELS[d.module],
      DECISION_TYPE_CONFIG[d.decisionType].label,
      `"${d.summary.replace(/"/g, '""')}"`,
      `${d.confidence}%`,
      OVERRIDE_STATUS_CONFIG[d.overrideStatus].label,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decision-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Decision log exported as CSV');
  }, [showToast]);

  const TABS: { id: DecisionsTab; label: string }[] = [
    { id: 'log',         label: 'AI Decision Log' },
    { id: 'why_this',    label: 'Why This Card' },
    { id: 'why_not',     label: 'Why Not' },
    { id: 'suitability', label: 'Suitability Breakdown' },
    { id: 'overrides',   label: 'Override Audit Trail' },
  ];

  // Check if a decision is a fraud escalation (Horizon Retail + fraud_detector + escalate)
  const isFraudEscalation = (d: AIDecisionLog) =>
    d.module === 'fraud_detector' && d.decisionType === 'escalate';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <Toast message={toastMessage} visible={toastVisible} />

      {/* Client Selector */}
      <div className="mb-6 flex items-center gap-3">
        <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Client</label>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C] min-w-[260px]"
        >
          {CLIENTS.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {c.businessName}</option>
          ))}
        </select>
        {currentClient && (
          <span className="text-xs text-gray-500">{currentClient.businessName}</span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Decision Explainability</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            AI decision logs, confidence scores, override tracking, and suitability rationale
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Export Log
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Decisions',   value: PLACEHOLDER_LOG.length,                                                                       valueClass: 'text-white' },
          { label: 'Avg Confidence',    value: `${Math.round(PLACEHOLDER_LOG.reduce((s, d) => s + d.confidence, 0) / PLACEHOLDER_LOG.length)}%`, valueClass: 'text-[#C9A84C]' },
          { label: 'Human Overrides',   value: PLACEHOLDER_LOG.filter((d) => d.overrideStatus === 'human_override').length,                  valueClass: 'text-orange-400' },
          { label: 'Flags / Escalations', value: PLACEHOLDER_LOG.filter((d) => d.decisionType === 'flag' || d.decisionType === 'escalate').length, valueClass: 'text-red-400' },
        ].map(({ label, value, valueClass }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">{label}</p>
            <p className={`text-3xl font-black ${valueClass}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* Tab: AI Decision Log                                               */}
      {/* ================================================================== */}
      {activeTab === 'log' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value as ModuleSource | 'all')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Modules</option>
              {(Object.keys(MODULE_LABELS) as ModuleSource[]).map((m) => (
                <option key={m} value={m}>{MODULE_LABELS[m]}</option>
              ))}
            </select>
            <select
              value={overrideFilter}
              onChange={(e) => setOverrideFilter(e.target.value as OverrideStatus | 'all')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Override Status</option>
              <option value="none">No Override</option>
              <option value="human_override">Human Override</option>
              <option value="auto_corrected">Auto-Corrected</option>
              <option value="pending_review">Pending Review</option>
            </select>
            {clientChainFilter && (
              <button
                onClick={() => setClientChainFilter(null)}
                className="px-3 py-2 rounded-lg bg-[#C9A84C]/20 border border-[#C9A84C]/40 text-[#C9A84C] text-sm font-medium hover:bg-[#C9A84C]/30 transition-colors flex items-center gap-1.5"
              >
                Client: {clientChainFilter} <span className="text-xs">x</span>
              </button>
            )}
            <span className="text-xs text-gray-500 self-center">{filteredLog.length} records</span>
          </div>

          {/* Table */}
          <div className="overflow-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Timestamp</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Business</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Module</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Decision</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Summary</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Confidence</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Override</th>
                </tr>
              </thead>
              <tbody>
                {filteredLog.map((d) => {
                  const typeCfg = DECISION_TYPE_CONFIG[d.decisionType];
                  const overrideCfg = OVERRIDE_STATUS_CONFIG[d.overrideStatus];
                  const isExpanded = expandedRows.has(d.id);
                  const isFraud = isFraudEscalation(d);

                  return (
                    <React.Fragment key={d.id}>
                      <tr
                        onClick={() => toggleRow(d.id)}
                        className={`border-b border-gray-800 cursor-pointer transition-colors ${isExpanded ? 'bg-[#0A1628]' : 'bg-gray-900 hover:bg-gray-800'}`}
                      >
                        <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(d.timestamp)}</td>
                        <td className="py-3 px-4">
                          <p className="text-sm font-semibold text-gray-100 whitespace-nowrap">{d.businessName}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${MODULE_COLORS[d.module]}`}>
                            {MODULE_LABELS[d.module]}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeCfg.badgeClass}`}>
                            {typeCfg.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-400 max-w-xs">{d.summary}</td>
                        <td className="py-3 px-4">
                          <ConfidenceBar score={d.confidence} />
                        </td>
                        <td className={`py-3 px-4 text-xs ${overrideCfg.cls}`}>{overrideCfg.label}</td>
                      </tr>

                      {/* Expanded row detail */}
                      {isExpanded && (
                        <tr className="bg-[#0A1628]">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                              {/* Factor Breakdown */}
                              {d.factors && d.factors.length > 0 && (
                                <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Factor Breakdown</p>
                                  <div className="space-y-3">
                                    {d.factors.map((f, i) => (
                                      <div key={i}>
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs font-semibold text-gray-200">{f.name}</span>
                                          <span className="text-xs text-gray-500">{f.value}</span>
                                        </div>
                                        <ContributionBar value={f.contribution} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Input Data Snapshot */}
                              {d.inputSnapshot && d.inputSnapshot.length > 0 && (
                                <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Input Data Snapshot</p>
                                  <div className="space-y-2">
                                    {d.inputSnapshot.map((s, i) => (
                                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                                        <span className="text-xs text-gray-500">{s.label}</span>
                                        <span className="text-xs font-semibold text-gray-200">{s.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Override Documentation (if overridden) + Actions */}
                              <div className="space-y-4">
                                {d.overrideStatus !== 'none' && (
                                  <div className="rounded-lg border border-orange-900/50 bg-orange-950/20 p-4">
                                    <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wide mb-2">Override Documentation</p>
                                    <p className="text-xs text-gray-400 mb-1">
                                      <span className="text-gray-300 font-medium">By:</span> {d.overrideBy ?? 'System'}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                      <span className="text-gray-300 font-medium">Reason:</span> {d.overrideReason ?? 'Auto-correction based on updated profile data.'}
                                    </p>
                                  </div>
                                )}

                                {/* Fraud Alert for Horizon Retail */}
                                {isFraud && (
                                  <div className="rounded-lg border border-red-700 bg-red-950/30 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                      <span className="text-red-400 text-lg">!</span>
                                      <p className="text-xs font-bold text-red-400 uppercase tracking-wide">Fraud Alert</p>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); showToast('Fraud investigation initiated'); }}
                                        className="px-3 py-2 rounded-lg bg-red-900 border border-red-700 text-red-300 text-xs font-semibold hover:bg-red-800 transition-colors text-left"
                                      >
                                        Investigate Fraud Flag
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); showToast('Case assigned to Compliance team'); }}
                                        className="px-3 py-2 rounded-lg bg-orange-900 border border-orange-700 text-orange-300 text-xs font-semibold hover:bg-orange-800 transition-colors text-left"
                                      >
                                        Assign to Compliance
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); showToast('All applications halted for this client'); }}
                                        className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-300 text-xs font-semibold hover:bg-gray-700 transition-colors text-left"
                                      >
                                        Halt Applications
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Action buttons */}
                                <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Actions</p>
                                  <div className="flex flex-col gap-2">
                                    {d.overrideStatus === 'pending_review' && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); showToast('Decision assigned for review'); }}
                                        className="px-3 py-2 rounded-lg bg-yellow-900 border border-yellow-700 text-yellow-300 text-xs font-semibold hover:bg-yellow-800 transition-colors text-left"
                                      >
                                        Assign for Review
                                      </button>
                                    )}
                                    {(d.decisionType === 'escalate' || d.decisionType === 'flag') && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); showToast('Compliance case opened'); }}
                                        className="px-3 py-2 rounded-lg bg-orange-900 border border-orange-700 text-orange-300 text-xs font-semibold hover:bg-orange-800 transition-colors text-left"
                                      >
                                        Open Compliance Case
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setClientChainFilter(d.businessName);
                                        setExpandedRows(new Set());
                                      }}
                                      className="px-3 py-2 rounded-lg bg-[#C9A84C]/20 border border-[#C9A84C]/40 text-[#C9A84C] text-xs font-semibold hover:bg-[#C9A84C]/30 transition-colors text-left"
                                    >
                                      View All Client Decisions
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Decision ID footer */}
                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-800">
                              <span>ID: <span className="font-mono text-gray-400">{d.id}</span></span>
                              <span>{formatDateTime(d.timestamp)}</span>
                              <ConfidenceBar score={d.confidence} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Client Decision Chain */}
          {clientChainFilter && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Client Decision Chain</p>
                  <p className="text-sm font-semibold text-[#C9A84C]">{clientChainFilter}</p>
                </div>
                <button
                  onClick={() => setClientChainFilter(null)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Clear Filter
                </button>
              </div>
              <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-[#C9A84C]/30" />
                {filteredLog.map((d, idx) => {
                  const typeCfg = DECISION_TYPE_CONFIG[d.decisionType];
                  return (
                    <div key={d.id} className="relative mb-4 last:mb-0">
                      {/* Dot on timeline */}
                      <div className="absolute -left-3 top-3 w-3 h-3 rounded-full bg-[#C9A84C] border-2 border-gray-950" />
                      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 ml-3">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs text-gray-500">{formatDateTime(d.timestamp)}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${MODULE_COLORS[d.module]}`}>
                            {MODULE_LABELS[d.module]}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeCfg.badgeClass}`}>
                            {typeCfg.label}
                          </span>
                          <ConfidenceBar score={d.confidence} />
                        </div>
                        <p className="text-xs text-gray-300">{d.summary}</p>
                        {idx < filteredLog.length - 1 && (
                          <div className="mt-2 text-[10px] text-gray-600 italic">leads to next decision...</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* Tab: Why This Card                                                 */}
      {/* ================================================================== */}
      {activeTab === 'why_this' && (
        <div className="space-y-5">
          {/* Client-specific factor list */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Why This Card — Factor Analysis for {currentClient?.name ?? 'Client'}
            </p>
            <div className="space-y-4">
              {(WHY_THIS_FACTORS[selectedClient] ?? WHY_THIS_FACTORS.client_001).map((f, i) => (
                <div key={i} className="border-b border-gray-800 last:border-0 pb-4 last:pb-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-gray-100">{f.name}</span>
                    <span className="text-sm font-bold text-gray-300">{f.value}</span>
                  </div>
                  <ContributionBar value={f.contribution} />
                  <p className="text-xs text-gray-500 mt-1.5">{f.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Card header */}
          <div className="rounded-xl border border-[#C9A84C]/30 bg-[#0A1628] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Primary Recommendation</p>
                <p className="text-xl font-bold text-white">{PLACEHOLDER_WHY_THIS.cardProduct}</p>
                <p className="text-sm text-gray-400">{PLACEHOLDER_WHY_THIS.issuer}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1">Match Score</p>
                <p className="text-4xl font-black text-[#C9A84C]">{PLACEHOLDER_WHY_THIS.score}</p>
                <p className="text-xs text-gray-500">/ 100</p>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
              <div className="h-full rounded-full bg-[#C9A84C]" style={{ width: `${PLACEHOLDER_WHY_THIS.score}%` }} />
            </div>
          </div>

          {/* Top reasons */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Why This Card Was Recommended</p>
            <div className="space-y-4">
              {PLACEHOLDER_WHY_THIS.topReasons.map((r, i) => {
                const impactCfg = IMPACT_CONFIG[r.impact];
                return (
                  <div key={i} className="flex items-start gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full mt-1 flex-shrink-0 ${impactCfg.dot}`} />
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-gray-100">{r.factor}</p>
                        <span className="text-[10px] text-gray-500">{impactCfg.label}</span>
                      </div>
                      <p className="text-xs text-gray-400">{r.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Supporting data points */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Supporting Data Points</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PLACEHOLDER_WHY_THIS.dataPoints.map(({ label, value }) => (
                <div key={label} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-sm font-bold text-gray-100">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Tab: Why Not                                                       */}
      {/* ================================================================== */}
      {activeTab === 'why_not' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400 mb-4">
            Cards evaluated but excluded from the recommendation set for {currentClient?.name ?? 'Client'}, with machine-generated exclusion rationale.
          </p>
          {PLACEHOLDER_WHY_NOT.map((item, i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-gray-100">{item.cardProduct}</p>
                  <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
                    {item.issuer}
                  </span>
                </div>
                {item.confidence && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">Exclusion Confidence</span>
                    <ConfidenceBar score={item.confidence} />
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {item.reasons.map((r, j) => {
                  const sevCfg = SEVERITY_CONFIG[r.severity];
                  return (
                    <div key={j} className="flex items-start gap-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 mt-0.5 ${sevCfg.cls}`}>
                        {sevCfg.label}
                      </span>
                      <div>
                        <p className="text-xs font-mono text-gray-500 mb-0.5">{r.code}</p>
                        <p className="text-xs text-gray-300">{r.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================================================================== */}
      {/* Tab: Suitability Breakdown                                         */}
      {/* ================================================================== */}
      {activeTab === 'suitability' && (
        <div className="space-y-5">
          {/* Score Ring + Weighted Factors */}
          {(() => {
            const suit = CLIENT_SUITABILITY[selectedClient] ?? CLIENT_SUITABILITY.client_001;
            return (
              <div className="rounded-xl border border-[#C9A84C]/30 bg-[#0A1628] p-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                  Suitability Score — {currentClient?.name ?? 'Client'}
                </p>
                <div className="flex items-start gap-8 flex-wrap">
                  <ScoreRing score={suit.overallScore} />
                  <div className="flex-1 min-w-[280px] space-y-4">
                    {suit.factors.map((f) => {
                      const barColor = f.score >= 70 ? 'bg-green-500' : f.score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
                      return (
                        <div key={f.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-gray-200">{f.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-600">{f.weight}% weight</span>
                              <span className={`text-sm font-bold ${f.score >= 70 ? 'text-green-400' : f.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {f.score}
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-2.5 rounded-full bg-gray-800 overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${f.score}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Original overall score section */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-end gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Overall Suitability Score</p>
                <p className="text-5xl font-black text-[#C9A84C]">{PLACEHOLDER_SUITABILITY.overallScore}</p>
                <p className="text-xs text-gray-500">/ 100 — Suitable</p>
              </div>
              <div className="flex-1 pb-1">
                <div className="w-full h-3 rounded-full bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-[#C9A84C]" style={{ width: `${PLACEHOLDER_SUITABILITY.overallScore}%` }} />
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed border-t border-gray-800 pt-4">
              {PLACEHOLDER_SUITABILITY.recommendation}
            </p>
          </div>

          {/* Component breakdown */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Score Components</p>
            <div className="space-y-4">
              {PLACEHOLDER_SUITABILITY.components.map((c) => {
                const barColor = c.score >= 75 ? 'bg-green-500' : c.score >= 55 ? 'bg-yellow-500' : 'bg-red-500';
                const weightedContribution = Math.round((c.score * c.weight) / 100);
                return (
                  <div key={c.dimension}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-200">{c.dimension}</p>
                        <span className="text-[10px] text-gray-600">{c.weight}% weight · +{weightedContribution} pts</span>
                      </div>
                      <span className={`text-sm font-bold ${c.score >= 75 ? 'text-green-400' : c.score >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {c.score}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden mb-1">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${c.score}%` }} />
                    </div>
                    <p className="text-xs text-gray-500">{c.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Supporting data */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Supporting Data</p>
            <div className="space-y-2">
              {PLACEHOLDER_SUITABILITY.supportingData.map(({ label, value, source }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm text-gray-200 font-medium">{label}</p>
                    <p className="text-[10px] text-gray-600">{source}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-100">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Tab: Override Audit Trail                                           */}
      {/* ================================================================== */}
      {activeTab === 'overrides' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400 mb-4">
            Complete audit trail of all human and system overrides to AI decisions. All entries are immutable.
          </p>

          {PLACEHOLDER_OVERRIDE_TRAIL.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-xl border bg-gray-900 p-5 ${
                !entry.documented ? 'border-yellow-700/60' : 'border-gray-800'
              }`}
            >
              {/* Undocumented warning */}
              {!entry.documented && (
                <div className="flex items-center justify-between mb-4 bg-yellow-950/30 border border-yellow-800 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 text-sm font-bold">Warning</span>
                    <span className="text-xs text-yellow-300">This override is undocumented. Documentation is required for compliance.</span>
                  </div>
                  <button
                    onClick={() => showToast('Documentation form opened for ' + entry.id)}
                    className="px-3 py-1.5 rounded-lg bg-yellow-900 border border-yellow-700 text-yellow-300 text-xs font-semibold hover:bg-yellow-800 transition-colors whitespace-nowrap"
                  >
                    Document Now
                  </button>
                </div>
              )}

              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-gray-500">{entry.id}</span>
                    <span className="text-[10px] bg-orange-900 text-orange-300 border border-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                      Override
                    </span>
                    {!entry.documented && (
                      <span className="text-[10px] bg-yellow-900 text-yellow-300 border border-yellow-700 px-1.5 py-0.5 rounded-full font-bold">
                        Undocumented
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-300">
                    Decision <span className="font-mono text-gray-500">{entry.decisionId}</span>
                  </p>
                </div>
                <p className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(entry.timestamp)}</p>
              </div>

              {/* Override metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-800 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Business</p>
                  <p className="text-xs font-semibold text-gray-200">{entry.businessName}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Module</p>
                  <p className="text-xs font-semibold text-gray-200">{entry.module}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Type</p>
                  <p className="text-xs font-semibold text-gray-200">{entry.decisionType}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Advisor</p>
                  <p className="text-xs font-semibold text-gray-200">{entry.advisor}</p>
                </div>
              </div>

              {/* Before / After */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bg-red-950/30 border border-red-900 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1">Original Decision</p>
                  <p className="text-xs text-gray-300">{entry.originalDecision}</p>
                </div>
                <div className="bg-green-950/30 border border-green-900 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-green-400 uppercase tracking-wide mb-1">Overridden To</p>
                  <p className="text-xs text-gray-300">{entry.newDecision}</p>
                </div>
              </div>

              {/* Reason */}
              {entry.reason && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Override Rationale</p>
                  <p className="text-xs text-gray-300">{entry.reason}</p>
                </div>
              )}

              {/* Footer */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 border-t border-gray-800 pt-3">
                <span>Override by <span className="text-gray-300 font-medium">{entry.overrideBy}</span></span>
                {entry.approvedBy && (
                  <span>Approved by <span className="text-gray-300 font-medium">{entry.approvedBy}</span></span>
                )}
                {entry.approvedAt && (
                  <span>{formatDateTime(entry.approvedAt)}</span>
                )}
                {!entry.approvedBy && (
                  <span className="text-blue-400">System auto-applied — no approval required</span>
                )}
              </div>
            </div>
          ))}

          <div className="p-4 rounded-xl border border-gray-700 bg-gray-900 text-xs text-gray-500">
            All override entries are append-only and retained for 7 years per regulatory requirements. Entries cannot be deleted or modified.
          </div>
        </div>
      )}
    </div>
  );
}
