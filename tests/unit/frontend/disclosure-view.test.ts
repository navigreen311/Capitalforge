// ============================================================
// disclosure-view — mapping the disclosure CMS
//
// The page held nine templates as literals with an approvedBy of "CCO" or
// "GC", and offered to send them to clients. These pin the mapping against a
// real response and pin the one thing that must never be inferred: that a
// disclosure has been approved, and may therefore be issued.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toDisclosureTemplate,
  toDisclosureTemplates,
  toTemplateStatus,
  renderability,
  missingVariables,
  summariseTemplates,
  templateFacets,
  wordCount,
  humanise,
  type DisclosureTemplateRow,
} from '../../../src/frontend/lib/disclosure-view';

/** Captured from GET /api/disclosures/templates. */
const REAL_TEMPLATE = {
  id: 'c3d02b5f-7b73-426b-8e8c-0c6a8d786ab1',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  state: 'CA',
  category: 'state_specific',
  name: 'California SB 1235 Commercial Financing Disclosure',
  content: 'CALIFORNIA COMMERCIAL FINANCING DISCLOSURE\n(Required under California law)',
  version: '1.0.0',
  effectiveDate: '2024-01-01T00:00:00.000Z',
  isActive: false,
  status: 'draft',
  approvedBy: null,
  approvedAt: null,
  variables: [
    { name: 'businessLegalName', description: 'Legal business name', required: true },
    { name: 'businessState', description: 'State of business operations', required: true },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
  ],
  createdAt: '2026-08-01T01:01:45.566Z',
  updatedAt: '2026-08-01T01:01:45.566Z',
};

const template = (over: Partial<DisclosureTemplateRow>): DisclosureTemplateRow => ({
  ...(toDisclosureTemplate(REAL_TEMPLATE) as DisclosureTemplateRow),
  ...over,
});

describe('toDisclosureTemplate', () => {
  it('maps a real template', () => {
    expect(toDisclosureTemplate(REAL_TEMPLATE)).toMatchObject({
      id: 'c3d02b5f-7b73-426b-8e8c-0c6a8d786ab1',
      name: 'California SB 1235 Commercial Financing Disclosure',
      state: 'CA',
      category: 'state_specific',
      version: '1.0.0',
      status: 'draft',
      isActive: false,
      approvedBy: null,
      approvedAt: null,
    });
  });

  it('reads the declared variables', () => {
    const t = toDisclosureTemplate(REAL_TEMPLATE);
    expect(t?.variables).toHaveLength(3);
    expect(t?.variables[0]).toEqual({
      name: 'businessLegalName',
      description: 'Legal business name',
      required: true,
    });
  });

  it('leaves approvedBy null rather than naming a role', () => {
    // The page filled this with "CCO" and "GC" — an assertion that somebody
    // accountable signed off text a client is handed.
    expect(toDisclosureTemplate(REAL_TEMPLATE)?.approvedBy).toBeNull();
  });

  it('survives variables being something other than a list', () => {
    expect(toDisclosureTemplate({ ...REAL_TEMPLATE, variables: null })?.variables).toEqual([]);
    expect(toDisclosureTemplate({ ...REAL_TEMPLATE, variables: { a: 1 } })?.variables).toEqual([]);
  });

  it('drops a template with no id', () => {
    expect(toDisclosureTemplate({ name: 'No id' })).toBeNull();
  });

  it('reads the list envelope the endpoint returns', () => {
    expect(toDisclosureTemplates({ data: [REAL_TEMPLATE] })).toHaveLength(1);
    expect(toDisclosureTemplates([REAL_TEMPLATE])).toHaveLength(1);
    expect(toDisclosureTemplates(null)).toEqual([]);
  });
});

describe('toTemplateStatus', () => {
  it('accepts every status the API defines', () => {
    for (const s of ['draft', 'pending_review', 'approved', 'rejected', 'superseded']) {
      expect(toTemplateStatus(s)).toBe(s);
    }
  });

  it('falls back to draft, never to approved', () => {
    // 'approved' is the value that says this text may be issued to a client.
    // It has to come from a recorded approval, not from a fallback.
    expect(toTemplateStatus('who_knows')).toBe('draft');
    expect(toTemplateStatus(undefined)).toBe('draft');
    expect(toTemplateStatus(null)).toBe('draft');
  });
});

