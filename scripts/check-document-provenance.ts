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
// THE RULE
//
//   A handler whose route names export / report / dossier / generate / download,
//   which builds a string or array of strings, and which contains a money-shaped
//   or count-shaped literal, must query something. No prisma call and no service
//   call in the handler means every number in that document was typed here.
//
// IT IS IMPERFECT ON PURPOSE
//
//   It cannot tell a real figure from an invented one; it can only tell whether
//   the handler asked anything. A document assembled from caller-supplied context
//   — document-gen's sixteen templates — legitimately queries nothing, and those
//   are allowlisted with the reason. What it buys is that the SIXTH one fails at
//   authoring time instead of on a sweep.
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
  readonly sample: string;
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

/** Brace-match, ignoring braces inside strings and template literals. */
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
function calleeBodies(src: string, mask: string, body: string): string[] {
  const called = new Set<string>();
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
    const table = src.slice(open, matchBrace(src, open) + 1);
    // Lookahead on the trailing delimiter. Consuming it meant every second
    // entry was skipped — the comma that ended one match was the comma the next
    // one needed to start, so sixteen generators parsed as eight.
    for (const v of table.matchAll(
      /[:,{]\s*(?:\w+|'[^']*'|"[^"]*")\s*:\s*([A-Za-z_]\w*)\s*(?=[,}])/g,
    )) {
      called.add(v[1]!);
    }
  }

  const out: string[] = [];
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
    out.push(mask.slice(open, matchBrace(src, open) + 1));
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .map((e) => join(dir, e))
    .filter((p) => !statSync(p).isDirectory() && p.endsWith('.routes.ts'));
}

function scan(): Violation[] {
  const out: Violation[] = [];
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
      const close = matchBrace(src, open);
      const body = mask.slice(open, close + 1);
      const line = src.slice(0, m.index).split('\n').length;

      // Expand one level into same-file helpers the handler calls.
      //
      // The figures are usually not in the handler. `mockEvents()` was a module
      // function; document-gen's sixteen templates are sixteen functions and the
      // handler only dispatches. A check that reads the handler alone sees a
      // switch statement and passes the exact shape it exists to catch.
      const expanded = [body, ...calleeBodies(src, mask, body)].join('\n');

      if (REFUSES.test(expanded)) continue;
      if (ASKS_SOMETHING.test(expanded)) continue;
      if (!BUILDS_TEXT.test(expanded)) continue;

      const found = FIGURE.exec(expanded);
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
          : expanded.slice(Math.max(0, found.index - 50), found.index + 50);
      out.push({
        file: rel,
        line,
        method: m[1]!.toUpperCase(),
        route,
        sample: at.replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ── Recorded ──────────────────────────────────────────────────

/**
 * Real: a document built from figures nobody queried.
 *
 * document-gen is here because following the GENERATORS dispatch table brought
 * its sixteen templates into scope and three of them assert figures:
 *
 *   generateBusinessPurposeStatement  a fixed use-of-funds allocation —
 *     Inventory 40%, Marketing 25%, Equipment 20%, Working capital 15% — in the
 *     document that evidences credit is for business rather than personal use.
 *     Identical for every client, and a factual claim about how they will spend.
 *
 *   generateFeeDisclosureLetter  "Expedited Processing Fee: $0", "Document
 *     Preparation Fee: $0", "Restack Analysis Fee: $0 for first restack". A fee
 *     disclosure stating amounts that were not read from any fee schedule. If
 *     the real schedule differs, the disclosure understates what is charged.
 *
 *   generateAprExpiryWarningLetter  asserts the client's cards "have 0%
 *     introductory APR periods expiring soon" as prose rather than from the
 *     cards on file. Weaker than the other two — it is product language, not a
 *     figure — and listed because the same letter goes to a client.
 *
 * The other thirteen are clean: they interpolate caller context and fall back to
 * visible placeholders.
 */
const KNOWN_FABRICATED = new Set<string>([
  'src/backend/api/routes/document-gen.routes.ts::POST /documents/generate',
]);

/**
 * Reviewed and sound: builds a document, queries nothing, and that is correct
 * because every value comes from the caller's request rather than from a record.
 *
 * Empty today, and not because nothing qualifies — `document-gen` is exactly
 * this case. It is not listed because the check does not currently REACH it: the
 * handler dispatches through a lookup table (`GENERATORS[type](ctx)`) rather
 * than naming a function, and the one-level expansion follows names, not table
 * values. Listing it would claim a coverage this script does not have, and an
 * allowlist entry for something never flagged fails the stale check anyway.
 *
 * What that costs is worth being explicit about: a fabricated export hidden
 * behind a dispatch table would not be caught. `spend-governance` had its
 * figures inline and `data-lineage` had them in a directly-named helper, which
 * is what this reaches. The third shape is a known gap, not a covered case.
 */
const CALLER_SUPPLIED = new Set<string>([]);

const ALLOWED = new Set([...KNOWN_FABRICATED, ...CALLER_SUPPLIED]);

const found = scan();
const key = (v: Violation) => `${v.file}::${v.method} ${v.route}`;
const fresh = found.filter((v) => !ALLOWED.has(key(v)));
const stale = [...ALLOWED].filter((k) => !found.some((v) => key(v) === k));

if (fresh.length === 0 && stale.length === 0) {
  console.log(
    `check-document-provenance: every document-producing handler queries its figures (${found.length} allowlisted).`,
  );
  process.exit(0);
}

if (fresh.length > 0) {
  console.error(
    `\ncheck-document-provenance: ${fresh.length} handler(s) build a document containing figures they never asked for:\n`,
  );
  for (const v of fresh) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.method} ${v.route}`);
    console.error(`    …${v.sample}…\n`);
  }
  console.error(
    'Read the figures from the database, refuse the endpoint the way\n' +
      'POST /spend-governance/export-evidence does, or — if every value comes from\n' +
      'the request — add it to CALLER_SUPPLIED with a reason, and make sure an\n' +
      'absent value renders as a placeholder rather than as a number.\n',
  );
}

if (stale.length > 0) {
  console.error(`\ncheck-document-provenance: ${stale.length} allowlist entr(y/ies) no longer match:\n`);
  for (const k of stale) console.error(`  ${k}`);
  console.error('\nIf it is fixed, delete the entry. If it moved, update it.\n');
}

process.exit(1);
