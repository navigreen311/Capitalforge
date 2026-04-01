'use client';

// ============================================================
// StepCompletionToggle — Clickable circle that toggles step
// completion status within a credit-builder step row.
//
// Renders a green filled circle + checkmark when completed,
// or an empty bordered circle when incomplete. Clicking
// toggles the state via the onToggle callback.
// ============================================================

import React, { useCallback } from 'react';

export interface StepCompletionToggleProps {
  stepId: string;
  completed: boolean;
  completedDate: string | null;
  onToggle: (stepId: string, newState: boolean) => void;
  disabled?: boolean;
}

export function StepCompletionToggle({
  stepId,
  completed,
  completedDate,
  onToggle,
  disabled = false,
}: StepCompletionToggleProps) {
  const handleClick = useCallback(() => {
    if (disabled) return;
    onToggle(stepId, !completed);
  }, [disabled, onToggle, stepId, completed]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle(stepId, !completed);
      }
    },
    [disabled, onToggle, stepId, completed],
  );

  const formattedDate = completedDate
    ? new Date(completedDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      {/* Toggle circle */}
      <button
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-label={
          completed
            ? `Mark step ${stepId} as incomplete`
            : `Mark step ${stepId} as complete`
        }
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`
          flex items-center justify-center
          w-7 h-7 rounded-full
          border-2 transition-all duration-200 ease-in-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900
          ${
            completed
              ? 'bg-emerald-500 border-emerald-500 text-white scale-100 hover:bg-emerald-600 hover:border-emerald-600'
              : 'bg-transparent border-gray-500 text-transparent hover:border-emerald-400'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          active:scale-110
        `}
        style={{
          // Brief scale-up animation on state change via CSS transition
          transform: completed ? 'scale(1)' : 'scale(1)',
        }}
      >
        {/* Checkmark SVG */}
        <svg
          className={`w-4 h-4 transition-opacity duration-200 ${
            completed ? 'opacity-100' : 'opacity-0'
          }`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
        </svg>
      </button>

      {/* Completed date label */}
      {completed && formattedDate && (
        <span className="text-[10px] text-emerald-400 leading-tight whitespace-nowrap">
          Completed {formattedDate}
        </span>
      )}
    </div>
  );
}
