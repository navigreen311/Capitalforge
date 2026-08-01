// ============================================================
// offboarding-view — workflows and what a deletion keeps
//
// The page ticked off data-deletion steps per client — "PII anonymization ✓,
// Credit file purge ✓" — which is the answer to "did you erase my data". The
// deletion behind it is real and irreversible. These pin the two judgments
// that matter: nothing unreadable is a completed deletion, and a completion
// with no signed proof is not proof.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toOffboardingRow,
  toOffboardingRows,
  toRetentionExceptions,
  toDeletionStatus,
  deletionIsProven,
  summarise,
  daysOpen,
  humanise,
  toAuditEntries,
} from '../../../src/frontend/lib/offboarding-view';

const NOW = new Date('2026-08-01T00:00:00.000Z');

/** Captured from GET /api/offboarding. */
const REAL_ROW = {
  id: 'seed-offboard-001',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  businessId: 'seed-biz-003',
  offboardingType: 'client',
  status: 'initiated',
  finalInvoiceId: null,
  refundAmount: null,
  dataExportCompleted: false,
  dataDeletionStatus: 'pending',
  deletionProofHash: null,
  exitReason: 'Secured funding elsewhere.',
  exitInterviewNotes: null,
  initiatedAt: '2026-07-18T00:00:00.000Z',
  completedAt: null,
};

describe('toOffboardingRow', () => {
  it('maps a real workflow', () => {
    expect(toOffboardingRow(REAL_ROW)).toMatchObject({
      id: 'seed-offboard-001',
      businessId: 'seed-biz-003',
      offboardingType: 'client',
      dataExportCompleted: false,
      deletionStatus: 'pending',
      deletionProofHash: null,
      exitReason: 'Secured funding elsewhere.',
    });
  });

  it('carries no per-step deletion states, because none are recorded', () => {
    // The page showed five: consent revocation, document export, PII
    // anonymization, credit file purge, audit log archival. The record holds
    // one deletion status for the whole workflow.
    const row = toOffboardingRow(REAL_ROW) as unknown as Record<string, unknown>;
    expect(row['dataSteps']).toBeUndefined();
    expect(row['progressPct']).toBeUndefined();
  });

  it('treats a missing export flag as not exported', () => {
    const row = toOffboardingRow({ ...REAL_ROW, dataExportCompleted: undefined });
    expect(row?.dataExportCompleted).toBe(false);
  });

  it('drops a workflow with no id', () => {
    expect(toOffboardingRow({ status: 'initiated' })).toBeNull();
  });

  it('reads the list envelope', () => {
    expect(toOffboardingRows({ data: [REAL_ROW] })).toHaveLength(1);
    expect(toOffboardingRows(null)).toEqual([]);
  });
});

describe('toDeletionStatus', () => {
  it('accepts the statuses the record uses', () => {
    for (const s of ['pending', 'in_progress', 'completed']) {
      expect(toDeletionStatus(s)).toBe(s);
    }
  });

  it('reads anything unrecognised as unknown, never as completed', () => {
    // "Completed" is the statement that somebody's personal data is gone.
    expect(toDeletionStatus('done')).toBe('unknown');
    expect(toDeletionStatus(undefined)).toBe('unknown');
    expect(toDeletionStatus(null)).toBe('unknown');
  });
});

describe('deletionIsProven', () => {
  const row = (over: Record<string, unknown>) => toOffboardingRow({ ...REAL_ROW, ...over })!;

  it('is true only for a completed deletion carrying a proof hash', () => {
    expect(
      deletionIsProven(row({ dataDeletionStatus: 'completed', deletionProofHash: 'abc123' })),
    ).toBe(true);
  });

  it('is false when the status says completed and nothing signs for it', () => {
    // The record claims the data is gone with no proof behind it, which is
    // exactly the state worth surfacing rather than rendering as done.
    expect(
      deletionIsProven(row({ dataDeletionStatus: 'completed', deletionProofHash: null })),
    ).toBe(false);
  });

  it('is false while a deletion is pending or running', () => {
    expect(deletionIsProven(row({ dataDeletionStatus: 'pending' }))).toBe(false);
    expect(
      deletionIsProven(row({ dataDeletionStatus: 'in_progress', deletionProofHash: null })),
    ).toBe(false);
  });
});

