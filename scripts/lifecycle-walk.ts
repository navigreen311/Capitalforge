// ============================================================
// End-to-end lifecycle walk
//
//   npm run walk              # run, then delete everything it created
//   npm run walk -- --keep    # leave the records behind for inspection
//
// Drives one client through the whole funnel against a running server and a
// real database: intake → KYB/KYC → consent → acknowledgments → suitability →
// funding round → application create/submit → round completion.
//
// It creates a business every run, so it cleans up after itself. Without that
// the dev database accumulates one orphaned client per run, each with a
// funding round, an application, and its ledger history — which is exactly
// what happened before this script existed.
//
// Cleanup runs in a finally block so a failed step still tidies up, and is
// scoped by the ids this run created. Nothing else is touched.
// ============================================================

import { PrismaClient } from '@prisma/client';

const BASE = process.env['WALK_BASE_URL'] ?? 'http://127.0.0.1:4000/api';
const TENANT_SLUG = process.env['WALK_TENANT_SLUG'] ?? 'demo-advisors';
const EMAIL = process.env['WALK_EMAIL'] ?? 'admin@demoadvisors.io';
const PASSWORD = process.env['WALK_PASSWORD'] ?? 'DemoPass123!';

const prisma = new PrismaClient();
const keep = process.argv.includes('--keep');

interface StepResult {
  label: string;
  status: number | string;
  detail: string;
}

const steps: StepResult[] = [];
let token = '';
let tenantId = '';

async function call(
  label: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ json: any; status: number }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  let text: string;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    text = await res.text();
  } catch (error) {
    steps.push({
      label,
      status: 'NET_ERR',
      detail: error instanceof Error ? error.message : String(error),
    });
    return { json: null, status: 0 };
  }

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }

  const detail = json?.error
    ? `${json.error.code}: ${json.error.message}`
    : '';
  steps.push({ label, status: res.status, detail });
  return { json, status: res.status };
}

const ADDRESS = {
  street: '4400 Post Oak Pkwy',
  city: 'Houston',
  state: 'TX',
  zip: '77027',
  country: 'US',
};

// Numbers here are in 555-0100–555-0199, the range reserved for fiction, so a
// walk-created client can never be a real phone number reachable by the SMS
// dispatcher.
const WALK_PHONE = '+17135550188';

