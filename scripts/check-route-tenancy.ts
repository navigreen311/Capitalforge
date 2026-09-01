// ============================================================
// check-route-tenancy.ts
//
// Fails when a route handler takes a business id and nothing ties that id to
// the caller's tenant.
//
// WHY THIS EXISTS
//
//   `requireOwnedBusiness` is installed in api/routes/index.ts on
//   /businesses/:id and /clients/:clientId, and covers every handler reachable
//   under those prefixes. It cannot cover a business id that arrives any other
//   way — a differently-named path segment, a body field, a query parameter —
//   and it cannot cover a router someone mounts without the prefix.
//
//   Eight handlers on /clients/:clientId read on `businessId` alone while five
//   of their siblings in the same file were scoped. The idiom was known and
//   applied unevenly. That is not a thing to fix once; it is a thing to check.
//
// WHAT "SCOPED" MEANS HERE
//
//   One of:
//     - the effective path is behind a guarded mount prefix
//     - the handler calls an ownership helper
//     - every `where` that names the business-id variable also names tenantId
//
//   The last one is deliberately strict. A handler that scopes three queries
//   and forgets the fourth is exactly the shape this catches, and "it mostly
//   filters" is not a property worth having a check for.
//
// WHAT IT CANNOT SEE
//
//   Whether the SERVICE behind the handler scopes. `listRounds(businessId)`
//   looks identical from a route file whether or not it filters on tenantId
//   inside. Handlers that pass the id straight to a service are reported unless
//   the mount covers them or they are allowlisted with a reason.
//
// TWO ALLOWLISTS, AS IN check-test-claims.ts
//
//   KNOWN_UNSCOPED    real, recorded, to be fixed
//   NO_BUSINESS_READ  reviewed and sound — the handler takes a business id and
//                     reads nothing per-business with it
//
//   Kept apart so the first list's length means something. A stale entry in
//   either fails, so neither can outlive the problem it describes.
// ============================================================

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, sep } from 'path';

const ROUTES_DIR = join('src', 'backend', 'api', 'routes');
const INDEX = join(ROUTES_DIR, 'index.ts');

/** Path parameters that name a business in this codebase's mount table. */
/**
 * Which `:id` is a business — decided from the PATH, not from the handler body.
 *
 * This is the whole difficulty. 128 handlers read `req.params['id']`; only about
 * fifty of those ids name a business. The rest are rounds, invoices, api keys,
 * issuers, incidents, workflows, anomalies. A check that treats every `:id` as a
 * business reports `/issuers/:id` and `/platform/tenants/:id`, and a check
 * nobody believes is a check nobody keeps.
 *
 * So `:businessId` and `:clientId` always name a business, and a bare `:id` does
 * only when the segment before it says so. That is the same fact the mount table
 * encodes, read the same way.
 */
const BIZ_PATH = /:businessId\b|:clientId\b|(?:businesses|clients)\/:id\b/;

/** The handler has to actually read a path parameter for this to matter. */
const READS_PARAM = /req\.params\b/;

const OWNERSHIP_HELPER =
  /assertBusinessOwnership|businessBelongsToTenant|assertOwnedBusiness|requireOwnedBusiness|requireBusinessAndTenant/;

const HANDLER =
  /\b(?:\w*[Rr]outer)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])(.*?)\2/g;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly method: string;
  readonly path: string;
  readonly why: string;
}

/** Blank string/regex/comment CONTENT, preserving offsets, so braces inside them do not end a block. */
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
      const prev = src.slice(Math.max(0, i - 40), i).trimEnd().at(-1);
      if (prev && '(,=:[!&|?{;+'.includes(prev)) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
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

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return s.length - 1;
}

/**
 * Prefixes on which `requireOwnedBusiness` is installed, read from index.ts
 * rather than restated here — a list that can disagree with the mount table is
 * worse than no list.
 */
function guardedPrefixes(indexSrc: string): string[] {
  const out: string[] = [];
  const re = /apiRouter\.use\(\s*['"]([^'"]+)['"]\s*,\s*requireOwnedBusiness\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexSrc)) !== null) out.push(m[1]!);
  return out;
}

