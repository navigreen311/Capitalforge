'use client';

// ============================================================
// StatsBar — 5 KPI cards with sparklines & animated count-up
// ============================================================

import { useEffect, useRef, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface KpiData {
  clients: number;
  applications: number;
  funding: number;
  approval_rate: number;
  fees_mtd: number;
  trends: {
    clients: string;
    applications: string;
    funding: string;
    approval_rate: string;
    fees_mtd: string;
  };
  sparklines: {
    clients: number[];
    applications: number[];
    funding: number[];
    approval_rate: number[];
    fees_mtd: number[];
  };
  last_updated: string;
}

interface CardConfig {
  key: keyof KpiData['sparklines'];
  title: string;
  href: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  accentHex: string;
  format: (value: number) => string;
  trendColorOverride?: string;
}

// ── Card configuration ──────────────────────────────────────────────────────

const CARDS: CardConfig[] = [
  {
    key: 'clients',
    title: 'Active Clients',
    href: '/clients',
    icon: 'AC',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-700',
    accentColor: 'text-emerald-600',
    accentHex: '#059669',
    format: (v) => v.toLocaleString(),
  },
  {
    key: 'applications',
    title: 'Pending Applications',
    href: '/applications?status=pending',
    icon: 'PA',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
    accentColor: 'text-emerald-600',
    accentHex: '#059669',
    format: (v) => v.toLocaleString(),
  },
  {
    key: 'funding',
    title: 'Total Funding Deployed',
    href: '/funding-rounds',
    icon: 'FD',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
    accentColor: 'text-emerald-600',
    accentHex: '#059669',
    format: (v) => {
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
      return `$${v.toLocaleString()}`;
    },
  },
  {
    key: 'approval_rate',
    title: 'Avg. Approval Rate',
    href: '/analytics/approvals',
    icon: 'AR',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-700',
    accentColor: 'text-red-500',
    accentHex: '#ef4444',
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    key: 'fees_mtd',
    title: 'Fees Earned MTD',
    href: '/billing',
    icon: 'FE',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-700',
    accentColor: 'text-brand-gold',
    accentHex: '#d4a017',
    format: (v) => {
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
      return `$${v.toLocaleString()}`;
    },
    trendColorOverride: 'text-brand-gold',
  },
];

// ── Sparkline SVG ───────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return null;

  const width = 120;
  const height = 40;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaPath =
    linePath +
    ` L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-[40px] mt-2"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <style>{`
          @keyframes sparkDraw {
            from { stroke-dashoffset: 500; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes sparkFade {
            from { opacity: 0; }
            to   { opacity: 0.2; }
          }
        `}</style>
      </defs>
      <path
        d={areaPath}
        fill={color}
        style={{ opacity: 0.2, animation: 'sparkFade 1s ease-out forwards' }}
      />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 500,
          strokeDashoffset: 0,
          animation: 'sparkDraw 1.2s ease-out forwards',
        }}
      />
    </svg>
  );
}

// ── Animated count-up hook ──────────────────────────────────────────────────

function useCountUp(target: number, duration: number = 1000): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) {
      setCurrent(0);
      return;
    }

    startTimeRef.current = null;

    function animate(timestamp: number) {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(eased * target);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setCurrent(target);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return current;
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-card p-6 animate-pulse">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="w-9 h-9 bg-gray-200 rounded-lg" />
      </div>
      <div className="h-8 w-20 bg-gray-200 rounded mb-2" />
      <div className="h-3 w-28 bg-gray-100 rounded mb-2" />
      <div className="h-[40px] w-full bg-gray-100 rounded mt-2" />
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  config,
  value,
  trend,
  sparkline,
}: {
  config: CardConfig;
  value: number;
  trend: string;
  sparkline: number[];
}) {
  const animatedValue = useCountUp(value);

  const isDown = trend.startsWith('-');
  const trendColor = config.trendColorOverride
    ? config.trendColorOverride
    : isDown
      ? 'text-red-500'
      : 'text-emerald-600';
  const trendArrow = isDown ? '\u2193' : '\u2191';

  return (
    <a
      href={config.href}
      className="bg-white rounded-xl border border-surface-border shadow-card p-6
                 hover:shadow-card-hover transition-shadow duration-150 block"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-500">{config.title}</p>
        <span
          className={`inline-flex items-center justify-center w-9 h-9 rounded-lg
                      text-xs font-bold flex-shrink-0 ${config.iconBg} ${config.iconColor}`}
          aria-hidden="true"
        >
          {config.icon}
        </span>
      </div>

      {/* Value */}
      <p className="text-3xl font-bold tracking-tight text-gray-900 leading-none mt-3">
        {config.format(animatedValue)}
      </p>

      {/* Trend */}
      <div className="flex items-center gap-1 mt-2">
        <span className={`text-sm font-medium ${trendColor}`}>
          {trendArrow} {trend}
        </span>
      </div>

      {/* Sparkline */}
      <Sparkline data={sparkline} color={config.accentHex} />
    </a>
  );
}

// ── StatsBar (main export) ──────────────────────────────────────────────────

export function StatsBar() {
  const [data, setData] = useState<KpiData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchKpi() {
      try {
        const res = await fetch('/api/v1/dashboard/kpi-summary');
        const json = await res.json();
        if (!cancelled && json.success) {
          setData(json.data);
        }
      } catch {
        // Silently handle fetch errors — cards stay in skeleton state
      }
    }

    fetchKpi();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading state
  if (!data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {CARDS.map((card) => (
          <SkeletonCard key={card.key} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      {CARDS.map((card) => (
        <KpiCard
          key={card.key}
          config={card}
          value={data[card.key] as number}
          trend={data.trends[card.key]}
          sparkline={data.sparklines[card.key]}
        />
      ))}
    </div>
  );
}
