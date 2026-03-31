'use client';

// ============================================================
// AnomalyAlert — displays a single statement anomaly with
// severity icon, description, affected card, and suggested
// action. Supports dismissal and compact/full rendering.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';
export type AnomalyType =
  | 'fee_anomaly'
  | 'balance_mismatch'
  | 'duplicate_charge'
  | 'missing_transaction'
  | 'rate_change'
  | 'overlimit';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  affectedCard: string;
  affectedCardLast4?: string;
  issuer?: string;
  amount?: number;
  expectedAmount?: number;
  detectedAt: string;
  suggestedAction: string;
  statementId?: string;
}

interface AnomalyAlertProps {
  anomaly: Anomaly;
  compact?: boolean;
  onDismiss?: (id: string) => void;
  onAction?: (anomaly: Anomaly) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Config maps
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  AnomalySeverity,
  { label: string; bgClass: string; borderClass: string; textClass: string; iconBg: string }
> = {
  critical: {
    label: 'Critical',
    bgClass: 'bg-red-950',
    borderClass: 'border-red-700',
    textClass: 'text-red-300',
    iconBg: 'bg-red-900',
  },
  high: {
    label: 'High',
    bgClass: 'bg-orange-950',
    borderClass: 'border-orange-700',
    textClass: 'text-orange-300',
    iconBg: 'bg-orange-900',
  },
  medium: {
    label: 'Medium',
    bgClass: 'bg-yellow-950',
    borderClass: 'border-yellow-700',
    textClass: 'text-yellow-300',
    iconBg: 'bg-yellow-900',
  },
  low: {
    label: 'Low',
    bgClass: 'bg-gray-900',
    borderClass: 'border-gray-700',
    textClass: 'text-gray-400',
    iconBg: 'bg-gray-800',
  },
};

const TYPE_META: Record<AnomalyType, { label: string; icon: string }> = {
  fee_anomaly:         { label: 'Fee Anomaly',          icon: '⚠' },
  balance_mismatch:    { label: 'Balance Mismatch',     icon: '≠' },
  duplicate_charge:    { label: 'Duplicate Charge',     icon: '⊕' },
  missing_transaction: { label: 'Missing Transaction',  icon: '?' },
  rate_change:         { label: 'Rate Change',          icon: '↑' },
  overlimit:           { label: 'Over Limit',           icon: '!' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnomalyAlert({
  anomaly,
  compact = false,
  onDismiss,
  onAction,
  className = '',
}: AnomalyAlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const sev = SEVERITY_CONFIG[anomaly.severity];
  const meta = TYPE_META[anomaly.type];
  const cardLabel = anomaly.affectedCardLast4
    ? `${anomaly.affectedCard} ···${anomaly.affectedCardLast4}`
    : anomaly.affectedCard;

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.(anomaly.id);
  }

  // ── Compact variant ────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div
        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${sev.bgClass} ${sev.borderClass} ${className}`}
      >
        <span
          className={`flex-shrink-0 h-6 w-6 rounded flex items-center justify-center text-xs font-black ${sev.iconBg} ${sev.textClass}`}
          aria-label={sev.label}
        >
          {meta.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${sev.textClass}`}>{anomaly.description}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{cardLabel}</p>
        </div>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors text-sm leading-none"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  // ── Full variant ───────────────────────────────────────────────────────────
  return (
    <div
      className={`rounded-xl border p-4 ${sev.bgClass} ${sev.borderClass} ${className}`}
      role="alert"
      aria-live="polite"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {/* Severity icon */}
          <span
            className={`flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-base font-black ${sev.iconBg} ${sev.textClass}`}
            aria-label={sev.label}
          >
            {meta.icon}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${sev.textClass} ${sev.borderClass} ${sev.iconBg}`}
              >
                {sev.label}
              </span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                {meta.label}
              </span>
            </div>
            <p className={`text-sm font-semibold mt-0.5 ${sev.textClass}`}>
              {anomaly.description}
            </p>
          </div>
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss alert"
            className="flex-shrink-0 text-gray-600 hover:text-gray-400 text-xl leading-none transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3 border-t border-gray-800 pt-3">
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Affected Card</p>
          <p className="text-xs text-gray-200 font-medium mt-0.5">{cardLabel}</p>
        </div>

        {anomaly.issuer && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Issuer</p>
            <p className="text-xs text-gray-200 font-medium mt-0.5">{anomaly.issuer}</p>
          </div>
        )}

        {anomaly.amount !== undefined && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Amount Detected</p>
            <p className={`text-xs font-semibold mt-0.5 ${sev.textClass}`}>
              {fmtCurrency(anomaly.amount)}
            </p>
          </div>
        )}

        {anomaly.expectedAmount !== undefined && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Expected Amount</p>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              {fmtCurrency(anomaly.expectedAmount)}
            </p>
          </div>
        )}

        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Detected</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(anomaly.detectedAt)}</p>
        </div>

        {anomaly.statementId && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Statement</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{anomaly.statementId}</p>
          </div>
        )}
      </div>

      {/* Suggested action */}
      <div className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-2.5 mb-3">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-0.5">
          Suggested Action
        </p>
        <p className="text-xs text-gray-300 leading-relaxed">{anomaly.suggestedAction}</p>
      </div>

      {/* Action button */}
      {onAction && (
        <button
          onClick={() => onAction(anomaly)}
          className="w-full text-xs font-semibold py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] transition-colors"
        >
          Investigate
        </button>
      )}
    </div>
  );
}
