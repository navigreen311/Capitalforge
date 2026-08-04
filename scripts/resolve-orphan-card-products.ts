// ============================================================
// CapitalForge — one-off: the six card products the dedup left behind
//
// scripts/dedupe-card-products.ts collapsed twelve products duplicated under
// an exact name match. Six rows from the same 2026-08-03 source survived it,
// and all six carry `revenueMinimum: 0` and `businessAgeMinimum: 0` — which
// does not mean "no minimum", it means nobody filled the field in. The
// optimizer reads those as eligibility floors, so a card with zeroes passes
// every revenue and trading-history check for every client.
//
// Two of the six are the same product as a 2026-07-30 row under a slightly
// different name, which the exact-name match could not see:
//
//   "U.S. Bank Business Triple Cash Rewards" = "US Bank Business Triple Cash Rewards"
//   "TD Business Solutions Credit Card"      = "TD Business Solutions Visa"
//
// Both pairs agree on every commercial term — intro APR and length, annual
// fee, rewards rate, score minimum — so they are the same card written twice.
// They are collapsed the same way as the other twelve: keep the 07-30 data,
// adopt the short id.
//
// The remaining four are genuinely new products with no 07-30 counterpart.
// There is no cited source here for their revenue and business-age minimums,
// and inventing plausible-looking numbers for eligibility floors on a funding
// product is worse than not listing the card. They are deactivated with a note
// saying exactly what is missing, so the next person can populate and reinstate
// them rather than rediscover the problem.
//
//   npx tsx scripts/resolve-orphan-card-products.ts           # dry run
//   npx tsx scripts/resolve-orphan-card-products.ts --apply   # write
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

/** Same product, two names. `keepId` holds the researched data. */
const SAME_PRODUCT: Array<{ keepId: string; dropId: string; why: string }> = [
  {
    keepId: 'us_bank-us-bank-business-triple-cash-rewards',
    dropId: 'us-bank-business-triple-cash',
    why: 'Names differ only by "U.S." vs "US". Identical 0% APR for 15 months, '
      + '$0 annual fee, 3% rewards, 660 score minimum.',
  },
  {
    keepId: 'td_bank-td-business-solutions-visa',
    dropId: 'td-business-solutions',
    why: '"Credit Card" vs "Visa" for the same TD product. Identical 0% APR for '
      + '12 months, $0 annual fee, 2% rewards, 620 score minimum.',
  },
];

/**
 * Genuinely new, and unusable until someone supplies eligibility minimums.
 *
 * Deactivated rather than deleted: the products are real and the terms already
 * recorded look right. Only the two floors are missing.
 */
const NEEDS_SOURCING = [
  'capital-one-spark-cash-select',
  'citi-costco-anywhere-business',
  'us-bank-business-leverage',
  'wells-fargo-business-platinum',
];

const SOURCING_NOTE =
  'INACTIVE pending sourcing: revenueMinimum and businessAgeMinimum are 0, which '
  + 'the optimizer reads as "no minimum" — this card would pass every eligibility '
  + 'check for every client. Seeded 2026-08-03 from CARD_CATALOG '
  + '(services/card-products.ts) without those two fields. Populate both from a '
  + 'cited issuer source and set isActive true to reinstate.';

async function main(): Promise<void> {
  console.log('── Same product under two names ──');
  for (const { keepId, dropId, why } of SAME_PRODUCT) {
    const keep = await prisma.cardProduct.findUnique({ where: { id: keepId } });
    const drop = await prisma.cardProduct.findUnique({ where: { id: dropId } });

    if (!keep || !drop) {
      console.log(`  SKIP ${dropId} — already resolved`);
      continue;
    }
    console.log(`  ${keep.name}`);
    console.log(`    keep ${keepId} → re-key to ${dropId}`);
    console.log(`    ${why}`);

    if (!APPLY) continue;
    await prisma.$transaction(async (tx) => {
      await tx.cardProduct.delete({ where: { id: dropId } });
      await tx.cardProduct.update({ where: { id: keepId }, data: { id: dropId } });
    });
  }

  console.log('\n── New products missing eligibility minimums ──');
  for (const id of NEEDS_SOURCING) {
    const row = await prisma.cardProduct.findUnique({ where: { id } });
    if (!row) {
      console.log(`  SKIP ${id} — not found`);
      continue;
    }
    console.log(
      `  ${row.name}: revMin=${row.revenueMinimum} ageMin=${row.businessAgeMinimum}`
      + ` active=${row.isActive} → deactivate`,
    );
    if (!APPLY) continue;
    await prisma.cardProduct.update({
      where: { id },
      data: {
        isActive: false,
        notes: row.notes ? `${SOURCING_NOTE}\n\nPrevious note: ${row.notes}` : SOURCING_NOTE,
      },
    });
  }

  const total = await prisma.cardProduct.count();
  const active = await prisma.cardProduct.count({ where: { isActive: true } });
  const zeroFloors = await prisma.cardProduct.count({
    where: { isActive: true, revenueMinimum: 0, businessAgeMinimum: 0 },
  });
  console.log(`\ntotal ${total} | active ${active} | active rows with both floors at 0: ${zeroFloors}`);
  console.log(APPLY ? 'APPLIED' : 'DRY RUN — nothing written. Re-run with --apply.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
