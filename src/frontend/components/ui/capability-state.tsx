// ============================================================
// CapitalForge — the three states a surface can be in
//
// Four pages that were working correctly were filed as bugs, repeatedly, by
// the person who built them. Not because the copy was wrong — the copy is
// careful and has caught real defects — but because three different facts
// rendered as the same grey paragraph:
//
//   1. This capability is not built.
//   2. It works; this client has nothing to show.
//   3. The read failed.
//
// "Nothing generates tax forms" and "this client has no invoices" are not
// the same sentence, and until now they looked identical. An advisor, who
// did not build the system, will do worse than its author did.
//
// So the distinction is carried by SHAPE, not only by colour or wording:
//
//   not_built  solid border, heavy left rule, filled ground, ▨
//              — a wall. A statement about the system.
//   no_data    DASHED border, no rule, white ground, ○
//              — a frame waiting to be filled. A statement about the data.
//   failed     solid border, heavy left rule, red ground, ⚠
//              — a wall, in the colour of an error.
//
// The dashed border is the load-bearing choice. It is the only one of the
// three that reads as "this works, there is nothing in it", which is exactly
// the state that was being misread as breakage. Colour distinguishes
// not_built from failed; shape distinguishes both from no_data, and survives
// greyscale, colour-blindness, and a glance from across a desk.
//
// The state label is real text, not a colour or an icon alone, so it reaches
// a screen reader as a word.
//
// A fourth fact — "not built, and deliberately so" — is carried as a
// modifier on the last line rather than as a fourth visual state. A fourth
// colour would dilute the recognition this component exists to create.
// ============================================================

import type { ReactNode } from 'react';

export type CapabilityStateKind = 'not_built' | 'no_data' | 'failed';

export interface CapabilityUnblock {
  /**
   * `unblocked_by` — absent for now, and this is what would change it.
   * `deliberate`   — absent on purpose, and this is why.
   *
   * The difference matters to a reader deciding whether to wait for
   * something or stop asking. `gaps.md` §3b already draws it.
   */
  kind: 'unblocked_by' | 'deliberate';
  text: string;
}

export interface CapabilityStateProps {
  state: CapabilityStateKind;
  /** What the state is about — a capability, or the data that is missing. */
  title: string;
  /** One or two sentences. The page's longer prose stays where it is. */
  detail?: ReactNode;
  /** Only meaningful for `not_built`; ignored otherwise. */
  unblock?: CapabilityUnblock;
  /** `page` sits under the page title; `section` sits inside a card. */
  size?: 'page' | 'section';
}

const LABEL: Record<CapabilityStateKind, string> = {
  not_built: 'Not built',
  no_data: 'No data',
  failed: 'Failed',
};

/**
 * Glyphs are decorative — the label beside them carries the meaning, so they
 * are hidden from assistive technology rather than announced as punctuation.
 */
const GLYPH: Record<CapabilityStateKind, string> = {
  not_built: '▨',
  no_data: '○',
  failed: '⚠',
};

const CONTAINER: Record<CapabilityStateKind, string> = {
  // Solid, filled, heavy left rule: a wall.
  not_built:
    'border border-slate-300 border-l-4 border-l-slate-500 bg-slate-50',
  // Dashed, white, no rule: a frame with nothing in it yet.
  no_data: 'border border-dashed border-gray-300 bg-white',
  // A wall, in the colour of an error.
  failed: 'border border-red-300 border-l-4 border-l-red-500 bg-red-50',
};

const CHIP: Record<CapabilityStateKind, string> = {
  not_built: 'bg-slate-200 text-slate-800',
  no_data: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-200 text-red-900',
};

const TITLE_TEXT: Record<CapabilityStateKind, string> = {
  not_built: 'text-slate-900',
  no_data: 'text-gray-700',
  failed: 'text-red-900',
};

const DETAIL_TEXT: Record<CapabilityStateKind, string> = {
  not_built: 'text-slate-700',
  no_data: 'text-gray-500',
  failed: 'text-red-800',
};

export function CapabilityState({
  state,
  title,
  detail,
  unblock,
  size = 'page',
}: CapabilityStateProps) {
  const pad = size === 'page' ? 'px-4 py-3' : 'px-3 py-2.5';

  return (
    <div
      className={`rounded-lg ${CONTAINER[state]} ${pad}`}
      // `status` for the two states a reader may be waiting on. `not_built`
      // is a standing property of the system rather than an event, so it is
      // not announced as one.
      {...(state === 'not_built' ? {} : { role: 'status' })}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span aria-hidden="true" className={DETAIL_TEXT[state]}>
          {GLYPH[state]}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CHIP[state]}`}
        >
          {LABEL[state]}
        </span>
        <span className={`text-sm font-semibold ${TITLE_TEXT[state]}`}>{title}</span>
      </div>

      {detail !== undefined && (
        <p className={`mt-1 text-xs leading-relaxed ${DETAIL_TEXT[state]}`}>{detail}</p>
      )}

      {state === 'not_built' && unblock !== undefined && (
        <p className="mt-1.5 text-xs text-slate-700">
          <span className="font-semibold">
            {unblock.kind === 'deliberate' ? 'Deliberate: ' : 'Unblocked by: '}
          </span>
          {unblock.text}
        </p>
      )}
    </div>
  );
}
