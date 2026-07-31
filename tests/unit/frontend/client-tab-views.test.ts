// ============================================================
// Client tab view mappings — unit tests
//
// Each of these tabs used to substitute hardcoded sample data when the API
// returned nothing. The rules below are what replaced that: absent data must
// read as absent, and must never be indistinguishable from a good result.
// ============================================================

import { describe, it, expect } from 'vitest';

import {
  toTimelineEvents,
  titleFromEventType,
  detailFromPayload,
  actorFromEvent,
  getEventConfig,
} from '../../../src/frontend/lib/timeline-view.js';

import {
  buildAcknowledgmentList,
  missingCount,
  docuSignFrom,
  REQUIRED_ACKNOWLEDGMENTS,
} from '../../../src/frontend/lib/acknowledgments-view.js';

import {
  toDocumentRecords,
  toDocumentType,
  formatSize,
  signatureStatusFrom,
  buildRequiredChecklist,
} from '../../../src/frontend/lib/documents-view.js';

import {
  toApplicationViews,
  summariseGates,
  toApplicationStatus,
  formatAmount,
} from '../../../src/frontend/lib/applications-view.js';

// ── Timeline ────────────────────────────────────────────────────────────────

describe('timeline-view', () => {
  it('returns nothing for an empty ledger instead of sample activity', () => {
    expect(toTimelineEvents([])).toEqual([]);
    expect(toTimelineEvents(null)).toEqual([]);
    expect(toTimelineEvents(undefined)).toEqual([]);
  });

  it('reads the bare array the API actually returns', () => {
    const events = toTimelineEvents([
      {
        id: 'evt-1',
        eventType: 'application.submitted',
        payload: { businessName: 'Apex LLC', issuer: 'Chase', createdBy: 'sarah@x.io' },
        publishedAt: '2026-07-01T10:00:00.000Z',
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: 'application.submitted',
      title: 'Application Submitted',
      actor: 'sarah@x.io',
      timestamp: '2026-07-01T10:00:00.000Z',
    });
    expect(events[0].detail).toContain('Apex LLC');
  });

  it('also accepts a { events: [] } wrapper', () => {
    expect(toTimelineEvents({ events: [{ id: 'e', eventType: 'x.y', publishedAt: null }] })).toHaveLength(1);
  });

  it('categorises the event types the backend really emits', () => {
    // The previous map was keyed on `client.*` names that are never emitted,
    // so every real event fell through to the default and no filter matched.
    expect(getEventConfig('application.submitted').category).toBe('application');
    expect(getEventConfig('consent.captured').category).toBe('consent');
    expect(getEventConfig('document.uploaded').category).toBe('document');
    expect(getEventConfig('kyb.verified').category).toBe('compliance');
    expect(getEventConfig('client.application_submitted').category).toBe('all');
  });

  it('falls back to System rather than inventing an actor', () => {
    expect(actorFromEvent({}, {})).toBe('System');
    expect(actorFromEvent({}, { source: 'ach-controls-service' })).toBe('ach-controls-service');
  });

  it('says nothing is recorded rather than showing a blank detail', () => {
    expect(detailFromPayload({})).toBe('No further detail recorded.');
    expect(detailFromPayload(null)).toBe('No further detail recorded.');
  });

  it('humanises an unknown event type instead of rendering the raw key', () => {
    expect(titleFromEventType('funding_round.completed')).toBe('Funding Round Completed');
    expect(titleFromEventType(null)).toBe('Unknown Event');
  });
});

// ── Acknowledgments ─────────────────────────────────────────────────────────

describe('acknowledgments-view', () => {
  it('reports every required acknowledgment as missing when none are on file', () => {
    const items = buildAcknowledgmentList([]);

    expect(items).toHaveLength(REQUIRED_ACKNOWLEDGMENTS.length);
    expect(items.every((i) => i.status === 'missing')).toBe(true);
    expect(missingCount(items)).toBe(REQUIRED_ACKNOWLEDGMENTS.length);
    // Not an empty, reassuring list, and not "pending" — nothing is in flight.
    expect(items.every((i) => i.signed_date === null)).toBe(true);
  });

  it('marks only the types actually signed', () => {
    const items = buildAcknowledgmentList([
      {
        id: 'ack-1',
        acknowledgmentType: 'product_reality',
        version: 'v2',
        signedAt: '2026-03-15T14:30:00.000Z',
        signatureRef: 'James Thornton',
        documentVaultId: 'doc-9',
        metadata: {},
      },
    ]);

    const signed = items.filter((i) => i.status === 'signed');
    expect(signed).toHaveLength(1);
    expect(signed[0].type).toBe('product_reality');
    expect(signed[0].signed_by).toBe('James Thornton');
    expect(signed[0].document_url).toBe('/api/documents/doc-9');
    expect(missingCount(items)).toBe(REQUIRED_ACKNOWLEDGMENTS.length - 1);
  });

  it('reports no DocuSign envelope when none was recorded', () => {
    expect(docuSignFrom({})).toEqual({ docusign_envelope_id: null, docusign_status: 'none' });
    expect(docuSignFrom({ docusignEnvelopeId: 'env-1', docusignStatus: 'delivered' })).toEqual({
      docusign_envelope_id: 'env-1',
      docusign_status: 'delivered',
    });
  });
});

// ── Documents ───────────────────────────────────────────────────────────────

describe('documents-view', () => {
  it('returns nothing for an empty vault', () => {
    expect(toDocumentRecords([])).toEqual([]);
    expect(toDocumentRecords(null)).toEqual([]);
  });

  it('maps a stored document', () => {
    const [doc] = toDocumentRecords([
      {
        id: 'doc-1',
        documentType: 'bank_statement',
        title: 'Chase Business Checking — Feb 2026',
        sizeBytes: 2_411_724,
        legalHold: true,
        createdAt: '2026-02-28T00:00:00.000Z',
        metadata: {},
      },
    ]);

    expect(doc).toMatchObject({
      name: 'Chase Business Checking — Feb 2026',
      type: 'bank_statement',
      typeLabel: 'Bank Statement',
      legalHold: true,
    });
    expect(doc.size).toBe('2.3 MB');
  });

  it('does not claim a signature is outstanding when none was recorded', () => {
    expect(signatureStatusFrom({})).toBe('not_required');
    expect(signatureStatusFrom({ signatureStatus: 'sent' })).toBe('sent');
  });

  it('shows a dash rather than 0 B for an unknown size', () => {
    expect(formatSize(null)).toBe('—');
    expect(formatSize(undefined)).toBe('—');
    expect(formatSize(0)).toBe('0 B');
  });

  it('maps unrecognised document types to other', () => {
    expect(toDocumentType('tax_return')).toBe('compliance');
    expect(toDocumentType('something_else')).toBe('other');
    expect(toDocumentType(null)).toBe('other');
  });

  it('derives the required checklist from the vault, not from a constant', () => {
    const none = buildRequiredChecklist([]);
    expect(none.every((r) => !r.uploaded)).toBe(true);
    expect(none.every((r) => r.fileName === undefined)).toBe(true);

    const withBank = buildRequiredChecklist(
      toDocumentRecords([
        { id: 'd1', documentType: 'bank_statement', title: 'Feb statement', createdAt: null },
      ]),
    );
    expect(withBank.filter((r) => r.uploaded)).toHaveLength(1);
    expect(withBank.find((r) => r.uploaded)?.fileName).toBe('Feb statement');
  });
});

// ── Applications ────────────────────────────────────────────────────────────

describe('applications-view', () => {
  it('returns nothing when the client has no applications', () => {
    expect(toApplicationViews([])).toEqual([]);
    expect(toApplicationViews(null)).toEqual([]);
  });

  it('maps the list response', () => {
    const [app] = toApplicationViews([
      {
        id: 'app-1',
        issuer: 'Chase',
        cardProduct: 'Ink Business Preferred',
        status: 'approved',
        requestedLimit: 50000,
        approvedLimit: 45000,
      },
    ]);

    expect(app).toMatchObject({
      issuer: 'Chase',
      status: 'approved',
      requestedAmount: 50000,
      approvedAmount: 45000,
    });
  });

  it('keeps business-level gate status off the per-application rows', () => {
    // Consent and acknowledgment belong to the client, so they are summarised
    // once for the header rather than copied onto every card.
    const [app] = toApplicationViews([{ id: 'a', issuer: null, cardProduct: null, status: 'draft' }]);
    expect(app).not.toHaveProperty('consentComplete');
    expect(app).not.toHaveProperty('ackSigned');
  });

  it('reports an absent amount as unknown, not as zero', () => {
    const [app] = toApplicationViews([{ id: 'a', issuer: null, cardProduct: null, status: 'draft' }]);

    expect(app.requestedAmount).toBeNull();
    expect(formatAmount(app.requestedAmount)).toBe('Not available');
    // A real zero stays a zero.
    expect(formatAmount(0)).toBe('$0');
  });

  it('leaves consent unknown when the gate response is absent', () => {
    // `false` would render "Consent: Missing" — a claim about the client's
    // file that an unloaded response does not support.
    expect(summariseGates(undefined)).toEqual({ consentComplete: null, ackSigned: null });
    expect(summariseGates({})).toEqual({ consentComplete: null, ackSigned: null });
  });

  it('summarises real gates', () => {
    const gates = {
      gates: [
        { id: 'tcpa-consent', label: 'TCPA', status: 'pass' },
        { id: 'application-consent', label: 'App', status: 'missing' },
        { id: 'product-reality', label: 'PR', status: 'pass' },
      ],
    };

    expect(summariseGates(gates)).toEqual({ consentComplete: false, ackSigned: true });
  });

  it('treats an unrecognised status as a draft, never as approved', () => {
    expect(toApplicationStatus('wat')).toBe('draft');
    expect(toApplicationStatus(null)).toBe('draft');
    expect(toApplicationStatus('APPROVED')).toBe('approved');
  });
});
