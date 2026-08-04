// ============================================================
// CapitalForge — the membership registry is complete and sourced
//
// Four tables in this codebase carried a join cost for the same six credit
// unions and no two agreed: Alliant $5 and $10, PenFed $5 and $17, First Tech
// $50 and $15. The same card showed different numbers in three places on one
// screen, and an advisor quoting one of them sent a client to meet another.
//
// The tables are gone and CREDIT_UNION_MEMBERSHIP is the only source. These
// tests are what keeps it that way: every credit union described, every cost
// either sourced or explicitly unconfirmed, and no silent nulls.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  CREDIT_UNION_ISSUER_IDS,
  CREDIT_UNION_MEMBERSHIP,
  formatMembershipCost,
  membershipCostAmount,
} from '../../src/shared/constants/issuers.js';

describe('credit union membership registry', () => {
  it('describes every credit union in the registry', () => {
    // Record<CreditUnionIssuerId, MembershipPath> makes this a compile error
    // too. Asserted at runtime as well because the type only binds callers
    // inside this repo, and a card reaching a plan with no membership path is
    // a card recommended without saying it cannot be applied for.
    const missing = CREDIT_UNION_ISSUER_IDS.filter((id) => !CREDIT_UNION_MEMBERSHIP[id]);
    expect(missing).toEqual([]);
  });

  it('gives every membership a non-empty description', () => {
    const blank = CREDIT_UNION_ISSUER_IDS.filter(
      (id) => (CREDIT_UNION_MEMBERSHIP[id].description ?? '').trim() === '',
    );
    expect(blank).toEqual([]);
  });

  it('gives every cost a kind — no silent nulls', () => {
    const bad = CREDIT_UNION_ISSUER_IDS.filter((id) => {
      const cost = CREDIT_UNION_MEMBERSHIP[id].cost;
      return !cost || !['none', 'confirmed', 'unconfirmed'].includes(cost.kind);
    });
    expect(bad).toEqual([]);
  });

  it('requires a citation on every confirmed cost', () => {
    // A number without a source is how the four disagreeing tables came about.
    const uncited = CREDIT_UNION_ISSUER_IDS.filter((id) => {
      const cost = CREDIT_UNION_MEMBERSHIP[id].cost;
      return cost.kind === 'confirmed' && (cost.source ?? '').trim() === '';
    });
    expect(uncited).toEqual([]);
  });

  it('requires a note on every unconfirmed cost', () => {
    const unexplained = CREDIT_UNION_ISSUER_IDS.filter((id) => {
      const cost = CREDIT_UNION_MEMBERSHIP[id].cost;
      return cost.kind === 'unconfirmed' && (cost.note ?? '').trim() === '';
    });
    expect(unexplained).toEqual([]);
  });

  it('never renders an unconfirmed cost as a number', () => {
    // The whole point of the unconfirmed case. A figure with a caveat beside
    // it still reads as a figure: the eye takes the digits and skips the note.
    for (const id of CREDIT_UNION_ISSUER_IDS) {
      const cost = CREDIT_UNION_MEMBERSHIP[id].cost;
      if (cost.kind !== 'unconfirmed') continue;
      expect(formatMembershipCost(cost)).not.toMatch(/\d/);
      expect(membershipCostAmount(cost)).toBeNull();
    }
  });

  it('holds the costs we can cite, and leaves First Tech unconfirmed', () => {
    // Named explicitly so a future edit that "fills in" First Tech from one of
    // the deleted tables fails here. $15 and $50 both appeared in this
    // codebase; neither could be sourced, and the spread is threefold on a
    // number an advisor quotes aloud.
    expect(membershipCostAmount(CREDIT_UNION_MEMBERSHIP.alliant.cost)).toBe(5);
    expect(membershipCostAmount(CREDIT_UNION_MEMBERSHIP.penfed.cost)).toBe(5);
    expect(membershipCostAmount(CREDIT_UNION_MEMBERSHIP.lake_michigan_cu.cost)).toBe(5);
    expect(CREDIT_UNION_MEMBERSHIP.first_tech.cost.kind).toBe('unconfirmed');
  });

  it('treats Lake Michigan as open, not residency-gated', () => {
    // The frontend copy said "Restricted to lower Michigan residents" while
    // this entry said open — the same contradiction as the costs, one screen
    // apart. LMCU is open nationally through the ALS of Michigan donation.
    expect(CREDIT_UNION_MEMBERSHIP.lake_michigan_cu.kind).toBe('open');
    expect(CREDIT_UNION_MEMBERSHIP.lake_michigan_cu.state).toBeUndefined();
  });
});
