'use client';

// ============================================================
// /issuers — Issuer Relationship Management
// Sections:
//   1. Issuer contact directory table (banker name, recon line,
//      relationship score gauge)
//   2. Reconsideration outcomes by issuer (success rate bar)
//   3. Approval trends per issuer (monthly trend indicator)
//   4. Detail drawer with 5 tabs (Overview, Velocity, Contact Log,
//      Recon History, Approval Intelligence)
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrendDirection = 'improving' | 'declining' | 'stable';
type DrawerTab = 'overview' | 'velocity' | 'contactLog' | 'reconHistory' | 'approvalIntel';
type PageTab = 'directory' | 'recon' | 'creditUnions';

interface CreditUnionEntry {
  id: string;
  cuName: string;
  loanOfficer: string;
  directLine: string;
  membershipType: string;
  minFico: number;
  ongoingApr: string;
  tier: 'platinum' | 'gold' | 'silver' | 'standard';
  relationshipScore: number;
  lastContact: string;
}

interface IssuerContact {
  id: string;
  issuer: string;
  bankerName: string;
  bankerPhone: string;
  reconsiderationLine: string;
  reconsiderationHours: string;
  relationshipScore: number; // 0–100
  tier: 'platinum' | 'gold' | 'silver' | 'standard';
  lastContact: string;
  notes?: string;
}

interface IssuerOutcome {
  issuer: string;
  totalRecons: number;
  successful: number;
  avgResponseDays: number;
}

interface IssuerTrend {
  issuer: string;
  approvalRateLast3Mo: number[];   // [3mo_ago, 2mo_ago, last_mo]
  trend: TrendDirection;
  currentRate: number;
  deltaPoints: number;
}

interface ContactLogEntry {
  id: string;
  date: string;
  banker: string;
  callType: string;
  outcome: string;
  notes: string;
}

interface ReconHistoryEntry {
  id: string;
  appId: string;
  client: string;
  date: string;
  outcome: string;
}

interface AddIssuerForm {
  issuer: string;
  bankerName: string;
  directLine: string;
  reconLine: string;
  hours: string;
  tier: IssuerContact['tier'];
  notes: string;
}

interface LogContactForm {
  date: string;
  banker: string;
  callType: string;
  duration: string;
  outcome: string;
  notes: string;
}

