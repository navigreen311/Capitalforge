// ============================================================
// An unrecognised state is not a state without a law
//
// `hasSpecificStateLaw(stateCode)` returned
// `getStateLawProfile(stateCode)?.hasSpecificStateLaw ?? false`, so a state
// this registry has never heard of answered **"this state has no specific
// commercial financing law"** — a legal claim about a jurisdiction nobody had
// looked up, made in the unsafe direction. A caller writing
// `if (hasSpecificStateLaw(code))` skips the state-specific path for a state
// that may well have one.
//
// The replacement is a string union rather than `boolean | null`, because
// `boolean | null` still reads as false in a condition, which is the exact
// misuse being removed.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  stateLawStatus,
  isStateRecognised,
  getRequiredDisclosures,
  getComplianceSteps,
  getStateLawProfile,
} from '../../../src/backend/services/state-law-mapper';
import { ComplianceService } from '../../../src/backend/services/compliance.service';

describe('the three states of state law', () => {
  it('names a state with its own law', () => {
    expect(stateLawStatus('CA')).toBe('specific_law');
  });

  it('names a recognised state with only the federal baseline', () => {
    // Whichever states are registered without a specific law — asserted
    // through the registry rather than by naming one, so adding a law to that
    // state does not fail this test for the wrong reason.
    const registered = ['CA', 'NY', 'UT', 'VA', 'TX', 'FL', 'GA', 'MO', 'CT'].filter((c) =>
      getStateLawProfile(c),
    );
    const baselineOnly = registered.filter((c) => stateLawStatus(c) === 'federal_baseline_only');
    for (const code of baselineOnly) {
      expect(getStateLawProfile(code)!.hasSpecificStateLaw).toBe(false);
    }
  });

  it('refuses to claim anything about a state it does not know', () => {
    // The defect. This used to be indistinguishable from
    // 'federal_baseline_only'.
    expect(stateLawStatus('ZZ')).toBe('state_not_recognised');
    expect(stateLawStatus('')).toBe('state_not_recognised');
  });

  it('cannot be collapsed into a boolean by accident', () => {
    // Why a union and not `boolean | null`: null reads as false in a
    // condition, so the misuse survives the fix. Every value here is truthy,
    // which makes `if (stateLawStatus(code))` visibly wrong rather than
    // quietly wrong.
    expect(Boolean(stateLawStatus('ZZ'))).toBe(true);
    expect(Boolean(stateLawStatus('CA'))).toBe(true);
  });
});

describe('isStateRecognised', () => {
  it('separates "no law" from "no entry"', () => {
    expect(isStateRecognised('CA')).toBe(true);
    expect(isStateRecognised('ZZ')).toBe(false);
  });

  it('accepts the casing and padding a caller actually passes', () => {
    expect(isStateRecognised('ca')).toBe(true);
    expect(isStateRecognised(' CA ')).toBe(true);
  });
});

describe('the baseline fallback stays, and says what it is', () => {
  it('still returns federal requirements for an unknown state', () => {
    // Correct as far as it goes: these apply everywhere. The fix is not to
    // withhold them — it is to stop them reading as a complete packet.
    expect(getRequiredDisclosures('ZZ').length).toBeGreaterThan(0);
    expect(getComplianceSteps('ZZ').length).toBeGreaterThan(0);
  });

  it('tells the caller the packet is baseline-only, with a reason', () => {
    const svc = new ComplianceService();
    const unknown = svc.getStateRequirements('ZZ');

    expect(unknown.status).toBe('state_not_recognised');
    expect(unknown.stateRecognised).toBe(false);
    expect(unknown.profile).toBeNull();
    // The lists are still populated, which is exactly why the caveat has to
    // be there — a caller reading only `disclosures` would take it for
    // complete.
    expect(unknown.disclosures.length).toBeGreaterThan(0);
    expect(unknown.caveat).toMatch(/unknown, not absent/i);
  });

  it('carries no caveat for a state it knows', () => {
    const svc = new ComplianceService();
    const known = svc.getStateRequirements('CA');

    expect(known.stateRecognised).toBe(true);
    expect(known.status).toBe('specific_law');
    expect(known).not.toHaveProperty('caveat');
  });
});
