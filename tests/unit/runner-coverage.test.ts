// ============================================================
// Every test file is run by something
//
// `tests/e2e` held six flow suites and 81 assertions, and no CI job ran them.
// There is a `test:e2e` script; the workflow called `test:unit`,
// `test:integration` and `test:playwright`, and never that one. The files were
// maintained-looking, they passed when finally run, and nothing would have
// said otherwise if they had stopped.
//
// That is the same failure this repository keeps finding, one level up: a
// check that reports nothing has either found nothing or not run, and those
// are not the same result. A suite nobody executes reports nothing forever.
//
// So this asserts the mapping rather than the count — a new directory under
// `tests/` fails here until a runner claims it and CI calls that runner.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const TESTS = join(ROOT, 'tests');

/**
 * Directories directly under `tests/` that actually contain test files.
 *
 * Scoped this way after the first run of this file flagged `tests/fixtures`
 * (mocks and sample data) and `tests/performance` (k6 scenarios, driven by a
 * different tool entirely). Neither holds a `.test.ts` or `.spec.ts`, so
 * neither needs a vitest or Playwright runner, and demanding one would have
 * made this assertion noise inside a week.
 */
function testDirectories(): string[] {
  return readdirSync(TESTS)
    .filter((entry) => statSync(join(TESTS, entry)).isDirectory())
    .filter((entry) => testFilesUnder(join(TESTS, entry)).length > 0);
}

/** Test files anywhere beneath a directory. */
function testFilesUnder(dir: string): string[] {
  const found: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) found.push(full);
    }
  };
  walk(dir);
  return found;
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

/** The npm scripts CI actually invokes. */
function scriptsRunByCi(): string[] {
  return [...workflow.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]!);
}

describe('every test directory has a runner', () => {
  const dirs = testDirectories();

  it('finds the directories at all, so an empty pass is not possible', () => {
    // Without this the loop below vacuously passes if the walk breaks — the
    // shape that put this file here in the first place.
    expect(dirs.length).toBeGreaterThanOrEqual(3);
  });

  it.each(dirs)('tests/%s is named by some npm script', (dir) => {
    // A directory is covered when a script mentions it, or when it is the
    // Playwright testDir. Both are how a runner is pointed at files.
    const scripts = Object.values(pkg.scripts).join(' ');
    const playwrightConfig = readFileSync(join(ROOT, 'playwright.config.ts'), 'utf8');

    const named =
      scripts.includes(`tests/${dir}`) || playwrightConfig.includes(`tests/${dir}`);

    expect(named, `tests/${dir} is not referenced by any runner`).toBe(true);
  });

  it.each(dirs)('tests/%s is reached by a script CI actually calls', (dir) => {
    // The half that was missing. `test:e2e` existed and pointed at
    // tests/e2e; the workflow simply never called it, so the script's
    // existence proved nothing.
    const ciScripts = scriptsRunByCi();
    const bodies = ciScripts.map((s) => pkg.scripts[s] ?? '').join(' ');

    const reached =
      bodies.includes(`tests/${dir}`)
      // Playwright is invoked through its own config rather than a path.
      || (dir === 'e2e-playwright' && workflow.includes('playwright'));

    expect(reached, `no CI-invoked script runs tests/${dir}`).toBe(true);
  });
});

describe('no test file sits outside a covered directory', () => {
  it('accounts for every .test.ts and .spec.ts under tests/', () => {
    const total = testFilesUnder(TESTS).length;
    const perDir = testDirectories().reduce(
      (sum, d) => sum + testFilesUnder(join(TESTS, d)).length,
      0,
    );
    // A file dropped directly into `tests/` belongs to no directory and so is
    // claimed by no runner. The two counts diverging is that happening.
    expect(perDir).toBe(total);
  });
});
