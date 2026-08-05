// ============================================================
// Track migration impact — read-only, writes nothing
//
// docs/gaps.md 1c: `businessCreditScore` is Math.max over products on
// different scales — PAYDEX 0-100, Intelliscore 1-100, SBSS 0-300 — and the
// result is compared against thresholds that are SBSS figures
// (minBusinessCreditScore 50 for Full Stack, 100 for LOC/SBA Bridge). A PAYDEX
// of 88 is read as an SBSS of 88.
//
// Option A makes every threshold declare the product it reads, so the business
// credit gate reads SBSS or reports unknown. This reports who moves before
// anything changes: a reclassification an advisor cannot see coming is the
// same defect one level up.
//
// Run:  npx tsx <this file>
// ============================================================

import { PrismaClient } from '@prisma/client';
import {
  TRACK_THRESHOLDS,
  GRADUATION_TRACKS,
  resolveCurrentTrack,
  type GraduationInput,
} from '../src/backend/services/client-graduation.service.js';

const prisma = new PrismaClient();

type Track = (typeof GRADUATION_TRACKS)[keyof typeof GRADUATION_TRACKS];

/** The tracks, weakest to strongest, so "moved down" is well defined. */
const ORDER: Track[] = [
  GRADUATION_TRACKS.CREDIT_BUILDER,
  GRADUATION_TRACKS.STARTER_STACK,
  GRADUATION_TRACKS.FULL_STACK,
  GRADUATION_TRACKS.LOC_SBA_BRIDGE,
];

/**
 * Option A's resolver: the business-credit gate reads SBSS, and a client with
 * no SBSS is unknown on it rather than scoring zero.
 *
 * Unknown does not pass. A gate asserts the client clears a specific
 * requirement, and another bureau's score on another scale is not evidence
 * about that requirement.
 */
function resolveTrackOptionA(input: GraduationInput, sbss: number | null): Track {
  let best: Track = GRADUATION_TRACKS.CREDIT_BUILDER;

  for (const track of ORDER) {
    const t = TRACK_THRESHOLDS[track];
    const businessCreditGate =
      t.minBusinessCreditScore === 0
        ? true // the gate is not asserted at all for this track
        : sbss !== null && sbss >= t.minBusinessCreditScore;

    const passes =
      input.ficoScore >= t.minFicoScore &&
      input.businessAgeMonths >= t.minBusinessAgeMonths &&
      input.monthlyRevenue >= t.minMonthlyRevenue &&
      businessCreditGate &&
      input.tradelineCount >= t.minTradelines &&
      input.currentUtilization <= t.maxUtilization;

    if (passes) best = track;
  }

  return best;
}

/** Why the business-credit gate could not be answered, when it could not. */
function gateNote(sbss: number | null, mixedScore: number, sources: string[]): string {
  if (sbss !== null) return `SBSS ${sbss} on record`;
  if (sources.length === 0) return 'no business score of any kind';
  return `no SBSS — the ${mixedScore} came from ${sources.join(', ')}`;
}

