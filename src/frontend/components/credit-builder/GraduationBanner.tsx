// ============================================================
// GraduationBanner — Prominent banner for tier unlock readiness
// Shown when all prerequisites for a given tier are met
// ============================================================

'use client';

import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraduationBannerProps {
  clientId: string | null;
  clientName: string | null;
  tier: 1 | 2 | 3;
  isUnlocked: boolean;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GraduationBanner({ clientId, clientName, tier, isUnlocked }: GraduationBannerProps) {
  const router = useRouter();

  if (!isUnlocked) return null;

  function handleRunOptimizer() {
    router.push(`/optimizer?client_id=${clientId}&from=graduation`);
  }

  return (
    <div className="rounded-xl bg-gradient-to-r from-green-600/80 to-teal-600/80 border border-green-500/30 p-5 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Left — icon + copy */}
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" role="img" aria-label="Target">
            🎯
          </span>
          <div>
            <p className="text-base font-bold text-white">
              {clientName ?? 'Client'} is ready for Tier {tier} stacking!
            </p>
            <p className="text-sm text-green-100/80 mt-0.5">
              All business credit prerequisites are met. Run the Optimizer to generate a card
              recommendation plan.
            </p>
          </div>
        </div>

        {/* Right — CTA */}
        <button
          type="button"
          onClick={handleRunOptimizer}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 active:bg-white/30 border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          Run Optimizer
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
