// ============================================================
// CapitalForge — is `db:seed` safe to run twice?
//
// A commit collapsed duplicate card products, re-keyed the survivors and added
// @@unique([issuerId, name]). The seeder still upserted on the derived id
// `${issuerId}-${slug(name)}`, which after the re-key matched nothing — so the
// upsert would have fallen through to `create` and hit the constraint. The
// seed was broken by the same commit that broke it, and shipped green: tsc,
// vitest, lint and a live re-run of the feature all passed, because none of
// them rebuild anything. See docs/backlog/incident-2026-08-03-broken-seed.md.
//
// This check would NOT have caught that one, and the distinction matters.
// Measured on a scratch database: the pre-fix seeder run twice against an empty
// table passes, because it creates the long ids and finds them again. The
// failure needed a database where the dedup had already re-keyed the rows —
// which existed only on the developer's machine. CI builds from nothing, so CI
// would have stayed green too.
//
// What this does catch is a seed that cannot run twice at all: a `create` where
// an upsert was meant, a unique constraint that collides on the second pass, a
// guard that rejects rows it just wrote. That is a real failure and nothing
// else looks for it. It is not a substitute for running `npm run db:seed`
// against the database you actually changed — see CLAUDE.md § Verify.
//
// Run against a throwaway database — it writes.
//
//   DATABASE_URL=postgresql://…/capitalforge_seedcheck \
//     npx tsx scripts/check-seed-idempotent.ts
// ============================================================

import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Tables the seed writes that have a natural key worth checking for doubles. */
const NATURAL_KEYS: Array<{ table: string; columns: string[] }> = [
  { table: 'card_products', columns: ['issuerId', 'name'] },
  { table: 'businesses', columns: ['tenantId', 'legalName'] },
  { table: 'users', columns: ['tenantId', 'email'] },
  { table: 'tenants', columns: ['slug'] },
];

function runSeed(pass: number): void {
  console.log(`\n── seed pass ${pass} ──`);
  try {
    execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch {
    throw new Error(
      `Seed pass ${pass} failed. A seed that cannot run twice cannot be run on a `
        + 'database that already has data — which is every environment except a '
        + 'brand new one.',
    );
  }
}

async function snapshot(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { table } of NATURAL_KEYS) {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM "${table}"`,
    );
    counts[table] = Number(rows[0]?.n ?? 0);
  }
  return counts;
}

async function duplicateNaturalKeys(): Promise<string[]> {
  const problems: string[] = [];
  for (const { table, columns } of NATURAL_KEYS) {
    const cols = columns.map((c) => `"${c}"`).join(', ');
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT ${cols}, COUNT(*)::int AS n FROM "${table}" GROUP BY ${cols} HAVING COUNT(*) > 1`,
    );
    for (const r of rows) {
      const key = columns.map((c) => `${c}=${String(r[c])}`).join(' ');
      problems.push(`${table}: ${key} appears ${String(r.n)} times`);
    }
  }
  return problems;
}

async function main(): Promise<void> {
  console.log('Checking that db:seed is idempotent.');
  console.log(`DATABASE_URL host/db: ${(process.env.DATABASE_URL ?? '(unset)').replace(/\/\/[^@]*@/, '//***@')}`);

  runSeed(1);
  const first = await snapshot();
  console.log('\nafter pass 1:', first);

  runSeed(2);
  const second = await snapshot();
  console.log('after pass 2:', second);

  const problems: string[] = [];

  for (const table of Object.keys(first)) {
    if (first[table] !== second[table]) {
      problems.push(
        `${table}: ${first[table]} rows after the first seed, ${second[table]} after the second. `
          + 'The seed is creating where it should be updating — check what it upserts on.',
      );
    }
  }

  problems.push(...(await duplicateNaturalKeys()));

  if (problems.length > 0) {
    console.error('\nSeed is NOT idempotent:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nSeed is idempotent: two runs, identical counts, no duplicate natural keys.');
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
