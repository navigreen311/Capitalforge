'use client';

// ============================================================
// NewRoundOptimizerSuggestion — Shows an optimizer-suggested
// target amount for the new funding round with an amber-bordered
// card and a one-click "Use Suggested Amount" action.
// ============================================================

import { SectionCard } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewRoundOptimizerSuggestionProps {
  suggestedAmount: number;
  reason: string;
  remainingLeverage: number;
  onUseSuggestion: (amount: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewRoundOptimizerSuggestion({
  suggestedAmount,
  reason,
  remainingLeverage,
  onUseSuggestion,
}: NewRoundOptimizerSuggestionProps) {
  return (
    <SectionCard title="Optimizer Suggestion" className="border-amber-300">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-start gap-3">
          {/* Lightbulb icon */}
          <span className="text-xl leading-none mt-0.5" aria-hidden="true">
            &#x1F4A1;
          </span>

          <div className="flex-1 space-y-2">
            {/* Suggested amount */}
            <p className="text-base font-semibold text-gray-900">
              Optimizer suggests:{' '}
              <span className="text-amber-700">
                ${suggestedAmount.toLocaleString()}
              </span>
            </p>

            {/* Reason / explanation */}
            <p className="text-sm text-gray-600">{reason}</p>

            {/* Remaining leverage context */}
            <p className="text-xs text-gray-500">
              Remaining safe leverage:{' '}
              <span className="font-medium text-gray-700">
                ${remainingLeverage.toLocaleString()}
              </span>
            </p>

            {/* Action button */}
            <button
              type="button"
              onClick={() => onUseSuggestion(suggestedAmount)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2
                         text-sm font-semibold text-white shadow-sm
                         hover:bg-amber-700 focus-visible:outline focus-visible:outline-2
                         focus-visible:outline-offset-2 focus-visible:outline-amber-600
                         transition-colors"
            >
              Use Suggested Amount
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
