// ============================================================
// comm-compliance-view — scans, scripts and QA scores
//
// The page scored four named advisors on their compliance and script
// adherence, with none of it recorded anywhere. These pin the mapping
// against real responses, and pin two judgments: an unreadable risk level
// resolves toward review, and the scanner's invented enforcement precedents
// do not reach the UI.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toScanResult,
  toScriptRow,
  toScriptRows,
  toQaScoreRows,
  toRiskLevel,
  summariseScripts,
  summariseQaScores,
  byScoredAtDesc,
  scriptCategories,
  humanise,
} from '../../../src/frontend/lib/comm-compliance-view';

/** Captured from POST /api/comm-compliance/scan. */
const REAL_SCAN = {
  scanId: '73439a99-3ae7-4422-bb01-d5b9cff53aa1',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  advisorId: '35810869-77f9-47fd-8a90-916807f0d325',
  channel: 'email',
  riskScore: 95,
  riskLevel: 'critical',
  violations: [
    {
      claimId: 'banned-001',
      category: 'guaranteed_approval',
      label: 'Guaranteed approval claim',
      evidence: 'We offer guaranteed approval for every business',
      position: 9,
      severityWeight: 10,
      legalCitation: 'FTC Act § 5; Dodd-Frank § 1031 (UDAAP)',
      compliantAlternative: 'Many of our clients are approved — results depend on your profile.',
      enforcementExample:
        'FTC v. Pinnacle Business Capital (2021): $5M penalty for guaranteed approval claims.',
    },
  ],
};

/** Captured from GET /api/scripts. */
const REAL_SCRIPT = {
  id: 'seed-script-004',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  name: 'Fee disclosure',
  category: 'fees',
  currentVersion: {
    version: '1.0.0',
    content: 'Our fee is charged whether or not you are approved.',
    isActive: true,
    approvedBy: null,
    approvedAt: null,
  },
  createdAt: '2026-08-01T02:00:00.000Z',
  updatedAt: '2026-08-01T02:00:00.000Z',
};

/** Captured from GET /api/advisors/:id/qa-scores. */
const REAL_QA = {
  id: 'seed-qa-003',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  advisorId: '284d30ba-6d51-4272-a582-022cab5512ca',
  callRecordId: null,
  overallScore: 91,
  complianceScore: 94,
  scriptAdherence: 88,
  consentCapture: 95,
  riskClaimAvoidance: 89,
  feedback: 'Fee disclosure given unprompted and confirmed in writing.',
  scoredAt: '2026-07-21T00:00:00.000Z',
};

describe('toScanResult', () => {
  it('maps a real scan', () => {
    expect(toScanResult(REAL_SCAN)).toMatchObject({
      scanId: '73439a99-3ae7-4422-bb01-d5b9cff53aa1',
      channel: 'email',
      riskScore: 95,
      riskLevel: 'critical',
    });
    expect(toScanResult(REAL_SCAN)?.violations).toHaveLength(1);
  });

  it('keeps the statute and the compliant alternative', () => {
    const v = toScanResult(REAL_SCAN)?.violations[0];
    expect(v?.legalCitation).toBe('FTC Act § 5; Dodd-Frank § 1031 (UDAAP)');
    expect(v?.compliantAlternative).toContain('Many of our clients');
  });

  it('does not carry the enforcement example through', () => {
    // The scanner's reference table cites enforcement actions, one of them
    // against "Pinnacle Business Capital" — which appears elsewhere in this
    // codebase as an explicitly stubbed vendor. Invented precedent must not
    // be the reason an advisor is told to change their wording.
    const v = toScanResult(REAL_SCAN)?.violations[0] as unknown as Record<string, unknown>;
    expect(v['enforcementExample']).toBeUndefined();
  });

  it('drops a violation with no label rather than rendering a blank finding', () => {
    const r = toScanResult({ ...REAL_SCAN, violations: [{ claimId: 'x' }] });
    expect(r?.violations).toEqual([]);
  });

  it('returns null when there is no scan', () => {
    expect(toScanResult(null)).toBeNull();
    expect(toScanResult({ riskScore: 10 })).toBeNull();
  });
});

describe('toRiskLevel', () => {
  it('accepts the levels the scanner reports', () => {
    for (const l of ['low', 'medium', 'high', 'critical']) {
      expect(toRiskLevel(l)).toBe(l);
    }
  });

  it('resolves an unreadable level toward review, not away from it', () => {
    // On a scan of what an advisor is about to say to a client, the safe
    // direction to be wrong is toward someone looking at it.
    expect(toRiskLevel('who_knows')).toBe('critical');
    expect(toRiskLevel(undefined)).toBe('critical');
  });
});

