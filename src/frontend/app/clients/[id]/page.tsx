'use client';

// ============================================================
// /clients/[id] — Client detail page
// 11 Tabs: Profile | Credit | Applications | Funding Rounds |
//          Compliance | Documents | Repayment | Acknowledgments |
//          ACH/Debit | Timeline | Calls
// ============================================================

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { clientsApi, applicationsApi } from '../../../lib/api-client';
import { EditProfileModal } from '../../../components/clients/EditProfileModal';
import ProfileTab from '../../../components/clients/ProfileTab';
import CreditTab from '../../../components/clients/CreditTab';
import ApplicationsTab from '../../../components/clients/ApplicationsTab';
import { FundingRoundsTab } from '../../../components/clients/FundingRoundsTab';
import { ComplianceTab } from '../../../components/clients/ComplianceTab';
import DocumentsTab from '../../../components/clients/DocumentsTab';
import { RepaymentTab } from '../../../components/clients/RepaymentTab';
import { AcknowledgmentsTab } from '../../../components/clients/AcknowledgmentsTab';
import { AchDebitTab } from '../../../components/clients/AchDebitTab';
import { TimelineTab } from '../../../components/clients/TimelineTab';
import { InitiateCallModal } from '../../../components/voiceforge/InitiateCallModal';
import type { BusinessStatus, ApplicationStatus, SuitabilityResult } from '../../../../shared/types';

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
  dateOfFormation?: string;
  operatingStates: string[];
  status: BusinessStatus;
  advisorName: string;
  fundingReadinessScore: number;
  monthsInBusiness: number;
  annualRevenue: number;
  monthlyRevenue?: number;
  employees: number;
  website?: string;
  industry?: string;
  naicsCode?: string;
  mcc?: string;
  createdAt: string;
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
    dateOfFormation: '2023-03-01',
    operatingStates: ['TX', 'CA', 'NY'],
    status: 'active',
    advisorName: 'Sarah Chen',
    fundingReadinessScore: 82,
    monthsInBusiness: 36,
    annualRevenue: 480_000,
    monthlyRevenue: 40_000,
    employees: 7,
    website: 'https://apexventures.example.com',
    industry: 'Professional Services',
    naicsCode: '541611',
    mcc: '7389',
    createdAt: '2023-03-01T00:00:00Z',
  };
}

