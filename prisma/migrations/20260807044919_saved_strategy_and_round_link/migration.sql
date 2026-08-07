-- AlterTable
ALTER TABLE "funding_rounds" ADD COLUMN     "savedStrategyId" TEXT;

-- CreateTable
CREATE TABLE "saved_strategies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "totalEstimatedCredit" DECIMAL(65,30),
    "cardCount" INTEGER NOT NULL,
    "prioritizationMode" TEXT NOT NULL,
    "hasAssumedDefaults" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_strategies_tenantId_businessId_createdAt_idx" ON "saved_strategies"("tenantId", "businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "saved_strategies" ADD CONSTRAINT "saved_strategies_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_savedStrategyId_fkey" FOREIGN KEY ("savedStrategyId") REFERENCES "saved_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
