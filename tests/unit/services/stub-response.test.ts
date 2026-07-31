// ============================================================
// CapitalForge — Stub response marker tests
//
// Guards the property that matters: an endpoint serving sample data must be
// distinguishable from one serving real state. If these markers are ever
// dropped, a hollow backend goes back to looking healthy.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

import {
  okStub,
  createdStub,
  registerStub,
  listStubs,
} from '../../../src/backend/api/routes/_stub-response.js';

// ── Minimal Response double ───────────────────────────────────

interface Captured {
  status: number;
  headers: Record<string, string>;
  body: { success?: boolean; data?: unknown; meta?: Record<string, unknown> };
}

function mockResponse(): { res: Response; captured: Captured } {
  const captured: Captured = { status: 0, headers: {}, body: {} };
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      captured.headers[name.toLowerCase()] = value;
    }),
    status: vi.fn((code: number) => {
      captured.status = code;
      return res;
    }),
    json: vi.fn((body: Captured['body']) => {
      captured.body = body;
      return res;
    }),
  } as unknown as Response;
  return { res, captured };
}

// ── Tests ─────────────────────────────────────────────────────

describe('stub response markers', () => {
  let res: Response;
  let captured: Captured;

  beforeEach(() => {
    ({ res, captured } = mockResponse());
  });

  it('flags a stub payload in both the header and the envelope', () => {
    okStub(res, { score: 720 }, 'client.credit.history');

    expect(captured.status).toBe(200);
    expect(captured.headers['x-capitalforge-stub']).toBe('client.credit.history');
    expect(captured.body.success).toBe(true);
    expect(captured.body.meta?.stub).toBe(true);
    expect(captured.body.meta?.stubFeature).toBe('client.credit.history');
    expect(captured.body.data).toEqual({ score: 720 });
  });

  it('preserves caller-supplied meta alongside the stub flag', () => {
    okStub(res, [1, 2, 3], 'demo.feature', { total: 3 });

    expect(captured.body.meta).toMatchObject({ total: 3, stub: true, stubFeature: 'demo.feature' });
  });

  it('marks a pretended write as 201 but not persisted', () => {
    createdStub(res, { id: 'tl-1' }, 'creditBuilder');

    expect(captured.status).toBe(201);
    expect(captured.headers['x-capitalforge-stub']).toBe('creditBuilder');
    expect(captured.body.meta?.stub).toBe(true);
    // The distinguishing claim: the caller must not treat this id as durable.
    expect(captured.body.meta?.persisted).toBe(false);
  });

  it('reports declared stubs in the inventory, sorted and de-duplicated', () => {
    registerStub('zeta.feature', 'not built');
    registerStub('alpha.feature', 'not built');
    registerStub('alpha.feature', 'still not built');

    const features = listStubs().map((s) => s.feature);
    expect(features.indexOf('alpha.feature')).toBeLessThan(features.indexOf('zeta.feature'));
    expect(features.filter((f) => f === 'alpha.feature')).toHaveLength(1);
    expect(listStubs().find((s) => s.feature === 'alpha.feature')?.reason).toBe('still not built');
  });

  it('exposes every module-level stub declaration with a usable reason', async () => {
    // Deliberately not a snapshot of which modules are stubbed: that list
    // shrinks as features are implemented, and a test enumerating it would
    // need editing every time one lands. What must hold is that anything
    // still declaring itself a stub explains why, so the boot inventory stays
    // actionable.
    //
    // As of the route implementation work the set is empty — every stub was
    // either implemented or turned into an explicit refusal. Zero is a valid
    // and desirable state, so this asserts the contract over whatever is
    // registered rather than requiring that something still is.
    await import('../../../src/backend/api/routes/credit-builder.routes.js');
    await import('../../../src/backend/api/routes/payment-reminders.routes.js');

    const shipped = listStubs().filter((s) => !s.feature.endsWith('.feature'));

    for (const stub of shipped) {
      expect(stub.feature).toMatch(/^[a-zA-Z][\w.]*$/);
      expect(stub.reason.length).toBeGreaterThan(20);
    }
  });
});
