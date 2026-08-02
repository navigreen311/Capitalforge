// ============================================================
// tenant-admin-view — /multi-tenant reads the tenant table
//
// The page held five tenants as literals: Apex Capital Group on Enterprise at
// $14,400 a month with 48 advisors and 412 clients, Clearview Strategies
// suspended with two overdue invoices, and three more. Every figure on the
// page came from that array — the summary cards totalled it, the billing
// panel listed its invoices, the activity log replayed its events.
//
// GET /api/admin/tenants has been there the whole time. What it returns is
// less than the page displayed, and this maps exactly that much.
// ============================================================

export interface TenantUsageLimits {
  [metric: string]: number;
}

export interface TenantAdminRow {
  id: string;
  name: string;
  slug: string;
  /** The stored plan key, e.g. "growth". */
  plan: string;
  isActive: boolean;
  createdAt: string | null;
  /** From the tenant's current plan record; null when no plan is on file. */
  monthlyPrice: number | null;
  billingCycle: string | null;
  planStatus: string | null;
  /** Module entitlements, which are what the feature toggles write to. */
  features: Record<string, boolean>;
  usageLimits: TenantUsageLimits | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Prisma Decimal arrives as a string over JSON.
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function flags(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>(
    (acc, [key, raw]) => {
      if (typeof raw === 'boolean') acc[key] = raw;
      return acc;
    },
    {},
  );
}

function limits(value: unknown): TenantUsageLimits | null {
  if (!value || typeof value !== 'object') return null;
  const out: TenantUsageLimits = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = num(raw);
    if (n !== null) out[key] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Rows for the tenant table.
 *
 * Accepts the endpoint's `{ data: { tenants, total } }`, a bare `{ tenants }`,
 * or an array, because the admin list is wrapped differently from the v1
 * routes and a mapper that only handles one shape fails silently as an empty
 * table.
 */
export function toTenantAdminRows(data: unknown): TenantAdminRow[] {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const inner = root['data'] && typeof root['data'] === 'object'
    ? (root['data'] as Record<string, unknown>)
    : root;

  const rows: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(inner['tenants'])
      ? (inner['tenants'] as unknown[])
      : [];

  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>;
    const id = str(r['id']);
    const name = str(r['name']);
    if (id === null || name === null) return [];

    const plan = r['currentPlan'] && typeof r['currentPlan'] === 'object'
      ? (r['currentPlan'] as Record<string, unknown>)
      : null;

    return [
      {
        id,
        name,
        slug: str(r['slug']) ?? '',
        plan: str(r['plan']) ?? '',
        // A tenant with no isActive on the record is not assumed live.
        isActive: r['isActive'] === true,
        createdAt: str(r['createdAt']),
        monthlyPrice: plan ? num(plan['monthlyPrice']) : null,
        billingCycle: plan ? str(plan['billingCycle']) : null,
        planStatus: plan ? str(plan['status']) : null,
        features: plan ? flags(plan['moduleEntitlements']) : {},
        usageLimits: plan ? limits(plan['usageLimits']) : null,
      },
    ];
  });
}

export interface UsageRow {
  metric: string;
  used: number;
  /** Null when the plan sets no limit for this metric. */
  limit: number | null;
}

/**
 * Usage for one tenant, from GET /api/admin/tenants/:id/usage.
 *
 * The endpoint returns metered totals only. A metric with no limit on the
 * plan gets null rather than a denominator, because the page drew a progress
 * bar and a bar needs one — the literals carried "184,200 of 500,000 calls"
 * for a tenant nobody had metered.
 */
export function toUsageRows(data: unknown, planLimits: TenantUsageLimits | null): UsageRow[] {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const meters = root['data'] && typeof root['data'] === 'object'
    ? (root['data'] as Record<string, unknown>)
    : root;

  return Object.entries(meters)
    .flatMap(([metric, raw]) => {
      const used = num(raw);
      if (used === null) return [];
      return [{ metric, used, limit: planLimits?.[metric] ?? null }];
    })
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

/** Monthly recurring revenue across the tenants that have a price on file. */
export function totalMonthlyPrice(rows: TenantAdminRow[]): number | null {
  const priced = rows.filter((r) => r.monthlyPrice !== null);
  // Null rather than 0: a total of zero states that every tenant is free,
  // which is a different fact from no tenant having a plan record.
  if (priced.length === 0) return null;
  return priced.reduce((sum, r) => sum + (r.monthlyPrice ?? 0), 0);
}