interface LogReconForm {
  issuer: string;
  applicationId: string;
  client: string;
  date: string;
  banker: string;
  outcome: string;
  resolutionTime: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const INITIAL_CONTACTS: IssuerContact[] = [
  {
    id: 'iss_001', issuer: 'Chase', bankerName: 'Derek Holloway',
    bankerPhone: '1-800-453-9719', reconsiderationLine: '1-888-270-2127',
    reconsiderationHours: 'Mon–Fri 8am–9pm ET', relationshipScore: 88,
    tier: 'platinum', lastContact: '2026-03-29',
    notes: 'Very responsive. Prefers morning calls. Has helped with 5/24 exceptions twice.',
  },
  {
    id: 'iss_002', issuer: 'American Express', bankerName: 'Linda Farrow',
    bankerPhone: '1-800-528-4800', reconsiderationLine: '1-800-567-1083',
    reconsiderationHours: 'Mon–Fri 9am–8pm ET', relationshipScore: 74,
    tier: 'gold', lastContact: '2026-03-25',
    notes: 'Handles popup jail escalations. Knows lifetime language exceptions.',
  },
  {
    id: 'iss_003', issuer: 'Capital One', bankerName: 'James Patel',
    bankerPhone: '1-877-383-4802', reconsiderationLine: '1-800-625-7866',
    reconsiderationHours: '24/7', relationshipScore: 61,
    tier: 'silver', lastContact: '2026-03-20',
    notes: 'Pulls all 3 bureaus. Prefers written recon letters for complex cases.',
  },
  {
    id: 'iss_004', issuer: 'Citi', bankerName: 'Michelle Torres',
    bankerPhone: '1-800-695-5171', reconsiderationLine: '1-800-695-5171',
    reconsiderationHours: 'Mon–Fri 8am–10pm ET', relationshipScore: 55,
    tier: 'silver', lastContact: '2026-03-15',
    notes: 'Strict on 1/8 rule. Same-day recon calls work best.',
  },
  {
    id: 'iss_005', issuer: 'Bank of America', bankerName: 'Robert Kim',
    bankerPhone: '1-888-287-4637', reconsiderationLine: '1-800-481-8277',
    reconsiderationHours: 'Mon–Fri 8am–11pm ET', relationshipScore: 47,
    tier: 'standard', lastContact: '2026-03-10',
    notes: 'Enforces 7/12 strictly. Alaska card exceptions possible.',
  },
  {
    id: 'iss_006', issuer: 'US Bank', bankerName: 'Angela Reed',
    bankerPhone: '1-800-872-2657', reconsiderationLine: '1-800-685-7680',
    reconsiderationHours: 'Mon–Fri 8am–8pm CT', relationshipScore: 69,
    tier: 'gold', lastContact: '2026-03-22',
    notes: 'Strongly prefers existing banking relationships. Ask about checking accounts first.',
  },
  {
    id: 'iss_007', issuer: 'Wells Fargo', bankerName: 'Tom Bryant',
    bankerPhone: '1-800-225-5935', reconsiderationLine: '1-800-869-3557',
    reconsiderationHours: 'Mon–Fri 7am–11pm ET', relationshipScore: 38,
    tier: 'standard', lastContact: '2026-02-28',
    notes: 'Prefers customers with existing WF accounts. Relationship deteriorating.',
  },
];

const ISSUER_OUTCOMES: IssuerOutcome[] = [
  { issuer: 'Chase',            totalRecons: 14, successful: 10, avgResponseDays: 2 },
  { issuer: 'American Express', totalRecons: 11, successful: 7,  avgResponseDays: 3 },
  { issuer: 'Capital One',      totalRecons: 8,  successful: 4,  avgResponseDays: 5 },
  { issuer: 'Citi',             totalRecons: 9,  successful: 3,  avgResponseDays: 7 },
  { issuer: 'Bank of America',  totalRecons: 6,  successful: 2,  avgResponseDays: 6 },
  { issuer: 'US Bank',          totalRecons: 5,  successful: 3,  avgResponseDays: 4 },
  { issuer: 'Wells Fargo',      totalRecons: 4,  successful: 1,  avgResponseDays: 9 },
];

const ISSUER_TRENDS: IssuerTrend[] = [
  { issuer: 'Chase',            approvalRateLast3Mo: [71, 74, 79], trend: 'improving', currentRate: 79, deltaPoints: 8  },
  { issuer: 'American Express', approvalRateLast3Mo: [68, 66, 65], trend: 'declining', currentRate: 65, deltaPoints: -3 },
  { issuer: 'Capital One',      approvalRateLast3Mo: [58, 58, 59], trend: 'stable',    currentRate: 59, deltaPoints: 1  },
  { issuer: 'Citi',             approvalRateLast3Mo: [62, 55, 50], trend: 'declining', currentRate: 50, deltaPoints: -12 },
  { issuer: 'Bank of America',  approvalRateLast3Mo: [44, 47, 51], trend: 'improving', currentRate: 51, deltaPoints: 7  },
  { issuer: 'US Bank',          approvalRateLast3Mo: [70, 69, 71], trend: 'stable',    currentRate: 71, deltaPoints: 1  },
  { issuer: 'Wells Fargo',      approvalRateLast3Mo: [40, 38, 36], trend: 'declining', currentRate: 36, deltaPoints: -4 },
];

// ---------------------------------------------------------------------------
// Velocity rules per issuer
// ---------------------------------------------------------------------------

const VELOCITY_RULES: Record<string, { title: string; rules: { label: string; value: string }[] }> = {
  Chase: {
    title: 'Chase Velocity Rules',
    rules: [
      { label: '5/24 Rule', value: 'No more than 5 new cards across all issuers in 24 months' },
      { label: '2/30 Rule', value: 'No more than 2 Chase applications in 30 days' },
      { label: 'Min FICO', value: '680+ recommended (700+ for premium cards)' },
      { label: 'Business Cards', value: 'May bypass 5/24 for some Ink products' },
    ],
  },
  'American Express': {
    title: 'Amex Velocity Rules',
    rules: [
      { label: 'Popup Jail', value: 'Ineligible for welcome bonus if flagged — no clear timeline to resolve' },
      { label: 'Lifetime Language', value: 'Once per lifetime bonus on most cards (some exceptions for NLL offers)' },
      { label: '1/5 Rule', value: 'Max 1 credit card per 5 days' },
      { label: '2/90 Rule', value: 'Max 2 credit cards per 90 days' },
    ],
  },
  'Capital One': {
    title: 'Capital One Velocity Rules',
    rules: [
      { label: '1/6mo Rule', value: 'Max 1 application every 6 months' },
      { label: 'Bureau Pulls', value: 'Pulls all 3 bureaus (Experian, TransUnion, Equifax)' },
      { label: 'Inquiry Sensitive', value: 'High number of recent inquiries is a common denial reason' },
      { label: 'Existing Customers', value: 'Slightly more lenient with existing Capital One customers' },
    ],
  },
  Citi: {
    title: 'Citi Velocity Rules',
    rules: [
      { label: '1/8 Rule', value: 'Only 1 Citi card application per 8 days' },
      { label: '2/65 Rule', value: 'Max 2 Citi card applications per 65 days' },
      { label: '6/6 Rule', value: 'Max 6 inquiries in last 6 months' },
      { label: '48-Month Rule', value: 'Must wait 48 months between bonuses on same card family' },
    ],
  },
  'Bank of America': {
    title: 'Bank of America Velocity Rules',
    rules: [
      { label: '7/12 Rule', value: 'Max 7 cards opened in last 12 months across all issuers' },
      { label: '2/3/4 Rule', value: '2 BofA cards per 2 months, 3 per 12 months, 4 per 24 months' },
      { label: 'Preferred Rewards', value: 'Better approval odds with Preferred Rewards status' },
      { label: 'Alaska Exception', value: 'Alaska cards may have slightly different velocity limits' },
    ],
  },
  'US Bank': {
    title: 'US Bank Velocity Rules',
    rules: [
      { label: 'Relationship Required', value: 'Strongly prefers existing banking relationship (checking account)' },
      { label: 'Inquiry Sensitive', value: 'Very sensitive to recent inquiries — keep under 3/12' },
      { label: '0/6 Ideal', value: 'Best results with 0 new accounts in last 6 months' },
      { label: 'Business Cards', value: 'Requires existing US Bank business checking for biz cards' },
    ],
  },
  'Wells Fargo': {
    title: 'Wells Fargo Velocity Rules',
    rules: [
      { label: 'Prefers Customers', value: 'Much higher approval rates for existing WF banking customers' },
      { label: 'Cell Phone Verification', value: 'Requires cell phone on file for identity verification' },
      { label: '15/12 Guideline', value: 'Loosely enforced — max ~15 cards opened in 12 months' },
      { label: 'Checking Bonus First', value: 'Opening checking/savings first can improve card approval odds' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Placeholder contact log & recon history per issuer
// ---------------------------------------------------------------------------

const PLACEHOLDER_CONTACT_LOGS: Record<string, ContactLogEntry[]> = {
  Chase: [
    { id: 'cl1', date: '2026-03-29', banker: 'Derek Holloway', callType: 'Recon Call', outcome: 'Approved', notes: 'CSP approved after recon — moved credit from CFU' },
    { id: 'cl2', date: '2026-03-15', banker: 'Derek Holloway', callType: 'Relationship Check', outcome: 'Info Gathered', notes: 'Confirmed 5/24 status. Client at 4/24 currently' },
    { id: 'cl3', date: '2026-02-28', banker: 'Derek Holloway', callType: 'New App Support', outcome: 'Pending', notes: 'Submitted CIU application, awaiting 7-10 day notice' },
  ],
  'American Express': [
    { id: 'cl4', date: '2026-03-25', banker: 'Linda Farrow', callType: 'Popup Check', outcome: 'Info Gathered', notes: 'Client still in popup jail — advised waiting 6 months' },
    { id: 'cl5', date: '2026-03-10', banker: 'Linda Farrow', callType: 'Recon Call', outcome: 'Denied', notes: 'Lifetime language enforced on Gold card' },
    { id: 'cl6', date: '2026-02-20', banker: 'Linda Farrow', callType: 'New App Support', outcome: 'Approved', notes: 'Hilton Surpass approved — NLL offer confirmed' },
  ],
};

const PLACEHOLDER_RECON_HISTORY: Record<string, ReconHistoryEntry[]> = {
  Chase: [
    { id: 'rh1', appId: 'APP-2026-0329', client: 'Marcus Johnson', date: '2026-03-29', outcome: 'Approved on Recon' },
    { id: 'rh2', appId: 'APP-2026-0301', client: 'Sarah Chen', date: '2026-03-01', outcome: 'Denied — Too Many Accounts' },
    { id: 'rh3', appId: 'APP-2026-0215', client: 'David Lee', date: '2026-02-15', outcome: 'Approved on Recon' },
  ],
  'American Express': [
    { id: 'rh4', appId: 'APP-2026-0320', client: 'Emily Rodriguez', date: '2026-03-20', outcome: 'Denied — Popup Jail' },
    { id: 'rh5', appId: 'APP-2026-0305', client: 'James Wilson', date: '2026-03-05', outcome: 'Approved on Recon' },
    { id: 'rh6', appId: 'APP-2026-0218', client: 'Anna Park', date: '2026-02-18', outcome: 'Approved — Manual Review' },
  ],
};

// Default placeholder for issuers without specific log data
const DEFAULT_CONTACT_LOGS: ContactLogEntry[] = [
  { id: 'dcl1', date: '2026-03-20', banker: 'Contact Rep', callType: 'Relationship Check', outcome: 'Info Gathered', notes: 'General relationship check — no issues' },
  { id: 'dcl2', date: '2026-03-05', banker: 'Contact Rep', callType: 'Recon Call', outcome: 'Pending', notes: 'Submitted recon request, waiting for callback' },
  { id: 'dcl3', date: '2026-02-15', banker: 'Contact Rep', callType: 'New App Support', outcome: 'Approved', notes: 'Standard approval on first attempt' },
];

const DEFAULT_RECON_HISTORY: ReconHistoryEntry[] = [
  { id: 'drh1', appId: 'APP-2026-0318', client: 'Client A', date: '2026-03-18', outcome: 'Approved on Recon' },
  { id: 'drh2', appId: 'APP-2026-0228', client: 'Client B', date: '2026-02-28', outcome: 'Denied — Velocity' },
  { id: 'drh3', appId: 'APP-2026-0210', client: 'Client C', date: '2026-02-10', outcome: 'Approved — Manual Review' },
];

// Placeholder clients for client selector
const CLIENTS = [
  { id: 'all', name: 'All Clients' },
  { id: 'cl_001', name: 'Marcus Johnson' },
  { id: 'cl_002', name: 'Sarah Chen' },
  { id: 'cl_003', name: 'David Lee' },
  { id: 'cl_004', name: 'Emily Rodriguez' },
  { id: 'cl_005', name: 'James Wilson' },
];

// ---------------------------------------------------------------------------
// Credit Union data
// ---------------------------------------------------------------------------

const CU_DIRECTORY: CreditUnionEntry[] = [
  {
    id: 'cu_001', cuName: 'Navy Federal', loanOfficer: 'Business Lending Dept',
    directLine: '1-888-842-6328', membershipType: 'Military/Family',
    minFico: 680, ongoingApr: '11.24%–18.00%', tier: 'platinum',
    relationshipScore: 91, lastContact: '2026-03-28',
  },
  {
    id: 'cu_002', cuName: 'PenFed', loanOfficer: 'Business Lending Dept',
    directLine: '1-800-247-5626', membershipType: 'Open ($17)',
    minFico: 660, ongoingApr: '12.49%–17.99%', tier: 'gold',
    relationshipScore: 76, lastContact: '2026-03-22',
  },
  {
    id: 'cu_003', cuName: 'Alliant', loanOfficer: 'Business Lending Dept',
    directLine: '1-800-328-1935', membershipType: 'Open ($10)',
    minFico: 640, ongoingApr: '11.99%–21.49%', tier: 'gold',
    relationshipScore: 68, lastContact: '2026-03-18',
  },
  {
    id: 'cu_004', cuName: 'DCU', loanOfficer: 'Business Lending Dept',
    directLine: '1-800-328-8797', membershipType: 'Open ($10)',
    minFico: 650, ongoingApr: '10.75%–18.00%', tier: 'silver',
    relationshipScore: 62, lastContact: '2026-03-14',
  },
  {
    id: 'cu_005', cuName: 'First Tech', loanOfficer: 'Business Lending Dept',
    directLine: '1-855-855-8805', membershipType: 'Tech/$15',
    minFico: 660, ongoingApr: '9.49%–18.00%', tier: 'silver',
    relationshipScore: 58, lastContact: '2026-03-10',
  },
  {
    id: 'cu_006', cuName: 'BECU', loanOfficer: 'Business Lending Dept',
    directLine: '1-800-233-2328', membershipType: 'WA State/$5',
    minFico: 640, ongoingApr: '10.40%–18.00%', tier: 'standard',
    relationshipScore: 52, lastContact: '2026-03-05',
  },
];

const CU_CONTACT_NOTES = [
  {
    id: 'cn_001',
    cu: 'Navy Federal',
    note: 'Navy Federal — John Martinez, Business Lending, strong relationship, prioritizes applicants with direct deposit. Best reached Tue–Thu mornings.',
  },
  {
    id: 'cn_002',
    cu: 'PenFed',
    note: 'PenFed — Carla Jensen, Lending Ops, responsive on email. Open to balance transfers from other CUs. Membership via $17 donation to qualifying org.',
  },
  {
    id: 'cn_003',
    cu: 'Alliant',
    note: 'Alliant — Derek Shaw, Member Services, prefers phone calls after 2pm CT. Good approval rates for members with 6+ months tenure.',
  },
];

// Approval intelligence placeholder data
const APPROVAL_INTEL_MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const APPROVAL_INTEL_RATES: Record<string, number[]> = {
  Chase: [68, 71, 74, 76, 79, 82],
  'American Express': [72, 70, 68, 66, 65, 63],
  'Capital One': [55, 57, 58, 58, 59, 60],
  Citi: [65, 62, 58, 55, 52, 50],
  'Bank of America': [42, 44, 46, 47, 49, 51],
  'US Bank': [68, 70, 69, 70, 71, 72],
  'Wells Fargo': [42, 40, 39, 38, 37, 36],
};

const FICO_BANDS = [
  { band: '750+', rates: { Chase: 92, 'American Express': 88, 'Capital One': 78, Citi: 72, 'Bank of America': 70, 'US Bank': 85, 'Wells Fargo': 55 } },
  { band: '700–749', rates: { Chase: 75, 'American Express': 68, 'Capital One': 60, Citi: 52, 'Bank of America': 48, 'US Bank': 72, 'Wells Fargo': 40 } },
  { band: '650–699', rates: { Chase: 45, 'American Express': 35, 'Capital One': 42, Citi: 28, 'Bank of America': 25, 'US Bank': 38, 'Wells Fargo': 20 } },
  { band: '<650', rates: { Chase: 15, 'American Express': 10, 'Capital One': 25, Citi: 8, 'Bank of America': 10, 'US Bank': 12, 'Wells Fargo': 5 } },
];

const COMMON_DENIALS: Record<string, string[]> = {
  Chase: ['5/24 exceeded', 'Too many recent inquiries', 'Insufficient credit history'],
  'American Express': ['Popup jail', 'Lifetime language', 'Too many Amex cards'],
  'Capital One': ['Too many inquiries', 'Insufficient income', 'Recent Capital One denial'],
  Citi: ['1/8 or 2/65 velocity', 'Too many recent accounts', '6/6 inquiries exceeded'],
  'Bank of America': ['7/12 rule', '2/3/4 rule exceeded', 'No existing relationship'],
  'US Bank': ['No existing relationship', 'Too many inquiries', 'Recent new accounts'],
  'Wells Fargo': ['No existing WF relationship', 'Identity verification failed', 'Insufficient credit'],
};

// Score breakdown per issuer (for hover tooltip)
const SCORE_BREAKDOWN: Record<string, { label: string; value: number; weight: number }[]> = {
  Chase: [
    { label: 'Call Frequency', value: 92, weight: 20 },
    { label: 'Response Rate', value: 88, weight: 25 },
    { label: 'Recon Success', value: 85, weight: 25 },
    { label: 'Approval Trend', value: 90, weight: 15 },
    { label: 'Contact Recency', value: 82, weight: 15 },
  ],
  'American Express': [
    { label: 'Call Frequency', value: 78, weight: 20 },
    { label: 'Response Rate', value: 72, weight: 25 },
    { label: 'Recon Success', value: 70, weight: 25 },
    { label: 'Approval Trend', value: 75, weight: 15 },
    { label: 'Contact Recency', value: 76, weight: 15 },
  ],
  'Capital One': [
    { label: 'Call Frequency', value: 65, weight: 20 },
    { label: 'Response Rate', value: 58, weight: 25 },
    { label: 'Recon Success', value: 55, weight: 25 },
    { label: 'Approval Trend', value: 68, weight: 15 },
    { label: 'Contact Recency', value: 64, weight: 15 },
  ],
  Citi: [
    { label: 'Call Frequency', value: 55, weight: 20 },
    { label: 'Response Rate', value: 50, weight: 25 },
    { label: 'Recon Success', value: 48, weight: 25 },
    { label: 'Approval Trend', value: 60, weight: 15 },
    { label: 'Contact Recency', value: 68, weight: 15 },
  ],
  'Bank of America': [
    { label: 'Call Frequency', value: 42, weight: 20 },
    { label: 'Response Rate', value: 45, weight: 25 },
    { label: 'Recon Success', value: 40, weight: 25 },
    { label: 'Approval Trend', value: 55, weight: 15 },
    { label: 'Contact Recency', value: 52, weight: 15 },
  ],
  'US Bank': [
    { label: 'Call Frequency', value: 72, weight: 20 },
    { label: 'Response Rate', value: 68, weight: 25 },
    { label: 'Recon Success', value: 65, weight: 25 },
    { label: 'Approval Trend', value: 70, weight: 15 },
    { label: 'Contact Recency', value: 70, weight: 15 },
  ],
  'Wells Fargo': [
    { label: 'Call Frequency', value: 30, weight: 20 },
    { label: 'Response Rate', value: 35, weight: 25 },
    { label: 'Recon Success', value: 28, weight: 25 },
    { label: 'Approval Trend', value: 45, weight: 15 },
    { label: 'Contact Recency', value: 52, weight: 15 },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 80) return '#10B981'; // green
  if (score >= 60) return '#C9A84C'; // gold
  if (score >= 40) return '#F59E0B'; // amber
  return '#EF4444';                  // red
}

function tierBadge(tier: IssuerContact['tier']): string {
  const map: Record<IssuerContact['tier'], string> = {
    platinum: 'bg-indigo-900 text-indigo-300 border-indigo-700',
    gold:     'bg-yellow-900 text-yellow-300 border-yellow-700',
    silver:   'bg-gray-700 text-gray-300 border-gray-600',
    standard: 'bg-gray-800 text-gray-500 border-gray-700',
  };
  return map[tier];
}

function trendIcon(trend: TrendDirection): { icon: string; cls: string } {
  if (trend === 'improving') return { icon: '\u2191', cls: 'text-green-400' };
  if (trend === 'declining') return { icon: '\u2193', cls: 'text-red-400' };
  return { icon: '\u2192', cls: 'text-yellow-400' };
}

function todayStr(): string {
  return '2026-04-01';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RelationshipGauge({ score }: { score: number }) {
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const filled = (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <div className="flex items-center gap-2">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-label={`Relationship score ${score}`}>
        <circle cx="22" cy="22" r={radius} fill="none" stroke="#374151" strokeWidth="5" />
        <circle
          cx="22" cy="22" r={radius}
          fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
        <text x="22" y="22" textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: '9px', fontWeight: 700, fill: '#F9FAFB' }}>
          {score}
        </text>
      </svg>
    </div>
  );
}

/** Larger score ring with hover tooltip breakdown */
function ScoreRingLarge({ score, issuer }: { score: number; issuer: string }) {
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const filled = (score / 100) * circ;
  const color = scoreColor(score);
  const [showTooltip, setShowTooltip] = useState(false);
  const breakdown = SCORE_BREAKDOWN[issuer] || [];

  return (
    <div className="relative inline-block">
      <div
        className="cursor-pointer"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#374151" strokeWidth="7" />
          <circle
            cx="50" cy="50" r={radius}
            fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${filled} ${circ - filled}`}
            strokeDashoffset={circ * 0.25}
            strokeLinecap="round"
          />
          <text x="50" y="46" textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: '22px', fontWeight: 700, fill: '#F9FAFB' }}>
            {score}
          </text>
          <text x="50" y="64" textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: '9px', fill: '#9CA3AF' }}>
            / 100
          </text>
        </svg>
      </div>

      {showTooltip && breakdown.length > 0 && (
        <div className="absolute z-50 left-28 top-0 bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl w-60">
          <p className="text-xs font-semibold text-gray-300 mb-2">Score Breakdown</p>
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-gray-400">{b.label} <span className="text-gray-600">({b.weight}%)</span></span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${b.value}%`, backgroundColor: scoreColor(b.value) }} />
                </div>
                <span className="text-gray-300 font-medium w-7 text-right">{b.value}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniSparkbar({ values }: { values: number[] }) {
  const max = Math.max(...values);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-2 rounded-sm bg-blue-600 opacity-70"
          style={{ height: `${(v / max) * 24}px` }}
          title={`${v}%`}
        />
      ))}
    </div>
  );
}

