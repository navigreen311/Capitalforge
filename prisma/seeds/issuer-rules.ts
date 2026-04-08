// ============================================================
// CapitalForge — Issuer Rules Seed Data
//
// Seeds:
//   - 7 major issuers with their application rules
//   - 6 credit unions with business card products
//
// Run via: npm run db:seed (called from prisma/seed.ts)
// ============================================================

import { PrismaClient } from '@prisma/client';

export async function seedIssuerRules(prisma: PrismaClient): Promise<void> {
  console.log('  🏦 Seeding issuers and rules...');

  // ============================================================
  // ISSUERS
  // ============================================================

  const chase = await prisma.issuer.upsert({
    where: { slug: 'chase' },
    update: {},
    create: {
      name: 'Chase',
      slug: 'chase',
      type: 'bank',
      logoUrl: 'https://cdn.capitalforge.io/issuers/chase.svg',
      phoneRecon: '1-888-270-2127',
      isActive: true,
      notes: 'Largest US card issuer. Known for strict 5/24 rule. Business cards may bypass 5/24 in some cases.',
    },
  });

  const amex = await prisma.issuer.upsert({
    where: { slug: 'american-express' },
    update: {},
    create: {
      name: 'American Express',
      slug: 'american-express',
      type: 'bank',
      logoUrl: 'https://cdn.capitalforge.io/issuers/amex.svg',
      phoneRecon: '1-800-567-1083',
      isActive: true,
      notes: 'Once-per-lifetime bonus rule. Soft pull for existing members. Charge cards have no preset spending limit.',
    },
  });

  const capitalOne = await prisma.issuer.upsert({
    where: { slug: 'capital-one' },
    update: {},
    create: {
      name: 'Capital One',
      slug: 'capital-one',
      type: 'bank',
      logoUrl: 'https://cdn.capitalforge.io/issuers/capital-one.svg',
      phoneRecon: '1-800-625-7866',
      isActive: true,
      notes: 'Inquiry-sensitive. Limits total open cards. Spark business cards require strong profile.',
    },
  });

  const citi = await prisma.issuer.upsert({
    where: { slug: 'citi' },
    update: {},
    create: {
      name: 'Citi',
      slug: 'citi',
      type: 'bank',
      logoUrl: 'https://cdn.capitalforge.io/issuers/citi.svg',
      phoneRecon: '1-800-695-5171',
      isActive: true,
      notes: 'Strict velocity rules. 24-month bonus restriction on many products. Good recon success rate.',
    },
  });

  const bofa = await prisma.issuer.upsert({
    where: { slug: 'bank-of-america' },
    update: {},
    create: {
      name: 'Bank of America',
      slug: 'bank-of-america',
      type: 'bank',
      logoUrl: 'https://cdn.capitalforge.io/issuers/bofa.svg',
      phoneRecon: '1-800-481-8277',
      isActive: true,
      notes: 'Preferred Rewards program boosts approval odds. 2/3/4 rule limits new accounts.',
    },
  });

  const usbank = await prisma.issuer.upsert({
    where: { slug: 'us-bank' },
    update: {},
    create: {
      name: 'US Bank',
      slug: 'us-bank',
      type: 'bank',
      logoUrl: 'https://cdn.capitalforge.io/issuers/usbank.svg',
      phoneRecon: '1-800-947-1444',
      isActive: true,
      notes: 'Prefers existing banking relationship. Conservative with new applicants. Low inquiry tolerance.',
    },
  });

  const wells = await prisma.issuer.upsert({
    where: { slug: 'wells-fargo' },
    update: {},
    create: {
      name: 'Wells Fargo',
      slug: 'wells-fargo',
      type: 'bank',
      logoUrl: 'https://cdn.capitalforge.io/issuers/wells-fargo.svg',
      phoneRecon: '1-800-967-9521',
      isActive: true,
      notes: 'Banking relationship strongly preferred. Cell phone protection benefit on some cards.',
    },
  });

  console.log('    ✓ 7 issuers created');

  // ============================================================
  // ISSUER RULES
  // ============================================================

  // ── Chase Rules ───────────────────────────────────────────
  const chaseRules = [
    {
      issuerId: chase.id,
      ruleType: 'velocity_max_apps_per_period',
      name: 'Chase 5/24 Rule',
      description: 'Chase will auto-decline applicants who have opened 5 or more new credit cards (any issuer) in the past 24 months.',
      value: 5,
      periodDays: 730,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/chase-5-24-rule/',
    },
    {
      issuerId: chase.id,
      ruleType: 'velocity_cooldown_days',
      name: 'Chase 30-Day Rule',
      description: 'Chase limits approvals to 1 business card per 30-day rolling window.',
      value: 1,
      periodDays: 30,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/chase-application-rules/',
    },
    {
      issuerId: chase.id,
      ruleType: 'velocity_max_apps_per_period',
      name: 'Chase 2/65/90 Rule',
      description: 'Chase limits applicants to 2 new card approvals per 65-day window, and 1 card of the same product family per 90 days.',
      value: 2,
      periodDays: 65,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/chase-application-rules/',
    },
    {
      issuerId: chase.id,
      ruleType: 'blackout_after_decline',
      name: 'Chase Decline Blackout',
      description: 'After a Chase decline, wait at least 30 days before reapplying. Recon within 30 days of denial.',
      value: 30,
      periodDays: 30,
      severity: 'soft',
      sourceUrl: 'https://www.doctorofcredit.com/chase-reconsideration-line/',
    },
  ];

  // ── Amex Rules ────────────────────────────────────────────
  const amexRules = [
    {
      issuerId: amex.id,
      ruleType: 'once_per_lifetime',
      name: 'Amex Once-Per-Lifetime Bonus',
      description: 'American Express limits signup bonuses to once per lifetime per card product. Cannot earn the bonus again if you have ever held the card.',
      value: 1,
      periodDays: null,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/amex-lifetime-language/',
    },
    {
      issuerId: amex.id,
      ruleType: 'velocity_max_apps_per_period',
      name: 'Amex 2/90 Rule',
      description: 'Amex limits applicants to 2 new credit card approvals within a 90-day window.',
      value: 2,
      periodDays: 90,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/amex-application-rules/',
    },
    {
      issuerId: amex.id,
      ruleType: 'portfolio_maximum',
      name: 'Amex 5-Card Maximum',
      description: 'Amex limits individuals to 5 credit cards at one time (charge cards are excluded from this limit).',
      value: 5,
      periodDays: null,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/amex-5-card-limit/',
    },
    {
      issuerId: amex.id,
      ruleType: 'score_minimum',
      name: 'Amex Minimum Credit Score',
      description: 'American Express typically requires a minimum FICO score of 680 for business card approval.',
      value: 680,
      periodDays: null,
      severity: 'soft',
      sourceUrl: null,
    },
  ];

  // ── Capital One Rules ─────────────────────────────────────
  const capitalOneRules = [
    {
      issuerId: capitalOne.id,
      ruleType: 'velocity_cooldown_days',
      name: 'Capital One 6-Month Rule',
      description: 'Capital One prefers at least 6 months between new card applications from the same applicant.',
      value: 1,
      periodDays: 180,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/capital-one-application-rules/',
    },
    {
      issuerId: capitalOne.id,
      ruleType: 'velocity_max_apps_per_period',
      name: 'Capital One 1/6 Months',
      description: 'Capital One typically limits applicants to 1 approval per 6 months.',
      value: 1,
      periodDays: 180,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/capital-one-application-rules/',
    },
    {
      issuerId: capitalOne.id,
      ruleType: 'inquiry_maximum',
      name: 'Capital One Inquiry Sensitivity',
      description: 'Capital One is highly inquiry-sensitive. More than 6 hard inquiries in the past 6 months significantly reduces approval odds.',
      value: 6,
      periodDays: 180,
      severity: 'soft',
      sourceUrl: null,
    },
  ];

  // ── Citi Rules ────────────────────────────────────────────
  const citiRules = [
    {
      issuerId: citi.id,
      ruleType: 'velocity_max_apps_per_period',
      name: 'Citi 1/65/90 Rule',
      description: 'Citi limits applicants to 1 application per 8 days and 2 applications per 65 days. Some products enforce 1 per 90 days.',
      value: 1,
      periodDays: 8,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/citi-application-rules/',
    },
    {
      issuerId: citi.id,
      ruleType: 'velocity_max_apps_per_period',
      name: 'Citi 2/65 Rule',
      description: 'Citi limits applicants to 2 new card applications per 65-day rolling window.',
      value: 2,
      periodDays: 65,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/citi-application-rules/',
    },
    {
      issuerId: citi.id,
      ruleType: 'once_per_lifetime',
      name: 'Citi 24-Month Bonus Rule',
      description: 'Citi restricts signup bonuses to once per 24 months for the same product family. Must have closed the card and waited 24 months.',
      value: 1,
      periodDays: 730,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/citi-24-month-rule/',
    },
  ];

  // ── Bank of America Rules ─────────────────────────────────
  const bofaRules = [
    {
      issuerId: bofa.id,
      ruleType: 'velocity_max_apps_per_period',
      name: 'BofA 2/3/4 Rule',
      description: 'Bank of America limits: 2 new cards per 30 days, 3 per 12 months, 4 per 24 months.',
      value: 2,
      periodDays: 30,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/bank-of-america-application-rules/',
    },
    {
      issuerId: bofa.id,
      ruleType: 'velocity_max_apps_per_period',
      name: 'BofA 3/12 Rule',
      description: 'Bank of America limits applicants to 3 new cards per 12-month rolling window.',
      value: 3,
      periodDays: 365,
      severity: 'hard',
      sourceUrl: 'https://www.doctorofcredit.com/bank-of-america-application-rules/',
    },
    {
      issuerId: bofa.id,
      ruleType: 'relationship_requirement',
      name: 'BofA Preferred Rewards',
      description: 'Bank of America Preferred Rewards members ($20K+ in combined balances) receive significantly better approval odds and credit limits.',
      value: 20000,
      periodDays: null,
      severity: 'soft',
      sourceUrl: null,
    },
  ];

  // ── US Bank Rules ─────────────────────────────────────────
  const usbankRules = [
    {
      issuerId: usbank.id,
      ruleType: 'relationship_requirement',
      name: 'US Bank Existing Relationship',
      description: 'US Bank strongly prefers applicants with an existing checking or savings account. New-to-bank applicants face significantly lower approval rates.',
      value: 1,
      periodDays: null,
      severity: 'soft',
      sourceUrl: null,
    },
    {
      issuerId: usbank.id,
      ruleType: 'velocity_cooldown_days',
      name: 'US Bank 6-Month Cooldown',
      description: 'US Bank prefers at least 6 months between new card applications.',
      value: 1,
      periodDays: 180,
      severity: 'hard',
      sourceUrl: null,
    },
    {
      issuerId: usbank.id,
      ruleType: 'inquiry_maximum',
      name: 'US Bank Inquiry Limit',
      description: 'US Bank is very inquiry-sensitive. More than 3 inquiries in the past 12 months is a red flag.',
      value: 3,
      periodDays: 365,
      severity: 'soft',
      sourceUrl: null,
    },
  ];

  // ── Wells Fargo Rules ─────────────────────────────────────
  const wellsRules = [
    {
      issuerId: wells.id,
      ruleType: 'velocity_cooldown_days',
      name: 'Wells Fargo 6-Month Rule',
      description: 'Wells Fargo prefers at least 6 months between new card applications.',
      value: 1,
      periodDays: 180,
      severity: 'hard',
      sourceUrl: null,
    },
    {
      issuerId: wells.id,
      ruleType: 'relationship_requirement',
      name: 'Wells Fargo Banking Relationship',
      description: 'Wells Fargo strongly prefers applicants with existing checking/savings. Business cards often require a business checking account.',
      value: 1,
      periodDays: null,
      severity: 'soft',
      sourceUrl: null,
    },
  ];

  // Bulk create all rules
  const allRules = [
    ...chaseRules,
    ...amexRules,
    ...capitalOneRules,
    ...citiRules,
    ...bofaRules,
    ...usbankRules,
    ...wellsRules,
  ];

  // Delete existing rules to avoid duplicates on re-seed
  await prisma.issuerRule.deleteMany({});

  for (const rule of allRules) {
    await prisma.issuerRule.create({
      data: {
        issuerId: rule.issuerId,
        ruleType: rule.ruleType,
        name: rule.name,
        description: rule.description,
        value: rule.value,
        periodDays: rule.periodDays,
        severity: rule.severity,
        sourceUrl: rule.sourceUrl,
        lastVerified: new Date(),
        isActive: true,
      },
    });
  }

  console.log(`    ✓ ${allRules.length} issuer rules created`);

  // ============================================================
  // CREDIT UNIONS
  // ============================================================

  const navyFederal = await prisma.creditUnion.upsert({
    where: { slug: 'navy-federal' },
    update: {},
    create: {
      name: 'Navy Federal Credit Union',
      slug: 'navy-federal',
      charterNumber: '5536',
      membershipCriteria: 'Active duty military, veterans, DoD civilians, and immediate family members',
      openMembership: false,
      joinFee: 0,
      assetMillions: 165000,
      businessCardsOffered: true,
      isActive: true,
      notes: 'Largest US credit union. Generous business credit limits. CLI-friendly.',
    },
  });

  const alliant = await prisma.creditUnion.upsert({
    where: { slug: 'alliant' },
    update: {},
    create: {
      name: 'Alliant Credit Union',
      slug: 'alliant',
      charterNumber: '14354',
      membershipCriteria: 'Anyone can join via Foster Care to Success donation ($5)',
      openMembership: true,
      joinFee: 5,
      assetMillions: 19000,
      businessCardsOffered: true,
      isActive: true,
      notes: 'Easy membership. Competitive rates. Good online banking platform.',
    },
  });

  const penfed = await prisma.creditUnion.upsert({
    where: { slug: 'penfed' },
    update: {},
    create: {
      name: 'PenFed Credit Union',
      slug: 'penfed',
      charterNumber: '4309',
      membershipCriteria: 'Anyone can join via Voices for Americas Troops donation or military affiliation',
      openMembership: true,
      joinFee: 5,
      assetMillions: 36000,
      businessCardsOffered: true,
      isActive: true,
      notes: 'Open to all. Strong business lending program. Competitive APRs.',
    },
  });

  const firstTech = await prisma.creditUnion.upsert({
    where: { slug: 'first-tech' },
    update: {},
    create: {
      name: 'First Tech Federal Credit Union',
      slug: 'first-tech',
      charterNumber: '4098',
      membershipCriteria: 'Employees of select tech companies (Intel, HP, Microsoft, Nike, Amazon, etc.) or join via Computer History Museum ($50)',
      openMembership: true,
      joinFee: 50,
      assetMillions: 17000,
      businessCardsOffered: true,
      isActive: true,
      notes: 'Tech industry focused. Excellent rates. Strong digital banking.',
    },
  });

  const becu = await prisma.creditUnion.upsert({
    where: { slug: 'becu' },
    update: {},
    create: {
      name: 'BECU (Boeing Employees Credit Union)',
      slug: 'becu',
      charterNumber: '4201',
      membershipCriteria: 'Must live, work, or attend school in Washington state',
      openMembership: false,
      joinFee: 0,
      assetMillions: 29000,
      businessCardsOffered: true,
      isActive: true,
      notes: 'WA state only. Low APRs. No annual fees on any cards. Strong business lending.',
    },
  });

  const lakeMichiganCU = await prisma.creditUnion.upsert({
    where: { slug: 'lake-michigan-cu' },
    update: {},
    create: {
      name: 'Lake Michigan Credit Union',
      slug: 'lake-michigan-cu',
      charterNumber: '7649',
      membershipCriteria: 'Anyone can join via $5 ALS of Michigan donation',
      openMembership: true,
      joinFee: 5,
      assetMillions: 12000,
      businessCardsOffered: true,
      isActive: true,
      notes: 'Open membership via charity donation. Low rates. Michigan-based but open to all.',
    },
  });

  console.log('    ✓ 6 credit unions created');

  // ============================================================
  // CREDIT UNION PRODUCTS
  // ============================================================

  await prisma.creditUnionProduct.deleteMany({});

  const products = [
    // Navy Federal
    {
      creditUnionId: navyFederal.id,
      productName: 'Navy Federal Business Visa',
      productType: 'business_credit_card',
      maxLimit: 50000,
      aprIntro: 0,
      aprIntroMonths: 12,
      aprPostPromo: 13.24,
      annualFee: 0,
      scoreMinimum: 670,
      businessAgeMinimum: 6,
      revenueMinimum: null,
      rewardsType: 'cashback',
      rewardsRate: 1.5,
      personalGuarantee: true,
      hardPull: true,
      notes: 'Generous limits for military-affiliated businesses.',
    },
    {
      creditUnionId: navyFederal.id,
      productName: 'Navy Federal Business Platinum',
      productType: 'business_credit_card',
      maxLimit: 75000,
      aprIntro: 0,
      aprIntroMonths: 15,
      aprPostPromo: 11.99,
      annualFee: 0,
      scoreMinimum: 700,
      businessAgeMinimum: 12,
      revenueMinimum: 100000,
      rewardsType: null,
      rewardsRate: null,
      personalGuarantee: true,
      hardPull: true,
      notes: 'Low ongoing APR. Best for balance transfer or 0% funding.',
    },
    // Alliant
    {
      creditUnionId: alliant.id,
      productName: 'Alliant Business Visa Platinum',
      productType: 'business_credit_card',
      maxLimit: 35000,
      aprIntro: 0,
      aprIntroMonths: 12,
      aprPostPromo: 14.49,
      annualFee: 0,
      scoreMinimum: 680,
      businessAgeMinimum: 6,
      revenueMinimum: null,
      rewardsType: 'cashback',
      rewardsRate: 2.5,
      personalGuarantee: true,
      hardPull: true,
      notes: 'Strong cashback rate. Easy membership through donation.',
    },
    // PenFed
    {
      creditUnionId: penfed.id,
      productName: 'PenFed Business Rewards Visa',
      productType: 'business_credit_card',
      maxLimit: 50000,
      aprIntro: 0,
      aprIntroMonths: 12,
      aprPostPromo: 14.99,
      annualFee: 0,
      scoreMinimum: 680,
      businessAgeMinimum: 6,
      revenueMinimum: 50000,
      rewardsType: 'points',
      rewardsRate: 1.5,
      personalGuarantee: true,
      hardPull: true,
      notes: 'Points redeemable for travel and statement credits.',
    },
    {
      creditUnionId: penfed.id,
      productName: 'PenFed Business Line of Credit',
      productType: 'line_of_credit',
      maxLimit: 100000,
      aprIntro: null,
      aprIntroMonths: null,
      aprPostPromo: 8.99,
      annualFee: 0,
      scoreMinimum: 700,
      businessAgeMinimum: 24,
      revenueMinimum: 100000,
      rewardsType: null,
      rewardsRate: null,
      personalGuarantee: true,
      hardPull: true,
      notes: 'Flexible draw. Good for working capital needs.',
    },
    // First Tech
    {
      creditUnionId: firstTech.id,
      productName: 'First Tech Business Rewards Visa',
      productType: 'business_credit_card',
      maxLimit: 40000,
      aprIntro: 0,
      aprIntroMonths: 12,
      aprPostPromo: 13.99,
      annualFee: 0,
      scoreMinimum: 680,
      businessAgeMinimum: 6,
      revenueMinimum: null,
      rewardsType: 'cashback',
      rewardsRate: 1.5,
      personalGuarantee: true,
      hardPull: true,
      notes: 'Tech-focused membership. Strong digital tools.',
    },
    // BECU
    {
      creditUnionId: becu.id,
      productName: 'BECU Business Visa',
      productType: 'business_credit_card',
      maxLimit: 25000,
      aprIntro: null,
      aprIntroMonths: null,
      aprPostPromo: 15.24,
      annualFee: 0,
      scoreMinimum: 640,
      businessAgeMinimum: 6,
      revenueMinimum: null,
      rewardsType: 'cashback',
      rewardsRate: 1.5,
      personalGuarantee: true,
      hardPull: true,
      notes: 'WA state only. Low APR range 12.24-15.24%. No annual fee.',
    },
    // Lake Michigan CU
    {
      creditUnionId: lakeMichiganCU.id,
      productName: 'Lake Michigan CU Business Visa',
      productType: 'business_credit_card',
      maxLimit: 25000,
      aprIntro: null,
      aprIntroMonths: null,
      aprPostPromo: 15.99,
      annualFee: 0,
      scoreMinimum: 640,
      businessAgeMinimum: 6,
      revenueMinimum: null,
      rewardsType: null,
      rewardsRate: null,
      personalGuarantee: true,
      hardPull: true,
      notes: 'Open membership via $5 ALS donation. No rewards. APR range 10.99-15.99%.',
    },
  ];

  for (const product of products) {
    await prisma.creditUnionProduct.create({ data: product });
  }

  console.log(`    ✓ ${products.length} credit union products created`);
}
