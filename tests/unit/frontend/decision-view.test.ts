// ============================================================
// decision-view — mapping the AI decision governance endpoints
//
// The page held eight decisions as literals, each tied to a named client,
// carrying a snapshot of the inputs behind it, and with an override trail
// naming who approved each reversal. These pin the mapping against a real
// response and pin the three things the record does not hold: the client,
// the inputs, and who authorised an override.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toDecisionRow,
  toDecisionRows,
  toModuleMetrics,
  toVersionRows,
  summariseOutput,
  summariseDecisions,
  decisionFacets,
  confidencePercent,
  humanise,
  type DecisionRow,
} from '../../../src/frontend/lib/decision-view';

/** Captured from GET /api/ai-governance/decisions. */
const REAL_DECISION = {
  id: 'seed-aidec-006',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  moduleSource: 'contract_analysis',
  decisionType: 'extraction',
  inputHash: '5b9207fe3a1d8c04',
  output: { redFlags: 1, clausesFound: 12 },
  confidence: 0.58,
  overriddenBy: null,
  overrideReason: null,
  modelVersion: 'contracts-v2.0',
  promptVersion: 'p-2025-11',
  latencyMs: 1740,
  createdAt: '2026-08-01T01:56:40.833Z',
  flags: {
    belowConfidenceThreshold: true,
    possibleHallucination: false,
    wasOverridden: false,
  },
};

const row = (over: Partial<DecisionRow>): DecisionRow => ({
  ...(toDecisionRow(REAL_DECISION) as DecisionRow),
  ...over,
});

describe('toDecisionRow', () => {
  it('maps a real decision', () => {
    expect(toDecisionRow(REAL_DECISION)).toMatchObject({
      id: 'seed-aidec-006',
      moduleSource: 'contract_analysis',
      decisionType: 'extraction',
      inputHash: '5b9207fe3a1d8c04',
      confidence: 0.58,
      modelVersion: 'contracts-v2.0',
      latencyMs: 1740,
    });
  });

  it('carries no client, because a decision is not linked to one', () => {
    // The page put a business name on every row. AiDecisionLog has no
    // businessId at all.
    const mapped = toDecisionRow(REAL_DECISION) as unknown as Record<string, unknown>;
    expect(mapped['businessId']).toBeUndefined();
    expect(mapped['businessName']).toBeUndefined();
  });

  it('carries the input hash and no inputs', () => {
    // The inputs are reduced to a digest on the way in, so that a decision
    // can be recognised again without keeping the applicant data behind it.
    // The page showed FICO 742 and $2.4M revenue per decision.
    const mapped = toDecisionRow(REAL_DECISION) as unknown as Record<string, unknown>;
    expect(mapped['inputHash']).toBe('5b9207fe3a1d8c04');
    expect(mapped['inputSnapshot']).toBeUndefined();
    expect(mapped['inputPayload']).toBeUndefined();
  });

  it('carries who overrode a decision, and nobody who approved that', () => {
    const overridden = toDecisionRow({
      ...REAL_DECISION,
      overriddenBy: 'user-123',
      overrideReason: 'Compensating factors documented.',
      flags: { ...REAL_DECISION.flags, wasOverridden: true },
    });
    expect(overridden?.overriddenBy).toBe('user-123');
    expect(overridden?.overrideReason).toBe('Compensating factors documented.');

    const mapped = overridden as unknown as Record<string, unknown>;
    // "approvedBy: Diana Walsh (Chief Credit Officer)" had no column behind it.
    expect(mapped['approvedBy']).toBeUndefined();
    expect(mapped['approvedAt']).toBeUndefined();
  });

  it('leaves confidence null when the module reported none', () => {
    // Not 0, which reads as a decision the model had no faith in.
    expect(toDecisionRow({ ...REAL_DECISION, confidence: null })?.confidence).toBeNull();
  });

  it('treats a missing override flag as not overridden', () => {
    const mapped = toDecisionRow({ ...REAL_DECISION, flags: {} });
    expect(mapped?.flags.wasOverridden).toBe(false);
    expect(mapped?.flags.belowConfidenceThreshold).toBe(false);
  });

  it('survives output being something other than an object', () => {
    expect(toDecisionRow({ ...REAL_DECISION, output: null })?.output).toEqual({});
    expect(toDecisionRow({ ...REAL_DECISION, output: 'nope' })?.output).toEqual({});
  });

  it('drops a decision with no id', () => {
    expect(toDecisionRow({ moduleSource: 'udap_scorer' })).toBeNull();
  });

  it('reads the list envelope the endpoint returns', () => {
    expect(toDecisionRows({ decisions: [REAL_DECISION], total: 1 })).toHaveLength(1);
    expect(toDecisionRows([REAL_DECISION])).toHaveLength(1);
    expect(toDecisionRows(null)).toEqual([]);
  });
});

