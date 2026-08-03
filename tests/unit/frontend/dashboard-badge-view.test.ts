// ============================================================
// The dashboard badge renders any status without throwing
//
// `STATUS_MAP[status].label` threw on `cancelled`, which is a real card
// application status. Because that happens during render, the widget's own
// error handling never saw it — the throw unwound to the page error boundary
// and the entire dashboard became "Something Went Wrong".
//
// The seeded database had no cancelled application, so this was invisible
// until something cancelled one. That is the shape of the bug worth guarding:
// not "cancelled works" but "an unrecognised status cannot take the page
// down", because the next new status will not be in the map either.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  resolveBadgeAppearance,
  KNOWN_BADGE_STATUSES,
} from '../../../src/frontend/lib/dashboard-badge-view';

describe('resolveBadgeAppearance', () => {
  it('resolves every status it claims to know', () => {
    for (const status of KNOWN_BADGE_STATUSES) {
      const cfg = resolveBadgeAppearance(status);
      expect(cfg.unmapped, `${status} should be mapped`).toBe(false);
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.bg.length).toBeGreaterThan(0);
    }
  });

  it('includes cancelled, which is a real application status', () => {
    // Applications reach this state through the card cancellation path, and
    // three of them are in the development database.
    const cfg = resolveBadgeAppearance('cancelled');
    expect(cfg.unmapped).toBe(false);
    expect(cfg.label).toBe('Cancelled');
  });

  it('does not throw on a status it has never seen', () => {
    expect(() => resolveBadgeAppearance('pending_documents')).not.toThrow();
  });

  it('shows an unknown status as recorded rather than as a neighbour', () => {
    const cfg = resolveBadgeAppearance('sanctions_hold');

    expect(cfg.unmapped).toBe(true);
    // Not "Pending", not "Blocked" — mapping an unrecognised status onto a
    // known one would be the badge deciding what the application is doing.
    expect(cfg.label).toBe('sanctions hold');
  });

  it('is grey for an unknown status, not green or red', () => {
    const cfg = resolveBadgeAppearance('something_new');

    // An unknown status is neither good news nor bad news. Colouring it
    // either way states a position the badge does not have.
    expect(cfg.bg).toContain('gray');
    expect(cfg.text).toContain('gray');
    expect(cfg.dot).toContain('gray');
  });

  it('renders an empty status rather than an empty badge', () => {
    expect(resolveBadgeAppearance('').label).toBe('Unknown');
    expect(resolveBadgeAppearance('   ').label).toBe('Unknown');
  });

  it('never returns undefined for any string', () => {
    for (const s of ['', 'x', 'APPROVED', 'approved ', '123', 'a_b_c']) {
      const cfg = resolveBadgeAppearance(s);
      expect(cfg).toBeDefined();
      expect(typeof cfg.label).toBe('string');
    }
  });
});