describe('toRetentionExceptions', () => {
  const REAL_EXCEPTIONS = {
    jurisdiction: 'gdpr',
    exceptions: [
      {
        table: 'invoices',
        reason: 'Financial records retention requirement',
        retainUntil: '2033-08-01T00:00:00.000Z',
        legalBasis: 'IRS 26 USC §6001',
      },
      {
        table: 'consent_records',
        reason: 'GDPR demonstrable consent basis',
        retainUntil: '2029-08-01T00:00:00.000Z',
        legalBasis: 'GDPR Art. 7(1) — controller must demonstrate consent',
      },
    ],
  };

  it('maps the exceptions with their statutes', () => {
    const rows = toRetentionExceptions(REAL_EXCEPTIONS);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ table: 'invoices', legalBasis: 'IRS 26 USC §6001' });
  });

  it('drops an exception with no statute behind it', () => {
    // Data kept for no stated reason is not an exception, it is data kept.
    expect(
      toRetentionExceptions({ exceptions: [{ table: 'invoices', reason: 'because' }] }),
    ).toEqual([]);
  });

  it('reads a bare array too', () => {
    expect(toRetentionExceptions(REAL_EXCEPTIONS.exceptions)).toHaveLength(2);
  });

  it('returns an empty list for junk', () => {
    expect(toRetentionExceptions(null)).toEqual([]);
  });
});

describe('summarise', () => {
  const row = (over: Record<string, unknown>) => toOffboardingRow({ ...REAL_ROW, ...over })!;

  it('counts open workflows and those awaiting deletion', () => {
    const s = summarise([
      row({ id: 'a', dataDeletionStatus: 'pending' }),
      row({ id: 'b', dataDeletionStatus: 'in_progress' }),
      row({
        id: 'c',
        dataDeletionStatus: 'completed',
        deletionProofHash: 'h',
        completedAt: '2026-07-01T00:00:00.000Z',
      }),
    ]);
    expect(s).toMatchObject({ total: 3, open: 2, awaitingDeletion: 2, deleted: 1 });
  });

  it('counts a completion with no proof separately from a proven one', () => {
    const s = summarise([
      row({ id: 'a', dataDeletionStatus: 'completed', deletionProofHash: null }),
      row({ id: 'b', dataDeletionStatus: 'completed', deletionProofHash: 'h' }),
    ]);
    expect(s.deleted).toBe(1);
    expect(s.completedWithoutProof).toBe(1);
  });

  it('handles an empty list', () => {
    expect(summarise([])).toEqual({
      total: 0,
      open: 0,
      awaitingDeletion: 0,
      deleted: 0,
      completedWithoutProof: 0,
    });
  });
});

describe('daysOpen', () => {
  it('counts to now while the workflow is open', () => {
    expect(daysOpen(toOffboardingRow(REAL_ROW)!, NOW)).toBe(14);
  });

  it('counts to completion once it is closed', () => {
    const closed = toOffboardingRow({
      ...REAL_ROW,
      completedAt: '2026-07-25T00:00:00.000Z',
    })!;
    expect(daysOpen(closed, NOW)).toBe(7);
  });

  it('is null when undated', () => {
    expect(daysOpen(toOffboardingRow({ ...REAL_ROW, initiatedAt: null })!, NOW)).toBeNull();
  });
});

describe('humanise', () => {
  it('turns API keys into words', () => {
    expect(humanise('in_progress')).toBe('In progress');
    expect(humanise('export_ready')).toBe('Export ready');
  });
});

describe('toAuditEntries', () => {
  /** Captured from GET /api/platform/offboarding/:id/audit-log. */
  const REAL_LOG = {
    offboardingId: 'seed-offboard-001',
    entries: [
      {
        id: 'clog-1',
        action: 'offboarding.initiated',
        performedBy: 'e0b1c2d3-0000-4000-8000-000000000001',
        timestamp: '2026-07-18T09:14:02.113Z',
        metadata: { type: 'client', exitReason: 'Secured funding elsewhere.' },
      },
      {
        id: 'clog-2',
        action: 'data.deleted',
        performedBy: null,
        timestamp: '2026-07-20T11:02:44.900Z',
        metadata: { recordsDeleted: 12, proofHash: 'abc123' },
      },
    ],
    totalEntries: 2,
  };

  it('maps the entries the audit log holds', () => {
    const entries = toAuditEntries(REAL_LOG);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: 'clog-1',
      action: 'offboarding.initiated',
      performedBy: 'e0b1c2d3-0000-4000-8000-000000000001',
      timestamp: '2026-07-18T09:14:02.113Z',
    });
  });

  it('keeps an unattributed action rather than naming someone for it', () => {
    // The manufactured version stamped every entry "system", which reads as
    // an attribution. A null is the record saying it does not know who.
    expect(toAuditEntries(REAL_LOG)[1].performedBy).toBeNull();
  });

  it('drops an entry that describes nothing that happened', () => {
    expect(
      toAuditEntries({ entries: [{ id: 'x', timestamp: '2026-07-18T09:14:02.113Z' }] }),
    ).toEqual([]);
    expect(toAuditEntries({ entries: [{ action: 'data.deleted' }] })).toEqual([]);
  });

  it('reads a bare array too', () => {
    expect(toAuditEntries(REAL_LOG.entries)).toHaveLength(2);
  });

  it('returns an empty trail for junk, and for a workflow with no history', () => {
    expect(toAuditEntries(null)).toEqual([]);
    expect(toAuditEntries({ entries: [], totalEntries: 0 })).toEqual([]);
  });
});