async function runWalk(): Promise<{ businessId?: string; roundId?: string; applicationId?: string }> {
  // ── Resolve the tenant by slug rather than hardcoding an id, which does
  //    not survive a reseed.
  const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG }, select: { id: true } });
  if (!tenant) throw new Error(`No tenant with slug "${TENANT_SLUG}". Run the seed first.`);
  tenantId = tenant.id;

  const login = await call('login (tenant_admin)', 'POST', '/auth/login', {
    email: EMAIL,
    password: PASSWORD,
    tenantId,
  });
  token = login.json?.data?.accessToken ?? '';
  if (!token) throw new Error('Login failed — cannot continue.');

  // ── Intake ──────────────────────────────────────────────
  const biz = await call('create business', 'POST', '/businesses', {
    legalName: 'Northgate Logistics LLC',
    ein: '87-4412990',
    entityType: 'llc',
    stateOfFormation: 'TX',
    dateOfFormation: '2021-03-15',
    industry: 'Freight Trucking',
    mcc: '4214',
    annualRevenue: 2400000,
    monthlyRevenue: 200000,
  });
  const businessId: string | undefined = biz.json?.data?.business?.id ?? biz.json?.data?.id;
  if (!businessId) throw new Error('Business was not created — cannot continue.');

  // Contact details the outreach path needs. Set directly because the
  // /businesses intake route does not accept them.
  await prisma.business.update({
    where: { id: businessId },
    data: { phoneNumber: WALK_PHONE, timezone: 'America/Chicago' },
  });

  const owner = await call('add owner', 'POST', `/businesses/${businessId}/owners`, {
    firstName: 'Dana',
    lastName: 'Whitfield',
    ownershipPercent: 100,
    ssn: '412-55-8890',
    email: 'dana@northgate.io',
    dateOfBirth: '1982-06-01',
    personalCreditScore: 742,
  });
  const ownerId: string | undefined = owner.json?.data?.owner?.id ?? owner.json?.data?.id;

  await call('readiness', 'GET', `/businesses/${businessId}/readiness`);

  // ── KYB / KYC ───────────────────────────────────────────
  await call('KYB verify', 'POST', `/businesses/${businessId}/verify/kyb`, {
    legalName: 'Northgate Logistics LLC',
    entityType: 'llc',
    ein: '87-4412990',
    stateOfFormation: 'TX',
    dateOfFormation: '2021-03-15',
    registeredAddress: ADDRESS,
    mcc: '4214',
    industry: 'Freight Trucking',
    annualRevenueCents: 240000000,
  });

  if (ownerId) {
    await call('KYC verify', 'POST', `/businesses/${businessId}/verify/kyc/${ownerId}`, {
      firstName: 'Dana',
      lastName: 'Whitfield',
      ownershipPercent: 100,
      ssn: '412-55-8890',
      dateOfBirth: '1982-06-01',
      address: ADDRESS,
    });
  }
  await call('verification status', 'GET', `/businesses/${businessId}/verification-status`);

  // ── Compliance gates ────────────────────────────────────
  await call('grant consent (TCPA)', 'POST', `/businesses/${businessId}/consent`, {
    channel: 'voice',
    consentType: 'tcpa',
    ipAddress: '203.0.113.42',
    evidenceRef: 'webform-lifecycle-walk',
  });
  await call('acknowledgment (PG)', 'POST', `/businesses/${businessId}/acknowledgments`, {
    acknowledgmentType: 'personal_guarantee',
    agreedToCurrentVersion: true,
    signerName: 'Dana Whitfield',
  });
  await call('acknowledgment (prod-reality)', 'POST', `/businesses/${businessId}/acknowledgments`, {
    acknowledgmentType: 'product_reality',
    agreedToCurrentVersion: true,
    signerName: 'Dana Whitfield',
  });
  await call('suitability check', 'POST', `/businesses/${businessId}/suitability/check`, {
    monthlyRevenue: 200000,
    existingDebt: 180000,
    cashFlowRatio: 0.28,
    industry: 'Freight Trucking',
    businessAgeMonths: 64,
    personalCreditScore: 742,
    businessCreditScore: 78,
    activeBankruptcy: false,
    sanctionsMatch: false,
    fraudSuspicion: false,
  });

  // ── Funding round ───────────────────────────────────────
  await call('list rounds (tenant-wide)', 'GET', '/funding-rounds');
  const round = await call('create round', 'POST', '/funding-rounds', {
    businessId,
    targetCredit: 150000,
    targetCardCount: 3,
    issuerMixStrategy: ['chase', 'amex', 'citi'],
    notes: 'Lifecycle walk',
  });
  const roundId: string | undefined = round.json?.data?.id ?? round.json?.data?.round?.id;

  await call('list rounds for business', 'GET', `/businesses/${businessId}/rounds`);
  if (roundId) await call('round detail', 'GET', `/rounds/${roundId}`);
  await call('round-2 eligibility', 'GET', `/businesses/${businessId}/rounds/round2-eligibility`);

  // ── Applications ────────────────────────────────────────
  await call('compliance gate', 'GET', `/applications/compliance-gate/${businessId}`);
  const application = await call('create application', 'POST', '/applications', {
    businessId,
    issuer: 'chase',
    cardProduct: 'Ink Business Preferred',
    requestedLimit: 25000,
    ...(roundId ? { fundingRoundId: roundId } : {}),
  });
  const applicationId: string | undefined = application.json?.data?.id;

  await call('list applications', 'GET', `/businesses/${businessId}/applications`);
  if (applicationId) await call('application detail', 'GET', `/applications/${applicationId}`);
  if (applicationId) {
    await call('submit application', 'POST', `/applications/${applicationId}/submit`, {
      declarations: [true, true, true, true],
    });
  }
  if (roundId) await call('complete round', 'POST', `/rounds/${roundId}/complete`, {});

  return { businessId, roundId, applicationId };
}

/**
 * Delete everything this run created.
 *
 * Scoped to the business id the walk produced, so it cannot reach seeded or
 * pre-existing records. Children go before parents because the schema carries
 * real foreign keys, and ledger events go too: they reference the aggregate by
 * id with no foreign key, so they would otherwise be left pointing at records
 * that no longer exist.
 */