/** routerVariable -> mount prefix, from index.ts. */
function mountPrefixes(indexSrc: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /apiRouter\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexSrc)) !== null) {
    const [, prefix, name] = m;
    if (name === 'requireOwnedBusiness') continue;
    const list = out.get(name!) ?? [];
    list.push(prefix!);
    out.set(name!, list);
  }
  return out;
}

/** importedName -> file, from index.ts import statements. */
function importedFrom(indexSrc: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /import\s+(?:\{\s*([\w\s,]+)\s*\}|(\w+))\s+from\s+['"]\.\/([\w.-]+)\.js['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexSrc)) !== null) {
    const file = `${m[3]}.ts`;
    if (m[2]) out.set(m[2], file);
    for (const named of (m[1] ?? '').split(',')) {
      const n = named.trim();
      if (n) out.set(n, file);
    }
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .map((e) => join(dir, e))
    .filter((p) => !statSync(p).isDirectory() && p.endsWith('.routes.ts'));
}

function scan(): Violation[] {
  const indexSrc = readFileSync(INDEX, 'utf8');
  const guarded = guardedPrefixes(indexSrc);
  const mounts = mountPrefixes(indexSrc);
  const files = importedFrom(indexSrc);

  /** file -> the prefixes its routers are mounted at. */
  const prefixByFile = new Map<string, string[]>();
  for (const [name, prefixes] of mounts) {
    const file = files.get(name);
    if (!file) continue;
    prefixByFile.set(file, [...(prefixByFile.get(file) ?? []), ...prefixes]);
  }

  const isGuarded = (effective: string): boolean =>
    guarded.some((g) => effective === g || effective.startsWith(`${g}/`));

  const violations: Violation[] = [];

  for (const path of walk(ROUTES_DIR)) {
    const base = path.split(sep).pop()!;
    if (base === 'index.ts') continue;
    const src = readFileSync(path, 'utf8');
    const mask = blank(src);
    const rel = path.split(sep).join('/');
    const prefixes = prefixByFile.get(base) ?? [''];

    HANDLER.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HANDLER.exec(mask)) !== null) {
      const method = m[1]!.toUpperCase();
      // m[0] ends AT the closing quote, so the path runs from one before that
      // minus its length. Getting this wrong captured `applications/:id'` — no
      // leading slash, a trailing quote — which then failed every prefix match
      // and reported eleven handlers that are in fact behind a guarded mount.
      const pathEnd = m.index + m[0].length - 1;
      const routePath = src.slice(pathEnd - m[3]!.length, pathEnd);
      const open = mask.indexOf('{', m.index + m[0].length);
      if (open === -1) continue;
      const close = matchBrace(mask, open);
      const body = src.slice(open, close + 1);
      const line = src.slice(0, m.index).split('\n').length;

      // The path has to name a business, and the handler has to read it.
      const effectiveForBiz = prefixes.map((p) => `${p}${routePath}`.replace(/\/+/g, '/'));
      if (!BIZ_PATH.test(routePath) && !effectiveForBiz.some((e) => BIZ_PATH.test(e))) continue;
      if (!READS_PARAM.test(body)) continue;

      // Covered by a guarded mount prefix on ANY of this router's mounts?
      const effectives = prefixes.map((p) => `${p}${routePath}`.replace(/\/+/g, '/'));
      // Only the EFFECTIVE path can be guarded — mount prefix plus route path.
      //
      // An earlier version also accepted a route path that merely looked
      // guarded, which is how a root-mounted router declaring
      // `/businesses/:id/...` gets covered. But a router mounted somewhere else
      // — `/health`, say — declaring the same path is NOT covered, and that
      // version passed it. A deliberately bad handler added under `/health`
      // sailed through this check, which is the exact bypass it exists to catch.
      //
      // Routers mounted at '/' still get the same answer, because their
      // effective path IS their route path.
      if (effectives.some(isGuarded)) continue;

      if (OWNERSHIP_HELPER.test(body)) continue;

      // Every `where` naming the business-id variable must also name tenantId.
      const names = [...body.matchAll(/(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*(?:String\()?\s*req\.params/g)]
        .map((x) => x[1]!)
        .filter(Boolean);
      // Verify-then-use is scoped, and common here: read the business filtered
      // on {id, tenantId}, 404 if absent, then query children by businessId
      // alone. invoice_pay and applications/compliance-gate both do it, and
      // flagging them would train people to ignore this check. Evidence is a
      // `where` naming BOTH the business-id variable and tenantId.
      let verified = false;
      let unscoped = false;
      for (const w of body.matchAll(/\bwhere\s*:\s*\{/g)) {
        const wOpen = body.indexOf('{', w.index! + w[0].length - 1);
        const clause = body.slice(wOpen, matchBrace(body, wOpen) + 1);
        const touches = names.some((n) => new RegExp(`\\b${n}\\b`).test(clause));
        if (!touches) continue;
        if (/\btenantId\b/.test(clause)) verified = true;
        else unscoped = true;
      }
      if (verified) continue;

      const hasTenant = /\btenantId\b/.test(body);
      if (!unscoped && hasTenant) continue;

      violations.push({
        file: rel,
        line,
        method,
        path: routePath,
        why: unscoped
          ? 'a `where` names the business id and not tenantId'
          : 'takes a business id and nothing in the handler names tenantId',
      });
    }
  }

  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ── Recorded, with reasons ────────────────────────────────────
//
// `file::METHOD path`. Remove an entry when it is fixed; a stale one fails.

/**
 * Real. Each takes a business id that nothing ties to the caller.
 *
 * All three are the data-lineage surface, and all three serve `mockEvents()` —
 * a generated lineage for whatever id is asked for. Unscoped AND fabricated, so
 * scoping them alone would make an invented answer harder to obtain rather than
 * more honest. Recorded here so the pair is fixed together.
 */
const KNOWN_UNSCOPED = new Set<string>([
  'src/backend/api/routes/platform-data-lineage.routes.ts::GET /:businessId/events',
  'src/backend/api/routes/platform-data-lineage.routes.ts::POST /:businessId/export',
]);

/**
 * Reviewed and sound: takes a business id and reads nothing per-business with
 * it. Each computes from the request body or query and echoes the id back.
 *
 * Worth saying plainly, because it is not automatically fine: echoing an id you
 * never read is how `readiness_score` came to report an assessment of a business
 * it never opened. These are listed because they are computations, not lookups
 * — a manual for any of them must not describe the id as a subject.
 */
const NO_BUSINESS_READ = new Set<string>([
  // Both answer 501: nothing records a points balance, so there is nothing to
  // scope. Kept here rather than deleted from the check, so that rebuilding
  // either one without a tenant filter fails this.
  'src/backend/api/routes/rewards.routes.ts::GET /:clientId/points-balances',
  'src/backend/api/routes/rewards.routes.ts::POST /:clientId/export',
  // Reads nothing — and that is the defect, not the exemption. It scores from
  // query parameters and stamps the businessId on the answer, which is why it
  // is excluded in The Office's forge_module_exclusion as `attributed`. Listed
  // here because the check is right that nothing scopes it, and wrong that this
  // is therefore fine.
  'src/backend/api/routes/readiness.routes.ts::GET /:businessId',
]);

const ALLOWED = new Set([...KNOWN_UNSCOPED, ...NO_BUSINESS_READ]);

const found = scan();
const key = (v: Violation) => `${v.file}::${v.method} ${v.path}`;
const fresh = found.filter((v) => !ALLOWED.has(key(v)));
const stale = [...ALLOWED].filter((k) => !found.some((v) => key(v) === k));

if (fresh.length === 0 && stale.length === 0) {
  console.log(
    `check-route-tenancy: every handler taking a business id is scoped or recorded (${found.length} allowlisted).`,
  );
  process.exit(0);
}

if (fresh.length > 0) {
  console.error(`\ncheck-route-tenancy: ${fresh.length} handler(s) take a business id unscoped:\n`);
  for (const v of fresh) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.method} ${v.path}`);
    console.error(`    ${v.why}\n`);
  }
  console.error(
    'Fix by mounting it under a guarded prefix, calling businessBelongsToTenant,\n' +
      'or naming tenantId in the same `where`. If the handler reads nothing\n' +
      'per-business, add it to NO_BUSINESS_READ in this file with a reason.\n',
  );
}

if (stale.length > 0) {
  console.error(`\ncheck-route-tenancy: ${stale.length} allowlist entr(y/ies) no longer match:\n`);
  for (const k of stale) console.error(`  ${k}`);
  console.error('\nIf it is fixed, delete the entry. If it moved, update it.\n');
}

process.exit(1);
