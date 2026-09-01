// ============================================================
// check-test-claims.ts
//
// Fails when a test's NAME claims plurality and its BODY cannot tell
// one from many.
//
// The shape it catches, from the consent suite:
//
//   it('publishes consent.revoked event for each revoked record', ...)
//     -> granted ONE record, asserted toHaveBeenCalledWith
//
// `toHaveBeenCalledWith` is "at least once with". With a single record
// in the fixture, a publish OUTSIDE the loop satisfies a test whose name
// is "for each". The test passed for as long as it existed and proved
// nothing about the loop it was named for.
//
// The same shape was then found in twelve more places, including
// `publishes KYC_VERIFIED when all beneficial owners are verified`,
// which sets up one owner — so a service that published on the FIRST
// verified owner would pass. See docs/OVERSTATED_TESTS.md.
//
// WHAT IT DOES NOT CATCH
//
//   This is one of three shapes in that inventory and the only one with
//   a mechanical signature. It cannot see an assertion that is true of
//   both the passing and the failing case, and it cannot see evidence
//   planted in a fixture and never asserted on. Those were found by
//   reading and will keep being found by reading. A green run here means
//   the cardinality shape did not grow; it does not mean the suite is
//   honest.
//
// WHY AN ALLOWLIST RATHER THAN A COUNT
//
//   A budget of "no more than 20" is satisfied by fixing one and adding
//   another. The allowlist is keyed by file and test name, so a new
//   violation fails even while the known ones stand. An entry that no
//   longer matches also fails, which keeps the list and the inventory
//   from drifting apart as they get fixed.
// ============================================================

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, sep } from 'path';

// Paths relative to the package root, as check-production-imports.ts does:
// `npm run` sets the cwd there, and `import.meta.dirname` is not available in
// a file that also has to type-check under the CommonJS tsconfig.
const TESTS = 'tests';

/**
 * A name that promises more than one of something.
 *
 * Exactly these three. `every` and `both` were tried and withdrawn: in this
 * codebase they usually quantify over distinct named things rather than over a
 * collection — "returns allPassed = true when every gate passes" mocks five
 * different gates one at a time, and "false when both enabled and verified" is
 * two booleans on a single card. Flagging those is the noise that trains people
 * to ignore a check.
 */
const PLURAL_CLAIM = /\b(each|all|complete)\b/i;

/**
 * Something in the body that could fail if the code handled only the
 * first item — a count, a per-item loop, or a multi-element expectation.
 */
