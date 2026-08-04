// ============================================================
// CapitalForge — "not known" is not "none"
//
// Two surfaces defaulted an unreadable value to the reassuring one:
//
//   NavBadgeProvider   an unreadable count became 0, which the sidebar draws
//                      as no badge — i.e. "nothing waiting"
//   Settings 2FA       an unreadable status became false, which the panel
//                      draws as "2FA is off, would you like to enable it?"
//
// In both the failure was invisible and pointed the wrong way. A queue nobody
// could reach looked empty; an account whose protection could not be confirmed
// looked unprotected.
//
// These are source-level assertions rather than rendered ones: there is no
// component test harness in this repo, and the properties worth protecting are
// exactly the ones a careless edit would revert — a `?? 0`, a `useState(false)`,
// a truthiness check standing in for an explicit comparison.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const FRONTEND = join(process.cwd(), 'src', 'frontend');
const read = (rel: string): string => readFileSync(join(FRONTEND, rel), 'utf8');

/**
 * Source with comments removed.
 *
 * Needed because the first version of this file asserted on the raw text and
 * failed against a comment reading "?? null, not ?? 0" — prose explaining the
 * rule, matched as a violation of it. An assertion about what the code does
 * has to look at the code.
 */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('nav badge counts distinguish zero from unknown', () => {
  const provider = code('components/dashboard/NavBadgeProvider.tsx');
  const sidebar = code('components/ui/sidebar.tsx');

  it('types a count as nullable', () => {
    expect(provider).toMatch(/export type BadgeCount = number \| null/);
  });

  it('starts unknown rather than at zero', () => {
    // DEFAULT_COUNTS renders while the first request is in flight and whenever
    // there is no session. Zeroes there flash "all clear" on every page load.
    const defaults = /const DEFAULT_COUNTS: NavBadgeCounts = \{([\s\S]*?)\}/.exec(provider);
    expect(defaults).not.toBeNull();
    expect(defaults?.[1]).not.toMatch(/:\s*0\b/);
  });

  it('never substitutes zero for a count it could not read', () => {
    // The two failure paths in fetchCount, and the ?? on each nav-counts key.
    expect(provider).not.toMatch(/\?\?\s*0\b/);
    expect(provider).not.toMatch(/return 0;/);
  });

  it('renders an unknown count as its own thing, not as a missing badge', () => {
    expect(sidebar).toMatch(/item\.badge === null/);
  });

  it('does not give an unknown count the alert colour', () => {
    // An alert colour asserts that something needs attention. The whole point
    // of the unknown badge is that we do not know whether anything does, so it
    // must not reuse item.badgeColor.
    const unknownBlock = /item\.badge === null && \(([\s\S]*?)\n {6}\)\}/.exec(sidebar);
    expect(unknownBlock).not.toBeNull();
    expect(unknownBlock?.[1]).not.toMatch(/badgeColor/);
    // And it must say what it means to someone who cannot see colour at all.
    expect(unknownBlock?.[1]).toMatch(/aria-label|title=/);
  });
});

describe('2FA status distinguishes off from unknown', () => {
  const settings = code('app/settings/page.tsx');

  it('starts unknown rather than off', () => {
    expect(settings).toMatch(
      /useState<boolean \| null>\(null\);?\s*\n\s*const \[twoFactorStatusError/,
    );
  });

  it('compares explicitly rather than by truthiness', () => {
    // `!twoFactorEnabled` is true for both false and null, which is exactly
    // the conflation this change removes: it would show the "not enabled"
    // panel, and its Enable button, for an account whose status is unknown.
    expect(settings).not.toMatch(/!twoFactorEnabled/);
    expect(settings).toMatch(/twoFactorEnabled === false && twoFactorSetupPhase === 'idle'/);
    expect(settings).toMatch(/twoFactorEnabled === true && twoFactorSetupPhase === 'idle'/);
  });

  it('has a branch for the unknown case', () => {
    expect(settings).toMatch(/twoFactorEnabled === null && twoFactorSetupPhase === 'idle'/);
  });

  it('offers neither Enable nor Disable while the status is unknown', () => {
    // Both state a fact about the account the panel does not have. The only
    // honest action is to ask again.
    const unknownBranch =
      /twoFactorEnabled === null && twoFactorSetupPhase === 'idle' && \(([\s\S]*?)\n {12}\)\}/
        .exec(settings);
    expect(unknownBranch).not.toBeNull();
    expect(unknownBranch?.[1]).not.toMatch(/handle2FASetup|setDisableModalOpen/);
    expect(unknownBranch?.[1]).toMatch(/load2FAStatus/);
  });
});
