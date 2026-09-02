// ============================================================
// Three read modules, one router
//
// `business:read` covered a legal name and a date of birth alike, so within
// this router the grant was the only thing separating them. The split is by
// REGULATED DATA ABOUT A NATURAL PERSON — not by sensitivity in general, and
// not by path depth.
//
// Path depth would have got it wrong: /timeline sits at the top level and
// belongs with /owners; /repayment sits at the top level and belongs with the
// business facts. /credit/* is a clean prefix group by coincidence.
// ============================================================

import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ROLES } from '../../../src/shared/constants/index.js';

// The real map, not a copy. A test that restates the role table proves the
// restatement.
import { effectivePermissionsForRole } from '../../../src/backend/middleware/rbac.middleware.js';

describe('the two new permissions', () => {
  it('exist as their own grants', () => {
    expect(PERMISSIONS.BUSINESS_READ_PII).toBe('business:read:pii');
    expect(PERMISSIONS.BUSINESS_READ_CREDIT).toBe('business:read:credit');
  });

  it('are held by the roles that work the client file', () => {
    for (const role of [ROLES.TENANT_ADMIN, ROLES.COMPLIANCE_OFFICER, ROLES.ADVISOR]) {
      const held = effectivePermissionsForRole(role);
      expect(held.has(PERMISSIONS.BUSINESS_READ_PII), `${role} pii`).toBe(true);
      expect(held.has(PERMISSIONS.BUSINESS_READ_CREDIT), `${role} credit`).toBe(true);
    }
  });

  it('are NOT held by readonly or client, which is the point', () => {
    // Both previously reached dates of birth and bureau data with exactly the
    // same permission as an advisor.
    for (const role of [ROLES.READONLY, ROLES.CLIENT]) {
      const held = effectivePermissionsForRole(role);
      expect(held.has(PERMISSIONS.BUSINESS_READ), `${role} floor`).toBe(true);
      expect(held.has(PERMISSIONS.BUSINESS_READ_PII), `${role} pii`).toBe(false);
      expect(held.has(PERMISSIONS.BUSINESS_READ_CREDIT), `${role} credit`).toBe(false);
    }
  });

  it('are held by super admin, via the whole-catalogue grant', () => {
    const held = effectivePermissionsForRole(ROLES.SUPER_ADMIN);
    expect(held.has(PERMISSIONS.BUSINESS_READ_PII)).toBe(true);
    expect(held.has(PERMISSIONS.BUSINESS_READ_CREDIT)).toBe(true);
  });
});
