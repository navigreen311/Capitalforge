'use client';

// ============================================================
// /partners — Partner & Vendor Governance
// Partner list with type badges, compliance score gauge,
// due diligence status, next review date.
// Detail drawer with 5 tabs. 3-step add-partner wizard.
// Contract expiry badges. Subprocessor audit alerts.
// Client selector. Score ring tooltip.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../lib/api-client';
import PartnerScorecard from '../../components/modules/partner-scorecard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PartnerType = 'referral' | 'broker' | 'processor' | 'attorney' | 'credit_union';
type DueDiligenceStatus = 'pending' | 'in_review' | 'approved' | 'flagged' | 'expired';

interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  complianceScore: number;         // 0–100
  complaintsScore: number;         // 0–100
  dueDiligenceScore: number;       // 0–100
  contractScore: number;           // 0–100
  dueDiligenceStatus: DueDiligenceStatus;
  nextReviewDate: string;          // ISO date
  contactName: string;
  contactEmail: string;
  jurisdiction: string;
  activeContracts: number;
  totalFeesPaid: number;
  phone?: string;
  website?: string;
  services?: string[];
  feeStructure?: string;
  referralCode?: string;
  riskTier?: string;
  certifications?: string[];
  reviewCycle?: string;
  membersReferred?: number;
}

