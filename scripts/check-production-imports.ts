// ============================================================
// check-production-imports.ts
//
// Fails if runtime code imports a package that will not be present
// in the production image.
//
// The production stage of the Dockerfile installs with
// `npm ci --omit=dev`, so only `dependencies` are on disk. Anything
// reachable in development solely because it is a devDependency — or
// solely because it is a transitive dependency of one — is absent
// there. CI installs with a plain `npm ci`, which includes
// devDependencies, so CI cannot notice the difference on its own.
// That gap is what this script closes.
//
// It found `require('js-yaml')` in openapi.routes.ts. js-yaml was
// declared nowhere in package.json and reached the dev tree only as a
// transitive dependency of eslint, a devDependency. Every test and
// every CI job passed, and the route was broken in production the
// whole time.
//
// Type-only imports are deliberately ignored. `import type { ParsedQs }
// from 'qs'` is erased before the code runs, so it cannot fail at
// runtime no matter where qs comes from. Counting those produces noise
// that trains people to ignore the check, which is worse than not
// having one.
// ============================================================

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, sep } from 'path';
import { builtinModules } from 'module';

interface Violation {
  readonly specifier: string;
  readonly file: string;
  readonly line: number;
  readonly reason: 'devDependency' | 'transitive only' | 'not installed';
}

/** Roots holding code that runs in production. */
const ROOTS = ['src/backend', 'src/frontend', 'scripts'] as const;

const SKIP_DIRS = new Set(['node_modules', '.next', '.next-prod', 'dist', 'build', 'coverage']);

/**
 * tsconfig path aliases. These look like package specifiers and resolve
 * to files in this repository, so they are neither installed nor
 * missing — they are simply not packages.
 */
const ALIASES = ['@shared/', '@backend/', '@frontend/', '@/'] as const;

const BUILTINS = new Set(builtinModules);

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

/**
 * Strip comments and string literals before scanning.
 *
 * Without this, prose wins. An earlier version of this scan matched the
 * words `different from 'nothing to measure'` in a comment and reported
 * a package named "nothing to measure". A checker that reports things
 * that are not true gets switched off.
 */
function stripNonCode(src: string): string {
  // Replace with spaces rather than deleting, so line numbers survive.
  const blank = (m: string): string => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + blank(m.slice(p1.length)))
    .replace(/`(?:\\.|[^`\\])*`/g, blank);
}

/** The package name a specifier resolves to, or null if it is not a package. */
function packageOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('#')) return null;
  if (ALIASES.some((a) => specifier.startsWith(a))) return null;
  if (specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (name === undefined || name === '') return null;
  if (BUILTINS.has(name)) return null;
  return name;
}

function scan(file: string, prod: Set<string>, dev: Set<string>): Violation[] {
  const src = stripNonCode(readFileSync(file, 'utf-8'));
  const found: Violation[] = [];

  // Four runtime forms. `import type` and `export type` are excluded by
  // the negative lookahead: they are erased and cannot fail at runtime.
  //
  // The bare side-effect form is listed separately because it has no
  // `from` clause. Leaving it out was this script's own first bug: a
  // planted `import 'totally-not-a-real-package'` went unreported, and
  // the only reason that surfaced is that the planted-violation test
  // asked whether the checker actually catches things rather than
  // assuming a clean run meant clean code.
  const patterns: RegExp[] = [
    /^[ \t]*import[ \t]*['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm,
    /^[ \t]*(?:import|export)(?![ \t]+type[ \t])[\s\S]{0,300}?from[ \t]*['"]([^'"]+)['"]/gm,
    /(?:^|[^\w.$])require\([ \t]*['"]([^'"]+)['"][ \t]*\)/g,
    /(?:^|[^\w.$])import\([ \t]*['"]([^'"]+)['"][ \t]*\)/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const specifier = m[1];
      if (specifier === undefined) continue;

      // A named type import inside a value import — `import { type X }` —
      // is still a runtime import statement, so it is not skipped here.
      const name = packageOf(specifier);
      if (name === null || prod.has(name)) continue;

      const reason: Violation['reason'] = dev.has(name)
        ? 'devDependency'
        : existsSync(join('node_modules', ...name.split('/')))
          ? 'transitive only'
          : 'not installed';

      found.push({
        specifier,
        file: file.split(sep).join('/'),
        line: src.slice(0, m.index).split('\n').length,
        reason,
      });
    }
  }
  return found;
}

function main(): void {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const prod = new Set(Object.keys(pkg.dependencies ?? {}));
  const dev = new Set(Object.keys(pkg.devDependencies ?? {}));

  const files = ROOTS.flatMap(sourceFiles);
  const violations = files.flatMap((f) => scan(f, prod, dev));

  // Always say how much was looked at. A check that reports nothing has
  // either found nothing or not run, and those are different results.
  console.log(
    `Scanned ${String(files.length)} files under ${ROOTS.join(', ')} ` +
      `against ${String(prod.size)} production dependencies.`,
  );

  if (files.length === 0) {
    console.error('\nFAIL: no source files were scanned. The roots are wrong, not the code.');
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log('No runtime import depends on a package missing from production.');
    return;
  }

  console.error(`\nFAIL: ${String(violations.length)} runtime import(s) unavailable in production:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${String(v.line)}`);
    console.error(`    imports "${v.specifier}" — ${v.reason}`);
  }
  console.error(
    '\nThe production image installs with `npm ci --omit=dev`. Add the package to\n' +
      '"dependencies", or stop importing it at runtime.\n',
  );
  process.exit(1);
}

main();
