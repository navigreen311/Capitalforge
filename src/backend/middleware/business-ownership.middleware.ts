// ============================================================
// CapitalForge — the client in the path has to be this tenant's
//
// A path parameter naming a business is the most common way a request asks for
// somebody else's data, and the check that stops it was being written by hand
// in every handler. It went missing in eight handlers on one router — beneficial
// owners with encrypted SSNs, ACH authorisations, both credit profiles — while
// five of their siblings in the same file did carry it. The idiom was known and
// applied unevenly, which is the failure a per-handler fix leaves in place.
//
// So it moves to the mount. `api/routes/index.ts` already establishes which
// prefixes carry a business id — `/businesses/:id/...` and `/clients/:clientId`
// — and that mount table is a fact rather than a guess. Installing the check
// there means a sub-route added tomorrow inherits it without anybody
// remembering.
//
// WHAT IT DOES NOT COVER, AND WHY THAT IS FINE
//
//   Routers mounted at '/' that happen to declare `/businesses/:id/...` in
//   their own paths — funding-round, hardship — are not reached by a mount
//   prefix, because from the mount table's point of view they are mounted at
//   the root. Those keep per-handler scoping, and `scripts/check-route-tenancy.ts`
//   is what stops one from being forgotten.
//
//   POST /businesses is not matched: there is no second path segment, and a
//   business being created cannot be checked for ownership.
//
// A business belonging to another tenant answers exactly as one that does not
// exist. Distinguishing them tells an unauthorised caller which ids are real.
// ============================================================

import type { Response, NextFunction } from 'express';
import type { Request } from '../types/http.js';
import type { ApiResponse } from '../../shared/types/index.js';
import { prisma as sharedPrisma } from '../config/database.js';
import { businessBelongsToTenant } from '../services/business-ownership.js';
import logger from '../config/logger.js';

/**
 * Refuse the request unless the business named by `paramName` belongs to the
 * caller's tenant.
 *
 * Declared per mount, because the parameter is called `:id` under
 * `/businesses` and `:clientId` under `/clients`, and guessing which one a
 * request meant is how this kind of check ends up covering the wrong thing.
 */
export function requireOwnedBusiness(paramName: 'id' | 'clientId') {
  return async function ownershipGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const businessId = req.params[paramName];
    const tenantId = req.tenant?.tenantId;

    // No tenant context means the auth gate has not run or has nothing to say.
    // Refusing here rather than passing through keeps a misordered mount from
    // becoming an open route.
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      };
      res.status(401).json(body);
      return;
    }

    if (!businessId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: 'A business id is required.' },
      };
      res.status(400).json(body);
      return;
    }

    try {
      if (!(await businessBelongsToTenant(sharedPrisma, businessId, tenantId))) {
        const body: ApiResponse = {
          success: false,
          error: { code: 'NOT_FOUND', message: `No business found with id ${businessId}.` },
        };
        res.status(404).json(body);
        return;
      }
    } catch (error) {
      // A check that cannot be evaluated is a refusal. Failing open here would
      // serve another tenant's data on a database hiccup.
      logger.error('Business ownership check failed', { businessId, tenantId, error });
      const body: ApiResponse = {
        success: false,
        error: { code: 'OWNERSHIP_CHECK_FAILED', message: 'Unable to verify the business.' },
      };
      res.status(503).json(body);
      return;
    }

    next();
  };
}
