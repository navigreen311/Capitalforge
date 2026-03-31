'use client';

// ============================================================
// /clients/[id] — Client detail page
// Tabs: Profile | Credit | Applications | Funding Rounds |
//       Compliance | Documents
// Summary cards at top: readiness score, suitability score,
// consent status, total funding.
// ============================================================

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { clientsApi, creditApi, applicationsApi, consentApi, documentsApi } from '../../../lib/api-client';
import CreditScoreCard from '../../../components/modules/credit-score-card';
import SuitabilityIndicator from '../../../components/modules/suitability-indicator';
import ConsentStatusGrid from '../../../components/modules/consent-status-grid';
import AprCountdown from '../../../components/modules/apr-countdown';
import type { BusinessStatus, ApplicationStatus, SuitabilityResult } from '../../../../shared/types';
import type { ConsentRecord } from '../../../components/modules/consent-status-grid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BusinessProfile {
  id: string;
  businessName: string;
  legalName: string;
  entityType: string;
  ein: string;
  stateOfFormation: string;
  operatingStates: string[];
  status: BusinessStatus;
  advisorName: string;
  fundingReadinessScore: number;
  monthsInBusiness: number;
  annualRevenue: number;
  employees: number;
  website?: string;
  createdAt: string;
}

interface CreditProfile {
  scores: Array<{
    bureau: 'equifax' | 'transunion' | 'experian' | 'dnb';
    score: number;
    scoreType: 'fico' | 'vantage' | 'sbss' | 'paydex';
    pullDate: string;
    utilization: number;
  }>;
  totalCreditLimit: number;
  totalBalance: number;
  openAccounts: number;
  inquiries90d: number;
}

interface ApplicationSummary {
  id: string;
  cardProduct: string;
  issuer: string;
  status: ApplicationStatus;
  requestedLimit: number;
  approvedLimit?: number;
  aprExpiresAt?: string;
  regularApr?: number;
  balance?: number;
  createdAt: string;
}

interface FundingRoundSummary {
  id: string;
  status: string;
  targetAmount: number;
  obtainedAmount: number;
  startedAt: string;
  targetCloseAt: string;
}

interface ComplianceSummary {
  id: string;
  checkType: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  passed: boolean;
  findings: string;
  checkedAt: string;
}

interface DocumentSummary {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
  legalHold: boolean;
  fileSizeBytes: number;
}

// ---------------------------------------------------------------------------
// Placeholder factory
// ---------------------------------------------------------------------------

function makePlaceholderBusiness(id: string): BusinessProfile {
  return {
    id,
    businessName: 'Apex Ventures LLC',
    legalName: 'Apex Ventures, LLC',
    entityType: 'LLC',
    ein: '47-XXXXXXX',
    stateOfFormation: 'TX',
    operatingStates: ['TX', 'CA', 'NY'],
    status: 'active',
    advisorName: 'Sarah Chen',
    fundingReadinessScore: 82,
    monthsInBusiness: 36,
    annualRevenue: 480_000,
    employees: 7,
    website: 'https://apexventures.example.com',
    createdAt: '2023-03-01T00:00:00Z',
  };
}

const PLACEHOLDER_CREDIT: CreditProfile = {
  scores: [
    { bureau: 'experian', score: 742, scoreType: 'fico', pullDate: '2026-03-15T00:00:00Z', utilization: 0.28 },
    { bureau: 'equifax',  score: 735, scoreType: 'fico', pullDate: '2026-03-15T00:00:00Z', utilization: 0.31 },
    { bureau: 'transunion', score: 750, scoreType: 'fico', pullDate: '2026-03-15T00:00:00Z', utilization: 0.25 },
  ],
  totalCreditLimit: 125_000,
  totalBalance: 34_500,
  openAccounts: 6,
  inquiries90d: 3,
};

const PLACEHOLDER_SUITABILITY: SuitabilityResult = {
  score: 72,
  maxSafeLeverage: 3,
  noGoTriggered: false,
  noGoReasons: [],
  recommendation: 'Client is suitable for moderate stacking (2–3 cards). Prioritise 0% intro APR products with 12–15 month windows. Monitor utilization closely.',
  alternativeProducts: ['SBA Microloan', 'Revenue-based financing', 'Business line of credit'],
};

