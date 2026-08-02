// ============================================================
// compliance-overview-view — no score without checks
//
// /compliance stated a regulated firm's position out of literals: ten
// findings against businesses that do not exist, a six-component score
// breakdown, and a recommended next filing. The endpoint behind the ring
// returned 100 for a tenant with no checks on record.
//
// That default is the case these pin. A compliance score is a claim about
// exposure, and 100 out of 100 from an empty table is the strongest version
// of it — a clean bill of health derived from never having looked.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toComplianceOverview,
  riskShare,
  EMPTY_OVERVIEW,
} from '../../../src/frontend/lib/compliance-overview-view';

/** Shaped as GET /api/compliance/overview returns it. */
const RESPONSE = {
  success: true,
  data: {
    score: 72,
    total: 4,
    passed: 3,
    failed: 1,
    critical: 1,
    riskDistribution: { critical: 1, high: 0, medium: 1, low: 2 },
    checks: [
      {
        id: 'cc-1',
        checkType: 'udap',
        businessName: 'Apex Digital Solutions LLC',
        riskLevel: 'critical',
        passed: false,
        findings: 'Marketing claim not substantiated.',
        checkedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'cc-2',
        checkType: 'kyb',
        businessName: 'Apex Digital Solutions LLC',
        riskLevel: 'low',
        passed: true,
        findings: '',
        checkedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
  },
};

describe('toComplianceOverview', () => {
  it('maps the checks and the totals', () => {
    const view = toComplianceOverview(RESPONSE);
    expect(view.score).toBe(72);
    expect(view.total).toBe(4);
    expect(view.checks).toHaveLength(2);
    expect(view.checks[0]?.riskLevel).toBe('critical');
    expect(view.loaded).toBe(true);
  });

  it('keeps a null score null', () => {
    // The endpoint returns null when nothing has been checked. Defaulting it
    // to 100 here would put the fabrication back one layer down.
    const view = toComplianceOverview({
      data: { score: null, total: 0, checks: [], riskDistribution: {} },
    });
    expect(view.score).toBeNull();
    expect(view.total).toBe(0);
    expect(view.loaded).toBe(true);
  });

  it('does not invent a score when the field is missing', () => {
    const view = toComplianceOverview({ data: { checks: [] } });
    expect(view.score).toBeNull();
  });

  it('drops a check with no risk level rather than treating it as passing', () => {
    // Guessing a level would be inventing the assessment. An unlevelled check
    // is not a low-risk check.
    const view = toComplianceOverview({
      data: {
        checks: [
          { id: 'no-level', checkType: 'udap', businessName: 'X' },
          { id: 'ok', checkType: 'kyb', businessName: 'Y', riskLevel: 'high', passed: false },
        ],
      },
    });
    expect(view.checks).toHaveLength(1);
    expect(view.checks[0]?.id).toBe('ok');
  });

  it('is not loaded when nothing has been read', () => {
    // Distinguishes "no checks on record" from "no answer yet", which decides
    // whether the page prints a score at all.
    expect(toComplianceOverview(undefined)).toEqual(EMPTY_OVERVIEW);
    expect(toComplianceOverview({})).toEqual(EMPTY_OVERVIEW);
    expect(toComplianceOverview(null).loaded).toBe(false);
  });

  it('is loaded, and empty, for a tenant with no checks', () => {
    const view = toComplianceOverview({ data: { checks: [], score: null } });
    expect(view.loaded).toBe(true);
    expect(view.checks).toEqual([]);
  });
});

describe('riskShare', () => {
  it('is the percentage of the total', () => {
    expect(riskShare(1, 4)).toBe(25);
  });

  it('is null when nothing has been assessed', () => {
    // 0% states that no check is critical, which is a finding. Nothing having
    // been assessed is not.
    expect(riskShare(0, 0)).toBeNull();
  });
});