interface Subprocessor {
  id: string;
  name: string;
  serviceType: string;
  dataCategories: string[];
  jurisdiction: string;
  certifications: string[];
  lastAuditDate: string;
  status: 'active' | 'under_review' | 'terminated';
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_PARTNERS: Partner[] = [
  {
    id: 'prt_001',
    name: 'Meridian Capital Brokers',
    type: 'broker',
    complianceScore: 94,
    complaintsScore: 88,
    dueDiligenceScore: 91,
    contractScore: 96,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2026-09-15',
    contactName: 'Daniel Torres',
    contactEmail: 'dtorres@meridiancap.com',
    jurisdiction: 'TX',
    activeContracts: 3,
    totalFeesPaid: 142500,
    phone: '(214) 555-0142',
    website: 'meridiancap.com',
    services: ['Loan Origination', 'Credit Analysis'],
    feeStructure: '% of funding',
    referralCode: 'MER-2026-A1',
    riskTier: 'Low',
    certifications: ['SOC 2', 'ISO 27001'],
    reviewCycle: 'Annual',
  },
  {
    id: 'prt_002',
    name: 'Westside Referral Group',
    type: 'referral',
    complianceScore: 78,
    complaintsScore: 82,
    dueDiligenceScore: 70,
    contractScore: 85,
    dueDiligenceStatus: 'in_review',
    nextReviewDate: '2026-04-30',
    contactName: 'Patricia Lee',
    contactEmail: 'plee@westsideref.com',
    jurisdiction: 'CA',
    activeContracts: 1,
    totalFeesPaid: 38200,
    phone: '(310) 555-0198',
    website: 'westsideref.com',
    services: ['Lead Generation'],
    feeStructure: 'Flat fee',
    referralCode: 'WSR-2026-B3',
    riskTier: 'Medium',
    certifications: ['SOC 2'],
    reviewCycle: 'Quarterly',
  },
  {
    id: 'prt_003',
    name: 'CorePay Processing LLC',
    type: 'processor',
    complianceScore: 87,
    complaintsScore: 75,
    dueDiligenceScore: 92,
    contractScore: 90,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2026-12-01',
    contactName: 'Marcus Huang',
    contactEmail: 'mhuang@corepay.io',
    jurisdiction: 'DE',
    activeContracts: 2,
    totalFeesPaid: 215000,
    phone: '(302) 555-0067',
    website: 'corepay.io',
    services: ['Payment Processing', 'ACH Transfers'],
    feeStructure: '% of funding',
    referralCode: 'CPP-2026-C7',
    riskTier: 'Low',
    certifications: ['PCI DSS', 'SOC 2', 'ISO 27001'],
    reviewCycle: 'Annual',
  },
  {
    id: 'prt_004',
    name: 'Goldstein & Rowe LLP',
    type: 'attorney',
    complianceScore: 98,
    complaintsScore: 95,
    dueDiligenceScore: 99,
    contractScore: 97,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2027-01-10',
    contactName: 'Rachel Goldstein',
    contactEmail: 'rgoldstein@gr-law.com',
    jurisdiction: 'NY',
    activeContracts: 4,
    totalFeesPaid: 89000,
    phone: '(212) 555-0301',
    website: 'gr-law.com',
    services: ['Legal Review', 'Compliance Consulting', 'Contract Drafting'],
    feeStructure: 'Monthly retainer',
    referralCode: 'GRL-2026-D2',
    riskTier: 'Low',
    certifications: ['ABA Certified'],
    reviewCycle: 'Annual',
  },
  {
    id: 'prt_005',
    name: 'FastFund Brokers Inc.',
    type: 'broker',
    complianceScore: 54,
    complaintsScore: 48,
    dueDiligenceScore: 61,
    contractScore: 70,
    dueDiligenceStatus: 'flagged',
    nextReviewDate: '2026-04-19',
    contactName: 'Steve Marino',
    contactEmail: 'smarino@fastfund.biz',
    jurisdiction: 'FL',
    activeContracts: 1,
    totalFeesPaid: 12400,
    phone: '(305) 555-0444',
    website: 'fastfund.biz',
    services: ['Loan Origination'],
    feeStructure: 'Flat fee',
    referralCode: 'FFB-2026-E9',
    riskTier: 'High',
    certifications: [],
    reviewCycle: 'Monthly',
  },
  {
    id: 'prt_006',
    name: 'Atlas Referral Network',
    type: 'referral',
    complianceScore: 81,
    complaintsScore: 90,
    dueDiligenceScore: 77,
    contractScore: 83,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2026-08-30',
    contactName: 'Kezia Obi',
    contactEmail: 'kobi@atlasreferrals.net',
    jurisdiction: 'GA',
    activeContracts: 2,
    totalFeesPaid: 67300,
    phone: '(404) 555-0223',
    website: 'atlasreferrals.net',
    services: ['Lead Generation', 'Marketing'],
    feeStructure: '% of funding',
    referralCode: 'ATL-2026-F5',
    riskTier: 'Low',
    certifications: ['SOC 2'],
    reviewCycle: 'Semi-annual',
  },
  {
    id: 'prt_007',
    name: 'Navy Federal CU',
    type: 'credit_union',
    complianceScore: 88,
    complaintsScore: 91,
    dueDiligenceScore: 85,
    contractScore: 90,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2026-11-15',
    contactName: 'Lt. Cmdr. Amy Reeves',
    contactEmail: 'areeves@navyfederal.org',
    jurisdiction: 'VA',
    activeContracts: 2,
    totalFeesPaid: 98500,
    phone: '(703) 555-0188',
    website: 'navyfederal.org',
    services: ['Loan Origination', 'Credit Analysis'],
    feeStructure: '% of funding',
    referralCode: 'NFCU-2026-G1',
    riskTier: 'Low',
    certifications: ['SOC 2', 'NCUA Certified'],
    reviewCycle: 'Annual',
    membersReferred: 1247,
  },
  {
    id: 'prt_008',
    name: 'PenFed CU',
    type: 'credit_union',
    complianceScore: 82,
    complaintsScore: 85,
    dueDiligenceScore: 80,
    contractScore: 84,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2026-10-01',
    contactName: 'David Nguyen',
    contactEmail: 'dnguyen@penfed.org',
    jurisdiction: 'VA',
    activeContracts: 1,
    totalFeesPaid: 54200,
    phone: '(571) 555-0234',
    website: 'penfed.org',
    services: ['Loan Origination', 'Underwriting'],
    feeStructure: 'Flat fee',
    referralCode: 'PFC-2026-H4',
    riskTier: 'Low',
    certifications: ['SOC 2'],
    reviewCycle: 'Semi-annual',
    membersReferred: 834,
  },
];

const PLACEHOLDER_SUBPROCESSORS: Subprocessor[] = [
  {
    id: 'sp_001',
    name: 'Plaid Technologies Inc.',
    serviceType: 'Bank Verification / Open Banking',
    dataCategories: ['Bank account data', 'Transaction history', 'Balance information'],
    jurisdiction: 'US',
    certifications: ['SOC 2 Type II', 'PCI DSS'],
    lastAuditDate: '2025-11-15',
    status: 'active',
  },
  {
    id: 'sp_002',
    name: 'Equifax Information Services',
    serviceType: 'Credit Bureau Reporting',
    dataCategories: ['Credit history', 'Identity data', 'Payment history'],
    jurisdiction: 'US',
    certifications: ['SOC 2 Type II', 'ISO 27001'],
    lastAuditDate: '2025-10-01',
    status: 'active',
  },
  {
    id: 'sp_003',
    name: 'Stripe Payments LLC',
    serviceType: 'Payment Processing',
    dataCategories: ['Payment card data', 'Bank routing info', 'Transaction metadata'],
    jurisdiction: 'US',
    certifications: ['PCI DSS Level 1', 'SOC 2 Type II'],
    lastAuditDate: '2025-12-01',
    status: 'active',
  },
  {
    id: 'sp_004',
    name: 'DocuSign Inc.',
    serviceType: 'Electronic Signature',
    dataCategories: ['Document content', 'Signatory identity', 'Audit trails'],
    jurisdiction: 'US',
    certifications: ['SOC 2 Type II', 'ISO 27001', 'FedRAMP'],
    lastAuditDate: '2026-01-10',
    status: 'active',
  },
  {
    id: 'sp_005',
    name: 'TrueLayer Ltd.',
    serviceType: 'Open Banking API',
    dataCategories: ['Bank account data', 'Payment initiation'],
    jurisdiction: 'UK / EU',
    certifications: ['PSD2', 'ISO 27001'],
    lastAuditDate: '2025-09-20',
    status: 'under_review',
  },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARTNER_TYPES: PartnerType[] = ['referral', 'broker', 'processor', 'attorney', 'credit_union'];
const DD_STATUSES: DueDiligenceStatus[] = ['pending', 'in_review', 'approved', 'flagged', 'expired'];

const ALL_SERVICES = [
  'Loan Origination', 'Credit Analysis', 'Lead Generation',
  'Payment Processing', 'ACH Transfers', 'Legal Review',
  'Compliance Consulting', 'Contract Drafting', 'Marketing',
  'Underwriting', 'Collections', 'Servicing',
];

const ALL_CERTIFICATIONS = [
  'SOC 2', 'SOC 2 Type II', 'ISO 27001', 'PCI DSS', 'ABA Certified', 'FedRAMP',
];

const CLIENTS = [
  { id: 'cl_all', name: 'All Clients' },
  { id: 'cl_001', name: 'Apex Funding Corp' },
  { id: 'cl_002', name: 'Summit Capital LLC' },
  { id: 'cl_003', name: 'Blue Harbor Finance' },
];

const DD_CHECKLIST_ITEMS = [
  'Identity Verification',
  'Background Check',
  'Enforcement History',
  'Contract Review',
  'Insurance Verification',
  'Reference Checks',
  'Compliance Training',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PARTNER_TYPE_CONFIG: Record<PartnerType, { label: string; badgeClass: string }> = {
  referral:  { label: 'Referral',  badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  broker:    { label: 'Broker',    badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
  processor: { label: 'Processor', badgeClass: 'bg-amber-900 text-amber-300 border-amber-700' },
  attorney:     { label: 'Attorney',     badgeClass: 'bg-teal-900 text-teal-300 border-teal-700' },
  credit_union: { label: 'Credit Union', badgeClass: 'bg-cyan-900 text-cyan-300 border-cyan-700' },
};

const DD_STATUS_CONFIG: Record<DueDiligenceStatus, { label: string; badgeClass: string }> = {
  pending:    { label: 'Pending',    badgeClass: 'bg-gray-800 text-gray-400 border-gray-600' },
  in_review:  { label: 'In Review',  badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  approved:   { label: 'Approved',   badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  flagged:    { label: 'Flagged',    badgeClass: 'bg-red-900 text-red-300 border-red-700' },
  expired:    { label: 'Expired',    badgeClass: 'bg-orange-900 text-orange-300 border-orange-700' },
};

const SP_STATUS_CONFIG: Record<Subprocessor['status'], { label: string; badgeClass: string }> = {
  active:       { label: 'Active',       badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  under_review: { label: 'Under Review', badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  terminated:   { label: 'Terminated',   badgeClass: 'bg-red-900 text-red-300 border-red-700' },
};

function overallScore(p: Partner): number {
  return Math.round((p.complianceScore + p.complaintsScore + p.dueDiligenceScore + p.contractScore) / 4);
}

function gradeFromAvg(avg: number): { grade: string; color: string } {
  if (avg >= 90) return { grade: 'A', color: '#22c55e' };
  if (avg >= 80) return { grade: 'B', color: '#84cc16' };
  if (avg >= 70) return { grade: 'C', color: '#eab308' };
  if (avg >= 60) return { grade: 'D', color: '#f97316' };
  return               { grade: 'F', color: '#ef4444' };
}

/** Breakdown for score ring tooltip — maps raw sub-scores onto weighted /100 */
function scoreBreakdown(p: Partner) {
  const contractPts = Math.round(p.contractScore * 30 / 100);
  const ddPts = Math.round(p.dueDiligenceScore * 25 / 100);
  const enforcementPts = Math.round(p.complaintsScore * 20 / 100);
  const certPts = Math.round((p.certifications?.length ?? 0) > 0 ? 15 : 0);
  const perfPts = Math.round(Math.min(p.complianceScore * 10 / 100, 10));
  const total = contractPts + ddPts + enforcementPts + certPts + perfPts;
  const { grade } = gradeFromAvg(total);
  return { contractPts, ddPts, enforcementPts, certPts, perfPts, total, grade };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

/** Days until a date from today (2026-04-01). Negative = overdue. */
function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Days since a date. */
function daysSince(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
}

function certAuditStatus(lastAuditDate: string): { label: string; badgeClass: string } {
  const d = daysSince(lastAuditDate);
  if (d > 180) return { label: 'Overdue', badgeClass: 'bg-red-900 text-red-300 border-red-700' };
  if (d > 90)  return { label: 'Review Soon', badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' };
  return { label: 'Current', badgeClass: 'bg-green-900 text-green-300 border-green-700' };
}

function reviewExpiryBadge(nextReviewDate: string): { label: string; badgeClass: string } | null {
  const d = daysUntil(nextReviewDate);
  if (d <= 7) return { label: 'Due Now', badgeClass: 'bg-red-900 text-red-300 border-red-700' };
  if (d <= 30) return { label: 'Due Soon', badgeClass: 'bg-amber-900 text-amber-300 border-amber-700' };
  return null;
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'REF-';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-green-900 border border-green-700 text-green-200 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold animate-pulse">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ComplianceGauge with tooltip
// ---------------------------------------------------------------------------

function ComplianceGauge({ score, partner }: { score: number; partner: Partner }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const size = 56;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
  const cx = size / 2;
  const cy = size / 2;
  const bd = scoreBreakdown(partner);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg width={size} height={size} aria-label={`Compliance score ${score}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={6} />
        <circle
          cx={cx} cy={cy} r={radius} fill="none"
          stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fontWeight="700" fill={color}>
          {score}
        </text>
      </svg>

      {/* Tooltip breakdown */}
      {showTooltip && (
        <div className="absolute left-14 top-0 z-50 w-56 bg-gray-800 border border-gray-600 rounded-xl p-3 shadow-2xl text-xs space-y-1">
          <p className="font-bold text-gray-200 mb-1.5">Score Breakdown</p>
          <div className="flex justify-between"><span className="text-gray-400">Contract</span><span className="text-gray-200">{bd.contractPts}/30</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Due Diligence</span><span className="text-gray-200">{bd.ddPts}/25</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Enforcement</span><span className="text-gray-200">{bd.enforcementPts}/20</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Certifications</span><span className="text-gray-200">{bd.certPts}/15</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Performance</span><span className="text-gray-200">{bd.perfPts}/10</span></div>
          <div className="border-t border-gray-700 pt-1 mt-1 flex justify-between font-bold">
            <span className="text-gray-300">Total</span>
            <span className="text-yellow-400">{bd.total}/100</span>
          </div>
          <div className="flex justify-between font-bold">
            <span className="text-gray-300">Grade</span>
            <span style={{ color: gradeFromAvg(bd.total).color }}>{bd.grade}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Partner Detail Drawer
// ---------------------------------------------------------------------------

type DrawerTab = 'overview' | 'contracts' | 'due_diligence' | 'enforcement' | 'activity';

function PartnerDetailDrawer({
  partner,
  onClose,
  onToast,
}: {
  partner: Partner;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');
  const [rerunning, setRerunning] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const tabs: { key: DrawerTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'contracts', label: 'Contracts' },
    { key: 'due_diligence', label: 'Due Diligence' },
    { key: 'enforcement', label: 'Enforcement' },
    { key: 'activity', label: 'Activity Log' },
  ];

  const avg = overallScore(partner);
  const { grade, color } = gradeFromAvg(avg);
  const bd = scoreBreakdown(partner);

  // Placeholder contracts
  const contracts = [
    { name: 'Master Services Agreement', signed: '2025-06-01', expiry: '2027-06-01', status: 'Active' },
    { name: 'Data Processing Addendum', signed: '2025-06-01', expiry: '2027-06-01', status: 'Active' },
  ];

  // DD checklist — approved partners get all checked, flagged get partial
  const ddChecklist = DD_CHECKLIST_ITEMS.map((item, i) => ({
    item,
    completed: partner.dueDiligenceStatus === 'approved'
      ? true
      : partner.dueDiligenceStatus === 'flagged'
        ? i < 3
        : i < 5,
  }));

  // Enforcement
  const isFastFund = partner.name.toLowerCase().includes('fastfund');

  // Activity log
  const activityLog = [
    { date: '2026-03-28', event: 'Compliance score updated', detail: `Score set to ${partner.complianceScore}` },
    { date: '2026-03-15', event: 'Contract renewed', detail: 'Master Services Agreement extended' },
    { date: '2026-02-20', event: 'Due diligence review', detail: 'Annual review completed' },
    { date: '2026-01-10', event: 'Partner onboarded', detail: 'Initial registration and vetting' },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 bg-black/60"
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      >
        {/* Drawer panel */}
        <div className="absolute right-0 top-0 h-full w-full max-w-[640px] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-800 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-white">{partner.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PARTNER_TYPE_CONFIG[partner.type].badgeClass}`}>
                  {PARTNER_TYPE_CONFIG[partner.type].label}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DD_STATUS_CONFIG[partner.dueDiligenceStatus].badgeClass}`}>
                  {DD_STATUS_CONFIG[partner.dueDiligenceStatus].label}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-2xl font-bold transition-colors w-8 h-8 flex items-center justify-center"
            >
              &times;
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-800 flex-shrink-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-yellow-500 text-yellow-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* --- Overview --- */}
            {activeTab === 'overview' && (
              <>
                {/* Score ring with tooltip breakdown */}
                <div className="flex items-center gap-5">
                  <ComplianceGauge score={partner.complianceScore} partner={partner} />
                  <div>
                    <p className="text-sm font-semibold text-gray-200">Overall Grade: <span style={{ color }}>{grade}</span> ({avg}/100)</p>
                    <p className="text-xs text-gray-500 mt-0.5">Hover score ring for breakdown</p>
                  </div>
                </div>

                {/* Contact info */}
                <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 space-y-2 text-sm">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Contact Information</p>
                  {[
                    ['Contact', partner.contactName],
                    ['Email', partner.contactEmail],
                    ['Phone', partner.phone ?? 'N/A'],
                    ['Website', partner.website ?? 'N/A'],
                    ['Jurisdiction', partner.jurisdiction],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between">
                      <span className="text-gray-400">{l}</span>
                      <span className="text-gray-200">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Services */}
                <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Services</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(partner.services ?? ['General']).map((s) => (
                      <span key={s} className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>

                {/* Fee structure */}
                <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 space-y-2 text-sm">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Fee Structure</p>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Fee Type</span>
                    <span className="text-gray-200">{partner.feeStructure ?? 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Fees Paid</span>
                    <span className="text-yellow-400 font-semibold">{formatCurrency(partner.totalFeesPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Referral Code</span>
                    <span className="text-gray-200 font-mono text-xs">{partner.referralCode ?? 'N/A'}</span>
                  </div>
                </div>
              </>
            )}

            {/* --- Contracts --- */}
            {activeTab === 'contracts' && (
              <div className="space-y-3">
                {contracts.map((c, i) => (
                  <div key={i} className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm space-y-2">
                    <p className="font-semibold text-gray-200">{c.name}</p>
                    <div className="flex justify-between"><span className="text-gray-400">Signed</span><span className="text-gray-200">{formatDate(c.signed)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Expiry</span><span className="text-gray-200">{formatDate(c.expiry)}</span></div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Status</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-green-900 text-green-300 border-green-700">{c.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* --- Due Diligence --- */}
            {activeTab === 'due_diligence' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">7-Item Checklist</p>
                {ddChecklist.map((item) => (
                  <div key={item.item} className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-gray-950 text-sm">
                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                      item.completed ? 'bg-green-600 border-green-500' : 'bg-gray-800 border-gray-600'
                    }`}>
                      {item.completed && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className={item.completed ? 'text-gray-200' : 'text-gray-500'}>{item.item}</span>
                    <span className={`ml-auto text-xs font-semibold ${item.completed ? 'text-green-400' : 'text-gray-600'}`}>
                      {item.completed ? 'Complete' : 'Pending'}
                    </span>
                  </div>
                ))}
                <div className="mt-3 text-xs text-gray-500">
                  {ddChecklist.filter(i => i.completed).length}/{ddChecklist.length} items completed
                </div>
              </div>
            )}

            {/* --- Enforcement History --- */}
            {activeTab === 'enforcement' && (
              <div className="space-y-4">
                {isFastFund ? (
                  <div className="rounded-xl border border-red-700 bg-red-950 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-red-900 text-red-300 border-red-700">High Severity</span>
                    </div>
                    <p className="text-sm font-semibold text-red-200">FTC Consent Order 2022</p>
                    <p className="text-xs text-red-300">Deceptive marketing practices — required to cease misleading advertising and pay $1.2M restitution.</p>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Agency: FTC</span>
                      <span>Date: Aug 15, 2022</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-green-800 bg-green-950 p-4">
                    <p className="text-sm font-semibold text-green-300">Clear</p>
                    <p className="text-xs text-green-400 mt-1">No enforcement actions found in federal or state databases.</p>
                  </div>
                )}
                <button
                  onClick={() => {
                    setRerunning(true);
                    setTimeout(() => {
                      setRerunning(false);
                      onToast('Enforcement check completed');
                    }, 1500);
                  }}
                  disabled={rerunning}
                  className="w-full px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors border border-gray-700 disabled:opacity-50"
                >
                  {rerunning ? 'Running Check...' : 'Re-run Check'}
                </button>
              </div>
            )}

            {/* --- Activity Log --- */}
            {activeTab === 'activity' && (
              <div className="space-y-0">
                {activityLog.map((entry, i) => (
                  <div key={i} className="flex gap-3 pb-4 relative">
                    {/* Timeline line */}
                    {i < activityLog.length - 1 && (
                      <div className="absolute left-[7px] top-5 bottom-0 w-px bg-gray-700" />
                    )}
                    <div className="w-4 h-4 rounded-full bg-yellow-500 border-2 border-yellow-400 flex-shrink-0 mt-0.5 relative z-10" />
                    <div>
                      <p className="text-xs text-gray-500">{formatDate(entry.date)}</p>
                      <p className="text-sm font-semibold text-gray-200">{entry.event}</p>
                      <p className="text-xs text-gray-400">{entry.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Add Partner Wizard (3-step)
// ---------------------------------------------------------------------------

interface WizardFormData {
  name: string;
  type: PartnerType;
  contactName: string;
  email: string;
  jurisdiction: string;
  services: string[];
  phone: string;
  website: string;
  // Step 2
  enforcementResult: 'clear' | 'issues' | null;
  riskTier: string;
  certifications: string[];
  // Step 3
  feeStructure: string;
  referralCode: string;
  reviewCycle: string;
}

function AddPartnerWizard({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (partner: Partner) => void;
}) {
  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState<WizardFormData>({
    name: '',
    type: 'broker',
    contactName: '',
    email: '',
    jurisdiction: '',
    services: [],
    phone: '',
    website: '',
    enforcementResult: null,
    riskTier: 'Medium',
    certifications: [],
    feeStructure: 'Flat fee',
    referralCode: generateReferralCode(),
    reviewCycle: 'Annual',
  });

  const updateField = <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleService = (svc: string) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(svc)
        ? prev.services.filter((s) => s !== svc)
        : [...prev.services, svc],
    }));
  };

  const toggleCert = (cert: string) => {
    setForm((prev) => ({
      ...prev,
      certifications: prev.certifications.includes(cert)
        ? prev.certifications.filter((c) => c !== cert)
        : [...prev.certifications, cert],
    }));
  };

  const runEnforcementCheck = () => {
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      updateField('enforcementResult', 'clear');
    }, 1500);
  };

  const canProceedStep1 = form.name.trim() && form.contactName.trim() && form.email.trim() && form.jurisdiction.trim();
  const canProceedStep2 = form.enforcementResult !== null;

  const handleSubmit = () => {
    const newPartner: Partner = {
      id: `prt_${Date.now()}`,
      name: form.name,
      type: form.type,
      complianceScore: 70,
      complaintsScore: 80,
      dueDiligenceScore: 65,
      contractScore: 75,
      dueDiligenceStatus: 'pending',
      nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      contactName: form.contactName,
      contactEmail: form.email,
      jurisdiction: form.jurisdiction,
      activeContracts: 0,
      totalFeesPaid: 0,
      phone: form.phone,
      website: form.website,
      services: form.services,
      feeStructure: form.feeStructure,
      referralCode: form.referralCode,
      riskTier: form.riskTier,
      certifications: form.certifications,
      reviewCycle: form.reviewCycle,
    };
    onSubmit(newPartner);
  };

  const stepLabels = ['Details', 'Vetting', 'Terms'];

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500';
  const labelClass = 'block text-xs text-gray-400 mb-1 uppercase tracking-wide';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Add New Partner</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl font-bold transition-colors">&times;</button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {stepLabels.map((label, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  isDone ? 'bg-green-600 text-white' : isActive ? 'bg-yellow-500 text-gray-950' : 'bg-gray-700 text-gray-400'
                }`}>
                  {isDone ? (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : stepNum}
                </div>
                <span className={`text-xs font-semibold ${isActive ? 'text-yellow-400' : 'text-gray-500'}`}>{label}</span>
                {i < 2 && <div className="flex-1 h-px bg-gray-700" />}
              </div>
            );
          })}
        </div>

        {/* Step 1: Basic info */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Partner Name *</label>
              <input type="text" placeholder="Acme Capital Brokers" className={inputClass} value={form.name} onChange={(e) => updateField('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Type</label>
                <select className={inputClass} value={form.type} onChange={(e) => updateField('type', e.target.value as PartnerType)}>
                  {PARTNER_TYPES.map((t) => <option key={t} value={t}>{PARTNER_TYPE_CONFIG[t].label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>State / Jurisdiction *</label>
                <input type="text" placeholder="TX" className={inputClass} value={form.jurisdiction} onChange={(e) => updateField('jurisdiction', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Contact Name *</label>
                <input type="text" placeholder="Jane Smith" className={inputClass} value={form.contactName} onChange={(e) => updateField('contactName', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input type="text" placeholder="(555) 555-0100" className={inputClass} value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Email *</label>
              <input type="email" placeholder="contact@partner.com" className={inputClass} value={form.email} onChange={(e) => updateField('email', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input type="text" placeholder="www.partner.com" className={inputClass} value={form.website} onChange={(e) => updateField('website', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Services (multi-select)</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ALL_SERVICES.map((svc) => (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => toggleService(svc)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      form.services.includes(svc)
                        ? 'bg-yellow-900 text-yellow-300 border-yellow-700'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {svc}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Enforcement / Vetting */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Enforcement check */}
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Enforcement Check</p>
              {form.enforcementResult === null ? (
                <button
                  onClick={runEnforcementCheck}
                  disabled={checking}
                  className="w-full px-4 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {checking ? 'Running Check...' : 'Run Enforcement Check'}
                </button>
              ) : (
                <div className={`rounded-lg p-3 border ${form.enforcementResult === 'clear' ? 'bg-green-950 border-green-700' : 'bg-red-950 border-red-700'}`}>
                  <p className={`text-sm font-semibold ${form.enforcementResult === 'clear' ? 'text-green-300' : 'text-red-300'}`}>
                    {form.enforcementResult === 'clear' ? 'Clear — No issues found' : 'Issues Found'}
                  </p>
                  <button
                    onClick={() => updateField('enforcementResult', null)}
                    className="text-xs text-gray-400 hover:text-gray-200 mt-1 underline"
                  >
                    Re-run
                  </button>
                </div>
              )}
            </div>

            {/* Risk tier */}
            <div>
              <label className={labelClass}>Risk Tier</label>
              <select className={inputClass} value={form.riskTier} onChange={(e) => updateField('riskTier', e.target.value)}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            {/* Certifications */}
            <div>
              <label className={labelClass}>Certifications</label>
              <div className="space-y-1.5 mt-1">
                {ALL_CERTIFICATIONS.map((cert) => (
                  <label key={cert} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.certifications.includes(cert)}
                      onChange={() => toggleCert(cert)}
                      className="rounded border-gray-600 bg-gray-800 text-yellow-500 focus:ring-yellow-500"
                    />
                    {cert}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Fee structure / Terms */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Fee Structure</label>
              <select className={inputClass} value={form.feeStructure} onChange={(e) => updateField('feeStructure', e.target.value)}>
                <option value="Flat fee">Flat Fee</option>
                <option value="% of funding">% of Funding</option>
                <option value="Monthly retainer">Monthly Retainer</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Referral Code (auto-generated)</label>
              <div className="flex gap-2">
                <input type="text" className={inputClass} value={form.referralCode} readOnly />
                <button
                  onClick={() => updateField('referralCode', generateReferralCode())}
                  className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 border border-gray-700 whitespace-nowrap"
                >
                  Regenerate
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Review Cycle</label>
              <select className={inputClass} value={form.reviewCycle} onChange={(e) => updateField('reviewCycle', e.target.value)}>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Semi-annual">Semi-annual</option>
                <option value="Annual">Annual</option>
              </select>
            </div>

            {/* Review summary */}
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Review Summary</p>
              <div className="flex justify-between"><span className="text-gray-400">Name</span><span className="text-gray-200">{form.name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Type</span><span className="text-gray-200">{PARTNER_TYPE_CONFIG[form.type].label}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Contact</span><span className="text-gray-200">{form.contactName || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Risk Tier</span><span className="text-gray-200">{form.riskTier}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Fee Structure</span><span className="text-gray-200">{form.feeStructure}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Review Cycle</span><span className="text-gray-200">{form.reviewCycle}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Enforcement</span>
                <span className={form.enforcementResult === 'clear' ? 'text-green-400' : 'text-red-400'}>
                  {form.enforcementResult === 'clear' ? 'Clear' : 'Issues'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex gap-3 mt-6">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors"
            >
              Add Partner
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>(PLACEHOLDER_PARTNERS);
  const [subprocessors] = useState<Subprocessor[]>(PLACEHOLDER_SUBPROCESSORS);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'partners' | 'subprocessors'>('partners');
  const [typeFilter, setTypeFilter] = useState<PartnerType | ''>('');
  const [ddFilter, setDdFilter] = useState<DueDiligenceStatus | ''>('');
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState('cl_all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<{ partners: Partner[] }>('/partners');
        if (res.success && res.data?.partners) setPartners(res.data.partners);
      } catch { /* placeholder */ }
      finally { setLoading(false); }
    })();
  }, []);

  const displayed = partners.filter((p) => {
    const matchType = !typeFilter || p.type === typeFilter;
    const matchDd = !ddFilter || p.dueDiligenceStatus === ddFilter;
    return matchType && matchDd;
  });

  const totalFeesPaid = partners.reduce((s, p) => s + p.totalFeesPaid, 0);
  const flaggedCount = partners.filter((p) => p.dueDiligenceStatus === 'flagged').length;
  const avgCompliance = Math.round(partners.reduce((s, p) => s + p.complianceScore, 0) / (partners.length || 1));

  const showToast = (msg: string) => setToastMsg(msg);

  const handleAddPartner = (newPartner: Partner) => {
    setPartners((prev) => [...prev, newPartner]);
    setShowAddWizard(false);
    showToast(`Partner "${newPartner.name}" added successfully`);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Client selector */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Client</label>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
        >
          {CLIENTS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Partner & Vendor Governance</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {partners.length} partners registered
            {flaggedCount > 0 && (
              <span className="ml-2 text-red-400 font-semibold">{flaggedCount} flagged</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAddWizard(true)}
          className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors"
        >
          + Add Partner
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Partners',    value: partners.length,             color: 'text-gray-100' },
          { label: 'Avg Compliance',    value: `${avgCompliance}%`,         color: avgCompliance >= 80 ? 'text-green-400' : avgCompliance >= 60 ? 'text-yellow-400' : 'text-red-400' },
          { label: 'Flagged Reviews',   value: flaggedCount,                color: flaggedCount > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Total Fees Paid',   value: formatCurrency(totalFeesPaid), color: 'text-yellow-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {(['partners', 'subprocessors'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px capitalize ${
              activeTab === tab
                ? 'border-yellow-500 text-yellow-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab === 'partners' ? 'Partner Registry' : 'Subprocessor Registry'}
          </button>
        ))}
      </div>

      {/* Partners tab */}
      {activeTab === 'partners' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as PartnerType | '')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
            >
              <option value="">All Types</option>
              {PARTNER_TYPES.map((t) => (
                <option key={t} value={t}>{PARTNER_TYPE_CONFIG[t].label}</option>
              ))}
            </select>

            <select
              value={ddFilter}
              onChange={(e) => setDdFilter(e.target.value as DueDiligenceStatus | '')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
            >
              <option value="">All DD Statuses</option>
              {DD_STATUSES.map((s) => (
                <option key={s} value={s}>{DD_STATUS_CONFIG[s].label}</option>
              ))}
            </select>

            {(typeFilter || ddFilter) && (
              <button
                onClick={() => { setTypeFilter(''); setDdFilter(''); }}
                className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Partner list */}
          {loading ? (
            <p className="text-gray-500 text-sm py-8 text-center">Loading...</p>
          ) : (
            <div className="space-y-3">
              {displayed.map((partner) => {
                const avg = overallScore(partner);
                const { grade, color } = gradeFromAvg(avg);
                const expiryBadge = reviewExpiryBadge(partner.nextReviewDate);

                return (
                  <div
                    key={partner.id}
                    className={`rounded-xl border transition-colors ${
                      partner.dueDiligenceStatus === 'flagged'
                        ? 'border-red-700 bg-red-950'
                        : 'border-gray-800 bg-gray-900'
                    }`}
                  >
                    {/* Row header */}
                    <div
                      className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-800/30 transition-colors rounded-xl"
                      onClick={() => setSelectedPartner(partner)}
                    >
                      {/* Compliance gauge with tooltip */}
                      <ComplianceGauge score={partner.complianceScore} partner={partner} />

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-gray-100 text-sm">{partner.name}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PARTNER_TYPE_CONFIG[partner.type].badgeClass}`}>
                            {PARTNER_TYPE_CONFIG[partner.type].label}
                          </span>
                          {partner.type === 'credit_union' && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-teal-800 text-teal-200 border-teal-600">
                              CU
                            </span>
                          )}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DD_STATUS_CONFIG[partner.dueDiligenceStatus].badgeClass}`}>
                            {DD_STATUS_CONFIG[partner.dueDiligenceStatus].label}
                          </span>
                          {expiryBadge && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${expiryBadge.badgeClass}`}>
                              {expiryBadge.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                          <span>{partner.contactName}</span>
                          <span>{partner.jurisdiction}</span>
                          <span>{partner.activeContracts} contract{partner.activeContracts !== 1 ? 's' : ''}</span>
                          {partner.type === 'credit_union' && partner.membersReferred != null && (
                            <span className="text-cyan-400 font-semibold">Members Referred: {partner.membersReferred.toLocaleString()}</span>
                          )}
                          <span>Review: {formatDate(partner.nextReviewDate)}</span>
                        </div>
                      </div>

                      {/* Overall grade */}
                      <div className="flex flex-col items-center flex-shrink-0 w-10">
                        <span className="text-xl font-black" style={{ color }}>{grade}</span>
                        <span className="text-xs text-gray-500">{avg}</span>
                      </div>

                      {/* Arrow to open drawer */}
                      <span className="text-gray-500 hover:text-yellow-400 transition-colors text-lg">
                        &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}

              {displayed.length === 0 && (
                <p className="text-center text-gray-500 py-8 text-sm">No partners match the current filters.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Subprocessors tab */}
      {activeTab === 'subprocessors' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-semibold">Name</th>
                  <th className="text-left px-4 py-3 font-semibold">Service</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Data Categories</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Certifications</th>
                  <th className="text-left px-4 py-3 font-semibold">Jurisdiction</th>
                  <th className="text-left px-4 py-3 font-semibold">Last Audit</th>
                  <th className="text-left px-4 py-3 font-semibold">Cert Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {subprocessors.map((sp) => {
                  const auditStatus = certAuditStatus(sp.lastAuditDate);
                  return (
                    <tr key={sp.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-100">{sp.name}</td>
                      <td className="px-4 py-3 text-gray-300 text-xs">{sp.serviceType}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {sp.dataCategories.map((dc) => (
                            <span key={dc} className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                              {dc}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {sp.certifications.map((c) => (
                            <span key={c} className="text-xs bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded">
                              {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{sp.jurisdiction}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(sp.lastAuditDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${auditStatus.badgeClass}`}>
                          {auditStatus.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SP_STATUS_CONFIG[sp.status].badgeClass}`}>
                          {SP_STATUS_CONFIG[sp.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => showToast(`Audit scheduled for ${sp.name}`)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors whitespace-nowrap"
                        >
                          Schedule Audit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Partner Detail Drawer */}
      {selectedPartner && (
        <PartnerDetailDrawer
          partner={selectedPartner}
          onClose={() => setSelectedPartner(null)}
          onToast={showToast}
        />
      )}

      {/* Add Partner Wizard */}
      {showAddWizard && (
        <AddPartnerWizard
          onClose={() => setShowAddWizard(false)}
          onSubmit={handleAddPartner}
        />
      )}

      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  );
}
