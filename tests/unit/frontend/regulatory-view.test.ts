// ============================================================
// regulatory-view — mapping the regulatory intelligence endpoints
//
// The page held six alerts, five funds-flow rows and a table of state lending
// licences with numbers and expiry dates, and called nothing. These pin the
// mapping against real responses, and pin the two things that must not be
// invented: an impact score nobody assigned, and a licence.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toRegulatoryAlert,
  toRegulatoryAlerts,
  toFundsFlowRows,
  toLicensingEscalations,
  toImpactAssessment,
  toAlertStatus,
  toUrgency,
  impactBand,
  summariseAlerts,
  unresolvedFlows,
  humanise,
  type RegulatoryAlertRow,
} from '../../../src/frontend/lib/regulatory-view';

/** Captured from GET /api/regulatory/alerts. */
const REAL_ALERT = {
  id: 'seed-regalert-001',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  source: 'CFPB',
  ruleType: 'small_business_lending',
  title: 'Section 1071 small business lending data collection — compliance dates',
  summary: 'Covered financial institutions must collect and report data on applications.',
  impactScore: 88,
  affectedModules: ['underwriting', 'onboarding', 'reporting'],
  status: 'new',
  effectiveDate: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:19:14.681Z',
};

/** Captured from GET /api/funds-flow/classifications. */
const REAL_FLOW = {
  id: 'seed-flow-003',
  tenantId: 't',
  workflowName: 'Partner commission remittance',
  classification: 'pass_through',
  riskBasis: 'Commission received from the issuer is remitted onward to the referring partner.',
  regulatoryFramework: 'State money transmission licensing — under review',
  processorRole: 'iso',
  licensingStatus: 'not_required',
  moneyTransmissionAlert: false,
  status: 'under_review',
  createdAt: '2026-08-01T00:19:14.687Z',
  updatedAt: '2026-08-01T00:19:14.687Z',
};

describe('toRegulatoryAlert', () => {
  it('maps a real alert', () => {
    expect(toRegulatoryAlert(REAL_ALERT)).toMatchObject({
      id: 'seed-regalert-001',
      source: 'CFPB',
      ruleType: 'small_business_lending',
      impactScore: 88,
      affectedModules: ['underwriting', 'onboarding', 'reporting'],
      status: 'new',
    });
  });

  it('leaves the impact score null when the source published none', () => {
    // Not 0. This score drives which alerts get looked at first, and 0 sorts
    // an unassessed rule change to the bottom as though it were harmless.
    expect(toRegulatoryAlert({ ...REAL_ALERT, impactScore: null })?.impactScore).toBeNull();
  });

  it('survives affectedModules holding something other than a list', () => {
    // It is a Json column. Casting one and mapping over it is how the credit
    // roadmap came to answer 500 with "tradelines is not iterable".
    expect(
      toRegulatoryAlert({ ...REAL_ALERT, affectedModules: { count: 3 } })?.affectedModules,
    ).toEqual([]);
    expect(toRegulatoryAlert({ ...REAL_ALERT, affectedModules: null })?.affectedModules).toEqual([]);
  });

  it('drops an alert with no id', () => {
    expect(toRegulatoryAlert({ title: 'No id' })).toBeNull();
  });

  it('reads the list envelope the endpoint returns', () => {
    expect(toRegulatoryAlerts({ alerts: [REAL_ALERT], total: 1 })).toHaveLength(1);
    expect(toRegulatoryAlerts([REAL_ALERT])).toHaveLength(1);
    expect(toRegulatoryAlerts(null)).toEqual([]);
  });
});

describe('toAlertStatus', () => {
  it('accepts the statuses the API defines', () => {
    for (const s of ['new', 'under_review', 'resolved', 'dismissed']) {
      expect(toAlertStatus(s)).toBe(s);
    }
  });

  it('falls back to new, never to resolved', () => {
    // Defaulting an unreadable status to resolved would clear a rule change
    // nobody has looked at.
    expect(toAlertStatus('who_knows')).toBe('new');
    expect(toAlertStatus(undefined)).toBe('new');
  });
});

describe('toUrgency', () => {
  it('accepts the four levels', () => {
    for (const u of ['low', 'medium', 'high', 'critical']) {
      expect(toUrgency(u)).toBe(u);
    }
  });

  it('falls back to low for an unrecognised value', () => {
    expect(toUrgency('extreme')).toBe('low');
  });
});

describe('impactBand', () => {
  it('bands a score', () => {
    expect(impactBand(88)).toBe('critical');
    expect(impactBand(64)).toBe('high');
    expect(impactBand(45)).toBe('medium');
    expect(impactBand(10)).toBe('low');
  });

  it('has no band without a score', () => {
    // Rendering an unscored alert as "low" states an assessment nobody made.
    expect(impactBand(null)).toBeNull();
  });
});

describe('toFundsFlowRows', () => {
  it('maps a real classification', () => {
    expect(toFundsFlowRows({ classifications: [REAL_FLOW] })[0]).toMatchObject({
      id: 'seed-flow-003',
      workflowName: 'Partner commission remittance',
      classification: 'pass_through',
      processorRole: 'iso',
      licensingStatus: 'not_required',
      moneyTransmissionAlert: false,
      status: 'under_review',
    });
  });

  it('carries no volume, because no column holds one', () => {
    // The page showed "$2.4M/day" against each flow. Nothing records volume.
    const row = toFundsFlowRows({ classifications: [REAL_FLOW] })[0] as unknown as Record<
      string,
      unknown
    >;
    expect(row['volume']).toBeUndefined();
  });

  it('leaves an absent legal opinion reference null', () => {
    expect(toFundsFlowRows({ classifications: [REAL_FLOW] })[0].legalOpinionRef).toBeNull();
  });

  it('returns an empty list for junk', () => {
    expect(toFundsFlowRows(undefined)).toEqual([]);
    expect(toFundsFlowRows({ classifications: 'nope' })).toEqual([]);
  });
});

