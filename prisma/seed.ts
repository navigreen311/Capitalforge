// ============================================================
// CapitalForge — Prisma Seed Script
// Run: npm run db:seed   (tsx prisma/seed.ts)
//
// Creates:
//   • 1 demo tenant + admin user
//   • 3 sample businesses with owners
//   • credit profiles per business
//   • funding rounds + card applications
//   • consent records, compliance checks, product acknowledgments
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedIssuerRules } from './seeds/issuer-rules.js';
import { seedCardProducts } from './seeds/card-products.js';
// The disclosure text itself lives with the service that renders it. Imported
// rather than copied: a disclosure is legal text, and two copies of it that
// can drift is the wrong shape for something a client is handed.
import { SEED_TEMPLATES } from '../src/backend/services/disclosure-cms.service.js';

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────

function d(iso: string): Date {
  return new Date(iso);
}

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

// ── Main seed ─────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Seeding CapitalForge demo data...');

  // ── Tenant ────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-advisors' },
    update: {},
    create: {
      name: 'Demo Advisors LLC',
      slug: 'demo-advisors',
      plan: 'pro',
      isActive: true,
      brandConfig: {
        primaryColor: '#1E40AF',
        logoUrl: 'https://demo.capitalforge.io/logo.png',
        supportEmail: 'support@demoadvisors.io',
      },
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (${tenant.id})`);

  // ── Users ─────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('DemoPass123!', 12);

  const adminUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demoadvisors.io' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demoadvisors.io',
      passwordHash,
      firstName: 'Alexandra',
      lastName: 'Torres',
      role: 'tenant_admin',
      mfaEnabled: true,
      isActive: true,
    },
  });

  const advisorUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'advisor@demoadvisors.io' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'advisor@demoadvisors.io',
      passwordHash,
      firstName: 'Marcus',
      lastName: 'Whitfield',
      role: 'advisor',
      mfaEnabled: false,
      isActive: true,
    },
  });
  console.log(`  ✓ Users: ${adminUser.email}, ${advisorUser.email}`);

  // ── Businesses ────────────────────────────────────────────

  // Business 1 — Established LLC, ready for stacking

// ── Seed phone numbers ───────────────────────────────────────
//
// Every number below is in 555-0100–555-0199, the block the North American
// Numbering Plan reserves for fiction. They are guaranteed never to be
// assigned to a real subscriber, which matters here because this system can
// now send SMS: a plausible-looking real number in seed data is one campaign
// away from texting a stranger.
//
// The area codes match each business's owner address, so the timezone
// inferred from the number agrees with the one stored on the record.

const SEED_PHONES = {
  biz1: '+13025550101', // Wilmington, DE  → America/New_York
  biz2: '+13055550102', // Miami, FL       → America/New_York
  biz3: '+17135550103', // Houston, TX     → America/Chicago
} as const;

  const biz1 = await prisma.business.upsert({
    where: { id: 'seed-biz-001' },
    // Applied on re-seed as well as on create: rows that predate these
    // columns need them, and without a timezone a client is never messaged.
    update: { phoneNumber: SEED_PHONES.biz1, timezone: 'America/New_York' },
    create: {
      id: 'seed-biz-001',
      phoneNumber: SEED_PHONES.biz1,
      timezone: 'America/New_York',
      tenantId: tenant.id,
      advisorId: advisorUser.id,
      legalName: 'Apex Digital Solutions LLC',
      dba: 'Apex Digital',
      ein: '47-3821654',
      entityType: 'llc',
      stateOfFormation: 'DE',
      dateOfFormation: d('2019-03-15'),
      mcc: '7372',
      industry: 'Technology Services',
      annualRevenue: dec('840000'),
      monthlyRevenue: dec('70000'),
      fundingReadinessScore: 88,
      status: 'active',
    },
  });

  // Business 2 — S-Corp, mid-stage onboarding
  const biz2 = await prisma.business.upsert({
    where: { id: 'seed-biz-002' },
    // Applied on re-seed as well as on create: rows that predate these
    // columns need them, and without a timezone a client is never messaged.
    update: { phoneNumber: SEED_PHONES.biz2, timezone: 'America/New_York' },
    create: {
      id: 'seed-biz-002',
      phoneNumber: SEED_PHONES.biz2,
      timezone: 'America/New_York',
      tenantId: tenant.id,
      advisorId: advisorUser.id,
      legalName: 'Meridian Health & Wellness S Corp',
      dba: 'Meridian Wellness',
      ein: '83-1047299',
      entityType: 's_corp',
      stateOfFormation: 'FL',
      dateOfFormation: d('2021-07-01'),
      mcc: '8099',
      industry: 'Health & Wellness',
      annualRevenue: dec('360000'),
      monthlyRevenue: dec('30000'),
      fundingReadinessScore: 65,
      status: 'onboarding',
    },
  });

  // Business 3 — C-Corp, early intake
  const biz3 = await prisma.business.upsert({
    where: { id: 'seed-biz-003' },
    // Applied on re-seed as well as on create: rows that predate these
    // columns need them, and without a timezone a client is never messaged.
    update: { phoneNumber: SEED_PHONES.biz3, timezone: 'America/Chicago' },
    create: {
      id: 'seed-biz-003',
      phoneNumber: SEED_PHONES.biz3,
      timezone: 'America/Chicago',
      tenantId: tenant.id,
      advisorId: null,
      legalName: 'Ironclad Logistics Inc',
      dba: 'Ironclad',
      ein: '61-9234801',
      entityType: 'c_corp',
      stateOfFormation: 'TX',
      dateOfFormation: d('2022-11-20'),
      mcc: '4731',
      industry: 'Freight & Logistics',
      annualRevenue: dec('1200000'),
      monthlyRevenue: dec('100000'),
      fundingReadinessScore: 74,
      status: 'intake',
    },
  });
  console.log(`  ✓ Businesses: ${biz1.legalName}, ${biz2.legalName}, ${biz3.legalName}`);

  // ── Business Owners ───────────────────────────────────────

  await prisma.businessOwner.upsert({
    where: { id: 'seed-owner-001' },
    update: {},
    create: {
      id: 'seed-owner-001',
      businessId: biz1.id,
      firstName: 'Jordan',
      lastName: 'Patel',
      ownershipPercent: dec('100'),
      dateOfBirth: d('1985-06-22'),
      address: {
        street: '4210 Innovation Drive',
        city: 'Wilmington',
        state: 'DE',
        zip: '19801',
        country: 'US',
      },
      isBeneficialOwner: true,
      kycStatus: 'verified',
      kycVerifiedAt: d('2023-08-10'),
    },
  });

  await prisma.businessOwner.upsert({
    where: { id: 'seed-owner-002' },
    update: {},
    create: {
      id: 'seed-owner-002',
      businessId: biz2.id,
      firstName: 'Simone',
      lastName: 'Ramirez',
      ownershipPercent: dec('60'),
      dateOfBirth: d('1979-11-03'),
      address: {
        street: '880 Brickell Ave, Ste 1200',
        city: 'Miami',
        state: 'FL',
        zip: '33131',
        country: 'US',
      },
      isBeneficialOwner: true,
      kycStatus: 'pending',
    },
  });

  await prisma.businessOwner.upsert({
    where: { id: 'seed-owner-003' },
    update: {},
    create: {
      id: 'seed-owner-003',
      businessId: biz2.id,
      firstName: 'Derek',
      lastName: 'Nguyen',
      ownershipPercent: dec('40'),
      dateOfBirth: d('1983-02-17'),
      address: {
        street: '1600 Bayshore Blvd',
        city: 'Tampa',
        state: 'FL',
        zip: '33606',
        country: 'US',
      },
      isBeneficialOwner: true,
      kycStatus: 'pending',
    },
  });

  await prisma.businessOwner.upsert({
    where: { id: 'seed-owner-004' },
    update: {},
    create: {
      id: 'seed-owner-004',
      businessId: biz3.id,
      firstName: 'Chandra',
      lastName: 'Williams',
      ownershipPercent: dec('75'),
      dateOfBirth: d('1975-09-14'),
      address: {
        street: '2500 Commerce Tower',
        city: 'Houston',
        state: 'TX',
        zip: '77002',
        country: 'US',
      },
      isBeneficialOwner: true,
      kycStatus: 'verified',
      kycVerifiedAt: d('2024-02-28'),
    },
  });
  console.log('  ✓ Business owners created');

  // ── Credit Profiles ───────────────────────────────────────

  // Biz 1: strong personal + business credit
  await prisma.creditProfile.upsert({
    where: { id: 'seed-cp-001' },
    update: {},
    create: {
      id: 'seed-cp-001',
      businessId: biz1.id,
      profileType: 'personal',
      bureau: 'experian',
      score: 762,
      scoreType: 'fico',
      utilization: dec('0.14'),
      inquiryCount: 2,
      derogatoryCount: 0,
      tradelines: { accounts: 18, avgAge: 9.4, revolving: 6, installment: 4 },
      pulledAt: d('2026-03-01'),
    },
  });

  await prisma.creditProfile.upsert({
    where: { id: 'seed-cp-002' },
    update: {},
    create: {
      id: 'seed-cp-002',
      businessId: biz1.id,
      profileType: 'business',
      bureau: 'dnb',
      score: 80,
      scoreType: 'paydex',
      utilization: dec('0.22'),
      inquiryCount: 1,
      derogatoryCount: 0,
      tradelines: { vendors: 12, avgDaysBeyondTerms: 0 },
      pulledAt: d('2026-03-01'),
    },
  });

  // Biz 2: moderate personal, no business file yet
  await prisma.creditProfile.upsert({
    where: { id: 'seed-cp-003' },
    update: {},
    create: {
      id: 'seed-cp-003',
      businessId: biz2.id,
      profileType: 'personal',
      bureau: 'transunion',
      score: 694,
      scoreType: 'fico',
      utilization: dec('0.38'),
      inquiryCount: 5,
      derogatoryCount: 1,
      tradelines: { accounts: 10, avgAge: 6.2, revolving: 4, installment: 3 },
      pulledAt: d('2026-02-15'),
    },
  });

  // Biz 3: strong personal FICO, new business
  await prisma.creditProfile.upsert({
    where: { id: 'seed-cp-004' },
    update: {},
    create: {
      id: 'seed-cp-004',
      businessId: biz3.id,
      profileType: 'personal',
      bureau: 'equifax',
      score: 741,
      scoreType: 'fico',
      utilization: dec('0.19'),
      inquiryCount: 3,
      derogatoryCount: 0,
      tradelines: { accounts: 14, avgAge: 11.1, revolving: 5, installment: 6 },
      pulledAt: d('2026-03-10'),
    },
  });
  console.log('  ✓ Credit profiles created');

  // ── Funding Rounds ────────────────────────────────────────

  const round1 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: biz1.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: biz1.id,
      roundNumber: 1,
      targetCredit: dec('150000'),
      targetCardCount: 5,
      status: 'completed',
      aprExpiryDate: d('2026-08-15'),
      alertSent60: true,
      alertSent30: false,
      alertSent15: false,
      startedAt: d('2025-09-01'),
      completedAt: d('2025-10-12'),
    },
  });

  const round2 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: biz1.id, roundNumber: 2 } },
    update: {},
    create: {
      businessId: biz1.id,
      roundNumber: 2,
      targetCredit: dec('200000'),
      targetCardCount: 6,
      status: 'in_progress',
      aprExpiryDate: d('2027-03-01'),
      startedAt: d('2026-01-15'),
    },
  });

  const round3 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: biz2.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: biz2.id,
      roundNumber: 1,
      targetCredit: dec('75000'),
      targetCardCount: 3,
      status: 'planning',
    },
  });
  console.log(`  ✓ Funding rounds: ${round1.id}, ${round2.id}, ${round3.id}`);

  // ── Card Applications ─────────────────────────────────────

  await prisma.cardApplication.upsert({
    where: { id: 'seed-app-001' },
    update: {},
    create: {
      id: 'seed-app-001',
      businessId: biz1.id,
      fundingRoundId: round1.id,
      issuer: 'Chase',
      cardProduct: 'Ink Business Preferred',
      status: 'approved',
      creditLimit: dec('45000'),
      introApr: dec('0'),
      introAprExpiry: d('2026-10-12'),
      regularApr: dec('0.2124'),
      annualFee: dec('95'),
      cashAdvanceFee: dec('0.05'),
      consentCapturedAt: d('2025-09-05'),
      submittedAt: d('2025-09-06'),
      decidedAt: d('2025-09-08'),
    },
  });

  await prisma.cardApplication.upsert({
    where: { id: 'seed-app-002' },
    update: {},
    create: {
      id: 'seed-app-002',
      businessId: biz1.id,
      fundingRoundId: round1.id,
      issuer: 'American Express',
      cardProduct: 'Blue Business Cash',
      status: 'approved',
      creditLimit: dec('35000'),
      introApr: dec('0'),
      introAprExpiry: d('2026-10-12'),
      regularApr: dec('0.1849'),
      annualFee: dec('0'),
      cashAdvanceFee: dec('0.05'),
      consentCapturedAt: d('2025-09-05'),
      submittedAt: d('2025-09-06'),
      decidedAt: d('2025-09-10'),
    },
  });

  await prisma.cardApplication.upsert({
    where: { id: 'seed-app-003' },
    update: {},
    create: {
      id: 'seed-app-003',
      businessId: biz1.id,
      fundingRoundId: round2.id,
      issuer: 'Capital One',
      cardProduct: 'Spark Cash Plus',
      status: 'submitted',
      introApr: dec('0'),
      introAprExpiry: d('2027-03-15'),
      regularApr: dec('0.2099'),
      annualFee: dec('150'),
      consentCapturedAt: d('2026-01-20'),
      submittedAt: d('2026-01-21'),
    },
  });

  await prisma.cardApplication.upsert({
    where: { id: 'seed-app-004' },
    update: {},
    create: {
      id: 'seed-app-004',
      businessId: biz1.id,
      fundingRoundId: round2.id,
      issuer: 'Bank of America',
      cardProduct: 'Business Advantage Unlimited',
      status: 'declined',
      // The amount this application was for. A declined application still had
      // a figure attached, and the pipeline board must leave it out of
      // Pipeline Value — refused credit is not credit in play. Seeded with an
      // amount so that exclusion is observable rather than assumed.
      creditLimit: dec('20000'),
      declineReason: 'Too many recent inquiries',
      adverseActionNotice: {
        reason: 'Excessive inquiries in last 12 months',
        issuedAt: '2026-01-25',
        creditBureau: 'Experian',
      },
      consentCapturedAt: d('2026-01-20'),
      submittedAt: d('2026-01-21'),
      decidedAt: d('2026-01-25'),
    },
  });
  // Two further declines, so the recovery board has a resolved outcome at
  // each end and a win rate that means something. Both are real declined
  // applications; the recovery records below point at them.
  await prisma.cardApplication.upsert({
    where: { id: 'seed-app-005' },
    update: {},
    create: {
      id: 'seed-app-005',
      businessId: biz2.id,
      fundingRoundId: round2.id,
      issuer: 'US Bank',
      cardProduct: 'Business Altitude Connect',
      status: 'declined',
      creditLimit: dec('18000'),
      declineReason: 'Personal revolving utilization above issuer threshold',
      consentCapturedAt: d('2026-02-25'),
      submittedAt: d('2026-02-26'),
      decidedAt: d('2026-02-28'),
    },
  });

  // Declined, taken to reconsideration, and reversed — so this one is
  // approved now. The decline recovery record below records how it got here.
  await prisma.cardApplication.upsert({
    where: { id: 'seed-app-006' },
    update: {},
    create: {
      id: 'seed-app-006',
      businessId: biz1.id,
      fundingRoundId: round2.id,
      issuer: 'Citi',
      cardProduct: 'Citi Business Platinum',
      status: 'approved',
      creditLimit: dec('15000'),
      regularApr: dec('0.2199'),
      annualFee: dec('0'),
      consentCapturedAt: d('2026-01-10'),
      submittedAt: d('2026-01-11'),
      decidedAt: d('2026-02-05'),
    },
  });
  // Declined, and deliberately absent from the Section 1071 register below.
  // That gap is what the decision register exists to surface: a credit
  // decision that was made and never recorded where 1071 requires it.
  await prisma.cardApplication.upsert({
    where: { id: 'seed-app-007' },
    update: {},
    create: {
      id: 'seed-app-007',
      businessId: biz3.id,
      fundingRoundId: round3.id,
      issuer: 'Wells Fargo',
      cardProduct: 'Business Platinum Credit Card',
      status: 'declined',
      creditLimit: dec('12000'),
      declineReason: 'Insufficient time in business',
      consentCapturedAt: d('2026-03-02'),
      submittedAt: d('2026-03-03'),
      decidedAt: d('2026-03-09'),
    },
  });
  console.log('  ✓ Card applications created');

  // ── Decline Recovery ──────────────────────────────────────
  //
  // One record per declined application, which is what the recovery board
  // reads. The board used to carry seven of these hardcoded in the page
  // component, for clients that do not exist.

  await prisma.declineRecovery.upsert({
    where: { id: 'seed-decline-001' },
    update: {},
    create: {
      id: 'seed-decline-001',
      tenantId: tenant.id,
      businessId: biz1.id,
      applicationId: 'seed-app-004',
      issuer: 'Bank of America',
      declineReasons: {
        primary: 'Too many recent inquiries',
        card_name: 'Business Advantage Unlimited',
        requested_limit: 20000,
        declined_at: '2026-01-25T00:00:00.000Z',
      },
      adverseActionRaw:
        'Excessive inquiries in last 12 months. Credit bureau: Experian.',
      reconsiderationStatus: 'letter_sent',
      letterGenerated: true,
      // Bank of America asks for 30 days before a reapplication.
      reapplyCooldownDate: d('2026-02-24'),
      recoveryStage: 'letter_sent',
    },
  });

  await prisma.declineRecovery.upsert({
    where: { id: 'seed-decline-002' },
    update: {},
    create: {
      id: 'seed-decline-002',
      tenantId: tenant.id,
      businessId: biz2.id,
      applicationId: 'seed-app-005',
      issuer: 'US Bank',
      declineReasons: {
        primary: 'High utilization',
        card_name: 'Business Altitude Connect',
        requested_limit: 18000,
        declined_at: '2026-02-28T00:00:00.000Z',
      },
      reconsiderationStatus: 'denied',
      reconsiderationNotes: 'Reconsideration call declined; utilization unchanged at review.',
      letterGenerated: true,
      reapplyCooldownDate: d('2026-05-29'),
      recoveryStage: 'lost',
      resolvedAt: d('2026-03-14'),
    },
  });

  await prisma.declineRecovery.upsert({
    where: { id: 'seed-decline-003' },
    update: {},
    create: {
      id: 'seed-decline-003',
      tenantId: tenant.id,
      businessId: biz1.id,
      applicationId: 'seed-app-006',
      issuer: 'Citi',
      declineReasons: {
        primary: 'Thin business credit file',
        card_name: 'Citi Business Platinum',
        requested_limit: 15000,
        declined_at: '2026-01-14T00:00:00.000Z',
      },
      reconsiderationStatus: 'approved',
      reconsiderationNotes: 'Reversed on reconsideration after trade references supplied.',
      letterGenerated: true,
      recoveryStage: 'won',
      resolvedAt: d('2026-02-05'),
    },
  });
  console.log('  ✓ Decline recovery records created');

  // ── Section 1071 / Fair Lending Records ───────────────────
  //
  // One per credit decision, which is what Regulation B requires and what the
  // fair-lending dashboard reports on. The page used to display an approval
  // rate by race, gender and ownership from ten hardcoded buckets while this
  // table was empty.
  //
  // Demographic data is deliberately present on some records and absent on
  // others: collection is voluntary for the applicant, so a completion rate
  // below 100% is the normal state, and it is the figure the dashboard exists
  // to surface. Every value here is synthetic.
  const fairLending: {
    id: string;
    businessId: string;
    applicationId: string;
    creditPurpose: string;
    actionTaken: string;
    actionDate: Date;
    // Prisma.InputJsonValue rather than string[] / Record: the Json columns
    // will not accept a bare structural type through a conditional spread.
    adverseReasons?: Prisma.InputJsonValue;
    demographicData?: Prisma.InputJsonValue;
    businessType: string;
  }[] = [
    {
      id: 'seed-1071-001',
      businessId: biz1.id,
      applicationId: 'seed-app-001',
      creditPurpose: 'working_capital',
      actionTaken: 'approved_and_originated',
      actionDate: d('2025-09-08'),
      demographicData: {
        ownerSex: 'declined_to_provide',
        ownerEthnicity: 'declined_to_provide',
        numberOfOwners: 2,
        lgbtqiOwned: null,
      },
      businessType: 'llc',
    },
    {
      id: 'seed-1071-002',
      businessId: biz1.id,
      applicationId: 'seed-app-002',
      creditPurpose: 'working_capital',
      actionTaken: 'approved_and_originated',
      actionDate: d('2025-09-10'),
      // The applicant did not answer. Recorded as absent rather than guessed.
      businessType: 'llc',
    },
    {
      id: 'seed-1071-003',
      businessId: biz1.id,
      applicationId: 'seed-app-004',
      creditPurpose: 'equipment',
      actionTaken: 'denied',
      actionDate: d('2026-01-25'),
      adverseReasons: ['Too many recent inquiries'],
      demographicData: {
        ownerSex: 'declined_to_provide',
        ownerEthnicity: 'declined_to_provide',
        numberOfOwners: 2,
        lgbtqiOwned: null,
      },
      businessType: 'llc',
    },
    {
      id: 'seed-1071-004',
      businessId: biz2.id,
      applicationId: 'seed-app-005',
      creditPurpose: 'working_capital',
      actionTaken: 'denied',
      actionDate: d('2026-02-28'),
      adverseReasons: ['Personal revolving utilization above issuer threshold'],
      businessType: 's_corp',
    },
    {
      id: 'seed-1071-005',
      businessId: biz1.id,
      applicationId: 'seed-app-006',
      creditPurpose: 'working_capital',
      actionTaken: 'approved_and_originated',
      actionDate: d('2026-02-05'),
      demographicData: {
        ownerSex: 'declined_to_provide',
        ownerEthnicity: 'declined_to_provide',
        numberOfOwners: 2,
        lgbtqiOwned: null,
      },
      businessType: 'llc',
    },
    {
      id: 'seed-1071-006',
      businessId: biz2.id,
      applicationId: 'seed-app-003',
      creditPurpose: 'expansion',
      actionTaken: 'withdrawn_by_applicant',
      actionDate: d('2026-03-11'),
      businessType: 's_corp',
    },
  ];

  for (const record of fairLending) {
    await prisma.fairLendingRecord.upsert({
      where: { id: record.id },
      update: {},
      create: {
        id: record.id,
        tenantId: tenant.id,
        businessId: record.businessId,
        applicationId: record.applicationId,
        creditPurpose: record.creditPurpose,
        actionTaken: record.actionTaken,
        actionDate: record.actionDate,
        businessType: record.businessType,
        ...(record.adverseReasons === undefined ? {} : { adverseReasons: record.adverseReasons }),
        ...(record.demographicData === undefined
          ? {}
          : { demographicData: record.demographicData }),
        // Firewalled from underwriting, per Regulation B.
        isFirewalled: true,
      },
    });
  }
  console.log(`  ✓ Fair lending (1071) records created: ${fairLending.length}`);

  // ── Regulatory Alerts ─────────────────────────────────────
  //
  // The regulatory page carried six of these as literals in the component,
  // with impact scores and affected-module lists, while this table was empty.
  //
  // Note this is the same table the complaints page reads for regulator
  // inquiries: an inquiry is a RegulatoryAlert whose title begins "Inquiry —".
  // The rows below are rule changes, which is the other thing it holds.
  const regulatoryAlerts: {
    id: string;
    source: string;
    ruleType: string;
    title: string;
    summary: string;
    impactScore: number;
    affectedModules: Prisma.InputJsonValue;
    status: string;
    effectiveDate: Date;
  }[] = [
    {
      id: 'seed-regalert-001',
      source: 'CFPB',
      ruleType: 'small_business_lending',
      title: 'Section 1071 small business lending data collection — compliance dates',
      summary:
        'Covered financial institutions must collect and report data on applications for ' +
        'credit from small businesses. Compliance tier depends on originations volume.',
      impactScore: 88,
      affectedModules: ['underwriting', 'onboarding', 'reporting'],
      status: 'new',
      effectiveDate: d('2026-10-01'),
    },
    {
      id: 'seed-regalert-002',
      source: 'FTC',
      ruleType: 'advertising',
      title: 'Guidance on earnings and approval claims in small business finance marketing',
      summary:
        'Representations about approval likelihood or funding amounts require competent and ' +
        'reliable substantiation at the time the claim is made.',
      impactScore: 64,
      affectedModules: ['marketing', 'disclosures'],
      status: 'under_review',
      effectiveDate: d('2026-05-15'),
    },
    {
      id: 'seed-regalert-003',
      source: 'State_DFS',
      ruleType: 'disclosure',
      title: 'Commercial financing disclosure requirements — estimated APR presentation',
      summary:
        'Providers must present an estimated annual percentage rate and total cost of ' +
        'capital in a prescribed format before a commercial financing offer is accepted.',
      impactScore: 79,
      affectedModules: ['disclosures', 'origination'],
      status: 'new',
      effectiveDate: d('2026-03-01'),
    },
    {
      id: 'seed-regalert-004',
      source: 'FinCEN',
      ruleType: 'beneficial_ownership',
      title: 'Beneficial ownership information reporting — access rule',
      summary:
        'Reporting companies must file beneficial ownership information; access by financial ' +
        'institutions is permitted only with the reporting company consent.',
      impactScore: 52,
      affectedModules: ['onboarding', 'kyb'],
      status: 'resolved',
      effectiveDate: d('2025-11-12'),
    },
  ];

  for (const alert of regulatoryAlerts) {
    await prisma.regulatoryAlert.upsert({
      where: { id: alert.id },
      update: {},
      create: {
        id: alert.id,
        tenantId: tenant.id,
        source: alert.source,
        ruleType: alert.ruleType,
        title: alert.title,
        summary: alert.summary,
        impactScore: alert.impactScore,
        affectedModules: alert.affectedModules,
        status: alert.status,
        effectiveDate: alert.effectiveDate,
        ...(alert.status === 'resolved'
          ? { reviewedBy: adminUser.id, reviewedAt: d('2025-12-01') }
          : {}),
      },
    });
  }
  console.log(`  ✓ Regulatory alerts created: ${regulatoryAlerts.length}`);

  // ── Funds Flow Classifications ────────────────────────────
  //
  // How money moves through each workflow, and under which framework. The
  // page listed five of these with daily volumes ("$2.4M/day") that no column
  // holds, next to a table of state licence numbers that nothing records.
  const fundsFlows: {
    id: string;
    workflowName: string;
    classification: string;
    riskBasis: string;
    regulatoryFramework: string;
    legalOpinionRef?: string;
    status: string;
  }[] = [
    {
      id: 'seed-flow-001',
      workflowName: 'Card application referral to issuer',
      classification: 'agent_of_payee',
      riskBasis: 'No funds are held or transmitted; the issuer disburses directly to the client.',
      regulatoryFramework: 'State money transmission exemptions — agent of payee',
      legalOpinionRef: 'MEMO-2025-04-referral-flow',
      status: 'active',
    },
    {
      id: 'seed-flow-002',
      workflowName: 'Advisory fee collection via ACH debit',
      classification: 'direct_collection',
      riskBasis: 'Fees are debited from the client account to the tenant operating account.',
      regulatoryFramework: 'NACHA operating rules; Regulation E does not apply to business accounts',
      status: 'active',
    },
    {
      id: 'seed-flow-003',
      workflowName: 'Partner commission remittance',
      classification: 'pass_through',
      riskBasis:
        'Commission received from the issuer is remitted onward to the referring partner, ' +
        'which is a transmission of funds belonging to a third party.',
      regulatoryFramework: 'State money transmission licensing — under review',
      status: 'under_review',
    },
  ];

  for (const flow of fundsFlows) {
    await prisma.fundsFlowClassification.upsert({
      where: { id: flow.id },
      update: {},
      create: {
        id: flow.id,
        tenantId: tenant.id,
        workflowName: flow.workflowName,
        classification: flow.classification,
        riskBasis: flow.riskBasis,
        regulatoryFramework: flow.regulatoryFramework,
        ...(flow.legalOpinionRef === undefined ? {} : { legalOpinionRef: flow.legalOpinionRef }),
        status: flow.status,
      },
    });
  }
  console.log(`  ✓ Funds flow classifications created: ${fundsFlows.length}`);

  // ── Disclosure Templates ──────────────────────────────────
  //
  // The disclosures page carried nine of these as literals, with version
  // numbers, an author per template and an approvedBy of "CCO" or "GC" —
  // approval records for the legally required text a client is handed.
  //
  // Seeded here in the state they are actually in: drafts. Approving a
  // disclosure is an act with a named approver and a timestamp, and it goes
  // through POST /disclosures/templates/:id/approve, which records who did
  // it. None of these have been through that, so none claims to have been.
  let disclosuresSeeded = 0;
  for (const template of SEED_TEMPLATES) {
    const state = template.state.toUpperCase();
    const existing = await prisma.disclosureTemplate.findFirst({
      where: { tenantId: tenant.id, state, category: template.category },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.disclosureTemplate.create({
      data: {
        tenantId: tenant.id,
        state,
        category: template.category,
        name: template.name,
        content: template.content,
        version: '1.0.0',
        effectiveDate: template.effectiveDate,
        // Not active and not approved. The render endpoint refuses a template
        // that is neither, which is the control the old page rendered around.
        isActive: false,
        status: 'draft',
        approvedBy: null,
        approvedAt: null,
      },
    });
    disclosuresSeeded += 1;
  }
  console.log(`  ✓ Disclosure templates created: ${disclosuresSeeded}`);

  // ── AI Decision Log ───────────────────────────────────────
  //
  // What the model decided, which version decided it, how confident it was,
  // and whether a person overrode it. The decisions page carried eight of
  // these as literals, each with a client name and a snapshot of the inputs
  // — FICO 742, revenue $2,400,000 — beside an override trail naming the
  // people who approved each reversal.
  //
  // None of that is what this table holds. There is no businessId on a
  // decision, the inputs are reduced to a hash on purpose, and an override
  // records who made it and why, not who signed it off.
  const aiDecisions: {
    id: string;
    moduleSource: string;
    decisionType: string;
    inputHash: string;
    output: Prisma.InputJsonValue;
    confidence: number;
    modelVersion: string;
    promptVersion: string;
    latencyMs: number;
    overriddenBy?: string;
    overrideReason?: string;
  }[] = [
    {
      id: 'seed-aidec-001',
      moduleSource: 'suitability_engine',
      decisionType: 'risk_score',
      inputHash: 'b6f1c0a4e2d38a71',
      output: { score: 78, band: 'good', rationale: 'Revenue stability and credit depth both above threshold.' },
      confidence: 0.94,
      modelVersion: 'suitability-v2.3',
      promptVersion: 'p-2026-01',
      latencyMs: 412,
    },
    {
      id: 'seed-aidec-002',
      moduleSource: 'stacking_optimizer',
      decisionType: 'recommendation',
      inputHash: '9c02b7dd41ae5f30',
      output: {
        recommended: 'Chase Ink Business Cash',
        alternatives: ['Amex Blue Business Cash'],
        rationale: 'Spend concentration matches the category bonus.',
      },
      confidence: 0.88,
      modelVersion: 'optimizer-v4.1',
      promptVersion: 'p-2026-01',
      latencyMs: 866,
    },
    {
      id: 'seed-aidec-003',
      moduleSource: 'udap_scorer',
      decisionType: 'classification',
      inputHash: '3ae81f5c9b204d6e',
      output: { classification: 'compliant', flaggedPhrases: [] },
      confidence: 0.71,
      modelVersion: 'udap-v1.8',
      promptVersion: 'p-2025-11',
      latencyMs: 233,
    },
    {
      // Low confidence, and a person disagreed with it. Both are real signals
      // the governance view exists to surface.
      id: 'seed-aidec-004',
      moduleSource: 'credit_intelligence',
      decisionType: 'risk_score',
      inputHash: '77d3e0b18cc94a25',
      output: { score: 42, band: 'borderline', rationale: 'Debt service ratio above the comfort band.' },
      confidence: 0.44,
      modelVersion: 'credit-v3.0',
      promptVersion: 'p-2026-01',
      latencyMs: 519,
      overriddenBy: advisorUser.id,
      overrideReason:
        'Revenue trend and deposit depth documented as compensating factors; ratio is borderline, not disqualifying.',
    },
    {
      id: 'seed-aidec-005',
      moduleSource: 'decline_recovery',
      decisionType: 'recommendation',
      inputHash: 'f10a4c77e9b32d58',
      output: { action: 'reconsideration_letter', issuer: 'Bank of America' },
      confidence: 0.81,
      modelVersion: 'recovery-v1.2',
      promptVersion: 'p-2026-01',
      latencyMs: 297,
    },
    {
      id: 'seed-aidec-006',
      moduleSource: 'contract_analysis',
      decisionType: 'extraction',
      inputHash: '5b9207fe3a1d8c04',
      output: { clausesFound: 12, redFlags: 1 },
      confidence: 0.58,
      modelVersion: 'contracts-v2.0',
      promptVersion: 'p-2025-11',
      latencyMs: 1740,
    },
  ];

  for (const decision of aiDecisions) {
    await prisma.aiDecisionLog.upsert({
      where: { id: decision.id },
      update: {},
      create: {
        id: decision.id,
        tenantId: tenant.id,
        moduleSource: decision.moduleSource,
        decisionType: decision.decisionType,
        // The inputs themselves are not stored. This is a digest of them, so
        // an identical decision can be recognised without keeping the
        // applicant data that produced it.
        inputHash: decision.inputHash,
        output: decision.output,
        confidence: new Prisma.Decimal(decision.confidence),
        modelVersion: decision.modelVersion,
        promptVersion: decision.promptVersion,
        latencyMs: decision.latencyMs,
        ...(decision.overriddenBy === undefined
          ? {}
          : { overriddenBy: decision.overriddenBy, overrideReason: decision.overrideReason }),
      },
    });
  }
  console.log(`  ✓ AI decision log entries created: ${aiDecisions.length}`);

  // ── Approved Scripts ──────────────────────────────────────
  //
  // What an advisor is cleared to say. The comm-compliance page carried five
  // of these as literals with approvers written in.
  //
  // Seeded unapproved, like the disclosure templates: approving a script is
  // an act with a named approver, and none of these has been through it.
  const scripts: { id: string; name: string; category: string; content: string }[] = [
    {
      id: 'seed-script-001',
      name: 'Discovery call opening',
      category: 'discovery',
      content:
        'Thanks for taking the time. Before anything else — everything we discuss today is about ' +
        'what your business qualifies for, and I cannot promise an outcome. What I can do is walk ' +
        'through where you stand and which issuers are realistic. Is now still a good time?',
    },
    {
      id: 'seed-script-002',
      name: 'Explaining an approval range',
      category: 'suitability',
      content:
        'The range I am giving you is based on your credit profile and revenue as they stand ' +
        'today. It is an estimate, not an offer, and the issuer makes the decision. If anything ' +
        'in your profile changes before we file, the range changes with it.',
    },
    {
      id: 'seed-script-003',
      name: 'Responding to a decline',
      category: 'decline',
      content:
        'The issuer declined this one, and you will receive a notice from them explaining why. ' +
        'That reason matters, because it tells us whether reconsideration is worth trying or ' +
        'whether we should wait out their window. Let us go through what they said.',
    },
    {
      id: 'seed-script-004',
      name: 'Fee disclosure',
      category: 'fees',
      content:
        'Our fee is charged whether or not you are approved, and it is separate from anything the ' +
        'issuer charges. I want that clear before we go further, so there is no surprise on your ' +
        'statement. Would you like me to send the fee schedule in writing?',
    },
  ];

  for (const script of scripts) {
    await prisma.approvedScript.upsert({
      where: { id: script.id },
      update: {},
      create: {
        id: script.id,
        tenantId: tenant.id,
        name: script.name,
        category: script.category,
        content: script.content,
        version: '1.0.0',
        // In use, and with no recorded approver.
        //
        // GET /api/scripts only ever returns active scripts, so seeding these
        // inactive would make the library invisible. Active with approvedBy
        // null is the honest state and the more useful one: a script an
        // advisor is reading from that nobody has signed off is exactly the
        // gap the page should show, and it is not asserted away by writing a
        // name into approvedBy.
        isActive: true,
        approvedBy: null,
        approvedAt: null,
      },
    });
  }
  console.log(`  ✓ Approved scripts created: ${scripts.length}`);

  // ── Advisor QA Scores ─────────────────────────────────────
  //
  // One row per scored call, against an advisor id — not a per-advisor
  // average. The page showed four named advisors with an overall score, a
  // call count and a trend arrow, none of which existed.
  const qaScores: {
    id: string;
    overallScore: number;
    complianceScore: number;
    scriptAdherence: number;
    consentCapture: number;
    riskClaimAvoidance: number;
    feedback: string;
    scoredAt: Date;
  }[] = [
    {
      id: 'seed-qa-001',
      overallScore: 88,
      complianceScore: 92,
      scriptAdherence: 84,
      consentCapture: 90,
      riskClaimAvoidance: 86,
      feedback: 'Consent captured before any profile discussion. Approval language stayed hedged.',
      scoredAt: d('2026-06-14'),
    },
    {
      id: 'seed-qa-002',
      overallScore: 74,
      complianceScore: 68,
      scriptAdherence: 79,
      consentCapture: 82,
      riskClaimAvoidance: 66,
      feedback:
        'Described a likely approval before the credit pull. Coached on framing ranges as estimates.',
      scoredAt: d('2026-07-02'),
    },
    {
      id: 'seed-qa-003',
      overallScore: 91,
      complianceScore: 94,
      scriptAdherence: 88,
      consentCapture: 95,
      riskClaimAvoidance: 89,
      feedback: 'Fee disclosure given unprompted and confirmed in writing.',
      scoredAt: d('2026-07-21'),
    },
  ];

  for (const score of qaScores) {
    await prisma.advisorQaScore.upsert({
      where: { id: score.id },
      update: {},
      create: {
        id: score.id,
        tenantId: tenant.id,
        // Scored against the seeded advisor. There is no endpoint that lists
        // advisors, so this id is the way to reach these from the UI.
        advisorId: advisorUser.id,
        overallScore: score.overallScore,
        complianceScore: score.complianceScore,
        scriptAdherence: score.scriptAdherence,
        consentCapture: score.consentCapture,
        riskClaimAvoidance: score.riskClaimAvoidance,
        feedback: score.feedback,
        scoredAt: score.scoredAt,
      },
    });
  }
  console.log(`  ✓ Advisor QA scores created: ${qaScores.length}`);

  // ── Consent Records ───────────────────────────────────────

  await prisma.consentRecord.upsert({
    where: { id: 'seed-consent-001' },
    update: {},
    create: {
      id: 'seed-consent-001',
      tenantId: tenant.id,
      businessId: biz1.id,
      channel: 'email',
      consentType: 'tcpa',
      status: 'active',
      grantedAt: d('2025-09-04'),
      ipAddress: '198.51.100.42',
      evidenceRef: 'email-thread-2025090412341',
      metadata: { source: 'onboarding_wizard', version: '2.1' },
    },
  });

  await prisma.consentRecord.upsert({
    where: { id: 'seed-consent-002' },
    update: {},
    create: {
      id: 'seed-consent-002',
      tenantId: tenant.id,
      businessId: biz1.id,
      channel: 'document',
      consentType: 'data_sharing',
      status: 'active',
      grantedAt: d('2025-09-04'),
      ipAddress: '198.51.100.42',
      evidenceRef: 'docusign-envelope-abc123',
      metadata: { docusignEnvelopeId: 'env-abc123', signerEmail: 'jpatel@apexdigital.io' },
    },
  });

  await prisma.consentRecord.upsert({
    where: { id: 'seed-consent-003' },
    update: {},
    create: {
      id: 'seed-consent-003',
      tenantId: tenant.id,
      businessId: biz2.id,
      channel: 'voice',
      consentType: 'tcpa',
      status: 'active',
      grantedAt: d('2026-02-10'),
      ipAddress: null,
      evidenceRef: 'call-recording-ref-2026021001',
      metadata: { recordingDurationSec: 312, agentId: advisorUser.id },
    },
  });

  await prisma.consentRecord.upsert({
    where: { id: 'seed-consent-004' },
    update: {},
    create: {
      id: 'seed-consent-004',
      tenantId: tenant.id,
      businessId: biz3.id,
      channel: 'email',
      consentType: 'application',
      status: 'active',
      grantedAt: d('2026-03-05'),
      ipAddress: '203.0.113.87',
      evidenceRef: 'email-consent-2026030509',
    },
  });
  console.log('  ✓ Consent records created');

  // ── Compliance Checks ─────────────────────────────────────

  await prisma.complianceCheck.upsert({
    where: { id: 'seed-cc-001' },
    update: {},
    create: {
      id: 'seed-cc-001',
      tenantId: tenant.id,
      businessId: biz1.id,
      checkType: 'kyb',
      riskScore: 12,
      riskLevel: 'low',
      findings: { businessVerified: true, addressConfirmed: true, ofacClean: true },
      stateJurisdiction: 'DE',
      resolvedAt: d('2025-08-15'),
    },
  });

  await prisma.complianceCheck.upsert({
    where: { id: 'seed-cc-002' },
    update: {},
    create: {
      id: 'seed-cc-002',
      tenantId: tenant.id,
      businessId: biz2.id,
      checkType: 'udap',
      riskScore: 35,
      riskLevel: 'medium',
      findings: {
        disclosure: 'Fee schedule requires plain-language revision',
        recommendation: 'Update product disclosure before next funding round',
      },
      stateJurisdiction: 'FL',
      resolvedAt: null,
    },
  });

  await prisma.complianceCheck.upsert({
    where: { id: 'seed-cc-003' },
    update: {},
    create: {
      id: 'seed-cc-003',
      tenantId: tenant.id,
      businessId: biz3.id,
      checkType: 'state_law',
      riskScore: 20,
      riskLevel: 'low',
      findings: { texasCSOCompliant: true, requiresDisclosure: false },
      stateJurisdiction: 'TX',
      resolvedAt: d('2026-03-12'),
    },
  });
  console.log('  ✓ Compliance checks created');

  // ── Product Acknowledgments ───────────────────────────────

  await prisma.productAcknowledgment.upsert({
    where: { id: 'seed-ack-001' },
    update: {},
    create: {
      id: 'seed-ack-001',
      businessId: biz1.id,
      acknowledgmentType: 'product_reality',
      version: '3.0',
      signedAt: d('2025-09-04T14:32:00Z'),
      signatureRef: 'sig-pr-apexdigital-001',
      documentVaultId: 'vault-doc-0045',
      metadata: { signerName: 'Jordan Patel', ipAddress: '198.51.100.42' },
    },
  });

  await prisma.productAcknowledgment.upsert({
    where: { id: 'seed-ack-002' },
    update: {},
    create: {
      id: 'seed-ack-002',
      businessId: biz1.id,
      acknowledgmentType: 'fee_schedule',
      version: '2.2',
      signedAt: d('2025-09-04T14:35:00Z'),
      signatureRef: 'sig-fee-apexdigital-001',
      documentVaultId: 'vault-doc-0046',
      metadata: { signerName: 'Jordan Patel', programFeePercent: '8.5' },
    },
  });
  console.log('  ✓ Product acknowledgments created');

  // ── Suitability Checks ────────────────────────────────────

  await prisma.suitabilityCheck.upsert({
    where: { id: 'seed-suit-001' },
    update: {},
    create: {
      id: 'seed-suit-001',
      businessId: biz1.id,
      score: 88,
      maxSafeLeverage: dec('200000'),
      recommendation: 'proceed',
      noGoTriggered: false,
      noGoReasons: [],
      alternativeProducts: [],
      decisionExplanation:
        'Strong FICO (762), established LLC 5+ years, healthy revenue coverage ratio (2.4x monthly). Approved for full stacking program.',
    },
  });

  await prisma.suitabilityCheck.upsert({
    where: { id: 'seed-suit-002' },
    update: {},
    create: {
      id: 'seed-suit-002',
      businessId: biz2.id,
      score: 55,
      maxSafeLeverage: dec('60000'),
      recommendation: 'proceed_with_caution',
      noGoTriggered: false,
      noGoReasons: [],
      alternativeProducts: ['SBA micro-loan', 'revenue-based financing'],
      decisionExplanation:
        'Moderate FICO (694) with elevated utilization (38%). Monthly revenue supports up to $60K. Recommend conservative card count of 2-3.',
    },
  });
  console.log('  ✓ Suitability checks created');

  // ── ACH Authorization ─────────────────────────────────────

  await prisma.achAuthorization.upsert({
    where: { id: 'seed-ach-001' },
    update: {},
    create: {
      id: 'seed-ach-001',
      businessId: biz1.id,
      processorName: 'Stripe Treasury',
      authorizedAmount: dec('5000'),
      authorizedFrequency: 'monthly',
      status: 'active',
      signedDocumentRef: 'docusign-ach-env-xyz789',
      authorizedAt: d('2025-09-05'),
    },
  });
  console.log('  ✓ ACH authorization created');

  // ── Cost Calculation ──────────────────────────────────────

  await prisma.costCalculation.upsert({
    where: { id: 'seed-cost-001' },
    update: {},
    create: {
      id: 'seed-cost-001',
      businessId: biz1.id,
      programFees: dec('12750'),
      percentOfFunding: dec('0.085'),
      annualFees: dec('95'),
      cashAdvanceFees: dec('0'),
      processorFees: dec('600'),
      totalCost: dec('13445'),
      effectiveApr: dec('0.0896'),
      irc163jImpact: dec('2689'),
      bestCaseFlow: {
        months: 12,
        netBenefit: 45000,
        roi: 2.35,
        assumptions: 'Full utilization, 12-month 0% APR, on-time payments',
      },
      baseCaseFlow: {
        months: 12,
        netBenefit: 28000,
        roi: 1.08,
        assumptions: '70% utilization, standard APR after promo, minimal fees',
      },
      worstCaseFlow: {
        months: 12,
        netBenefit: -4000,
        roi: -0.30,
        assumptions: 'Full balance carried at regular APR, late fees incurred',
      },
    },
  });
  console.log('  ✓ Cost calculation created');

  // ── Ledger Events ─────────────────────────────────────────

  await prisma.ledgerEvent.create({
    data: {
      tenantId: tenant.id,
      eventType: 'business.created',
      aggregateType: 'business',
      aggregateId: biz1.id,
      payload: { legalName: biz1.legalName, status: 'active' },
      metadata: { source: 'seed', version: 1 },
    },
  });

  await prisma.ledgerEvent.create({
    data: {
      tenantId: tenant.id,
      eventType: 'funding_round.completed',
      aggregateType: 'funding_round',
      aggregateId: round1.id,
      payload: { roundNumber: 1, businessId: biz1.id, totalApproved: 80000 },
      metadata: { source: 'seed' },
      processedAt: new Date(),
    },
  });
  console.log('  ✓ Ledger events created');

  // ── Documents ─────────────────────────────────────────────
  //
  // The complaint evidence picker attaches documents belonging to the
  // complaint's client, and there were none in the database at all — so the
  // picker had nothing to offer and could not be exercised.
  const documents: Array<{
    id: string;
    businessId: string;
    documentType: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
  }> = [
    {
      id: 'seed-doc-001',
      businessId: biz1.id,
      documentType: 'statement',
      title: 'Chase Ink — March 2026 statement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 184_320,
    },
    {
      id: 'seed-doc-002',
      businessId: biz1.id,
      documentType: 'disclosure',
      title: 'Fee schedule acknowledgment (signed).pdf',
      mimeType: 'application/pdf',
      sizeBytes: 96_100,
    },
    {
      id: 'seed-doc-003',
      businessId: biz2.id,
      documentType: 'correspondence',
      title: 'Client email thread — APR disclosure.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 42_880,
    },
    {
      id: 'seed-doc-004',
      businessId: biz3.id,
      documentType: 'call_recording',
      title: 'Advisor call transcript 2026-07-14.txt',
      mimeType: 'text/plain',
      sizeBytes: 12_400,
    },
  ];

  for (const doc of documents) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: {},
      create: {
        id: doc.id,
        tenantId: tenant.id,
        businessId: doc.businessId,
        documentType: doc.documentType,
        title: doc.title,
        storageKey: `seed/${doc.id}`,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        uploadedBy: 'seed',
      },
    });
  }
  console.log(`  ✓ Documents: ${documents.length}`);

  // ── Complaints ────────────────────────────────────────────
  //
  // The complaints register reads /api/complaints, which starts empty. A few
  // rows make the page, its SLA countdown and its root-cause analytics
  // exercisable in development; without them every figure is legitimately
  // zero and nothing on the screen can be checked.
  const complaints: Array<{
    id: string;
    businessId: string;
    category: string;
    source: string;
    severity: string;
    status: string;
    description: string;
    rootCause?: string;
    resolution?: string;
    assignedTo?: string;
    resolvedAt?: string;
  }> = [
    {
      id: 'seed-cmp-001',
      businessId: biz1.id,
      category: 'billing',
      source: 'portal',
      severity: 'high',
      status: 'open',
      description:
        'Client disputes a $95 annual fee charged after the card was reported closed.',
      assignedTo: 'Marcus Whitfield',
    },
    {
      id: 'seed-cmp-002',
      businessId: biz2.id,
      category: 'compliance',
      source: 'email',
      severity: 'critical',
      status: 'investigating',
      description:
        'Client states the APR expiry disclosure was not presented before signing.',
      rootCause: 'Fee disclosure gap',
      assignedTo: 'Marcus Whitfield',
    },
    {
      id: 'seed-cmp-003',
      businessId: biz3.id,
      category: 'service',
      source: 'phone',
      severity: 'medium',
      status: 'resolved',
      description: 'Repeated hold times when calling the advisor line.',
      rootCause: 'Advisor process',
      resolution: 'Callback scheduling introduced; client confirmed resolved.',
      assignedTo: 'Marcus Whitfield',
      resolvedAt: '2026-07-20',
    },
  ];

  for (const c of complaints) {
    await prisma.complaint.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        tenantId: tenant.id,
        businessId: c.businessId,
        category: c.category,
        source: c.source,
        severity: c.severity,
        status: c.status,
        description: c.description,
        ...(c.rootCause ? { rootCause: c.rootCause } : {}),
        ...(c.resolution ? { resolution: c.resolution } : {}),
        ...(c.assignedTo ? { assignedTo: c.assignedTo } : {}),
        ...(c.resolvedAt ? { resolvedAt: d(c.resolvedAt) } : {}),
      },
    });
  }
  console.log(`  ✓ Complaints: ${complaints.length}`);

  // ── Repayment Plan + Schedule ─────────────────────────────
  //
  // Without this, every client returns hasPlan:false and the repayment page
  // and client Repayment tab have nothing to show — the balance, monthly
  // obligation and autopay figures are all plan-derived, so neither surface
  // could be exercised in development.
  //
  // Schedules are linked to the seeded card applications so a payment can be
  // lined up with the card it belongs to. totalBalance is plan-level, which is
  // the only balance the schema carries: there is no per-card balance to seed.
  const repaymentPlan = await prisma.repaymentPlan.upsert({
    where: { id: 'seed-plan-001' },
    update: {},
    create: {
      id: 'seed-plan-001',
      tenantId: tenant.id,
      businessId: biz1.id,
      totalBalance: dec('38500'),
      monthlyPayment: dec('2400'),
      strategy: 'avalanche',
      status: 'active',
      interestShockDate: d('2026-10-12'),
      interestShockAmount: dec('681'),
      nextPaymentDate: d('2026-08-15'),
    },
  });

  const schedules: Array<{
    id: string;
    cardApplicationId: string;
    issuer: string;
    dueDate: string;
    minimumPayment: string;
    recommendedPayment: string;
    status: string;
    autopayEnabled: boolean;
    autopayVerified: boolean;
  }> = [
    {
      id: 'seed-sched-001',
      cardApplicationId: 'seed-app-001',
      issuer: 'Chase',
      dueDate: '2026-08-15',
      minimumPayment: '450',
      recommendedPayment: '1400',
      status: 'upcoming',
      autopayEnabled: true,
      autopayVerified: true,
    },
    {
      id: 'seed-sched-002',
      cardApplicationId: 'seed-app-002',
      issuer: 'American Express',
      dueDate: '2026-08-22',
      minimumPayment: '310',
      recommendedPayment: '1000',
      status: 'upcoming',
      autopayEnabled: false,
      autopayVerified: false,
    },
    {
      id: 'seed-sched-003',
      cardApplicationId: 'seed-app-001',
      issuer: 'Chase',
      dueDate: '2026-09-15',
      minimumPayment: '450',
      recommendedPayment: '1400',
      status: 'upcoming',
      autopayEnabled: true,
      autopayVerified: true,
    },
  ];

  for (const entry of schedules) {
    await prisma.paymentSchedule.upsert({
      where: { id: entry.id },
      update: {},
      create: {
        id: entry.id,
        repaymentPlanId: repaymentPlan.id,
        cardApplicationId: entry.cardApplicationId,
        issuer: entry.issuer,
        dueDate: d(entry.dueDate),
        minimumPayment: dec(entry.minimumPayment),
        recommendedPayment: dec(entry.recommendedPayment),
        status: entry.status,
        autopayEnabled: entry.autopayEnabled,
        autopayVerified: entry.autopayVerified,
      },
    });
  }
  console.log(`  ✓ Repayment plan: ${repaymentPlan.id} (${schedules.length} schedules)`);

  // ── Issuer Rules Engine ────────────────────────────────────
  await seedIssuerRules(prisma);

  // ── Card Products ─────────────────────────────────────────
  await seedCardProducts();

  console.log('\n✅ Seed complete.');
  console.log(`   Tenant:   ${tenant.slug} (${tenant.id})`);
  console.log(`   Admin:    ${adminUser.email}`);
  console.log(`   Advisor:  ${advisorUser.email}`);
  console.log(`   Password: DemoPass123!`);
}

// ── Entry point ───────────────────────────────────────────────

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