const COUNT_ASSERTIONS = [
  /toHaveLength\(\s*([2-9]|\d\d+)/,
  /toHaveBeenCalledTimes\(\s*([2-9]|\d\d+)/,
  /\.length\s*\)\s*\.toBe\(\s*([2-9]|\d\d+)/,
  /\btotal:\s*([2-9]|\d\d+)/,
  /toEqual\(\s*\{[^}]*:\s*[2-9]/,
  /toMatchObject\(\s*\{[^}]*:\s*[2-9]/,
  // A count compared against another collection's length rather than a literal:
  // `expect(sub.events.length).toBe(ALL_EVENT_TYPES.length)` is a stronger
  // cardinality assertion than any number, because it cannot drift.
  /\.length\s*\)\s*\.toBe\([^)]*\.length/,
  /arrayContaining\(/,
];

/**
 * Iteration proves a count only where the assertion is.
 *
 * These were in the list above and tested against the whole body, where they
 * mean almost nothing: `.map(` and `.filter(` build fixtures far more often
 * than they assert, and a `for (const …)` is as likely to be arranging a store
 * as checking one. A one-element `['a'].map(x => x)` in setup exempted a test
 * named "for each revoked record" whose only assertion was on `store[0]`.
 */
const ITERATION_IN_ASSERTION = [
  /\bfor\s*\(\s*const\b/,
  /\.forEach\(/,
  /\.every\(/,
  /\.filter\(/,
  /\.map\(/,
];

/**
 * The text of every `expect(...)` in a body, plus the loops that wrap them.
 *
 * A `for (const x of xs) expect(...)` is a per-item assertion and should count,
 * so a loop is included when an `expect(` appears within it.
 */
function assertionText(maskBody: string): string {
  const parts: string[] = [];
  for (const m of maskBody.matchAll(/\bexpect\s*\(/g)) {
    parts.push(maskBody.slice(m.index, m.index + 400));
  }
  for (const m of maskBody.matchAll(/\bfor\s*\(\s*const[\s\S]{0,200}?\{/g)) {
    const seg = maskBody.slice(m.index, m.index + 500);
    if (seg.includes('expect(')) parts.push(seg);
  }
  return parts.join('\n');
}

/**
 * Where a fixture array starts: handed to a mock, bound to a name, or given as
 * a property of a fixture object — `makeMockBusiness({ owners: [...] })`, which
 * an earlier version missed entirely, so a one-owner "all beneficial owners"
 * test went undetected while sitting in the allowlist.
 *
 * The END is found by matching brackets, not by a lazy regex. `\[([\s\S]*?)\]`
 * stops at the first `]` it meets, which inside a rule fixture is the one
 * closing an inner `conditions: [...]` — a two-rule array counted as one and
 * the check reported a violation against a test that was fine.
 */
const FIXTURE_ARRAY_START =
  /(?:mockResolvedValue(?:Once)?|mockReturnValue(?:Once)?|resolves\.toEqual|\b\w+:|=)\s*\(?\s*\[/g;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly why: string;
}

/**
 * Blank out string, template, regex and comment CONTENT, preserving offsets.
 *
 * Without this, a regex literal containing `}` ends a test block early and the
 * rest of the test reads as if it asserted nothing. Two phantom violations came
 * from exactly that before this existed.
 */
function blank(src: string): string {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
      for (let k = i + 1; k < Math.min(j, n); k++) out[k] = ' ';
      i = j + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      for (let k = i; k < j; k++) out[k] = ' ';
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i);
      j = j === -1 ? n : j + 2;
      for (let k = i; k < j; k++) out[k] = ' ';
      i = j;
      continue;
    }
    if (c === '/') {
      const before = src.slice(Math.max(0, i - 40), i).trimEnd();
      const prev = before.at(-1);
      if (prev && '(,=:[!&|?{;+'.includes(prev)) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          if (src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          else if (src[j] === '\n') break;
          j++;
        }
        for (let k = i; k < Math.min(j + 1, n); k++) out[k] = ' ';
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return out.join('');
}

const TEST_START = /\b(?:it|test)\s*(?:\.\w+\s*(?:\([\s\S]*?\))?\s*)?\(\s*(['"`])/g;

function* testBlocks(src: string, mask: string) {
  TEST_START.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEST_START.exec(mask)) !== null) {
    const quote = m[1]!;
    const nameStart = m.index + m[0].length;
    const nameEnd = src.indexOf(quote, nameStart);
    if (nameEnd === -1) continue;
    const name = src.slice(nameStart, nameEnd);

    const open = mask.indexOf('{', nameEnd);
    if (open === -1) continue;
    let depth = 0;
    let j = open;
    for (; j < mask.length; j++) {
      if (mask[j] === '{') depth++;
      else if (mask[j] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = src.slice(open, j + 1);
    const maskBody = mask.slice(open, j + 1);
    const line = src.slice(0, m.index).split('\n').length;
    yield { name, body, maskBody, line };
  }
}

/** Element count of an array literal, by top-level comma at depth 0. */
function elementCount(inner: string): number {
  const trimmed = inner.trim();
  if (trimmed === '') return 0;
  let depth = 0;
  let count = 1;
  for (const ch of trimmed) {
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  // A trailing comma at depth 0 does not introduce an element.
  return trimmed.endsWith(',') ? count - 1 : count;
}

/** Element counts of every fixture array in a body, bracket-matched. */
function fixtureArrayCounts(body: string): number[] {
  const counts: number[] = [];
  FIXTURE_ARRAY_START.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FIXTURE_ARRAY_START.exec(body)) !== null) {
    const open = body.indexOf('[', m.index);
    if (open === -1) continue;
    let depth = 0;
    let j = open;
    for (; j < body.length; j++) {
      const ch = body[j]!;
      if ('[{('.includes(ch)) depth++;
      else if (']})'.includes(ch)) {
        depth--;
        if (depth === 0) break;
      }
    }
    counts.push(elementCount(body.slice(open + 1, j)));
    FIXTURE_ARRAY_START.lastIndex = j;
  }
  return counts;
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === 'node_modules') continue;
      found.push(...walk(p));
    } else if (entry.endsWith('.test.ts')) {
      found.push(p);
    }
  }
  return found;
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(TESTS)) {
    const src = readFileSync(file, 'utf8');
    const mask = blank(src);
    const rel = file.split(sep).join("/");

    for (const { name, body, maskBody, line } of testBlocks(src, mask)) {
      if (!PLURAL_CLAIM.test(name)) continue;
      if (!maskBody.includes('expect(')) continue;
      // Masked, and only inside assertions.
      //
      // Two widenings, both found by writing the bad test and watching this
      // pass. `body` is source, so a COMMENT containing "for (" or ".map(" was
      // proof of cardinality. And `.map(`, `.filter(` and `.forEach(` are far
      // more often fixture construction than assertion — `['a'].map(x => x)`
      // while building a store exempted a test named "for each revoked record"
      // whose only assertion was `expect(store[0].id).toBe('a')`.
      //
      // Iteration proves a count only where the assertion is. `toHaveLength(2)`
      // and `toHaveBeenCalledTimes(2)` are self-evidently assertions and are
      // checked against the whole masked body; the iteration patterns are
      // checked only inside `expect(...)`.
      const assertions = assertionText(maskBody);
      const provenByCount = COUNT_ASSERTIONS.some((re) => re.test(maskBody));
      const provenByIteration = ITERATION_IN_ASSERTION.some((re) => re.test(assertions));
      if (provenByCount || provenByIteration) continue;

      // Only flag when a fixture is visibly single-item. A test with no
      // array fixture at all may be claiming plurality about something
      // this check cannot see, and guessing there produces the noise that
      // trains people to ignore a check.
      const arrays = fixtureArrayCounts(body);
      if (arrays.length === 0) continue;
      if (arrays.some((n) => n > 1)) continue;
      // An all-empty fixture is not the shape. "no recent apps at all" and
      // "configured only when all three are present" both set up `[]`, and in
      // neither is the array the thing the name quantifies over.
      if (!arrays.some((n) => n === 1)) continue;

      violations.push({
        file: rel,
        line,
        name,
        why: `name claims "${name.match(PLURAL_CLAIM)![0]}" and every fixture array holds ${Math.max(0, ...arrays)} item(s), with nothing asserting a count`,
      });
    }
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ── Known, recorded in docs/OVERSTATED_TESTS.md ───────────────
//
// `file::name`. Remove an entry when the test is fixed — a stale entry
// fails this check, so the list cannot quietly outlive the problem.

/**
 * Confirmed: the name claims more than the body checks. Each has a row in
 * docs/OVERSTATED_TESTS.md. Delete from here when fixed — a stale entry fails
 * this check, so the list cannot outlive the problem.
 */
const KNOWN_OVERSTATED = new Set<string>([
  'tests/e2e/compliance-flow.test.ts::assembles a complete compliance dossier for a business',
  'tests/e2e/financial-flow.test.ts::generates a year-end fee summary across all cards in the stack',
  'tests/unit/services/ach-controls.test.ts::returns mapped alerts for all flagged debit events',
  'tests/unit/services/ach-controls.test.ts::returns zero violations when all events are clean',
  'tests/unit/services/complaint.test.ts::returns a dossier with all required sections',
  'tests/unit/services/credit-intelligence-gate.test.ts::gates each bureau on its own credential',
  'tests/unit/services/funding-round.test.ts::gives a perfect score when all cards approved at target credit with 0 fees',
  'tests/e2e/funding-flow.test.ts::marks a funding round as completed when all applications close',
  'tests/unit/services/kyb-kyc.test.ts::publishes KYC_VERIFIED when all beneficial owners are verified',
  'tests/unit/services/kyb-kyc.test.ts::returns readyForApplications=true when KYB verified and all beneficial owners KYC verified',
  'tests/unit/services/twilio-integration.test.ts::persists a VoiceCall record for each initiated call',
  // Found 2026-09-01, by narrowing the iteration exemption to assertions. A
  // `.map()` extracting event types from mock calls had been counting as proof
  // of cardinality; the assertion is `toContain('call.initiated')`, which is
  // "at least one" and cannot tell one publish from one per dial. Same file and
  // same shape as the row above it.
  'tests/unit/services/twilio-integration.test.ts::publishes call.initiated event for each successful dial',
]);

/**
 * Reviewed and judged sound: the plural word does not quantify over a
 * collection, so a single-item fixture is not a gap.
 *
 * Kept separate from the list above on purpose. Folding the two together would
 * make the inventory's count meaningless — "23 known problems" has to mean
 * twenty-three problems, not twenty-three regex matches somebody waved through.
 */
const NOT_A_COLLECTION = new Set<string>([
  // "complete profile" is a state of one profile, not a set of them.
  'tests/unit/readiness-score.test.ts::should award full 20 for complete profile',
  // Components are named fields on one score, summed; there is no collection.
  'tests/unit/readiness-score.test.ts::should sum all components correctly',
  // "all balances are zero" is a boundary condition on the inputs.
  'tests/unit/services/cost-calculator.test.ts::returns zero percentOfFunding when all balances are zero',
  'tests/unit/services/cost-calculator.test.ts::effectiveApr is null when all balances start at zero',
  // "all" here is the name of a rollout stage, and "complete" a status value.
  'tests/unit/services/governance.test.ts::advanceStage — progresses canary → expanded → all and sets complete',
]);

const ALLOWED = new Set<string>([...KNOWN_OVERSTATED, ...NOT_A_COLLECTION]);

const found = scan();
const key = (v: Violation) => `${v.file}::${v.name}`;

const fresh = found.filter((v) => !ALLOWED.has(key(v)));
const stale = [...ALLOWED].filter((k) => !found.some((v) => key(v) === k));

if (fresh.length === 0 && stale.length === 0) {
  console.log(
    `check-test-claims: no new cardinality-blind tests (${found.length} known, allowlisted).`,
  );
  process.exit(0);
}

if (fresh.length > 0) {
  console.error(
    `\ncheck-test-claims: ${fresh.length} test(s) claim plurality with a single-item fixture:\n`,
  );
  for (const v of fresh) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.name}`);
    console.error(`    ${v.why}\n`);
  }
  console.error(
    'Either make the fixture hold more than one item and assert a count,\n' +
      'or rename the test to what it actually checks. If it is a deliberate\n' +
      'exception, add it to ALLOWED in this file AND to docs/OVERSTATED_TESTS.md.\n',
  );
}

if (stale.length > 0) {
  console.error(`\ncheck-test-claims: ${stale.length} allowlist entr(y/ies) no longer match:\n`);
  for (const k of stale) console.error(`  ${k}`);
  console.error(
    '\nIf you fixed it, delete the entry here and strike the row in\n' +
      'docs/OVERSTATED_TESTS.md. If you renamed the test, update both.\n',
  );
}

process.exit(1);
