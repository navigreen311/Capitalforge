// ============================================================
// CapitalForge — the unbuilt-capability register cannot drift
//
// `docs/gaps.md` §5 listed seven pages that explain an absence, and stated
// that as the set. It was a subset: a scan of the app tree returns at least
// nineteen. Four of the missing ones were filed as bugs by the person who
// wrote them, after consulting this very document to check whether a blank
// page was expected. It answered, and it answered wrongly.
//
// The list was maintained by remembering to update it. That is the defect —
// not the twelve missing entries, which are only what the defect produced.
//
// So the register is checked against the source rather than trusted. Every
// page rendering `CapabilityState` with `state="not_built"` must appear in
// the block in §5, and every route in that block must still declare one.
//
// Scope: `not_built` only. `no_data` and `failed` describe a request, not the
// product, and there is nothing about them to enumerate — a page can be empty
// for one client and full for the next.
//
// This reads the tree rather than modelling it. The failure mode a hand-kept
// list has is exactly the one `scripts/track-migration-impact.ts` had: a copy
// that keeps answering plausibly after the thing it copied moved on.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';

const REPO = process.cwd();
const APP_DIR = join(REPO, 'src', 'frontend', 'app');
const GAPS = join(REPO, 'docs', 'gaps.md');

const BEGIN = '<!-- capability-state:not-built:begin -->';
const END = '<!-- capability-state:not-built:end -->';

/**
 * Source with comments removed.
 *
 * Load-bearing here, not hygiene: this repo documents its reasoning in
 * comments, and several of the files being scanned discuss `not_built` in
 * prose — including the component's own header and the note on each page
 * explaining why the marker is there. Matching raw text would count an
 * explanation of the rule as an instance of it.
 */
function code(abs: string): string {
  return readFileSync(abs, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Every `page.tsx` under the app directory. */
function pageFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) pageFiles(full, found);
    else if (entry.name === 'page.tsx') found.push(full);
  }
  return found;
}

/** `src/frontend/app/billing/page.tsx` → `/billing` */
function routeOf(absPageFile: string): string {
  const rel = relative(APP_DIR, absPageFile).split(sep).slice(0, -1).join('/');
  return `/${rel}`;
}

/** Routes whose page source renders a `not_built` marker. */
function routesDeclaringNotBuilt(): string[] {
  return pageFiles(APP_DIR)
    .filter((f) => /state=(["'])not_built\1/.test(code(f)))
    .map(routeOf)
    .sort();
}

/** Routes listed in the §5 register block. */
function routesInRegister(): string[] {
  const doc = readFileSync(GAPS, 'utf8');
  const start = doc.indexOf(BEGIN);
  const end = doc.indexOf(END);

  // Asserted rather than tolerated: if the markers go missing the block has
  // been edited away, and a check that silently passes on an absent register
  // is worse than no check — it reports agreement between two things when one
  // of them is gone.
  expect(start, `${BEGIN} not found in docs/gaps.md`).toBeGreaterThan(-1);
  expect(end, `${END} not found in docs/gaps.md`).toBeGreaterThan(start);

  return doc
    .slice(start + BEGIN.length, end)
    .split('\n')
    .map((line) => /^-\s+`([^`]+)`/.exec(line.trim())?.[1])
    .filter((r): r is string => r !== undefined)
    .sort();
}

describe('unbuilt-capability register', () => {
  it('every page declaring not_built is listed in gaps.md §5', () => {
    const declared = routesDeclaringNotBuilt();
    const listed = routesInRegister();

    const unlisted = declared.filter((r) => !listed.includes(r));

    expect(
      unlisted,
      `These routes render CapabilityState state="not_built" but are absent from the ` +
        `register block in docs/gaps.md §5. Add them there, with the capability named:\n` +
        unlisted.map((r) => `  - \`${r}\` — <capability>`).join('\n'),
    ).toEqual([]);
  });

  it('every route in the register still declares not_built', () => {
    const declared = routesDeclaringNotBuilt();
    const listed = routesInRegister();

    // The other direction, and the one a stale list fails. §5 went stale by
    // describing a fixed defect as open; a register entry for a capability
    // that has since been built is the same error with the sign flipped.
    const stale = listed.filter((r) => !declared.includes(r));

    expect(
      stale,
      `These routes are listed in docs/gaps.md §5 but no longer render ` +
        `CapabilityState state="not_built". If the capability was built, remove the ` +
        `entry; if the page moved, update it:\n` +
        stale.map((r) => `  - \`${r}\``).join('\n'),
    ).toEqual([]);
  });

  it('finds pages to check at all', () => {
    // A scan that silently matched nothing would make both assertions above
    // pass trivially and for ever — the empty-result-as-success failure this
    // repo has already been bitten by twice.
    expect(pageFiles(APP_DIR).length).toBeGreaterThan(20);
    expect(routesDeclaringNotBuilt().length).toBeGreaterThan(0);
  });

  it('does not count prose about not_built as a declaration', () => {
    // The component's own header comment discusses `not_built` at length and
    // renders no marker. If comment-stripping regresses, this fails.
    const componentRoutes = routesDeclaringNotBuilt();
    expect(componentRoutes.every((r) => r.startsWith('/'))).toBe(true);
    expect(componentRoutes).not.toContain('/components/ui/capability-state');
  });
});
