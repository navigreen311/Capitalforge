'use client';

// ============================================================
// DerivedStepIndicator — a step whose completion is read, not marked
//
// Deliberately not a button and not a checkbox. Steps 2, 4, 5 and 6 report
// what the client's data says — an address on file, trade lines reporting to
// D&B, the PAYDEX, a submitted card application — and none of that is an
// advisor's to set. Offering a control that took the click and changed nothing
// would be the quiet version of the defect this page was audited for.
//
// It carries `role="img"` with a label rather than `role="checkbox"`: a
// checkbox announces itself as settable, and a screen reader user should not
// be told they can change something they cannot.
// ============================================================

export interface DerivedStepIndicatorProps {
  completed: boolean;
  /**
   * Whether the underlying data was read at all. False before a client is
   * chosen, when nothing has been asked for.
   *
   * An empty ring for "not read" and an empty ring for "read, and not met"
   * would be the same mark for two different facts, which is the confusion the
   * null handling elsewhere on this page exists to prevent.
   */
  known: boolean;
}

export function DerivedStepIndicator({ completed, known }: DerivedStepIndicatorProps) {
  if (!known) {
    return (
      <div
        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full
                   border-2 border-dashed border-gray-700 text-gray-600"
        role="img"
        aria-label="Not read — no client selected"
        title="Read from the client's data. No client is selected, so nothing has been read."
      >
        <span className="text-xs font-bold leading-none">?</span>
      </div>
    );
  }

  return (
    <div
      className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2
        ${completed
          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
          : 'border-gray-600 bg-transparent text-gray-600'
        }`}
      role="img"
      aria-label={
        completed
          ? 'Met, from this client’s data'
          : 'Not yet met, from this client’s data'
      }
      title={
        completed
          ? 'Read from this client’s data. Not marked by hand, and it will stop being met if the data changes.'
          : 'Read from this client’s data. It completes when the data below is satisfied.'
      }
    >
      <svg
        className={`h-4 w-4 transition-opacity ${completed ? 'opacity-100' : 'opacity-0'}`}
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
    </div>
  );
}
