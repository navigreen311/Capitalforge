// ============================================================
// The Office bridge — the rows its configuration points at
//
// `OFFICE_VENTURE_TENANTS` and `OFFICE_SERVICE_PRINCIPAL_ID` are env vars
// holding database ids. That only works if the rows they name exist, and until
// this file they did not exist anywhere but one developer's machine: both were
// inserted by hand, so `npm run db:seed` on a clean database produced neither
// and the bridge reproduced on no other machine and in no CI run. A
// configuration that looks real and reproduces nowhere is the same shape as
// `venture_forge_manifest`'s two hand-placed rows.
//
// **The ids below are fixed on purpose.** A `@default(uuid())` id would differ
// per machine, and the env vars naming it would then be correct on exactly one
// of them — which is the failure this file exists to close, reintroduced one
// layer down. Every id here is a literal, and `expect()` refuses a row that
// resolved to a different one rather than seeding green over a mismatch.
// ============================================================

import type { PrismaClient } from '@prisma/client';

/**
 * The Burkham Wickmont tenant.
 *
 * The Office addresses a *venture*; CapitalForge is scoped by *tenant*. Neither
 * system knows the other's identifier, so `OFFICE_VENTURE_TENANTS` maps
 * `burkham-wickmont` to this id and an unmapped venture is refused rather than
 * guessed — see `src/backend/config/office.ts`. Guessing would put one tenant's
 * records behind another tenant's venture.
 *
 * The value is not a memorable literal like the user ids below because the row
 * already existed under this id when the seed was written. Re-keying it to
 * something prettier would have meant an UPDATE on a primary key that
 * `OFFICE_VENTURE_TENANTS` already names — the hazard
 * `docs/backlog/incident-2026-08-03-broken-seed.md` is about.
 */
export const BURKHAM_TENANT_ID = 'd96b4fc3-f963-419d-ae9c-daa4fa7d5fba';

/**
 * The service principal every brokered call for a Demo Advisors venture runs as.
 *
 * Retained even though `OFFICE_SERVICE_PRINCIPAL_ID` no longer points here: the
 * row exists, and a venture mapped to `demo-advisors` needs a principal inside
 * that tenant for the same audit reason Burkham has its own.
 */
export const DEMO_BROKER_USER_ID = '0f1ce000-0000-4000-8000-000000000001';

/**
 * The service principal brokered Burkham Wickmont calls run as, and the current
 * value of `OFFICE_SERVICE_PRINCIPAL_ID`.
 *
 * Nothing *enforces* a principal's tenant — `office.routes.ts` mints the token's
 * `tenantId` from the venture map and `auth.middleware.ts` never reads the user
 * row — so the Demo Advisors principal above worked. It read wrong, which is a
 * different problem: `ledger_events.payload.userId` and every `createdBy` on a
 * brokered Burkham call named a Demo Advisors user as the actor. An audit trail
 * that attributes one tenant's writes to another tenant's user is answering the
 * chain-of-custody question incorrectly while looking complete.
 */
export const BURKHAM_BROKER_USER_ID = '0f1ce000-0000-4000-8000-000000000002';

/**
 * Refuses a row that resolved to an id other than the one configuration names.
 *
 * The upserts below key on `slug` and `tenantId_email`, not on `id`, so a
 * database already holding one of these rows under a different id would take
 * the update branch, leave the old id in place and report success. The env var
 * would then name a row that does not exist, and the first symptom would be an
 * FK violation on the first brokered write — far from here, and long after.
 *
 * **What this costs, stated because whoever pays it will be tempted to delete
 * the check.** On a database carrying a legacy row under a different id, this
 * turns a green seed red, and it does so on a machine where nothing was
 * visibly broken a moment earlier. That is the intended trade and not a
 * regression: the alternative is a green seed that leaves
 * `OFFICE_VENTURE_TENANTS` or `OFFICE_SERVICE_PRINCIPAL_ID` pointing at a row
 * which does not exist, and a red seed naming the conflict is strictly better
 * than a green one hiding it. The fix is to reconcile the row — repoint the
 * env var at the id the database actually holds, or re-key the row — never to
 * relax this function.
 */
function expect(label: string, actual: string, wanted: string): void {
  if (actual === wanted) return;
  throw new Error(
    `${label} resolved to ${actual}, but the bridge configuration names ${wanted}. ` +
      'This database holds an older row under a different id. Reconcile it before ' +
      'seeding: OFFICE_VENTURE_TENANTS / OFFICE_SERVICE_PRINCIPAL_ID point at the ' +
      'id above, and a seed that passed here would leave them naming nothing.',
  );
}

export async function seedOfficeBridge(prisma: PrismaClient): Promise<void> {
  const burkham = await prisma.tenant.upsert({
    where: { slug: 'burkham-wickmont' },
    update: {},
    create: {
      id: BURKHAM_TENANT_ID,
      name: 'Burkham Wickmont',
      slug: 'burkham-wickmont',
      plan: 'pro',
      isActive: true,
    },
  });
  expect('Tenant burkham-wickmont', burkham.id, BURKHAM_TENANT_ID);

  // Both principals carry `passwordHash: null`, and that is the point rather
  // than an omission. A null hash cannot satisfy any login path, so these
  // identities exist only to be minted into a token by the adapter and can
  // never be signed into interactively — including by anyone who learns the
  // address. `mfaEnabled` stays false for the same reason: there is no
  // interactive session to protect.
  const demoTenant = await prisma.tenant.findUnique({ where: { slug: 'demo-advisors' } });
  if (demoTenant === null) {
    throw new Error(
      'The demo-advisors tenant does not exist, so its broker principal cannot be ' +
        'seeded. seedOfficeBridge() runs after the main tenant block for this reason.',
    );
  }

  const demoBroker = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: demoTenant.id, email: 'office.broker@demoadvisors.io' } },
    update: {},
    create: {
      id: DEMO_BROKER_USER_ID,
      tenantId: demoTenant.id,
      // Kept as-is rather than moved to a reserved domain like the Burkham
      // address below. `tenantId_email` is the upsert key, so changing it would
      // not rename this row — it would create a second one beside it.
      email: 'office.broker@demoadvisors.io',
      passwordHash: null,
      firstName: 'The Office',
      lastName: 'Broker',
      role: 'office_broker',
      mfaEnabled: false,
      isActive: true,
    },
  });
  expect('User office.broker@demoadvisors.io', demoBroker.id, DEMO_BROKER_USER_ID);

  const burkhamBroker = await prisma.user.upsert({
    where: {
      tenantId_email: { tenantId: BURKHAM_TENANT_ID, email: 'office.broker@burkham-wickmont.invalid' },
    },
    update: {},
    create: {
      id: BURKHAM_BROKER_USER_ID,
      tenantId: BURKHAM_TENANT_ID,
      // `.invalid` is reserved by RFC 2606 and is guaranteed never to resolve,
      // for the same reason the seed phone numbers sit in the NANP fiction
      // block: this system sends mail, and a plausible-looking real address in
      // seed data is one campaign away from reaching a stranger.
      email: 'office.broker@burkham-wickmont.invalid',
      passwordHash: null,
      firstName: 'The Office',
      lastName: 'Broker',
      role: 'office_broker',
      mfaEnabled: false,
      isActive: true,
    },
  });
  expect('User office.broker@burkham-wickmont.invalid', burkhamBroker.id, BURKHAM_BROKER_USER_ID);

  console.log(`  ✓ Office bridge: tenant ${burkham.slug} (${burkham.id})`);
  console.log(`  ✓ Office bridge: principals ${demoBroker.id}, ${burkhamBroker.id}`);
}
