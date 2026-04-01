'use client';

// ============================================================
// ProfileTab — Enhanced profile tab for client detail page.
// Business details, industry/NAICS, owners & principals (left),
// suitability, consent, acknowledgments, ACH auth (right).
// ============================================================

import { useState, useCallback } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import SuitabilityIndicator from '@/components/modules/suitability-indicator';
import ConsentStatusGrid from '@/components/modules/consent-status-grid';
import { SectionCard } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import type { SuitabilityResult, ConsentChannel } from '../../../shared/types';
import type { ConsentRecord } from '@/components/modules/consent-status-grid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileTabProps {
  clientId: string;
  client: {
    legalName: string;
    dba?: string;
    ein: string;
    entityType: string;
    stateOfFormation: string;
    dateOfFormation: string;
    annualRevenue: number;
    monthlyRevenue: number;
    employees: number;
    website?: string;
    industry?: string;
    naicsCode?: string;
    mcc?: string;
    status: string;
    advisorName: string;
    fundingReadinessScore: number;
  };
}

interface Owner {
  id: string;
  name: string;
  ownershipPercent: number;
  title: string;
  personalGuarantee: boolean;
  kycVerified: boolean;
}

interface Acknowledgment {
  id: string;
  type: string;
  label: string;
  signed: boolean;
  signedAt?: string;
}

interface AchAuthorization {
  status: 'active' | 'revoked' | 'suspended';
  authorizedAmount: number;
  frequency: string;
  bankLast4: string;
  authorizedAt: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_SUITABILITY: SuitabilityResult = {
  score: 72,
  maxSafeLeverage: 3,
  noGoTriggered: false,
  noGoReasons: [],
  recommendation:
    'Client is suitable for moderate stacking (2-3 cards). Prioritise 0% intro APR products with 12-15 month windows.',
  alternativeProducts: ['SBA Microloan', 'Revenue-based financing', 'Business line of credit'],
};

const PLACEHOLDER_CONSENT: ConsentRecord[] = [
  { channel: 'voice', status: 'active', consentType: 'tcpa', grantedAt: '2026-01-10T00:00:00Z', expiresAt: '2027-01-10T00:00:00Z' },
  { channel: 'sms', status: 'active', consentType: 'tcpa', grantedAt: '2026-01-10T00:00:00Z', expiresAt: '2027-01-10T00:00:00Z' },
  { channel: 'email', status: 'active', consentType: 'data_sharing', grantedAt: '2026-01-10T00:00:00Z' },
  { channel: 'partner', status: 'revoked', consentType: 'referral', grantedAt: '2025-06-01T00:00:00Z', revokedAt: '2026-02-20T00:00:00Z' },
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
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function SkeletonBlock({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-3 animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-gray-800 rounded w-full" style={{ width: `${85 - i * 10}%` }} />
      ))}
    </div>
  );
}