/** Toast notification */
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-green-900 border border-green-700 text-green-200 px-5 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-[fadeIn_0.2s_ease-out]">
      <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 text-green-400 hover:text-green-200 text-lg leading-none">&times;</button>
    </div>
  );
}

/** Kebab menu for row actions */
function KebabMenu({ onLogContact }: { onLogContact: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 w-40">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onLogContact(); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
            >
              Log Contact
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer Tabs
// ---------------------------------------------------------------------------

function DrawerOverviewTab({ issuer }: { issuer: IssuerContact }) {
  return (
    <div className="space-y-6">
      {/* At-risk banner for Wells Fargo */}
      {issuer.issuer === 'Wells Fargo' && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">Relationship At Risk</p>
              <p className="text-xs text-amber-400 mt-1">Relationship score is low. Last contact 32 days ago.</p>
              <button className="mt-3 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-xs font-semibold text-white transition-colors">
                Schedule Outreach
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score ring */}
      <div className="flex items-start gap-6">
        <ScoreRingLarge score={issuer.relationshipScore} issuer={issuer.issuer} />
        <div className="space-y-2 pt-2">
          <div>
            <p className="text-xs text-gray-500">Tier</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border uppercase ${tierBadge(issuer.tier)}`}>
              {issuer.tier}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500">Last Contact</p>
            <p className="text-sm text-gray-200">{issuer.lastContact}</p>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact Information</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500">Banker</p>
            <p className="text-sm text-gray-200">{issuer.bankerName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Direct Line</p>
            <a href={`tel:${issuer.bankerPhone}`} className="text-sm text-blue-400 hover:text-blue-300 font-mono">{issuer.bankerPhone}</a>
          </div>
          <div>
            <p className="text-xs text-gray-500">Recon Line</p>
            <a href={`tel:${issuer.reconsiderationLine}`} className="text-sm text-yellow-400 hover:text-yellow-300 font-mono">{issuer.reconsiderationLine}</a>
          </div>
          <div>
            <p className="text-xs text-gray-500">Hours</p>
            <p className="text-sm text-gray-200">{issuer.reconsiderationHours}</p>
          </div>
        </div>
      </div>

      {/* Notes */}
      {issuer.notes && (
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</h4>
          <p className="text-sm text-gray-300">{issuer.notes}</p>
        </div>
      )}
    </div>
  );
}

function DrawerVelocityTab({ issuer }: { issuer: string }) {
  const data = VELOCITY_RULES[issuer];
  if (!data) return <p className="text-sm text-gray-500">No velocity rules available for {issuer}.</p>;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-300">{data.title}</h4>
      {data.rules.map((rule) => (
        <div key={rule.label} className="bg-gray-800/60 border border-gray-700 rounded-lg p-4">
          <p className="text-sm font-semibold text-yellow-400 mb-1">{rule.label}</p>
          <p className="text-xs text-gray-300">{rule.value}</p>
        </div>
      ))}
    </div>
  );
}

function DrawerContactLogTab({ issuer }: { issuer: string }) {
  const logs = PLACEHOLDER_CONTACT_LOGS[issuer] || DEFAULT_CONTACT_LOGS;
  return (
    <div className="space-y-3">
      {logs.map((entry) => (
        <div key={entry.id} className="bg-gray-800/60 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-200">{entry.callType}</span>
            <span className="text-xs text-gray-500">{entry.date}</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-gray-400">Banker: {entry.banker}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              entry.outcome === 'Approved' ? 'bg-green-900/50 text-green-400' :
              entry.outcome === 'Denied' ? 'bg-red-900/50 text-red-400' :
              entry.outcome === 'Pending' ? 'bg-yellow-900/50 text-yellow-400' :
              'bg-gray-700 text-gray-300'
            }`}>
              {entry.outcome}
            </span>
          </div>
          <p className="text-xs text-gray-400">{entry.notes}</p>
        </div>
      ))}
    </div>
  );
}

