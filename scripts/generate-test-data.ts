#!/usr/bin/env tsx
// ============================================================
// CapitalForge — Synthetic Test Data Generator
// Generates N businesses with full lifecycle data for load testing.
//
// Usage:
//   npx tsx scripts/generate-test-data.ts \
//     --count 100 \
//     --tenant <slug> \
//     --start 2024-01-01 \
//     --end 2025-12-31 \
//     --fico-dist balanced \
//     --industry-mix diverse \
//     [--dry-run]
//
// FICO distributions: excellent | good | fair | poor | balanced
// Industry mixes:     diverse | tech | services | retail
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ── Configuration ─────────────────────────────────────────────

interface GeneratorConfig {
  count: number;
  tenantSlug: string;
  startDate: Date;
  endDate: Date;
  ficoDist: FicoDist;
  industryMix: IndustryMix;
  dryRun: boolean;
}

type FicoDist = 'excellent' | 'good' | 'fair' | 'poor' | 'balanced';
type IndustryMix = 'diverse' | 'tech' | 'services' | 'retail';

// ── Static data pools ─────────────────────────────────────────

const ISSUERS = ['Chase', 'American Express', 'Capital One', 'Citi', 'Bank of America', 'Wells Fargo', 'US Bank', 'Truist'];
const CARD_PRODUCTS: Record<string, string[]> = {
  'Chase':           ['Ink Business Preferred', 'Ink Business Cash', 'Ink Business Unlimited'],
  'American Express': ['Blue Business Cash', 'Blue Business Plus', 'Business Gold Card', 'Business Platinum Card'],
  'Capital One':     ['Spark Cash Plus', 'Spark Miles for Business', 'Venture X Business'],
  'Citi':            ['Business AAdvantage Platinum', 'Business AAdvantage Executive', 'ThankYou Business Preferred'],
  'Bank of America': ['Business Advantage Unlimited', 'Business Advantage Travel', 'Business Advantage Cash Rewards'],
  'Wells Fargo':     ['Business Platinum', 'Business Elite Signature', 'Business Secured'],
  'US Bank':         ['Business Triple Cash Rewards', 'Business Leverage', 'Business Select Rewards'],
  'Truist':          ['Business Cash Rewards', 'Enjoy Beyond Credit', 'Enjoy Cash Select'],
};

const ENTITY_TYPES = ['llc', 'c_corp', 's_corp', 'sole_prop', 'partnership'];
const STATES = ['DE', 'TX', 'FL', 'CA', 'NY', 'CO', 'IL', 'OH', 'GA', 'WA', 'PA', 'NC', 'MA', 'AZ', 'NV'];
const BUREAUS = ['experian', 'transunion', 'equifax', 'dnb'];
const CONSENT_CHANNELS = ['email', 'voice', 'sms', 'document', 'partner'];
const CONSENT_TYPES = ['tcpa', 'data_sharing', 'referral', 'application'];

const INDUSTRY_POOLS: Record<IndustryMix, { name: string; mcc: string; bizPrefix: string }[]> = {
  diverse: [
    { name: 'Technology Services', mcc: '7372', bizPrefix: 'Tech Solutions' },
    { name: 'General Contracting', mcc: '1521', bizPrefix: 'Construction Group' },
    { name: 'Healthcare', mcc: '8099', bizPrefix: 'Medical Associates' },
    { name: 'Freight & Logistics', mcc: '4731', bizPrefix: 'Logistics Corp' },
    { name: 'Food & Beverage', mcc: '5812', bizPrefix: 'Restaurant Group' },
    { name: 'Financial Advisory', mcc: '6282', bizPrefix: 'Capital Advisors' },
    { name: 'Real Estate', mcc: '6552', bizPrefix: 'Property Partners' },
    { name: 'Manufacturing', mcc: '3990', bizPrefix: 'Manufacturing Inc' },
    { name: 'Retail', mcc: '5999', bizPrefix: 'Retail Ventures' },
    { name: 'Education Services', mcc: '8299', bizPrefix: 'Learning Center' },
  ],
  tech: [
    { name: 'SaaS / Software', mcc: '7372', bizPrefix: 'Software LLC' },
    { name: 'IT Consulting', mcc: '7371', bizPrefix: 'Tech Consulting' },
    { name: 'Cybersecurity', mcc: '7382', bizPrefix: 'Security Systems' },
    { name: 'Digital Marketing', mcc: '7311', bizPrefix: 'Digital Agency' },
    { name: 'Cloud Services', mcc: '7379', bizPrefix: 'Cloud Ventures' },
  ],
  services: [
    { name: 'Legal Services', mcc: '8111', bizPrefix: 'Law Group' },
    { name: 'Accounting', mcc: '8931', bizPrefix: 'CPA Associates' },
    { name: 'Marketing', mcc: '7311', bizPrefix: 'Marketing LLC' },
    { name: 'HR / Staffing', mcc: '7363', bizPrefix: 'Staffing Solutions' },
    { name: 'Consulting', mcc: '7389', bizPrefix: 'Business Consulting' },
  ],
  retail: [
    { name: 'E-Commerce', mcc: '5999', bizPrefix: 'Online Retail' },
    { name: 'Specialty Retail', mcc: '5940', bizPrefix: 'Specialty Store' },
    { name: 'Auto Parts', mcc: '5533', bizPrefix: 'Auto Supply' },
    { name: 'Pet Supplies', mcc: '5995', bizPrefix: 'Pet Emporium' },
    { name: 'Home Goods', mcc: '5712', bizPrefix: 'Home Store' },
  ],
};

