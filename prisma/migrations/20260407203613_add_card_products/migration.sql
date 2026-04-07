-- CreateTable
CREATE TABLE "card_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issuerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "annualFee" DECIMAL NOT NULL DEFAULT 0,
    "annualFeeWaivedY1" BOOLEAN NOT NULL DEFAULT false,
    "aprIntro" DECIMAL,
    "aprIntroMonths" INTEGER,
    "aprPostPromo" DECIMAL,
    "creditLimitMin" INTEGER NOT NULL DEFAULT 0,
    "creditLimitMax" INTEGER NOT NULL DEFAULT 0,
    "creditLimitTypical" INTEGER NOT NULL DEFAULT 0,
    "scoreMinimum" INTEGER NOT NULL DEFAULT 0,
    "revenueMinimum" DECIMAL NOT NULL DEFAULT 0,
    "businessAgeMinimum" INTEGER NOT NULL DEFAULT 0,
    "rewardsType" TEXT,
    "rewardsRate" DECIMAL,
    "rewardsDetails" TEXT,
    "welcomeBonus" TEXT,
    "welcomeBonusValue" DECIMAL,
    "personalGuarantee" BOOLEAN NOT NULL DEFAULT true,
    "approvalDifficulty" TEXT NOT NULL DEFAULT 'moderate',
    "bestFor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "card_products_issuerId_idx" ON "card_products"("issuerId");

-- CreateIndex
CREATE INDEX "card_products_cardType_idx" ON "card_products"("cardType");

-- CreateIndex
CREATE INDEX "card_products_isActive_idx" ON "card_products"("isActive");
