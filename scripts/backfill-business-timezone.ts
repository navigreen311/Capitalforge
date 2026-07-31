// ============================================================
// Backfill Business.timezone
//
//   npx tsx scripts/backfill-business-timezone.ts            # dry run
//   npx tsx scripts/backfill-business-timezone.ts --apply    # write
//
// Quiet-hours checks are evaluated in the recipient's timezone, and a client
// with none on record is not messaged at all. This fills the gap from data
// already held, in descending order of reliability:
//
//   1. the business phone number's area code — the number that would be
//      dialled is direct evidence of where it rings
//   2. a beneficial owner's address — a real postal location, resolved only
//      where the state is unambiguous or the city settles it
//
// stateOfFormation is deliberately NOT used. It records where the entity was
// incorporated, not where it operates: Delaware and Nevada formations are
// routine for businesses trading in other states, so it would produce
// confident and wrong answers for exactly the field that decides whether
// someone is contacted at 3am.
//
// Dry run by default. Rows it cannot resolve are left null, which the
// dispatcher treats as "do not send" — a safe outcome that a wrong guess is
// not.
// ============================================================

import { PrismaClient } from '@prisma/client';
import {
  zoneFromPhone,
  zoneFromAddress,
  isValidTimezone,
  normaliseForLookup,
} from '../src/backend/services/timezone.js';

const prisma = new PrismaClient();

type Source = 'phone_area_code' | 'owner_address' | 'unresolved';

interface Row {
  id: string;
  legalName: string;
  zone: string | null;
  source: Source;
  evidence: string;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      legalName: true,
      phoneNumber: true,
      timezone: true,
      stateOfFormation: true,
      owners: {
        select: { address: true, ownershipPercent: true },
        orderBy: { ownershipPercent: 'desc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const alreadySet = businesses.filter((b) => isValidTimezone(b.timezone));
  const todo = businesses.filter((b) => !isValidTimezone(b.timezone));

  const rows: Row[] = todo.map((b) => {
    // ── 1. phone area code ──
    const fromPhone = zoneFromPhone(normaliseForLookup(b.phoneNumber));
    if (fromPhone) {
      return {
        id: b.id,
        legalName: b.legalName,
        zone: fromPhone,
        source: 'phone_area_code',
        evidence: b.phoneNumber ?? '',
      };
    }

    // ── 2. owner address, largest holder first ──
    for (const owner of b.owners) {
      const address = owner.address as Record<string, unknown> | null;
      if (!address || typeof address !== 'object') continue;

      const state = typeof address['state'] === 'string' ? address['state'] : null;
      const city = typeof address['city'] === 'string' ? address['city'] : null;
      const fromAddress = zoneFromAddress(state, city);

      if (fromAddress) {
        return {
          id: b.id,
          legalName: b.legalName,
          zone: fromAddress,
          source: 'owner_address',
          evidence: [city, state].filter(Boolean).join(', '),
        };
      }
    }

    return {
      id: b.id,
      legalName: b.legalName,
      zone: null,
      source: 'unresolved',
      evidence: b.stateOfFormation
        ? `formed in ${b.stateOfFormation} (not used — formation is not location)`
        : 'no phone, no usable owner address',
    };
  });

  const resolved = rows.filter((r) => r.zone !== null);
  const unresolved = rows.filter((r) => r.zone === null);

  // ── Report ──
  console.log(apply ? 'BACKFILL — APPLYING' : 'BACKFILL — DRY RUN (pass --apply to write)');
  console.log('='.repeat(78));
  console.log(`businesses          : ${businesses.length}`);
  console.log(`already set         : ${alreadySet.length}`);
  console.log(`resolvable          : ${resolved.length}`);
  console.log(`cannot resolve      : ${unresolved.length}`);
  console.log('');

  if (resolved.length > 0) {
    console.log('WOULD SET'.padEnd(24), 'ZONE'.padEnd(22), 'SOURCE'.padEnd(17), 'EVIDENCE');
    console.log('-'.repeat(78));
    for (const r of resolved) {
      console.log(
        r.legalName.slice(0, 22).padEnd(24),
        (r.zone ?? '').padEnd(22),
        r.source.padEnd(17),
        r.evidence,
      );
    }
    console.log('');
  }

  if (unresolved.length > 0) {
    console.log('LEFT NULL (will not be messaged until set)');
    console.log('-'.repeat(78));
    for (const r of unresolved) {
      console.log(`  ${r.legalName.slice(0, 30).padEnd(32)} ${r.evidence}`);
    }
    console.log('');
  }

  if (!apply) {
    console.log('No changes written.');
    await prisma.$disconnect();
    return;
  }

  let written = 0;
  for (const r of resolved) {
    await prisma.business.update({ where: { id: r.id }, data: { timezone: r.zone } });
    written += 1;
  }

  console.log(`Wrote ${written} timezone(s). ${unresolved.length} left null.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Backfill failed:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
