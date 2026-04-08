'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SectionCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BadgeStatus } from '@/components/ui/badge';
import { useToast } from '@/components/global/ToastProvider';
import {
  StatsBar,
  ConsentAlertBanner,
  AprExpiryPanel,
  ActionQueue,
  RecentApplicationsEnhanced,
  ActiveFundingRounds,
  UpcomingPayments,
  DealCommitteeQueue,
  StateDisclosureDeadlines,
  PortfolioRiskHeatmap,
  RestackOpportunities,
  RestackWidget,
  VoiceForgeActivity,
  PortfolioHealthWidget,
} from '@/components/dashboard';
import type { RestackStartRoundPayload } from '@/components/dashboard';
import { SetupChecklist } from '@/components/onboarding/SetupChecklist';
import { NewApplicationModal } from '@/components/applications';
import type { NewAppDefaults } from '@/components/applications';

// ─── Activity feed mock data (retained — no replacement component) ───────────

interface ActivityItem {
  id: string;
  icon: string;
  iconBg: string;
  iconText: string;
  description: string;
  time: string;
  category: string;
}

const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: 'act-1',
    icon: 'AP',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-700',
    description: 'APP-0091 moved to underwriting review',
    time: '12 min ago',
    category: 'Application',
  },
  {
    id: 'act-2',
    icon: 'CR',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    description: 'Credit pull completed — Brightline Corp (Equifax)',
    time: '1 hr ago',
    category: 'Credit',
  },
  {
    id: 'act-3',
    icon: 'CO',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    description: 'Compliance flag: Illinois disclosure deadline in 3 days',
    time: '2 hr ago',
    category: 'Compliance',
  },
  {
    id: 'act-4',
    icon: 'DC',
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-700',
    description: 'Dossier exported for Apex Ventures Inc.',
    time: '4 hr ago',
    category: 'Documents',
  },
  {
    id: 'act-5',
    icon: 'FR',
    iconBg: 'bg-brand-navy/10',
    iconText: 'text-brand-navy',
    description: 'Funding Round #FR-018 created — $1.2M target',
    time: 'Yesterday',
    category: 'Funding',
  },
];

// ─── Compliance score ring (SVG) ─────────────────────────────────────────────

function ComplianceRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-label={`Compliance score: ${score}%`}>
        {/* Track */}
        <circle
          cx="48" cy="48" r={radius}
          fill="none" stroke="#E5E7EB" strokeWidth="8"
        />
        {/* Fill */}
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
        />
        {/* Score text */}
        <text
          x="48" y="48"
          textAnchor="middle" dominantBaseline="central"
          className="text-xl font-bold"
          style={{ fontSize: '20px', fontWeight: 700, fill: '#0F172A' }}
        >
          {score}
        </text>
      </svg>
      <p className="text-xs text-gray-500">Compliance Score</p>
    </div>
  );
}

// ─── Compliance row helper ───────────────────────────────────────────────────

function ComplianceRow({
  label,
  status,
  count,
}: {
  label: string;
  status: BadgeStatus;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-900">{count}</span>
        <Badge status={status} size="sm" />
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const [markAllLabel, setMarkAllLabel] = useState('Mark all read');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const toast = useToast();
  const [showNewApp, setShowNewApp] = useState(false);
  const [newAppDefaults, setNewAppDefaults] = useState<NewAppDefaults | undefined>(undefined);

  function handleStartRound(payload: RestackStartRoundPayload) {
    setNewAppDefaults({
      client_id: payload.client_id,
      client_name: payload.client_name,
      round: payload.round,
    });
    setShowNewApp(true);
  }

  function handleMarkAllRead() {
    setReadIds(new Set(ACTIVITY_ITEMS.map((item) => item.id)));
    setMarkAllLabel('\u2713 Marked');
    toast.success('All activity marked as read');
    setTimeout(() => setMarkAllLabel('Mark all read'), 2000);
  }

  return (
    <div className="space-y-8">
      {/* ── Onboarding checklist (shown for new tenants) ── */}
      <SetupChecklist />

      {/* ── Page header ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewAppDefaults(undefined);
            setShowNewApp(true);
          }}
          className="btn-accent btn flex-shrink-0"
        >
          <span aria-hidden="true">+</span>
          New Application
        </button>
      </div>

      {/* ── Full-width: StatsBar (5 KPI cards with sparklines) ── */}
      <StatsBar />

      {/* ── Full-width: Conditional banners ──────────────── */}
      <ConsentAlertBanner />
      <AprExpiryPanel />

      {/* ── Main body — 2-col grid ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left column (2/3 width) ─────────────────────── */}
        <div className="xl:col-span-2 space-y-6">
          <ActionQueue />
          <RecentApplicationsEnhanced />
          <ActiveFundingRounds />
          <UpcomingPayments />
          <DealCommitteeQueue />
        </div>

        {/* ── Right column (1/3 width) ────────────────────── */}
        <div className="space-y-6">

          {/* Portfolio Health Score */}
          <PortfolioHealthWidget />

          {/* Compliance Health panel */}
          <SectionCard
            title="Compliance Health"
            subtitle="Aggregate score across active clients"
          >
            <div className="flex flex-col items-center gap-4">
              <ComplianceRing score={84} />
              <div className="w-full space-y-2">
                <ComplianceRow label="State disclosures"   status="approved"   count={42} />
                <ComplianceRow label="TILA requirements"   status="approved"   count={38} />
                <ComplianceRow label="Pending reviews"     status="pending"    count={6}  />
                <ComplianceRow label="Overdue items"       status="declined"   count={2}  />
              </div>
              <Link
                href="/compliance"
                className="btn-outline btn btn-sm w-full justify-center"
              >
                Open Compliance Center
              </Link>
            </div>
            {/* State disclosure deadlines — embedded below compliance overview */}
            <div className="mt-4 border-t border-surface-border pt-4">
              <StateDisclosureDeadlines />
            </div>
          </SectionCard>

          <PortfolioRiskHeatmap />
          <RestackWidget onStartRound={handleStartRound} />
          <RestackOpportunities />
          <VoiceForgeActivity />

          {/* Activity feed */}
          <SectionCard
            title="Recent Activity"
            action={
              <button
                className="text-xs text-brand-gold-600 hover:underline"
                onClick={handleMarkAllRead}
              >
                {markAllLabel}
              </button>
            }
          >
            <div className="divide-y divide-surface-border -mx-6">
              {ACTIVITY_ITEMS.map((item) => {
                const isRead = readIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`px-6 py-3 flex items-start gap-3 transition-opacity duration-300 ${isRead ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`
                        inline-flex items-center justify-center w-8 h-8 rounded-full
                        flex-shrink-0 text-[10px] font-bold
                        ${item.iconBg} ${item.iconText}
                      `}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 leading-snug">
                        {item.description}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* New Application Modal */}
      <NewApplicationModal
        isOpen={showNewApp}
        onClose={() => setShowNewApp(false)}
        defaults={newAppDefaults}
      />
    </div>
  );
}