describe('toLicensingEscalations', () => {
  const REAL_ESCALATION = {
    workflowId: 'seed-flow-003',
    workflowName: 'Partner commission remittance',
    classification: 'pass_through',
    licensingStatus: 'review_required',
    affectedStates: ['CA', 'NY'],
    urgency: 'high',
    escalationReason: 'Funds belonging to a third party are received and remitted onward.',
    counselReferralRequired: true,
  };

  it('maps a real escalation', () => {
    expect(toLicensingEscalations({ escalations: [REAL_ESCALATION] })[0]).toMatchObject({
      workflowId: 'seed-flow-003',
      licensingStatus: 'review_required',
      affectedStates: ['CA', 'NY'],
      urgency: 'high',
      counselReferralRequired: true,
    });
  });

  it('treats a missing counsel flag as not required rather than required', () => {
    const row = toLicensingEscalations({
      escalations: [{ ...REAL_ESCALATION, counselReferralRequired: undefined }],
    })[0];
    expect(row.counselReferralRequired).toBe(false);
  });

  it('describes workflows to review, not licences held', () => {
    // The distinction the page got wrong. An escalation says "this workflow
    // needs a licensing question answered"; it does not say a licence exists,
    // and nothing in the system records one.
    const row = toLicensingEscalations({ escalations: [REAL_ESCALATION] })[0] as unknown as Record<
      string,
      unknown
    >;
    expect(row['licenseNumber']).toBeUndefined();
    expect(row['expiresAt']).toBeUndefined();
  });

  it('returns an empty list for junk', () => {
    expect(toLicensingEscalations(null)).toEqual([]);
  });
});

describe('toImpactAssessment', () => {
  const REAL_IMPACT = {
    ruleId: 'seed-regalert-001',
    impactScore: 88,
    affectedModules: ['underwriting', 'onboarding', 'reporting'],
    rationale: 'Source: CFPB. Rule type: small business lending. Impact score 88/100 (critical).',
    urgency: 'critical',
    recommendedActions: ['Review impact on: underwriting, onboarding, reporting.'],
  };

  it('maps a real assessment', () => {
    expect(toImpactAssessment(REAL_IMPACT)).toMatchObject({
      ruleId: 'seed-regalert-001',
      impactScore: 88,
      urgency: 'critical',
    });
    expect(toImpactAssessment(REAL_IMPACT)?.recommendedActions).toHaveLength(1);
  });

  it('returns null when there is no rule to assess', () => {
    expect(toImpactAssessment({ impactScore: 50 })).toBeNull();
  });
});

describe('summariseAlerts', () => {
  const alert = (over: Partial<RegulatoryAlertRow>): RegulatoryAlertRow => ({
    ...(toRegulatoryAlert(REAL_ALERT) as RegulatoryAlertRow),
    ...over,
  });

  it('counts what still needs a first look', () => {
    const s = summariseAlerts([
      alert({ id: 'a', status: 'new' }),
      alert({ id: 'b', status: 'under_review' }),
      alert({ id: 'c', status: 'resolved' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.needingReview).toBe(1);
  });

  it('takes the highest score among open alerts only', () => {
    const s = summariseAlerts([
      alert({ id: 'a', status: 'new', impactScore: 40 }),
      // Already dealt with; it should not drive the headline.
      alert({ id: 'b', status: 'resolved', impactScore: 99 }),
    ]);
    expect(s.highestOpenScore).toBe(40);
  });

  it('says how many open alerts carry no score', () => {
    // So "highest open impact: 40" is not read as "nothing is worse than 40".
    const s = summariseAlerts([
      alert({ id: 'a', status: 'new', impactScore: 40 }),
      alert({ id: 'b', status: 'new', impactScore: null }),
    ]);
    expect(s.highestOpenScore).toBe(40);
    expect(s.openWithoutScore).toBe(1);
  });

  it('has no highest score when nothing open is scored', () => {
    const s = summariseAlerts([alert({ id: 'a', status: 'new', impactScore: null })]);
    expect(s.highestOpenScore).toBeNull();
    expect(s.openWithoutScore).toBe(1);
  });

  it('handles an empty board', () => {
    expect(summariseAlerts([])).toEqual({
      total: 0,
      needingReview: 0,
      highestOpenScore: null,
      openWithoutScore: 0,
    });
  });
});

describe('unresolvedFlows', () => {
  it('picks out flows still under review or flagged for money transmission', () => {
    const rows = toFundsFlowRows({
      classifications: [
        { ...REAL_FLOW, id: '1', status: 'active', moneyTransmissionAlert: false },
        { ...REAL_FLOW, id: '2', status: 'under_review', moneyTransmissionAlert: false },
        { ...REAL_FLOW, id: '3', status: 'active', moneyTransmissionAlert: true },
      ],
    });
    expect(unresolvedFlows(rows).map((r) => r.id)).toEqual(['2', '3']);
  });
});

describe('humanise', () => {
  it('turns API keys into words', () => {
    expect(humanise('pass_through')).toBe('Pass through');
    expect(humanise('small_business_lending')).toBe('Small business lending');
    expect(humanise('')).toBe('');
  });
});
