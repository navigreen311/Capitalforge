'use client';

import { useState } from 'react';
import { SectionCard } from '@/components/ui/card';
import {
  ComplianceHealthPanel,
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
  AskAIWidget,
  RecentActivity,
} from '@/components/dashboard';
import type { RestackStartRoundPayload } from '@/components/dashboard';
import { SetupChecklist } from '@/components/onboarding/SetupChecklist';
import { NewApplicationModal } from '@/components/applications';
import type { NewAppDefaults } from '@/components/applications';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
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

          {/* Ask AI widget */}
          <AskAIWidget />

          {/* Compliance Health panel */}
          {/* The subtitle said "Aggregate score across active clients". The
              score is computed from compliance checks, and a client with no
              check on record contributes nothing to it — so it was describing
              a coverage this number does not have. */}
          <SectionCard
            title="Compliance Health"
            subtitle="From compliance checks on record"
          >
            <ComplianceHealthPanel />
            {/* State disclosure deadlines — embedded below compliance overview */}
            <div className="mt-4 border-t border-surface-border pt-4">
              <StateDisclosureDeadlines />
            </div>
          </SectionCard>

          <PortfolioRiskHeatmap />
          <RestackWidget onStartRound={handleStartRound} />
          <RestackOpportunities />
          <VoiceForgeActivity />

          <RecentActivity />
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