const FICO_RANGES: Record<FicoDist, [number, number][]> = {
  excellent: [[760, 850]],
  good:      [[700, 759]],
  fair:      [[650, 699]],
  poor:      [[580, 649]],
  balanced:  [[580, 649], [650, 699], [700, 759], [760, 850]],
};

const BUSINESS_ADJECTIVES = [
  'Apex', 'Summit', 'Horizon', 'Pioneer', 'Crestview', 'Ironclad', 'Coastal',
  'Pinnacle', 'Meridian', 'Vantage', 'Alpine', 'Skyline', 'Delta', 'Orion',
  'Golden', 'Clearwater', 'Northgate', 'Southpointe', 'Westfield', 'Eastbridge',
  'Sterling', 'Keystone', 'Landmark', 'Premier', 'Prestige', 'Heritage',
  'Nexus', 'Flagship', 'Core', 'Zenith', 'Crown', 'Liberty', 'Union', 'Pacific',
];

// ── Helpers ───────────────────────────────────────────────────

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (key && args[i + 1] && !args[i + 1].startsWith('--')) {
      result[key] = args[i + 1];
    } else if (key) {
      result[key] = 'true'; // flag without value
    }
  }
  return result;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomFico(dist: FicoDist): number {
  const ranges = FICO_RANGES[dist];
  const range = randomElement(ranges);
  return randomInt(range[0], range[1]);
}

function dec(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(String(value));
}

function businessName(index: number, industryPool: { bizPrefix: string }[]): string {
  const adj = BUSINESS_ADJECTIVES[index % BUSINESS_ADJECTIVES.length];
  const ind = industryPool[index % industryPool.length];
  return `${adj} ${ind.bizPrefix}`;
}

// ── Generator ─────────────────────────────────────────────────

