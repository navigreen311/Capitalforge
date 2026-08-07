'use client';

// ============================================================
// ComplianceTab — Compliance checks & score for a client
//
// Renders the compliance score and the checks on record for a client, both
// read from /api/v1/clients/:id/compliance.
//
// The score is nullable by design: the API derives it from the risk scores of
// the checks actually stored, and reports null when no check carries one.
// "Not assessed" and "assessed at 0" are different facts about a lending
// client, so this component never collapses the first into the second — and
// never falls back to a placeholder score, which is what it used to render
// (a hardcoded 78, independent of the client, the checks, or the API).
// ============================================================

import React, { useCallback, useMemo, useState } from 'react';
import { SectionCard } from '../ui/card';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { loadJsonWithMeta, isStubResponse, toLoadError } from '@/lib/load-json';
import {
  describeComplianceScore,
  toComplianceCheckView,
  type ApiComplianceCheck,
  type CheckStatus,
  type RiskLevel,
} from '@/lib/compliance-view';

// ── Types ───────────────────────────────────────────────────────────────────

interface ComplianceTabProps {
  clientId: string;
}

interface ComplianceData {
  complianceScore: number | null;
  maxScore: number;
  checks: ApiComplianceCheck[];
}

// ── Presentation maps ───────────────────────────────────────────────────────

const RISK_BORDER_CLASS: Record<RiskLevel, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-amber-500',
  medium: 'border-l-blue-500',
  low: 'border-l-green-500',
  unknown: 'border-l-gray-300',
};

const RISK_BADGE_CLASS: Record<RiskLevel, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-green-100 text-green-700 border-green-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
};

const RISK_LABEL: Record<RiskLevel, string> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  unknown: 'unrated',
};

const STATUS_DISPLAY: Record<CheckStatus, { icon: string; className: string; label: string }> = {
  resolved: { icon: '✅', className: 'text-emerald-600', label: 'Resolved' },
  open: { icon: '⚠️', className: 'text-amber-600', label: 'Open' },
};

// ── Score badge ─────────────────────────────────────────────────────────────

function ScoreBadge({ score, maxScore }: { score: number | null; maxScore: number }) {
  const display = describeComplianceScore(score, maxScore);

  const TONE_CLASS: Record<typeof display.tone, string> = {
    neutral: 'bg-gray-100 text-gray-600',
    good: 'bg-emerald-100 text-emerald-700',
    warn: 'bg-amber-100 text-amber-700',
    bad: 'bg-red-100 text-red-700',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${TONE_CLASS[display.tone]}`}
      title={
        display.unassessed
          ? 'No compliance check on record carries a risk score, so a score cannot be derived. This is not a passing result.'
          : undefined
      }
    >
      Compliance Score: {display.label}
    </span>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function ComplianceSkeleton() {
  return (
    <SectionCard title="Compliance">
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-surface-border bg-gray-50" />
        ))}
      </div>
    </SectionCard>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function ComplianceTab({ clientId }: ComplianceTabProps) {
  const { data, isLoading, error, refetch } = useAuthFetch<ComplianceData>(
    `/api/v1/clients/${clientId}/compliance`,
  );

  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const checks = useMemo(
    () => (data?.checks ?? []).map(toComplianceCheckView),
    [data],
  );

  const handleRunCheck = useCallback(async () => {
    setIsRunning(true);
    setNotice(null);
    try {
      const { meta } = await loadJsonWithMeta(
        `/api/v1/clients/${clientId}/compliance/run`,
        { method: 'POST' },
      );
      // This endpoint is currently a stub: it returns a sample result and does
      // not start anything. Say so rather than implying a run occurred.
      setNotice(
        isStubResponse(meta)
          ? 'Compliance runs are not wired up yet — nothing was started. The checks below are unchanged.'
          : 'Compliance check started.',
      );
      void refetch();
    } catch (e) {
      const info = toLoadError(e);
      setNotice(
        info.type === 'auth_required'
          ? 'Your session has expired. Sign in again to run a compliance check.'
          : 'Could not start the compliance check.',
      );
    } finally {
      setIsRunning(false);
    }
  }, [clientId, refetch]);

  if (isLoading) return <ComplianceSkeleton />;
  if (error) {
    return (
      <SectionCard title="Compliance">
        <DashboardErrorState error={error} onRetry={refetch} />
      </SectionCard>
    );
  }

  const headerAction = (
    <div className="flex items-center gap-3">
      <ScoreBadge score={data?.complianceScore ?? null} maxScore={data?.maxScore ?? 100} />
      <button
        type="button"
        onClick={handleRunCheck}
        disabled={isRunning}
        className={`inline-flex items-center rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors ${
          isRunning ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
        }`}
      >
        {isRunning ? (
          <>
            <svg
              className="mr-1.5 h-3.5 w-3.5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Running…
          </>
        ) : (
          'Run Check'
        )}
      </button>
    </div>
  );

  return (
    <SectionCard title="Compliance" action={headerAction}>
      {notice && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {notice}
        </div>
      )}

      {checks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-border bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No compliance checks on record</p>
          <p className="mt-1 text-xs text-gray-500">
            Nothing has been run for this client yet. This is not a passing result.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {checks.map((check) => {
            const statusDisplay = STATUS_DISPLAY[check.status];
            return (
              <div
                key={check.id}
                className={`flex items-start justify-between gap-4 rounded-lg border border-surface-border border-l-4 ${RISK_BORDER_CLASS[check.riskLevel]} bg-white p-4`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RISK_BADGE_CLASS[check.riskLevel]}`}
                    >
                      {RISK_LABEL[check.riskLevel]}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{check.checkType}</span>
                    <span className={`text-sm font-medium ${statusDisplay.className}`}>
                      {statusDisplay.icon} {statusDisplay.label}
                    </span>
                    <span className="text-xs text-gray-400">— {check.date}</span>
                  </div>

                  <p className="mt-1 text-sm text-gray-600">{check.findings}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
