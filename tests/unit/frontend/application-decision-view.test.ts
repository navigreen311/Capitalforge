// ============================================================
// application-decision-view — the decision register
//
// The page held six decisions as literals, each with a named advisor, a list
// of factors behind it, and — on the declines — an adverse action notice
// with a status of 'sent' and a delivery date. These pin the mapping against
// real responses and pin the claim that must never be made up: that the
// notice a declined applicant is owed has gone out.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toDecisionRows,
  toRegisterIndex,
  summariseDecisions,
  declineGaps,
  needsAttention,
  type DecisionRow,
} from '../../../src/frontend/lib/application-decision-view';

/** Captured from GET /api/applications. */
const DECLINED = {
  id: 'seed-app-004',
  businessId: 'seed-biz-001',
  businessName: 'Apex Digital Solutions LLC',
  issuer: 'Bank of America',
  cardProduct: 'Business Advantage Unlimited',
  status: 'declined',
  requestedLimit: 20000,
  advisorName: 'Marcus Whitfield',
  decidedAt: '2026-01-25T00:00:00.000Z',
  declineReason: 'Too many recent inquiries',
};

const APPROVED = {
  ...DECLINED,
  id: 'seed-app-001',
  status: 'approved',
  approvedLimit: 45000,
  declineReason: null,
};

const SUBMITTED = { ...DECLINED, id: 'seed-app-003', status: 'submitted', declineReason: null };

/** Captured from GET /api/fair-lending/adverse-action. */
const REGISTER = [
  {
    recordId: 'seed-1071-003',
    applicationId: 'seed-app-004',
    actionDate: '2026-01-25T00:00:00.000Z',
    actionTaken: 'denied',
    adverseReasons: ['Too many recent inquiries'],
  },
];

describe('toRegisterIndex', () => {
  it('keys the 1071 reasons by application', () => {
    const index = toRegisterIndex(REGISTER);
    expect(index.get('seed-app-004')).toEqual(['Too many recent inquiries']);
  });

  it('skips a record with no application', () => {
    expect(toRegisterIndex([{ recordId: 'x', adverseReasons: ['a'] }]).size).toBe(0);
  });

  it('returns an empty index for junk', () => {
    expect(toRegisterIndex(null).size).toBe(0);
  });
});

describe('toDecisionRows', () => {
  const index = toRegisterIndex(REGISTER);

  it('maps a declined application', () => {
    expect(toDecisionRows([DECLINED], index)[0]).toMatchObject({
      applicationId: 'seed-app-004',
      businessName: 'Apex Digital Solutions LLC',
      outcome: 'declined',
      amount: 20000,
      declineReason: 'Too many recent inquiries',
      onRegister: true,
      registerReasons: ['Too many recent inquiries'],
    });
  });

  it('prefers the approved limit on an approval', () => {
    expect(toDecisionRows([APPROVED], index)[0].amount).toBe(45000);
  });

  it('leaves out applications that have not been decided', () => {
    // A decision register listing applications still in flight overstates how
    // much has been decided.
    expect(toDecisionRows([DECLINED, APPROVED, SUBMITTED], index).map((r) => r.applicationId)).toEqual(
      ['seed-app-004', 'seed-app-001'],
    );
  });

  it('carries no notice content and no delivery status', () => {
    // The page showed the notice text with status 'sent' and a sentDate.
    // Nothing records the notice or whether it went.
    const row = toDecisionRows([DECLINED], index)[0] as unknown as Record<string, unknown>;
    expect(row['adverseAction']).toBeUndefined();
    expect(row['noticeSentAt']).toBeUndefined();
    expect(row['noticeContent']).toBeUndefined();
  });

  it('carries no decision factors, because none are recorded per decision', () => {
    // "Credit Score: 780", "PAYDEX: 82" were listed against each decision.
    // Those live on a credit profile, not on the decision.
    const row = toDecisionRows([DECLINED], index)[0] as unknown as Record<string, unknown>;
    expect(row['factors']).toBeUndefined();
    expect(row['reasoning']).toBeUndefined();
  });

  it('marks a decline the 1071 register has no record of', () => {
    const row = toDecisionRows([{ ...DECLINED, id: 'seed-app-999' }], index)[0];
    expect(row.onRegister).toBe(false);
    expect(row.registerReasons).toEqual([]);
  });

  it('leaves the decline reason null when nobody recorded one', () => {
    expect(toDecisionRows([{ ...DECLINED, declineReason: null }], index)[0].declineReason).toBeNull();
  });

  it('reads the list envelope as well as a bare array', () => {
    expect(toDecisionRows({ data: [DECLINED] }, index)).toHaveLength(1);
    expect(toDecisionRows(null, index)).toEqual([]);
  });
});

describe('summariseDecisions', () => {
  const index = toRegisterIndex(REGISTER);
  const rows = (entries: unknown[]): DecisionRow[] => toDecisionRows(entries, index);

  it('counts each outcome and the approval rate', () => {
    const s = summariseDecisions(rows([APPROVED, DECLINED]));
    expect(s).toMatchObject({ total: 2, approved: 1, declined: 1, approvalRate: 50 });
  });

  it('has no approval rate over an empty register', () => {
    // "0%" on a decisions page reads as refusing everyone.
    expect(summariseDecisions([]).approvalRate).toBeNull();
  });

  it('counts declines with no reason recorded', () => {
    const s = summariseDecisions(rows([{ ...DECLINED, declineReason: null }]));
    expect(s.declinesWithoutReason).toBe(1);
  });

  it('counts declines missing from the 1071 register', () => {
    const s = summariseDecisions(rows([{ ...DECLINED, id: 'not-on-register' }]));
    expect(s.declinesOffRegister).toBe(1);
  });

  it('does not count approvals as missing anything', () => {
    const s = summariseDecisions(rows([APPROVED]));
    expect(s.declinesWithoutReason).toBe(0);
    expect(s.declinesOffRegister).toBe(0);
  });
});

describe('declineGaps', () => {
  const index = toRegisterIndex(REGISTER);

  it('reports nothing for an approval', () => {
    expect(declineGaps(toDecisionRows([APPROVED], index)[0])).toBeNull();
  });

  it('reports a complete decline as having no gaps', () => {
    expect(declineGaps(toDecisionRows([DECLINED], index)[0])).toEqual({
      missingReason: false,
      missingFromRegister: false,
    });
  });

  it('reports both gaps when both are missing', () => {
    const row = toDecisionRows([{ ...DECLINED, id: 'off', declineReason: null }], index)[0];
    expect(declineGaps(row)).toEqual({ missingReason: true, missingFromRegister: true });
  });
});

describe('needsAttention', () => {
  const index = toRegisterIndex(REGISTER);

  it('picks out the declines with something missing', () => {
    const rows = toDecisionRows(
      [APPROVED, DECLINED, { ...DECLINED, id: 'gap', declineReason: null }],
      index,
    );
    expect(needsAttention(rows).map((r) => r.applicationId)).toEqual(['gap']);
  });

  it('is empty when every decline is complete', () => {
    expect(needsAttention(toDecisionRows([APPROVED, DECLINED], index))).toEqual([]);
  });
});
