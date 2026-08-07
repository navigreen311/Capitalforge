-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "contractType" TEXT NOT NULL DEFAULT 'vendor',
    "status" TEXT NOT NULL DEFAULT 'active',
    "value" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "autoRenewDate" TIMESTAMP(3),
    "autoRenews" BOOLEAN,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referredName" TEXT,
    "referredEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "convertedAt" TIMESTAMP(3),
    "convertedBusinessId" TEXT,
    "commissionAmount" DECIMAL(65,30),
    "commissionPaidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_follow_ups" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "note" TEXT,
    "loggedBy" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfPeriod" INTEGER,
    "recipients" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_tenantId_status_idx" ON "contracts"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_code_key" ON "referrals"("code");

-- CreateIndex
CREATE INDEX "referrals_tenantId_referrerUserId_idx" ON "referrals"("tenantId", "referrerUserId");

-- CreateIndex
CREATE INDEX "referral_follow_ups_tenantId_referralId_idx" ON "referral_follow_ups"("tenantId", "referralId");

-- CreateIndex
CREATE INDEX "report_schedules_tenantId_enabled_idx" ON "report_schedules"("tenantId", "enabled");

-- AddForeignKey
ALTER TABLE "referral_follow_ups" ADD CONSTRAINT "referral_follow_ups_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
