// ============================================================
// credit-view — the credit-builder page's two remaining literals
//
// The page picked from eight invented businesses under ids cb_001 to cb_008,
// so every score and tradeline request went to a client that does not exist.
// The backend answered those correctly with a 404; the page turned the
// resulting emptiness into zeros and drew a credit profile out of them.
//
// These pin the two judgments that make that impossible to repeat: the picker
// offers only clients the API returned, and an unfetched tradeline list is
// null rather than a count of nothing.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toCreditBuilderClients,
  toTradelineCount,
  toBusinessScoreSet,
} from '../../../src/frontend/lib/credit-view';

/** Captured from GET /api/v1/clients. */
const REAL_CLIENT = {
  id: 'seed-biz-001',
  businessName: 'Apex Digital Solutions LLC',
  entityType: 'LLC',
  state: 'DE',
};

describe('toCreditBuilderClients', () => {
  it('maps a client to what the picker shows', () => {
    expect(toCreditBuilderClients({ data: [REAL_CLIENT] })).toEqual([
      {
        id: 'seed-biz-001',
        legal_name: 'Apex Digital Solutions LLC',
        entity_type: 'LLC',
        state: 'DE',
      },
    ]);
  });

  it('accepts a bare array as well as the wrapper', () => {
    expect(toCreditBuilderClients([REAL_CLIENT])).toHaveLength(1);
  });

  it('returns nothing when the request has not answered', () => {
    // The picker offered eight literals in exactly this state. Empty is the
    // honest answer, and the page says the list is still loading.
    expect(toCreditBuilderClients(undefined)).toEqual([]);
    expect(toCreditBuilderClients(null)).toEqual([]);
    expect(toCreditBuilderClients({})).toEqual([]);
  });

  it('drops a row with no id or no name rather than inventing one', () => {
    const rows = toCreditBuilderClients({
      data: [REAL_CLIENT, { id: 'x' }, { businessName: 'No Id Co' }, null, 'nonsense'],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('seed-biz-001');
  });

  it('leaves entity type and state blank when the record omits them', () => {
    const rows = toCreditBuilderClients({ data: [{ id: 'b1', businessName: 'Minimal Co' }] });
    expect(rows[0]).toEqual({ id: 'b1', legal_name: 'Minimal Co', entity_type: '', state: '' });
  });
});

describe('toTradelineCount', () => {
  it('counts the tradelines the API returned', () => {
    expect(toTradelineCount({ tradelines: [{ id: 't1' }, { id: 't2' }] })).toBe(2);
    expect(toTradelineCount([{ id: 't1' }])).toBe(1);
  });

  it('reports zero when the client genuinely has none', () => {
    // A real answer: the request succeeded and the list is empty.
    expect(toTradelineCount({ tradelines: [] })).toBe(0);
    expect(toTradelineCount([])).toBe(0);
  });

  it('reports null when nothing has been fetched', () => {
    // The distinction the page needs. Both of these used to be 0, so a page
    // that had loaded nothing stated the client had opened no trade lines.
    expect(toTradelineCount(undefined)).toBeNull();
    expect(toTradelineCount(null)).toBeNull();
    expect(toTradelineCount({})).toBeNull();
    expect(toTradelineCount({ error: 'CLIENT_NOT_FOUND' })).toBeNull();
  });
});

describe('toBusinessScoreSet', () => {
  it('leaves a bureau with no pull on record null', () => {
    // Guards the other half of the same defect: the page coerced these to 0
    // before passing them on, and 0 is a Paydex score, not an absence.
    const set = toBusinessScoreSet(undefined);
    expect(set.paydex).toBeNull();
    expect(set.experianBusiness).toBeNull();
    expect(set.sbss).toBeNull();
  });
});
