// ============================================================
// source-scan.ts — the parsing primitives the guard scripts share
//
// WHY THIS FILE EXISTS
//
//   `blank` and `matchBrace` were written for check-route-tenancy and then
//   needed again by check-document-provenance and check-service-tenancy. Two
//   copies of a parser is two chances to be wrong, and the history of these
//   scripts is a history of parser bugs: a dead regex branch that made a whole
//   feature inert while appearing to work, a path capture off by one, a
//   marker matched inside a comment, brace-matching on unmasked source that
//   mis-attributed ten findings to one function.
//
//   Every one of those was found in ONE script. A copy in a second would have
//   kept the bug alive there after the first was fixed, silently, which is the
//   drift these guards exist to catch in the code they read.
// ============================================================

/**
 * Blank comment CONTENT, preserving offsets.
 *
 * A marker in a comment is not a fact about the code. Reading raw source meant
 * a handler carrying "we could use businessBelongsToTenant here but have not
 * yet" satisfied the ownership check — verified by writing exactly that and
 * watching it pass.
 *
 * Offsets are preserved so an index into the masked text reads back correctly
 * from the original.
 */
export function blankComments(src: string): string {
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
 * Brace-match from an opening `{`, skipping strings and template literals.
 *
 * ALWAYS CALL THIS ON MASKED SOURCE. It skips from a quote to the next quote,
 * and an apostrophe in an English comment — "the caller's context" — is a
 * quote. Called on raw source, one such apostrophe made the rest of the file a
 * string, so the body returned ran to the end of the file and every finding in
 * it was attributed to whichever function happened to be first.
 */
export function matchBrace(s: string, open: number): number {
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

/** The 1-indexed line a character offset falls on. */
export function lineAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}
