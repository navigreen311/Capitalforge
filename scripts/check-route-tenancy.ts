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
// WHY IT NOW READS QUERY PARAMETERS AND BODY FIELDS TOO
//
//   This checked path parameters only, and said so — under WHAT IT CANNOT SEE.
//   Then `GET /issuers/:id/eligibility?businessId=X` turned out to run
//   `findUnique({ where: { id: businessId } })` with no tenant filter, so any
//   authenticated caller could read any business's credit score, age and
//   revenue back as `currentValue` on the rule violations. That was the
//   seventh unscoped read found in this codebase, and the first in the one
//   shape the check could not see.
//
//   A guard that covers only path parameters covers the shape we happened to
//   look at first. The id is the same id wherever it arrives.
//
//   Path and non-path ids are NOT treated alike in one respect: a guarded
//   mount prefix exempts a path id, because `requireOwnedBusiness('id')`
//   verifies `req.params.id` and nothing else. A handler under
//   /businesses/:id that reads `req.query.businessId` is reading an id the
//   guard never saw.
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
//   Whether a field NAMED like a business id is one. `client_id` on an OAuth
//   or integrations route is an API client, not a client of the firm. Those go
//   in NOT_A_BUSINESS_ID, which is kept apart from the other two lists because
//   "this is not a business id" and "this is a business id nothing reads" are
//   different claims and only one of them is about tenancy.
//
// TWO ALLOWLISTS, AS IN check-test-claims.ts
//
//   KNOWN_UNSCOPED    real, recorded, to be fixed
//   NO_BUSINESS_READ  reviewed and sound — the handler takes a business id and
//                     reads nothing per-business with it
//   NOT_A_BUSINESS_ID reviewed and sound — the field is named like a business
//                     id and is not one
//
//   Kept apart so the first list's length means something. A stale entry in
//   any of them fails, so none can outlive the problem it describes.
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

/**
 * Field names that mean "a business" when they arrive in a query string or a
 * request body.
 *
 * Unlike a bare `:id` in a path, the name is right there, so this can be exact
 * rather than inferred from the segment before it. `clientId` is included
 * because this codebase's mount table treats /clients/:clientId as a business —
 * a client of the firm IS a business record.
 *
 * The cost of that is `client_id` on an OAuth or integrations route, which is
 * an API client. Those are reported and recorded in NOT_A_BUSINESS_ID rather
 * than excluded by a pattern here, because a pattern clever enough to tell
 * them apart would be a pattern nobody could check.
 */
const BIZ_FIELD_NAMES = [
  'businessId', 'business_id', 'clientId', 'client_id',
  // Plural, because a list of business ids is business ids. The SMS campaign
  // endpoint takes `client_ids` and scopes it correctly — which the check
  // could not see either way until these were here, and a check that cannot
  // see a correct handler cannot see the incorrect one beside it.
  'businessIds', 'business_ids', 'clientIds', 'client_ids',
] as const;
const BIZ_FIELD_ALT = BIZ_FIELD_NAMES.join('|');
const BIZ_FIELD_RE = new RegExp(`^(?:${BIZ_FIELD_ALT})$`);

/** `req.query['businessId']` or `req.query.businessId`, and the same on body. */
function readsBizFrom(source: 'query' | 'body'): RegExp {
  return new RegExp(
    `req\\.${source}\\s*(?:\\[\\s*['"\`](?:${BIZ_FIELD_ALT})['"\`]\\s*\\]`
    + `|\\.\\s*(?:${BIZ_FIELD_ALT})\\b)`,
  );
}

/** `const { businessId, foo } = req.query` — the name is bound, not indexed. */
function destructuredFrom(source: 'query' | 'body'): RegExp {
  return new RegExp(
    `(?:const|let)\\s*\\{([^}]*)\\}\\s*(?::[^=]*)?=\\s*\\(?\\s*req\\.${source}\\b`,
    'g',
  );
}


const OWNERSHIP_HELPER =
  /assertBusinessOwnership|businessBelongsToTenant|assertOwnedBusiness|requireOwnedBusiness|requireBusinessAndTenant/;

const HANDLER =
  /\b(?:\w*[Rr]outer)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])(.*?)\2/g;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly method: string;
  readonly path: string;
  /** Where the business id arrives. Part of the allowlist key for the two new ones. */
  readonly source: 'path' | 'query' | 'body';
  readonly why: string;
}