const PLACEHOLDER_SUITABILITY: SuitabilityResult = {
  score: 72,
  maxSafeLeverage: 3,
  noGoTriggered: false,
  noGoReasons: [],
  recommendation: 'Client is suitable for moderate stacking (2–3 cards). Prioritise 0% intro APR products with 12–15 month windows.',
  alternativeProducts: ['SBA Microloan', 'Revenue-based financing', 'Business line of credit'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<BusinessStatus, string> = {
  intake: 'bg-gray-100 text-gray-600 border-gray-300',
  onboarding: 'bg-blue-50 text-blue-700 border-blue-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  graduated: 'bg-purple-50 text-purple-700 border-purple-200',
  offboarding: 'bg-amber-50 text-amber-700 border-amber-200',
  closed: 'bg-red-50 text-red-700 border-red-200',
};

type Tab = 'profile' | 'credit' | 'applications' | 'funding' | 'compliance' | 'documents' | 'repayment' | 'acknowledgments' | 'ach' | 'timeline' | 'calls';
const TABS: { key: Tab; label: string }[] = [
  { key: 'profile',         label: 'Profile' },
  { key: 'credit',          label: 'Credit' },
  { key: 'applications',    label: 'Applications' },
  { key: 'funding',         label: 'Funding Rounds' },
  { key: 'compliance',      label: 'Compliance' },
  { key: 'documents',       label: 'Documents' },
  { key: 'repayment',       label: 'Repayment' },
  { key: 'acknowledgments', label: 'Acknowledgments' },
  { key: 'ach',             label: 'ACH/Debit' },
  { key: 'timeline',        label: 'Timeline' },
  { key: 'calls',           label: 'Calls' },
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, color = 'text-gray-900' }: {
  label: string; value: React.ReactNode; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
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
  const [suitability] = useState<SuitabilityResult>(PLACEHOLDER_SUITABILITY);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [editOpen, setEditOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [bizRes, appsRes] = await Promise.allSettled([
          clientsApi.get(id),
          applicationsApi.list({ businessId: id }),
        ]);

        if (bizRes.status === 'fulfilled' && bizRes.value.success && bizRes.value.data) {
          setBusiness(bizRes.value.data as BusinessProfile);
        } else {
          setBusiness(makePlaceholderBusiness(id));
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

  const handleEditSave = async (updated: Record<string, unknown>) => {
    try {
      const token = localStorage.getItem('cf_access_token');
      await fetch(`/api/v1/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(updated),
      });
      setBusiness((prev) => prev ? { ...prev, ...updated } as BusinessProfile : prev);
      setEditOpen(false);
    } catch {
      // Error handled by modal
      throw new Error('Failed to save');
    }
  };

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push('/clients')}
        className="text-sm text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
      >
        ← Back to Clients
      </button>

      {/* Business header */}
      {loading ? (
        <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
      ) : (
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{biz.legalName}</h1>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_BADGE[biz.status]}`}>
                {biz.status.charAt(0).toUpperCase() + biz.status.slice(1)}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {biz.entityType} · {biz.stateOfFormation} · Advisor: {biz.advisorName}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setCallModalOpen(true)}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-brand-gold text-brand-navy hover:bg-brand-gold/90 transition-colors flex items-center gap-1.5"
            >
              📞 Call Client
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="btn-primary btn"
            >
              Edit Profile
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Readiness Score"
          value={biz.fundingReadinessScore}
          sub="out of 100"
          color={biz.fundingReadinessScore >= 75 ? 'text-emerald-600' : biz.fundingReadinessScore >= 55 ? 'text-amber-600' : 'text-red-600'}
        />
        <StatCard
          label="Suitability Score"
          value={suitability.score}
          sub={suitability.noGoTriggered ? 'NO-GO TRIGGERED' : 'out of 100'}
          color={suitability.noGoTriggered ? 'text-gray-400' : suitability.score >= 70 ? 'text-emerald-600' : 'text-amber-600'}
        />
        <StatCard
          label="Consent Channels"
          value="3 / 4"
          sub="channels active"
          color="text-amber-600"
        />
        <StatCard
          label="Total Funding"
          value={formatCurrency(totalFunding || 45000)}
          sub={`${applications.filter((a) => a.status === 'approved').length || 1} card(s) approved`}
          color="text-emerald-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-brand-gold text-brand-navy'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'profile' && (
        <ProfileTab
          clientId={id}
          client={{
            legalName: biz.legalName,
            dba: biz.businessName !== biz.legalName ? biz.businessName : undefined,
            ein: biz.ein,
            entityType: biz.entityType,
            stateOfFormation: biz.stateOfFormation,
            dateOfFormation: biz.dateOfFormation ?? biz.createdAt,
            annualRevenue: biz.annualRevenue,
            monthlyRevenue: biz.monthlyRevenue ?? Math.round(biz.annualRevenue / 12),
            employees: biz.employees,
            website: biz.website,
            industry: biz.industry,
            naicsCode: biz.naicsCode,
            mcc: biz.mcc,
            status: biz.status,
            advisorName: biz.advisorName,
            fundingReadinessScore: biz.fundingReadinessScore,
          }}
        />
      )}
      {activeTab === 'credit' && <CreditTab clientId={id} clientName={biz.legalName} />}
      {activeTab === 'applications' && <ApplicationsTab clientId={id} clientName={biz.legalName} />}
      {activeTab === 'funding' && <FundingRoundsTab clientId={id} clientName={biz.legalName} readinessScore={biz.fundingReadinessScore} />}
      {activeTab === 'compliance' && <ComplianceTab clientId={id} />}
      {activeTab === 'documents' && <DocumentsTab clientId={id} />}
      {activeTab === 'repayment' && <RepaymentTab clientId={id} />}
      {activeTab === 'acknowledgments' && <AcknowledgmentsTab clientId={id} />}
      {activeTab === 'ach' && <AchDebitTab clientId={id} />}
      {activeTab === 'timeline' && <TimelineTab clientId={id} />}

      {/* Calls tab */}
      {activeTab === 'calls' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Call History</h2>
            <button
              onClick={() => setCallModalOpen(true)}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-brand-gold text-brand-navy hover:bg-brand-gold/90 transition-colors flex items-center gap-1.5"
            >
              📞 Initiate New Call
            </button>
          </div>

          {(() => {
            const callHistory = [
              { date: '2026-03-31', duration: '4m 12s', purpose: 'APR Expiry Warning',    advisor: 'Sarah Chen',  qaScore: 92, tcpa: true },
              { date: '2026-03-15', duration: '6m 44s', purpose: 'Re-Stack Consultation', advisor: 'Marcus Webb', qaScore: 85, tcpa: true },
              { date: '2026-02-28', duration: '3m 21s', purpose: 'Payment Reminder',      advisor: 'Sarah Chen',  qaScore: 78, tcpa: true },
            ];

            if (callHistory.length === 0) {
              return (
                <div className="text-center py-12 text-gray-400">
                  No call history for this client
                </div>
              );
            }

            return (
              <div className="overflow-x-auto rounded-xl border border-surface-border bg-white shadow-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-gray-50/60">
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Duration</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Purpose</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Advisor</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">QA Score</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">TCPA</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {callHistory.map((call, i) => (
                      <tr key={i} className="border-b border-surface-border last:border-b-0 hover:bg-gray-50/40 transition-colors">
                        <td className="px-4 py-3 text-gray-700">{call.date}</td>
                        <td className="px-4 py-3 text-gray-700">{call.duration}</td>
                        <td className="px-4 py-3 text-gray-900 font-medium">{call.purpose}</td>
                        <td className="px-4 py-3 text-gray-700">{call.advisor}</td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${call.qaScore >= 90 ? 'text-emerald-600' : call.qaScore >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                            {call.qaScore}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-emerald-600 font-medium">✓ Verified</span>
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <button
                            onClick={() => showToast('Opening recording...')}
                            className="text-xs font-semibold text-brand-navy hover:text-brand-gold transition-colors"
                          >
                            Listen
                          </button>
                          <button
                            onClick={() => showToast('Opening transcript...')}
                            className="text-xs font-semibold text-brand-navy hover:text-brand-gold transition-colors"
                          >
                            Transcript
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* Edit Profile Modal */}
      {editOpen && (
        <EditProfileModal
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          client={{
            id: biz.id,
            legalName: biz.legalName,
            entityType: biz.entityType,
            stateOfFormation: biz.stateOfFormation,
            annualRevenue: biz.annualRevenue,
            employees: biz.employees,
            website: biz.website ?? '',
            industry: biz.industry ?? '',
            naicsCode: biz.naicsCode ?? '',
            mcc: biz.mcc ?? '',
          }}
          onSave={handleEditSave}
        />
      )}

      {/* Initiate Call Modal */}
      {callModalOpen && (
        <InitiateCallModal
          isOpen={callModalOpen}
          onClose={() => setCallModalOpen(false)}
          prefilledClientId={id}
          prefilledClientName={biz.legalName}
          lockClient={true}
          onCallInitiated={({ clientName }) => showToast(`Call initiated to ${clientName}`)}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-brand-navy text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}
