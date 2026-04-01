'use client';

// ============================================================
// PortfolioRiskHeatmap — Interactive risk matrix grid showing
// five risk dimensions × four severity levels with count-up
// animation, color-coded cells, and slide-over drill-down.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface SeverityBucket {
  count: number;
  client_ids: string[];
}

type RiskRow = Record<Severity, SeverityBucket>;

interface CriticalClient {
  id: string;
  name: string;
  risk_type: string;
  detail: string;
}

interface RiskMatrixData {
  matrix: Record<string, RiskRow>;
  critical_count: number;
  critical_clients: CriticalClient[];
  last_updated: string;
}

interface CellSelection {
  riskType: string;
  severity: Severity;
  bucket: SeverityBucket;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_TYPES: { key: string; label: string }[] = [
  { key: 'apr_expiry', label: 'APR Expiry' },
  { key: 'utilization_spike', label: 'Utilization Spike' },
  { key: 'missed_payment', label: 'Missed Payment' },
  { key: 'hardship_flag', label: 'Hardship Flag' },
  { key: 'processor_risk', label: 'Processor Risk' },
];

const SEVERITIES: { key: Severity; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'critical', label: 'Critical' },
];

const SEVERITY_COLORS: Record<Severity, string> = {
  low: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  medium: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  high: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
  critical: 'bg-red-50 text-red-700 hover:bg-red-100',
};

const ZERO_CELL = 'bg-gray-50 text-gray-400';

const SEVERITY_HEADER_COLORS: Record<Severity, string> = {
  low: 'text-emerald-600',
  medium: 'text-amber-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
};

// ---------------------------------------------------------------------------
// Count-up animation hook
// ---------------------------------------------------------------------------

function useCountUp(target: number, duration: number = 300, delay: number = 0): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }

    const timeout = setTimeout(() => {
      const startTime = performance.now();
      let rafId: number;

      function animate(currentTime: number) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));

        if (progress < 1) {
          rafId = requestAnimationFrame(animate);
        }
      }

      rafId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(rafId);
    }, delay);

    return () => clearTimeout(timeout);
  }, [target, duration, delay]);

  return value;
}

// ---------------------------------------------------------------------------
// AnimatedCell component
// ---------------------------------------------------------------------------

function AnimatedCell({
  bucket,
  severity,
  delay,
  onClick,
}: {
  bucket: SeverityBucket;
  severity: Severity;
  delay: number;
  onClick: () => void;
}) {
  const displayCount = useCountUp(bucket.count, 300, delay);
  const isZero = bucket.count === 0;
  const colorClass = isZero ? ZERO_CELL : SEVERITY_COLORS[severity];

  return (
    <td className="p-0">
      <button
        onClick={onClick}
        disabled={isZero}
        className={`w-full h-full px-4 py-3 text-center font-semibold text-lg transition-colors duration-150 ${colorClass} ${
          isZero ? 'cursor-default' : 'cursor-pointer'
        }`}
        aria-label={`${bucket.count} clients, click to view details`}
      >
        {displayCount}
      </button>
    </td>
  );
}

// ---------------------------------------------------------------------------
// SlideOver component
// ---------------------------------------------------------------------------

