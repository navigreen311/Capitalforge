'use client';

// ============================================================
// ComplianceTab — Compliance checks & score for a client
//
// Displays a compliance score badge, a "Run Check" button, and
// a list of compliance checks with risk levels, statuses, and
// action buttons where applicable.
// ============================================================

import React, { useState, useCallback } from 'react';
import { SectionCard } from '../ui/card';

// ── Types ───────────────────────────────────────────────────────────────────

interface ComplianceTabProps {
  clientId: string;
}

type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
type CheckStatus = 'pass' | 'incomplete' | 'pending' | 'partial' | 'fail';

interface ComplianceAction {
  label: string;
  href?: string;
}

interface ComplianceCheck {
  id: string;
  riskLevel: RiskLevel;
  checkType: string;
  status: CheckStatus;
  date: string;
  findings: string;
  action?: ComplianceAction;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const RISK_BORDER_CLASS: Record<RiskLevel, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-amber-500',
  medium: 'border-l-blue-500',
  low: 'border-l-green-500',
};

const RISK_BADGE_CLASS: Record<RiskLevel, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const STATUS_DISPLAY: Record<CheckStatus, { icon: string; className: string }> = {
  pass: { icon: '✅', className: 'text-emerald-600' },
  incomplete: { icon: '⚠️', className: 'text-amber-600' },
  pending: { icon: '⚠️', className: 'text-amber-600' },
  partial: { icon: '⚠️', className: 'text-amber-600' },
  fail: { icon: '❌', className: 'text-red-600' },
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Pass',
  incomplete: 'Incomplete',
  pending: 'Pending',
  partial: 'Partial',
  fail: 'Fail',
};

function getScoreColorClass(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-700';
  if (score >= 60) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function buildPlaceholderChecks(clientId: string): ComplianceCheck[] {
  return [
    {
      id: 'chk-1',
      riskLevel: 'critical',
      checkType: 'PRODUCT-REALITY ACK',
      status: 'incomplete',
      date: 'Mar 30, 2026',
      findings: 'Cash-Advance Restriction Acknowledgment not signed.',
      action: {
        label: 'Get Signature',
        href: `/clients/${clientId}/acknowledgments`,
      },
    },
    {
      id: 'chk-2',
      riskLevel: 'medium',
      checkType: 'STATE DISCLOSURES',
      status: 'pending',
      date: 'Mar 30, 2026',
      findings: 'Illinois Commercial Financing Disclosure due in 3 days.',
      action: {
        label: 'File Now →',
        href: `/compliance/disclosures/new?state=IL&client_id=${clientId}`,
      },
    },
    {
      id: 'chk-3',
      riskLevel: 'low',
      checkType: 'UDAP/UDAAP',
      status: 'pass',
      date: 'Mar 28, 2026',
      findings: 'All marketing materials reviewed and approved.',
    },
    {
      id: 'chk-4',
      riskLevel: 'low',
      checkType: 'AML / KYC',
      status: 'pass',
      date: 'Mar 25, 2026',
      findings: 'All owners verified through primary source verification.',
    },
    {
      id: 'chk-5',
      riskLevel: 'medium',
      checkType: 'TCPA CONSENT',
      status: 'partial',
      date: 'Mar 30, 2026',
      findings: 'Voice channel consent revoked. SMS and email active.',
      action: {
        label: 'Request Re-consent',
      },
    },
  ];
}

// ── Component ───────────────────────────────────────────────────────────────

export function ComplianceTab({ clientId }: ComplianceTabProps) {
  const [checks, setChecks] = useState<ComplianceCheck[]>(() =>
    buildPlaceholderChecks(clientId),
  );
  const [isRunning, setIsRunning] = useState(false);
  const complianceScore = 78;

  const handleRunCheck = useCallback(async () => {
    setIsRunning(true);
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('cf_access_token')
          : null;

      await fetch(`/api/v1/clients/${clientId}/compliance/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      // Refresh check list with placeholder data (API would return real data)
      setChecks(buildPlaceholderChecks(clientId));
    } catch {
      // Silently handle — in production this would show a toast
    } finally {
      setIsRunning(false);
    }
  }, [clientId]);

  // ── Header action (score badge + Run Check button) ─────────
  const headerAction = (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${getScoreColorClass(complianceScore)}`}
      >
        Compliance Score: {complianceScore}/100
      </span>
      <button
        type="button"
        onClick={handleRunCheck}
        disabled={isRunning}
        className={`inline-flex items-center rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors ${
          isRunning
            ? 'bg-indigo-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700'
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
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
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

  // ── Render ──────────────────────────────────────────────────
  return (
    <SectionCard title="Compliance" action={headerAction}>
      <div className="space-y-3">
        {checks.map((check) => {
          const statusDisplay = STATUS_DISPLAY[check.status];
          return (
            <div
              key={check.id}
              className={`flex items-start justify-between gap-4 rounded-lg border border-surface-border border-l-4 ${RISK_BORDER_CLASS[check.riskLevel]} bg-white p-4`}
            >
              {/* Left content */}
              <div className="flex-1 min-w-0">
                {/* Top row: badge + check type + status + date */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RISK_BADGE_CLASS[check.riskLevel]}`}
                  >
                    {check.riskLevel}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {check.checkType}
                  </span>
                  <span className={`text-sm font-medium ${statusDisplay.className}`}>
                    {statusDisplay.icon} {STATUS_LABEL[check.status]}
                  </span>
                  <span className="text-xs text-gray-400">
                    — {check.date}
                  </span>
                </div>

                {/* Findings */}
                <p className="mt-1 text-sm text-gray-600">
                  {check.findings}
                </p>
              </div>

              {/* Action button */}
              {check.action && (
                <div className="flex-shrink-0">
                  {check.action.href ? (
                    <a
                      href={check.action.href}
                      className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
                    >
                      {check.action.label}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
                    >
                      {check.action.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
