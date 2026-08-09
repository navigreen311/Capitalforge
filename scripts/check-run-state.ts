// ============================================================
// check-run-state.ts — what state is a CI run actually in?
//
//   npm run ci:state -- <runId>
//   npm run ci:state -- --branch <branch>
//
// Prints one of: green | red | pending | unknown
// Exit code:      0     | 1   | 2       | 3
//
// This exists because three separate bugs in throwaway merge scripts each
// reported a state the run was not in, and each one cost real time.
//
//   1. The reader piped `gh` output to `jq`, which is not installed here. Every
//      status came back empty, the caller treated empty as "pending", and it
//      looped until timeout. A green PR sat unmerged for an hour.
//
//   2. A rate-limited API returned 403. The reader had two states, so "could
//      not determine" collapsed into "not green" and aborted a merge on a run
//      that was in fact passing.
//
//   3. A job the docs-only filter deliberately skipped was counted as a
//      failure, because the check was `conclusion !== "success"`. The run's own
//      conclusion was success and the PR was CLEAN. A third-state collapse in
//      the checker, on a codebase whose standing rule is that third states are
//      real states.
//
// So: four states, `skipped` is acceptable, `gh -q` instead of jq, and an
// inability to reach the API is never reported as a failed build.
// ============================================================

import { execFileSync } from 'node:child_process';

export type RunState = 'green' | 'red' | 'pending' | 'unknown';

const EXIT: Record<RunState, number> = { green: 0, red: 1, pending: 2, unknown: 3 };

/**
 * `gh` with its built-in filter. No jq: it is not on PATH in this environment,
 * and a missing binary in a pipeline produces empty output rather than an
 * error, which is how a green run read as pending.
 */
function gh(args: string[]): string | null {
  try {
    return execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // A non-zero exit is a transport or auth failure, not a verdict about the
    // build. The caller decides what to do about not knowing.
    return null;
  }
}

/**
 * `skipped` counts as acceptable.
 *
 * The docs-only filter skips the browser suite on documentation-only pull
 * requests, and a skipped job reports `skipped` — which branch protection
 * accepts and this used to call red.
 */
const ACCEPTABLE = new Set(['success', 'skipped']);

export function runState(runId: string): RunState {
  const status = gh(['run', 'view', runId, '--json', 'status', '-q', '.status']);
  if (status === null || status === '') return 'unknown';
  if (status !== 'completed') return 'pending';

  const conclusion = gh(['run', 'view', runId, '--json', 'conclusion', '-q', '.conclusion']);
  const jobs = gh([
    'run', 'view', runId, '--json', 'jobs',
    '-q', '[.jobs[]|select(.conclusion != null)|.conclusion]|join(",")',
  ]);
  if (conclusion === null || jobs === null) return 'unknown';

  const unacceptable = jobs
    .split(',')
    .filter((c) => c !== '')
    .filter((c) => !ACCEPTABLE.has(c));

  return conclusion === 'success' && unacceptable.length === 0 ? 'green' : 'red';
}

/** The most recent run for a branch, or null if none exists. */
export function latestRunFor(branch: string): string | null {
  const id = gh(['run', 'list', '-b', branch, '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId']);
  return id === null || id === '' ? null : id;
}

function main(): void {
  const args = process.argv.slice(2);
  let runId: string | null;

  if (args[0] === '--branch') {
    const branch = args[1];
    if (branch === undefined) {
      console.error('Usage: check-run-state --branch <branch>');
      process.exit(3);
    }
    runId = latestRunFor(branch);
    if (runId === null) {
      // Distinct from a failure, and worth saying out loud: a pull request
      // based on another branch gets no run at all until it is retargeted,
      // which is how one reached a merge attempt having never been tested.
      console.log('unknown');
      console.error(`No run found for branch "${branch}". That is not the same as a failing run.`);
      process.exit(EXIT.unknown);
    }
  } else {
    runId = args[0] ?? null;
    if (runId === null) {
      console.error('Usage: check-run-state <runId> | --branch <branch>');
      process.exit(3);
    }
  }

  const state = runState(runId);
  console.log(state);

  if (state === 'red') {
    const jobs = gh(['run', 'view', runId, '--json', 'jobs', '-q', '.jobs[]|"  \\(.name)\\t\\(.conclusion // "-")"']);
    if (jobs !== null) console.error(jobs);
  }

  process.exit(EXIT[state]);
}

// Only when run directly, so the exported functions can be imported by a test.
if (process.argv[1] !== undefined && process.argv[1].includes('check-run-state')) {
  main();
}
