// ============================================================
// Dashboard KPIs — the applications sparkline
//
// This was null, on the reasoning that "active" is a current status with
// nothing on the row recording what it was before, so a past count could only
// be invented. Half right: the *status* has no history, and the two dates that
// bound an application's active life were on the row all along — `createdAt`
// opens it, `decidedAt` closes it.
//
// The series must agree with the number printed above it. The headline counts
// `status NOT IN (approved, declined)`, so these pin that the last point
// equals that count, including for the rows where the two could disagree.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  activeApplicationsByDay,
  type ApplicationLifespan,
} from '../../../src/backend/api/routes/dashboard-kpi.routes';
import { CLOSED_APPLICATION_STATUSES } from '../../../src/shared/types/index';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Four end-of-day boundaries, matching how the route builds them.
 *
 * A boundary is the *start of the next day*, so `2026-03-02` is the end of
 * 1 March. The days covered here are 1–4 March.
 */
const BOUNDARIES = [day('2026-03-02'), day('2026-03-03'), day('2026-03-04'), day('2026-03-05')];

const app = (
  createdAt: string,
  decidedAt: string | null,
  status: string,
  cancelledAt: string | null = null,
): ApplicationLifespan => ({
  createdAt: day(createdAt),
  decidedAt: decidedAt === null ? null : day(decidedAt),
  cancelledAt: cancelledAt === null ? null : day(cancelledAt),
  status,
});

/** What the headline counts: everything still open. */
const liveActiveCount = (apps: ApplicationLifespan[]) =>
  apps.filter((a) => !CLOSED_APPLICATION_STATUSES.includes(a.status as never)).length;

describe('activeApplicationsByDay', () => {
  it('counts an open application from the end of the day it was created', () => {
    // Created on 3 March, so it is not open at the end of 1 or 2 March.
    const apps = [app('2026-03-03', null, 'submitted')];
    expect(activeApplicationsByDay(apps, BOUNDARIES)).toEqual([0, 0, 1, 1]);
  });

  it('stops counting an application on the day it was decided', () => {
    // Created on the 1st, approved on the 3rd: active on the 2nd, not after.
    const apps = [app('2026-03-01', '2026-03-03', 'approved')];
    expect(activeApplicationsByDay(apps, BOUNDARIES)).toEqual([1, 1, 0, 0]);
  });

  it('sums applications that overlap', () => {
    const apps = [
      app('2026-03-01', '2026-03-04', 'declined'),
      app('2026-03-02', null, 'submitted'),
      app('2026-03-04', null, 'draft'),
    ];
    // End of 1 Mar: only the first. End of 2 Mar: two. End of 3 Mar: two —
    // the first is decided on the 4th, so it is still open at the end of the
    // 3rd. End of 4 Mar: the first has closed and the third has opened.
    expect(activeApplicationsByDay(apps, BOUNDARIES)).toEqual([1, 2, 2, 2]);
  });

  it('agrees with the number printed above it', () => {
    // The property that matters: the last point is the live active count.
    const apps = [
      app('2026-03-01', '2026-03-03', 'approved'),
      app('2026-03-01', null, 'submitted'),
      app('2026-03-02', null, 'draft'),
    ];
    const series = activeApplicationsByDay(apps, BOUNDARIES);
    expect(series[series.length - 1]).toBe(liveActiveCount(apps));
  });

  it('counts a cancelled application until the day it was cancelled', () => {
    // `cancelled` used to fall through `NOT IN (approved, declined)` and be
    // counted as active — on the dashboard headline as well as here — because
    // the status was not in the ApplicationStatus union and no list of closed
    // statuses mentioned it. It closes an application, and `cancelledAt` says
    // when, so it behaves exactly like a decision.
    const apps = [app('2026-03-01', null, 'cancelled', '2026-03-03')];
    const series = activeApplicationsByDay(apps, BOUNDARIES);
    expect(series).toEqual([1, 1, 0, 0]);
    expect(series[series.length - 1]).toBe(liveActiveCount(apps));
  });

  it('excludes a cancelled application that predates the timestamp', () => {
    // Rows cancelled before `cancelledAt` existed carry no time, so they
    // cannot be placed — the same rule as a decided application with no
    // decision date. The headline excludes them too, so the last point still
    // agrees. No such row exists today.
    const apps = [app('2026-03-01', null, 'cancelled')];
    const series = activeApplicationsByDay(apps, BOUNDARIES);
    expect(series).toEqual([0, 0, 0, 0]);
    expect(series[series.length - 1]).toBe(liveActiveCount(apps));
  });

  it('excludes a decided application that cannot be placed in time', () => {
    // Terminal with no decision date: we know it left the active set, not
    // when. Counting it would put it somewhere it may not have been; the
    // headline excludes it too, so the last point still agrees.
    const apps = [app('2026-03-01', null, 'approved')];
    const series = activeApplicationsByDay(apps, BOUNDARIES);
    expect(series).toEqual([0, 0, 0, 0]);
    expect(series[series.length - 1]).toBe(liveActiveCount(apps));
  });

  it('counts a reopened application throughout, as the headline does', () => {
    // Decided, then moved back to reconsideration. Its current status is not
    // terminal, so the headline counts it; a series that disagreed with the
    // number above it would be worse than one imprecise about its past.
    const apps = [app('2026-03-01', '2026-03-02', 'reconsideration')];
    const series = activeApplicationsByDay(apps, BOUNDARIES);
    expect(series).toEqual([1, 1, 1, 1]);
    expect(series[series.length - 1]).toBe(liveActiveCount(apps));
  });

  it('is all zeroes rather than empty when nothing exists yet', () => {
    expect(activeApplicationsByDay([], BOUNDARIES)).toEqual([0, 0, 0, 0]);
  });
});
