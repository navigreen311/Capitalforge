// ============================================================
// Every issuer we know about must have configuration, and vice versa
//
// Issuer slugs key several independent tables: the optimizer's cooldowns, the
// credit union membership map, the rules engine's credit union configs. Each
// lookup is a `Record`, so a key that does not match returns `undefined` and
// the caller reads that as "nothing special applies" — no cooldown, no
// membership requirement, no velocity rule. The card still appears in plans and
// nothing about the output looks wrong.
//
// That is how `lake_michigan` in the rules engine sat beside `lake_michigan_cu`
// in the card catalogue without anything noticing: two spellings of one credit
// union, one of which resolved to no configuration at all.
//
// This asserts both directions — every issuer has config, every config names a
// real issuer — so a spelling that drifts fails the build rather than a
// request. It is a fact about static tables, so it belongs here and not in a
// runtime check that would surface while an advisor was running a plan.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  KNOWN_ISSUER_IDS,
  BANK_ISSUER_IDS,
  CREDIT_UNION_ISSUER_IDS,
  CREDIT_UNION_MEMBERSHIP,
  isKnownIssuerId,
} from '../../../src/shared/constants/issuers';
import { CREDIT_UNION_SLUGS_IN_RULES_ENGINE } from '../../../src/backend/services/issuer-rules-engine';
import { ISSUER_COOLDOWN_IDS } from '../../../src/backend/services/stacking-optimizer.service';

describe('credit union membership map', () => {
  it.each([...CREDIT_UNION_ISSUER_IDS])('has a membership path for %s', (id) => {
    // Without one, `assessMembership` reports "no membership requirement
    // recorded" — which reads as though joining were optional.
    expect(CREDIT_UNION_MEMBERSHIP[id]).toBeDefined();
  });

  it('names no issuer that does not exist', () => {
    for (const id of Object.keys(CREDIT_UNION_MEMBERSHIP)) {
      expect(isKnownIssuerId(id)).toBe(true);
    }
  });
});

describe('rules engine credit union configs', () => {
  it.each([...CREDIT_UNION_ISSUER_IDS])('has a rules-engine config for %s', (id) => {
    expect(CREDIT_UNION_SLUGS_IN_RULES_ENGINE).toContain(id);
  });

  it('names no issuer that does not exist', () => {
    // The assertion that catches `lake_michigan` against `lake_michigan_cu`.
    for (const slug of CREDIT_UNION_SLUGS_IN_RULES_ENGINE) {
      expect(isKnownIssuerId(slug)).toBe(true);
    }
  });
});

describe('optimizer cooldown table', () => {
  it.each([...KNOWN_ISSUER_IDS])('has a cooldown entry for %s', (id) => {
    // A missing entry is not an error at runtime — it falls to an unresearched
    // 30 days, which is presented beside Amex's researched 90.
    expect(ISSUER_COOLDOWN_IDS).toContain(id);
  });

  it('names no issuer that does not exist', () => {
    for (const id of ISSUER_COOLDOWN_IDS) {
      expect(isKnownIssuerId(id)).toBe(true);
    }
  });
});

describe('the issuer sets themselves', () => {
  it('does not put an issuer in both the bank and credit union list', () => {
    const banks = new Set<string>(BANK_ISSUER_IDS);
    for (const cu of CREDIT_UNION_ISSUER_IDS) {
      expect(banks.has(cu)).toBe(false);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(KNOWN_ISSUER_IDS).size).toBe(KNOWN_ISSUER_IDS.length);
  });
});
