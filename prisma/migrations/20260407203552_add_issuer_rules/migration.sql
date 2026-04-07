-- CreateTable
CREATE TABLE "issuers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "logoUrl" TEXT,
    "phoneRecon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "issuer_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issuerId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value" REAL,
    "periodDays" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'hard',
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "lastVerified" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "issuer_rules_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "issuers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "credit_unions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "charterNumber" TEXT,
    "membershipCriteria" TEXT,
    "openMembership" BOOLEAN NOT NULL DEFAULT false,
    "joinFee" REAL,
    "assetMillions" REAL,
    "businessCardsOffered" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "credit_union_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creditUnionId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "maxLimit" REAL,
    "aprIntro" REAL,
    "aprIntroMonths" INTEGER,
    "aprPostPromo" REAL,
    "annualFee" REAL,
    "scoreMinimum" INTEGER,
    "businessAgeMinimum" INTEGER,
    "revenueMinimum" REAL,
    "rewardsType" TEXT,
    "rewardsRate" REAL,
    "personalGuarantee" BOOLEAN NOT NULL DEFAULT true,
    "hardPull" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "credit_union_products_creditUnionId_fkey" FOREIGN KEY ("creditUnionId") REFERENCES "credit_unions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "issuers_name_key" ON "issuers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "issuers_slug_key" ON "issuers"("slug");

-- CreateIndex
CREATE INDEX "issuer_rules_issuerId_ruleType_idx" ON "issuer_rules"("issuerId", "ruleType");

-- CreateIndex
CREATE INDEX "issuer_rules_isActive_idx" ON "issuer_rules"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "credit_unions_slug_key" ON "credit_unions"("slug");

-- CreateIndex
CREATE INDEX "credit_union_products_creditUnionId_productType_idx" ON "credit_union_products"("creditUnionId", "productType");
