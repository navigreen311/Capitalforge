// ============================================================
// CapitalForge — reconcile credit_unions.joinFee against the registry
//
// `credit_unions.joinFee` held 50 for first-tech: a figure nothing in this
// codebase could source, which reached the database through the seed and from
// there the Issuers page and the membership-steps endpoint. Six code surfaces
// have since been pointed at CREDIT_UNION_MEMBERSHIP and the seed no longer
// writes its own numbers, but rows already in a database still carry the old
// values.
//
// This reconciles them. It is written as a comparison against the registry
// rather than as `UPDATE ... WHERE slug = 'first-tech'`, for two reasons:
//
//   - It is idempotent, and safe to run against a database somebody already
//     fixed by hand.
//   - It reports every disagreement rather than the one we happen to know
//     about. A targeted UPDATE would have silently left any other drift in
//     place, and drift between a table and a registry is the whole defect.
//
// A cost the registry cannot confirm becomes NULL, never 0. Null means "not
// recorded"; 0 means "no fee". Conflating them is what let an unrecorded fee
// render as "No join fee required." to a client.
//
//   npx tsx scripts/reconcile-credit-union-join-fees.ts          # report only
//   npx tsx scripts/reconcile-credit-union-join-fees.ts --apply  # write
// ============================================================

import { PrismaClient } from '@prisma/client';
import {
  CREDIT_UNION_MEMBERSHIP,
  isCreditUnionIssuer,
  parseIssuer,
  type CreditUnionIssuerId,
} from '../src/shared/constants/issuers.js';

const prisma = new PrismaClient();

/** What the registry says this credit union's fee is, or null if unconfirmed. */
function registryFee(id: CreditUnionIssuerId): number | null {
  const cost = CREDIT_UNION_MEMBERSHIP[id].cost;
  if (cost.kind === 'confirmed') return cost.amount;
  if (cost.kind === 'none') return 0;
  return null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rows = await prisma.creditUnion.findMany({
    select: { id: true, slug: true, name: true, joinFee: true },
    orderBy: { slug: 'asc' },
  });

  const changes: { slug: string; from: number | null; to: number | null }[] = [];
  const unknown: string[] = [];

  for (const row of rows) {
    const parsed = parseIssuer(row.slug);
    if (parsed?.kind !== 'credit_union') {
      // Not in the registry, so there is nothing to reconcile against. Left
      // exactly as it is rather than nulled: this script corrects drift, it
      // does not delete data it has no opinion about.
      if (!isCreditUnionIssuer(row.slug)) unknown.push(row.slug);
      continue;
    }

    const want = registryFee(parsed.id);
    if (row.joinFee === want) continue;
    changes.push({ slug: row.slug, from: row.joinFee, to: want });

    if (apply) {
      await prisma.creditUnion.update({ where: { id: row.id }, data: { joinFee: want } });
    }
  }

  const show = (v: number | null): string => (v === null ? 'NULL (not recorded)' : `$${v}`);

  if (changes.length === 0) {
    console.log(`✓ All ${rows.length} credit unions already agree with the registry.`);
  } else {
    console.log(apply ? 'Applied:' : 'Would change (re-run with --apply):');
    for (const c of changes) {
      console.log(`  ${c.slug.padEnd(18)} ${show(c.from)} → ${show(c.to)}`);
    }
  }

  if (unknown.length > 0) {
    console.log(
      `\nNot in the membership registry, left untouched: ${unknown.join(', ')}.\n` +
        'Add them to CREDIT_UNION_ISSUER_IDS and CREDIT_UNION_MEMBERSHIP if they ' +
        'should be reconciled.',
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
