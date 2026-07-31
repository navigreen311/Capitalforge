// ============================================================
// Remove development debris from the database
//
//   npm run clean:dev-data              # dry run
//   npm run clean:dev-data -- --apply   # delete
//
// Two things get cleaned:
//
//   1. Businesses that are not seeded, and everything belonging to them.
//      An interrupted lifecycle walk, or a client created by hand while
//      poking the API, leaves a full graph behind: owner, consent,
//      acknowledgments, funding round, application, ledger history.
//
//   2. Ledger events whose aggregate no longer exists. These have no foreign
//      key, so anything that deleted a record without sweeping them left them
//      pointing at nothing.
//
// `npm run walk` cleans up after itself, so this is for debris that already
// exists — from runs that predate that, from an interrupted run, or from
// manual experimentation.
//
// Seeded rows are identified positively by their `seed-biz-` ids and are
// never touched. Dry run by default.
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_PREFIX = 'seed-biz-';
const apply = process.argv.includes('--apply');
const orphansOnly = process.argv.includes('--orphans-only');

/**
 * Refuse to run anywhere that looks like production.
 *
 * This deletes business records and their ledger history. The name says
 * dev-data, but a name is not a safeguard.
 */
function assertNotProduction(): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to run with NODE_ENV=production.');
  }

  const url = process.env['DATABASE_URL'] ?? '';
  const looksLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal|postgres)[:/]/.test(url);
  if (!looksLocal && apply) {
    throw new Error(
      'DATABASE_URL does not point at a local host. Refusing to delete. '
      + 'Set the URL explicitly if this really is a disposable database.',
    );
  }
}

/** Ids of every row a ledger event could name as its aggregate. */
async function liveAggregateIds(): Promise<Set<string>> {
  const live = new Set<string>();
  const add = (rows: { id: string }[]) => rows.forEach((r) => live.add(r.id));

  add(await prisma.business.findMany({ select: { id: true } }));
  add(await prisma.fundingRound.findMany({ select: { id: true } }));
  add(await prisma.cardApplication.findMany({ select: { id: true } }));
  add(await prisma.suitabilityCheck.findMany({ select: { id: true } }));
  add(await prisma.complianceCheck.findMany({ select: { id: true } }));
  add(await prisma.consentRecord.findMany({ select: { id: true } }));
  add(await prisma.productAcknowledgment.findMany({ select: { id: true } }));
  add(await prisma.document.findMany({ select: { id: true } }));
  add(await prisma.businessOwner.findMany({ select: { id: true } }));
  add(await prisma.achAuthorization.findMany({ select: { id: true } }));
  add(await prisma.tenant.findMany({ select: { id: true } }));
  add(await prisma.user.findMany({ select: { id: true } }));

  return live;
}