const PLACEHOLDER_CONSENT: ConsentRecord[] = [
  { channel: 'voice',   status: 'active',  consentType: 'tcpa',         grantedAt: '2026-01-10T00:00:00Z', expiresAt: '2027-01-10T00:00:00Z' },
  { channel: 'sms',     status: 'active',  consentType: 'tcpa',         grantedAt: '2026-01-10T00:00:00Z', expiresAt: '2027-01-10T00:00:00Z' },
  { channel: 'email',   status: 'active',  consentType: 'data_sharing',  grantedAt: '2026-01-10T00:00:00Z' },
  { channel: 'partner', status: 'revoked', consentType: 'referral',      grantedAt: '2025-06-01T00:00:00Z', revokedAt: '2026-02-20T00:00:00Z' },
];

const PLACEHOLDER_APPS: ApplicationSummary[] = [
  { id: 'app_004', cardProduct: 'Ink Business Preferred', issuer: 'Chase',     status: 'approved', requestedLimit: 50000, approvedLimit: 45000, aprExpiresAt: '2026-05-20T00:00:00Z', regularApr: 20.99, balance: 38000, createdAt: '2026-03-20T00:00:00Z' },
  { id: 'app_001', cardProduct: 'Ink Business Cash',      issuer: 'Chase',     status: 'draft',    requestedLimit: 25000, createdAt: '2026-03-28T00:00:00Z' },
  { id: 'app_007', cardProduct: 'Business Advantage Cash',issuer: 'BofA',      status: 'submitted',requestedLimit: 18000, createdAt: '2026-03-29T00:00:00Z' },
];

const PLACEHOLDER_ROUNDS: FundingRoundSummary[] = [
  { id: 'fr_001', status: 'in_progress', targetAmount: 150000, obtainedAmount: 105000, startedAt: '2026-01-15T00:00:00Z', targetCloseAt: '2026-04-15T00:00:00Z' },
];

const PLACEHOLDER_COMPLIANCE: ComplianceSummary[] = [
  { id: 'cc_001', checkType: 'UDAP',      riskLevel: 'low',    passed: true,  findings: 'No unfair or deceptive practices identified.', checkedAt: '2026-03-30T09:00:00Z' },
  { id: 'cc_004', checkType: 'AML',       riskLevel: 'low',    passed: true,  findings: 'Sanctions screening clear.', checkedAt: '2026-03-27T16:00:00Z' },
  { id: 'cc_003', checkType: 'KYB',       riskLevel: 'medium', passed: true,  findings: 'All beneficial owners verified.', checkedAt: '2026-03-25T10:00:00Z' },
];