describe('toModuleMetrics', () => {
  const REAL_METRIC = {
    tenantId: 't',
    moduleSource: 'suitability_engine',
    period: { start: '2026-07-02T01:56:49.075Z', end: '2026-08-01T01:56:49.076Z' },
    totalDecisions: 1,
    overrideRate: 0,
    averageConfidence: 94,
    belowThresholdRate: 0,
    possibleHallucinationRate: 0,
    averageLatencyMs: 412,
    modelVersionDistribution: { 'suitability-v2.3': 1 },
    promptVersionDistribution: { 'p-2026-01': 1 },
  };

  it('maps a real metrics row', () => {
    expect(toModuleMetrics([REAL_METRIC])[0]).toMatchObject({
      moduleSource: 'suitability_engine',
      totalDecisions: 1,
      overrideRate: 0,
      averageConfidence: 94,
      averageLatencyMs: 412,
    });
  });

  it('has no rates for a module that decided nothing', () => {
    // 0% override on zero decisions is not a clean record; there was nothing
    // to override.
    const m = toModuleMetrics([{ ...REAL_METRIC, totalDecisions: 0 }])[0];
    expect(m.overrideRate).toBeNull();
    expect(m.averageConfidence).toBeNull();
    expect(m.averageLatencyMs).toBeNull();
  });

  it('drops a row that names no module', () => {
    expect(toModuleMetrics([{ totalDecisions: 5 }])).toEqual([]);
  });

  it('returns an empty list for junk', () => {
    expect(toModuleMetrics(null)).toEqual([]);
  });
});

describe('toVersionRows', () => {
  it('maps a real version row', () => {
    expect(
      toVersionRows([
        {
          modelVersion: 'contracts-v2.0',
          promptVersion: 'p-2025-11',
          firstSeen: '2026-08-01T01:56:40.833Z',
          lastSeen: '2026-08-01T01:56:40.833Z',
          count: 1,
        },
      ])[0],
    ).toMatchObject({ modelVersion: 'contracts-v2.0', promptVersion: 'p-2025-11', count: 1 });
  });

  it('drops a row identifying neither version', () => {
    expect(toVersionRows([{ count: 9 }])).toEqual([]);
  });
});

describe('summariseOutput', () => {
  it('reads the shapes each module actually writes', () => {
    expect(summariseOutput({ score: 78, band: 'good' })).toBe('Score 78 — good');
    expect(summariseOutput({ score: 42 })).toBe('Score 42');
    expect(summariseOutput({ recommended: 'Chase Ink Business Cash' })).toBe(
      'Recommended: Chase Ink Business Cash',
    );
    expect(summariseOutput({ classification: 'compliant' })).toBe('Classified: compliant');
    expect(summariseOutput({ action: 'reconsideration_letter' })).toBe(
      'Action: reconsideration_letter',
    );
  });

  it('names the fields rather than inventing a sentence', () => {
    // output is a Json column and its shape varies by module. A summary that
    // reads well but says something the module did not is worse than a list
    // of what is there.
    expect(summariseOutput({ redFlags: 1, clausesFound: 12 })).toBe('redFlags, clausesFound');
  });

  it('says so when there is no output', () => {
    expect(summariseOutput({})).toBe('No output recorded.');
  });
});

describe('summariseDecisions', () => {
  it('counts overrides, low confidence and suspected hallucinations', () => {
    const s = summariseDecisions([
      row({ id: 'a', flags: { belowConfidenceThreshold: true, possibleHallucination: false, wasOverridden: false } }),
      row({ id: 'b', flags: { belowConfidenceThreshold: false, possibleHallucination: true, wasOverridden: false } }),
      row({ id: 'c', overriddenBy: 'user-1', flags: { belowConfidenceThreshold: false, possibleHallucination: false, wasOverridden: true } }),
    ]);
    expect(s).toMatchObject({
      total: 3,
      belowThreshold: 1,
      possibleHallucination: 1,
      overridden: 1,
    });
  });

  it('averages confidence over decisions that reported one', () => {
    const s = summariseDecisions([row({ id: 'a', confidence: 0.9 }), row({ id: 'b', confidence: 0.7 })]);
    expect(s.averageConfidence).toBe(80);
    expect(s.withoutConfidence).toBe(0);
  });

  it('says how many decisions carried no confidence', () => {
    // So an average over half the rows is not read as an average over all.
    const s = summariseDecisions([row({ id: 'a', confidence: 0.9 }), row({ id: 'b', confidence: null })]);
    expect(s.averageConfidence).toBe(90);
    expect(s.withoutConfidence).toBe(1);
  });

  it('has no average when nothing reported confidence', () => {
    const s = summariseDecisions([row({ id: 'a', confidence: null })]);
    expect(s.averageConfidence).toBeNull();
  });

  it('handles an empty log', () => {
    expect(summariseDecisions([])).toEqual({
      total: 0,
      overridden: 0,
      belowThreshold: 0,
      possibleHallucination: 0,
      averageConfidence: null,
      withoutConfidence: 0,
    });
  });
});

describe('decisionFacets', () => {
  it('lists the modules and types present', () => {
    const f = decisionFacets([
      row({ id: 'a', moduleSource: 'udap_scorer', decisionType: 'classification' }),
      row({ id: 'b', moduleSource: 'suitability_engine', decisionType: 'risk_score' }),
      row({ id: 'c', moduleSource: 'udap_scorer', decisionType: 'classification' }),
    ]);
    expect(f.modules).toEqual(['suitability_engine', 'udap_scorer']);
    expect(f.types).toEqual(['classification', 'risk_score']);
  });
});

describe('confidencePercent', () => {
  it('converts the 0-1 confidence a decision carries', () => {
    expect(confidencePercent(0.58)).toBe(58);
    expect(confidencePercent(1)).toBe(100);
  });

  it('stays null when there is no confidence', () => {
    expect(confidencePercent(null)).toBeNull();
  });
});

describe('humanise', () => {
  it('turns API keys into words', () => {
    expect(humanise('suitability_engine')).toBe('Suitability engine');
    expect(humanise('risk_score')).toBe('Risk score');
  });
});
