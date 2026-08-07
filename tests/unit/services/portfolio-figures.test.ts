// ============================================================
// One portfolio, one answer
//
// `/api/platform/portfolio` published `delinquencyRate: null` with a paragraph
// explaining why the figure cannot honestly be derived. The
// `portfolio-performance` report published **2.1**. Same tenant, same
// portfolio, two answers — and the one an advisor exports and sends was the
// invented one.
//
// The reasons live in one place now. These pin the two properties that keep
// them from drifting again: the narrow figure is never named as a delinquency
// rate, and "nothing observed" is never reported as zero.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  UNMEASURABLE,
  summariseRepaymentMissedPayments,
} from '../../../src/backend/services/portfolio-figures';

describe('missed payments among clients on a repayment plan', () => {
  it('counts what it says it counts', () => {
    const result = summariseRepaymentMissedPayments([
      { status: 'missed' },
      { status: 'paid' },
      { status: 'paid' },
      { status: 'upcoming' },
    ]);
    expect(result.missed).toBe(1);
    expect(result.observed).toBe(4);
    expect(result.rate).toBe(25);
  });

  it('reports null rather than zero when nothing was observed', () => {
    // "No missed payments among the plans we looked at" and "we looked at no
    // plans" are different statements. A zero says the first while meaning the
    // second — which is the whole reason the portfolio rate is null.
    const result = summariseRepaymentMissedPayments([]);
    expect(result.rate).toBeNull();
    expect(result.observed).toBe(0);
    expect(result.missed).toBe(0);
  });

  it('carries its denominator so a rate over three schedules is legible', () => {
    // Every other figure on these surfaces carries its sample size for the
    // same reason: a rate over three observations is not the statement it
    // looks like.
    const result = summariseRepaymentMissedPayments([{ status: 'missed' }, { status: 'paid' }]);
    expect(result.observed).toBe(2);
    expect(result.rate).toBe(50);
  });

  it('does not call itself a delinquency rate', () => {
    // The objection to this figure was never that it is false — it is true.
    // It was that putting it where a portfolio delinquency rate goes makes it
    // read as one whatever the label underneath says.
    const result = summariseRepaymentMissedPayments([{ status: 'missed' }]);
    expect(Object.keys(result)).toEqual(['missed', 'observed', 'rate']);
    expect(JSON.stringify(result).toLowerCase()).not.toContain('delinquen');
  });
});

describe('the reasons a figure is absent', () => {
  it('states why delinquency is not measured, including where to read more', () => {
    expect(UNMEASURABLE.delinquencyRate).toMatch(/repayment plan/i);
    expect(UNMEASURABLE.delinquencyRate).toMatch(/gaps\.md section 2b/i);
  });

  it('gives every absent figure a reason rather than a null', () => {
    // A blank on a dashboard and a blank on an exported report get read as
    // zero by different people, and neither of them is going to go and read
    // the gaps document.
    for (const [key, reason] of Object.entries(UNMEASURABLE)) {
      expect(reason.length, `${key} has no reason`).toBeGreaterThan(40);
      expect(reason, `${key} does not say it is unmeasured`).toMatch(/not measured/i);
    }
  });
});
