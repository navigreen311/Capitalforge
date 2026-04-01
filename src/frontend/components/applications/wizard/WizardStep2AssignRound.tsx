'use client';

/**
 * WizardStep2AssignRound — Funding round assignment step
 *
 * Lets the user choose how to associate a new application with a funding round:
 *   1. Add to an existing active round
 *   2. Create a brand-new round
 *   3. Keep the application standalone (no round)
 */

import React from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type RoundOption = 'existing' | 'new' | 'standalone';

interface WizardStep2Props {
  clientName: string;
  roundOption: RoundOption;
  selectedRoundId: string;
  newRoundTarget: number;
  newRoundCloseDate: string;
  onRoundOptionChange: (option: RoundOption) => void;
  onRoundSelect: (roundId: string) => void;
  onNewRoundChange: (field: string, value: string | number) => void;
  onBack: () => void;
  onNext: () => void;
}

// ── Placeholder active rounds (will be replaced by API data) ─────────────────

const ACTIVE_ROUNDS = [
  { id: 'fr-018', label: 'Round 1 — FR-018 ($105K / $150K)' },
  { id: 'fr-019', label: 'Round 2 — FR-019 ($0 / $200K)' },
];

// Auto-calculated next round number based on existing rounds
const NEXT_ROUND_NUMBER = ACTIVE_ROUNDS.length + 1;

// ── Component ────────────────────────────────────────────────────────────────

export default function WizardStep2AssignRound({
  clientName,
  roundOption,
  selectedRoundId,
  newRoundTarget,
  newRoundCloseDate,
  onRoundOptionChange,
  onRoundSelect,
  onNewRoundChange,
  onBack,
  onNext,
}: WizardStep2Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Assign Funding Round
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose how this application for <span className="font-medium text-gray-700">{clientName}</span> relates to a funding round.
        </p>
      </div>

      {/* ── Option 1: Existing Round ──────────────────────────────── */}
      <OptionCard
        selected={roundOption === 'existing'}
        onSelect={() => onRoundOptionChange('existing')}
        label="Add to existing round"
        description="Attach this application to one of the client's active funding rounds."
      >
        {roundOption === 'existing' && (
          <div className="mt-3">
            <label htmlFor="existing-round-select" className="cf-label">
              Select round
            </label>
            <select
              id="existing-round-select"
              className="cf-input"
              value={selectedRoundId}
              onChange={(e) => onRoundSelect(e.target.value)}
            >
              <option value="">— Choose a round —</option>
              {ACTIVE_ROUNDS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </OptionCard>

      {/* ── Option 2: New Round ───────────────────────────────────── */}
      <OptionCard
        selected={roundOption === 'new'}
        onSelect={() => onRoundOptionChange('new')}
        label="Create new round"
        description={`This will start Round ${NEXT_ROUND_NUMBER} for the client.`}
      >
        {roundOption === 'new' && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-round-target" className="cf-label">
                Target credit limit ($)
              </label>
              <input
                id="new-round-target"
                type="number"
                className="cf-input"
                placeholder="e.g. 200000"
                min={0}
                value={newRoundTarget || ''}
                onChange={(e) =>
                  onNewRoundChange('target', e.target.value ? Number(e.target.value) : 0)
                }
              />
            </div>
            <div>
              <label htmlFor="new-round-close" className="cf-label">
                Target close date
              </label>
              <input
                id="new-round-close"
                type="date"
                className="cf-input"
                value={newRoundCloseDate}
                onChange={(e) => onNewRoundChange('closeDate', e.target.value)}
              />
            </div>
          </div>
        )}
      </OptionCard>

      {/* ── Option 3: Standalone ──────────────────────────────────── */}
      <OptionCard
        selected={roundOption === 'standalone'}
        onSelect={() => onRoundOptionChange('standalone')}
        label="Standalone application"
        description="Use this for one-off applications outside a structured round."
      />

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-4 border-t border-surface-border">
        <button type="button" className="btn-outline" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="btn-primary" onClick={onNext}>
          Next →
        </button>
      </div>
    </div>
  );
}

// ── OptionCard (internal) ────────────────────────────────────────────────────

interface OptionCardProps {
  selected: boolean;
  onSelect: () => void;
  label: string;
  description: string;
  children?: React.ReactNode;
}

function OptionCard({ selected, onSelect, label, description, children }: OptionCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`
        rounded-xl border-2 p-4 cursor-pointer transition-all duration-150
        ${
          selected
            ? 'border-brand-navy bg-brand-navy/5 shadow-sm'
            : 'border-surface-border bg-white hover:border-gray-300'
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Custom radio indicator */}
        <span
          aria-hidden="true"
          className={`
            mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2
            transition-colors duration-150
            ${
              selected
                ? 'border-brand-navy bg-brand-navy'
                : 'border-gray-300 bg-white'
            }
          `}
        >
          {selected && (
            <span className="h-2 w-2 rounded-full bg-white" />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>

          {/* Expanded content (inputs) rendered only when selected */}
          {children && (
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
