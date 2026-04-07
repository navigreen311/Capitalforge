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
      role: 'admin',
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
  const biz1 = await prisma.business.upsert({
    where: { id: 'seed-biz-001' },
    update: {},
    create: {
      id: 'seed-biz-001',
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
    update: {},
    create: {
      id: 'seed-biz-002',
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
    update: {},
    create: {
      id: 'seed-biz-003',
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
  console.log('  ✓ Card applications created');

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

  // ── Issuer Rules Engine ────────────────────────────────────
  await seedIssuerRules(prisma);

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
