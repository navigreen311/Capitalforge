// ============================================================
// check-service-tenancy.ts
//
// Fails when a SERVICE method queries on a business id and the same `where`
// does not name a tenant.
//
// WHY THIS EXISTS
//
//   `check-route-tenancy` reads route files. `requireOwnedBusiness` verifies
//   `req.params`. Between them sits a shape neither can see:
//
//     a business id arrives in a request BODY
//       -> is passed to a SERVICE method
//         -> the service runs `where: { businessId }` with no tenant filter
//
//   That is how POST /api/complaints returned an ACH authorisation and fifty
//   debit events — processor, amounts, timestamps, flag reasons — for any
//   business in any tenant, to any authenticated caller who could produce an
//   id. It was the eleventh unscoped read found in this codebase and the first
//   returning bank debit history. The mount guard could not see it because the
//   id was never in a path; check-route-tenancy could not see it because the
//   `where` was in a service.
//
// WHAT IT DOES NOT DO
//
//   It cannot tell a method called with an already-verified id from one called
//   with whatever arrived. Both look identical here. What it converts is an
//   invisible risk into a reviewed list — the same trade the other three
//   guards make, and the reason each has allowlists with reasons rather than
//   a clean bill of health.
//
//   It does not follow a variable from a route into a service. That was
//   considered and rejected: cross-file symbol resolution is materially harder
//   than anything these scripts already do, and the history of these scripts
//   is five parser bugs, each a regex meeting a slightly harder input. Five is
//   evidence about the sixth.
//
// REPORTING ONLY, FOR NOW
//
//   This exits 0 and prints. Twenty-two findings is a list to triage, not a
//   build to break, and a guard that fails on day one before anyone has read
//   its output teaches people to bypass it. It becomes a failure once the two
//   allowlists below are populated — the same sequence check-test-claims
//   followed, which started with thirty recorded rows.
//
// THE EXEMPTION RULE — THIS HAS BITTEN THREE TIMES
//
//   An exemption tested against an EXPANDED scope gets weaker every time
//   something is added to that scope. All the checks in scripts/ have been
//   caught by it: a 501 in one of sixteen templates exempting the whole
//   endpoint, one `await getConsentService()` exempting sixteen generators, a
//   comment satisfying the ownership marker, a fixture `.map()` counting as a
//   cardinality assertion.
//
//   TWO RULES THAT FOLLOW, and this script obeys both:
//
//     1. JUDGE PER UNIT, NOT PER FILE. Each method is evaluated on its own
//        body and each allowlist key names one method.
//     2. READ MASKED SOURCE. A marker in a comment is not a fact about the
//        code.
// ============================================================

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, sep } from 'path';
import { blankComments, matchBrace, lineAt } from './lib/source-scan.js';

const SERVICES_DIR = join('src', 'backend', 'services');

/** Field names in a `where` that mean "this row belongs to a business". */
const BIZ_FIELD = /\b(businessId|business_id|clientId|client_id)\b/;

/** A tenant reached directly, or through a relation. */
const NAMES_TENANT = /\btenantId\b/;

/** `async name(`, `name(`, `function name(`, `export function name(`. */
const METHOD =
  /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>(]*>)?\s*\(/g;

interface Finding {
  readonly file: string;
  readonly method: string;
  readonly line: number;
  readonly model: string;
  readonly sample: string;
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .map((e) => join(dir, e))
    .filter((p) => !statSync(p).isDirectory() && p.endsWith('.ts'));
}

/** The method a character offset falls inside, by scanning backwards. */
function enclosingMethod(mask: string, index: number): string {
  METHOD.lastIndex = 0;
  let name = '(top level)';
  let m: RegExpExecArray | null;
  while ((m = METHOD.exec(mask)) !== null) {
    if (m.index > index) break;
    // Skip control keywords that look like calls.
    if (!['if', 'for', 'while', 'switch', 'catch', 'return'].includes(m[1]!)) {
      name = m[1]!;
    }
  }
  return name;
}

/** The Prisma model a `where` belongs to: `prisma.<model>.findMany({ where`. */
function modelBefore(mask: string, whereIndex: number): string {
  const window = mask.slice(Math.max(0, whereIndex - 200), whereIndex);
  const hits = [...window.matchAll(/\.(\w+)\s*\.\s*(?:findMany|findFirst|findUnique|count|update|updateMany|delete|deleteMany|aggregate|groupBy)\s*\(/g)];
  return hits.length > 0 ? hits[hits.length - 1]![1]! : '(unknown)';
}

function scan(): Finding[] {
  const out: Finding[] = [];

  for (const path of walk(SERVICES_DIR)) {
    const src = readFileSync(path, 'utf8');
    const mask = blankComments(src);
    const rel = path.split(sep).join('/');

    for (const w of mask.matchAll(/\bwhere\s*:\s*\{/g)) {
      const open = mask.indexOf('{', w.index! + w[0].length - 1);
      if (open === -1) continue;
      const clause = mask.slice(open, matchBrace(mask, open) + 1);

      if (!BIZ_FIELD.test(clause)) continue;
      if (NAMES_TENANT.test(clause)) continue;

      out.push({
        file: rel,
        method: enclosingMethod(mask, w.index!),
        line: lineAt(src, w.index!),
        model: modelBefore(mask, w.index!),
        sample: clause.replace(/\s+/g, ' ').trim().slice(0, 110),
      });
    }
  }

  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ── Recorded, with reasons ────────────────────────────────────
//
// `file::method` — one entry per method, never per file. Remove an entry when
// it is fixed; a stale one will fail once this script is enforcing.

/** Real. Each queries on a business id that nothing here ties to a tenant. */
const KNOWN_UNSCOPED = new Set<string>([]);

/**
 * Reviewed and sound: the method is only ever called with a business id the
 * caller has already verified against the tenant, and the entry says where
 * that verification happens.
 *
 * An entry here is a claim about every caller, not about this method.
 */
const VERIFIED_BY_CALLER = new Set<string>([]);

const ALLOWED = new Set([...KNOWN_UNSCOPED, ...VERIFIED_BY_CALLER]);

const found = scan();
const key = (f: Finding) => `${f.file}::${f.method}`;
const fresh = found.filter((f) => !ALLOWED.has(key(f)));

console.log(
  `check-service-tenancy: ${found.length} where-clause(s) name a business id `
  + `without a tenant, across ${new Set(found.map((f) => key(f))).size} method(s).`,
);
console.log('REPORTING ONLY — this does not fail the build yet.\n');

let lastFile = '';
for (const f of fresh) {
  if (f.file !== lastFile) {
    console.log(`  ${f.file}`);
    lastFile = f.file;
  }
  console.log(`    ${f.method}  (line ${f.line}, ${f.model})`);
  console.log(`      ${f.sample}`);
}

console.log(
  '\nEach is a method that reads on a business id. It may be correct — the'
  + '\ncaller may have verified the id already — but nothing here says so.'
  + '\nTriage into KNOWN_UNSCOPED or VERIFIED_BY_CALLER with a reason, then'
  + '\nmake this script exit non-zero on a fresh finding.',
);

process.exit(0);
