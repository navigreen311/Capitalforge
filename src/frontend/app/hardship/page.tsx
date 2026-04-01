'use client';

// ============================================================
// /hardship — Hardship & Workout Center
//
// Sections:
//   1. Client selector (top bar)
//   2. Stats (open cases, avg resolution days, settlement rate)
//   3. Open cases table with severity badges + row expand
//   4. Right slide-over drawer (case detail on row click)
//   5. Payment plan details panel (select a case)
//   6. Settlement offers with status
//   7. Card closure sequence view
//   8. Counselor referral links (4 cards)
//   9. New Case modal
//  10. Hardship Letter Generator modal
// ============================================================

import { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CaseSeverity = 'minor' | 'serious' | 'critical';
type CaseStatus   = 'open' | 'in_review' | 'negotiating' | 'resolved' | 'closed';
type SettlementStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'countered';
type ClosureStage = 'active' | 'freeze_requested' | 'in_closure' | 'closed' | 'charged_off';

interface HardshipCase {
  id: string;
  clientName: string;
  businessName: string;
  openedAt: string;
  severity: CaseSeverity;
  status: CaseStatus;
  assignedAdvisor: string;
  cardsAffected: number;
  totalDebt: number;
  missedPayments: number;
  resolutionDays?: number;
  notes?: string;
  reason?: string;
}

interface CardDetail {
  name: string;
  issuer: string;
  balance: number;
  apr: number;
  missedPayments: number;
  negotiationStatus: string;
}

interface PaymentPlanDetail {
  caseId: string;
  cardName: string;
  issuer: string;
  originalBalance: number;
  reducedPayment: number;
  originalMinPayment: number;
  rateReduction?: number;
  feeWaiver: boolean;
  planStartDate: string;
  planEndDate: string;
  monthsRemaining: number;
}

interface SettlementOffer {
  id: string;
  caseId: string;
  cardName: string;
  issuer: string;
  originalBalance: number;
  offerAmount: number;
  offerPct: number;
  expiresAt: string;
  status: SettlementStatus;
  submittedAt: string;
}

interface ClosureCard {
  id: string;
  caseId: string;
  cardName: string;
  issuer: string;
  balance: number;
  stage: ClosureStage;
  requestedAt?: string;
  closedAt?: string;
}

interface CounselorRef {
  id: string;
  name: string;
  organization: string;
  phone: string;
  website: string;
  specialty: string;
  type: string;
  cost: string;
}

interface TimelineEvent {
  date: string;
  title: string;
  description: string;
}

interface PlaceholderClient {
  id: string;
  name: string;
  businessName: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_CLIENTS: PlaceholderClient[] = [
  { id: 'cl_001', name: 'James Okafor', businessName: 'Crestline Medical LLC' },
  { id: 'cl_002', name: 'Lisa Park', businessName: 'Summit Retail LLC' },
  { id: 'cl_003', name: 'Troy Bennett', businessName: 'Horizon Freight Inc.' },
  { id: 'cl_004', name: 'Angela Reyes', businessName: 'Coastal Events Co.' },
  { id: 'cl_005', name: 'David Kim', businessName: 'NovaTech Solutions' },
];

const PLACEHOLDER_CASES: HardshipCase[] = [
  {
    id: 'hc_001',
    clientName: 'James Okafor',
    businessName: 'Crestline Medical LLC',
    openedAt: '2026-03-01T10:00:00Z',
    severity: 'critical',
    status: 'negotiating',
    assignedAdvisor: 'Sarah Chen',
    cardsAffected: 4,
    totalDebt: 87_400,
    missedPayments: 3,
    notes: 'Client experiencing cash flow crisis post-contract loss.',
    reason: 'Business Downturn',
  },
  {
    id: 'hc_002',
    clientName: 'Lisa Park',
    businessName: 'Summit Retail LLC',
    openedAt: '2026-03-10T09:30:00Z',
    severity: 'serious',
    status: 'in_review',
    assignedAdvisor: 'Marcus Williams',
    cardsAffected: 2,
    totalDebt: 34_200,
    missedPayments: 1,
    notes: 'Seeking rate reduction and fee waiver from issuers.',
    reason: 'Job Loss',
  },
  {
    id: 'hc_003',
    clientName: 'Troy Bennett',
    businessName: 'Horizon Freight Inc.',
    openedAt: '2026-02-20T14:00:00Z',
    severity: 'serious',
    status: 'open',
    assignedAdvisor: 'James Okafor',
    cardsAffected: 3,
    totalDebt: 52_000,
    missedPayments: 2,
    reason: 'Medical',
  },
  {
    id: 'hc_004',
    clientName: 'Angela Reyes',
    businessName: 'Coastal Events Co.',
    openedAt: '2026-03-15T11:00:00Z',
    severity: 'minor',
    status: 'open',
    assignedAdvisor: 'Sarah Chen',
    cardsAffected: 1,
    totalDebt: 9_800,
    missedPayments: 0,
    notes: 'Proactive hardship inquiry — seasonal revenue dip.',
    reason: 'Other',
  },
  {
    id: 'hc_005',
    clientName: 'David Kim',
    businessName: 'NovaTech Solutions',
    openedAt: '2026-01-15T08:00:00Z',
    severity: 'critical',
    status: 'resolved',
    assignedAdvisor: 'Marcus Williams',
    cardsAffected: 5,
    totalDebt: 112_000,
    missedPayments: 4,
    resolutionDays: 38,
    reason: 'Job Loss',
  },
  {
    id: 'hc_006',
    clientName: 'Maria Santos',
    businessName: 'Blue Ridge Consulting',
    openedAt: '2026-02-05T10:00:00Z',
    severity: 'minor',
    status: 'resolved',
    assignedAdvisor: 'James Okafor',
    cardsAffected: 1,
    totalDebt: 7_200,
    missedPayments: 1,
    resolutionDays: 14,
    reason: 'Medical',
  },
];

const CARD_DETAILS: Record<string, CardDetail[]> = {
  hc_001: [
    { name: 'Ink Business Cash', issuer: 'Chase', balance: 28_000, apr: 24.99, missedPayments: 3, negotiationStatus: 'Rate reduction approved' },
    { name: 'Business Gold Card', issuer: 'Amex', balance: 22_000, apr: 21.24, missedPayments: 2, negotiationStatus: 'In negotiation' },
    { name: 'Venture X Business', issuer: 'Capital One', balance: 19_500, apr: 26.99, missedPayments: 3, negotiationStatus: 'Settlement pending' },
    { name: 'Business Platinum', issuer: 'Amex', balance: 17_900, apr: 22.49, missedPayments: 1, negotiationStatus: 'Counter-offer sent' },
  ],
  hc_002: [
    { name: 'Spark Cash Plus', issuer: 'Capital One', balance: 18_000, apr: 25.49, missedPayments: 1, negotiationStatus: 'Under review' },
    { name: 'Blue Business Plus', issuer: 'Amex', balance: 16_200, apr: 19.99, missedPayments: 0, negotiationStatus: 'Pending contact' },
  ],
  hc_003: [
    { name: 'Ink Business Unlimited', issuer: 'Chase', balance: 20_000, apr: 22.99, missedPayments: 2, negotiationStatus: 'Awaiting response' },
    { name: 'Brex 30', issuer: 'Brex', balance: 17_000, apr: 0, missedPayments: 2, negotiationStatus: 'In negotiation' },
    { name: 'Divvy Business', issuer: 'Bill', balance: 15_000, apr: 18.49, missedPayments: 1, negotiationStatus: 'Pending review' },
  ],
  hc_004: [
    { name: 'Capital One Spark Miles', issuer: 'Capital One', balance: 9_800, apr: 23.99, missedPayments: 0, negotiationStatus: 'Proactive inquiry' },
  ],
  hc_005: [
    { name: 'Ink Business Preferred', issuer: 'Chase', balance: 31_000, apr: 21.24, missedPayments: 4, negotiationStatus: 'Settled' },
    { name: 'Business Gold Card', issuer: 'Amex', balance: 25_000, apr: 20.99, missedPayments: 3, negotiationStatus: 'Payment plan active' },
    { name: 'Spark Cash Select', issuer: 'Capital One', balance: 22_000, apr: 26.99, missedPayments: 4, negotiationStatus: 'Settled' },
    { name: 'Brex 30', issuer: 'Brex', balance: 19_000, apr: 0, missedPayments: 2, negotiationStatus: 'Resolved' },
    { name: 'Ramp Business', issuer: 'Ramp', balance: 15_000, apr: 0, missedPayments: 1, negotiationStatus: 'Resolved' },
  ],
  hc_006: [
    { name: 'Blue Business Cash', issuer: 'Amex', balance: 7_200, apr: 18.49, missedPayments: 1, negotiationStatus: 'Fee waiver granted' },
  ],
};

const CASE_TIMELINES: Record<string, TimelineEvent[]> = {
  hc_001: [
    { date: '2026-03-01', title: 'Case Opened', description: 'Hardship case created — client reported cash flow crisis after contract loss.' },
    { date: '2026-03-10', title: 'Issuer Contact Initiated', description: 'Chase and Amex contacted for rate reduction and fee waiver options.' },
    { date: '2026-03-25', title: 'Settlement Offer Submitted', description: 'Capital One settlement offer submitted at 60% of balance for Venture X.' },
  ],
  hc_002: [
    { date: '2026-03-10', title: 'Case Opened', description: 'Client seeking proactive hardship relief due to revenue decline.' },
    { date: '2026-03-15', title: 'Documents Submitted', description: 'Financial statements and hardship letter sent to Capital One.' },
    { date: '2026-03-20', title: 'Review In Progress', description: 'Capital One acknowledged receipt, review estimated 10 business days.' },
  ],
  hc_003: [
    { date: '2026-02-20', title: 'Case Opened', description: 'Medical emergency causing inability to manage business payments.' },
    { date: '2026-03-01', title: 'Hardship Letters Sent', description: 'Letters sent to all 3 issuers requesting forbearance.' },
    { date: '2026-03-15', title: 'Awaiting Responses', description: 'Chase responded with initial questions, Brex and Bill pending.' },
  ],
};

const PLACEHOLDER_PLANS: PaymentPlanDetail[] = [
  {
    caseId: 'hc_001',
    cardName: 'Ink Business Cash',
    issuer: 'Chase',
    originalBalance: 28_000,
    reducedPayment: 420,
    originalMinPayment: 560,
    rateReduction: 8,
    feeWaiver: true,
    planStartDate: '2026-03-10',
    planEndDate: '2027-03-10',
    monthsRemaining: 11,
  },
  {
    caseId: 'hc_001',
    cardName: 'Business Gold Card',
    issuer: 'Amex',
    originalBalance: 22_000,
    reducedPayment: 300,
    originalMinPayment: 440,
    rateReduction: 12,
    feeWaiver: true,
    planStartDate: '2026-03-12',
    planEndDate: '2027-03-12',
    monthsRemaining: 11,
  },
  {
    caseId: 'hc_002',
    cardName: 'Spark Cash Plus',
    issuer: 'Capital One',
    originalBalance: 18_000,
    reducedPayment: 280,
    originalMinPayment: 360,
    rateReduction: 6,
    feeWaiver: false,
    planStartDate: '2026-03-18',
    planEndDate: '2027-03-18',
    monthsRemaining: 11,
  },
];

const PLACEHOLDER_SETTLEMENTS: SettlementOffer[] = [
  {
    id: 'so_001',
    caseId: 'hc_001',
    cardName: 'Venture X Business',
    issuer: 'Capital One',
    originalBalance: 19_500,
    offerAmount: 11_700,
    offerPct: 60,
    expiresAt: '2026-04-15T00:00:00Z',
    status: 'pending',
    submittedAt: '2026-03-25T10:00:00Z',
  },
  {
    id: 'so_002',
    caseId: 'hc_001',
    cardName: 'Business Platinum',
    issuer: 'Amex',
    originalBalance: 17_900,
    offerAmount: 10_025,
    offerPct: 56,
    expiresAt: '2026-04-10T00:00:00Z',
    status: 'countered',
    submittedAt: '2026-03-20T09:00:00Z',
  },
  {
    id: 'so_003',
    caseId: 'hc_005',
    cardName: 'Ink Business Preferred',
    issuer: 'Chase',
    originalBalance: 31_000,
    offerAmount: 15_500,
    offerPct: 50,
    expiresAt: '2026-03-01T00:00:00Z',
    status: 'accepted',
    submittedAt: '2026-02-10T08:00:00Z',
  },
];

const PLACEHOLDER_CLOSURES: ClosureCard[] = [
  { id: 'cc_001', caseId: 'hc_001', cardName: 'Ink Business Cash', issuer: 'Chase', balance: 28_000, stage: 'freeze_requested', requestedAt: '2026-03-05' },
  { id: 'cc_002', caseId: 'hc_001', cardName: 'Business Gold Card', issuer: 'Amex', balance: 22_000, stage: 'in_closure', requestedAt: '2026-03-08' },
  { id: 'cc_003', caseId: 'hc_001', cardName: 'Venture X Business', issuer: 'Capital One', balance: 19_500, stage: 'active' },
  { id: 'cc_004', caseId: 'hc_001', cardName: 'Business Platinum', issuer: 'Amex', balance: 17_900, stage: 'active' },
];

const COUNSELOR_REFS: CounselorRef[] = [
  {
    id: 'cr_001',
    name: 'National Foundation for Credit Counseling',
    organization: 'NFCC',
    phone: '1-800-388-2227',
    website: 'https://www.nfcc.org',
    specialty: 'Nonprofit credit counseling and debt management plans. Provides personalized financial reviews and budget planning.',
    type: 'Credit Counseling',
    cost: 'Free',
  },
  {
    id: 'cr_002',
    name: 'American Consumer Credit Counseling',
    organization: 'ACCC',
    phone: '800-769-3571',
    website: 'https://www.consumercredit.com',
    specialty: 'Debt management programs, credit counseling, financial education, and housing counseling services.',
    type: 'Credit Counseling',
    cost: 'Free / Low-cost',
  },
  {
    id: 'cr_003',
    name: 'CFPB Financial Counselor Finder',
    organization: 'Consumer Financial Protection Bureau',
    phone: '1-855-411-2372',
    website: 'https://www.consumerfinance.gov/find-a-housing-counselor/',
    specialty: 'Government-maintained directory of HUD-approved financial and housing counselors in your area.',
    type: 'Government Resource',
    cost: 'Free',
  },
  {
    id: 'cr_004',
    name: 'Business Hardship Workout Specialist',
    organization: 'CapitalForge Internal',
    phone: 'Internal Referral',
    website: '#',
    specialty: 'In-house specialist for complex multi-card business hardship cases. Negotiates directly with issuers on behalf of clients.',
    type: 'Internal Referral',
    cost: 'Included',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function generateHardshipLetter(businessName: string, issuer: string, cardName: string, balance: number): string {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `${today}

${issuer}
Hardship Department
P.O. Box 0000
City, ST 00000

Re: Request for Payment Arrangement / Rate Reduction / Forbearance
Account: ${cardName}
Current Balance: ${formatCurrency(balance)}

To Whom It May Concern,

I am writing on behalf of ${businessName} to formally request consideration for a hardship accommodation on the above-referenced account.

Due to unforeseen financial difficulties, ${businessName} has experienced a significant reduction in revenue that has impacted our ability to meet the current minimum payment obligations. We are committed to honoring our financial responsibilities and are seeking a mutually beneficial arrangement that will allow us to continue making payments while we work toward financial recovery.

We respectfully request consideration for one or more of the following accommodations:

1. Temporary reduction of the annual percentage rate (APR) on this account
2. A modified payment plan with reduced monthly minimums
3. Waiver of late fees and/or over-limit fees during the hardship period
4. A forbearance period to allow the business to stabilize cash flow

${businessName} has been a responsible account holder and we value our relationship with ${issuer}. We believe that with temporary relief, we can return to regular payment terms within 6-12 months.

Enclosed please find supporting documentation including recent financial statements, a business recovery plan, and proof of the hardship circumstances.

We are available to discuss this matter at your earliest convenience. Thank you for your consideration and understanding during this challenging time.

Sincerely,

_________________________
Authorized Representative
${businessName}

Enclosures:
- Business Financial Statements (last 3 months)
- Hardship Documentation
- Proposed Payment Schedule`;
}

const SEVERITY_STYLES: Record<CaseSeverity, { bg: string; border: string; text: string; label: string }> = {
  minor:    { bg: 'bg-blue-900/40',   border: 'border-blue-700',   text: 'text-blue-300',   label: 'Minor'    },
  serious:  { bg: 'bg-yellow-900/40', border: 'border-yellow-700', text: 'text-yellow-300', label: 'Serious'  },
  critical: { bg: 'bg-red-900/40',    border: 'border-red-700',    text: 'text-red-300',    label: 'Critical' },
};

const CASE_STATUS_STYLES: Record<CaseStatus, { bg: string; text: string; label: string }> = {
  open:        { bg: 'bg-gray-800',    text: 'text-gray-300',   label: 'Open'        },
  in_review:   { bg: 'bg-blue-900/60', text: 'text-blue-300',   label: 'In Review'   },
  negotiating: { bg: 'bg-yellow-900/60', text: 'text-yellow-300', label: 'Negotiating' },
  resolved:    { bg: 'bg-green-900/60', text: 'text-green-300',  label: 'Resolved'    },
  closed:      { bg: 'bg-gray-900',    text: 'text-gray-500',   label: 'Closed'      },
};

const SETTLEMENT_STYLES: Record<SettlementStatus, { bg: string; border: string; text: string; label: string }> = {
  pending:   { bg: 'bg-yellow-900/40', border: 'border-yellow-700', text: 'text-yellow-300', label: 'Pending'   },
  accepted:  { bg: 'bg-green-900/40',  border: 'border-green-700',  text: 'text-green-300',  label: 'Accepted'  },
  declined:  { bg: 'bg-red-900/40',    border: 'border-red-700',    text: 'text-red-300',    label: 'Declined'  },
  expired:   { bg: 'bg-gray-800',      border: 'border-gray-700',   text: 'text-gray-400',   label: 'Expired'   },
  countered: { bg: 'bg-purple-900/40', border: 'border-purple-700', text: 'text-purple-300', label: 'Countered' },
};

const CLOSURE_STAGE_STYLES: Record<ClosureStage, { dot: string; text: string; label: string }> = {
  active:            { dot: 'bg-green-500',  text: 'text-green-400',  label: 'Active'           },
  freeze_requested:  { dot: 'bg-yellow-400', text: 'text-yellow-400', label: 'Freeze Requested' },
  in_closure:        { dot: 'bg-orange-400', text: 'text-orange-400', label: 'In Closure'       },
  closed:            { dot: 'bg-gray-500',   text: 'text-gray-400',   label: 'Closed'           },
  charged_off:       { dot: 'bg-red-500',    text: 'text-red-400',    label: 'Charged Off'      },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HardshipPage() {
  const [cases, setCases]       = useState<HardshipCase[]>(PLACEHOLDER_CASES);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plans' | 'settlements' | 'closures'>('plans');

  // Feature 1: Row expand
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());

  // Feature 2: Slide-over drawer
  const [drawerCaseId, setDrawerCaseId] = useState<string | null>(null);

  // Feature 4: New Case modal
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [newCaseClient, setNewCaseClient] = useState('');
  const [newCaseSeverity, setNewCaseSeverity] = useState<CaseSeverity>('serious');
  const [newCaseDebt, setNewCaseDebt] = useState('');
  const [newCaseReason, setNewCaseReason] = useState('Job Loss');
  const [newCaseNotes, setNewCaseNotes] = useState('');

  // Feature 5: Letter generator modal
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [letterIssuer, setLetterIssuer] = useState('');
  const [letterCardName, setLetterCardName] = useState('');
  const [letterBalance, setLetterBalance] = useState('');
  const [letterBusiness, setLetterBusiness] = useState('');
  const [generatedLetter, setGeneratedLetter] = useState('');

  // Feature 6: Client selector
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');

  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Future: fetch from API
  }, []);

  // Close drawer on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setDrawerCaseId(null);
      }
    }
    if (drawerCaseId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [drawerCaseId]);

  const toggleExpand = (caseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCases(prev => {
      const next = new Set(prev);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
      }
      return next;
    });
  };

  const handleRowClick = (caseId: string) => {
    setDrawerCaseId(prev => prev === caseId ? null : caseId);
  };

  const filteredCases = selectedClientFilter === 'all'
    ? cases
    : cases.filter(c => c.clientName === selectedClientFilter);

  const openCases      = filteredCases.filter(c => c.status !== 'resolved' && c.status !== 'closed');
  const resolvedCases  = filteredCases.filter(c => c.status === 'resolved');
  const avgResolutionDays = resolvedCases.length > 0
    ? Math.round(resolvedCases.reduce((s, c) => s + (c.resolutionDays ?? 0), 0) / resolvedCases.length)
    : 0;
  const acceptedSettlements = PLACEHOLDER_SETTLEMENTS.filter(s => s.status === 'accepted').length;
  const settlementRate = PLACEHOLDER_SETTLEMENTS.length > 0
    ? Math.round((acceptedSettlements / PLACEHOLDER_SETTLEMENTS.length) * 100)
    : 0;

  const selectedCase = selectedCaseId ? cases.find(c => c.id === selectedCaseId) : null;
  const casePlans     = PLACEHOLDER_PLANS.filter(p => p.caseId === selectedCaseId);
  const caseSettlements = PLACEHOLDER_SETTLEMENTS.filter(s => s.caseId === selectedCaseId);
  const caseClosures  = PLACEHOLDER_CLOSURES.filter(c => c.caseId === selectedCaseId);

  // Drawer case data
  const drawerCase = drawerCaseId ? cases.find(c => c.id === drawerCaseId) : null;
  const drawerCards = drawerCaseId ? (CARD_DETAILS[drawerCaseId] ?? []) : [];
  const drawerSettlements = PLACEHOLDER_SETTLEMENTS.filter(s => s.caseId === drawerCaseId);
  const drawerTimeline = drawerCaseId ? (CASE_TIMELINES[drawerCaseId] ?? [
    { date: '2026-03-01', title: 'Case Opened', description: 'Hardship case created for client.' },
    { date: '2026-03-10', title: 'Documents Requested', description: 'Financial documents requested from client.' },
    { date: '2026-03-20', title: 'Under Review', description: 'Case is under internal review.' },
  ]) : [];

  // New case save handler
  const handleSaveNewCase = () => {
    if (!newCaseClient) return;
    const client = PLACEHOLDER_CLIENTS.find(c => c.id === newCaseClient);
    if (!client) return;

    const newCase: HardshipCase = {
      id: `hc_${String(cases.length + 1).padStart(3, '0')}`,
      clientName: client.name,
      businessName: client.businessName,
      openedAt: new Date().toISOString(),
      severity: newCaseSeverity,
      status: 'open',
      assignedAdvisor: 'Sarah Chen',
      cardsAffected: 0,
      totalDebt: parseFloat(newCaseDebt) || 0,
      missedPayments: 0,
      notes: newCaseNotes || undefined,
      reason: newCaseReason,
    };

    setCases(prev => [newCase, ...prev]);
    setShowNewCaseModal(false);
    setNewCaseClient('');
    setNewCaseSeverity('serious');
    setNewCaseDebt('');
    setNewCaseReason('Job Loss');
    setNewCaseNotes('');
  };

  // Letter generator
  const handleGenerateLetter = () => {
    if (!letterBusiness || !letterIssuer) return;
    const letter = generateHardshipLetter(
      letterBusiness,
      letterIssuer,
      letterCardName || 'Business Credit Card',
      parseFloat(letterBalance) || 0,
    );
    setGeneratedLetter(letter);
  };

  const handleCopyLetter = () => {
    navigator.clipboard.writeText(generatedLetter);
  };

  const handleDownloadLetter = () => {
    const blob = new Blob([generatedLetter], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hardship-letter-${letterIssuer.replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Pre-fill letter generator from a card
  const openLetterForCard = (card: CardDetail, businessName: string) => {
    setLetterIssuer(card.issuer);
    setLetterCardName(card.name);
    setLetterBalance(String(card.balance));
    setLetterBusiness(businessName);
    setGeneratedLetter('');
    setShowLetterModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">

      {/* Feature 6: Client selector bar */}
      <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-[#0A1628] px-5 py-3">
        <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide whitespace-nowrap">Client:</label>
        <select
          value={selectedClientFilter}
          onChange={e => setSelectedClientFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C] min-w-[220px]"
        >
          <option value="all">All Clients</option>
          {PLACEHOLDER_CLIENTS.map(cl => (
            <option key={cl.id} value={cl.name}>{cl.name} — {cl.businessName}</option>
          ))}
        </select>
        <span className="text-xs text-gray-500 ml-2">{filteredCases.length} case{filteredCases.length !== 1 ? 's' : ''} shown</span>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Hardship &amp; Workout Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage open hardship cases, negotiate settlements, and coordinate card closures.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setGeneratedLetter('');
              setLetterIssuer('');
              setLetterCardName('');
              setLetterBalance('');
              setLetterBusiness('');
              setShowLetterModal(true);
            }}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700 transition-colors"
          >
            Generate Letter
          </button>
          <button
            onClick={() => setShowNewCaseModal(true)}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#C9A84C] text-gray-950 hover:bg-[#d4b65e] transition-colors"
          >
            + New Case
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Open Cases</p>
          <p className="text-2xl font-bold text-red-300">{openCases.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            {openCases.filter(c => c.severity === 'critical').length} critical
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Avg Resolution</p>
          <p className="text-2xl font-bold text-[#C9A84C]">{avgResolutionDays}d</p>
          <p className="text-xs text-gray-500 mt-1">across {resolvedCases.length} resolved</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Settlement Rate</p>
          <p className="text-2xl font-bold text-green-300">{settlementRate}%</p>
          <p className="text-xs text-gray-500 mt-1">{acceptedSettlements} of {PLACEHOLDER_SETTLEMENTS.length} offers</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Total Debt at Risk</p>
          <p className="text-2xl font-bold text-yellow-300">
            {formatCurrency(openCases.reduce((s, c) => s + c.totalDebt, 0))}
          </p>
          <p className="text-xs text-gray-500 mt-1">across open cases</p>
        </div>
      </div>

      {/* Open cases table */}
      <div className="rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">Open Cases</h3>
          <span className="text-xs text-gray-400">{openCases.length} active · {resolvedCases.length} resolved</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Client / Business</th>
                <th className="text-center px-4 py-3 font-semibold">Severity</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Total Debt</th>
                <th className="text-center px-4 py-3 font-semibold">Cards</th>
                <th className="text-center px-4 py-3 font-semibold">Missed Pmts</th>
                <th className="text-left px-4 py-3 font-semibold">Advisor</th>
                <th className="text-right px-4 py-3 font-semibold">Opened</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredCases.map((c) => {
                const sev = SEVERITY_STYLES[c.severity];
                const sta = CASE_STATUS_STYLES[c.status];
                const isExpanded = expandedCases.has(c.id);
                const isDrawerOpen = drawerCaseId === c.id;
                const cards = CARD_DETAILS[c.id] ?? [];
                const settlements = PLACEHOLDER_SETTLEMENTS.filter(s => s.caseId === c.id);

                return (
                  <>
                    <tr
                      key={c.id}
                      onClick={() => handleRowClick(c.id)}
                      className={`cursor-pointer transition-colors ${
                        isDrawerOpen
                          ? 'bg-[#C9A84C]/10 border-l-2 border-l-[#C9A84C]'
                          : 'bg-[#0A1628] hover:bg-gray-900/50'
                      }`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-100">{c.clientName}</p>
                        <p className="text-xs text-gray-500">{c.businessName}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${sev.bg} ${sev.border} ${sev.text}`}>
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sta.bg} ${sta.text}`}>
                          {sta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">
                        {formatCurrency(c.totalDebt)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-300">{c.cardsAffected}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={c.missedPayments > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                          {c.missedPayments}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{c.assignedAdvisor}</td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">{formatDate(c.openedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => toggleExpand(c.id, e)}
                          className="text-gray-500 hover:text-[#C9A84C] transition-colors p-1 rounded hover:bg-gray-800"
                          title={isExpanded ? 'Collapse row' : 'Expand row'}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>

                    {/* Feature 1: Expanded row content */}
                    {isExpanded && (
                      <tr key={`${c.id}-expanded`} className="bg-gray-900/30">
                        <td colSpan={9} className="px-5 py-4">
                          <div className="space-y-4">
                            {/* Cards involved */}
                            {cards.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cards Involved</h4>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                  {cards.map((card, idx) => (
                                    <div key={idx} className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                                      <p className="text-sm font-semibold text-gray-100">{card.name}</p>
                                      <p className="text-xs text-gray-500">{card.issuer}</p>
                                      <div className="mt-2 space-y-1 text-xs">
                                        <div className="flex justify-between">
                                          <span className="text-gray-500">Balance</span>
                                          <span className="text-white font-semibold">{formatCurrency(card.balance)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-500">APR</span>
                                          <span className="text-gray-300">{card.apr}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-500">Missed Pmts</span>
                                          <span className={card.missedPayments > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>{card.missedPayments}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-500">Negotiation</span>
                                          <span className="text-[#C9A84C] text-[10px]">{card.negotiationStatus}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Settlement offers log */}
                            {settlements.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Settlement Offers</h4>
                                <div className="space-y-1">
                                  {settlements.map(offer => {
                                    const st = SETTLEMENT_STYLES[offer.status];
                                    return (
                                      <div key={offer.id} className="flex items-center gap-3 text-xs rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2">
                                        <span className="text-gray-300 font-medium flex-1">{offer.cardName} ({offer.issuer})</span>
                                        <span className="text-gray-400">{formatCurrency(offer.offerAmount)} / {formatCurrency(offer.originalBalance)}</span>
                                        <span className={`font-bold px-2 py-0.5 rounded-full border text-[10px] ${st.bg} ${st.border} ${st.text}`}>{st.label}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Quick actions */}
                            <div>
                              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Quick Actions</h4>
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (cards.length > 0) {
                                      openLetterForCard(cards[0], c.businessName);
                                    } else {
                                      setLetterBusiness(c.businessName);
                                      setGeneratedLetter('');
                                      setShowLetterModal(true);
                                    }
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/30 hover:bg-[#C9A84C]/30 transition-colors"
                                >
                                  Generate Letter
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRowClick(c.id); }}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-900/30 text-blue-300 border border-blue-700/30 hover:bg-blue-900/50 transition-colors"
                                >
                                  Contact Client
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedCaseId(c.id); }}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors"
                                >
                                  Update Status
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Case detail panel (inline, existing functionality) */}
      {selectedCase && (
        <div className="rounded-xl border border-[#C9A84C]/30 bg-[#0A1628] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-[#C9A84C]/5">
            <div>
              <h3 className="text-base font-semibold text-white">
                {selectedCase.clientName} — {selectedCase.businessName}
              </h3>
              {selectedCase.notes && (
                <p className="text-xs text-gray-400 mt-0.5">{selectedCase.notes}</p>
              )}
            </div>
            <button
              onClick={() => setSelectedCaseId(null)}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors px-2"
            >
              Close
            </button>
          </div>

          <div className="flex gap-1 px-5 pt-4 border-b border-gray-800">
            {(['plans', 'settlements', 'closures'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors capitalize border-b-2 ${
                  activeTab === tab
                    ? 'border-[#C9A84C] text-[#C9A84C]'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab === 'plans' ? 'Payment Plans' : tab === 'settlements' ? 'Settlement Offers' : 'Card Closures'}
              </button>
            ))}
          </div>

          <div className="p-5">
            {activeTab === 'plans' && (
              <>
                {casePlans.length === 0 ? (
                  <p className="text-gray-500 text-sm">No payment plans on file for this case.</p>
                ) : (
                  <div className="space-y-3">
                    {casePlans.map((plan, idx) => (
                      <div key={idx} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-gray-100">{plan.cardName}</p>
                            <p className="text-xs text-gray-500">{plan.issuer}</p>
                          </div>
                          <div className="flex gap-2">
                            {plan.feeWaiver && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-900 text-green-300 border border-green-700">
                                Fee Waiver
                              </span>
                            )}
                            {plan.rateReduction && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900 text-blue-300 border border-blue-700">
                                -{plan.rateReduction}% APR
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Balance</p>
                            <p className="text-sm font-bold text-white">{formatCurrency(plan.originalBalance)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Reduced Payment</p>
                            <p className="text-sm font-bold text-green-400">{formatCurrency(plan.reducedPayment)}</p>
                            <p className="text-[10px] text-gray-600">was {formatCurrency(plan.originalMinPayment)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Plan Period</p>
                            <p className="text-xs text-gray-300">
                              {plan.planStartDate} → {plan.planEndDate}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Months Remaining</p>
                            <p className="text-sm font-bold text-[#C9A84C]">{plan.monthsRemaining}mo</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'settlements' && (
              <>
                {caseSettlements.length === 0 ? (
                  <p className="text-gray-500 text-sm">No settlement offers for this case.</p>
                ) : (
                  <div className="space-y-3">
                    {caseSettlements.map((offer) => {
                      const st = SETTLEMENT_STYLES[offer.status];
                      const savings = offer.originalBalance - offer.offerAmount;
                      const isExpired = new Date(offer.expiresAt) < new Date();
                      return (
                        <div key={offer.id} className={`rounded-xl border p-4 ${st.bg} ${st.border}`}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-semibold text-gray-100">{offer.cardName}</p>
                              <p className="text-xs text-gray-500">{offer.issuer}</p>
                            </div>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${st.bg} ${st.border} ${st.text}`}>
                              {st.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Original Balance</p>
                              <p className="text-sm font-bold text-white">{formatCurrency(offer.originalBalance)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Settlement Offer</p>
                              <p className={`text-sm font-bold ${st.text}`}>{formatCurrency(offer.offerAmount)}</p>
                              <p className="text-[10px] text-gray-600">{offer.offerPct}% of balance</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Savings</p>
                              <p className="text-sm font-bold text-green-400">{formatCurrency(savings)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Expires</p>
                              <p className={`text-xs font-semibold ${isExpired ? 'text-red-400' : 'text-gray-300'}`}>
                                {formatDate(offer.expiresAt)}
                                {isExpired && ' (expired)'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {activeTab === 'closures' && (
              <>
                {caseClosures.length === 0 ? (
                  <p className="text-gray-500 text-sm">No card closure sequences initiated for this case.</p>
                ) : (
                  <div className="space-y-2">
                    {caseClosures.map((card) => {
                      const stage = CLOSURE_STAGE_STYLES[card.stage];
                      return (
                        <div key={card.id} className="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${stage.dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-100">{card.cardName}</p>
                            <p className="text-xs text-gray-500">{card.issuer}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-white">{formatCurrency(card.balance)}</p>
                            <p className="text-[10px] text-gray-500">balance</p>
                          </div>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-800 ${stage.text} min-w-[110px] text-center`}>
                            {stage.label}
                          </span>
                          {card.requestedAt && (
                            <p className="text-[10px] text-gray-600 min-w-[80px] text-right">
                              {formatDate(card.requestedAt)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap gap-3 text-[10px] text-gray-500">
                      <span className="font-semibold text-gray-400">Sequence:</span>
                      {(['active', 'freeze_requested', 'in_closure', 'closed', 'charged_off'] as ClosureStage[]).map(s => (
                        <span key={s} className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${CLOSURE_STAGE_STYLES[s].dot}`} />
                          {CLOSURE_STAGE_STYLES[s].label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Feature 3: Counselor referrals (4 cards) */}
      <div className="rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">Counselor Referrals</h3>
          <p className="text-xs text-gray-400 mt-0.5">Approved third-party resources for hardship clients.</p>
        </div>
        <div className="p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COUNSELOR_REFS.map((ref) => (
            <div key={ref.id} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-100 text-sm">{ref.name}</p>
                  <p className="text-xs text-gray-500">{ref.organization}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-900 text-green-300 border border-green-700 flex-shrink-0">
                  {ref.cost}
                </span>
              </div>
              <p className="text-xs text-gray-400">{ref.specialty}</p>
              <div className="text-[10px] text-gray-500">
                <span className="font-semibold text-gray-400">Type:</span> {ref.type}
              </div>
              <div className="flex gap-3 mt-auto pt-1">
                {ref.phone !== 'Internal Referral' ? (
                  <a
                    href={`tel:${ref.phone.replace(/\D/g, '')}`}
                    className="text-xs text-[#C9A84C] hover:underline font-medium"
                  >
                    {ref.phone}
                  </a>
                ) : (
                  <span className="text-xs text-[#C9A84C] font-medium">Internal Referral</span>
                )}
                {ref.website !== '#' && (
                  <a
                    href={ref.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline font-medium ml-auto"
                  >
                    Visit Site
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature 2: Right slide-over drawer (480px) */}
      {drawerCase && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 z-40" />
          {/* Drawer */}
          <div
            ref={drawerRef}
            className="fixed top-0 right-0 h-full w-[480px] max-w-full bg-gray-950 border-l border-gray-800 z-50 overflow-y-auto shadow-2xl"
          >
            <div className="p-5 space-y-5">
              {/* Drawer header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">{drawerCase.clientName}</h2>
                  <p className="text-sm text-gray-400">{drawerCase.businessName}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${SEVERITY_STYLES[drawerCase.severity].bg} ${SEVERITY_STYLES[drawerCase.severity].border} ${SEVERITY_STYLES[drawerCase.severity].text}`}>
                      {SEVERITY_STYLES[drawerCase.severity].label}
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CASE_STATUS_STYLES[drawerCase.status].bg} ${CASE_STATUS_STYLES[drawerCase.status].text}`}>
                      {CASE_STATUS_STYLES[drawerCase.status].label}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setDrawerCaseId(null)}
                  className="text-gray-500 hover:text-gray-300 text-lg transition-colors p-1"
                >
                  X
                </button>
              </div>

              {/* Case summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Debt</p>
                  <p className="text-lg font-bold text-white">{formatCurrency(drawerCase.totalDebt)}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Missed Payments</p>
                  <p className={`text-lg font-bold ${drawerCase.missedPayments > 0 ? 'text-red-400' : 'text-gray-300'}`}>
                    {drawerCase.missedPayments}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Cards Affected</p>
                  <p className="text-lg font-bold text-[#C9A84C]">{drawerCase.cardsAffected}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Advisor</p>
                  <p className="text-sm font-semibold text-gray-200 mt-0.5">{drawerCase.assignedAdvisor}</p>
                </div>
              </div>

              {drawerCase.notes && (
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-gray-300">{drawerCase.notes}</p>
                </div>
              )}

              {/* Card breakdown */}
              {drawerCards.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Card Breakdown</h3>
                  <div className="space-y-2">
                    {drawerCards.map((card, idx) => (
                      <div key={idx} className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-100">{card.name}</p>
                            <p className="text-xs text-gray-500">{card.issuer}</p>
                          </div>
                          <p className="text-sm font-bold text-white">{formatCurrency(card.balance)}</p>
                        </div>
                        <div className="flex gap-4 mt-2 text-xs">
                          <span className="text-gray-500">APR: <span className="text-gray-300">{card.apr}%</span></span>
                          <span className="text-gray-500">Missed: <span className={card.missedPayments > 0 ? 'text-red-400' : 'text-gray-300'}>{card.missedPayments}</span></span>
                          <span className="text-gray-500">Status: <span className="text-[#C9A84C]">{card.negotiationStatus}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settlement offers */}
              {drawerSettlements.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Settlement Offers</h3>
                  <div className="space-y-2">
                    {drawerSettlements.map(offer => {
                      const st = SETTLEMENT_STYLES[offer.status];
                      return (
                        <div key={offer.id} className={`rounded-lg border p-3 ${st.bg} ${st.border}`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm font-semibold text-gray-100">{offer.cardName}</p>
                              <p className="text-xs text-gray-500">{offer.issuer}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.bg} ${st.border} ${st.text}`}>
                              {st.label}
                            </span>
                          </div>
                          <div className="flex gap-4 mt-2 text-xs">
                            <span className="text-gray-400">{formatCurrency(offer.offerAmount)} of {formatCurrency(offer.originalBalance)} ({offer.offerPct}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Case timeline */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Case Timeline</h3>
                <div className="space-y-0">
                  {drawerTimeline.map((event, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#C9A84C] flex-shrink-0 mt-1" />
                        {idx < drawerTimeline.length - 1 && (
                          <div className="w-px h-full bg-gray-700 flex-1 min-h-[24px]" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className="text-xs text-gray-500">{formatDate(event.date)}</p>
                        <p className="text-sm font-semibold text-gray-200">{event.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
                <button
                  onClick={() => {
                    if (drawerCards.length > 0) {
                      openLetterForCard(drawerCards[0], drawerCase.businessName);
                    } else {
                      setLetterBusiness(drawerCase.businessName);
                      setGeneratedLetter('');
                      setShowLetterModal(true);
                    }
                  }}
                  className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#C9A84C] text-gray-950 hover:bg-[#d4b65e] transition-colors"
                >
                  Generate Hardship Letter
                </button>
                <button
                  onClick={() => { setSelectedCaseId(drawerCase.id); setDrawerCaseId(null); }}
                  className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700 transition-colors"
                >
                  View Payment Plans & Settlements
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Feature 4: New Case modal */}
      {showNewCaseModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">New Hardship Case</h2>
              <button
                onClick={() => setShowNewCaseModal(false)}
                className="text-gray-500 hover:text-gray-300 text-lg transition-colors"
              >
                X
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Client selector */}
              <div>
                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Client</label>
                <select
                  value={newCaseClient}
                  onChange={e => setNewCaseClient(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C]"
                >
                  <option value="">Select client...</option>
                  {PLACEHOLDER_CLIENTS.map(cl => (
                    <option key={cl.id} value={cl.id}>{cl.name} — {cl.businessName}</option>
                  ))}
                </select>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Severity</label>
                <select
                  value={newCaseSeverity}
                  onChange={e => setNewCaseSeverity(e.target.value as CaseSeverity)}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C]"
                >
                  <option value="critical">Critical</option>
                  <option value="serious">Serious</option>
                  <option value="minor">Minor</option>
                </select>
              </div>

              {/* Total debt */}
              <div>
                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Total Debt ($)</label>
                <input
                  type="number"
                  value={newCaseDebt}
                  onChange={e => setNewCaseDebt(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C] placeholder-gray-600"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Reason</label>
                <select
                  value={newCaseReason}
                  onChange={e => setNewCaseReason(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C]"
                >
                  <option value="Job Loss">Job Loss</option>
                  <option value="Medical">Medical</option>
                  <option value="Business Downturn">Business Downturn</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Notes</label>
                <textarea
                  value={newCaseNotes}
                  onChange={e => setNewCaseNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional context about the hardship situation..."
                  className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C] placeholder-gray-600 resize-none"
                />
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveNewCase}
                disabled={!newCaseClient}
                className={`w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                  newCaseClient
                    ? 'bg-[#C9A84C] text-gray-950 hover:bg-[#d4b65e]'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                }`}
              >
                Save Case
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feature 5: Hardship letter generator modal */}
      {showLetterModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Hardship Letter Generator</h2>
              <button
                onClick={() => setShowLetterModal(false)}
                className="text-gray-500 hover:text-gray-300 text-lg transition-colors"
              >
                X
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {!generatedLetter ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Business Name</label>
                      <input
                        type="text"
                        value={letterBusiness}
                        onChange={e => setLetterBusiness(e.target.value)}
                        placeholder="e.g. Crestline Medical LLC"
                        className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C] placeholder-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Issuer</label>
                      <input
                        type="text"
                        value={letterIssuer}
                        onChange={e => setLetterIssuer(e.target.value)}
                        placeholder="e.g. Chase, Amex"
                        className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C] placeholder-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Card Name</label>
                      <input
                        type="text"
                        value={letterCardName}
                        onChange={e => setLetterCardName(e.target.value)}
                        placeholder="e.g. Ink Business Cash"
                        className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C] placeholder-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Balance ($)</label>
                      <input
                        type="number"
                        value={letterBalance}
                        onChange={e => setLetterBalance(e.target.value)}
                        placeholder="e.g. 28000"
                        className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C] placeholder-gray-600"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleGenerateLetter}
                    disabled={!letterBusiness || !letterIssuer}
                    className={`w-full px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                      letterBusiness && letterIssuer
                        ? 'bg-[#C9A84C] text-gray-950 hover:bg-[#d4b65e]'
                        : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    Generate Letter
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    value={generatedLetter}
                    onChange={e => setGeneratedLetter(e.target.value)}
                    rows={20}
                    className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C] font-mono leading-relaxed resize-none"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleCopyLetter}
                      className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700 transition-colors"
                    >
                      Copy to Clipboard
                    </button>
                    <button
                      onClick={handleDownloadLetter}
                      className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#C9A84C] text-gray-950 hover:bg-[#d4b65e] transition-colors"
                    >
                      Download as .txt
                    </button>
                  </div>
                  <button
                    onClick={() => setGeneratedLetter('')}
                    className="w-full px-4 py-2 text-xs font-semibold rounded-lg bg-gray-900 text-gray-400 border border-gray-800 hover:bg-gray-800 transition-colors"
                  >
                    Back to Form
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