async function cleanup(ids: { businessId?: string; roundId?: string; applicationId?: string }): Promise<void> {
  const { businessId } = ids;
  if (!businessId) return;

  const removed: Record<string, number> = {};
  const note = (key: string, count: number) => {
    if (count > 0) removed[key] = count;
  };

  // Ledger events name their aggregate by id, and emitters do not all choose
  // the business: suitability.assessed, for one, records the suitability
  // check's id under aggregateType "compliance". Collecting every child id
  // before the rows are deleted is what makes the ledger cleanup complete —
  // scoping it to the business id alone leaked one event per run.
  const childAggregateIds: string[] = [];
  const collect = async (rows: { id: string }[]) => {
    for (const row of rows) childAggregateIds.push(row.id);
  };

  await collect(await prisma.suitabilityCheck.findMany({ where: { businessId }, select: { id: true } }));
  await collect(await prisma.complianceCheck.findMany({ where: { businessId }, select: { id: true } }));
  await collect(await prisma.consentRecord.findMany({ where: { businessId }, select: { id: true } }));
  await collect(await prisma.productAcknowledgment.findMany({ where: { businessId }, select: { id: true } }));
  await collect(await prisma.document.findMany({ where: { businessId }, select: { id: true } }));
  await collect(await prisma.achAuthorization.findMany({ where: { businessId }, select: { id: true } }));
  await collect(await prisma.businessOwner.findMany({ where: { businessId }, select: { id: true } }));

  const plans = await prisma.repaymentPlan.findMany({ where: { businessId }, select: { id: true } });
  note('paymentSchedules', (await prisma.paymentSchedule.deleteMany({
    where: { repaymentPlanId: { in: plans.map((p) => p.id) } },
  })).count);
  note('repaymentPlans', (await prisma.repaymentPlan.deleteMany({ where: { businessId } })).count);

  const tradelines = await prisma.vendorTradeline.findMany({ where: { businessId }, select: { id: true } });
  note('tradelineDisputes', (await prisma.tradelineDispute.deleteMany({
    where: { tradelineId: { in: tradelines.map((t) => t.id) } },
  })).count);
  note('vendorTradelines', (await prisma.vendorTradeline.deleteMany({ where: { businessId } })).count);

  const calls = await prisma.voiceCall.findMany({ where: { businessId }, select: { id: true } });
  const callIds = calls.map((c) => c.id);
  note('callComplianceScans', (await prisma.callComplianceScan.deleteMany({ where: { callId: { in: callIds } } })).count);
  note('callQaScores', (await prisma.callQaScore.deleteMany({ where: { callId: { in: callIds } } })).count);
  note('voiceCalls', (await prisma.voiceCall.deleteMany({ where: { businessId } })).count);

  note('smsMessages', (await prisma.smsMessage.deleteMany({ where: { businessId } })).count);
  note('cardApplications', (await prisma.cardApplication.deleteMany({ where: { businessId } })).count);
  note('fundingRounds', (await prisma.fundingRound.deleteMany({ where: { businessId } })).count);
  note('businessOwners', (await prisma.businessOwner.deleteMany({ where: { businessId } })).count);
  note('consentRecords', (await prisma.consentRecord.deleteMany({ where: { businessId } })).count);
  note('acknowledgments', (await prisma.productAcknowledgment.deleteMany({ where: { businessId } })).count);
  note('complianceChecks', (await prisma.complianceCheck.deleteMany({ where: { businessId } })).count);
  note('suitabilityChecks', (await prisma.suitabilityCheck.deleteMany({ where: { businessId } })).count);
  note('creditProfiles', (await prisma.creditProfile.deleteMany({ where: { businessId } })).count);
  note('documents', (await prisma.document.deleteMany({ where: { businessId } })).count);
  note('achAuthorizations', (await prisma.achAuthorization.deleteMany({ where: { businessId } })).count);

  const aggregateIds = [
    ...[ids.businessId, ids.roundId, ids.applicationId].filter(Boolean) as string[],
    ...childAggregateIds,
  ];
  note('ledgerEvents', (await prisma.ledgerEvent.deleteMany({ where: { aggregateId: { in: aggregateIds } } })).count);

  note('businesses', (await prisma.business.deleteMany({ where: { id: businessId } })).count);

  const summary = Object.entries(removed).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`\nCleaned up: ${summary || '(nothing to remove)'}`);
}

async function main(): Promise<void> {
  let ids: { businessId?: string; roundId?: string; applicationId?: string } = {};
  let walkError: unknown = null;

  try {
    ids = await runWalk();
  } catch (error) {
    walkError = error;
  } finally {
    // Runs even when a step throws, so a failed walk does not leave a
    // half-built client behind.
    if (keep) {
      console.log('\n--keep: leaving records in place.');
      console.log(`  business=${ids.businessId} round=${ids.roundId} application=${ids.applicationId}`);
    } else {
      try {
        await cleanup(ids);
      } catch (cleanupError) {
        console.error(
          '\nCleanup failed — these records are still in the database:',
          JSON.stringify(ids),
        );
        console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError);
      }
    }
  }

  console.log('');
  console.log('STEP'.padEnd(32), 'STATUS');
  console.log('-'.repeat(80));
  for (const step of steps) {
    const ok = typeof step.status === 'number' && step.status < 400;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${step.label.padEnd(32)} ${String(step.status).padEnd(6)} ${step.detail}`);
  }

  const failed = steps.filter((s) => !(typeof s.status === 'number' && s.status < 400));
  console.log(`\n${steps.length - failed.length}/${steps.length} steps succeeded.`);

  if (walkError) {
    console.error('\nWalk aborted:', walkError instanceof Error ? walkError.message : walkError);
  }

  await prisma.$disconnect();

  // Non-zero on any failure so this is usable as a check, not just a report.
  if (failed.length > 0 || walkError) process.exit(1);
}

main().catch(async (error) => {
  console.error('Lifecycle walk failed:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