async function generateTestData(config: GeneratorConfig): Promise<void> {
  console.log('\nCapitalForge Test Data Generator');
  console.log('─'.repeat(50));
  console.log(`  Count          : ${config.count}`);
  console.log(`  Tenant         : ${config.tenantSlug}`);
  console.log(`  Date range     : ${config.startDate.toDateString()} → ${config.endDate.toDateString()}`);
  console.log(`  FICO dist      : ${config.ficoDist}`);
  console.log(`  Industry mix   : ${config.industryMix}`);
  console.log(`  Dry run        : ${config.dryRun}`);
  console.log('─'.repeat(50));

  // Resolve tenant
  const tenant = await prisma.tenant.findUnique({ where: { slug: config.tenantSlug } });
  if (!tenant) {
    throw new Error(`Tenant not found: ${config.tenantSlug}`);
  }

  // Resolve an advisor user for the tenant (optional)
  const advisors = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: { in: ['advisor', 'admin'] } },
    select: { id: true },
  });

  const industryPool = INDUSTRY_POOLS[config.industryMix];
  let totalBusinesses = 0;
  let totalApplications = 0;
  let totalConsentRecords = 0;
  let totalCreditProfiles = 0;
  let totalFundingRounds = 0;

  const batchSize = 10;
  const batches = Math.ceil(config.count / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchStart = batch * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, config.count);
    const batchItems = batchEnd - batchStart;

    for (let i = batchStart; i < batchEnd; i++) {
      const bizId = `test-${config.tenantSlug}-biz-${String(i + 1).padStart(6, '0')}`;
      const industry = industryPool[i % industryPool.length];
      const state = randomElement(STATES);
      const entityType = randomElement(ENTITY_TYPES);
      const createdAt = randomDate(config.startDate, config.endDate);
      const fico = randomFico(config.ficoDist);
      const annualRevenue = randomInt(180000, 8000000);
      const advisorId = advisors.length > 0 ? randomElement(advisors).id : undefined;

      const fundingScore =
        fico >= 760 ? randomInt(80, 98) :
        fico >= 700 ? randomInt(60, 80) :
        fico >= 650 ? randomInt(40, 65) :
                      randomInt(20, 45);

      const status =
        fundingScore >= 75 ? 'active' :
        fundingScore >= 55 ? 'onboarding' :
                             'intake';

      if (config.dryRun) {
        console.log(`  [DRY RUN] Would create: ${businessName(i, industryPool)} (${bizId}) FICO:${fico} Score:${fundingScore}`);
        continue;
      }

      await prisma.$transaction(async (tx) => {
        // Business
        await tx.business.create({
          data: {
            id: bizId,
            tenantId: tenant.id,
            advisorId,
            legalName: `${businessName(i, industryPool)} LLC`,
            dba: businessName(i, industryPool),
            ein: `${randomInt(10, 99)}-${randomInt(1000000, 9999999)}`,
            entityType,
            stateOfFormation: state,
            dateOfFormation: randomDate(
              new Date(createdAt.getFullYear() - randomInt(1, 8), 0, 1),
              createdAt,
            ),
            mcc: industry.mcc,
            industry: industry.name,
            annualRevenue: dec(annualRevenue),
            monthlyRevenue: dec(Math.floor(annualRevenue / 12)),
            fundingReadinessScore: fundingScore,
            status,
            createdAt,
          },
        });
        totalBusinesses++;

        // Business owner
        await tx.businessOwner.create({
          data: {
            id: `test-owner-${bizId}`,
            businessId: bizId,
            firstName: `Owner${i + 1}`,
            lastName: `TestLast${i + 1}`,
            ownershipPercent: dec(100),
            isBeneficialOwner: true,
            kycStatus: status === 'active' ? 'verified' : 'pending',
            kycVerifiedAt: status === 'active' ? createdAt : undefined,
          },
        });

        // Credit profile
        await tx.creditProfile.create({
          data: {
            id: `test-cp-${bizId}`,
            businessId: bizId,
            profileType: 'personal',
            bureau: randomElement(BUREAUS),
            score: fico,
            scoreType: 'fico',
            utilization: dec((Math.random() * 0.5).toFixed(2)),
            inquiryCount: randomInt(0, 8),
            derogatoryCount: fico < 650 ? randomInt(1, 4) : 0,
            tradelines: { accounts: randomInt(5, 20), avgAge: (Math.random() * 12).toFixed(1) },
            pulledAt: randomDate(createdAt, config.endDate),
          },
        });
        totalCreditProfiles++;

        // Consent record
        await tx.consentRecord.create({
          data: {
            id: `test-consent-${bizId}`,
            tenantId: tenant.id,
            businessId: bizId,
            channel: randomElement(CONSENT_CHANNELS),
            consentType: randomElement(CONSENT_TYPES),
            status: 'active',
            grantedAt: createdAt,
            ipAddress: `198.51.${randomInt(0, 255)}.${randomInt(1, 254)}`,
            evidenceRef: `evidence-test-${bizId}`,
          },
        });
        totalConsentRecords++;

        // Funding round (for active/onboarding businesses)
        if (status === 'active' && fundingScore >= 65) {
          const roundStarted = randomDate(createdAt, config.endDate);
          const isCompleted = Math.random() > 0.4;
          const targetCredit = randomInt(50000, 500000);
          const cardCount = Math.min(Math.floor(targetCredit / 50000), 8);

          const round = await tx.fundingRound.create({
            data: {
              businessId: bizId,
              roundNumber: 1,
              targetCredit: dec(targetCredit),
              targetCardCount: cardCount,
              status: isCompleted ? 'completed' : 'in_progress',
              startedAt: roundStarted,
              completedAt: isCompleted ? new Date(roundStarted.getTime() + 30 * 24 * 60 * 60 * 1000) : undefined,
            },
          });
          totalFundingRounds++;

          // Card applications for funded businesses
          const appCount = isCompleted ? cardCount : randomInt(1, 3);
          for (let a = 0; a < appCount; a++) {
            const issuer = randomElement(ISSUERS);
            const products = CARD_PRODUCTS[issuer] ?? ['Business Card'];
            const product = randomElement(products);
            const isApproved = fico >= 680 && Math.random() > 0.2;
            const creditLimit = isApproved ? randomInt(15000, 80000) : undefined;
            const submitDate = new Date(roundStarted.getTime() + a * 24 * 60 * 60 * 1000);

            await tx.cardApplication.create({
              data: {
                id: randomUUID(),
                businessId: bizId,
                fundingRoundId: round.id,
                issuer,
                cardProduct: product,
                status: isApproved ? 'approved' : (Math.random() > 0.5 ? 'declined' : 'submitted'),
                creditLimit: creditLimit ? dec(creditLimit) : undefined,
                introApr: dec(0),
                introAprExpiry: new Date(submitDate.getTime() + 365 * 24 * 60 * 60 * 1000),
                regularApr: dec((0.18 + Math.random() * 0.08).toFixed(4)),
                annualFee: dec(randomElement([0, 0, 95, 150, 295])),
                consentCapturedAt: submitDate,
                submittedAt: submitDate,
                decidedAt: isApproved ? new Date(submitDate.getTime() + 3 * 24 * 60 * 60 * 1000) : undefined,
                createdAt: submitDate,
              },
            });
            totalApplications++;
          }
        }
      });
    }

    const pct = Math.round(((batchEnd) / config.count) * 100);
    process.stdout.write(`\r  Progress: ${batchEnd}/${config.count} businesses (${pct}%)   `);
  }

  console.log('\n');

  if (config.dryRun) {
    console.log('✅ Dry run complete — no data was written.');
  } else {
    console.log('✅ Test data generation complete.');
    console.log(`\n  Tenant          : ${config.tenantSlug}`);
    console.log(`  Businesses      : ${totalBusinesses}`);
    console.log(`  Credit profiles : ${totalCreditProfiles}`);
    console.log(`  Consent records : ${totalConsentRecords}`);
    console.log(`  Funding rounds  : ${totalFundingRounds}`);
    console.log(`  Card apps       : ${totalApplications}`);
  }
}