function SkeletonCard({ lines = 4, title }: { lines?: number; title?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      {title && <div className="h-4 bg-gray-800 rounded w-1/3 mb-4" />}
      <SkeletonBlock lines={lines} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Business Details panel */
function BusinessDetailsPanel({ client }: { client: ProfileTabProps['client'] }) {
  const fields = [
    { label: 'Legal Name', value: client.legalName },
    { label: 'DBA', value: client.dba ?? '---' },
    { label: 'EIN', value: client.ein },
    { label: 'Entity Type', value: client.entityType },
    { label: 'State of Formation', value: client.stateOfFormation },
    { label: 'Date of Formation', value: formatDate(client.dateOfFormation) },
    { label: 'Annual Revenue', value: formatCurrency(client.annualRevenue) },
    { label: 'Monthly Revenue', value: formatCurrency(client.monthlyRevenue) },
    { label: 'Employees', value: String(client.employees) },
    { label: 'Website', value: client.website ?? '---' },
    { label: 'Status', value: client.status.charAt(0).toUpperCase() + client.status.slice(1) },
    { label: 'Advisor', value: client.advisorName },
    { label: 'Funding Readiness', value: `${client.fundingReadinessScore} / 100` },
  ];

  return (
    <SectionCard title="Business Details">
      <div className="space-y-2">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm border-b border-gray-200 pb-2 last:border-0 last:pb-0">
            <span className="text-gray-500">{label}</span>
            <span className="text-gray-900 font-medium text-right max-w-[60%]">{value}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/** Industry / NAICS Code section */
function IndustrySection({ client }: { client: ProfileTabProps['client'] }) {
  const fields = [
    { label: 'Industry', value: client.industry ?? '---' },
    { label: 'NAICS Code', value: client.naicsCode ?? '---' },
    { label: 'Primary MCC', value: client.mcc ?? '---' },
  ];

  return (
    <SectionCard
      title="Industry / NAICS Code"
      action={
        <button className="text-xs text-blue-600 hover:text-blue-500 font-semibold transition-colors">
          Edit Profile
        </button>
      }
    >
      <div className="space-y-2">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm border-b border-gray-200 pb-2 last:border-0 last:pb-0">
            <span className="text-gray-500">{label}</span>
            <span className="text-gray-900 font-medium">{value}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/** Owners & Principals section */
function OwnersSection({ clientId }: { clientId: string }) {
  const { data: owners, isLoading, error, refetch } = useAuthFetch<Owner[]>(
    `/api/v1/clients/${clientId}/owners`,
  );

  if (isLoading) return <SkeletonCard lines={5} title="owners" />;

  if (error) {
    return (
      <SectionCard title="Owners & Principals">
        <DashboardErrorState error={error} onRetry={refetch} />
      </SectionCard>
    );
  }

  const ownerList = owners ?? [];
  const MIN_REQUIRED_OWNERS = 1;

  return (
    <SectionCard
      title="Owners & Principals"
      subtitle={`${ownerList.length} owner(s) on file`}
      action={
        ownerList.length < MIN_REQUIRED_OWNERS ? (
          <button className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors">
            + Add Owner
          </button>
        ) : undefined
      }
    >
      {ownerList.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No owners on file. Add at least one owner to proceed.</p>
      ) : (
        <div className="space-y-3">
          {ownerList.map((owner) => (
            <div key={owner.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{owner.name}</p>
                  <p className="text-xs text-gray-500">{owner.title}</p>
                </div>
                <span className="text-sm font-bold text-gray-700">{owner.ownershipPercent}%</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    owner.personalGuarantee
                      ? 'bg-green-50 text-green-700 border-green-300'
                      : 'bg-gray-100 text-gray-500 border-gray-300'
                  }`}
                >
                  {owner.personalGuarantee ? 'PG: Yes' : 'PG: No'}
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    owner.kycVerified
                      ? 'bg-green-50 text-green-700 border-green-300'
                      : 'bg-yellow-50 text-yellow-700 border-yellow-300'
                  }`}
                >
                  {owner.kycVerified ? 'KYC Verified' : 'KYC Pending'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/** Acknowledgment Status card */
function AcknowledgmentCard({ clientId }: { clientId: string }) {
  const { data: acknowledgments, isLoading, error, refetch } = useAuthFetch<Acknowledgment[]>(
    `/api/v1/clients/${clientId}/acknowledgments`,
  );
  const [requesting, setRequesting] = useState<string | null>(null);

  const handleRequestSignature = useCallback(async (ackId: string) => {
    setRequesting(ackId);
    try {
      await apiClient.post(`/v1/clients/${clientId}/acknowledgments/${ackId}/request-signature`);
      refetch();
    } catch (err) {
      console.error('[AcknowledgmentCard] request signature failed:', err);
    } finally {
      setRequesting(null);
    }
  }, [clientId, refetch]);

  if (isLoading) return <SkeletonCard lines={4} title="acknowledgments" />;

  if (error) {
    return (
      <SectionCard title="Acknowledgment Status">
        <DashboardErrorState error={error} onRetry={refetch} />
      </SectionCard>
    );
  }

  const ackList = acknowledgments ?? [];

  return (
    <SectionCard title="Acknowledgment Status" subtitle={`${ackList.filter((a) => a.signed).length} / ${ackList.length} signed`}>
      {ackList.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No acknowledgments required.</p>
      ) : (
        <ul className="space-y-2">
          {ackList.map((ack) => (
            <li key={ack.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-base leading-none" aria-hidden="true">
                  {ack.signed ? '\u2705' : '\u26A0\uFE0F'}
                </span>
                <span className={ack.signed ? 'text-gray-700' : 'text-gray-900 font-medium'}>
                  {ack.label}
                </span>
              </div>
              {ack.signed ? (
                <span className="text-xs text-gray-400">{ack.signedAt ? formatDate(ack.signedAt) : 'Signed'}</span>
              ) : (
                <button
                  onClick={() => handleRequestSignature(ack.id)}
                  disabled={requesting === ack.id}
                  className="text-xs text-blue-600 hover:text-blue-500 font-semibold transition-colors disabled:opacity-50"
                >
                  {requesting === ack.id ? 'Sending...' : 'Request Signature'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** ACH Authorization card */
function AchAuthorizationCard({ clientId }: { clientId: string }) {
  const { data: achAuth, isLoading, error, refetch } = useAuthFetch<AchAuthorization>(
    `/api/v1/clients/${clientId}/ach-authorization`,
  );
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const handleRevoke = useCallback(async () => {
    setRevoking(true);
    try {
      await apiClient.post(`/v1/clients/${clientId}/ach-authorization/revoke`);
      setShowRevokeConfirm(false);
      refetch();
    } catch (err) {
      console.error('[AchAuthorizationCard] revoke failed:', err);
    } finally {
      setRevoking(false);
    }
  }, [clientId, refetch]);

  if (isLoading) return <SkeletonCard lines={4} title="ach" />;

  if (error) {
    return (
      <SectionCard title="ACH Authorization">
        <DashboardErrorState error={error} onRetry={refetch} />
      </SectionCard>
    );
  }

  if (!achAuth) {
    return (
      <SectionCard title="ACH Authorization">
        <p className="text-sm text-gray-400 text-center py-4">No ACH authorization on file.</p>
      </SectionCard>
    );
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-50 text-green-700 border-green-300',
    revoked: 'bg-red-50 text-red-700 border-red-300',
    suspended: 'bg-yellow-50 text-yellow-700 border-yellow-300',
  };

  return (
    <SectionCard title="ACH Authorization">
      <div className="space-y-3">
        {/* Status */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Status</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusColors[achAuth.status] ?? statusColors.suspended}`}>
            {achAuth.status.charAt(0).toUpperCase() + achAuth.status.slice(1)}
          </span>
        </div>

        {/* Amount */}
        <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-2">
          <span className="text-gray-500">Authorized Amount</span>
          <span className="text-gray-900 font-medium">{formatCurrency(achAuth.authorizedAmount)}</span>
        </div>

        {/* Frequency */}
        <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-2">
          <span className="text-gray-500">Frequency</span>
          <span className="text-gray-900 font-medium">{achAuth.frequency}</span>
        </div>

        {/* Bank */}
        <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-2">
          <span className="text-gray-500">Bank Account</span>
          <span className="text-gray-900 font-medium">****{achAuth.bankLast4}</span>
        </div>

        {/* Authorized date */}
        <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-2">
          <span className="text-gray-500">Authorized</span>
          <span className="text-gray-900 font-medium">{formatDate(achAuth.authorizedAt)}</span>
        </div>

        {/* Revoke action */}
        {achAuth.status === 'active' && (
          <div className="pt-2 border-t border-gray-200">
            {showRevokeConfirm ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700 mb-2">
                  Are you sure you want to revoke this ACH authorization? This action cannot be undone.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRevoke}
                    disabled={revoking}
                    className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                  >
                    {revoking ? 'Revoking...' : 'Confirm Revoke'}
                  </button>
                  <button
                    onClick={() => setShowRevokeConfirm(false)}
                    className="px-3 py-1 rounded-lg border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowRevokeConfirm(true)}
                className="text-xs text-red-600 hover:text-red-500 font-semibold transition-colors"
              >
                Revoke Authorization
              </button>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

/** Consent section with re-consent request */
function ConsentSection({ clientId }: { clientId: string }) {
  const [requesting, setRequesting] = useState<ConsentChannel | null>(null);

  const handleRequestConsent = useCallback(async (channel: ConsentChannel) => {
    setRequesting(channel);
    try {
      await apiClient.post(`/v1/clients/${clientId}/consent/request`, { channel });
    } catch (err) {
      console.error('[ConsentSection] re-consent request failed:', err);
    } finally {
      setRequesting(null);
    }
  }, [clientId]);

  return (
    <SectionCard title="Consent Status">
      <ConsentStatusGrid
        records={PLACEHOLDER_CONSENT}
        onRequestConsent={(ch) => {
          if (requesting) return; // prevent double-click
          handleRequestConsent(ch);
        }}
      />
      {requesting && (
        <p className="text-xs text-blue-500 mt-2 animate-pulse">Requesting re-consent for {requesting}...</p>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProfileTab({ clientId, client }: ProfileTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Left column (2/3) ── */}
      <div className="lg:col-span-2 space-y-6">
        <BusinessDetailsPanel client={client} />
        <IndustrySection client={client} />
        <OwnersSection clientId={clientId} />
      </div>

      {/* ── Right column (1/3) ── */}
      <div className="space-y-6">
        <SuitabilityIndicator result={PLACEHOLDER_SUITABILITY} />
        <ConsentSection clientId={clientId} />
        <AcknowledgmentCard clientId={clientId} />
        <AchAuthorizationCard clientId={clientId} />
      </div>
    </div>
  );
}
