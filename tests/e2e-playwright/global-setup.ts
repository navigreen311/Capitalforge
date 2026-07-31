// ============================================================
// Refuses to run the browser suite against the wrong application.
//
// Playwright's reuseExistingServer attaches to whatever is already listening
// on the configured port. If that is a different app — another project's dev
// server on the same port — the suite runs happily against it and reports
// ordinary-looking failures: pages "missing", elements "not found". The cause
// is invisible from the output, and a passing run would be worse still.
//
// So before any test runs, check that what answered is CapitalForge, and fail
// with a message that names the problem if it is not.
// ============================================================

import type { FullConfig } from '@playwright/test';

const APP_MARKER = 'CapitalForge';
/** Frontend: Playwright already waited for its port, so it answers quickly. */
const PAGE_ATTEMPTS = 30;

/**
 * API: the backend runs under tsx and compiles on start, which routinely takes
 * longer than the frontend. Playwright's webServer does not wait for it at all,
 * so this budget has to cover a cold compile rather than a warm restart.
 */
const API_ATTEMPTS = 120;
const DELAY_MS = 1_000;

async function fetchPage(url: string): Promise<{ status: number; body: string } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    return { status: res.status, body: await res.text() };
  } catch {
    // Server not up yet, or not up at all.
    return null;
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;

  if (!baseURL) {
    throw new Error('No baseURL configured; cannot verify the server under test.');
  }

  // /login renders without a session, so it is a safe identity probe.
  const target = new URL('/login', baseURL).toString();

  let last: { status: number; body: string } | null = null;

  for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt++) {
    last = await fetchPage(target);
    if (last !== null && last.status < 500) break;
    if (attempt < PAGE_ATTEMPTS) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  if (last === null) {
    throw new Error(
      `Nothing is answering at ${baseURL}.\n` +
        `The dev server did not start, or it bound a different port.\n` +
        `Set E2E_PORT to a free port and try again.`,
    );
  }

  if (!last.body.includes(APP_MARKER)) {
    // The failure this guard exists for: something answered, but not us.
    const title = /<title>([^<]*)<\/title>/i.exec(last.body)?.[1]?.trim() ?? '(no title)';
    throw new Error(
      `${baseURL} is serving a different application — refusing to run.\n` +
        `  Expected a page mentioning "${APP_MARKER}".\n` +
        `  Got: "${title}" (HTTP ${last.status}).\n\n` +
        `Something else already occupies that port, and reuseExistingServer\n` +
        `attached to it instead of starting this project. Stop that server, or\n` +
        `run with E2E_PORT set to a free port:\n\n` +
        `  E2E_PORT=3101 npm run test:playwright\n`,
    );
  }

  // Playwright's webServer only waits for the frontend port to open. The
  // backend starts alongside it under `npm run dev` and takes longer, so
  // without this the first tests race it: anything that signs in fails while
  // the static ones pass, which looks like broken auth rather than a cold API.
  //
  // Probed through the frontend's /api proxy, so a misconfigured rewrite fails
  // here too rather than as a mystery 500 mid-test.
  const health = new URL('/api/health', baseURL).toString();

  for (let attempt = 1; attempt <= API_ATTEMPTS; attempt++) {
    const res = await fetchPage(health);
    if (res !== null && res.status === 200) return;

    if (attempt === API_ATTEMPTS) {
      throw new Error(
        `The API never became ready at ${health}.\n` +
          `  Last response: ${res === null ? 'no connection' : `HTTP ${res.status}`}\n\n` +
          `The frontend is up, so either the backend failed to start or the\n` +
          `/api rewrite in src/frontend/next.config.js points somewhere else.\n` +
          `Check that \`npm run dev:backend\` starts cleanly on port 4000.`,
      );
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}
