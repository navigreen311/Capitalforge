'use client';

// ============================================================
// ApplicationDetailDrawer — Right slide-over panel (480px) that
// displays full application details including APR countdown,
// compliance status, documents, timeline, and action buttons.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { DashboardBadge, type DashboardBadgeStatus } from '@/components/dashboard/DashboardBadge';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ApplicationDetailDrawerProps {
  appId: string | null; // null = closed
  onClose: () => void;
}

interface ApplicationDetail {
  id: string;
  card_product: string;
  issuer: string;
  client_name: string;
  client_id: string;
  round: string;
  status: DashboardBadgeStatus;
  requested_amount: number;
  approved_amount: number | null;
  applied_date: string;
  decision_date: string | null;
  business_purpose: string;
  // APR fields (approved)
  apr_days_remaining: number | null;
  apr_expiry_date: string | null;
  balance_at_risk: number | null;
  // Decline fields
  decline_reason: string | null;
  adverse_action_date: string | null;
  // Compliance
  consent_status: 'complete' | 'pending' | 'missing';
  acknowledgment_status: 'complete' | 'pending' | 'missing';
  pre_submission_checklist: 'complete' | 'pending' | 'missing';
  // Documents
  documents: { id: string; name: string; type: string }[];
  // Timeline
  timeline: { date: string; title: string; actor: string }[];
}

// ── Mock fallback data ──────────────────────────────────────────────────────

