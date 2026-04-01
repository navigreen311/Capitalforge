import React from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CardOption {
  id: string;
  name: string;
  issuer: string;
}

interface ExistingCardsGroupedProps {
  businessCards: CardOption[];
  personalCards: CardOption[];
  selectedIds: string[];
  onToggle: (cardId: string) => void;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function CardCheckbox({
  card,
  checked,
  onToggle,
}: {
  card: CardOption;
  checked: boolean;
  onToggle: (cardId: string) => void;
}) {
  return (
    <label
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        checked
          ? 'bg-white/[0.08] ring-1 ring-white/10'
          : 'hover:bg-white/[0.04]'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(card.id)}
        className="w-4 h-4 rounded border-gray-600 bg-transparent text-blue-500 focus:ring-blue-500/40 focus:ring-offset-0"
      />
      <span className="text-sm text-gray-200">{card.name}</span>
      <span className="text-xs text-gray-500">({card.issuer})</span>
    </label>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ExistingCardsGrouped({
  businessCards,
  personalCards,
  selectedIds,
  onToggle,
}: ExistingCardsGroupedProps) {
  return (
    <div className="space-y-6">
      {/* ── Business Cards ─────────────────────────────────────────── */}
      <section>
        <h3 className="mb-1 text-xs font-bold tracking-widest text-gray-400 uppercase">
          Existing Business Cards{' '}
          <span className="font-normal text-gray-500">
            (affects business card velocity)
          </span>
        </h3>

        <div className="mt-3 space-y-1">
          {businessCards.map((card) => (
            <CardCheckbox
              key={card.id}
              card={card}
              checked={selectedIds.includes(card.id)}
              onToggle={onToggle}
            />
          ))}
          {businessCards.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500">
              No business cards configured.
            </p>
          )}
        </div>

        <p className="mt-2 px-1 text-xs text-gray-500">
          These cards affect issuer velocity rules for business applications
        </p>
      </section>

      {/* ── Personal Cards ─────────────────────────────────────────── */}
      <section>
        <h3 className="mb-1 text-xs font-bold tracking-widest text-gray-400 uppercase">
          Personal Cards Held{' '}
          <span className="font-normal text-gray-500">
            (affects some issuer velocity rules)
          </span>
        </h3>

        <div className="mt-3 space-y-1">
          {personalCards.map((card) => (
            <CardCheckbox
              key={card.id}
              card={card}
              checked={selectedIds.includes(card.id)}
              onToggle={onToggle}
            />
          ))}
          {personalCards.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500">
              No personal cards configured.
            </p>
          )}
        </div>

        <p className="mt-2 px-1 text-xs text-gray-500">
          Chase 5/24 counts ALL new accounts including personal cards
        </p>
      </section>
    </div>
  );
}
