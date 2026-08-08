// ============================================================
// Escalation as a status, and the transitions around it
//
// `escalated` was added to ComplaintStatus because escalation is a state a
// complaint is in, not only an assignment. `escalatedTo` records to whom;
// nothing recorded whether, so "what was escalated and when" — a question a
// regulator asks of the register — could not be answered from the status
// history.
//
// The rule these tests exist to hold is the one that is easy to relax later:
// escalated cannot go straight to closed. A complaint that closes without
// passing through resolved carries no recorded outcome, and an outcome is
// exactly what an escalated complaint is asked for. Where a regulator closes
// one, that is still an outcome — record it as resolved, naming who closed it
// and why, then close.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComplaintService, type ComplaintStatus } from '../../../src/backend/services/complaint.service';

interface StoredComplaint {
  id: string;
  tenantId: string;
  status: string;
  severity: string;
  category: string;
  description: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TENANT = 'tenant-1';

function complaintRow(status: string): StoredComplaint {
  return {
    id: 'c1',
    tenantId: TENANT,
    status,
    severity: 'high',
    category: 'compliance',
    description: 'x'.repeat(20),
    resolvedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  };
}

/** Minimal Prisma stand-in: enough for updateComplaint's read-then-write. */
function prismaStub(current: string) {
  const row = complaintRow(current);
  return {
    complaint: {
      findFirst: vi.fn().mockResolvedValue(row),
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row, ...args.data }),
      ),
    },
    complaintEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockImplementation((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : Promise.resolve(ops),
    ),
  };
}

async function attempt(from: string, to: ComplaintStatus): Promise<'allowed' | 'rejected'> {
  const prisma = prismaStub(from);
  const svc = new ComplaintService(prisma as never);
  try {
    await svc.updateComplaint('c1', TENANT, { status: to });
    return 'allowed';
  } catch {
    return 'rejected';
  }
}

describe('escalated is a real status', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('can be reached from open — severity can force it before triage', async () => {
    expect(await attempt('open', 'escalated')).toBe('allowed');
  });

  it('can be reached from investigating', async () => {
    expect(await attempt('investigating', 'escalated')).toBe('allowed');
  });

  it('cannot be reached from resolved — reopening goes through investigating', async () => {
    // Escalating straight from resolved would lose the record of the reopening.
    expect(await attempt('resolved', 'escalated')).toBe('rejected');
  });

  it('cannot be reached from closed — closed stays terminal', async () => {
    expect(await attempt('closed', 'escalated')).toBe('rejected');
  });
});

describe('what escalated can move to', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('can be handed back to investigating', async () => {
    expect(await attempt('escalated', 'investigating')).toBe('allowed');
  });

  it('can be resolved', async () => {
    expect(await attempt('escalated', 'resolved')).toBe('allowed');
  });

  // The rule most likely to be relaxed by someone who finds it inconvenient.
  it('CANNOT be closed directly — a close with no resolution has no outcome', async () => {
    expect(await attempt('escalated', 'closed')).toBe('rejected');
  });

  it('cannot return to open — untriaged after escalation is not a real state', async () => {
    expect(await attempt('escalated', 'open')).toBe('rejected');
  });
});