async function main(): Promise<void> {
  const businesses = await prisma.business.findMany({
    include: { creditProfiles: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Businesses examined: ${businesses.length}\n`);

  const moves: { name: string; from: Track; to: Track; note: string }[] = [];
  const gateFlipped: { name: string; mixedScore: number; sources: string[]; moved: boolean }[] = [];
  let unchanged = 0;

  for (const biz of businesses) {
    const personal = biz.creditProfiles.filter(
      (p) => p.profileType === 'personal' && p.scoreType === 'fico',
    );
    const ficoScore = personal.length > 0 ? Math.max(...personal.map((p) => p.score ?? 0)) : 0;

    // Exactly the current allowlist.
    const mixed = biz.creditProfiles.filter(
      (p) =>
        p.profileType === 'business' &&
        (p.scoreType === 'sbss' || p.scoreType === 'intelliscore' || p.scoreType === 'paydex'),
    );
    const mixedScore = mixed.length > 0 ? Math.max(...mixed.map((p) => p.score ?? 0)) : 0;
    const sources = [...new Set(mixed.map((p) => `${p.scoreType} ${p.score}`))];

    const sbssRows = biz.creditProfiles.filter(
      (p) => p.profileType === 'business' && p.scoreType === 'sbss',
    );
    const sbss = sbssRows.length > 0 ? Math.max(...sbssRows.map((p) => p.score ?? 0)) : null;

    const ageMonths = biz.dateOfFormation
      ? Math.floor((Date.now() - new Date(biz.dateOfFormation).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : 0;

    const latestBiz = mixed[0] ?? null;
    const tradelines = latestBiz?.tradelines as unknown;
    const tradelineCount = Array.isArray(tradelines) ? tradelines.length : 0;

    const latestPersonal = personal[0] ?? null;
    const currentUtilization = latestPersonal?.utilization ? Number(latestPersonal.utilization) : 0;

    const base = {
      ficoScore,
      businessAgeMonths: ageMonths,
      monthlyRevenue: biz.monthlyRevenue ? Number(biz.monthlyRevenue) : 0,
      tradelineCount,
      currentUtilization,
    };

    const before = resolveCurrentTrack({ ...base, businessCreditScore: mixedScore });
    const after = resolveTrackOptionA({ ...base, businessCreditScore: mixedScore }, sbss);

    // A gate that changes answer but does not change the track: some other
    // requirement already binds. It still matters — the moment that other
    // requirement is satisfied, this one starts holding the client back, so a
    // count of movements alone understates the reach of the change.
    if (sbss === null && mixedScore >= 50) {
      gateFlipped.push({
        name: biz.legalName,
        mixedScore,
        sources,
        moved: before !== after,
      });
    }

    if (before === after) {
      unchanged += 1;
    } else {
      moves.push({
        name: biz.legalName,
        from: before,
        to: after,
        note: gateNote(sbss, mixedScore, sources),
      });
    }
  }

  console.log(`Unchanged: ${unchanged}`);
  console.log(`Moved:     ${moves.length}\n`);

  if (moves.length > 0) {
    console.log('Movements');
    console.log('='.repeat(78));
    for (const m of moves) {
      const direction = ORDER.indexOf(m.to) < ORDER.indexOf(m.from) ? 'DOWN' : 'UP';
      console.log(`  ${direction}  ${m.name}`);
      console.log(`        ${m.from}  ->  ${m.to}`);
      console.log(`        ${m.note}\n`);
    }
  }

  // The population that decides how big this is on real data: a client with a
  // business score but no SBSS is one whose gate becomes unknown.
  let withSbss = 0;
  let withOtherOnly = 0;
  let withNone = 0;

  for (const biz of businesses) {
    const biz_ = biz.creditProfiles.filter((p) => p.profileType === 'business');
    const hasSbss = biz_.some((p) => p.scoreType === 'sbss');
    if (hasSbss) withSbss += 1;
    else if (biz_.length > 0) withOtherOnly += 1;
    else withNone += 1;
  }

  console.log('Business-credit gate flips (passes today, unknown under Option A)');
  console.log('='.repeat(78));
  if (gateFlipped.length === 0) {
    console.log('  none\n');
  } else {
    for (const g of gateFlipped) {
      const effect = g.moved
        ? 'moves track'
        : 'no move today — another gate already binds, but this one will bind once it is met';
      console.log(`  ${g.name}`);
      console.log(`      passes on ${g.sources.join(', ')} (read as ${g.mixedScore})`);
      console.log(`      ${effect}\n`);
    }
  }

  console.log('Business-credit population');
  console.log('='.repeat(78));
  console.log(`  has an SBSS                        : ${withSbss}`);
  console.log(`  business score, but no SBSS        : ${withOtherOnly}   <- gate becomes unknown`);
  console.log(`  no business score at all           : ${withNone}   <- already scored 0`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
