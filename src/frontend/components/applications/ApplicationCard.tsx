'use client';

// ============================================================
// ApplicationCard — Enhanced kanban card for the pipeline board.
// Shows APR countdown, consent status, acknowledgment badges,
// round indicator, and urgency highlighting.
// ============================================================

import React, { useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ApplicationCardApp {
  id: string;
  client_id: string;
  client_name: string;
  card_product: string;
  issuer: string;
  round_number: number | null;
  round_id: string | null;
  requested: number;
  approved: number | null;
  status: string;
  apr_days_remaining: number | null;
  consent_status: string;
  missing_consent?: string;
  acknowledgment_status: string;
  submitted_date: string;
  days_in_stage: number;
  business_purpose?: string;
  decline_reason?: string;
  /** Assigned advisor full name — used for initials avatar */
  advisor?: string;
}

export interface ApplicationCardProps {
  app: ApplicationCardApp;
  onClick: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft:           'bg-gray-100 text-gray-700 border-gray-300',
  pending_consent: 'bg-blue-50 text-blue-700 border-blue-300',
  submitted:       'bg-amber-50 text-amber-700 border-amber-300',
  approved:        'bg-green-50 text-green-700 border-green-300',
  declined:        'bg-red-50 text-red-700 border-red-300',
};

function statusLabel(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function aprPillClasses(days: number): string {
  if (days <= 15) return 'bg-red-100 text-red-700 border-red-300';
  if (days <= 60) return 'bg-amber-100 text-amber-700 border-amber-300';
  return 'bg-green-100 text-green-700 border-green-300';
}

function daysInStageClasses(days: number): string {
  if (days > 14) return 'text-red-600 font-semibold';
  if (days > 7)  return 'text-amber-600 font-semibold';
  return 'text-gray-500';
}

const CONSENT_DOT_COLOR: Record<string, string> = {
  complete: 'bg-emerald-500',
  pending:  'bg-amber-400',
  blocked:  'bg-red-500',
};

function consentDotColor(status: string): string {
  return CONSENT_DOT_COLOR[status] ?? 'bg-red-500';
}

function consentDotTitle(status: string): string {
  if (status === 'complete') return 'Consent complete';
  if (status === 'pending') return 'Consent pending';
  return 'Consent missing';
}

function advisorInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ── Component ───────────────────────────────────────────────────────────────

export function ApplicationCard({ app, onClick }: ApplicationCardProps) {
  const [declineOpen, setDeclineOpen] = useState(false);

  const isUrgent = app.apr_days_remaining !== null && app.apr_days_remaining <= 15;

  const cardClasses = [
    'rounded-xl border bg-white shadow-card cursor-pointer',
    'hover:shadow-card-hover transition-all duration-150',
    isUrgent
      ? 'border-l-[3px] border-l-red-500 border-t-surface-border border-r-surface-border border-b-surface-border bg-red-50'
      : 'border-surface-border',
  ].join(' ');

  return (
    <div className={cardClasses} onClick={onClick} role="button" tabIndex={0}>
      <div className="p-3 space-y-2">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate leading-snug">
              {app.client_name}
            </p>
            <p className="text-xs text-gray-500 truncate inline-flex items-center gap-1">
              {app.card_product} &middot;{' '}
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${consentDotColor(app.consent_status)}`}
                title={consentDotTitle(app.consent_status)}
              />
              {app.issuer}
            </p>
          </div>

          {/* Round badge */}
          <span
            className={`shrink-0 text-2xs font-bold px-1.5 py-0.5 rounded-full border ${
              app.round_number !== null
                ? 'bg-teal-50 text-teal-700 border-teal-300'
                : 'bg-gray-100 text-gray-500 border-gray-300'
            }`}
          >
            {app.round_number !== null ? `R${app.round_number}` : 'R-'}
          </span>
        </div>

        {/* ── Status + APR row ───────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status badge */}
          <span
            className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${
              STATUS_BADGE_CLASSES[app.status] ?? 'bg-gray-100 text-gray-700 border-gray-300'
            }`}
          >
            {statusLabel(app.status)}
          </span>

          {/* APR countdown pill */}
          {app.apr_days_remaining !== null && (
            <span
              className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${aprPillClasses(
                app.apr_days_remaining,
              )}`}
            >
              {'\u23F1'} {app.apr_days_remaining}d left
            </span>
          )}

          {/* Acknowledgment required badge */}
          {app.status === 'draft' && app.acknowledgment_status !== 'signed' && (
            <span className="text-2xs font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-300">
              {'\u26A0'} Ack Required
            </span>
          )}
        </div>

        {/* ── Amount ─────────────────────────────────────────── */}
        <div className="text-xs text-gray-600">
          <span>Requested: {formatCurrency(app.requested)}</span>
          {app.approved !== null && (
            <span className="text-green-700 font-semibold">
              {' \u2192 '}Approved: {formatCurrency(app.approved)}
            </span>
          )}
        </div>

        {/* ── Missing consent warning ────────────────────────── */}
        {app.status === 'pending_consent' && app.missing_consent && (
          <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            <p className="text-2xs text-amber-800 leading-tight">
              {'\u26A0'} {app.missing_consent} consent required
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Placeholder: trigger consent request flow
              }}
              className="shrink-0 text-2xs font-semibold text-amber-700 hover:text-amber-900
                         bg-amber-100 hover:bg-amber-200 border border-amber-300
                         rounded px-2 py-0.5 transition-colors"
            >
              Request Consent
            </button>
          </div>
        )}

        {/* ── Date line ──────────────────────────────────────── */}
        <p className="text-2xs">
          <span className="text-gray-500">
            Submitted: {formatDate(app.submitted_date)}
          </span>
          <span className="text-gray-400"> &middot; </span>
          <span className={daysInStageClasses(app.days_in_stage)}>
            {app.days_in_stage}d in {statusLabel(app.status)}
          </span>
        </p>

        {/* ── Decline reason (collapsible) ───────────────────── */}
        {app.status === 'declined' && app.decline_reason && (
          <div className="border-t border-gray-100 pt-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeclineOpen((prev) => !prev);
              }}
              className="text-2xs font-medium text-red-600 hover:text-red-800 transition-colors flex items-center gap-1"
            >
              <span
                className="inline-block transition-transform duration-150"
                style={{ transform: declineOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                &#9654;
              </span>
              View Reason
            </button>
            {declineOpen && (
              <p className="mt-1 text-2xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 leading-relaxed">
                {app.decline_reason}
              </p>
            )}
          </div>
        )}

        {/* ── Advisor initials avatar — bottom-right ────────── */}
        {app.advisor && (
          <div className="flex justify-end mt-1">
            <span
              className="w-6 h-6 rounded-full bg-brand-navy text-white text-2xs font-bold flex items-center justify-center shrink-0"
              title={app.advisor}
            >
              {advisorInitials(app.advisor)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
