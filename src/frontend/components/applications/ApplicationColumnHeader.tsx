'use client';

// ============================================================
// ApplicationColumnHeader — Kanban column header with status
// dot, count badge, and optional "+ New Draft" button.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ApplicationColumnHeaderProps {
  title: string;
  count: number;
  statusKey: string;
  showAddButton?: boolean;
  onAddClick?: () => void;
}

// ── Status styling map ──────────────────────────────────────────────────────

const STATUS_DOT_CLASSES: Record<string, string> = {
  draft:           'bg-gray-400',
  pending_consent: 'bg-blue-500',
  submitted:       'bg-amber-500',
  approved:        'bg-green-500',
  declined:        'bg-red-500',
};

const STATUS_COUNT_CLASSES: Record<string, string> = {
  draft:           'bg-gray-100 text-gray-700',
  pending_consent: 'bg-blue-100 text-blue-700',
  submitted:       'bg-amber-100 text-amber-700',
  approved:        'bg-green-100 text-green-700',
  declined:        'bg-red-100 text-red-700',
};

// ── Component ───────────────────────────────────────────────────────────────

export function ApplicationColumnHeader({
  title,
  count,
  statusKey,
  showAddButton = false,
  onAddClick,
}: ApplicationColumnHeaderProps) {
  const dotClass = STATUS_DOT_CLASSES[statusKey] ?? 'bg-gray-400';
  const countClass = STATUS_COUNT_CLASSES[statusKey] ?? 'bg-gray-100 text-gray-700';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {/* Title with status dot */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {title}
          </span>
        </div>

        {/* Count badge */}
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${countClass}`}
        >
          {count}
        </span>
      </div>

      {/* Optional add button for draft column */}
      {showAddButton && (
        <button
          type="button"
          onClick={onAddClick}
          className="w-full flex items-center justify-center gap-1
                     text-xs font-medium text-gray-500 hover:text-gray-700
                     border border-dashed border-gray-300 hover:border-gray-400
                     rounded-lg py-1.5 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          New Draft
        </button>
      )}
    </div>
  );
}