// ── Entry point ───────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  const count = parseInt(args['count'] || '50', 10);
  const tenantSlug = args['tenant'];

  if (!tenantSlug) {
    console.error('Error: --tenant <slug> is required');
    console.error('Usage: generate-test-data.ts --count 100 --tenant <slug> [options]');
    process.exit(1);
  }

  if (isNaN(count) || count < 1 || count > 10000) {
    console.error('Error: --count must be a number between 1 and 10000');
    process.exit(1);
  }

  const startDate = args['start'] ? new Date(args['start']) : new Date('2023-01-01');
  const endDate = args['end'] ? new Date(args['end']) : new Date();
  const ficoDist = (args['fico-dist'] as FicoDist) || 'balanced';
  const industryMix = (args['industry-mix'] as IndustryMix) || 'diverse';
  const dryRun = args['dry-run'] === 'true';

  const validFico: FicoDist[] = ['excellent', 'good', 'fair', 'poor', 'balanced'];
  const validMix: IndustryMix[] = ['diverse', 'tech', 'services', 'retail'];

  if (!validFico.includes(ficoDist)) {
    console.error(`Error: --fico-dist must be one of: ${validFico.join(', ')}`);
    process.exit(1);
  }
  if (!validMix.includes(industryMix)) {
    console.error(`Error: --industry-mix must be one of: ${validMix.join(', ')}`);
    process.exit(1);
  }

  await generateTestData({ count, tenantSlug, startDate, endDate, ficoDist, industryMix, dryRun });
}

main()
  .catch((err) => {
    console.error('\nGeneration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
