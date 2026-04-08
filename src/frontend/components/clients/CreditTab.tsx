'use client';

// ============================================================
// CreditTab — Full credit profile tab for client detail page
// Personal & business scores, trend chart, optimization roadmap
// ============================================================

import { useState, useCallback, useMemo } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import CreditScoreCard from '@/components/modules/credit-score-card';
import CreditUnionMemberships from '@/components/clients/CreditUnionMemberships';
import { apiClient } from '@/lib/api-client';

// ─── Props ─────────────────────────────────────────────────────────────────

interface CreditTabProps {
  clientId: string;
  clientName: string;
}

// ─── API Response Types ────────────────────────────────────────────────────

interface BusinessScoreEntry {
  bureau: string;
  score: number;
  maxScore: number;
  pullDate: string;
  trend: 'up' | 'down' | 'stable';
  trendDelta: number;
  paymentRating?: string;
  tradelines?: number;
}

interface BusinessCreditData {
  scores: BusinessScoreEntry[];
  bestScore: number;
  totalTradelines: number;
  businessAgeDays: number;
}

interface CreditHistoryMonth {
  month: string;           // "2025-05", "2025-06", etc.
  experian: number | null;
  equifax: number | null;
  transunion: number | null;
}

interface CreditHistoryData {
  history: CreditHistoryMonth[];
}

interface CreditRecommendation {
  id: string;
  description: string;
  estimatedPointImpact: number;
  priority: 'high' | 'medium' | 'low';
  category: string;
}

interface CreditRecommendationsData {
  recommendations: CreditRecommendation[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PERSONAL_SCORES = [
  { bureau: 'experian' as const, scoreType: 'fico' as const, score: 742, maxScore: 850, pullDate: '2026-03-15', utilization: 0.23 },
  { bureau: 'equifax' as const,  scoreType: 'fico' as const, score: 735, maxScore: 850, pullDate: '2026-03-15', utilization: 0.31 },
  { bureau: 'transunion' as const, scoreType: 'fico' as const, score: 750, maxScore: 850, pullDate: '2026-03-15', utilization: 0.18 },
] as const;

const PORTFOLIO_STATS = [
  { label: 'Total Credit Limit', value: '$284,500', icon: 'CL' },
  { label: 'Total Balance', value: '$47,320', icon: 'TB' },
  { label: 'Avg Utilization', value: '16.6%', icon: 'AU' },
  { label: 'Total Inquiries (90d)', value: '3', icon: 'IQ' },
] as const;

const CHART_COLORS = {
  experian: '#3b82f6',   // blue-500
  equifax: '#22c55e',    // green-500
  transunion: '#f59e0b', // amber-500
} as const;

const BUREAU_LABELS: Record<string, string> = {
  dnb: 'D&B PAYDEX',
  experian_business: 'Experian Intelliscore',
  fico_sbss: 'FICO SBSS',
};

// ─── Skeleton Loaders ──────────────────────────────────────────────────────

function ScoreCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5 flex flex-col items-center gap-4 animate-pulse">
      <div className="flex items-center justify-between w-full">
        <div className="h-4 w-20 bg-gray-700 rounded" />
        <div className="h-5 w-12 bg-gray-700 rounded-full" />
      </div>
      <div className="w-[130px] h-[130px] rounded-full bg-gray-800" />
      <div className="h-4 w-16 bg-gray-700 rounded" />
      <div className="h-3 w-24 bg-gray-800 rounded" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-6 animate-pulse">
      <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
      <div className="h-[260px] w-full bg-gray-100 rounded" />
    </div>
  );
}

