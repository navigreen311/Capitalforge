import { defineConfig } from '@playwright/test';

// ============================================================
// Playwright configuration
//
// The port is deliberately not 3000. This config used to point at
// localhost:3000 with reuseExistingServer, and on a machine already running a
// different app there, Playwright attached to that app instead of starting
// this one: `npm run dev` failed with EADDRINUSE, the reuse path swallowed it,
// and the whole suite ran against a stranger. The visible symptom was a 404 on
// a page that exists, which reads as a broken route rather than a wrong
// server.
//
// So: a dedicated default port, and a global setup that refuses to run unless
// what is listening is actually CapitalForge.
//
// Override with E2E_PORT when 3100 is taken.
// ============================================================

const PORT = process.env.E2E_PORT ?? '3100';

// 127.0.0.1 rather than localhost: on Windows, localhost may resolve to ::1
// first while the dev server binds IPv4, which fails as a connection refusal.
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e-playwright',
  /**
   * 60s per test, against assertions that wait up to 30s.
   *
   * This was 30s, the same as the longest wait inside the tests — 66
   * assertions across the suite pass { timeout: 30000 }, the idiom for
   * anything that has to survive a cold dev server. An assertion that is
   * allowed to wait as long as the whole test can never reach its own
   * deadline: every second spent navigating, filling and clicking before it
   * comes out of its budget, and when the budget runs out Playwright reports
   * a test timeout naming whichever assertion was pending, with no message
   * about what was actually on the page.
   *
   * That is the shape of a failure seen once in this suite —
   * comm-compliance's server-side scan, on a run against freshly started dev
   * servers — which has not reproduced since, over repeated full runs, a
   * cold-start run and 12 repeats of the file on its own. Doubling the budget
   * does not prove that failure fixed; it makes the two numbers mean
   * different things, so the next occurrence reports what it saw.
   */
  timeout: 60000,
  /**
   * One worker.
   *
   * Both servers under test are development servers — tsx for the API, Next
   * compiling routes on demand — and they are the bottleneck, not the browser.
   * Three workers made the API return 500s under load, which surfaced as data
   * setup "failing" in whichever spec happened to be running: a real-looking
   * failure with no real cause.
   *
   * It costs little. The full suite runs in about 3 minutes serially against
   * 2.6 minutes across three workers, because the contention was wasting most
   * of what the parallelism gained.
   */
  workers: 1,
  globalSetup: './tests/e2e-playwright/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    headless: true,
    /**
     * A trace for anything that fails.
     *
     * The intermittent above was lost because the only artifact was an
     * error-context.md, and re-running the spec to investigate overwrote it.
     * A trace survives that and carries the network log, so a failure that
     * happens once in twenty runs is still diagnosable afterwards.
     */
    trace: 'retain-on-failure',
  },
  // Two entries rather than one `npm run dev`, for two reasons.
  //
  // PORT is read by both processes: the backend defaults to 4000 from the same
  // variable. Setting it on the combined command pointed the backend at the
  // frontend's port, where it collided and never came up — so every test that
  // signed in failed while the static ones passed.
  //
  // And Playwright waits for each entry's port before starting, so declaring
  // the backend separately means the suite no longer races its startup.
  webServer: [
    {
      command: 'npm run dev:backend',
      port: 4000,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // dev:frontend no longer hardcodes -p, so next dev takes PORT from here.
      command: 'npm run dev:frontend',
      env: { ...process.env, PORT },
      port: Number(PORT),
      // Reusing a running dev server is a local convenience; CI always starts
      // clean. The identity check in globalSetup covers the case where the
      // reused server belongs to something else entirely.
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