async function main(): Promise<void> {
  assertNotProduction();

  const all = await prisma.business.findMany({ select: { id: true, legalName: true } });
  const seeded = all.filter((b) => b.id.startsWith(SEED_PREFIX));
  const targets = orphansOnly ? [] : all.filter((b) => !b.id.startsWith(SEED_PREFIX));
  const ids = targets.map((b) => b.id);

  console.log(apply ? 'CLEAN DEV DATA — APPLYING' : 'CLEAN DEV DATA — DRY RUN (pass --apply to delete)');
  console.log('='.repeat(74));
  console.log(`seeded businesses kept   : ${seeded.length}`);
  for (const b of seeded) console.log(`   keep  ${b.id.padEnd(16)} ${b.legalName}`);

  if (orphansOnly) {
    console.log('\n--orphans-only: businesses will not be touched.');
  } else {
    console.log(`\nnon-seeded businesses    : ${targets.length}`);
    for (const b of targets) console.log(`   drop  ${b.id}  ${b.legalName}`);
  }

  // ── Orphaned ledger events ──────────────────────────────
  // Counted against the ids that will remain, so events belonging to
  // businesses about to be deleted are not double-counted here.
  const live = await liveAggregateIds();
  for (const id of ids) live.delete(id);
  const allEvents = await prisma.ledgerEvent.findMany({ select: { id: true, aggregateId: true, eventType: true } });

  console.log(`\nledger events total      : ${allEvents.length}`);

  // ── Complaints left by the browser suite ────────────────
  //
  // The complaints spec writes real rows tagged "E2E" in the description.
  // Most have no businessId, so the non-seeded-business sweep never reaches
  // them, and they inflate the register's own KPI counts.
  const e2eComplaints = await prisma.complaint.findMany({
    where: { description: { startsWith: 'E2E' } },
    select: { id: true, description: true },
  });

  if (e2eComplaints.length > 0) {
    console.log(`
e2e complaints             : ${e2eComplaints.length}`);
    for (const c of e2eComplaints.slice(0, 5)) console.log(`   drop  ${c.description.slice(0, 60)}`);
    if (e2eComplaints.length > 5) console.log(`   ...and ${e2eComplaints.length - 5} more`);
  }

  // ── Regulator inquiries left by the browser suite ───────
  //
  // The log-inquiry spec writes a real inquiry every run, tagged with an
  // E2E- reference in its title. They have no businessId, so the
  // non-seeded-business sweep above never reaches them and they accumulate
  // one per run — which then inflates the "Active Reg. Inquiries" figure on
  // the complaints page.
  const e2eInquiries = await prisma.regulatoryAlert.findMany({
    where: { title: { contains: 'Inquiry — E2E-' } },
    select: { id: true, title: true },
  });

  if (e2eInquiries.length > 0) {
    console.log(`
e2e regulator inquiries    : ${e2eInquiries.length}`);
    for (const inq of e2eInquiries.slice(0, 5)) console.log(`   drop  ${inq.title}`);
    if (e2eInquiries.length > 5) console.log(`   ...and ${e2eInquiries.length - 5} more`);
  }

  if (!apply) {
    // In a dry run the child rows still exist, so orphan detection would
    // under-report. Report only what can be counted honestly.
    const currentOrphans = allEvents.filter((e) => !live.has(e.aggregateId));
    console.log(`orphaned (incl. targets) : ${currentOrphans.length}`);
    console.log('\nNo changes written.');
    await prisma.$disconnect();
    return;
  }

  const removed: Record<string, number> = {};
  const note = (key: string, count: number) => {
    if (count > 0) removed[key] = count;
  };

  if (ids.length > 0) {
    // Ledger events name their aggregate by id, and emitters do not all pick
    // the business: suitability.assessed records the suitability check's id
    // under aggregateType "compliance". Child ids are gathered before the
    // rows they name are deleted, or the sweep misses them.
    const aggregateIds: string[] = [...ids];
    const collect = (rows: { id: string }[]) => rows.forEach((r) => aggregateIds.push(r.id));

    collect(await prisma.suitabilityCheck.findMany({ where: { businessId: { in: ids } }, select: { id: true } }));
    collect(await prisma.complianceCheck.findMany({ where: { businessId: { in: ids } }, select: { id: true } }));
    collect(await prisma.consentRecord.findMany({ where: { businessId: { in: ids } }, select: { id: true } }));
    collect(await prisma.productAcknowledgment.findMany({ where: { businessId: { in: ids } }, select: { id: true } }));
    collect(await prisma.document.findMany({ where: { businessId: { in: ids } }, select: { id: true } }));
    collect(await prisma.achAuthorization.findMany({ where: { businessId: { in: ids } }, select: { id: true } }));
    collect(await prisma.businessOwner.findMany({ where: { businessId: { in: ids } }, select: { id: true } }));
    collect(await prisma.fundingRound.findMany({ where: { businessId: { in: ids } }, select: { id: true } }));
    collect(await prisma.cardApplication.findMany({ where: { businessId: { in: ids } }, select: { id: true } }));

    // Children before parents — the schema carries real foreign keys.
    const plans = await prisma.repaymentPlan.findMany({ where: { businessId: { in: ids } }, select: { id: true } });
    note('paymentSchedules', (await prisma.paymentSchedule.deleteMany({
      where: { repaymentPlanId: { in: plans.map((p) => p.id) } },
    })).count);
    note('repaymentPlans', (await prisma.repaymentPlan.deleteMany({ where: { businessId: { in: ids } } })).count);

    const tradelines = await prisma.vendorTradeline.findMany({ where: { businessId: { in: ids } }, select: { id: true } });
    note('tradelineDisputes', (await prisma.tradelineDispute.deleteMany({
      where: { tradelineId: { in: tradelines.map((t) => t.id) } },
    })).count);
    note('vendorTradelines', (await prisma.vendorTradeline.deleteMany({ where: { businessId: { in: ids } } })).count);

    const calls = await prisma.voiceCall.findMany({ where: { businessId: { in: ids } }, select: { id: true } });
    const callIds = calls.map((c) => c.id);
    note('callComplianceScans', (await prisma.callComplianceScan.deleteMany({ where: { callId: { in: callIds } } })).count);
    note('callQaScores', (await prisma.callQaScore.deleteMany({ where: { callId: { in: callIds } } })).count);
    note('voiceCalls', (await prisma.voiceCall.deleteMany({ where: { businessId: { in: ids } } })).count);

    // Scoped to the target businesses. SmsMessage is an outreach audit trail,
    // including the records of messages that were withheld, so it is never
    // cleared wholesale.
    note('smsMessages', (await prisma.smsMessage.deleteMany({ where: { businessId: { in: ids } } })).count);

    note('cardApplications', (await prisma.cardApplication.deleteMany({ where: { businessId: { in: ids } } })).count);
    note('fundingRounds', (await prisma.fundingRound.deleteMany({ where: { businessId: { in: ids } } })).count);
    note('businessOwners', (await prisma.businessOwner.deleteMany({ where: { businessId: { in: ids } } })).count);
    note('consentRecords', (await prisma.consentRecord.deleteMany({ where: { businessId: { in: ids } } })).count);
    note('acknowledgments', (await prisma.productAcknowledgment.deleteMany({ where: { businessId: { in: ids } } })).count);
    note('complianceChecks', (await prisma.complianceCheck.deleteMany({ where: { businessId: { in: ids } } })).count);
    note('suitabilityChecks', (await prisma.suitabilityCheck.deleteMany({ where: { businessId: { in: ids } } })).count);
    note('creditProfiles', (await prisma.creditProfile.deleteMany({ where: { businessId: { in: ids } } })).count);
    note('documents', (await prisma.document.deleteMany({ where: { businessId: { in: ids } } })).count);
    note('achAuthorizations', (await prisma.achAuthorization.deleteMany({ where: { businessId: { in: ids } } })).count);

    note('ledgerEventsForTargets', (await prisma.ledgerEvent.deleteMany({
      where: { aggregateId: { in: aggregateIds } },
    })).count);

    note('businesses', (await prisma.business.deleteMany({ where: { id: { in: ids } } })).count);
  }

  if (e2eComplaints.length > 0) {
    note('e2eComplaints', (await prisma.complaint.deleteMany({
      where: { id: { in: e2eComplaints.map((c) => c.id) } },
    })).count);
  }

  if (e2eInquiries.length > 0) {
    note('e2eRegulatorInquiries', (await prisma.regulatoryAlert.deleteMany({
      where: { id: { in: e2eInquiries.map((i) => i.id) } },
    })).count);
  }

  // ── Sweep whatever is still orphaned ────────────────────
  // Recomputed after the deletions, so this catches events left behind by
  // anything else — an earlier tool, a manual delete, an interrupted run.
  const remainingLive = await liveAggregateIds();
  const stillOrphaned = (await prisma.ledgerEvent.findMany({ select: { id: true, aggregateId: true } }))
    .filter((e) => !remainingLive.has(e.aggregateId))
    .map((e) => e.id);

  note('orphanedLedgerEvents', (await prisma.ledgerEvent.deleteMany({ where: { id: { in: stillOrphaned } } })).count);

  console.log('\nDELETED');
  const entries = Object.entries(removed);
  if (entries.length === 0) console.log('  (nothing to remove)');
  for (const [key, value] of entries) console.log(`  ${key.padEnd(26)} ${value}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Clean failed:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
