// ============================================================
// CapitalForge — Comprehensive Seed Script
// Run: npx tsx prisma/seed-full.ts
//
// Creates:
//   • 3 tenants  (starter / pro / enterprise)
//   • 10 users   distributed across tenants
//   • 25 businesses across industries, stages, FICO ranges
//   • 50+ card applications
//   • 10 funding rounds
//   • Full consent records, compliance checks, documents,
//     suitability checks, ACH authorizations, cost calcs,
//     statements, complaints, partner records, ledger events
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────

function d(iso: string): Date {
  return new Date(iso);
}

function dec(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(value));
}

function daysAgo(days: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  return dt;
}

function daysFromNow(days: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return dt;
}

// ── Seed entry ────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Seeding CapitalForge comprehensive demo data...\n');

  const passwordHash = await bcrypt.hash('DemoPass123!', 12);

  // ===========================================================
  // TENANTS
  // ===========================================================

  const tenantStarter = await prisma.tenant.upsert({
    where: { slug: 'greenleaf-advisors' },
    update: {},
    create: {
      name: 'Greenleaf Business Advisors',
      slug: 'greenleaf-advisors',
      plan: 'starter',
      isActive: true,
      brandConfig: {
        primaryColor: '#16A34A',
        logoUrl: 'https://greenleaf.capitalforge.io/logo.png',
        supportEmail: 'support@greenleafadvisors.com',
      },
    },
  });

  const tenantPro = await prisma.tenant.upsert({
    where: { slug: 'summit-capital' },
    update: {},
    create: {
      name: 'Summit Capital Partners',
      slug: 'summit-capital',
      plan: 'pro',
      isActive: true,
      brandConfig: {
        primaryColor: '#1E40AF',
        logoUrl: 'https://summit.capitalforge.io/logo.png',
        supportEmail: 'support@summitcapitalpartners.com',
      },
    },
  });

  const tenantEnterprise = await prisma.tenant.upsert({
    where: { slug: 'meridian-funding-group' },
    update: {},
    create: {
      name: 'Meridian Funding Group LLC',
      slug: 'meridian-funding-group',
      plan: 'enterprise',
      isActive: true,
      brandConfig: {
        primaryColor: '#7C3AED',
        logoUrl: 'https://meridian.capitalforge.io/logo.png',
        supportEmail: 'ops@meridianfundinggroup.com',
        whitelabelDomain: 'app.meridianfundinggroup.com',
      },
    },
  });

  console.log(
    `✓ Tenants: ${tenantStarter.slug} | ${tenantPro.slug} | ${tenantEnterprise.slug}`,
  );

  // ===========================================================
  // USERS  (3 starter / 3 pro / 4 enterprise)
  // ===========================================================

  // ── Greenleaf / starter ──
  const glAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantStarter.id, email: 'admin@greenleafadvisors.com' } },
    update: {},
    create: {
      tenantId: tenantStarter.id,
      email: 'admin@greenleafadvisors.com',
      passwordHash,
      firstName: 'Patricia',
      lastName: 'Chen',
      role: 'admin',
      mfaEnabled: true,
      isActive: true,
      lastLoginAt: daysAgo(1),
    },
  });

  const glAdvisor1 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantStarter.id, email: 'advisor1@greenleafadvisors.com' } },
    update: {},
    create: {
      tenantId: tenantStarter.id,
      email: 'advisor1@greenleafadvisors.com',
      passwordHash,
      firstName: 'Darius',
      lastName: 'Monroe',
      role: 'advisor',
      mfaEnabled: false,
      isActive: true,
      lastLoginAt: daysAgo(3),
    },
  });

  const glAdvisor2 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantStarter.id, email: 'advisor2@greenleafadvisors.com' } },
    update: {},
    create: {
      tenantId: tenantStarter.id,
      email: 'advisor2@greenleafadvisors.com',
      passwordHash,
      firstName: 'Sofia',
      lastName: 'Vasquez',
      role: 'advisor',
      mfaEnabled: false,
      isActive: true,
      lastLoginAt: daysAgo(7),
    },
  });

  // ── Summit Capital / pro ──
  const scAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantPro.id, email: 'admin@summitcapital.com' } },
    update: {},
    create: {
      tenantId: tenantPro.id,
      email: 'admin@summitcapital.com',
      passwordHash,
      firstName: 'Marcus',
      lastName: 'Okonkwo',
      role: 'admin',
      mfaEnabled: true,
      isActive: true,
      lastLoginAt: daysAgo(0),
    },
  });

  const scAdvisor1 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantPro.id, email: 'advisor1@summitcapital.com' } },
    update: {},
    create: {
      tenantId: tenantPro.id,
      email: 'advisor1@summitcapital.com',
      passwordHash,
      firstName: 'Renata',
      lastName: 'Kowalski',
      role: 'advisor',
      mfaEnabled: true,
      isActive: true,
      lastLoginAt: daysAgo(2),
    },
  });

  const scAdvisor2 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantPro.id, email: 'advisor2@summitcapital.com' } },
    update: {},
    create: {
      tenantId: tenantPro.id,
      email: 'advisor2@summitcapital.com',
      passwordHash,
      firstName: 'Kwame',
      lastName: 'Asante',
      role: 'advisor',
      mfaEnabled: false,
      isActive: true,
      lastLoginAt: daysAgo(5),
    },
  });

  // ── Meridian / enterprise ──
  const mfAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantEnterprise.id, email: 'admin@meridianfundinggroup.com' } },
    update: {},
    create: {
      tenantId: tenantEnterprise.id,
      email: 'admin@meridianfundinggroup.com',
      passwordHash,
      firstName: 'Ingrid',
      lastName: 'Harrington',
      role: 'admin',
      mfaEnabled: true,
      isActive: true,
      lastLoginAt: daysAgo(0),
    },
  });

  const mfSupervisor = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantEnterprise.id, email: 'supervisor@meridianfundinggroup.com' } },
    update: {},
    create: {
      tenantId: tenantEnterprise.id,
      email: 'supervisor@meridianfundinggroup.com',
      passwordHash,
      firstName: 'Roland',
      lastName: 'Desjardins',
      role: 'supervisor',
      mfaEnabled: true,
      isActive: true,
      lastLoginAt: daysAgo(1),
    },
  });

  const mfAdvisor1 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantEnterprise.id, email: 'advisor1@meridianfundinggroup.com' } },
    update: {},
    create: {
      tenantId: tenantEnterprise.id,
      email: 'advisor1@meridianfundinggroup.com',
      passwordHash,
      firstName: 'Yuki',
      lastName: 'Tanaka',
      role: 'advisor',
      mfaEnabled: false,
      isActive: true,
      lastLoginAt: daysAgo(2),
    },
  });

  const mfAdvisor2 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantEnterprise.id, email: 'advisor2@meridianfundinggroup.com' } },
    update: {},
    create: {
      tenantId: tenantEnterprise.id,
      email: 'advisor2@meridianfundinggroup.com',
      passwordHash,
      firstName: 'Cornelius',
      lastName: 'Webb',
      role: 'advisor',
      mfaEnabled: false,
      isActive: true,
      lastLoginAt: daysAgo(4),
    },
  });

  console.log('✓ Users: 10 created across 3 tenants');

  // ===========================================================
  // BUSINESSES  — 25 total across all tenants
  // ===========================================================

  // ── Greenleaf (starter) — 5 businesses ─────────────────────

  const gl_biz1 = await prisma.business.upsert({
    where: { id: 'fs-gl-biz-001' },
    update: {},
    create: {
      id: 'fs-gl-biz-001',
      tenantId: tenantStarter.id,
      advisorId: glAdvisor1.id,
      legalName: 'Blue Horizon Landscaping LLC',
      dba: 'Blue Horizon',
      ein: '45-2318901',
      entityType: 'llc',
      stateOfFormation: 'GA',
      dateOfFormation: d('2018-04-10'),
      mcc: '0780',
      industry: 'Landscaping & Grounds Maintenance',
      annualRevenue: dec('580000'),
      monthlyRevenue: dec('48333'),
      fundingReadinessScore: 79,
      status: 'active',
    },
  });

  const gl_biz2 = await prisma.business.upsert({
    where: { id: 'fs-gl-biz-002' },
    update: {},
    create: {
      id: 'fs-gl-biz-002',
      tenantId: tenantStarter.id,
      advisorId: glAdvisor1.id,
      legalName: 'Coastal Craft Brewing Co',
      dba: 'Coastal Craft',
      ein: '38-4492017',
      entityType: 's_corp',
      stateOfFormation: 'SC',
      dateOfFormation: d('2020-06-22'),
      mcc: '5813',
      industry: 'Food & Beverage',
      annualRevenue: dec('1100000'),
      monthlyRevenue: dec('91667'),
      fundingReadinessScore: 83,
      status: 'active',
    },
  });

  const gl_biz3 = await prisma.business.upsert({
    where: { id: 'fs-gl-biz-003' },
    update: {},
    create: {
      id: 'fs-gl-biz-003',
      tenantId: tenantStarter.id,
      advisorId: glAdvisor2.id,
      legalName: 'Nexus Freight Solutions LLC',
      dba: 'Nexus Freight',
      ein: '62-7830154',
      entityType: 'llc',
      stateOfFormation: 'TN',
      dateOfFormation: d('2021-01-08'),
      mcc: '4731',
      industry: 'Freight & Logistics',
      annualRevenue: dec('2400000'),
      monthlyRevenue: dec('200000'),
      fundingReadinessScore: 91,
      status: 'active',
    },
  });

  const gl_biz4 = await prisma.business.upsert({
    where: { id: 'fs-gl-biz-004' },
    update: {},
    create: {
      id: 'fs-gl-biz-004',
      tenantId: tenantStarter.id,
      advisorId: glAdvisor2.id,
      legalName: 'Pinnacle Home Services Inc',
      dba: 'Pinnacle Home',
      ein: '55-1087443',
      entityType: 'c_corp',
      stateOfFormation: 'OH',
      dateOfFormation: d('2019-09-30'),
      mcc: '1731',
      industry: 'Home Services & Contracting',
      annualRevenue: dec('760000'),
      monthlyRevenue: dec('63333'),
      fundingReadinessScore: 72,
      status: 'onboarding',
    },
  });

  const gl_biz5 = await prisma.business.upsert({
    where: { id: 'fs-gl-biz-005' },
    update: {},
    create: {
      id: 'fs-gl-biz-005',
      tenantId: tenantStarter.id,
      advisorId: null,
      legalName: 'Brightside Dental Partners LLC',
      dba: 'Brightside Dental',
      ein: '49-3301887',
      entityType: 'llc',
      stateOfFormation: 'NC',
      dateOfFormation: d('2022-03-14'),
      mcc: '8021',
      industry: 'Healthcare — Dental',
      annualRevenue: dec('920000'),
      monthlyRevenue: dec('76667'),
      fundingReadinessScore: 68,
      status: 'intake',
    },
  });

  // ── Summit Capital (pro) — 10 businesses ───────────────────

  const sc_biz1 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-001' },
    update: {},
    create: {
      id: 'fs-sc-biz-001',
      tenantId: tenantPro.id,
      advisorId: scAdvisor1.id,
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

  const sc_biz2 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-002' },
    update: {},
    create: {
      id: 'fs-sc-biz-002',
      tenantId: tenantPro.id,
      advisorId: scAdvisor1.id,
      legalName: 'Iron Ridge Construction Corp',
      dba: 'Iron Ridge',
      ein: '78-5541239',
      entityType: 'c_corp',
      stateOfFormation: 'CO',
      dateOfFormation: d('2017-11-05'),
      mcc: '1521',
      industry: 'General Contracting',
      annualRevenue: dec('3200000'),
      monthlyRevenue: dec('266667'),
      fundingReadinessScore: 94,
      status: 'active',
    },
  });

  const sc_biz3 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-003' },
    update: {},
    create: {
      id: 'fs-sc-biz-003',
      tenantId: tenantPro.id,
      advisorId: scAdvisor1.id,
      legalName: 'Harvest & Table Catering LLC',
      dba: 'Harvest & Table',
      ein: '33-9204765',
      entityType: 'llc',
      stateOfFormation: 'IL',
      dateOfFormation: d('2020-08-19'),
      mcc: '5812',
      industry: 'Food & Beverage',
      annualRevenue: dec('480000'),
      monthlyRevenue: dec('40000'),
      fundingReadinessScore: 61,
      status: 'onboarding',
    },
  });

  const sc_biz4 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-004' },
    update: {},
    create: {
      id: 'fs-sc-biz-004',
      tenantId: tenantPro.id,
      advisorId: scAdvisor2.id,
      legalName: 'Clarity Wealth Management LLC',
      dba: 'Clarity Wealth',
      ein: '26-8872300',
      entityType: 'llc',
      stateOfFormation: 'NY',
      dateOfFormation: d('2016-02-28'),
      mcc: '6282',
      industry: 'Financial Advisory',
      annualRevenue: dec('2100000'),
      monthlyRevenue: dec('175000'),
      fundingReadinessScore: 96,
      status: 'active',
    },
  });

  const sc_biz5 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-005' },
    update: {},
    create: {
      id: 'fs-sc-biz-005',
      tenantId: tenantPro.id,
      advisorId: scAdvisor2.id,
      legalName: 'Solara Energy Solutions Inc',
      dba: 'Solara Energy',
      ein: '84-1130022',
      entityType: 'c_corp',
      stateOfFormation: 'AZ',
      dateOfFormation: d('2021-04-01'),
      mcc: '1731',
      industry: 'Renewable Energy',
      annualRevenue: dec('1750000'),
      monthlyRevenue: dec('145833'),
      fundingReadinessScore: 85,
      status: 'active',
    },
  });

  const sc_biz6 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-006' },
    update: {},
    create: {
      id: 'fs-sc-biz-006',
      tenantId: tenantPro.id,
      advisorId: scAdvisor2.id,
      legalName: 'Thornfield Medical Staffing LLC',
      dba: 'Thornfield Medical',
      ein: '71-4457890',
      entityType: 'llc',
      stateOfFormation: 'PA',
      dateOfFormation: d('2018-07-17'),
      mcc: '7363',
      industry: 'Healthcare Staffing',
      annualRevenue: dec('4100000'),
      monthlyRevenue: dec('341667'),
      fundingReadinessScore: 92,
      status: 'active',
    },
  });

  const sc_biz7 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-007' },
    update: {},
    create: {
      id: 'fs-sc-biz-007',
      tenantId: tenantPro.id,
      advisorId: scAdvisor1.id,
      legalName: 'Riviera Spa & Wellness Centers LLC',
      dba: 'Riviera Spa',
      ein: '59-2098341',
      entityType: 'llc',
      stateOfFormation: 'FL',
      dateOfFormation: d('2020-12-09'),
      mcc: '7011',
      industry: 'Hospitality & Wellness',
      annualRevenue: dec('620000'),
      monthlyRevenue: dec('51667'),
      fundingReadinessScore: 58,
      status: 'onboarding',
    },
  });

  const sc_biz8 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-008' },
    update: {},
    create: {
      id: 'fs-sc-biz-008',
      tenantId: tenantPro.id,
      advisorId: scAdvisor2.id,
      legalName: 'Vantage Auto Repair Group Inc',
      dba: 'Vantage Auto',
      ein: '37-6612054',
      entityType: 'c_corp',
      stateOfFormation: 'MI',
      dateOfFormation: d('2015-06-11'),
      mcc: '7531',
      industry: 'Automotive Services',
      annualRevenue: dec('980000'),
      monthlyRevenue: dec('81667'),
      fundingReadinessScore: 76,
      status: 'active',
    },
  });

  const sc_biz9 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-009' },
    update: {},
    create: {
      id: 'fs-sc-biz-009',
      tenantId: tenantPro.id,
      advisorId: null,
      legalName: 'Keystone E-Commerce Ventures LLC',
      dba: 'Keystone Commerce',
      ein: '93-3048712',
      entityType: 'llc',
      stateOfFormation: 'WA',
      dateOfFormation: d('2022-09-30'),
      mcc: '5999',
      industry: 'E-Commerce & Retail',
      annualRevenue: dec('320000'),
      monthlyRevenue: dec('26667'),
      fundingReadinessScore: 52,
      status: 'intake',
    },
  });

  const sc_biz10 = await prisma.business.upsert({
    where: { id: 'fs-sc-biz-010' },
    update: {},
    create: {
      id: 'fs-sc-biz-010',
      tenantId: tenantPro.id,
      advisorId: scAdvisor1.id,
      legalName: 'Alpine Print & Packaging Corp',
      dba: 'Alpine Print',
      ein: '81-2267499',
      entityType: 'c_corp',
      stateOfFormation: 'MN',
      dateOfFormation: d('2014-03-25'),
      mcc: '2750',
      industry: 'Commercial Printing',
      annualRevenue: dec('1380000'),
      monthlyRevenue: dec('115000'),
      fundingReadinessScore: 80,
      status: 'active',
    },
  });

  // ── Meridian Funding Group (enterprise) — 10 businesses ────

  const mf_biz1 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-001' },
    update: {},
    create: {
      id: 'fs-mf-biz-001',
      tenantId: tenantEnterprise.id,
      advisorId: mfAdvisor1.id,
      legalName: 'Ironclad Logistics Inc',
      dba: 'Ironclad',
      ein: '61-9234801',
      entityType: 'c_corp',
      stateOfFormation: 'TX',
      dateOfFormation: d('2016-11-20'),
      mcc: '4731',
      industry: 'Freight & Logistics',
      annualRevenue: dec('5200000'),
      monthlyRevenue: dec('433333'),
      fundingReadinessScore: 95,
      status: 'active',
    },
  });

  const mf_biz2 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-002' },
    update: {},
    create: {
      id: 'fs-mf-biz-002',
      tenantId: tenantEnterprise.id,
      advisorId: mfAdvisor1.id,
      legalName: 'ClearPath Insurance Agency LLC',
      dba: 'ClearPath Insurance',
      ein: '44-8870215',
      entityType: 'llc',
      stateOfFormation: 'GA',
      dateOfFormation: d('2017-05-03'),
      mcc: '6411',
      industry: 'Insurance',
      annualRevenue: dec('1600000'),
      monthlyRevenue: dec('133333'),
      fundingReadinessScore: 87,
      status: 'active',
    },
  });

  const mf_biz3 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-003' },
    update: {},
    create: {
      id: 'fs-mf-biz-003',
      tenantId: tenantEnterprise.id,
      advisorId: mfAdvisor1.id,
      legalName: 'Harbor Point Real Estate LLC',
      dba: 'Harbor Point Realty',
      ein: '32-5513408',
      entityType: 'llc',
      stateOfFormation: 'MA',
      dateOfFormation: d('2013-09-15'),
      mcc: '6552',
      industry: 'Real Estate',
      annualRevenue: dec('3800000'),
      monthlyRevenue: dec('316667'),
      fundingReadinessScore: 90,
      status: 'active',
    },
  });

  const mf_biz4 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-004' },
    update: {},
    create: {
      id: 'fs-mf-biz-004',
      tenantId: tenantEnterprise.id,
      advisorId: mfAdvisor2.id,
      legalName: 'NovaTech Manufacturing Inc',
      dba: 'NovaTech',
      ein: '57-4431092',
      entityType: 'c_corp',
      stateOfFormation: 'OH',
      dateOfFormation: d('2012-07-28'),
      mcc: '3990',
      industry: 'Manufacturing',
      annualRevenue: dec('7800000'),
      monthlyRevenue: dec('650000'),
      fundingReadinessScore: 97,
      status: 'active',
    },
  });

  const mf_biz5 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-005' },
    update: {},
    create: {
      id: 'fs-mf-biz-005',
      tenantId: tenantEnterprise.id,
      advisorId: mfAdvisor2.id,
      legalName: 'Brightwood Learning Centers LLC',
      dba: 'Brightwood Learning',
      ein: '66-2901347',
      entityType: 'llc',
      stateOfFormation: 'VA',
      dateOfFormation: d('2018-02-14'),
      mcc: '8299',
      industry: 'Education Services',
      annualRevenue: dec('2200000'),
      monthlyRevenue: dec('183333'),
      fundingReadinessScore: 82,
      status: 'active',
    },
  });

  const mf_biz6 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-006' },
    update: {},
    create: {
      id: 'fs-mf-biz-006',
      tenantId: tenantEnterprise.id,
      advisorId: mfAdvisor2.id,
      legalName: 'Crestview Veterinary Group LLC',
      dba: 'Crestview Vet',
      ein: '73-1849205',
      entityType: 'llc',
      stateOfFormation: 'TX',
      dateOfFormation: d('2019-10-01'),
      mcc: '0742',
      industry: 'Veterinary Services',
      annualRevenue: dec('880000'),
      monthlyRevenue: dec('73333'),
      fundingReadinessScore: 77,
      status: 'active',
    },
  });

  const mf_biz7 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-007' },
    update: {},
    create: {
      id: 'fs-mf-biz-007',
      tenantId: tenantEnterprise.id,
      advisorId: mfAdvisor1.id,
      legalName: 'Skyline Architecture Partners LLC',
      dba: 'Skyline Architecture',
      ein: '88-3300617',
      entityType: 'llc',
      stateOfFormation: 'CA',
      dateOfFormation: d('2015-12-01'),
      mcc: '8911',
      industry: 'Architecture & Engineering',
      annualRevenue: dec('1450000'),
      monthlyRevenue: dec('120833'),
      fundingReadinessScore: 84,
      status: 'active',
    },
  });

  const mf_biz8 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-008' },
    update: {},
    create: {
      id: 'fs-mf-biz-008',
      tenantId: tenantEnterprise.id,
      advisorId: mfAdvisor2.id,
      legalName: 'Delta Security Systems LLC',
      dba: 'Delta Security',
      ein: '51-7782034',
      entityType: 'llc',
      stateOfFormation: 'NV',
      dateOfFormation: d('2020-03-22'),
      mcc: '7382',
      industry: 'Security Services',
      annualRevenue: dec('720000'),
      monthlyRevenue: dec('60000'),
      fundingReadinessScore: 63,
      status: 'onboarding',
    },
  });

  const mf_biz9 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-009' },
    update: {},
    create: {
      id: 'fs-mf-biz-009',
      tenantId: tenantEnterprise.id,
      advisorId: null,
      legalName: 'Orion Staffing Solutions Corp',
      dba: 'Orion Staffing',
      ein: '29-4401088',
      entityType: 'c_corp',
      stateOfFormation: 'IL',
      dateOfFormation: d('2021-06-30'),
      mcc: '7363',
      industry: 'Staffing & Recruiting',
      annualRevenue: dec('540000'),
      monthlyRevenue: dec('45000'),
      fundingReadinessScore: 55,
      status: 'intake',
    },
  });

  const mf_biz10 = await prisma.business.upsert({
    where: { id: 'fs-mf-biz-010' },
    update: {},
    create: {
      id: 'fs-mf-biz-010',
      tenantId: tenantEnterprise.id,
      advisorId: mfAdvisor1.id,
      legalName: 'Golden Gate Franchise Systems LLC',
      dba: 'Golden Gate Franchise',
      ein: '96-0043217',
      entityType: 'llc',
      stateOfFormation: 'CA',
      dateOfFormation: d('2016-08-15'),
      mcc: '5812',
      industry: 'Franchise Operations',
      annualRevenue: dec('6400000'),
      monthlyRevenue: dec('533333'),
      fundingReadinessScore: 93,
      status: 'active',
    },
  });

  console.log('✓ Businesses: 25 created');

  // ===========================================================
  // CREDIT PROFILES — representative selection
  // ===========================================================

  const creditProfiles = [
    // Excellent FICO (760+)
    { id: 'fs-cp-001', businessId: sc_biz4.id, profileType: 'personal', bureau: 'experian',    score: 812, scoreType: 'fico', utilization: '0.09', inquiries: 1, derogatory: 0 },
    { id: 'fs-cp-002', businessId: mf_biz4.id, profileType: 'personal', bureau: 'equifax',     score: 798, scoreType: 'fico', utilization: '0.11', inquiries: 2, derogatory: 0 },
    { id: 'fs-cp-003', businessId: sc_biz2.id, profileType: 'personal', bureau: 'transunion',  score: 781, scoreType: 'fico', utilization: '0.13', inquiries: 1, derogatory: 0 },
    { id: 'fs-cp-004', businessId: mf_biz3.id, profileType: 'personal', bureau: 'experian',    score: 775, scoreType: 'fico', utilization: '0.16', inquiries: 2, derogatory: 0 },
    { id: 'fs-cp-005', businessId: gl_biz3.id, profileType: 'personal', bureau: 'equifax',     score: 763, scoreType: 'fico', utilization: '0.18', inquiries: 3, derogatory: 0 },
    // Good FICO (700-759)
    { id: 'fs-cp-006', businessId: sc_biz1.id, profileType: 'personal', bureau: 'experian',    score: 748, scoreType: 'fico', utilization: '0.22', inquiries: 3, derogatory: 0 },
    { id: 'fs-cp-007', businessId: mf_biz1.id, profileType: 'personal', bureau: 'transunion',  score: 741, scoreType: 'fico', utilization: '0.25', inquiries: 2, derogatory: 0 },
    { id: 'fs-cp-008', businessId: gl_biz2.id, profileType: 'personal', bureau: 'equifax',     score: 729, scoreType: 'fico', utilization: '0.28', inquiries: 4, derogatory: 0 },
    { id: 'fs-cp-009', businessId: mf_biz2.id, profileType: 'personal', bureau: 'experian',    score: 714, scoreType: 'fico', utilization: '0.30', inquiries: 3, derogatory: 1 },
    { id: 'fs-cp-010', businessId: sc_biz5.id, profileType: 'personal', bureau: 'transunion',  score: 706, scoreType: 'fico', utilization: '0.32', inquiries: 4, derogatory: 0 },
    // Fair FICO (650-699)
    { id: 'fs-cp-011', businessId: gl_biz4.id, profileType: 'personal', bureau: 'equifax',     score: 693, scoreType: 'fico', utilization: '0.41', inquiries: 5, derogatory: 1 },
    { id: 'fs-cp-012', businessId: sc_biz7.id, profileType: 'personal', bureau: 'experian',    score: 672, scoreType: 'fico', utilization: '0.48', inquiries: 6, derogatory: 2 },
    { id: 'fs-cp-013', businessId: mf_biz8.id, profileType: 'personal', bureau: 'transunion',  score: 658, scoreType: 'fico', utilization: '0.52', inquiries: 7, derogatory: 1 },
    // Business credit (Paydex / SBSS)
    { id: 'fs-cp-014', businessId: sc_biz2.id, profileType: 'business', bureau: 'dnb',         score: 88,  scoreType: 'paydex', utilization: '0.15', inquiries: 2, derogatory: 0 },
    { id: 'fs-cp-015', businessId: mf_biz4.id, profileType: 'business', bureau: 'dnb',         score: 92,  scoreType: 'paydex', utilization: '0.08', inquiries: 1, derogatory: 0 },
    { id: 'fs-cp-016', businessId: mf_biz1.id, profileType: 'business', bureau: 'experian',    score: 180, scoreType: 'sbss',   utilization: '0.20', inquiries: 3, derogatory: 0 },
  ];

  for (const cp of creditProfiles) {
    await prisma.creditProfile.upsert({
      where: { id: cp.id },
      update: {},
      create: {
        id: cp.id,
        businessId: cp.businessId,
        profileType: cp.profileType,
        bureau: cp.bureau,
        score: cp.score,
        scoreType: cp.scoreType,
        utilization: dec(cp.utilization),
        inquiryCount: cp.inquiries,
        derogatoryCount: cp.derogatory,
        tradelines: { accounts: 10 + cp.score % 8, avgAge: 5.0 + (cp.score % 6) },
        pulledAt: daysAgo(Math.floor(cp.score % 30) + 1),
      },
    });
  }
  console.log('✓ Credit profiles: 16 created');

  // ===========================================================
  // FUNDING ROUNDS — 10 rounds
  // ===========================================================

  const fr1 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: sc_biz4.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: sc_biz4.id,
      roundNumber: 1,
      targetCredit: dec('350000'),
      targetCardCount: 8,
      status: 'completed',
      aprExpiryDate: daysFromNow(120),
      alertSent60: true,
      alertSent30: true,
      alertSent15: false,
      startedAt: daysAgo(210),
      completedAt: daysAgo(180),
    },
  });

  const fr2 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: sc_biz4.id, roundNumber: 2 } },
    update: {},
    create: {
      businessId: sc_biz4.id,
      roundNumber: 2,
      targetCredit: dec('500000'),
      targetCardCount: 10,
      status: 'in_progress',
      aprExpiryDate: daysFromNow(365),
      alertSent60: false,
      alertSent30: false,
      alertSent15: false,
      startedAt: daysAgo(30),
    },
  });

  const fr3 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: mf_biz4.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: mf_biz4.id,
      roundNumber: 1,
      targetCredit: dec('750000'),
      targetCardCount: 12,
      status: 'completed',
      aprExpiryDate: daysFromNow(90),
      alertSent60: true,
      alertSent30: true,
      alertSent15: true,
      startedAt: daysAgo(390),
      completedAt: daysAgo(360),
    },
  });

  const fr4 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: mf_biz4.id, roundNumber: 2 } },
    update: {},
    create: {
      businessId: mf_biz4.id,
      roundNumber: 2,
      targetCredit: dec('1000000'),
      targetCardCount: 15,
      status: 'in_progress',
      aprExpiryDate: daysFromNow(390),
      startedAt: daysAgo(45),
    },
  });

  const fr5 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: sc_biz2.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: sc_biz2.id,
      roundNumber: 1,
      targetCredit: dec('250000'),
      targetCardCount: 6,
      status: 'completed',
      aprExpiryDate: daysFromNow(200),
      alertSent60: true,
      alertSent30: false,
      alertSent15: false,
      startedAt: daysAgo(280),
      completedAt: daysAgo(250),
    },
  });

  const fr6 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: mf_biz1.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: mf_biz1.id,
      roundNumber: 1,
      targetCredit: dec('400000'),
      targetCardCount: 9,
      status: 'completed',
      aprExpiryDate: daysFromNow(60),
      alertSent60: true,
      alertSent30: true,
      alertSent15: true,
      startedAt: daysAgo(420),
      completedAt: daysAgo(390),
    },
  });

  const fr7 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: gl_biz3.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: gl_biz3.id,
      roundNumber: 1,
      targetCredit: dec('180000'),
      targetCardCount: 5,
      status: 'in_progress',
      aprExpiryDate: daysFromNow(340),
      startedAt: daysAgo(20),
    },
  });

  const fr8 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: mf_biz3.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: mf_biz3.id,
      roundNumber: 1,
      targetCredit: dec('600000'),
      targetCardCount: 11,
      status: 'completed',
      aprExpiryDate: daysFromNow(150),
      alertSent60: true,
      alertSent30: true,
      alertSent15: false,
      startedAt: daysAgo(330),
      completedAt: daysAgo(300),
    },
  });

  const fr9 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: sc_biz6.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: sc_biz6.id,
      roundNumber: 1,
      targetCredit: dec('450000'),
      targetCardCount: 10,
      status: 'completed',
      aprExpiryDate: daysFromNow(250),
      alertSent60: true,
      alertSent30: false,
      alertSent15: false,
      startedAt: daysAgo(310),
      completedAt: daysAgo(280),
    },
  });

  const fr10 = await prisma.fundingRound.upsert({
    where: { businessId_roundNumber: { businessId: mf_biz10.id, roundNumber: 1 } },
    update: {},
    create: {
      businessId: mf_biz10.id,
      roundNumber: 1,
      targetCredit: dec('900000'),
      targetCardCount: 14,
      status: 'planning',
    },
  });

  console.log('✓ Funding rounds: 10 created');

  // ===========================================================
  // CARD APPLICATIONS — 50+
  // ===========================================================

  type AppSeed = {
    id: string;
    businessId: string;
    fundingRoundId: string | null;
    issuer: string;
    cardProduct: string;
    status: string;
    creditLimit?: string;
    introApr?: string;
    regularApr: string;
    annualFee: string;
    declineReason?: string;
    daysAgoSubmit: number;
  };

  const appSeeds: AppSeed[] = [
    // sc_biz4 / Round 1 — completed round, 7 approved 1 declined
    { id: 'fs-app-001', businessId: sc_biz4.id, fundingRoundId: fr1.id, issuer: 'Chase',           cardProduct: 'Ink Business Preferred',        status: 'approved', creditLimit: '65000', introApr: '0', regularApr: '0.2124', annualFee: '95',  daysAgoSubmit: 185 },
    { id: 'fs-app-002', businessId: sc_biz4.id, fundingRoundId: fr1.id, issuer: 'American Express', cardProduct: 'Blue Business Cash',             status: 'approved', creditLimit: '55000', introApr: '0', regularApr: '0.1849', annualFee: '0',   daysAgoSubmit: 185 },
    { id: 'fs-app-003', businessId: sc_biz4.id, fundingRoundId: fr1.id, issuer: 'Capital One',     cardProduct: 'Spark Cash Plus',               status: 'approved', creditLimit: '50000', introApr: '0', regularApr: '0.2099', annualFee: '150', daysAgoSubmit: 184 },
    { id: 'fs-app-004', businessId: sc_biz4.id, fundingRoundId: fr1.id, issuer: 'Citi',            cardProduct: 'Business AAdvantage Platinum',  status: 'approved', creditLimit: '45000', introApr: '0', regularApr: '0.2174', annualFee: '99',  daysAgoSubmit: 184 },
    { id: 'fs-app-005', businessId: sc_biz4.id, fundingRoundId: fr1.id, issuer: 'Wells Fargo',     cardProduct: 'Business Platinum',             status: 'approved', creditLimit: '40000', introApr: '0', regularApr: '0.1999', annualFee: '0',   daysAgoSubmit: 183 },
    { id: 'fs-app-006', businessId: sc_biz4.id, fundingRoundId: fr1.id, issuer: 'US Bank',         cardProduct: 'Business Triple Cash Rewards',  status: 'approved', creditLimit: '38000', introApr: '0', regularApr: '0.1974', annualFee: '0',   daysAgoSubmit: 183 },
    { id: 'fs-app-007', businessId: sc_biz4.id, fundingRoundId: fr1.id, issuer: 'Truist',          cardProduct: 'Business Cash Rewards',         status: 'approved', creditLimit: '30000', introApr: '0', regularApr: '0.2049', annualFee: '0',   daysAgoSubmit: 182 },
    { id: 'fs-app-008', businessId: sc_biz4.id, fundingRoundId: fr1.id, issuer: 'Bank of America', cardProduct: 'Business Advantage Unlimited',  status: 'declined', regularApr: '0.2099', annualFee: '0', declineReason: 'Too many recent inquiries', daysAgoSubmit: 182 },
    // sc_biz4 / Round 2 — active
    { id: 'fs-app-009', businessId: sc_biz4.id, fundingRoundId: fr2.id, issuer: 'Chase',           cardProduct: 'Ink Business Cash',             status: 'approved', creditLimit: '70000', introApr: '0', regularApr: '0.2099', annualFee: '0',   daysAgoSubmit: 28 },
    { id: 'fs-app-010', businessId: sc_biz4.id, fundingRoundId: fr2.id, issuer: 'American Express', cardProduct: 'Business Gold Card',           status: 'submitted', regularApr: '0.2099', annualFee: '295', daysAgoSubmit: 25 },
    { id: 'fs-app-011', businessId: sc_biz4.id, fundingRoundId: fr2.id, issuer: 'Citi',            cardProduct: 'Business Prestige',             status: 'draft',    regularApr: '0.2099', annualFee: '495', daysAgoSubmit: 5 },
    // mf_biz4 / Round 1
    { id: 'fs-app-012', businessId: mf_biz4.id, fundingRoundId: fr3.id, issuer: 'Chase',           cardProduct: 'Ink Business Unlimited',        status: 'approved', creditLimit: '80000', introApr: '0', regularApr: '0.1999', annualFee: '0',   daysAgoSubmit: 360 },
    { id: 'fs-app-013', businessId: mf_biz4.id, fundingRoundId: fr3.id, issuer: 'American Express', cardProduct: 'Business Platinum Card',       status: 'approved', creditLimit: '100000', introApr: '0', regularApr: '0.2999', annualFee: '695', daysAgoSubmit: 360 },
    { id: 'fs-app-014', businessId: mf_biz4.id, fundingRoundId: fr3.id, issuer: 'Capital One',     cardProduct: 'Venture X Business',            status: 'approved', creditLimit: '90000', introApr: '0', regularApr: '0.2174', annualFee: '395', daysAgoSubmit: 359 },
    { id: 'fs-app-015', businessId: mf_biz4.id, fundingRoundId: fr3.id, issuer: 'Citi',            cardProduct: 'Business AAdvantage Executive', status: 'approved', creditLimit: '75000', introApr: '0', regularApr: '0.2249', annualFee: '450', daysAgoSubmit: 358 },
    { id: 'fs-app-016', businessId: mf_biz4.id, fundingRoundId: fr3.id, issuer: 'Wells Fargo',     cardProduct: 'Business Platinum',             status: 'approved', creditLimit: '70000', introApr: '0', regularApr: '0.1999', annualFee: '0',   daysAgoSubmit: 357 },
    // mf_biz4 / Round 2 — active
    { id: 'fs-app-017', businessId: mf_biz4.id, fundingRoundId: fr4.id, issuer: 'US Bank',         cardProduct: 'Business Leverage',             status: 'submitted', regularApr: '0.2124', annualFee: '95', daysAgoSubmit: 40 },
    { id: 'fs-app-018', businessId: mf_biz4.id, fundingRoundId: fr4.id, issuer: 'Bank of America', cardProduct: 'Business Advantage Travel',     status: 'approved', creditLimit: '85000', introApr: '0', regularApr: '0.2174', annualFee: '200', daysAgoSubmit: 43 },
    // sc_biz2 / Round 1
    { id: 'fs-app-019', businessId: sc_biz2.id, fundingRoundId: fr5.id, issuer: 'Chase',           cardProduct: 'Ink Business Cash',             status: 'approved', creditLimit: '55000', introApr: '0', regularApr: '0.2099', annualFee: '0',   daysAgoSubmit: 248 },
    { id: 'fs-app-020', businessId: sc_biz2.id, fundingRoundId: fr5.id, issuer: 'American Express', cardProduct: 'Blue Business Plus',           status: 'approved', creditLimit: '45000', introApr: '0', regularApr: '0.1874', annualFee: '0',   daysAgoSubmit: 247 },
    { id: 'fs-app-021', businessId: sc_biz2.id, fundingRoundId: fr5.id, issuer: 'Capital One',     cardProduct: 'Spark Miles for Business',      status: 'approved', creditLimit: '42000', introApr: '0', regularApr: '0.2074', annualFee: '95',  daysAgoSubmit: 246 },
    { id: 'fs-app-022', businessId: sc_biz2.id, fundingRoundId: fr5.id, issuer: 'Citi',            cardProduct: 'Business AAdvantage Platinum',  status: 'approved', creditLimit: '38000', introApr: '0', regularApr: '0.2174', annualFee: '99',  daysAgoSubmit: 245 },
    { id: 'fs-app-023', businessId: sc_biz2.id, fundingRoundId: fr5.id, issuer: 'Wells Fargo',     cardProduct: 'Business Elite Signature',      status: 'declined', regularApr: '0.2299', annualFee: '250', declineReason: 'Insufficient business credit history', daysAgoSubmit: 244 },
    // mf_biz1 / Round 1
    { id: 'fs-app-024', businessId: mf_biz1.id, fundingRoundId: fr6.id, issuer: 'Chase',           cardProduct: 'Ink Business Preferred',        status: 'approved', creditLimit: '60000', introApr: '0', regularApr: '0.2124', annualFee: '95',  daysAgoSubmit: 388 },
    { id: 'fs-app-025', businessId: mf_biz1.id, fundingRoundId: fr6.id, issuer: 'American Express', cardProduct: 'Business Gold Card',           status: 'approved', creditLimit: '55000', introApr: '0', regularApr: '0.2099', annualFee: '295', daysAgoSubmit: 387 },
    { id: 'fs-app-026', businessId: mf_biz1.id, fundingRoundId: fr6.id, issuer: 'Capital One',     cardProduct: 'Venture X Business',            status: 'approved', creditLimit: '50000', introApr: '0', regularApr: '0.2174', annualFee: '395', daysAgoSubmit: 386 },
    { id: 'fs-app-027', businessId: mf_biz1.id, fundingRoundId: fr6.id, issuer: 'Citi',            cardProduct: 'ThankYou Business Preferred',   status: 'approved', creditLimit: '45000', introApr: '0', regularApr: '0.2099', annualFee: '0',   daysAgoSubmit: 385 },
    { id: 'fs-app-028', businessId: mf_biz1.id, fundingRoundId: fr6.id, issuer: 'US Bank',         cardProduct: 'Business Triple Cash Rewards',  status: 'approved', creditLimit: '40000', introApr: '0', regularApr: '0.1974', annualFee: '0',   daysAgoSubmit: 384 },
    { id: 'fs-app-029', businessId: mf_biz1.id, fundingRoundId: fr6.id, issuer: 'Truist',          cardProduct: 'Business Cash Rewards',         status: 'approved', creditLimit: '35000', introApr: '0', regularApr: '0.2049', annualFee: '0',   daysAgoSubmit: 383 },
    // gl_biz3 / Round 1 — in progress
    { id: 'fs-app-030', businessId: gl_biz3.id, fundingRoundId: fr7.id, issuer: 'Chase',           cardProduct: 'Ink Business Cash',             status: 'approved', creditLimit: '45000', introApr: '0', regularApr: '0.2099', annualFee: '0',   daysAgoSubmit: 18 },
    { id: 'fs-app-031', businessId: gl_biz3.id, fundingRoundId: fr7.id, issuer: 'American Express', cardProduct: 'Blue Business Cash',           status: 'submitted', regularApr: '0.1849', annualFee: '0', daysAgoSubmit: 15 },
    // mf_biz3 / Round 1
    { id: 'fs-app-032', businessId: mf_biz3.id, fundingRoundId: fr8.id, issuer: 'Chase',           cardProduct: 'Ink Business Preferred',        status: 'approved', creditLimit: '75000', introApr: '0', regularApr: '0.2124', annualFee: '95',  daysAgoSubmit: 298 },
    { id: 'fs-app-033', businessId: mf_biz3.id, fundingRoundId: fr8.id, issuer: 'American Express', cardProduct: 'Business Platinum Card',       status: 'approved', creditLimit: '80000', introApr: '0', regularApr: '0.2999', annualFee: '695', daysAgoSubmit: 297 },
    { id: 'fs-app-034', businessId: mf_biz3.id, fundingRoundId: fr8.id, issuer: 'Capital One',     cardProduct: 'Spark Cash Plus',               status: 'approved', creditLimit: '65000', introApr: '0', regularApr: '0.2099', annualFee: '150', daysAgoSubmit: 296 },
    { id: 'fs-app-035', businessId: mf_biz3.id, fundingRoundId: fr8.id, issuer: 'Citi',            cardProduct: 'Business AAdvantage Executive', status: 'approved', creditLimit: '60000', introApr: '0', regularApr: '0.2249', annualFee: '450', daysAgoSubmit: 295 },
    { id: 'fs-app-036', businessId: mf_biz3.id, fundingRoundId: fr8.id, issuer: 'Wells Fargo',     cardProduct: 'Business Platinum',             status: 'approved', creditLimit: '55000', introApr: '0', regularApr: '0.1999', annualFee: '0',   daysAgoSubmit: 294 },
    // sc_biz6 / Round 1
    { id: 'fs-app-037', businessId: sc_biz6.id, fundingRoundId: fr9.id, issuer: 'Chase',           cardProduct: 'Ink Business Unlimited',        status: 'approved', creditLimit: '60000', introApr: '0', regularApr: '0.1999', annualFee: '0',   daysAgoSubmit: 278 },
    { id: 'fs-app-038', businessId: sc_biz6.id, fundingRoundId: fr9.id, issuer: 'American Express', cardProduct: 'Blue Business Plus',           status: 'approved', creditLimit: '55000', introApr: '0', regularApr: '0.1874', annualFee: '0',   daysAgoSubmit: 277 },
    { id: 'fs-app-039', businessId: sc_biz6.id, fundingRoundId: fr9.id, issuer: 'Capital One',     cardProduct: 'Venture X Business',            status: 'approved', creditLimit: '50000', introApr: '0', regularApr: '0.2174', annualFee: '395', daysAgoSubmit: 276 },
    { id: 'fs-app-040', businessId: sc_biz6.id, fundingRoundId: fr9.id, issuer: 'Citi',            cardProduct: 'Business AAdvantage Platinum',  status: 'approved', creditLimit: '45000', introApr: '0', regularApr: '0.2174', annualFee: '99',  daysAgoSubmit: 275 },
    { id: 'fs-app-041', businessId: sc_biz6.id, fundingRoundId: fr9.id, issuer: 'US Bank',         cardProduct: 'Business Leverage',             status: 'approved', creditLimit: '40000', introApr: '0', regularApr: '0.2124', annualFee: '95',  daysAgoSubmit: 274 },
    // Standalone apps (no round) — various statuses
    { id: 'fs-app-042', businessId: gl_biz2.id, fundingRoundId: null, issuer: 'Chase',           cardProduct: 'Ink Business Cash',           status: 'approved', creditLimit: '35000', introApr: '0', regularApr: '0.2099', annualFee: '0',   daysAgoSubmit: 90 },
    { id: 'fs-app-043', businessId: gl_biz2.id, fundingRoundId: null, issuer: 'American Express', cardProduct: 'Blue Business Cash',         status: 'approved', creditLimit: '30000', introApr: '0', regularApr: '0.1849', annualFee: '0',   daysAgoSubmit: 88 },
    { id: 'fs-app-044', businessId: sc_biz8.id, fundingRoundId: null, issuer: 'Capital One',     cardProduct: 'Spark Cash Plus',             status: 'approved', creditLimit: '28000', introApr: '0', regularApr: '0.2099', annualFee: '150', daysAgoSubmit: 60 },
    { id: 'fs-app-045', businessId: mf_biz5.id, fundingRoundId: null, issuer: 'Chase',           cardProduct: 'Ink Business Preferred',      status: 'submitted', regularApr: '0.2124', annualFee: '95', daysAgoSubmit: 10 },
    { id: 'fs-app-046', businessId: mf_biz7.id, fundingRoundId: null, issuer: 'American Express', cardProduct: 'Business Gold Card',         status: 'draft',    regularApr: '0.2099', annualFee: '295', daysAgoSubmit: 2 },
    { id: 'fs-app-047', businessId: sc_biz5.id, fundingRoundId: null, issuer: 'US Bank',         cardProduct: 'Business Triple Cash Rewards', status: 'approved', creditLimit: '32000', introApr: '0', regularApr: '0.1974', annualFee: '0', daysAgoSubmit: 45 },
    { id: 'fs-app-048', businessId: mf_biz2.id, fundingRoundId: null, issuer: 'Chase',           cardProduct: 'Ink Business Unlimited',      status: 'approved', creditLimit: '40000', introApr: '0', regularApr: '0.1999', annualFee: '0',   daysAgoSubmit: 120 },
    { id: 'fs-app-049', businessId: gl_biz1.id, fundingRoundId: null, issuer: 'Capital One',     cardProduct: 'Spark Miles for Business',    status: 'approved', creditLimit: '25000', introApr: '0', regularApr: '0.2074', annualFee: '95',  daysAgoSubmit: 75 },
    { id: 'fs-app-050', businessId: mf_biz6.id, fundingRoundId: null, issuer: 'Citi',            cardProduct: 'Business AAdvantage Platinum', status: 'declined', regularApr: '0.2174', annualFee: '99', declineReason: 'Insufficient annual revenue', daysAgoSubmit: 30 },
    { id: 'fs-app-051', businessId: sc_biz9.id, fundingRoundId: null, issuer: 'American Express', cardProduct: 'Blue Business Plus',         status: 'draft',    regularApr: '0.1874', annualFee: '0',   daysAgoSubmit: 1 },
    { id: 'fs-app-052', businessId: mf_biz9.id, fundingRoundId: null, issuer: 'Chase',           cardProduct: 'Ink Business Cash',           status: 'draft',    regularApr: '0.2099', annualFee: '0',   daysAgoSubmit: 1 },
  ];

  for (const app of appSeeds) {
    const submitDate = daysAgo(app.daysAgoSubmit);
    const decideDate = daysAgo(app.daysAgoSubmit - 3);
    await prisma.cardApplication.upsert({
      where: { id: app.id },
      update: {},
      create: {
        id: app.id,
        businessId: app.businessId,
        fundingRoundId: app.fundingRoundId,
        issuer: app.issuer,
        cardProduct: app.cardProduct,
        status: app.status,
        creditLimit: app.creditLimit ? dec(app.creditLimit) : undefined,
        introApr: app.introApr !== undefined ? dec(app.introApr) : undefined,
        introAprExpiry: app.introApr === '0' ? daysFromNow(365 - app.daysAgoSubmit) : undefined,
        regularApr: dec(app.regularApr),
        annualFee: dec(app.annualFee),
        declineReason: app.declineReason,
        adverseActionNotice: app.declineReason
          ? { reason: app.declineReason, issuedAt: decideDate.toISOString(), creditBureau: 'Experian' }
          : undefined,
        consentCapturedAt: app.status !== 'draft' ? daysAgo(app.daysAgoSubmit + 1) : undefined,
        submittedAt: app.status !== 'draft' ? submitDate : undefined,
        decidedAt: ['approved', 'declined'].includes(app.status) ? decideDate : undefined,
      },
    });
  }
  console.log(`✓ Card applications: ${appSeeds.length} created`);

  // ===========================================================
  // CONSENT RECORDS
  // ===========================================================

  const consentData = [
    { id: 'fs-cons-001', tenantId: tenantPro.id,        businessId: sc_biz4.id, channel: 'document', type: 'tcpa',         status: 'active',  daysAgo: 200 },
    { id: 'fs-cons-002', tenantId: tenantPro.id,        businessId: sc_biz4.id, channel: 'email',    type: 'data_sharing', status: 'active',  daysAgo: 200 },
    { id: 'fs-cons-003', tenantId: tenantPro.id,        businessId: sc_biz2.id, channel: 'voice',    type: 'tcpa',         status: 'active',  daysAgo: 260 },
    { id: 'fs-cons-004', tenantId: tenantEnterprise.id, businessId: mf_biz4.id, channel: 'document', type: 'application', status: 'active',  daysAgo: 380 },
    { id: 'fs-cons-005', tenantId: tenantEnterprise.id, businessId: mf_biz4.id, channel: 'email',    type: 'data_sharing', status: 'active',  daysAgo: 380 },
    { id: 'fs-cons-006', tenantId: tenantEnterprise.id, businessId: mf_biz1.id, channel: 'voice',    type: 'tcpa',         status: 'active',  daysAgo: 400 },
    { id: 'fs-cons-007', tenantId: tenantEnterprise.id, businessId: mf_biz1.id, channel: 'document', type: 'referral',     status: 'active',  daysAgo: 405 },
    { id: 'fs-cons-008', tenantId: tenantStarter.id,    businessId: gl_biz3.id, channel: 'email',    type: 'tcpa',         status: 'active',  daysAgo: 22 },
    { id: 'fs-cons-009', tenantId: tenantStarter.id,    businessId: gl_biz1.id, channel: 'sms',      type: 'tcpa',         status: 'active',  daysAgo: 80 },
    { id: 'fs-cons-010', tenantId: tenantPro.id,        businessId: sc_biz6.id, channel: 'document', type: 'application', status: 'active',  daysAgo: 285 },
    { id: 'fs-cons-011', tenantId: tenantEnterprise.id, businessId: mf_biz3.id, channel: 'document', type: 'tcpa',         status: 'revoked', daysAgo: 310, revokedDaysAgo: 100 },
    { id: 'fs-cons-012', tenantId: tenantPro.id,        businessId: sc_biz9.id, channel: 'email',    type: 'tcpa',         status: 'active',  daysAgo: 5 },
  ];

  for (const c of consentData) {
    await prisma.consentRecord.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        tenantId: c.tenantId,
        businessId: c.businessId,
        channel: c.channel,
        consentType: c.type,
        status: c.status,
        grantedAt: daysAgo(c.daysAgo),
        revokedAt: c.revokedDaysAgo ? daysAgo(c.revokedDaysAgo) : undefined,
        revocationReason: c.revokedDaysAgo ? 'Client request — opted out of further contact' : undefined,
        ipAddress: '198.51.100.' + (c.daysAgo % 255),
        evidenceRef: `evidence-${c.id}`,
        metadata: { source: 'onboarding', version: '3.0' },
      },
    });
  }
  console.log('✓ Consent records: 12 created');

  // ===========================================================
  // COMPLIANCE CHECKS
  // ===========================================================

  const complianceData = [
    { id: 'fs-cc-001', tenantId: tenantPro.id,        businessId: sc_biz4.id,  checkType: 'kyb',        riskScore: 10, riskLevel: 'low',      jurisdiction: 'DE', resolved: true,  daysAgo: 195 },
    { id: 'fs-cc-002', tenantId: tenantPro.id,        businessId: sc_biz4.id,  checkType: 'udap',       riskScore: 15, riskLevel: 'low',      jurisdiction: 'NY', resolved: true,  daysAgo: 195 },
    { id: 'fs-cc-003', tenantId: tenantEnterprise.id, businessId: mf_biz4.id,  checkType: 'kyb',        riskScore: 8,  riskLevel: 'low',      jurisdiction: 'OH', resolved: true,  daysAgo: 375 },
    { id: 'fs-cc-004', tenantId: tenantEnterprise.id, businessId: mf_biz4.id,  checkType: 'state_law',  riskScore: 12, riskLevel: 'low',      jurisdiction: 'OH', resolved: true,  daysAgo: 370 },
    { id: 'fs-cc-005', tenantId: tenantEnterprise.id, businessId: mf_biz1.id,  checkType: 'kyb',        riskScore: 18, riskLevel: 'low',      jurisdiction: 'TX', resolved: true,  daysAgo: 395 },
    { id: 'fs-cc-006', tenantId: tenantPro.id,        businessId: sc_biz7.id,  checkType: 'udap',       riskScore: 42, riskLevel: 'medium',   jurisdiction: 'FL', resolved: false, daysAgo: 30 },
    { id: 'fs-cc-007', tenantId: tenantStarter.id,    businessId: gl_biz4.id,  checkType: 'kyb',        riskScore: 35, riskLevel: 'medium',   jurisdiction: 'OH', resolved: false, daysAgo: 45 },
    { id: 'fs-cc-008', tenantId: tenantEnterprise.id, businessId: mf_biz8.id,  checkType: 'vendor',     riskScore: 28, riskLevel: 'medium',   jurisdiction: 'NV', resolved: false, daysAgo: 15 },
    { id: 'fs-cc-009', tenantId: tenantEnterprise.id, businessId: mf_biz3.id,  checkType: 'state_law',  riskScore: 22, riskLevel: 'low',      jurisdiction: 'MA', resolved: true,  daysAgo: 295 },
    { id: 'fs-cc-010', tenantId: tenantPro.id,        businessId: sc_biz2.id,  checkType: 'kyb',        riskScore: 14, riskLevel: 'low',      jurisdiction: 'CO', resolved: true,  daysAgo: 255 },
    { id: 'fs-cc-011', tenantId: tenantEnterprise.id, businessId: mf_biz10.id, checkType: 'udap',       riskScore: 58, riskLevel: 'high',     jurisdiction: 'CA', resolved: false, daysAgo: 10 },
    { id: 'fs-cc-012', tenantId: tenantStarter.id,    businessId: gl_biz5.id,  checkType: 'kyb',        riskScore: 25, riskLevel: 'medium',   jurisdiction: 'NC', resolved: false, daysAgo: 20 },
  ];

  for (const cc of complianceData) {
    await prisma.complianceCheck.upsert({
      where: { id: cc.id },
      update: {},
      create: {
        id: cc.id,
        tenantId: cc.tenantId,
        businessId: cc.businessId,
        checkType: cc.checkType,
        riskScore: cc.riskScore,
        riskLevel: cc.riskLevel,
        findings: {
          summary: `${cc.checkType.toUpperCase()} check completed. Risk level: ${cc.riskLevel}.`,
          ofacClean: true,
          stateCompliant: cc.riskScore < 40,
        },
        stateJurisdiction: cc.jurisdiction,
        resolvedAt: cc.resolved ? daysAgo(cc.daysAgo - 5) : undefined,
        createdAt: daysAgo(cc.daysAgo),
      },
    });
  }
  console.log('✓ Compliance checks: 12 created');

  // ===========================================================
  // DOCUMENTS
  // ===========================================================

  const docData = [
    { id: 'fs-doc-001', tenantId: tenantPro.id,        businessId: sc_biz4.id,  docType: 'product_acknowledgment', title: 'Product Reality Acknowledgment v3.0 — Clarity Wealth',   storageKey: 'vault/sc/sc-biz4/ack-product-v3.pdf',      mime: 'application/pdf', size: 142000, daysAgo: 200 },
    { id: 'fs-doc-002', tenantId: tenantPro.id,        businessId: sc_biz4.id,  docType: 'fee_schedule',           title: 'Fee Schedule v2.2 — Clarity Wealth',                     storageKey: 'vault/sc/sc-biz4/fee-schedule-v2.2.pdf',   mime: 'application/pdf', size: 98000,  daysAgo: 200 },
    { id: 'fs-doc-003', tenantId: tenantPro.id,        businessId: sc_biz4.id,  docType: 'consent',                title: 'TCPA Consent — Clarity Wealth 2025',                     storageKey: 'vault/sc/sc-biz4/consent-tcpa-2025.pdf',   mime: 'application/pdf', size: 65000,  daysAgo: 200 },
    { id: 'fs-doc-004', tenantId: tenantEnterprise.id, businessId: mf_biz4.id,  docType: 'tax_return',             title: '2024 Business Tax Return — NovaTech Manufacturing',      storageKey: 'vault/mf/mf-biz4/tax-return-2024.pdf',     mime: 'application/pdf', size: 892000, daysAgo: 90 },
    { id: 'fs-doc-005', tenantId: tenantEnterprise.id, businessId: mf_biz4.id,  docType: 'bank_statement',         title: 'Bank Statement Jan-Mar 2026 — NovaTech',                 storageKey: 'vault/mf/mf-biz4/bank-stmt-q1-2026.pdf',   mime: 'application/pdf', size: 445000, daysAgo: 15 },
    { id: 'fs-doc-006', tenantId: tenantEnterprise.id, businessId: mf_biz1.id,  docType: 'articles_of_inc',        title: 'Articles of Incorporation — Ironclad Logistics',         storageKey: 'vault/mf/mf-biz1/articles-of-inc.pdf',    mime: 'application/pdf', size: 210000, daysAgo: 400 },
    { id: 'fs-doc-007', tenantId: tenantEnterprise.id, businessId: mf_biz1.id,  docType: 'ach_authorization',      title: 'ACH Authorization Agreement — Ironclad Logistics',       storageKey: 'vault/mf/mf-biz1/ach-auth-2022.pdf',      mime: 'application/pdf', size: 78000,  daysAgo: 395 },
    { id: 'fs-doc-008', tenantId: tenantStarter.id,    businessId: gl_biz3.id,  docType: 'consent',                title: 'TCPA Consent — Nexus Freight 2026',                      storageKey: 'vault/gl/gl-biz3/consent-tcpa-2026.pdf',   mime: 'application/pdf', size: 65000,  daysAgo: 22 },
    { id: 'fs-doc-009', tenantId: tenantPro.id,        businessId: sc_biz2.id,  docType: 'bank_statement',         title: 'Bank Statement Q1 2026 — Iron Ridge Construction',       storageKey: 'vault/sc/sc-biz2/bank-stmt-q1-2026.pdf',   mime: 'application/pdf', size: 380000, daysAgo: 20 },
    { id: 'fs-doc-010', tenantId: tenantEnterprise.id, businessId: mf_biz3.id,  docType: 'lease_agreement',        title: 'Commercial Lease — Harbor Point Realty HQ',              storageKey: 'vault/mf/mf-biz3/lease-hq-2024.pdf',      mime: 'application/pdf', size: 520000, daysAgo: 180 },
    { id: 'fs-doc-011', tenantId: tenantEnterprise.id, businessId: mf_biz10.id, docType: 'franchise_agreement',    title: 'Master Franchise Agreement — Golden Gate Franchise',     storageKey: 'vault/mf/mf-biz10/franchise-agreement.pdf', mime: 'application/pdf', size: 2100000, daysAgo: 60 },
    { id: 'fs-doc-012', tenantId: tenantPro.id,        businessId: sc_biz6.id,  docType: 'product_acknowledgment', title: 'Product Reality Acknowledgment — Thornfield Medical',    storageKey: 'vault/sc/sc-biz6/ack-product-v3.pdf',      mime: 'application/pdf', size: 142000, daysAgo: 285 },
  ];

  for (const doc of docData) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: {},
      create: {
        id: doc.id,
        tenantId: doc.tenantId,
        businessId: doc.businessId,
        documentType: doc.docType,
        title: doc.title,
        storageKey: doc.storageKey,
        mimeType: doc.mime,
        sizeBytes: doc.size,
        sha256Hash: `sha256:${doc.id}-${doc.daysAgo}`,
        legalHold: false,
        metadata: { uploadedVia: 'web', version: '1' },
        uploadedBy: mfAdmin.id,
        createdAt: daysAgo(doc.daysAgo),
      },
    });
  }
  console.log('✓ Documents: 12 created');

  // ===========================================================
  // STATEMENT RECORDS
  // ===========================================================

  const stmtData = [
    { id: 'fs-stmt-001', tenantId: tenantPro.id,        businessId: sc_biz4.id, appId: 'fs-app-001', issuer: 'Chase',           daysAgo: 15,  balance: '64200', minPay: '642',  interest: '0',   fees: '0'   },
    { id: 'fs-stmt-002', tenantId: tenantPro.id,        businessId: sc_biz4.id, appId: 'fs-app-002', issuer: 'American Express', daysAgo: 14,  balance: '52100', minPay: '521',  interest: '0',   fees: '0'   },
    { id: 'fs-stmt-003', tenantId: tenantPro.id,        businessId: sc_biz4.id, appId: 'fs-app-009', issuer: 'Chase',           daysAgo: 5,   balance: '68000', minPay: '680',  interest: '0',   fees: '0'   },
    { id: 'fs-stmt-004', tenantId: tenantEnterprise.id, businessId: mf_biz4.id, appId: 'fs-app-012', issuer: 'Chase',           daysAgo: 30,  balance: '79500', minPay: '795',  interest: '0',   fees: '0'   },
    { id: 'fs-stmt-005', tenantId: tenantEnterprise.id, businessId: mf_biz4.id, appId: 'fs-app-013', issuer: 'American Express', daysAgo: 28,  balance: '98200', minPay: '982',  interest: '0',   fees: '695' },
    { id: 'fs-stmt-006', tenantId: tenantEnterprise.id, businessId: mf_biz1.id, appId: 'fs-app-024', issuer: 'Chase',           daysAgo: 60,  balance: '58900', minPay: '1178', interest: '1048', fees: '95'  },
    { id: 'fs-stmt-007', tenantId: tenantPro.id,        businessId: sc_biz2.id, appId: 'fs-app-019', issuer: 'Chase',           daysAgo: 45,  balance: '48200', minPay: '964',  interest: '850', fees: '0'   },
    { id: 'fs-stmt-008', tenantId: tenantEnterprise.id, businessId: mf_biz3.id, appId: 'fs-app-032', issuer: 'Chase',           daysAgo: 20,  balance: '72400', minPay: '724',  interest: '0',   fees: '95'  },
    { id: 'fs-stmt-009', tenantId: tenantPro.id,        businessId: sc_biz6.id, appId: 'fs-app-037', issuer: 'Chase',           daysAgo: 10,  balance: '58100', minPay: '581',  interest: '0',   fees: '0'   },
    { id: 'fs-stmt-010', tenantId: tenantStarter.id,    businessId: gl_biz2.id, appId: 'fs-app-042', issuer: 'Chase',           daysAgo: 30,  balance: '33200', minPay: '664',  interest: '584', fees: '0'   },
  ];

  for (const s of stmtData) {
    await prisma.statementRecord.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        tenantId: s.tenantId,
        businessId: s.businessId,
        cardApplicationId: s.appId,
        issuer: s.issuer,
        statementDate: daysAgo(s.daysAgo),
        closingBalance: dec(s.balance),
        minimumPayment: dec(s.minPay),
        dueDate: daysFromNow(21 - s.daysAgo),
        interestCharged: dec(s.interest),
        feesCharged: dec(s.fees),
        reconciled: parseFloat(s.interest) > 0,
        normalizedData: { raw: true, extractedBy: 'ocr-pipeline-v2' },
      },
    });
  }
  console.log('✓ Statement records: 10 created');

  // ===========================================================
  // COMPLAINTS
  // ===========================================================

  const complaints = [
    { id: 'fs-comp-001', tenantId: tenantPro.id,        bizId: sc_biz4.id,  category: 'fee_dispute',         source: 'email',   severity: 'medium', status: 'resolved', desc: 'Client disputes program fee calculation for round 1. Claims fee was applied twice.', daysAgo: 60 },
    { id: 'fs-comp-002', tenantId: tenantEnterprise.id, bizId: mf_biz1.id,  category: 'adverse_action',      source: 'phone',   severity: 'high',   status: 'resolved', desc: 'Client did not receive required adverse action notice within required 30-day window.', daysAgo: 120 },
    { id: 'fs-comp-003', tenantId: tenantEnterprise.id, bizId: mf_biz4.id,  category: 'unauthorized_inquiry', source: 'email',  severity: 'high',   status: 'open',     desc: 'Business owner alleges a credit inquiry was made without explicit consent.', daysAgo: 15 },
    { id: 'fs-comp-004', tenantId: tenantStarter.id,    bizId: gl_biz4.id,  category: 'communication',       source: 'email',   severity: 'low',    status: 'resolved', desc: 'Advisor contacted client outside approved hours — called at 8:45 PM EST.', daysAgo: 90 },
    { id: 'fs-comp-005', tenantId: tenantPro.id,        bizId: sc_biz7.id,  category: 'suitability',         source: 'cfpb',    severity: 'critical', status: 'open',   desc: 'Client filed CFPB complaint alleging program was unsuitable given high debt-to-income ratio.', daysAgo: 10 },
    { id: 'fs-comp-006', tenantId: tenantEnterprise.id, bizId: mf_biz3.id,  category: 'misrepresentation',   source: 'attorney', severity: 'high',  status: 'escalated', desc: 'Attorney letter alleging advisor misrepresented 0% APR duration during sales call.', daysAgo: 30 },
    { id: 'fs-comp-007', tenantId: tenantEnterprise.id, bizId: mf_biz10.id, category: 'data_privacy',        source: 'email',   severity: 'medium', status: 'open',     desc: 'Franchise operator requests CCPA data deletion for two former sub-franchisees.', daysAgo: 5 },
  ];

  for (const comp of complaints) {
    await prisma.complaint.upsert({
      where: { id: comp.id },
      update: {},
      create: {
        id: comp.id,
        tenantId: comp.tenantId,
        businessId: comp.bizId,
        category: comp.category,
        source: comp.source,
        severity: comp.severity,
        status: comp.status,
        description: comp.desc,
        resolution: comp.status === 'resolved' ? 'Issue investigated and resolved. Client acknowledged resolution in writing.' : undefined,
        resolvedAt: comp.status === 'resolved' ? daysAgo(comp.daysAgo - 14) : undefined,
        createdAt: daysAgo(comp.daysAgo),
      },
    });
  }
  console.log('✓ Complaints: 7 created');

  // ===========================================================
  // PARTNERS
  // ===========================================================

  const partnerData = [
    { id: 'fs-part-001', tenantId: tenantEnterprise.id, name: 'Experian Business Services',   type: 'credit_bureau',  compScore: 92, ddStatus: 'completed', daysAgo: 400 },
    { id: 'fs-part-002', tenantId: tenantEnterprise.id, name: 'Equifax Commercial Solutions',  type: 'credit_bureau',  compScore: 90, ddStatus: 'completed', daysAgo: 390 },
    { id: 'fs-part-003', tenantId: tenantEnterprise.id, name: 'Stripe Treasury',               type: 'payment_processor', compScore: 95, ddStatus: 'completed', daysAgo: 380 },
    { id: 'fs-part-004', tenantId: tenantEnterprise.id, name: 'DocuSign Enterprise',            type: 'esignature',     compScore: 98, ddStatus: 'completed', daysAgo: 380 },
    { id: 'fs-part-005', tenantId: tenantPro.id,        name: 'Plaid Financial Data',          type: 'data_provider',  compScore: 88, ddStatus: 'completed', daysAgo: 250 },
    { id: 'fs-part-006', tenantId: tenantPro.id,        name: 'First National Referral Network', type: 'referral',     compScore: 75, ddStatus: 'in_review', daysAgo: 45 },
    { id: 'fs-part-007', tenantId: tenantStarter.id,    name: 'Southeast Broker Alliance',     type: 'referral',       compScore: 70, ddStatus: 'pending',   daysAgo: 10 },
    { id: 'fs-part-008', tenantId: tenantEnterprise.id, name: 'Marlin Business Services',      type: 'co_lender',      compScore: 85, ddStatus: 'completed', daysAgo: 180 },
  ];

  for (const p of partnerData) {
    await prisma.partner.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        tenantId: p.tenantId,
        name: p.name,
        type: p.type,
        status: 'active',
        complianceScore: p.compScore,
        dueDiligenceStatus: p.ddStatus,
        onboardedAt: p.ddStatus === 'completed' ? daysAgo(p.daysAgo) : undefined,
        nextReviewDate: daysFromNow(90),
        metadata: { contractSigned: p.ddStatus === 'completed', tier: p.compScore > 90 ? 'preferred' : 'standard' },
        createdAt: daysAgo(p.daysAgo),
      },
    });
  }
  console.log('✓ Partners: 8 created');

  // ===========================================================
  // SUITABILITY CHECKS
  // ===========================================================

  await prisma.suitabilityCheck.upsert({
    where: { id: 'fs-suit-001' },
    update: {},
    create: {
      id: 'fs-suit-001',
      businessId: sc_biz4.id,
      score: 96,
      maxSafeLeverage: dec('500000'),
      recommendation: 'proceed',
      noGoTriggered: false,
      noGoReasons: [],
      decisionExplanation: 'Excellent FICO (812), 8+ year LLC, revenue coverage 18x monthly. Approved for maximum stacking program.',
    },
  });

  await prisma.suitabilityCheck.upsert({
    where: { id: 'fs-suit-002' },
    update: {},
    create: {
      id: 'fs-suit-002',
      businessId: mf_biz4.id,
      score: 97,
      maxSafeLeverage: dec('1000000'),
      recommendation: 'proceed',
      noGoTriggered: false,
      noGoReasons: [],
      decisionExplanation: 'Elite profile — FICO 798, manufacturing LLC 12 years, annual revenue $7.8M. Full enterprise stacking approved.',
    },
  });

  await prisma.suitabilityCheck.upsert({
    where: { id: 'fs-suit-003' },
    update: {},
    create: {
      id: 'fs-suit-003',
      businessId: sc_biz7.id,
      score: 42,
      maxSafeLeverage: dec('40000'),
      recommendation: 'do_not_proceed',
      noGoTriggered: true,
      noGoReasons: ['FICO below 660', 'High utilization >45%', 'Multiple derogatory marks'],
      alternativeProducts: ['SBA 7(a) loan', 'Invoice factoring', 'Merchant cash advance'],
      decisionExplanation: 'FICO 672, utilization 48%, 2 derogatory marks. No-Go triggered. Refer to alternative products.',
    },
  });

  await prisma.suitabilityCheck.upsert({
    where: { id: 'fs-suit-004' },
    update: {},
    create: {
      id: 'fs-suit-004',
      businessId: gl_biz3.id,
      score: 82,
      maxSafeLeverage: dec('180000'),
      recommendation: 'proceed',
      noGoTriggered: false,
      noGoReasons: [],
      decisionExplanation: 'Strong FICO (763), logistics LLC 5 years, $2.4M revenue. Conservative card count of 5 recommended given industry seasonality.',
    },
  });

  console.log('✓ Suitability checks: 4 created');

  // ===========================================================
  // ACH AUTHORIZATIONS
  // ===========================================================

  await prisma.achAuthorization.upsert({
    where: { id: 'fs-ach-001' },
    update: {},
    create: {
      id: 'fs-ach-001',
      businessId: sc_biz4.id,
      processorName: 'Stripe Treasury',
      authorizedAmount: dec('8500'),
      authorizedFrequency: 'monthly',
      status: 'active',
      signedDocumentRef: 'docusign-ach-env-sc4-001',
      authorizedAt: daysAgo(195),
    },
  });

  await prisma.achAuthorization.upsert({
    where: { id: 'fs-ach-002' },
    update: {},
    create: {
      id: 'fs-ach-002',
      businessId: mf_biz4.id,
      processorName: 'Stripe Treasury',
      authorizedAmount: dec('15000'),
      authorizedFrequency: 'monthly',
      status: 'active',
      signedDocumentRef: 'docusign-ach-env-mf4-001',
      authorizedAt: daysAgo(375),
    },
  });

  await prisma.achAuthorization.upsert({
    where: { id: 'fs-ach-003' },
    update: {},
    create: {
      id: 'fs-ach-003',
      businessId: mf_biz1.id,
      processorName: 'Plaid ACH',
      authorizedAmount: dec('12000'),
      authorizedFrequency: 'monthly',
      status: 'active',
      signedDocumentRef: 'docusign-ach-env-mf1-001',
      authorizedAt: daysAgo(395),
    },
  });

  console.log('✓ ACH authorizations: 3 created');

  // ===========================================================
  // COST CALCULATIONS
  // ===========================================================

  await prisma.costCalculation.upsert({
    where: { id: 'fs-cost-001' },
    update: {},
    create: {
      id: 'fs-cost-001',
      businessId: sc_biz4.id,
      programFees: dec('29750'),
      percentOfFunding: dec('0.085'),
      annualFees: dec('442'),
      cashAdvanceFees: dec('0'),
      processorFees: dec('1020'),
      totalCost: dec('31212'),
      effectiveApr: dec('0.0891'),
      irc163jImpact: dec('6242'),
      bestCaseFlow: { months: 12, netBenefit: 142000, roi: 3.55, assumptions: 'Full utilization, 12-month 0% APR' },
      baseCaseFlow:  { months: 12, netBenefit: 89000,  roi: 1.85, assumptions: '70% utilization, standard APR after promo' },
      worstCaseFlow: { months: 12, netBenefit: -8000,  roi: -0.26, assumptions: 'Full balance at regular APR, late fees' },
    },
  });

  await prisma.costCalculation.upsert({
    where: { id: 'fs-cost-002' },
    update: {},
    create: {
      id: 'fs-cost-002',
      businessId: mf_biz4.id,
      programFees: dec('63750'),
      percentOfFunding: dec('0.085'),
      annualFees: dec('1840'),
      cashAdvanceFees: dec('0'),
      processorFees: dec('1800'),
      totalCost: dec('67390'),
      effectiveApr: dec('0.0898'),
      irc163jImpact: dec('13478'),
      bestCaseFlow: { months: 12, netBenefit: 385000, roi: 4.71, assumptions: 'Full utilization, all cards at 0% promo' },
      baseCaseFlow:  { months: 12, netBenefit: 210000, roi: 2.12, assumptions: '75% utilization, mixed APR environment' },
      worstCaseFlow: { months: 12, netBenefit: -22000, roi: -0.33, assumptions: 'High carry balance at regular APR' },
    },
  });

  console.log('✓ Cost calculations: 2 created');

  // ===========================================================
  // LEDGER EVENTS
  // ===========================================================

  const ledgerEvents = [
    { tenantId: tenantPro.id,        eventType: 'business.created',       aggregateType: 'business',      aggregateId: sc_biz4.id,  payload: { legalName: sc_biz4.legalName,  status: 'active' } },
    { tenantId: tenantEnterprise.id, eventType: 'business.created',       aggregateType: 'business',      aggregateId: mf_biz4.id,  payload: { legalName: mf_biz4.legalName,  status: 'active' } },
    { tenantId: tenantEnterprise.id, eventType: 'business.created',       aggregateType: 'business',      aggregateId: mf_biz1.id,  payload: { legalName: mf_biz1.legalName,  status: 'active' } },
    { tenantId: tenantPro.id,        eventType: 'funding_round.completed', aggregateType: 'funding_round', aggregateId: fr1.id,      payload: { roundNumber: 1, totalApproved: 323000 } },
    { tenantId: tenantEnterprise.id, eventType: 'funding_round.completed', aggregateType: 'funding_round', aggregateId: fr3.id,      payload: { roundNumber: 1, totalApproved: 415000 } },
    { tenantId: tenantEnterprise.id, eventType: 'funding_round.completed', aggregateType: 'funding_round', aggregateId: fr6.id,      payload: { roundNumber: 1, totalApproved: 288000 } },
    { tenantId: tenantPro.id,        eventType: 'card_application.approved', aggregateType: 'card_application', aggregateId: 'fs-app-001', payload: { issuer: 'Chase', creditLimit: 65000 } },
    { tenantId: tenantEnterprise.id, eventType: 'card_application.approved', aggregateType: 'card_application', aggregateId: 'fs-app-012', payload: { issuer: 'Chase', creditLimit: 80000 } },
    { tenantId: tenantPro.id,        eventType: 'complaint.opened',       aggregateType: 'complaint',     aggregateId: 'fs-comp-005', payload: { severity: 'critical', category: 'suitability' } },
    { tenantId: tenantEnterprise.id, eventType: 'compliance.flag_raised', aggregateType: 'compliance_check', aggregateId: 'fs-cc-011', payload: { riskLevel: 'high', jurisdiction: 'CA' } },
  ];

  for (const ev of ledgerEvents) {
    await prisma.ledgerEvent.create({
      data: {
        tenantId: ev.tenantId,
        eventType: ev.eventType,
        aggregateType: ev.aggregateType,
        aggregateId: ev.aggregateId,
        payload: ev.payload,
        metadata: { source: 'seed-full', version: 1 },
        processedAt: new Date(),
      },
    });
  }
  console.log('✓ Ledger events: 10 created');

  // ===========================================================
  // SUMMARY
  // ===========================================================

  console.log('\n✅ Comprehensive seed complete.');
  console.log('');
  console.log('  Tenants (3):');
  console.log(`    starter  → ${tenantStarter.slug}`);
  console.log(`    pro      → ${tenantPro.slug}`);
  console.log(`    enterprise → ${tenantEnterprise.slug}`);
  console.log('');
  console.log('  Users (10): admin + advisors per tenant');
  console.log('  Businesses (25): diverse industries, stages, FICO ranges');
  console.log('  Funding rounds (10)');
  console.log(`  Card applications (${appSeeds.length})`);
  console.log('  Credit profiles (16)');
  console.log('  Consent records (12)');
  console.log('  Compliance checks (12)');
  console.log('  Documents (12)');
  console.log('  Statement records (10)');
  console.log('  Complaints (7)');
  console.log('  Partners (8)');
  console.log('  Suitability checks (4)');
  console.log('  ACH authorizations (3)');
  console.log('  Cost calculations (2)');
  console.log('  Ledger events (10)');
  console.log('');
  console.log('  Default password: DemoPass123!');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
