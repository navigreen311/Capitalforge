// ============================================================
// check-document-provenance.ts
//
// Fails when a handler that produces a document, export or report contains a
// figure that came from nowhere.
//
// WHY
//
//   Five surfaces have now been found asserting invented figures in a
//   downloadable document:
//
//     rewards export            124,500 Amex points, $3,206.72 total
//     spend-governance evidence 142 transactions, Best Buy $249.99,
//                               Western Union $500.00, "pending review"
//     data lineage              six events with sources, actors, timestamps
//     workflow execution log    runs naming triggers, actions, clients affected
//     tax documents             a 1099-INT with $2,345.67 of interest income
//
//   Three MORE in the same class were fixed before anybody swept — card-benefits,
//   funding-round dossiers, platform reports — each carrying a comment describing
//   what it used to invent. The class was found and fixed three times, each time
//   only in the surface someone was looking at. This is the sweep, run every time.
//
// TWO RULES
//
//   1. PROVENANCE. A handler whose route names export / report / dossier /
//      generate / download, which builds a string or array of strings, and
//      which contains a money-shaped or count-shaped literal, must query
//      something. No prisma call and no service call in the handler means
//      every number in that document was typed here.
//
//   2. PLACEHOLDERS. In a generator reached through a dispatch table, a `??`
//      fallback must render a bracket — `[Client]`, `[X]`, `[not assessed]` —
//      rather than a claim.
//
//      Rule 1 looks for figures, so it could not see the re-stack summary's
//      `payment_rating ?? 'Good'` and `score_trend ?? 'Stable/Improving'`: a
//      caller who supplied nothing got a document rating a client's payment
//      history Good, in a letter that client reads. A fabricated sentence is a
//      fabricated sentence. Adding this rule surfaced thirty-five more across
//      eleven of the sixteen templates — sample identities in letters sent to
//      issuers, asserted state in progress and incident reports, and asserted
//      provenance in a consent confirmation.
//
// IT IS IMPERFECT ON PURPOSE
//
//   It cannot tell a real figure from an invented one; it can only tell whether
//   the handler asked anything. A document assembled from caller-supplied context
//   — document-gen's sixteen templates — legitimately queries nothing, and those
//   are allowlisted with the reason. What it buys is that the SIXTH one fails at
//   authoring time instead of on a sweep.
//
// THE EXEMPTION RULE — THIS HAS BITTEN THREE TIMES
//
//   An exemption tested against an EXPANDED scope gets weaker every time
//   something is added to that scope. All three checks in scripts/ have now
//   been caught by this, each through a different door:
//
//     check-document-provenance   a 501 in one of sixteen templates exempted
//                                 the whole endpoint, un-checking fifteen as a
//                                 side effect of making one honest
//     check-document-provenance   later, one `await getConsentService()` in the
//                                 handler satisfied ASKS_SOMETHING for all
//                                 sixteen generators at once
//     check-route-tenancy         a comment reading "we could use
//                                 businessBelongsToTenant here but have not
//                                 yet" satisfied the ownership-helper test
//     check-test-claims           the same comment-satisfies-marker shape, and
//                                 a fixture `.map()` counted as a cardinality
//                                 assertion
//
//   The pattern is always the same: a marker is looked for in a blob, the blob
//   grows, and the marker's meaning silently widens from "this unit is fine"
//   to "something in here is fine".
//
//   TWO RULES THAT FOLLOW, and this script obeys both:
//
//     1. JUDGE PER UNIT, NOT PER FILE. A test, a handler, a generator — each
//        is evaluated on its own body, and each allowlist key names that unit.
//        A key that names a file or a route lets one entry cover everything
//        inside it, and the count stops meaning anything.
//     2. READ MASKED SOURCE. A marker in a comment is not a fact about the
//        code. Every detection here runs against source with comments blanked.
//
// ============================================================

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, sep } from 'path';

const ROUTES_DIR = join('src', 'backend', 'api', 'routes');

/** A route that hands something back to be saved, printed or filed. */
const DOC_ROUTE = /export|dossier|report|generate|download|\/pdf/i;

