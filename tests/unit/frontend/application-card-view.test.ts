// ============================================================
// toApplicationCards — mapping API rows onto pipeline board cards
//
// The board previously did `setApps(res.data as ApplicationCard[])`. The cast
// satisfied the compiler and was wrong: real rows carry no advisor, so the
// first render called `advisor.split(' ')` on undefined and the page fell to
// the error boundary. Signed out the fetch failed, the catch kept ten sample
// applications, and the board looked healthy — which is why it survived.
//
// These pin the shape against a real response, and that unavailable fields
// stay null rather than acquiring plausible values.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toApplicationCards,
  toApplicationCard,
  daysSince,
  toStatus,
  advisorInitials,
} from '../../../src/frontend/lib/application-card-view';

const NOW = new Date('2026-08-01T00:00:00.000Z');

/** Captured from GET /api/applications — note there is no advisor field. */
const REAL_ROW = {
  id: 'seed-app-004',
  businessId: 'seed-biz-001',
  businessName: 'Apex Digital Solutions LLC',
  issuer: 'Bank of America',
  cardProduct: 'Business Advantage Unlimited',
  status: 'declined',
  requestedLimit: 0,
  fundingRoundId: 'e814410e-0530-4ef7-b4c4-790b978347f2',
  roundNumber: 2,
  submittedAt: '2026-01-21T00:00:00.000Z',
  decidedAt: '2026-07-25T00:00:00.000Z',
  createdAt: '2026-07-30T23:14:57.506Z',
  updatedAt: '2026-07-30T23:14:57.506Z',
};

describe('toApplicationCard — the shape that used to crash', () => {
  it('maps a real row without an advisor field', () => {
    const card = toApplicationCard(REAL_ROW, NOW);
    expect(card).not.toBeNull();
    expect(card?.advisor).toBeNull();
  });

  it('produces initials of null for an unassigned advisor rather than throwing', () => {
    // The exact regression: advisorInitials(undefined) threw on .split(' ').
    expect(advisorInitials(null)).toBeNull();
    expect(() => advisorInitials(null)).not.toThrow();
  });

  it('returns initials when an advisor is assigned', () => {
    expect(advisorInitials('Marcus Whitfield')).toBe('MW');
    // Extra spacing must not produce an empty initial.
    expect(advisorInitials('  Sarah   Chen ')).toBe('SC');
  });

  it('carries the identifying fields through unchanged', () => {
    expect(toApplicationCard(REAL_ROW, NOW)).toMatchObject({
      id: 'seed-app-004',
      businessId: 'seed-biz-001',
      businessName: 'Apex Digital Solutions LLC',
      issuer: 'Bank of America',
      cardProduct: 'Business Advantage Unlimited',
      status: 'declined',
      roundNumber: 2,
    });
  });

  it('drops a row with no id rather than rendering a card that cannot be opened', () => {
    expect(toApplicationCard({ businessName: 'No Id Corp' }, NOW)).toBeNull();
  });
});

describe('toApplicationCard — figures that must not be invented', () => {
  it('reports no approved limit unless the application is approved', () => {
    const declined = toApplicationCard({ ...REAL_ROW, approvedLimit: 45000 }, NOW);
    // A limit on a declined application is not an approval.
    expect(declined?.approvedLimit).toBeNull();

    const approved = toApplicationCard(
      { ...REAL_ROW, status: 'approved', approvedLimit: 45000 },
      NOW,
    );
    expect(approved?.approvedLimit).toBe(45000);
  });

  it('leaves consent unknown when the API does not carry the field', () => {
    // Not 'missing': asserting a compliance failure we have not established
    // is its own error, and this chip is read as a compliance signal.
    expect(toApplicationCard(REAL_ROW, NOW)?.consentStatus).toBe('unknown');
  });

  it('reports consent complete or missing once the field is present', () => {
    expect(
      toApplicationCard({ ...REAL_ROW, consentCapturedAt: '2026-01-20T00:00:00.000Z' }, NOW)
        ?.consentStatus,
    ).toBe('complete');

    expect(
      toApplicationCard({ ...REAL_ROW, consentCapturedAt: null }, NOW)?.consentStatus,
    ).toBe('missing');
  });

  it('measures days in status from the date the status was reached', () => {
    // Declined on 2026-07-25, seven days before NOW.
    expect(toApplicationCard(REAL_ROW, NOW)?.daysInStatus).toBe(7);
  });

  it('leaves the age null rather than zero when no timestamp is usable', () => {
    const card = toApplicationCard(
      { id: 'x', status: 'draft', updatedAt: null, createdAt: null },
      NOW,
    );
    // Zero would render as "0d in draft" — filed today.
    expect(card?.daysInStatus).toBeNull();
  });
});

describe('daysSince', () => {
  it('counts whole days elapsed', () => {
    expect(daysSince('2026-07-25T00:00:00.000Z', NOW)).toBe(7);
  });

  it('returns null for a missing or unparseable date', () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince('', NOW)).toBeNull();
    expect(daysSince('not a date', NOW)).toBeNull();
  });

  it('returns null for a future date rather than a negative age', () => {
    expect(daysSince('2026-09-01T00:00:00.000Z', NOW)).toBeNull();
  });
});

describe('toStatus', () => {
  it('accepts every column the board renders', () => {
    for (const s of ['draft', 'pending_consent', 'submitted', 'approved', 'declined']) {
      expect(toStatus(s)).toBe(s);
    }
  });

  it('keeps reconsideration, which a narrower union would have silently reclassified', () => {
    expect(toStatus('reconsideration')).toBe('reconsideration');
  });

  it('falls back to draft for an unrecognised status so the row is not lost', () => {
    expect(toStatus('who_knows')).toBe('draft');
    expect(toStatus(undefined)).toBe('draft');
  });
});

describe('toApplicationCards', () => {
  it('maps a list', () => {
    expect(toApplicationCards([REAL_ROW, { ...REAL_ROW, id: 'b' }], NOW)).toHaveLength(2);
  });

  it('accepts the grouped-by-status shape the kanban view can request', () => {
    const grouped = {
      declined: [REAL_ROW],
      approved: [{ ...REAL_ROW, id: 'seed-app-001', status: 'approved' }],
    };
    const cards = toApplicationCards(grouped, NOW);
    expect(cards.map((c) => c.id).sort()).toEqual(['seed-app-001', 'seed-app-004']);
  });

  it('returns an empty list for junk rather than throwing', () => {
    expect(toApplicationCards(null, NOW)).toEqual([]);
    expect(toApplicationCards(undefined, NOW)).toEqual([]);
    expect(toApplicationCards('nonsense', NOW)).toEqual([]);
  });

  it('classifies credit unions from the issuer name', () => {
    const cu = toApplicationCards([{ ...REAL_ROW, issuer: 'Navy Federal Credit Union' }], NOW);
    expect(cu[0].issuer_type).toBe('credit_union');
    expect(toApplicationCards([REAL_ROW], NOW)[0].issuer_type).toBe('bank');
  });
});
