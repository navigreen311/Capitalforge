// ============================================================
// CapitalForge — Stub response marker
//
// Some endpoints have no implementation behind them yet: they serve
// hardcoded sample data. That is legitimate while a feature is being built,
// but it must never be *indistinguishable* from real data — a stub that
// answers 200 with a plausible body makes a hollow backend look healthy, and
// nothing downstream (UI, tests, monitoring, a demo audience) can tell.
//
// Every stub response therefore carries two markers:
//   - `meta.stub: true` in the JSON envelope, so the UI can badge it
//   - an `X-CapitalForge-Stub: <feature>` header, so proxies//logs/tests can
//     assert on it without parsing the body
//
// Stubs also register themselves at module load, so the server can print an
// inventory at boot rather than letting them accumulate unnoticed.
// ============================================================

import type { Response } from 'express';
import type { ApiResponse } from '../../../shared/types/index.js';

/** feature key → human-readable reason it is still a stub */
const STUB_REGISTRY = new Map<string, string>();

/**
 * Declare a stub endpoint at module load time.
 *
 * Call this at the top level of a route module so the endpoint appears in the
 * boot-time inventory even if it is never hit.
 */
export function registerStub(feature: string, reason: string): void {
  STUB_REGISTRY.set(feature, reason);
}

/** Every declared stub, sorted by feature key. */
export function listStubs(): { feature: string; reason: string }[] {
  return [...STUB_REGISTRY.entries()]
    .map(([feature, reason]) => ({ feature, reason }))
    .sort((a, b) => a.feature.localeCompare(b.feature));
}

/**
 * Send sample data, explicitly marked as a stub.
 *
 * Use this instead of a plain 200 whenever the payload is not derived from
 * real state.
 */
export function okStub(
  res: Response,
  data: unknown,
  feature: string,
  meta?: Record<string, unknown>,
  status = 200,
): void {
  res.setHeader('X-CapitalForge-Stub', feature);
  const body: ApiResponse = {
    success: true,
    data,
    meta: { ...(meta ?? {}), stub: true, stubFeature: feature },
  };
  res.status(status).json(body);
}

/**
 * A write that a stub only pretended to perform.
 *
 * Distinct from `okStub` because a fabricated 201 is the most misleading
 * response a stub can send: the caller records an id for something that was
 * never durably stored.
 */
export function createdStub(
  res: Response,
  data: unknown,
  feature: string,
  meta?: Record<string, unknown>,
): void {
  okStub(res, data, feature, { ...(meta ?? {}), persisted: false }, 201);
}