function SlideOver({
  selection,
  clients,
  onClose,
}: {
  selection: CellSelection;
  clients: CriticalClient[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape key listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const riskLabel =
    RISK_TYPES.find((r) => r.key === selection.riskType)?.label ?? selection.riskType;
  const severityLabel =
    SEVERITIES.find((s) => s.key === selection.severity)?.label ?? selection.severity;

  // Filter matching critical_clients for this cell
  const matchingClients = clients.filter(
    (c) =>
      c.risk_type === selection.riskType &&
      selection.bucket.client_ids.includes(c.id),
  );

  // For non-critical cells we may not have detail records — show IDs
  const clientIds = selection.bucket.client_ids;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 flex flex-col animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label={`${riskLabel} — ${severityLabel} clients`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{riskLabel}</h3>
            <p className="text-sm text-gray-500">
              {severityLabel} severity — {selection.bucket.count} client
              {selection.bucket.count !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Client list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {matchingClients.length > 0
            ? matchingClients.map((client) => (
                <div
                  key={`${client.id}-${client.risk_type}`}
                  className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <p className="font-medium text-gray-900">{client.name}</p>
                  <p className="text-sm text-gray-500 mt-1">{client.detail}</p>
                  <div className="flex gap-2 mt-3">
                    <a
                      href={`/clients/${client.id}`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      View Client
                    </a>
                    <a
                      href={`/clients/${client.id}?action=contact`}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 transition-colors"
                    >
                      Contact
                    </a>
                    <a
                      href={`/clients/${client.id}?action=flag`}
                      className="text-xs font-medium text-orange-600 hover:text-orange-700 px-2 py-1 rounded bg-orange-50 hover:bg-orange-100 transition-colors"
                    >
                      Flag
                    </a>
                  </div>
                </div>
              ))
            : clientIds.map((id) => (
                <div
                  key={id}
                  className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <p className="font-medium text-gray-900">
                    {/* Name not available for non-critical; show ID */}
                    Client
                  </p>
                  <p className="text-sm text-gray-500 mt-1 font-mono text-xs truncate">
                    {id}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <a
                      href={`/clients/${id}`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      View Client
                    </a>
                    <a
                      href={`/clients/${id}?action=contact`}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 transition-colors"
                    >
                      Contact
                    </a>
                    <a
                      href={`/clients/${id}?action=flag`}
                      className="text-xs font-medium text-orange-600 hover:text-orange-700 px-2 py-1 rounded bg-orange-50 hover:bg-orange-100 transition-colors"
                    >
                      Flag
                    </a>
                  </div>
                </div>
              ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function HeatmapSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-card p-6 animate-pulse">
      <div className="h-6 w-56 bg-gray-200 rounded mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-10 w-36 bg-gray-100 rounded" />
            <div className="h-10 flex-1 bg-gray-100 rounded" />
            <div className="h-10 flex-1 bg-gray-100 rounded" />
            <div className="h-10 flex-1 bg-gray-100 rounded" />
            <div className="h-10 flex-1 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function PortfolioRiskHeatmap() {
  const [data, setData] = useState<RiskMatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<CellSelection | null>(null);

  // Fetch data
  useEffect(() => {
    let cancelled = false;

    async function fetchMatrix() {
      try {
        setLoading(true);
        const res = await fetch('/api/v1/dashboard/portfolio-risk-matrix');
        const json = await res.json();

        if (!cancelled) {
          if (json.success) {
            setData(json.data);
          } else {
            setError(json.error?.message ?? 'Failed to load risk matrix');
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Network error');
          setLoading(false);
        }
      }
    }

    fetchMatrix();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCellClick = useCallback(
    (riskType: string, severity: Severity, bucket: SeverityBucket) => {
      if (bucket.count === 0) return;
      setSelection({ riskType, severity, bucket });
    },
    [],
  );

  const handleClosePanel = useCallback(() => {
    setSelection(null);
  }, []);

  // Loading state
  if (loading) return <HeatmapSkeleton />;

  // Error state
  if (error || !data) {
    return (
      <div className="bg-white rounded-xl border border-surface-border shadow-card p-6">
        <p className="text-red-600 text-sm">
          {error ?? 'Unable to load risk matrix.'}
        </p>
      </div>
    );
  }

  const { matrix, critical_count, critical_clients } = data;

  // Cell index for staggered animation delay
  let cellIndex = 0;

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

      <div className="bg-white rounded-xl border border-surface-border shadow-card p-6">
        {/* Header */}
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Portfolio Risk Heatmap
        </h2>

        {/* Grid table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3 pr-4 w-44">
                  Risk Type
                </th>
                {SEVERITIES.map((s) => (
                  <th
                    key={s.key}
                    className={`text-center text-xs font-medium uppercase tracking-wider pb-3 px-2 ${SEVERITY_HEADER_COLORS[s.key]}`}
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {RISK_TYPES.map((risk) => {
                const row = matrix[risk.key];
                if (!row) return null;

                return (
                  <tr key={risk.key}>
                    <td className="py-3 pr-4 text-sm font-medium text-gray-700 whitespace-nowrap">
                      {risk.label}
                    </td>
                    {SEVERITIES.map((s) => {
                      const bucket = row[s.key];
                      const delay = cellIndex * 30;
                      cellIndex++;

                      return (
                        <AnimatedCell
                          key={s.key}
                          bucket={bucket}
                          severity={s.key}
                          delay={delay}
                          onClick={() => handleCellClick(risk.key, s.key, bucket)}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary row */}
        {critical_count > 0 && (
          <div className="mt-4 flex items-center justify-between px-3 py-3 bg-red-50 rounded-lg border border-red-100">
            <p className="text-sm font-medium text-red-700">
              {critical_count} client{critical_count !== 1 ? 's' : ''} need
              {critical_count === 1 ? 's' : ''} immediate attention
            </p>
            <a
              href="/clients?filter=risk:critical"
              className="text-sm font-semibold text-red-600 hover:text-red-700 transition-colors"
            >
              Review Now &rarr;
            </a>
          </div>
        )}
      </div>

      {/* Slide-over panel */}
      {selection && (
        <SlideOver
          selection={selection}
          clients={critical_clients}
          onClose={handleClosePanel}
        />
      )}
    </>
  );
}
