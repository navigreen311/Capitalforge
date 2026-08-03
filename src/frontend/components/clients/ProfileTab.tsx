'use client';

// ============================================================
// ProfileTab — Enhanced profile tab for client detail page.
// Business details, industry/NAICS, owners & principals (left),
// suitability, consent, acknowledgments, ACH auth (right).
// ============================================================

import { useState, useCallback, useMemo } from 'react';
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

  // The endpoint answers 404 when the client has no authorization on file,
  // which is the state every client is in until one is taken — including every
  // client on the day they are onboarded.
  //
  // The empty state below already said so, and was unreachable: the 404 landed
  // in the error branch above it, so a new client's page showed "Something
  // went wrong — No ACH authorization on file for this client" with a Retry
  // button, next to a heading that read ACH Authorization. Retrying could
  // never succeed, because nothing was wrong.
  //
  // AchDebitTab, which renders the same record on the client's ACH tab, has
  // always handled this correctly. This card is the copy that did not.
  const notOnFile = error?.type === 'server_error' && error.status === 404;

  if (error && !notOnFile) {
    return (
      <SectionCard title="ACH Authorization">
        <DashboardErrorState error={error} onRetry={refetch} />
      </SectionCard>
    );
  }

  if (notOnFile || !achAuth) {
    return (
      <SectionCard title="ACH Authorization">
        <div className="rounded-lg border border-dashed border-surface-border bg-gray-50 p-5 text-center">
          <p className="text-sm font-medium text-gray-700">None on file</p>
          <p className="mt-1 text-xs text-gray-500">
            No ACH authorization has been taken from this client.
          </p>
        </div>
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
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useAuthFetch<ConsentRecord[]>(
    `/api/businesses/${clientId}/consent`,
  );
  const records = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const handleRequestConsent = useCallback(async (channel: ConsentChannel) => {
    setRequesting(channel);
    setRequestNotice(null);
    try {
      const response = await apiClient.post<unknown>(
        `/v1/clients/${clientId}/consent/request`,
        { channel },
      );
      // This endpoint is a stub — it dispatches nothing. Reporting a silent
      // success would suggest the client had been contacted for re-consent.
      const meta = (response as { meta?: { stub?: boolean } }).meta;
      setRequestNotice(
        meta?.stub
          ? 'Re-consent requests are not wired up yet — nothing was sent.'
          : 'Re-consent request sent.',
      );
      refetch();
    } catch (err) {
      console.error('[ConsentSection] re-consent request failed:', err);
      setRequestNotice('Could not send the re-consent request.');
    } finally {
      setRequesting(null);
    }
  }, [clientId, refetch]);

  if (isLoading) return <SkeletonCard lines={4} title="consent status" />;

  if (error) {
    return (
      <SectionCard title="Consent Status">
        <DashboardErrorState error={error} onRetry={refetch} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Consent Status">
      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-border bg-gray-50 p-5 text-center">
          <p className="text-sm font-medium text-gray-700">No consent on record</p>
          <p className="mt-1 text-xs text-gray-500">
            No channel may be contacted until consent is captured.
          </p>
        </div>
      ) : (
        <ConsentStatusGrid
          records={records}
          onRequestConsent={(ch) => {
            if (requesting) return; // prevent double-click
            handleRequestConsent(ch);
          }}
        />
      )}
      {requesting && (
        <p className="text-xs text-blue-500 mt-2 animate-pulse">Requesting re-consent for {requesting}...</p>
      )}
      {requestNotice && (
        <p className="text-xs text-amber-700 mt-2">{requestNotice}</p>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Suitability
// ---------------------------------------------------------------------------

function SuitabilitySection({ clientId }: { clientId: string }) {
  const { data, isLoading, error, refetch } = useAuthFetch<SuitabilityResult>(
    `/api/businesses/${clientId}/suitability/latest`,
  );

  if (isLoading) return <SkeletonCard lines={4} title="suitability" />;

  // The endpoint answers 404 when no assessment has been run. That is a real
  // state, and showing it matters: this panel previously rendered a fixed
  // score of 72 with a "suitable for moderate stacking" recommendation for
  // every client, assessed or not.
  const notAssessed = error?.type === 'server_error' && error.status === 404;
  if (notAssessed || (!error && !data)) {
    return (
      <SectionCard title="Suitability">
        <div className="rounded-lg border border-dashed border-surface-border bg-gray-50 p-5 text-center">
          <p className="text-sm font-medium text-gray-700">Not assessed</p>
          <p className="mt-1 text-xs text-gray-500">
            No suitability check has been run for this client.
          </p>
        </div>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="Suitability">
        <DashboardErrorState error={error} onRetry={refetch} />
      </SectionCard>
    );
  }

  return <SuitabilityIndicator result={data as SuitabilityResult} />;
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
        <SuitabilitySection clientId={clientId} />
        <ConsentSection clientId={clientId} />
        <AcknowledgmentCard clientId={clientId} />
        <AchAuthorizationCard clientId={clientId} />
      </div>
    </div>
  );
}