const PLACEHOLDER_DOCS: DocumentSummary[] = [
  { id: 'doc_001', type: 'Bank Statement', fileName: 'apex_bank_stmt_feb2026.pdf', uploadedAt: '2026-03-01T10:00:00Z', legalHold: false, fileSizeBytes: 248_000 },
  { id: 'doc_002', type: 'Consent Record', fileName: 'apex_tcpa_consent_voice.json', uploadedAt: '2026-02-15T09:30:00Z', legalHold: true, fileSizeBytes: 4_200 },
  { id: 'doc_009', type: 'Contract',       fileName: 'apex_advisor_agreement.pdf', uploadedAt: '2026-01-10T10:00:00Z', legalHold: true, fileSizeBytes: 210_000 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<BusinessStatus, string> = {
  intake: 'bg-gray-800 text-gray-300 border-gray-600',
  onboarding: 'bg-blue-900 text-blue-300 border-blue-700',
  active: 'bg-green-900 text-green-300 border-green-700',
  graduated: 'bg-purple-900 text-purple-300 border-purple-700',
  offboarding: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  closed: 'bg-red-900 text-red-300 border-red-700',
};

const APP_STATUS_BADGE: Record<ApplicationStatus, string> = {
  draft: 'bg-gray-800 text-gray-300 border-gray-600',
  pending_consent: 'bg-blue-900 text-blue-300 border-blue-700',
  submitted: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  approved: 'bg-green-900 text-green-300 border-green-700',
  declined: 'bg-red-900 text-red-300 border-red-700',
  reconsideration: 'bg-orange-900 text-orange-300 border-orange-700',
};

type Tab = 'profile' | 'credit' | 'applications' | 'funding' | 'compliance' | 'documents';
const TABS: { key: Tab; label: string }[] = [
  { key: 'profile',      label: 'Profile' },
  { key: 'credit',       label: 'Credit' },
  { key: 'applications', label: 'Applications' },
  { key: 'funding',      label: 'Funding Rounds' },
  { key: 'compliance',   label: 'Compliance' },
  { key: 'documents',    label: 'Documents' },
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, color = 'text-gray-100' }: {
  label: string; value: React.ReactNode; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">{label}</p>
      <p className={`text-3xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [credit, setCredit] = useState<CreditProfile>(PLACEHOLDER_CREDIT);
  const [suitability] = useState<SuitabilityResult>(PLACEHOLDER_SUITABILITY);
  const [consent, setConsent] = useState<ConsentRecord[]>(PLACEHOLDER_CONSENT);
  const [applications, setApplications] = useState<ApplicationSummary[]>(PLACEHOLDER_APPS);
  const [rounds] = useState<FundingRoundSummary[]>(PLACEHOLDER_ROUNDS);
  const [compliance] = useState<ComplianceSummary[]>(PLACEHOLDER_COMPLIANCE);
  const [docList] = useState<DocumentSummary[]>(PLACEHOLDER_DOCS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [bizRes, creditRes, consentRes, appsRes] = await Promise.allSettled([
          clientsApi.get(id),
          creditApi.getProfile(id),
          consentApi.getByBusiness(id),
          applicationsApi.list({ businessId: id }),
        ]);

        if (bizRes.status === 'fulfilled' && bizRes.value.success && bizRes.value.data) {
          setBusiness(bizRes.value.data as BusinessProfile);
        } else {
          setBusiness(makePlaceholderBusiness(id));
        }
        if (creditRes.status === 'fulfilled' && creditRes.value.success && creditRes.value.data) {
          setCredit(creditRes.value.data as CreditProfile);
        }
        if (consentRes.status === 'fulfilled' && consentRes.value.success && Array.isArray(consentRes.value.data)) {
          setConsent(consentRes.value.data as ConsentRecord[]);
        }
        if (appsRes.status === 'fulfilled' && appsRes.value.success && Array.isArray(appsRes.value.data)) {
          setApplications(appsRes.value.data as ApplicationSummary[]);
        }
      } catch {
        setBusiness(makePlaceholderBusiness(id));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const biz = business ?? makePlaceholderBusiness(id ?? 'unknown');
  const totalFunding = applications
    .filter((a) => a.status === 'approved')
    .reduce((s, a) => s + (a.approvedLimit ?? 0), 0);
  const activeConsent = consent.filter((c) => c.status === 'active').length;
  const bestScore = credit.scores.length
    ? Math.max(...credit.scores.map((s) => s.score))
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Back */}
      <button
        onClick={() => router.push('/clients')}
        className="text-sm text-gray-400 hover:text-gray-200 transition-colors mb-4 flex items-center gap-1"
      >
        ← Back to Clients
      </button>

      {/* Business header */}
      {loading ? (
        <div className="h-12 bg-gray-800 rounded-lg animate-pulse mb-6" />
      ) : (
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{biz.businessName}</h1>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_BADGE[biz.status]}`}>
                {biz.status.charAt(0).toUpperCase() + biz.status.slice(1)}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">
              {biz.entityType} · {biz.stateOfFormation} · Advisor: {biz.advisorName}
            </p>
          </div>
          <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors">
            Edit Profile
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Readiness Score"
          value={biz.fundingReadinessScore}
          sub="out of 100"
          color={biz.fundingReadinessScore >= 75 ? 'text-green-400' : biz.fundingReadinessScore >= 55 ? 'text-yellow-400' : 'text-red-400'}
        />
        <StatCard
          label="Suitability Score"
          value={suitability.score}
          sub={suitability.noGoTriggered ? 'NO-GO TRIGGERED' : 'out of 100'}
          color={suitability.noGoTriggered ? 'text-gray-400' : suitability.score >= 70 ? 'text-green-400' : suitability.score >= 50 ? 'text-yellow-400' : 'text-red-400'}
        />
        <StatCard
          label="Consent Channels"
          value={`${activeConsent} / 4`}
          sub="channels active"
          color={activeConsent === 4 ? 'text-green-400' : activeConsent >= 2 ? 'text-yellow-400' : 'text-red-400'}
        />
        <StatCard
          label="Total Funding"
          value={formatCurrency(totalFunding)}
          sub={`${applications.filter((a) => a.status === 'approved').length} card(s) approved`}
          color="text-green-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Profile ─── */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Business Details</h3>
            {[
              { label: 'Legal Name',        value: biz.legalName },
              { label: 'EIN',               value: biz.ein },
              { label: 'Entity Type',       value: biz.entityType },
              { label: 'State of Formation',value: biz.stateOfFormation },
              { label: 'Operating States',  value: biz.operatingStates.join(', ') },
              { label: 'Months in Business',value: `${biz.monthsInBusiness} months` },
              { label: 'Annual Revenue',    value: formatCurrency(biz.annualRevenue) },
              { label: 'Employees',         value: String(biz.employees) },
              { label: 'Website',           value: biz.website ?? '—' },
              { label: 'Member Since',      value: formatDate(biz.createdAt) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm border-b border-gray-800 pb-2 last:border-0 last:pb-0">
                <span className="text-gray-400">{label}</span>
                <span className="text-gray-100 font-medium text-right max-w-[60%]">{value}</span>
              </div>
            ))}
          </div>

          <div>
            <SuitabilityIndicator result={suitability} className="mb-4" />
            <ConsentStatusGrid records={consent} />
          </div>
        </div>
      )}

      {/* ─── Tab: Credit ─── */}
      {activeTab === 'credit' && (
        <div>
          {/* Credit scores */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {credit.scores.map((s) => (
              <CreditScoreCard
                key={s.bureau}
                score={s.score}
                bureau={s.bureau}
                scoreType={s.scoreType}
                pullDate={s.pullDate}
                utilization={s.utilization}
              />
            ))}
          </div>

          {/* Portfolio stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Credit Limit', value: formatCurrency(credit.totalCreditLimit) },
              { label: 'Total Balance',       value: formatCurrency(credit.totalBalance) },
              { label: 'Open Accounts',       value: String(credit.openAccounts) },
              { label: 'Inquiries (90d)',      value: String(credit.inquiries90d) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-bold text-gray-100">{value}</p>
              </div>
            ))}
          </div>

          {/* Best score bar */}
          <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Best Score (Portfolio)</p>
            <div className="flex items-center gap-4">
              <span className="text-4xl font-black text-green-400">{bestScore}</span>
              <div className="flex-1 h-3 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${(bestScore / 850) * 100}%` }}
                />
              </div>
              <span className="text-gray-500 text-sm">/ 850</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab: Applications ─── */}
      {activeTab === 'applications' && (
        <div className="space-y-3">
          {applications.map((app) => (
            <div key={app.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-gray-100">{app.cardProduct}</p>
                  <p className="text-xs text-gray-400">{app.issuer}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${APP_STATUS_BADGE[app.status]}`}>
                  {app.status.replace('_', ' ')}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div><p className="text-gray-500">Requested</p><p className="text-gray-200">{formatCurrency(app.requestedLimit)}</p></div>
                {app.approvedLimit !== undefined && (
                  <div><p className="text-gray-500">Approved</p><p className="text-green-400 font-semibold">{formatCurrency(app.approvedLimit)}</p></div>
                )}
                <div><p className="text-gray-500">Applied</p><p className="text-gray-200">{formatDate(app.createdAt)}</p></div>
              </div>
              {app.aprExpiresAt && app.regularApr !== undefined && app.balance !== undefined && (
                <div className="mt-3">
                  <AprCountdown
                    cardProduct={app.cardProduct}
                    issuer={app.issuer}
                    expiresAt={app.aprExpiresAt}
                    regularApr={app.regularApr}
                    balance={app.balance}
                    compact
                    className="w-full"
                  />
                </div>
              )}
            </div>
          ))}
          {applications.length === 0 && (
            <p className="text-center py-12 text-gray-500">No applications yet.</p>
          )}
        </div>
      )}

      {/* ─── Tab: Funding Rounds ─── */}
      {activeTab === 'funding' && (
        <div className="space-y-4">
          {rounds.map((r) => {
            const pct = r.targetAmount > 0 ? Math.min((r.obtainedAmount / r.targetAmount) * 100, 100) : 0;
            return (
              <div key={r.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    r.status === 'in_progress' ? 'bg-blue-900 text-blue-300 border-blue-700' :
                    r.status === 'completed' ? 'bg-green-900 text-green-300 border-green-700' :
                    'bg-gray-800 text-gray-300 border-gray-600'
                  }`}>
                    {r.status.replace('_', ' ')}
                  </span>
                  <p className="text-xs text-gray-500">Target close: {formatDate(r.targetCloseAt)}</p>
                </div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-400">{formatCurrency(r.obtainedAmount)} obtained</span>
                  <span className="font-semibold text-gray-200">{Math.round(pct)}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : 'bg-yellow-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">Target: {formatCurrency(r.targetAmount)}</p>
              </div>
            );
          })}
          {rounds.length === 0 && <p className="text-center py-12 text-gray-500">No funding rounds yet.</p>}
        </div>
      )}

      {/* ─── Tab: Compliance ─── */}
      {activeTab === 'compliance' && (
        <div className="space-y-3">
          {compliance.map((c) => {
            const riskColors = { low: 'border-gray-600 bg-gray-900', medium: 'border-yellow-700 bg-yellow-950', high: 'border-orange-700 bg-orange-950', critical: 'border-red-700 bg-red-950' };
            const riskBadge = { low: 'bg-green-900 text-green-300 border-green-700', medium: 'bg-yellow-900 text-yellow-300 border-yellow-700', high: 'bg-orange-900 text-orange-300 border-orange-700', critical: 'bg-red-900 text-red-300 border-red-700' };
            return (
              <div key={c.id} className={`rounded-xl border p-4 ${riskColors[c.riskLevel]}`}>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${riskBadge[c.riskLevel]}`}>{c.riskLevel}</span>
                    <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">{c.checkType}</span>
                    <span className={`text-xs font-semibold ${c.passed ? 'text-green-400' : 'text-red-400'}`}>{c.passed ? '✓ Passed' : '✗ Failed'}</span>
                  </div>
                  <span className="text-xs text-gray-500">{formatDate(c.checkedAt)}</span>
                </div>
                <p className="text-sm text-gray-300">{c.findings}</p>
              </div>
            );
          })}
          {compliance.length === 0 && <p className="text-center py-12 text-gray-500">No compliance checks yet.</p>}
        </div>
      )}

      {/* ─── Tab: Documents ─── */}
      {activeTab === 'documents' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-400">{docList.length} documents</p>
            <button className="px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 hover:bg-gray-700 transition-colors">
              ↑ Upload
            </button>
          </div>
          <div className="space-y-2">
            {docList.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-base">📄</span>
                  <div>
                    <p className="text-sm font-medium text-gray-100">{doc.fileName}</p>
                    <p className="text-xs text-gray-500">{doc.type} · {formatBytes(doc.fileSizeBytes)} · {formatDate(doc.uploadedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {doc.legalHold && (
                    <span className="text-xs font-bold bg-orange-900 text-orange-300 border border-orange-700 px-2 py-0.5 rounded-full">Hold</span>
                  )}
                  <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View</button>
                </div>
              </div>
            ))}
            {docList.length === 0 && <p className="text-center py-12 text-gray-500">No documents uploaded yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
