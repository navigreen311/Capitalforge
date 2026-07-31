// ============================================================
// CapitalForge — reading a whole list, not its first page
//
// Every list endpoint here paginates, and the defaults are small: 20 rows for
// complaints, regulator inquiries, documents and calls; 50 for applications;
// 25 for clients. A caller that fetches without asking for more gets that many
// and no indication there are others.
//
// That is harmless for a table a user scrolls, and wrong for anything counted:
// a KPI summed over the first 20 rows reads as a figure for the register. It
// is equally wrong for a picker — a client selector showing 25 of 300 clients
// offers no way to reach the rest, and looks complete while doing it.
//
// Two envelope shapes are in use, so both are handled:
//   { data: { complaints: [...], total, page, pageSize } }
//   { data: [...], meta: { total, page, pageSize } }
// ============================================================

export interface PagedResult<T> {
  rows: T[];
  /** What the server says exists, or null when it does not report a total. */
  total: number | null;
  /** True when the cap stopped the walk before every row was read. */
  truncated: boolean;
}

/** How many pages to walk before stopping. Bounds a very large register. */
const DEFAULT_MAX_PAGES = 20;

/** What to ask for per page. Servers clamp this to their own maximum. */
const DEFAULT_PAGE_SIZE = 100;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The total, wherever this endpoint reports it. */
export function readTotal(json: unknown): number | null {
  const body = asRecord(json);
  return numberOrNull(asRecord(body['meta'])['total']) ?? numberOrNull(asRecord(body['data'])['total']);
}

function authHeader(): Record<string, string> {
  // Reached through globalThis rather than naming `window` and `localStorage`
  // directly: the backend tsconfig compiles this file and has no DOM lib, so
  // those identifiers break `npm run build:backend`.
  const storage = (globalThis as { localStorage?: { getItem(key: string): string | null } })
    .localStorage;
  const token = storage?.getItem('cf_access_token') ?? null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Read every page of a list endpoint.
 *
 * `pick` pulls the rows out of one response, so each caller keeps its own
 * mapping and this stays unaware of the shapes involved.
 *
 * A page that fails after the first drops its rows rather than discarding the
 * pages that already loaded — a partial register is more useful than none, and
 * `truncated` says it happened.
 */
export async function fetchAllPages<T>(
  path: string,
  pick: (json: unknown) => T[],
  options: { pageSize?: number; maxPages?: number; headers?: Record<string, string> } = {},
): Promise<PagedResult<T>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const headers = { ...authHeader(), ...(options.headers ?? {}) };

  const join = path.includes('?') ? '&' : '?';
  const first = await fetch(`${path}${join}pageSize=${pageSize}`, { headers });
  if (!first.ok) throw new Error(`Request failed: ${first.status}`);

  const firstJson: unknown = await first.json();
  const rows = pick(firstJson);
  const total = readTotal(firstJson);

  // Nothing more to fetch, or the endpoint does not tell us how much there is.
  if (total === null || rows.length >= total || rows.length === 0) {
    return { rows, total, truncated: false };
  }

  // The server may have clamped pageSize below what was asked for, so the
  // stride is what actually came back rather than what was requested.
  const stride = rows.length;
  const pagesNeeded = Math.ceil(total / stride);
  const lastPage = Math.min(pagesNeeded, maxPages);

  const rest = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) =>
      fetch(`${path}${join}pageSize=${pageSize}&page=${i + 2}`, { headers })
        .then(async (res) => (res.ok ? pick(await res.json()) : []))
        .catch(() => []),
    ),
  );

  const all = [...rows, ...rest.flat()];
  return { rows: all, total, truncated: all.length < total };
}
