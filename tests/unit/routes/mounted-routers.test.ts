// ============================================================
// Every router file is mounted, or is documented as deliberately not
//
// Twenty-two route files exported a working router that index.ts never
// imported, so 78 endpoints answered 404 — implemented backend that no
// request could reach, behind pages that had given up and hardcoded their
// data instead. Nothing failed when that happened: an unimported module is
// not an error, it is just absent.
//
// This reads index.ts and the dashboard aggregator and fails when a route
// file is reachable from neither, unless it is named below with a reason.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES_DIR = join(process.cwd(), 'src', 'backend', 'api', 'routes');

/**
 * Route files that are intentionally unreachable, and why.
 *
 * A file listed here is a deliberate decision, not an oversight. Removing an
 * entry means mounting it; adding one means justifying it.
 */
const DELIBERATELY_UNMOUNTED: Record<string, string> = {
  'repayment.routes.ts':
    'Backed by repayment.service.ts, which makes no database call: two ' +
    'module-level Maps hold every plan and schedule. Mounting it would ' +
    'publish POST /plan and PUT /schedule/:id/paid — a client recording a ' +
    'payment — and lose all of it on restart, per process. The repayment ' +
    'page reads /api/v1/clients/:id/repayment, which is backed by Prisma.',
};

function routeFiles(): string[] {
  return readdirSync(ROUTES_DIR).filter(
    (name) => name.endsWith('.routes.ts') && name !== 'index.ts',
  );
}

describe('router mounting', () => {
  const index = readFileSync(join(ROUTES_DIR, 'index.ts'), 'utf8');
  // The dashboard routers are mounted through a table here rather than by
  // direct import, so a naive check on index.ts alone reports them missing.
  const dashboardIndex = readFileSync(join(ROUTES_DIR, 'dashboard-index.routes.ts'), 'utf8');

  const isReachable = (file: string): boolean => {
    // Matched on the import specifier, not the bare filename: index.ts also
    // carries a comment naming repayment.routes.ts to record why it is left
    // out, and a substring check read that as evidence it was mounted.
    const specifier = `'./${file.replace('.ts', '.js')}'`;
    return index.includes(specifier) || dashboardIndex.includes(specifier);
  };

  it('finds the route files to check', () => {
    // Guards the test itself: a glob that matches nothing passes everything.
    expect(routeFiles().length).toBeGreaterThan(50);
  });

  it('mounts every router, or records why not', () => {
    const unreachable = routeFiles()
      .filter((file) => !isReachable(file))
      .filter((file) => !(file in DELIBERATELY_UNMOUNTED));

    expect(
      unreachable,
      `These route files are imported nowhere, so every endpoint in them ` +
        `answers 404. Mount them in index.ts, or add them to ` +
        `DELIBERATELY_UNMOUNTED with the reason.`,
    ).toEqual([]);
  });

  it('keeps the deliberate exclusions genuinely unmounted', () => {
    // If one of these is later mounted, the note explaining why it is not
    // becomes untrue and should go with it.
    for (const [file, reason] of Object.entries(DELIBERATELY_UNMOUNTED)) {
      expect(routeFiles(), `${file} no longer exists`).toContain(file);
      expect(isReachable(file), `${file} is now mounted — ${reason}`).toBe(false);
    }
  });

  it('mounts the routers this repair reached, at their documented paths', () => {
    // Spot-checks the eight, so a future edit that drops one is a failure
    // here rather than a 404 found by hand months later.
    const expected: [string, string][] = [
      ['crmRouter', "apiRouter.use('/', crmRouter)"],
      ['regulatoryRouter', "apiRouter.use('/', regulatoryRouter)"],
      ['dealCommitteeRouter', "apiRouter.use('/', dealCommitteeRouter)"],
      ['workflowRouter', "apiRouter.use('/', workflowRouter)"],
      ['achRouter', "apiRouter.use('/', achRouter)"],
      ['graduationRouter', "apiRouter.use('/businesses/:id', graduationRouter)"],
      ['taxReportsRouter', "apiRouter.use('/businesses/:id/tax', taxReportsRouter)"],
      ['createCreditRouter', "apiRouter.use('/businesses/:id/credit', createCreditRouter())"],
    ];

    for (const [name, mount] of expected) {
      expect(index, `${name} is no longer mounted`).toContain(mount);
    }
  });

  it('mounts crm before issuer-rules, so /issuers/contacts is not shadowed', () => {
    // Express matches in registration order. issuerRulesRouter registers
    // /issuers/:id, so with crm second a request for /api/issuers/contacts
    // bound id="contacts" and answered 404 from the issuer lookup.
    const crm = index.indexOf("apiRouter.use('/', crmRouter)");
    const issuerRules = index.indexOf("apiRouter.use('/', issuerRulesRouter)");

    expect(crm).toBeGreaterThan(-1);
    expect(issuerRules).toBeGreaterThan(-1);
    expect(crm, 'crmRouter must be mounted before issuerRulesRouter').toBeLessThan(issuerRules);
  });

  it('mounts decline actions before decline recovery, for the same reason', () => {
    // /declines/:id shadowed /declines/analytics until these were swapped.
    const actions = index.indexOf("apiRouter.use('/', declineActionsRouter)");
    const recovery = index.indexOf("apiRouter.use('/', declineRecoveryRouter)");

    expect(actions).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(-1);
    expect(actions).toBeLessThan(recovery);
  });
});