function RecommendationSkeleton() {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-6 animate-pulse">
      <div className="h-5 w-48 bg-gray-200 rounded mb-4" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
          <div className="h-8 w-16 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-full bg-gray-200 rounded" />
            <div className="h-3 w-2/3 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Confirmation Modal ────────────────────────────────────────────────────

function ConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  clientName,
  isPulling,
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  clientName: string;
  isPulling: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        role="presentation"
      />
      {/* Dialog */}
      <div
        className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-pull-title"
      >
        <h3 id="confirm-pull-title" className="text-lg font-semibold text-gray-900 mb-2">
          Pull Fresh Credit Report
        </h3>
        <p className="text-sm text-gray-600 mb-1">
          This will initiate a new credit pull for <span className="font-medium">{clientName}</span>.
        </p>
        <p className="text-xs text-amber-600 mb-6">
          Note: Hard inquiries may affect the client&apos;s credit score.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPulling}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPulling}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isPulling && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isPulling ? 'Pulling...' : 'Confirm Pull'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast Notification ────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  const bgColor = type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
  const textColor = type === 'success' ? 'text-green-800' : 'text-red-800';
  const icon = type === 'success' ? '\u2713' : '\u2717';

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${bgColor}`}>
      <span className={`text-lg font-bold ${textColor}`}>{icon}</span>
      <span className={`text-sm font-medium ${textColor}`}>{message}</span>
      <button type="button" onClick={onClose} className={`ml-2 text-lg ${textColor} hover:opacity-70`}>&times;</button>
    </div>
  );
}

// ─── Business Score Card ───────────────────────────────────────────────────

function BusinessScoreCard({ entry }: { entry: BusinessScoreEntry }) {
  const label = BUREAU_LABELS[entry.bureau] ?? entry.bureau;
  const trendIcon = entry.trend === 'up' ? '\u2191' : entry.trend === 'down' ? '\u2193' : '\u2192';
  const trendColor = entry.trend === 'up' ? 'text-green-500' : entry.trend === 'down' ? 'text-red-500' : 'text-gray-400';
  const pct = entry.score / entry.maxScore;
  const gaugeColor = pct >= 0.75 ? '#22c55e' : pct >= 0.55 ? '#eab308' : pct >= 0.4 ? '#f97316' : '#ef4444';

  const cx = 65, cy = 65, radius = 57;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5 flex flex-col items-center gap-3">
      {/* Header */}
      <div className="flex items-center justify-between w-full text-sm">
        <span className="font-semibold text-gray-100 uppercase tracking-wide text-xs">{label}</span>
        <span className={`text-xs font-medium ${trendColor} flex items-center gap-1`}>
          {trendIcon} {entry.trendDelta > 0 ? '+' : ''}{entry.trendDelta}
        </span>
      </div>

      {/* Gauge */}
      <svg width={130} height={130} className="block" aria-hidden="true">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={10} />
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none" stroke={gaugeColor} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle" fontSize={28} fontWeight="700" fill={gaugeColor}>
          {entry.score}
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="#9ca3af">
          / {entry.maxScore}
        </text>
      </svg>

      {/* Payment rating for D&B */}
      {entry.paymentRating && (
        <p className="text-xs text-gray-400">
          Payment Rating: <span className="text-gray-200 font-medium">{entry.paymentRating}</span>
        </p>
      )}

      {/* Pull date */}
      <p className="text-xs text-gray-500">
        Pulled {new Date(entry.pullDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  );
}

// ─── Score Trend Chart (inline SVG) ────────────────────────────────────────

function ScoreTrendChart({ history }: { history: CreditHistoryMonth[] }) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    month: string;
    experian: number | null;
    equifax: number | null;
    transunion: number | null;
  } | null>(null);

  const chartWidth = 720;
  const chartHeight = 260;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const yMin = 600;
  const yMax = 850;
  const yRange = yMax - yMin;

  const yTicks = [600, 650, 700, 750, 800, 850];

  const toX = (i: number) => paddingLeft + (i / (history.length - 1)) * plotWidth;
  const toY = (score: number) => paddingTop + plotHeight - ((score - yMin) / yRange) * plotHeight;

  const buildLine = (key: 'experian' | 'equifax' | 'transunion'): string => {
    const points: string[] = [];
    history.forEach((h, i) => {
      const val = h[key];
      if (val !== null) {
        const prefix = points.length === 0 ? 'M' : 'L';
        points.push(`${prefix}${toX(i).toFixed(1)},${toY(val).toFixed(1)}`);
      }
    });
    return points.join(' ');
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * chartWidth;

      // Find closest month index
      let closestIdx = 0;
      let closestDist = Infinity;
      history.forEach((_, i) => {
        const dist = Math.abs(toX(i) - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      });

      if (closestDist < 40) {
        const h = history[closestIdx];
        setTooltip({
          x: toX(closestIdx),
          y: paddingTop,
          month: h.month,
          experian: h.experian,
          equifax: h.equifax,
          transunion: h.transunion,
        });
      } else {
        setTooltip(null);
      }
    },
    [history],
  );

  const formatMonth = (iso: string): string => {
    try {
      const [y, m] = iso.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return monthNames[parseInt(m, 10) - 1] ?? m;
    } catch {
      return iso;
    }
  };

  return (
    <div className="rounded-xl border border-surface-border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">Score Trend (12 Months)</h3>
        <div className="flex items-center gap-4 text-xs">
          {Object.entries(CHART_COLORS).map(([key, color]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
              <span className="text-gray-500 capitalize">{key}</span>
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-auto"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        role="img"
        aria-label="Credit score trend chart showing Experian, Equifax, and TransUnion scores over 12 months"
      >
        {/* Y-axis gridlines and labels */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={paddingLeft} y1={toY(tick)} x2={chartWidth - paddingRight} y2={toY(tick)}
              stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,4"
            />
            <text x={paddingLeft - 8} y={toY(tick)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#9ca3af">
              {tick}
            </text>
          </g>
        ))}

        {/* X-axis month labels */}
        {history.map((h, i) => (
          <text
            key={h.month}
            x={toX(i)} y={chartHeight - 10}
            textAnchor="middle" fontSize="11" fill="#9ca3af"
          >
            {formatMonth(h.month)}
          </text>
        ))}

        {/* Lines */}
        <polyline points={buildLine('experian').replace(/[ML]/g, (m) => m === 'M' ? '' : ' ').trim()}
          fill="none" stroke={CHART_COLORS.experian} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={buildLine('equifax').replace(/[ML]/g, (m) => m === 'M' ? '' : ' ').trim()}
          fill="none" stroke={CHART_COLORS.equifax} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={buildLine('transunion').replace(/[ML]/g, (m) => m === 'M' ? '' : ' ').trim()}
          fill="none" stroke={CHART_COLORS.transunion} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {history.map((h, i) => (
          <g key={h.month}>
            {h.experian !== null && <circle cx={toX(i)} cy={toY(h.experian)} r="3" fill={CHART_COLORS.experian} />}
            {h.equifax !== null && <circle cx={toX(i)} cy={toY(h.equifax)} r="3" fill={CHART_COLORS.equifax} />}
            {h.transunion !== null && <circle cx={toX(i)} cy={toY(h.transunion)} r="3" fill={CHART_COLORS.transunion} />}
          </g>
        ))}

        {/* Hover tooltip */}
        {tooltip && (
          <g>
            {/* Vertical guide line */}
            <line x1={tooltip.x} y1={paddingTop} x2={tooltip.x} y2={chartHeight - paddingBottom} stroke="#6b7280" strokeWidth="1" strokeDasharray="3,3" />

            {/* Tooltip background */}
            <rect x={tooltip.x + 8} y={tooltip.y} width="140" height="72" rx="6" fill="white" stroke="#e5e7eb" strokeWidth="1" />

            {/* Month header */}
            <text x={tooltip.x + 16} y={tooltip.y + 16} fontSize="11" fontWeight="600" fill="#374151">
              {formatMonth(tooltip.month)}
            </text>

            {/* Scores */}
            <circle cx={tooltip.x + 20} cy={tooltip.y + 30} r="4" fill={CHART_COLORS.experian} />
            <text x={tooltip.x + 28} y={tooltip.y + 34} fontSize="11" fill="#6b7280">
              Experian: {tooltip.experian ?? 'N/A'}
            </text>

            <circle cx={tooltip.x + 20} cy={tooltip.y + 46} r="4" fill={CHART_COLORS.equifax} />
            <text x={tooltip.x + 28} y={tooltip.y + 50} fontSize="11" fill="#6b7280">
              Equifax: {tooltip.equifax ?? 'N/A'}
            </text>

            <circle cx={tooltip.x + 20} cy={tooltip.y + 62} r="4" fill={CHART_COLORS.transunion} />
            <text x={tooltip.x + 28} y={tooltip.y + 66} fontSize="11" fill="#6b7280">
              TransUnion: {tooltip.transunion ?? 'N/A'}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ─── Recommendation Card ───────────────────────────────────────────────────

function RecommendationItem({ rec }: { rec: CreditRecommendation }) {
  const priorityColors = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 flex-shrink-0 whitespace-nowrap">
        +{rec.estimatedPointImpact} pts
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800">{rec.description}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${priorityColors[rec.priority]}`}>
            {rec.priority}
          </span>
          <span className="text-xs text-gray-400">{rec.category}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function CreditTab({ clientId, clientName }: CreditTabProps) {
  // ── State ──
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── API Fetches ──
  const {
    data: businessData,
    isLoading: businessLoading,
    error: businessError,
    refetch: refetchBusiness,
  } = useAuthFetch<BusinessCreditData>(`/api/v1/clients/${clientId}/credit/business`);

  const {
    data: historyData,
    isLoading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useAuthFetch<CreditHistoryData>(`/api/v1/clients/${clientId}/credit/history`);

  const {
    data: recsData,
    isLoading: recsLoading,
    error: recsError,
    refetch: refetchRecs,
  } = useAuthFetch<CreditRecommendationsData>(`/api/v1/clients/${clientId}/credit/recommendations`);

  // ── Pull Fresh Report ──
  const handlePullReport = useCallback(async () => {
    setIsPulling(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      if (!token) {
        setToast({ message: 'Authentication required. Please sign in again.', type: 'error' });
        setIsPulling(false);
        setShowConfirm(false);
        return;
      }

      await apiClient.post(`/v1/clients/${clientId}/credit/pull`);

      setToast({ message: 'Credit report pull initiated successfully.', type: 'success' });
      setShowConfirm(false);

      // Refresh all credit data
      refetchBusiness();
      refetchHistory();
      refetchRecs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pull credit report.';
      setToast({ message, type: 'error' });
    } finally {
      setIsPulling(false);
      setShowConfirm(false);
    }
  }, [clientId, refetchBusiness, refetchHistory, refetchRecs]);

  // Auto-dismiss toast after 5s
  useMemo(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Business summary row ──
  const businessAge = businessData
    ? `${Math.floor(businessData.businessAgeDays / 365)}y ${Math.floor((businessData.businessAgeDays % 365) / 30)}m`
    : '--';

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirm}
        onConfirm={handlePullReport}
        onCancel={() => setShowConfirm(false)}
        clientName={clientName}
        isPulling={isPulling}
      />

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Credit Profile</h2>
          <p className="text-sm text-gray-500 mt-0.5">{clientName}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Pull Fresh Report
        </button>
      </div>

      {/* ─── Section 1: Personal Credit Scores ──────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Personal Credit Scores</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PERSONAL_SCORES.map((ps) => (
            <CreditScoreCard
              key={ps.bureau}
              score={ps.score}
              maxScore={ps.maxScore}
              bureau={ps.bureau}
              scoreType={ps.scoreType}
              pullDate={ps.pullDate}
              utilization={ps.utilization}
            />
          ))}
        </div>
      </section>

      {/* ─── Section 2: Business Credit Scores ──────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Business Credit Scores</h3>

        {businessError && <DashboardErrorState error={businessError} onRetry={refetchBusiness} />}

        {businessLoading && !businessError && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <ScoreCardSkeleton key={i} />)}
          </div>
        )}

        {businessData && !businessError && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {businessData.scores.map((entry) => (
                <BusinessScoreCard key={entry.bureau} entry={entry} />
              ))}
            </div>

            {/* Summary row */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-surface-border bg-gray-50 px-4 py-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Best Business Score</p>
                <p className="text-lg font-bold text-gray-900">{businessData.bestScore}</p>
              </div>
              <div className="rounded-lg border border-surface-border bg-gray-50 px-4 py-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Total Business Tradelines</p>
                <p className="text-lg font-bold text-gray-900">{businessData.totalTradelines}</p>
              </div>
              <div className="rounded-lg border border-surface-border bg-gray-50 px-4 py-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Business Age</p>
                <p className="text-lg font-bold text-gray-900">{businessAge}</p>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ─── Section 3: Portfolio Stats ──────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Portfolio Stats</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {PORTFOLIO_STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-surface-border bg-white shadow-card p-5"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs font-medium text-gray-500">{stat.label}</p>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-700 text-[10px] font-bold flex-shrink-0">
                  {stat.icon}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Section 4: Credit Union Memberships ─────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Credit Union Memberships</h3>
        <CreditUnionMemberships clientId={clientId} compact />
      </section>

      {/* ─── Section 5: Score Trend Chart ────────────────────────────────── */}
      <section>
        {historyError && <DashboardErrorState error={historyError} onRetry={refetchHistory} />}

        {historyLoading && !historyError && <ChartSkeleton />}

        {historyData && !historyError && historyData.history.length > 0 && (
          <ScoreTrendChart history={historyData.history} />
        )}
      </section>

      {/* ─── Section 6: Credit Optimization Roadmap ──────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Credit Optimization Roadmap</h3>

        {recsError && <DashboardErrorState error={recsError} onRetry={refetchRecs} />}

        {recsLoading && !recsError && <RecommendationSkeleton />}

        {recsData && !recsError && (
          <div className="rounded-xl border border-surface-border bg-white p-6">
            {recsData.recommendations.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No recommendations at this time.</p>
            ) : (
              recsData.recommendations.map((rec) => (
                <RecommendationItem key={rec.id} rec={rec} />
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