const HANDLER = /\b(?:\w*[Rr]outer)\s*\.\s*(get|post|put|patch)\s*\(\s*(['"`])(.*?)\2/g;

/** Anything that reaches storage or a service that might. */
const ASKS_SOMETHING =
  /\b(?:prisma|db|sharedPrisma|tx)\w*\.\w+\.\w+\(|\b\w+(?:Service|Svc|Repo)\.\w+\(|\bawait\s+(?:get|list|load|fetch|build|assemble|export)\w*\(/;

/** Refusals are the honest answer and are exempt. */
const REFUSES = /\b501\b|NOT_IMPLEMENTED|\brefuse\(/;

/**
 * Money- and count-shaped literals: `$249.99`, `124,500`, `142`, `97.2%`.
 *
 * Deliberately not every number. Small bare integers are indices, HTTP codes,
 * slice lengths and column widths, and counting those would bury the signal.
 */
const FIGURE = /\$\s?\d|\b\d{1,3},\d{3}\b|\b\d+\.\d{2}\b|\b\d+(?:\.\d+)?\s?%/;

/** Building prose: a string array joined, or a multi-line template literal. */
const BUILDS_TEXT = /\]\s*\.join\(|`[^`]*\n[^`]*`/;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly method: string;
  readonly route: string;
  /** Set when the figure is inside a dispatched generator rather than the handler. */
  readonly generator?: string;
  readonly sample: string;
}

interface Callee {
  readonly name: string;
  readonly body: string;
  /** Reached through a dispatch table — i.e. a document generator. */
  readonly dispatched: boolean;
}

/** A generator whose missing field renders as a claim rather than a bracket. */
interface DefaultedAssertion {
  readonly file: string;
  readonly generator: string;
  readonly literal: string;
}

function blank(src: string): string {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
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
    i++;
  }
  return out.join('');
}

/**
 * Brace-match, ignoring braces inside strings and template literals.
 *
 * ALWAYS CALL THIS ON THE MASKED SOURCE. It skips from a quote to the next
 * quote, and an apostrophe in an English comment — "the caller's context" — is
 * a quote. Called on raw source, one such apostrophe made the rest of the file
 * a string, so the function body returned ran to the end of the file and every
 * finding in it was attributed to whichever generator happened to be first.
 * That is exactly what happened when this check was extended: ten fields from
 * six different generators were all reported against
 * `generateRestackOpportunitySummary`.
 */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return s.length - 1;
}

/**
 * Bodies of same-file functions the handler calls, one level deep.
 *
 * One level, not transitive: two is enough rope to pull in half the file through
 * a shared formatter, and the fabricated content in every instance found so far
 * sat directly in the function the handler named.
 */
function calleeBodies(src: string, mask: string, body: string): Callee[] {
  const called = new Set<string>();
  /** Reached through a dispatch table, i.e. a document generator. */
  const dispatched = new Set<string>();
  for (const c of body.matchAll(/\b([a-z]\w{3,})\s*\(/g)) called.add(c[1]!);

  // Dispatch tables count as calls.
  //
  // document-gen holds sixteen generators in
  // `const GENERATORS: Record<...> = { decline_reconsideration_letter: generateX, … }`
  // and the handler does `GENERATORS[document_type](ctx)`. Following names alone
  // sees a table lookup and reads none of the sixteen — which left adverse
  // action responses and fee disclosures, the documents where an invented figure
  // matters most, outside this check entirely.
  //
  // So: for every module-level object literal whose values are bare identifiers,
  // if the handler mentions the table by name, treat all of them as called.
  for (const t of mask.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\b/g)) {
    const tableName = t[1]!;
    if (!new RegExp(`\\b${tableName}\\b`).test(body)) continue;

    // Find the `= {` that opens the literal. Not `[^=]*=` — the type annotation
    // `Record<T, (ctx: …) => string>` contains an `=`, so that pattern matched
    // nothing and this whole branch was dead while appearing to work.
    const assign = /=\s*\{/.exec(mask.slice(t.index, t.index + 400));
    if (!assign) continue;
    const open = mask.indexOf('{', t.index + assign.index);
    const table = src.slice(open, matchBrace(mask, open) + 1);
    // Lookahead on the trailing delimiter. Consuming it meant every second
    // entry was skipped — the comma that ended one match was the comma the next
    // one needed to start, so sixteen generators parsed as eight.
    for (const v of table.matchAll(
      /[:,{]\s*(?:\w+|'[^']*'|"[^"]*")\s*:\s*([A-Za-z_]\w*)\s*(?=[,}])/g,
    )) {
      called.add(v[1]!);
      dispatched.add(v[1]!);
    }
  }

  const out: Callee[] = [];
  for (const name of called) {
    // Double-escaped: inside a template literal `\s` collapses to a literal
    // "s", so the pattern became `functions+names*(` and matched nothing.
    const decl = new RegExp(`function\\s+${name}\\s*\\(`).exec(mask);
    if (!decl) continue;
    const open = mask.indexOf('{', decl.index + decl[0].length);
    if (open === -1) continue;
    // Masked slice: comments are blanked, string content is not. Detection must
    // never read a comment — this file's own note explaining that a Business
    // Purpose Statement used to assert $150,000 was itself reported as a
    // fabricated figure, which is the failure the capability-state register
    // warns about: an explanation of the rule counted as an instance of it.
    out.push({
      name,
      body: mask.slice(open, matchBrace(mask, open) + 1),
      dispatched: dispatched.has(name),
    });
  }
  return out;
}

/**
 * A `??` fallback in a document generator that is not a visible placeholder.
 *
 * The convention in these templates is that a missing field renders as
 * `[Client]`, `[credit amount]`, `[X]` — something nobody mistakes for an
 * answer. Two fields in the re-stack summary did not follow it:
 *
 *   payment_rating ?? 'Good'
 *   score_trend    ?? 'Stable/Improving'
 *
 * so a caller who supplied nothing got a document rating a client's payment
 * history Good, in a letter that client reads. Neither is a figure, so the
 * money- and count-shaped detection above could not see them — which is the
 * gap this closes. A fabricated sentence is a fabricated sentence.
 *
 * Deliberately narrow: only generators reached through the dispatch table, and
 * only string fallbacks. A `?? 0`, a `?? null`, a `?? []` is a different
 * question, and `?? ''` renders as nothing rather than as a claim.
 */
const DEFAULTED_ASSERTION = /\?\?\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;

/** `[Client]`, `[X]`, `[not assessed]` — a placeholder, not an assertion. */
function isPlaceholder(literal: string): boolean {
  const t = literal.trim();
  return t === '' || (t.startsWith('[') && t.endsWith(']'));
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .map((e) => join(dir, e))
    .filter((p) => !statSync(p).isDirectory() && p.endsWith('.routes.ts'));
}

function scan(): { figures: Violation[]; assertions: DefaultedAssertion[] } {
  const out: Violation[] = [];
  const assertions: DefaultedAssertion[] = [];
  for (const path of walk(ROUTES_DIR)) {
    const src = readFileSync(path, 'utf8');
    // Comments only: string CONTENT must survive, because the literals being
    // looked for live inside strings.
    const mask = blank(src);
    const rel = path.split(sep).join('/');

    HANDLER.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HANDLER.exec(mask)) !== null) {
      const end = m.index + m[0].length;
      const route = src.slice(end - m[3]!.length - 1, end - 1);
      if (!DOC_ROUTE.test(route)) continue;

      const open = mask.indexOf('{', end);
      if (open === -1) continue;
      const close = matchBrace(mask, open);
      const body = mask.slice(open, close + 1);
      const line = src.slice(0, m.index).split('\n').length;

      // Expand one level into same-file helpers the handler calls.
      //
      // The figures are usually not in the handler. `mockEvents()` was a module
      // function; document-gen's sixteen templates are sixteen functions and the
      // handler only dispatches. A check that reads the handler alone sees a
      // switch statement and passes the exact shape it exists to catch.
      const callees = calleeBodies(src, mask, body);

      // Split, because one query in the handler must not exempt sixteen
      // templates.
      //
      // `ASKS_SOMETHING` was tested against the handler AND every generator
      // joined together. The moment this handler started reading a consent
      // record and a re-stack verdict for two of its documents, `await
      // getConsentService()` satisfied the pattern and the other fourteen
      // stopped being checked — silently, as a side effect of making two of
      // them honest. Exactly the shape the 501 exemption below was already
      // fixed for, arriving a second time through a different door.
      //
      // A dispatched generator is pure by construction: it takes a context and
      // returns a string. Nothing it does can be a query, so a query elsewhere
      // is no evidence about it, and each is judged on its own body.
      const dispatched = callees.filter((c) => c.dispatched);
      const handlerScope = [body, ...callees.filter((c) => !c.dispatched).map((c) => c.body)]
        .join('\n');

      // Every generator this handler dispatches to, checked for a fallback
      // that renders a claim instead of a placeholder. Collected regardless of
      // whether the figure check below fires: the two are different defects,
      // and the assertion one has no figure in it by definition.
      for (const callee of callees) {
        if (!callee.dispatched) continue;
        DEFAULTED_ASSERTION.lastIndex = 0;
        for (const d of callee.body.matchAll(DEFAULTED_ASSERTION)) {
          if (isPlaceholder(d[2]!)) continue;
          assertions.push({ file: rel, generator: callee.name, literal: d[2]! });
        }
      }

      // Each dispatched generator on its own terms, before the handler is
      // judged. Keyed by generator name, so an allowlist entry covers the one
      // template that was reviewed rather than all sixteen.
      for (const gen of dispatched) {
        if (!BUILDS_TEXT.test(gen.body)) continue;
        if (REFUSES.test(gen.body) && !BUILDS_TEXT.test(gen.body)) continue;
        const hit = FIGURE.exec(gen.body);
        if (!hit) continue;
        out.push({
          file: rel,
          line,
          method: m[1]!.toUpperCase(),
          route,
          generator: gen.name,
          sample: gen.body
            .slice(Math.max(0, hit.index - 50), hit.index + 50)
            .replace(/\s+/g, ' ')
            .trim(),
        });
      }

      // A refusal exempts only a handler that ONLY refuses.
      //
      // document-gen refuses one document type and generates fifteen others, and
      // testing the whole expansion for a 501 exempted the entire endpoint the
      // moment that first refusal was added — silently un-checking fifteen
      // templates as a side effect of making one of them honest.
      if (REFUSES.test(handlerScope) && !BUILDS_TEXT.test(handlerScope)) continue;
      if (ASKS_SOMETHING.test(handlerScope)) continue;
      if (!BUILDS_TEXT.test(handlerScope)) continue;

      const found = FIGURE.exec(handlerScope);
      if (!found) continue;

      // From `expanded`, not `body`: the match index belongs to the expanded
      // text, and slicing the handler with it printed an empty sample for every
      // finding that lived in a helper — which is most of them.
      // The index is into masked text, and `blank` preserves offsets, so a hit
      // inside the handler itself reads back from `src` at the same offset. A hit
      // inside an expanded helper is quoted from the masked text, which is
      // readable because only comments were blanked.
      const at =
        found.index <= close - open
          ? src.slice(open + Math.max(0, found.index - 50), open + found.index + 50)
          : handlerScope.slice(Math.max(0, found.index - 50), found.index + 50);
      out.push({
        file: rel,
        line,
        method: m[1]!.toUpperCase(),
        route,
        sample: at.replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return {
    figures: out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    assertions: assertions.sort(
      (a, b) => a.generator.localeCompare(b.generator) || a.literal.localeCompare(b.literal),
    ),
  };
}

// ── Recorded ──────────────────────────────────────────────────

/**
 * Real: a document built from figures nobody queried.
 *
 * document-gen holds one remaining instance, and it is the weakest of the three
 * that following the dispatch table exposed:
 *
 *   generateAprExpiryWarningLetter tells the client "one or more of your
 *   business credit cards have 0% introductory APR periods expiring soon" as
 *   prose, rather than from the cards on file. It is product language rather
 *   than a figure, and it is still an assertion about this client's accounts in
 *   a letter addressed to them.
 *
 * The other two are fixed:
 *
 *   generateBusinessPurposeStatement asserted a fixed use-of-funds allocation —
 *   Inventory 40%, Marketing 25%, Equipment 20%, Working capital 15% — in every
 *   statement it produced. It now renders the client's stated allocation, or a
 *   bracket saying the section must be completed with them.
 *
 *   generateFeeDisclosureLetter listed three fees at $0 under a sentence
 *   promising all fees were disclosed. It refuses; see UNPRICED_DOCUMENTS.
 */
const KNOWN_FABRICATED = new Set<string>([
  // Empty as of 2026-09-01.
  //
  // The last entry was `generateAprExpiryWarningLetter`, which told a client
  // "one or more of your business credit cards have 0% introductory APR
  // periods expiring soon" from a generator that had read no cards — and, when
  // the caller supplied none, printed "Your card introductory APR period is
  // expiring soon" about a card nobody had looked up. It reads
  // `card_applications` now.
  //
  // Keyed by generator since 2026-09-01; the route key it replaced had been
  // covering two findings with one entry.
]);

/**
 * Reviewed and sound: builds a document, queries nothing, and that is correct
 * because every value comes from the caller's request rather than from a record.
 *
 * Empty, and the reason is no longer the one this note used to give.
 *
 * It said `document-gen` belonged here but could not be listed because the
 * check did not REACH it — the handler dispatches through `GENERATORS[type]`
 * and the expansion followed names, not table values. That gap was closed:
 * `calleeBodies` reads the table and treats every value as called, which is
 * how the fee disclosure and the adverse action response came under this check
 * at all. The note outlived the fix, and a guard describing a hole it no longer
 * has is worse than one describing a hole it does.
 *
 * `document-gen` is not listed here because it is not sound: it is in
 * KNOWN_FABRICATED, for the 0% APR prose in the expiry warning letter.
 */
const CALLER_SUPPLIED = new Set<string>([]);

const ALLOWED = new Set([...KNOWN_FABRICATED, ...CALLER_SUPPLIED]);

/**
 * Reviewed: a `??` fallback in a generator that reads as a claim, and stays.
 *
 * Keyed `generatorName::literal`, so changing the wording invalidates the
 * entry — the review was of that sentence, not of that field.
 *
 * Empty is the goal. An entry here is a promise that the default is the right
 * answer for every client who receives the document, which is a much stronger
 * claim than it looks.
 */
/**
 * Real: a generator field that renders a claim about this client, or about
 * this case, when nobody supplied one. Recorded to be fixed.
 *
 * Thirty-five, across eleven of the sixteen templates, found the moment the
 * check stopped looking only for figures. They fall into three shapes:
 *
 *   SAMPLE IDENTITIES. `?? 'Acme Holdings LLC'`, `?? 'John Smith'`,
 *   `?? 'Chase'`, `?? 'Ink Business Unlimited'`. A reconsideration letter
 *   addressed to an issuer, naming a business and a person who are not the
 *   client, reads exactly like one that named them correctly.
 *
 *   ASSERTED STATE. `?? 'On track'`, `?? 'Stable'`, `?? 'Under investigation'`,
 *   `?? 'Client is progressing well within the program timeline.'`,
 *   `?? 'Investigation initiated; corrective actions pending'`. A progress
 *   report and a compliance incident report are the two documents whose whole
 *   content is a statement of where something stands.
 *
 *   ASSERTED PROVENANCE. `generateConsentConfirmationLetter` defaults the
 *   method of consent to `'Electronic signature via client portal'`, and
 *   `generateDeclineReconsiderationLetter` defaults the decline reason to
 *   `'too many recent inquiries'`. Both state how something happened.
 *
 * The one already fixed is `generateRestackOpportunitySummary`, whose
 * `payment_rating ?? 'Good'` and `score_trend ?? 'Stable/Improving'` are what
 * exposed the gap.
 *
 * Delete an entry when it becomes a bracket. A stale one fails.
 */
const KNOWN_DEFAULTED_CLAIMS = new Set<string>([
  // Empty. All thirty-five were fixed on 2026-09-01, in three passes by shape:
  // the consent confirmation first, then asserted state, then the sample
  // identities. Each entry went stale the moment its default became a bracket,
  // and this script failed until the entry was deleted — which is the only
  // reason a list like this is worth keeping rather than a comment.
]);

/**
 * Reviewed: a `??` fallback in a generator that reads as a claim, and stays.
 *
 * Keyed `generatorName::literal`, so changing the wording invalidates the
 * entry — the review was of that sentence, not of that field.
 *
 * These ten are label fallbacks rather than assertions: a generic noun standing
 * in a column header position (`'Card'`, `'Issuer'`, `'Client'`), an explicit
 * unknown (`'??'`, `'N/A'`), and an id prefix (`'CST-'`). None of them states
 * anything about a client that could be false. Brackets would still read
 * better and any of them may be changed to one — at which point the entry goes
 * stale and this check says so.
 */
const DEFAULTED_CLAIMS = new Set<string>([
  "generateComplianceIncidentReport::N/A",
  "generateFundingRoundSummary::Card",
  "generateFundingRoundSummary::Issuer",
  "generateHardshipWorkoutProposal::Client",
  "generateHardshipWorkoutProposal::Issuer",
  "generateProductRealityAcknowledgment::Client",
]);

const { figures: found, assertions } = scan();
// A generator is keyed by its own name. Keying it by the route would let one
// allowlist entry cover all sixteen templates at once.
const key = (v: Violation) =>
  v.generator ? `${v.file}::${v.generator}` : `${v.file}::${v.method} ${v.route}`;
const fresh = found.filter((v) => !ALLOWED.has(key(v)));
const stale = [...ALLOWED].filter((k) => !found.some((v) => key(v) === k));

// Keyed on the wording, not the field: the review was of that sentence.
const akey = (a: DefaultedAssertion) => `${a.generator}::${a.literal}`;
const ALLOWED_CLAIMS = new Set([...KNOWN_DEFAULTED_CLAIMS, ...DEFAULTED_CLAIMS]);
const freshAssertions = assertions.filter((a) => !ALLOWED_CLAIMS.has(akey(a)));
const staleAssertions = [...ALLOWED_CLAIMS].filter(
  (k) => !assertions.some((a) => akey(a) === k),
);

if (
  fresh.length === 0
  && stale.length === 0
  && freshAssertions.length === 0
  && staleAssertions.length === 0
) {
  console.log(
    'check-document-provenance: every document-producing handler queries its figures '
    + `(${found.length} allowlisted), and every generator's missing field renders as a `
    + `placeholder (${assertions.length} allowlisted).`,
  );
  process.exit(0);
}

if (fresh.length > 0) {
  console.error(
    `\ncheck-document-provenance: ${fresh.length} handler(s) build a document containing figures they never asked for:\n`,
  );
  for (const v of fresh) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.method} ${v.route}${v.generator ? ` -> ${v.generator}` : ''}`);
    console.error(`    …${v.sample}…\n`);
  }
  console.error(
    'Read the figures from the database, refuse the endpoint the way\n' +
      'POST /spend-governance/export-evidence does, or — if every value comes from\n' +
      'the request — add it to CALLER_SUPPLIED with a reason, and make sure an\n' +
      'absent value renders as a placeholder rather than as a number.\n',
  );
}

if (freshAssertions.length > 0) {
  console.error(
    `\ncheck-document-provenance: ${freshAssertions.length} generator field(s) render a claim `
    + 'rather than a placeholder when nothing was supplied:\n',
  );
  for (const a of freshAssertions) {
    console.error(`  ${a.file}`);
    console.error(`    ${a.generator}`);
    console.error(`    ?? '${a.literal}'\n`);
  }
  console.error(
    'A missing field renders as [something], so nobody mistakes it for an answer.\n'
    + "`payment_rating ?? 'Good'` handed a client a document rating their payment\n"
    + 'history Good because the caller sent nothing. If the default really is the\n'
    + 'right answer for every client, record it in DEFAULTED_CLAIMS with why.\n',
  );
}

if (stale.length > 0) {
  console.error(`\ncheck-document-provenance: ${stale.length} allowlist entr(y/ies) no longer match:\n`);
  for (const k of stale) console.error(`  ${k}`);
  console.error('\nIf it is fixed, delete the entry. If it moved, update it.\n');
}

if (staleAssertions.length > 0) {
  console.error(
    `\ncheck-document-provenance: ${staleAssertions.length} DEFAULTED_CLAIMS entr(y/ies) no longer match:\n`,
  );
  for (const k of staleAssertions) console.error(`  ${k}`);
  console.error('\nIf it is fixed, delete the entry. If the wording changed, update it.\n');
}

process.exit(1);
