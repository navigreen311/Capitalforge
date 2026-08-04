// ============================================================
// CapitalForge — one-off: collapse duplicated card products
//
// `prisma/seeds/card-products.ts` seeds from two source lists and derives the
// primary key as `${issuerId}-${slug(name)}`. The two lists spell the issuer
// differently — `capital_one` vs `capital-one`, `bank_of_america` vs `boa` —
// so the same product was written twice under two ids. The optimizer read both
// and recommended one product at rank 1 and rank 2 of the same plan, with
// different scores, because the rows disagreed on almost every field.
//
// The 2026-07-30 rows are kept: they carry real eligibility minimums, real
// welcome-bonus values, and the issuer-rule notes (Chase 5/24, Amex 2/90) the
// velocity work needs. The 2026-08-03 rows have revenueMinimum 0 and
// businessAgeMinimum 0 across the board, which means they bypass the
// eligibility filters rather than applying them.
//
// The short ids are kept, because `services/card-products.ts` references them
// and nothing references the long form. Re-keying is safe: CardProduct has no
// incoming foreign keys, and no CardApplication row names any of these
// products.
//
// Also normalises rewardsRate to percent — see REWARDS_RATE_UNIT below.
//
//   npx tsx scripts/dedupe-card-products.ts           # dry run
//   npx tsx scripts/dedupe-card-products.ts --apply   # write
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

/**
 * rewardsRate is a PERCENT: 2 means 2% cash back, 1.5 means 1.5x points.
 *
 * Both conventions were in the table — 28 rows as percent, 12 as a fraction —
 * for the same products. The optimizer's rewards scoring and the card list
 * both treat the number as a percent, which is why a duplicated row rendered
 * "0.02% cash back" next to "2% cash back" for one card.
 *
 * Percent wins because it is what the majority of rows, the renderer, and the
 * scorer already assume. Anything below this threshold is a fraction that was
 * never converted.
 */
const FRACTION_CEILING = 1;

async function main(): Promise<void> {
  const all = await prisma.cardProduct.findMany({ orderBy: { createdAt: 'asc' } });

  // ── 1. Collapse exact-name duplicates ────────────────────────
  const byName = new Map<string, typeof all>();
  for (const c of all) {
    const key = c.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), c]);
  }

  const pairs = [...byName.values()].filter((rows) => rows.length > 1);
  console.log(`duplicate name groups: ${pairs.length}`);

  for (const rows of pairs) {
    const keep = rows.find((r) => r.createdAt.toISOString().startsWith('2026-07-30'));
    const drop = rows.filter((r) => r !== keep);

    if (!keep || drop.length === 0) {
      console.log(`  SKIP "${rows[0].name}" — no 2026-07-30 row to keep, leaving both alone`);
      continue;
    }
    // The id to adopt is the one the application code references.
    const targetId = drop[0].id;

    console.log(`  ${rows[0].name}`);
    console.log(`    keep ${keep.id}  →  re-key to ${targetId}`);
    console.log(`    drop ${drop.map((d) => d.id).join(', ')}`);

    if (!APPLY) continue;

    // Delete first: the id being adopted is currently taken by the row going
    // away, and it is the primary key.
    await prisma.$transaction(async (tx) => {
      await tx.cardProduct.deleteMany({ where: { id: { in: drop.map((d) => d.id) } } });
      await tx.cardProduct.update({ where: { id: keep.id }, data: { id: targetId } });
    });
  }

  // ── 2. Normalise rewardsRate to percent ──────────────────────
  const remaining = await prisma.cardProduct.findMany();
  const fractions = remaining.filter(
    (c) => c.rewardsRate !== null && Number(c.rewardsRate) > 0 && Number(c.rewardsRate) < FRACTION_CEILING,
  );

  console.log(`\nrewardsRate stored as a fraction: ${fractions.length}`);
  for (const c of fractions) {
    const asPercent = Number(c.rewardsRate) * 100;
    console.log(`  ${c.id}: ${c.rewardsRate} → ${asPercent}`);
    if (APPLY) {
      await prisma.cardProduct.update({ where: { id: c.id }, data: { rewardsRate: asPercent } });
    }
  }

  const after = await prisma.cardProduct.findMany({ select: { id: true, rewardsRate: true } });
  const stillFraction = after.filter(
    (c) => c.rewardsRate !== null && Number(c.rewardsRate) > 0 && Number(c.rewardsRate) < FRACTION_CEILING,
  );
  console.log(`\ntotal products: ${after.length}`);
  console.log(`rows still holding a fraction: ${stillFraction.length}`);
  console.log(APPLY ? 'APPLIED' : 'DRY RUN — nothing written. Re-run with --apply.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