function getMockDetail(appId: string): ApplicationDetail {
  return {
    id: appId,
    card_product: 'Business Platinum Card',
    issuer: 'Chase',
    client_name: 'Riverside Medical Group LLC',
    client_id: 'cli_8f3a2b',
    round: 'R2',
    status: 'approved',
    requested_amount: 50000,
    approved_amount: 42500,
    applied_date: '2026-03-10',
    decision_date: '2026-03-15',
    business_purpose: 'Equipment purchase and working capital for Q2 expansion',
    apr_days_remaining: 18,
    apr_expiry_date: '2026-04-19',
    balance_at_risk: 42500,
    decline_reason: null,
    adverse_action_date: null,
    consent_status: 'complete',
    acknowledgment_status: 'complete',
    pre_submission_checklist: 'pending',
    documents: [
      { id: 'doc_001', name: 'Business License.pdf', type: 'License' },
      { id: 'doc_002', name: 'Bank Statements Q1.pdf', type: 'Financial' },
    ],
    timeline: [
      { date: '2026-03-15T14:30:00Z', title: 'Application Approved', actor: 'Chase Underwriting' },
      { date: '2026-03-14T09:15:00Z', title: 'Credit Pull Completed', actor: 'System' },
      { date: '2026-03-12T16:45:00Z', title: 'Documents Verified', actor: 'Sarah Chen' },
      { date: '2026-03-11T11:00:00Z', title: 'Application Submitted to Issuer', actor: 'System' },
      { date: '2026-03-10T08:30:00Z', title: 'Application Created', actor: 'James Walker' },
    ],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(Number(value))) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '\u2014';
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function turnaroundDays(applied: string | null | undefined, decided: string | null | undefined): string {
  if (!applied || !decided) return '\u2014';
  const a = new Date(applied);
  const b = new Date(decided);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '\u2014';
  const ms = b.getTime() - a.getTime();
  return `${Math.round(ms / (1000 * 60 * 60 * 24))} days`;
}

type ComplianceLevel = 'complete' | 'pending' | 'missing';

function complianceIcon(status: ComplianceLevel): string {
  if (status === 'complete') return '\u2705';
  if (status === 'pending') return '\u26A0\uFE0F';
  return '\u274C';
}

function complianceLabel(status: ComplianceLevel): string {
  if (status === 'complete') return 'Complete';
  if (status === 'pending') return 'Pending';
  return 'Missing';
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function DrawerSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
        <div className="flex gap-2">
          <div className="h-6 bg-gray-200 rounded-full w-16" />
          <div className="h-6 bg-gray-200 rounded-full w-20" />
        </div>
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-16 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Section Components ──────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
      {title}
    </h4>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-brand-navy' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ApplicationDetailDrawer({ appId, onClose }: ApplicationDetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading, error, refetch } = useAuthFetch<ApplicationDetail>(
    `/api/v1/applications/${appId}`,
  );

  // Use fetched data or fall back to mock
  const app = data ?? (appId ? getMockDetail(appId) : null);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!appId) return;
    document.addEventListener('keydown', handleKeyDown);
    // Focus the close button when drawer opens
    closeButtonRef.current?.focus();
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [appId, handleKeyDown]);

  if (!appId) return null;

  return (
    <>
      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s ease-out;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-white shadow-xl z-50 flex flex-col animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label="Application details"
      >
        {/* Error state */}
        {error && !data && (
          <div className="flex-1 flex items-center justify-center p-6">
            <DashboardErrorState error={error} onRetry={refetch} />
          </div>
        )}

        {/* Loading state */}
        {isLoading && !app && <DrawerSkeleton />}

        {/* Content */}
        {app && (
          <>
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-200">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {app.card_product}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                    {app.issuer}
                  </span>
                  <span className="text-sm text-gray-600 truncate">{app.client_name}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center rounded-full bg-brand-navy/10 px-2.5 py-0.5 text-xs font-semibold text-brand-navy">
                    {app.round}
                  </span>
                  <DashboardBadge status={app.status} />
                </div>
              </div>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                aria-label="Close panel"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Scrollable body ────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* ── APR Countdown / Decline Info ──────────────────── */}
              {app.status === 'approved' && app.apr_days_remaining != null && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <SectionHeader title="APR Countdown" />
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold text-amber-700">
                      {app.apr_days_remaining}
                    </span>
                    <span className="text-sm text-amber-600">days remaining</span>
                  </div>
                  {app.apr_expiry_date && (
                    <p className="text-sm text-gray-600 mt-1">
                      Expires {formatDate(app.apr_expiry_date)}
                    </p>
                  )}
                  {app.balance_at_risk != null && (
                    <p className="text-sm text-gray-600 mt-0.5">
                      Balance at risk: <span className="font-semibold text-gray-900">{formatCurrency(app.balance_at_risk)}</span>
                    </p>
                  )}
                  <button
                    type="button"
                    className="mt-3 w-full text-center text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy/90 rounded-lg px-4 py-2 transition-colors"
                  >
                    Contact Client About Repayment
                  </button>
                </div>
              )}

              {app.status === 'declined' && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <SectionHeader title="Decline Details" />
                  {app.decline_reason && (
                    <p className="text-sm text-gray-700 mb-1">
                      <span className="font-medium">Reason:</span> {app.decline_reason}
                    </p>
                  )}
                  {app.adverse_action_date && (
                    <p className="text-sm text-gray-600 mb-3">
                      Adverse action date: {formatDate(app.adverse_action_date)}
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="w-full text-center text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy/90 rounded-lg px-4 py-2 transition-colors"
                    >
                      Start Reconsideration
                    </button>
                    <a
                      href={`/clients/${app.client_id}/credit-repair`}
                      className="w-full text-center text-sm font-medium text-brand-navy hover:underline py-1"
                    >
                      Route to Credit Repair Plan
                    </a>
                  </div>
                </div>
              )}

              {/* ── Application Details ──────────────────────────── */}
              <div>
                <SectionHeader title="Application Details" />
                <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-1">
                  <DetailRow label="Requested" value={formatCurrency(app.requested_amount)} />
                  {app.approved_amount != null && (
                    <DetailRow
                      label="Approved"
                      value={
                        <span>
                          {formatCurrency(app.approved_amount)}
                          {app.requested_amount ? (
                            <span className="ml-1.5 text-xs text-gray-400">
                              ({Math.round((Number(app.approved_amount) / Number(app.requested_amount)) * 100)}% of requested)
                            </span>
                          ) : null}
                        </span>
                      }
                      highlight
                    />
                  )}
                  <DetailRow label="Applied" value={formatDate(app.applied_date)} />
                  {app.decision_date && (
                    <>
                      <DetailRow
                        label={app.status === 'declined' ? 'Declined' : 'Approved'}
                        value={formatDate(app.decision_date)}
                      />
                      <DetailRow
                        label="Turnaround"
                        value={turnaroundDays(app.applied_date, app.decision_date)}
                      />
                    </>
                  )}
                  <DetailRow label="Business Purpose" value={app.business_purpose} />
                </div>
              </div>

              {/* ── Compliance ────────────────────────────────────── */}
              <div>
                <SectionHeader title="Compliance" />
                <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Consent Status</span>
                    <span>
                      {complianceIcon(app.consent_status)}{' '}
                      <span className="font-medium text-gray-900">{complianceLabel(app.consent_status)}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Acknowledgment</span>
                    <span className="flex items-center gap-2">
                      {complianceIcon(app.acknowledgment_status)}{' '}
                      <span className="font-medium text-gray-900">{complianceLabel(app.acknowledgment_status)}</span>
                      {app.acknowledgment_status === 'missing' && (
                        <a
                          href={`/compliance/acknowledgment?app_id=${app.id}&client_id=${app.client_id}`}
                          className="text-xs font-medium hover:underline"
                          style={{ color: '#C9A84C' }}
                        >
                          Send Acknowledgment &rarr;
                        </a>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Pre-submission Checklist</span>
                    <span className="flex items-center gap-2">
                      {complianceIcon(app.pre_submission_checklist)}{' '}
                      <span className="font-medium text-gray-900">{complianceLabel(app.pre_submission_checklist)}</span>
                      {(app.pre_submission_checklist === 'missing' || app.pre_submission_checklist === 'pending') && (
                        <a
                          href={`/compliance/checklist?app_id=${app.id}&client_id=${app.client_id}`}
                          className="text-xs font-medium hover:underline"
                          style={{ color: '#C9A84C' }}
                        >
                          Complete Checklist &rarr;
                        </a>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Documents ─────────────────────────────────────── */}
              <div>
                <SectionHeader title="Documents" />
                <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                  {app.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                        <p className="text-xs text-gray-400">{doc.type}</p>
                      </div>
                      <a
                        href={`/documents/${doc.id}`}
                        className="text-xs font-medium text-brand-navy hover:underline flex-shrink-0 ml-3"
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 w-full text-center text-sm font-medium text-brand-navy border border-brand-navy/30 hover:bg-brand-navy/5 rounded-lg px-4 py-2 transition-colors"
                >
                  Upload Document
                </button>
              </div>

              {/* ── Activity Timeline ─────────────────────────────── */}
              <div>
                <SectionHeader title="Activity Timeline" />
                <div className="space-y-0">
                  {app.timeline.map((event, idx) => (
                    <div key={idx} className="relative flex gap-3 pb-4 last:pb-0">
                      {/* Vertical line */}
                      {idx < app.timeline.length - 1 && (
                        <div className="absolute left-[7px] top-4 bottom-0 w-px bg-gray-200" aria-hidden="true" />
                      )}
                      {/* Dot */}
                      <div className="relative mt-1 flex-shrink-0">
                        <div className={`w-[15px] h-[15px] rounded-full border-2 ${idx === 0 ? 'border-brand-navy bg-brand-navy/20' : 'border-gray-300 bg-white'}`} />
                      </div>
                      {/* Content */}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{event.title}</p>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(event.date)} &middot; {event.actor}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Actions Footer ──────────────────────────────────── */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50/50">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`/applications/${app.id}`}
                  className="text-center text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy/90 rounded-lg px-3 py-2 transition-colors"
                >
                  View Full Detail
                </a>
                <a
                  href={`/documents/export?app_id=${app.id}`}
                  className="text-center text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
                >
                  Export Dossier
                </a>
                <a
                  href={`/voiceforge/outreach?client_id=${app.client_id}`}
                  className="text-center text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
                >
                  Contact Client
                </a>
                <button
                  type="button"
                  className="text-center text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
                >
                  Add Note
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