describe('renderability', () => {
  it('allows an approved, active template', () => {
    expect(renderability(template({ status: 'approved', isActive: true }))).toEqual({
      canRender: true,
    });
  });

  it('refuses a draft, and says approval is what is missing', () => {
    const r = renderability(template({ status: 'draft', isActive: false }));
    expect(r.canRender).toBe(false);
    expect(r).toMatchObject({ reason: expect.stringContaining('approved') });
  });

  it('refuses an approved template that is not active', () => {
    // The API requires both, because a template can be approved and later
    // deactivated. Checking only the status would offer to issue it.
    const r = renderability(template({ status: 'approved', isActive: false }));
    expect(r.canRender).toBe(false);
    expect(r).toMatchObject({ reason: expect.stringContaining('not currently active') });
  });

  it('distinguishes rejected from superseded', () => {
    // The page collapsed both into "Deprecated". A version rejected at review
    // and one replaced by a newer one are different facts.
    expect(renderability(template({ status: 'rejected' }))).toMatchObject({
      reason: expect.stringContaining('rejected'),
    });
    expect(renderability(template({ status: 'superseded' }))).toMatchObject({
      reason: expect.stringContaining('superseded'),
    });
  });
});

describe('missingVariables', () => {
  it('names the required variables not yet supplied', () => {
    expect(missingVariables(template({}), { businessLegalName: 'Apex Digital Solutions LLC' })).toEqual(
      ['businessState', 'disclosureDate'],
    );
  });

  it('treats whitespace as not supplied', () => {
    expect(
      missingVariables(template({}), {
        businessLegalName: '   ',
        businessState: 'CA',
        disclosureDate: '2026-08-01',
      }),
    ).toEqual(['businessLegalName']);
  });

  it('ignores optional variables', () => {
    const t = template({
      variables: [
        { name: 'required1', description: '', required: true },
        { name: 'optional1', description: '', required: false },
      ],
    });
    expect(missingVariables(t, { required1: 'x' })).toEqual([]);
  });

  it('is empty when everything required is present', () => {
    expect(
      missingVariables(template({}), {
        businessLegalName: 'Apex',
        businessState: 'CA',
        disclosureDate: '2026-08-01',
      }),
    ).toEqual([]);
  });
});

describe('summariseTemplates', () => {
  it('counts each stage of the lifecycle', () => {
    const s = summariseTemplates([
      template({ id: 'a', status: 'draft' }),
      template({ id: 'b', status: 'pending_review' }),
      template({ id: 'c', status: 'approved', isActive: true }),
      template({ id: 'd', status: 'approved', isActive: true }),
    ]);
    expect(s).toMatchObject({ total: 4, drafts: 1, awaitingReview: 1, approved: 2 });
  });

  it('counts approved templates that cannot actually be issued', () => {
    // Approved but inactive reads as usable on a status badge alone, and the
    // render endpoint will refuse it.
    const s = summariseTemplates([
      template({ id: 'a', status: 'approved', isActive: true }),
      template({ id: 'b', status: 'approved', isActive: false }),
    ]);
    expect(s.approved).toBe(2);
    expect(s.approvedButInactive).toBe(1);
  });

  it('handles an empty library', () => {
    expect(summariseTemplates([])).toEqual({
      total: 0,
      approved: 0,
      awaitingReview: 0,
      drafts: 0,
      approvedButInactive: 0,
    });
  });
});

describe('templateFacets', () => {
  it('lists the states and categories present', () => {
    const f = templateFacets([
      template({ id: 'a', state: 'CA', category: 'state_specific' }),
      template({ id: 'b', state: 'FEDERAL', category: 'fee_schedule' }),
      template({ id: 'c', state: 'CA', category: 'state_specific' }),
    ]);
    expect(f.states).toEqual(['CA', 'FEDERAL']);
    expect(f.categories).toEqual(['fee_schedule', 'state_specific']);
  });

  it('offers nothing for an empty library', () => {
    expect(templateFacets([])).toEqual({ states: [], categories: [] });
  });
});

describe('wordCount', () => {
  it('counts the words in the body', () => {
    // The page stored a wordCount per template. It is computable from the
    // text, so it is computed.
    expect(wordCount('one two three')).toBe(3);
    expect(wordCount('  spaced   out  words ')).toBe(3);
  });

  it('is zero for empty content', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
  });
});

describe('humanise', () => {
  it('turns API keys into words', () => {
    expect(humanise('state_specific')).toBe('State specific');
    expect(humanise('pending_review')).toBe('Pending review');
  });
});