describe('toScriptRow', () => {
  it('maps a real script, flattening currentVersion', () => {
    expect(toScriptRow(REAL_SCRIPT)).toMatchObject({
      id: 'seed-script-004',
      name: 'Fee disclosure',
      category: 'fees',
      version: '1.0.0',
      isActive: true,
      approvedBy: null,
    });
  });

  it('leaves approvedBy null rather than naming a role', () => {
    // The page listed approvers such as "Sarah Chen (QA Lead)" against
    // scripts nobody had approved.
    expect(toScriptRow(REAL_SCRIPT)?.approvedBy).toBeNull();
  });

  it('carries the approver when one is recorded', () => {
    const approved = toScriptRow({
      ...REAL_SCRIPT,
      currentVersion: { ...REAL_SCRIPT.currentVersion, approvedBy: 'user-1', approvedAt: 'x' },
    });
    expect(approved?.approvedBy).toBe('user-1');
  });

  it('survives a missing currentVersion', () => {
    const row = toScriptRow({ id: 'a', name: 'No version' });
    expect(row).toMatchObject({ version: '—', content: '', isActive: false });
  });

  it('drops a script with no id', () => {
    expect(toScriptRow({ name: 'No id' })).toBeNull();
  });

  it('reads the list envelope', () => {
    expect(toScriptRows({ data: [REAL_SCRIPT] })).toHaveLength(1);
    expect(toScriptRows(null)).toEqual([]);
  });
});

describe('toQaScoreRows', () => {
  it('maps a real score', () => {
    expect(toQaScoreRows([REAL_QA])[0]).toMatchObject({
      id: 'seed-qa-003',
      overallScore: 91,
      complianceScore: 94,
      consentCapture: 95,
      feedback: 'Fee disclosure given unprompted and confirmed in writing.',
    });
  });

  it('drops a row with no overall score rather than scoring it zero', () => {
    expect(toQaScoreRows([{ ...REAL_QA, overallScore: null }])).toEqual([]);
  });

  it('leaves an unlinked call null', () => {
    expect(toQaScoreRows([REAL_QA])[0].callRecordId).toBeNull();
  });

  it('carries no trend, because nothing records one', () => {
    // The scorecard showed an up/down/flat arrow per advisor.
    const row = toQaScoreRows([REAL_QA])[0] as unknown as Record<string, unknown>;
    expect(row['trend']).toBeUndefined();
  });
});

describe('summariseScripts', () => {
  it('counts scripts in use with no recorded approver', () => {
    const rows = toScriptRows([
      REAL_SCRIPT,
      {
        ...REAL_SCRIPT,
        id: 'b',
        currentVersion: { ...REAL_SCRIPT.currentVersion, approvedBy: 'user-1' },
      },
    ]);
    expect(summariseScripts(rows)).toEqual({ total: 2, unapproved: 1 });
  });

  it('handles an empty library', () => {
    expect(summariseScripts([])).toEqual({ total: 0, unapproved: 0 });
  });
});

describe('summariseQaScores', () => {
  it('averages the calls that were scored', () => {
    const rows = toQaScoreRows([
      REAL_QA,
      { ...REAL_QA, id: 'b', overallScore: 81, scoredAt: '2026-06-01T00:00:00.000Z' },
    ]);
    expect(summariseQaScores(rows)).toMatchObject({ scored: 2, averageOverall: 86 });
  });

  it('reports the most recent scoring date', () => {
    const rows = toQaScoreRows([
      { ...REAL_QA, id: 'old', scoredAt: '2026-01-01T00:00:00.000Z' },
      { ...REAL_QA, id: 'new', scoredAt: '2026-07-21T00:00:00.000Z' },
    ]);
    expect(summariseQaScores(rows).lastScoredAt).toBe('2026-07-21T00:00:00.000Z');
  });

  it('has no average when nothing has been scored', () => {
    expect(summariseQaScores([])).toEqual({
      scored: 0,
      averageOverall: null,
      lastScoredAt: null,
    });
  });
});

describe('byScoredAtDesc', () => {
  it('puts the most recent first', () => {
    const rows = toQaScoreRows([
      { ...REAL_QA, id: 'old', scoredAt: '2026-01-01T00:00:00.000Z' },
      { ...REAL_QA, id: 'new', scoredAt: '2026-07-21T00:00:00.000Z' },
    ]);
    expect(byScoredAtDesc(rows).map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('sorts undated scores last', () => {
    const rows = toQaScoreRows([
      { ...REAL_QA, id: 'undated', scoredAt: null },
      { ...REAL_QA, id: 'dated' },
    ]);
    expect(byScoredAtDesc(rows).map((r) => r.id)).toEqual(['dated', 'undated']);
  });
});

describe('scriptCategories', () => {
  it('lists the categories present', () => {
    const rows = toScriptRows([
      REAL_SCRIPT,
      { ...REAL_SCRIPT, id: 'b', category: 'discovery' },
      { ...REAL_SCRIPT, id: 'c', category: 'fees' },
    ]);
    expect(scriptCategories(rows)).toEqual(['discovery', 'fees']);
  });
});

describe('humanise', () => {
  it('turns API keys into words', () => {
    expect(humanise('guaranteed_approval')).toBe('Guaranteed approval');
  });
});