function DrawerReconHistoryTab({ issuer }: { issuer: string }) {
  const history = PLACEHOLDER_RECON_HISTORY[issuer] || DEFAULT_RECON_HISTORY;
  return (
    <div className="space-y-3">
      {history.map((entry) => (
        <div key={entry.id} className="bg-gray-800/60 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-blue-400">{entry.appId}</span>
            <span className="text-xs text-gray-500">{entry.date}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-200">{entry.client}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              entry.outcome.includes('Approved') ? 'bg-green-900/50 text-green-400' :
              entry.outcome.includes('Denied') ? 'bg-red-900/50 text-red-400' :
              'bg-gray-700 text-gray-300'
            }`}>
              {entry.outcome}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DrawerApprovalIntelTab({ issuer }: { issuer: string }) {
  const rates = APPROVAL_INTEL_RATES[issuer] || [50, 50, 50, 50, 50, 50];
  const maxRate = Math.max(...rates, 100);
  const ficoBands = FICO_BANDS;
  const denials = COMMON_DENIALS[issuer] || [];

  return (
    <div className="space-y-6">
      {/* 6-month trend bars */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Approval Rate Trend (6 Months)</h4>
        <div className="flex items-end gap-2 h-28">
          {rates.map((rate, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-gray-400 font-medium">{rate}%</span>
              <div className="w-full bg-gray-800 rounded-t-sm overflow-hidden" style={{ height: '80px' }}>
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${(rate / maxRate) * 80}px`,
                    marginTop: `${80 - (rate / maxRate) * 80}px`,
                    backgroundColor: rate >= 70 ? '#10B981' : rate >= 50 ? '#C9A84C' : '#EF4444',
                  }}
                />
              </div>
              <span className="text-xs text-gray-500">{APPROVAL_INTEL_MONTHS[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rate by FICO band */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Approval Rate by FICO Band</h4>
        <div className="space-y-2">
          {ficoBands.map((fb) => {
            const rate = fb.rates[issuer as keyof typeof fb.rates] || 0;
            return (
              <div key={fb.band} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-16 text-right font-mono">{fb.band}</span>
                <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${rate}%`,
                      backgroundColor: rate >= 70 ? '#10B981' : rate >= 50 ? '#C9A84C' : '#EF4444',
                    }}
                  />
                </div>
                <span className="text-xs text-gray-300 w-10 text-right font-semibold">{rate}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Common denial reasons */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Common Denial Reasons</h4>
        <div className="space-y-1.5">
          {denials.map((reason, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-red-500 font-bold">{i + 1}.</span>
              <span className="text-gray-300">{reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Drawer
// ---------------------------------------------------------------------------

function IssuerDrawer({ issuer, onClose }: { issuer: IssuerContact; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');

  const tabs: { key: DrawerTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'velocity', label: 'Velocity Rules' },
    { key: 'contactLog', label: 'Contact Log' },
    { key: 'reconHistory', label: 'Recon History' },
    { key: 'approvalIntel', label: 'Approval Intel' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Drawer panel */}
      <div className="fixed top-0 right-0 h-full z-50 bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col"
        style={{ width: '640px', maxWidth: '100vw' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">{issuer.issuer}</h2>
            {issuer.issuer === 'Wells Fargo' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-900/50 text-amber-400 border border-amber-700">
                At Risk
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-yellow-500 text-yellow-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && <DrawerOverviewTab issuer={issuer} />}
          {activeTab === 'velocity' && <DrawerVelocityTab issuer={issuer.issuer} />}
          {activeTab === 'contactLog' && <DrawerContactLogTab issuer={issuer.issuer} />}
          {activeTab === 'reconHistory' && <DrawerReconHistoryTab issuer={issuer.issuer} />}
          {activeTab === 'approvalIntel' && <DrawerApprovalIntelTab issuer={issuer.issuer} />}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function AddIssuerModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (form: AddIssuerForm) => void }) {
  const [form, setForm] = useState<AddIssuerForm>({
    issuer: '', bankerName: '', directLine: '', reconLine: '', hours: '', tier: 'standard', notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-600';

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <h3 className="text-base font-bold text-white">Add Issuer Contact</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200">&times;</button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Issuer *</label>
              <input required className={inputCls} value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="e.g. Discover" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Banker Name *</label>
                <input required className={inputCls} value={form.bankerName} onChange={(e) => setForm({ ...form, bankerName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tier</label>
                <select className={inputCls} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as IssuerContact['tier'] })}>
                  <option value="standard">Standard</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="platinum">Platinum</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Direct Line</label>
                <input className={inputCls} value={form.directLine} onChange={(e) => setForm({ ...form, directLine: e.target.value })} placeholder="1-800-XXX-XXXX" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Recon Line</label>
                <input className={inputCls} value={form.reconLine} onChange={(e) => setForm({ ...form, reconLine: e.target.value })} placeholder="1-800-XXX-XXXX" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Hours</label>
              <input className={inputCls} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="Mon-Fri 8am-5pm ET" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notes</label>
              <textarea className={inputCls} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm font-semibold text-white transition-colors">Add Contact</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function LogContactModal({ issuer, onClose, onSubmit }: { issuer: IssuerContact; onClose: () => void; onSubmit: (form: LogContactForm) => void }) {
  const [form, setForm] = useState<LogContactForm>({
    date: todayStr(), banker: issuer.bankerName, callType: 'Recon Call', duration: '', outcome: 'Pending', notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-600';

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <h3 className="text-base font-bold text-white">Log Contact — {issuer.issuer}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200">&times;</button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Date</label>
                <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Banker</label>
                <input className={inputCls} value={form.banker} onChange={(e) => setForm({ ...form, banker: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Call Type</label>
                <select className={inputCls} value={form.callType} onChange={(e) => setForm({ ...form, callType: e.target.value })}>
                  <option>Recon Call</option>
                  <option>Relationship Check</option>
                  <option>New App Support</option>
                  <option>Status Follow-up</option>
                  <option>Escalation</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Duration (mins)</label>
                <input type="number" className={inputCls} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 15" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Outcome</label>
              <select className={inputCls} value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
                <option>Approved</option>
                <option>Denied</option>
                <option>Pending</option>
                <option>Info Gathered</option>
                <option>Escalated</option>
                <option>Voicemail</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notes</label>
              <textarea className={inputCls} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm font-semibold text-white transition-colors">Log Contact</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function LogReconModal({ contacts, onClose, onSubmit }: { contacts: IssuerContact[]; onClose: () => void; onSubmit: (form: LogReconForm) => void }) {
  const [form, setForm] = useState<LogReconForm>({
    issuer: contacts[0]?.issuer || '', applicationId: '', client: '', date: todayStr(), banker: contacts[0]?.bankerName || '', outcome: 'Approved on Recon', resolutionTime: '', notes: '',
  });

  const handleIssuerChange = (issuerName: string) => {
    const contact = contacts.find((c) => c.issuer === issuerName);
    setForm({ ...form, issuer: issuerName, banker: contact?.bankerName || '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-600';

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <h3 className="text-base font-bold text-white">Log Reconsideration</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200">&times;</button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Issuer *</label>
                <select required className={inputCls} value={form.issuer} onChange={(e) => handleIssuerChange(e.target.value)}>
                  {contacts.map((c) => <option key={c.id} value={c.issuer}>{c.issuer}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Application ID *</label>
                <input required className={inputCls} value={form.applicationId} onChange={(e) => setForm({ ...form, applicationId: e.target.value })} placeholder="APP-2026-XXXX" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Client *</label>
                <input required className={inputCls} value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Date</label>
                <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Banker</label>
                <input className={inputCls} value={form.banker} onChange={(e) => setForm({ ...form, banker: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Resolution Time</label>
                <input className={inputCls} value={form.resolutionTime} onChange={(e) => setForm({ ...form, resolutionTime: e.target.value })} placeholder="e.g. 2 days" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Outcome *</label>
              <select required className={inputCls} value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
                <option>Approved on Recon</option>
                <option>Denied — Too Many Accounts</option>
                <option>Denied — Velocity</option>
                <option>Denied — Insufficient Credit</option>
                <option>Denied — Income</option>
                <option>Approved — Manual Review</option>
                <option>Pending Further Review</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notes</label>
              <textarea className={inputCls} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm font-semibold text-white transition-colors">Log Recon</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IssuersPage() {
  const [pageTab, setPageTab] = useState<PageTab>('directory');
  const [contactSearch, setContactSearch] = useState('');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [contacts, setContacts] = useState<IssuerContact[]>(INITIAL_CONTACTS);
  const [selectedCU, setSelectedCU] = useState<CreditUnionEntry | null>(null);

  // Drawer
  const [selectedIssuer, setSelectedIssuer] = useState<IssuerContact | null>(null);

  // Modals
  const [showAddIssuer, setShowAddIssuer] = useState(false);
  const [logContactIssuer, setLogContactIssuer] = useState<IssuerContact | null>(null);
  const [showLogRecon, setShowLogRecon] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const filteredContacts = contacts.filter((c) => {
    const matchSearch = !contactSearch ||
      c.issuer.toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.bankerName.toLowerCase().includes(contactSearch.toLowerCase());
    const matchTier = selectedTier === 'all' || c.tier === selectedTier;
    return matchSearch && matchTier;
  });

  const handleAddIssuer = (form: AddIssuerForm) => {
    const newContact: IssuerContact = {
      id: `iss_${Date.now()}`,
      issuer: form.issuer,
      bankerName: form.bankerName,
      bankerPhone: form.directLine || 'N/A',
      reconsiderationLine: form.reconLine || 'N/A',
      reconsiderationHours: form.hours || 'N/A',
      relationshipScore: 50,
      tier: form.tier,
      lastContact: todayStr(),
      notes: form.notes,
    };
    setContacts([...contacts, newContact]);
    setShowAddIssuer(false);
    showToast(`Added ${form.issuer} — ${form.bankerName} to contact directory`);
  };

  const handleLogContact = (form: LogContactForm) => {
    setLogContactIssuer(null);
    showToast(`Contact logged for ${logContactIssuer?.issuer} — ${form.callType}: ${form.outcome}`);
  };

  const handleLogRecon = (form: LogReconForm) => {
    setShowLogRecon(false);
    showToast(`Recon logged for ${form.issuer} — ${form.applicationId}: ${form.outcome}`);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* -- Toast -- */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* -- Drawer -- */}
      {selectedIssuer && (
        <IssuerDrawer issuer={selectedIssuer} onClose={() => setSelectedIssuer(null)} />
      )}

      {/* -- Modals -- */}
      {showAddIssuer && <AddIssuerModal onClose={() => setShowAddIssuer(false)} onSubmit={handleAddIssuer} />}
      {logContactIssuer && <LogContactModal issuer={logContactIssuer} onClose={() => setLogContactIssuer(null)} onSubmit={handleLogContact} />}
      {showLogRecon && <LogReconModal contacts={contacts} onClose={() => setShowLogRecon(false)} onSubmit={handleLogRecon} />}

      {/* -- Page header -- */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Issuer Relationships</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {contacts.length} issuers tracked &middot; banker contacts, recon lines &amp; approval intelligence
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Client Selector */}
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-yellow-600"
          >
            {CLIENTS.map((cl) => (
              <option key={cl.id} value={cl.id}>{cl.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowAddIssuer(true)}
            className="px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm font-semibold text-white transition-colors"
          >
            + Add Issuer Contact
          </button>
        </div>
      </div>

      {/* -- Page Tabs -- */}
      <div className="flex gap-1 border-b border-gray-800">
        {([
          { key: 'directory' as PageTab, label: 'Contact Directory' },
          { key: 'recon' as PageTab, label: 'Reconsideration Outcomes' },
          { key: 'creditUnions' as PageTab, label: 'Credit Unions' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setPageTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              pageTab === tab.key
                ? 'border-yellow-500 text-yellow-400'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* -- Tab: Contact Directory -- */}
      {pageTab === 'directory' && (
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-base font-semibold text-gray-200">Contact Directory</h2>
          <div className="flex gap-2 flex-wrap">
            {/* Tier filter */}
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-yellow-600"
            >
              <option value="all">All Tiers</option>
              <option value="platinum">Platinum</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="standard">Standard</option>
            </select>
            <input
              type="text"
              placeholder="Search issuer or banker..."
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-600 w-52"
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Issuer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Banker Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Direct Line</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Recon Line</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Hours</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tier</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Relationship</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Contact</th>
                <th className="w-10 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredContacts.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-900/60 transition-colors cursor-pointer"
                  onClick={() => setSelectedIssuer(c)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{c.issuer}</span>
                      {c.issuer === 'Wells Fargo' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-400 border border-amber-700 uppercase">
                          At Risk
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{c.bankerName}</td>
                  <td className="px-4 py-3">
                    <a href={`tel:${c.bankerPhone}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline">
                      {c.bankerPhone}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <a href={`tel:${c.reconsiderationLine}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs text-yellow-400 hover:text-yellow-300 hover:underline">
                      {c.reconsiderationLine}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{c.reconsiderationHours}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border uppercase ${tierBadge(c.tier)}`}>
                      {c.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex justify-center">
                    <RelationshipGauge score={c.relationshipScore} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.lastContact}</td>
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <KebabMenu onLogContact={() => setLogContactIssuer(c)} />
                  </td>
                </tr>
              ))}
              {filteredContacts.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-600 text-sm">
                    No issuers match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* -- Tab: Reconsideration Outcomes -- */}
      {pageTab === 'recon' && (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Section 2: Reconsideration Outcomes */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-gray-200">Reconsideration Outcomes</h2>
            <button
              onClick={() => setShowLogRecon(true)}
              className="px-3 py-1.5 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-xs font-semibold text-white transition-colors"
            >
              + Log Recon
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-5">Success rate by issuer &middot; all-time recon attempts</p>

          <div className="space-y-4">
            {[...ISSUER_OUTCOMES].sort((a, b) => (b.successful / b.totalRecons) - (a.successful / a.totalRecons)).map((o) => {
              const rate = Math.round((o.successful / o.totalRecons) * 100);
              const barColor = rate >= 70 ? 'bg-green-600' : rate >= 45 ? 'bg-yellow-600' : 'bg-red-700';
              return (
                <div key={o.issuer}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-200">{o.issuer}</span>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{o.successful}/{o.totalRecons} approved</span>
                      <span className="text-gray-600">&middot;</span>
                      <span>avg {o.avgResponseDays}d</span>
                      <span className={`font-bold text-sm ${rate >= 70 ? 'text-green-400' : rate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {rate}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary row */}
          <div className="mt-6 pt-4 border-t border-gray-800 flex gap-6 text-xs text-gray-400">
            <div>
              <p className="text-gray-500">Total Recons</p>
              <p className="text-white font-bold text-base mt-0.5">
                {ISSUER_OUTCOMES.reduce((s, o) => s + o.totalRecons, 0)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Total Approved</p>
              <p className="text-green-400 font-bold text-base mt-0.5">
                {ISSUER_OUTCOMES.reduce((s, o) => s + o.successful, 0)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Blended Rate</p>
              <p className="text-yellow-400 font-bold text-base mt-0.5">
                {Math.round(
                  (ISSUER_OUTCOMES.reduce((s, o) => s + o.successful, 0) /
                    ISSUER_OUTCOMES.reduce((s, o) => s + o.totalRecons, 0)) * 100
                )}%
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Approval Trends */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">Approval Trends</h2>
          <p className="text-xs text-gray-500 mb-5">Monthly approval rate per issuer &middot; last 3 months</p>

          <div className="space-y-3">
            {[...ISSUER_TRENDS].sort((a, b) => b.currentRate - a.currentRate).map((t) => {
              const { icon, cls } = trendIcon(t.trend);
              const deltaDisplay = t.deltaPoints > 0 ? `+${t.deltaPoints}pts` : `${t.deltaPoints}pts`;
              const trendBg = t.trend === 'improving'
                ? 'bg-green-900/30 border-green-800'
                : t.trend === 'declining'
                  ? 'bg-red-900/30 border-red-900'
                  : 'bg-yellow-900/20 border-yellow-900';

              return (
                <div key={t.issuer} className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${trendBg}`}>
                  {/* Issuer name */}
                  <div className="w-36 flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-100">{t.issuer}</p>
                  </div>

                  {/* Sparkbars */}
                  <div className="flex-1">
                    <MiniSparkbar values={t.approvalRateLast3Mo} />
                  </div>

                  {/* Current rate */}
                  <div className="text-right flex-shrink-0 w-16">
                    <p className="text-base font-bold text-white">{t.currentRate}%</p>
                    <p className="text-xs text-gray-500">current</p>
                  </div>

                  {/* Trend indicator */}
                  <div className={`flex items-center gap-1 flex-shrink-0 w-24 justify-end ${cls}`}>
                    <span className="text-lg font-bold leading-none">{icon}</span>
                    <div className="text-right">
                      <p className="text-xs font-semibold">{t.trend}</p>
                      <p className="text-xs opacity-70">{deltaDisplay}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-gray-600">
            Sparkbars show: 3 months ago &rarr; 2 months ago &rarr; last month. Rate = approvals &divide; submissions.
          </p>
        </section>
      </div>
      )}

      {/* -- Tab: Credit Unions -- */}
      {pageTab === 'creditUnions' && (
      <>
        {/* CU Detail Drawer */}
        {selectedCU && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedCU(null)} />
            <div className="relative w-full max-w-md bg-gray-900 border-l border-gray-800 overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{selectedCU.cuName}</h3>
                <button onClick={() => setSelectedCU(null)} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Loan Officer</span><span className="text-gray-100">{selectedCU.loanOfficer}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Direct Line</span><span className="text-gray-100">{selectedCU.directLine}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Membership</span><span className="text-gray-100">{selectedCU.membershipType}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Min FICO (member)</span><span className="text-gray-100">{selectedCU.minFico}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Ongoing APR</span><span className="text-gray-100">{selectedCU.ongoingApr}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Tier</span><span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${tierBadge(selectedCU.tier)}`}>{selectedCU.tier}</span></div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Relationship Score</span>
                  <span className="font-bold" style={{ color: scoreColor(selectedCU.relationshipScore) }}>{selectedCU.relationshipScore}</span>
                </div>
                <div className="flex justify-between"><span className="text-gray-400">Last Contact</span><span className="text-gray-100">{selectedCU.lastContact}</span></div>
              </div>
              {/* CU-specific contact note if available */}
              {CU_CONTACT_NOTES.filter(n => n.cu === selectedCU.cuName).map(n => (
                <div key={n.id} className="mt-4 p-3 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 leading-relaxed">
                  {n.note}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CU Directory Table */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-200">CU Directory</h2>
          </div>
          <div className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[1060px]">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">CU Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Loan Officer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Direct Line</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Membership Type</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Min FICO</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Ongoing APR</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tier</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Relationship</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {CU_DIRECTORY.map((cu) => (
                  <tr
                    key={cu.id}
                    className="hover:bg-gray-900/60 transition-colors cursor-pointer"
                    onClick={() => setSelectedCU(cu)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-white">{cu.cuName}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{cu.loanOfficer}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{cu.directLine}</td>
                    <td className="px-4 py-3 text-gray-300">{cu.membershipType}</td>
                    <td className="px-4 py-3 text-center text-gray-200 font-semibold">{cu.minFico}</td>
                    <td className="px-4 py-3 text-gray-300">{cu.ongoingApr}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${tierBadge(cu.tier)}`}>
                        {cu.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${cu.relationshipScore}%`, backgroundColor: scoreColor(cu.relationshipScore) }}
                          />
                        </div>
                        <span className="text-xs font-bold" style={{ color: scoreColor(cu.relationshipScore) }}>
                          {cu.relationshipScore}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{cu.lastContact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CU Intelligence Panel */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">CU Intelligence Panel</h2>
          <p className="text-xs text-gray-500 mb-5">Aggregated credit union membership and approval metrics</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Members Acquired</p>
              <p className="text-2xl font-bold text-white">24</p>
              <p className="text-xs text-gray-500 mt-1">across 6 CUs</p>
            </div>
            <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Avg CU Approval Rate</p>
              <p className="text-2xl font-bold text-green-400">71%</p>
              <p className="text-xs text-gray-500 mt-1">vs 65% bank avg</p>
            </div>
            <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Avg CU Credit Limit</p>
              <p className="text-2xl font-bold text-yellow-400">$12,400</p>
            </div>
            <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Most Popular CU</p>
              <p className="text-lg font-bold text-white">Navy Federal</p>
              <p className="text-xs text-gray-500 mt-1">12 members</p>
            </div>
          </div>
        </section>

        {/* CU Contact Notes */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-1">CU Contact Notes</h2>
          <p className="text-xs text-gray-500 mb-4">Relationship notes and contact intelligence</p>
          <div className="space-y-3">
            {CU_CONTACT_NOTES.map((note) => (
              <div key={note.id} className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
                <p className="text-sm text-gray-200 leading-relaxed">{note.note}</p>
              </div>
            ))}
          </div>
        </section>
      </>
      )}
    </div>
  );
}
