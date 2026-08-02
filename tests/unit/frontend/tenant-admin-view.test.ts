// ============================================================
// tenant-admin-view — what /api/admin/tenants actually returns
//
// The page held five tenants as literals, with monthly prices, seat counts,
// invoice numbers and activity events. The endpoint returns a tenant record
// and its current plan, and nothing else. These pin that gap: what maps, and
// what has to stay absent rather than be filled with a zero.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toTenantAdminRows,
  toUsageRows,
  totalMonthlyPrice,
} from '../../../src/frontend/lib/tenant-admin-view';

/** Shaped as GET /api/admin/tenants returns it. */
const RESPONSE = {
  success: true,
  data: {
    tenants: [
      {
        id: 'tenant-1',
        name: 'Demo Advisors',
        slug: 'demo',
        plan: 'growth',
        brandConfig: null,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        currentPlan: {
          planName: 'growth',
          moduleEntitlements: { apiAccess: true, ssoEnabled: false },
          usageLimits: { api_calls: 500000, seats: 25 },
          // Decimal crosses JSON as a string.
          monthlyPrice: '3600',
          billingCycle: 'monthly',
          status: 'active',
        },
      },
    ],
    total: 1,
  },
};

describe('toTenantAdminRows', () => {
  it('maps a tenant and its plan', () => {
    expect(toTenantAdminRows(RESPONSE)).toEqual([
      {
        id: 'tenant-1',
        name: 'Demo Advisors',
        slug: 'demo',
        plan: 'growth',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        monthlyPrice: 3600,
        billingCycle: 'monthly',
        planStatus: 'active',
        features: { apiAccess: true, ssoEnabled: false },
        usageLimits: { api_calls: 500000, seats: 25 },
      },
    ]);
  });

  it('reads a Decimal price that arrived as a string', () => {
    const rows = toTenantAdminRows(RESPONSE);
    expect(rows[0]?.monthlyPrice).toBe(3600);
  });

  it('leaves plan figures null for a tenant with no plan record', () => {
    const rows = toTenantAdminRows({
      data: { tenants: [{ id: 't2', name: 'No Plan Co', slug: 'np', plan: 'starter', isActive: true }] },
    });
    // Not zero. A monthly price of 0 says the tenant pays nothing, which is a
    // claim; no plan record says nobody has set one up.
    expect(rows[0]?.monthlyPrice).toBeNull();
    expect(rows[0]?.billingCycle).toBeNull();
    expect(rows[0]?.usageLimits).toBeNull();
    expect(rows[0]?.features).toEqual({});
  });

  it('does not assume a tenant is live when the record omits isActive', () => {
    const rows = toTenantAdminRows({ data: { tenants: [{ id: 't3', name: 'Unknown State Co' }] } });
    expect(rows[0]?.isActive).toBe(false);
  });

  it('returns nothing when the request has not answered', () => {
    expect(toTenantAdminRows(undefined)).toEqual([]);
    expect(toTenantAdminRows(null)).toEqual([]);
    expect(toTenantAdminRows({})).toEqual([]);
  });

  it('accepts a bare array or an unwrapped body', () => {
    expect(toTenantAdminRows(RESPONSE.data.tenants)).toHaveLength(1);
    expect(toTenantAdminRows(RESPONSE.data)).toHaveLength(1);
  });

  it('drops a row with no id or name rather than inventing one', () => {
    const rows = toTenantAdminRows({ data: { tenants: [{ id: 'x' }, { name: 'Nameless' }, null] } });
    expect(rows).toEqual([]);
  });
});

describe('toUsageRows', () => {
  it('pairs a metered total with the plan limit', () => {
    const rows = toUsageRows({ data: { api_calls: 184200 } }, { api_calls: 500000 });
    expect(rows).toEqual([{ metric: 'api_calls', used: 184200, limit: 500000 }]);
  });

  it('leaves the limit null when the plan sets none', () => {
    // The page drew a progress bar, and a bar needs a denominator. Inventing
    // one is how "184,200 of 500,000 calls" appeared for an unmetered tenant.
    const rows = toUsageRows({ data: { storage_gb: 22 } }, { api_calls: 500000 });
    expect(rows).toEqual([{ metric: 'storage_gb', used: 22, limit: null }]);
  });

  it('is empty when nothing has been metered', () => {
    expect(toUsageRows({ data: {} }, { api_calls: 1 })).toEqual([]);
    expect(toUsageRows(undefined, null)).toEqual([]);
  });
});

describe('totalMonthlyPrice', () => {
  it('totals the tenants that have a price', () => {
    const rows = toTenantAdminRows(RESPONSE);
    expect(totalMonthlyPrice(rows)).toBe(3600);
  });

  it('is null when no tenant has a plan on file', () => {
    // Zero would state that every tenant is on a free plan.
    const rows = toTenantAdminRows({ data: { tenants: [{ id: 't2', name: 'No Plan Co' }] } });
    expect(totalMonthlyPrice(rows)).toBeNull();
  });
});