/** Business-named identifiers bound by destructuring `req.query` / `req.body`. */
function destructuredBizNames(body: string, from: 'query' | 'body'): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(destructuredFrom(from))) {
    for (const part of (m[1] ?? '').split(',')) {
      // `businessId`, `businessId: bizId`, `businessId = ''` — the bound name
      // is what a `where` will mention, so that is what is collected.
      const [key, alias] = part.split(':').map((x) => x.trim());
      const name = (alias ?? key ?? '').split('=')[0]!.trim();
      if (key && BIZ_FIELD_RE.test(key)) out.push(name || key);
    }
  }
  return out;
}

/** Does the handler destructure a business-named field out of query or body? */
function destructuresBiz(body: string, from: 'query' | 'body'): boolean {
  return destructuredBizNames(body, from).length > 0;
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
      // MASKED. Every exemption below is a marker test, and a marker in a comment
      // is not a fact about the code. Reading source here meant a handler
      // carrying "we could use businessBelongsToTenant here but have not yet"
      // was exempted — a comment saying the check had NOT been done satisfied
      // the check. Verified by writing exactly that and watching this pass.
      const body = mask.slice(open, close + 1);
      const line = src.slice(0, m.index).split('\n').length;

      // Where does a business id arrive here? Possibly more than one way.
      //
      // For the path, the segment before a bare `:id` decides. For a query
      // string or a body, the field name decides, and it is exact.
      const effectiveForBiz = prefixes.map((p) => `${p}${routePath}`.replace(/\/+/g, '/'));
      const fromPath =
        (BIZ_PATH.test(routePath) || effectiveForBiz.some((e) => BIZ_PATH.test(e)))
        && READS_PARAM.test(body);
      const fromQuery = readsBizFrom('query').test(body) || destructuresBiz(body, 'query');
      const fromBody = readsBizFrom('body').test(body) || destructuresBiz(body, 'body');

      if (!fromPath && !fromQuery && !fromBody) continue;

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
      //
      // It exempts a PATH id and nothing else. `requireOwnedBusiness('id')`
      // verifies `req.params.id`; a handler under the same prefix that reads
      // `req.query.businessId` is reading an id the guard never saw, and
      // sitting behind a guarded mount says nothing about it.
      if (!fromQuery && !fromBody && effectives.some(isGuarded)) continue;

      if (OWNERSHIP_HELPER.test(body)) continue;

      // Every `where` naming the business-id variable must also name tenantId.
      //
      // The variable can be bound three ways now, so all three are collected:
      // from a path parameter, from a query or body field named like a
      // business, and by destructuring either object.
      const names = [
        // Path variables count only when the PATH names a business. Otherwise
        // `const slug = String(req.params.slug)` on
        // `/credit-unions/:slug/eligibility?businessId=X` gets treated as a
        // business id, and `where: { slug }` — a perfectly correct lookup of a
        // credit union — is reported as an unscoped business read. Before this
        // check could see query parameters that handler was never analysed at
        // all, so the mistake had nowhere to show up.
        ...(fromPath
          ? [...body.matchAll(/(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*(?:String\()?\s*req\.params/g)]
            .map((x) => x[1]!)
          : []),
        ...[...body.matchAll(
          new RegExp(
            `(?:const|let)\\s+(\\w+)\\s*(?::[^=]+)?=\\s*(?:String\\()?\\s*req\\.(?:query|body)\\s*`
            + `(?:\\[\\s*['"\`](?:${BIZ_FIELD_ALT})['"\`]\\s*\\]|\\.\\s*(?:${BIZ_FIELD_ALT})\\b)`,
            'g',
          ),
        )].map((x) => x[1]!),
        ...destructuredBizNames(body, 'query'),
        ...destructuredBizNames(body, 'body'),
      ].filter(Boolean);

      // A `where` can also name the read inline — `{ id: req.query.businessId }`
      // — with no variable in between. That is the same read and has to count.
      const inlineReads = [readsBizFrom('query'), readsBizFrom('body')];
      // Verify-then-use is scoped, and common here: read the business filtered
      // on {id, tenantId}, 404 if absent, then query children by businessId
      // alone. invoice_pay and applications/compliance-gate both do it, and
      // flagging them would train people to ignore this check. Evidence is a
      // `where` naming BOTH the business-id variable and tenantId.
      //
      // ORDER MATTERS. A verification only covers queries that come after it:
      // reading business A scoped and then querying business B unscoped is not
      // verify-then-use. The first version set a flag and exempted the whole
      // handler regardless of position, which would have passed exactly that.
      let verifiedAt: number | null = null;
      let unscoped = false;
      for (const w of body.matchAll(/\bwhere\s*:\s*\{/g)) {
        const wOpen = body.indexOf('{', w.index! + w[0].length - 1);
        const clause = body.slice(wOpen, matchBrace(body, wOpen) + 1);
        const touches =
          names.some((n) => new RegExp(`\\b${n}\\b`).test(clause))
          || inlineReads.some((re) => re.test(clause));
        if (!touches) continue;
        if (/\btenantId\b/.test(clause)) {
          if (verifiedAt === null) verifiedAt = wOpen;
        } else if (verifiedAt === null || wOpen < verifiedAt) {
          unscoped = true;
        }
      }
      // A business id WRITTEN into a row has to be verified too, and naming
      // tenantId beside it is not verification.
      //
      // In a `where`, `{ businessId, tenantId }` constrains the query — the row
      // comes back only if both hold. In a `data`, `{ businessId, tenantId }`
      // asserts both, and asserting does not check. `POST /documents/upload`
      // stores `businessId` straight from the request body next to the
      // caller's own tenantId, so a document can be filed against a business in
      // another tenant and the row looks entirely normal afterwards.
      //
      // The only evidence that counts here is an ownership helper or a
      // verifying read that came first, which is why this is checked after the
      // `where` loop has run.
      let writtenUnverified = false;
      if (verifiedAt === null) {
        for (const d of body.matchAll(/\bdata\s*:\s*\{/g)) {
          const dOpen = body.indexOf('{', d.index! + d[0].length - 1);
          const clause = body.slice(dOpen, matchBrace(body, dOpen) + 1);
          const touches =
            names.some((n) => new RegExp(`\\b${n}\\b`).test(clause))
            || inlineReads.some((re) => re.test(clause));
          if (touches) writtenUnverified = true;
        }
      }

      if (verifiedAt !== null && !unscoped) continue;

      const hasTenant = /\btenantId\b/.test(body);
      if (!unscoped && !writtenUnverified && hasTenant) continue;

      // Named, so a reader knows where to look — and so a handler taking a
      // business id two ways cannot be silenced by an allowlist entry that
      // only reviewed one of them.
      const source: Violation['source'] = fromQuery ? 'query' : fromBody ? 'body' : 'path';

      violations.push({
        file: rel,
        line,
        method,
        path: routePath,
        source,
        why: unscoped
          ? `a \`where\` names the business id (from the ${source}) and not tenantId`
          : writtenUnverified
            ? `a business id from the ${source} is written into a row without being `
              + 'verified against the caller — naming tenantId beside it asserts, it does '
              + 'not check'
            : `takes a business id in the ${source} and nothing in the handler names tenantId`,
      });
    }
  }

  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ── Recorded, with reasons ────────────────────────────────────
//
// `file::METHOD path` for a path id, and `file::METHOD path [query]` or
// `[body]` for the two new sources. Remove an entry when it is fixed; a stale
// one fails.
//
// The source is in the key so that a handler taking a business id two ways
// cannot be silenced by an entry that reviewed only one of them. It is left
// OUT of the path key so the entries written before this check could see a
// query parameter keep working — they describe the same handlers.

/**
 * Real. Each takes a business id that nothing ties to the caller.
 *
 * Empty, and it was not empty for long. It held the two data-lineage handlers,
 * which were unscoped AND served a generated lineage — scoping them alone would
 * have made an invented answer harder to obtain rather than more honest, so they
 * were recorded to be fixed together, and were. The stale-entry check is what
 * said so: both entries stopped matching the moment they were fixed, and this
 * script failed until they were removed.
 */
const KNOWN_UNSCOPED = new Set<string>([]);

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

/**
 * Reviewed and sound: the field is named like a business id and is not one.
 *
 * Kept apart from NO_BUSINESS_READ because the two are different claims. "This
 * handler reads nothing per-business" is about tenancy and could stop being
 * true tomorrow. "`client_id` here is an OAuth client" is about vocabulary,
 * and the entry says which meaning was checked.
 */
const NOT_A_BUSINESS_ID = new Set<string>([]);

const ALLOWED = new Set([...KNOWN_UNSCOPED, ...NO_BUSINESS_READ, ...NOT_A_BUSINESS_ID]);

const found = scan();
const key = (v: Violation) =>
  v.source === 'path'
    ? `${v.file}::${v.method} ${v.path}`
    : `${v.file}::${v.method} ${v.path} [${v.source}]`;
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
