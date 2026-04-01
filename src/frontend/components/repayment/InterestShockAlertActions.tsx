'use client';

// ============================================================
// InterestShockAlertActions — Action footer for interest shock
// alert cards. Renders a compact row of 2-3 buttons: Contact
// Client, View Repayment Plan, and optionally Explore Balance
// Transfer (when the client is eligible).
// ============================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InterestShockAlertActionsProps {
  clientId: string;
  card: string;
  issuer: string;
  transferEligible: boolean;
  onContactClient: () => void;
  onViewPlan: () => void;
  onExploreTransfer: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function InterestShockAlertActions({
  clientId,
  card,
  issuer,
  transferEligible,
  onContactClient,
  onViewPlan,
  onExploreTransfer,
}: InterestShockAlertActionsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Contact Client */}
      <button
        type="button"
        onClick={onContactClient}
        className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 font-semibold transition-colors"
      >
        Contact Client
      </button>

      {/* View Repayment Plan */}
      <button
        type="button"
        onClick={onViewPlan}
        className="text-xs px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-blue-300 border border-blue-700 font-semibold transition-colors"
      >
        View Repayment Plan &rarr;
      </button>

      {/* Explore Balance Transfer — only when eligible */}
      {transferEligible && (
        <button
          type="button"
          onClick={onExploreTransfer}
          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-300 border border-emerald-700 font-semibold transition-colors"
        >
          Explore Balance Transfer
        </button>
      )}
    </div>
  );
}
