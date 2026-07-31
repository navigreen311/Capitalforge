-- CreateTable
CREATE TABLE "vendor_tradelines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "creditLimit" DECIMAL(65,30),
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reportsTo" JSONB,
    "openedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_tradelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tradeline_disputes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tradelineId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolutionNote" TEXT,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "tradeline_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_tradelines_businessId_status_idx" ON "vendor_tradelines"("businessId", "status");

-- CreateIndex
CREATE INDEX "vendor_tradelines_tenantId_idx" ON "vendor_tradelines"("tenantId");

-- CreateIndex
CREATE INDEX "tradeline_disputes_tradelineId_status_idx" ON "tradeline_disputes"("tradelineId", "status");

-- CreateIndex
CREATE INDEX "tradeline_disputes_tenantId_idx" ON "tradeline_disputes"("tenantId");

-- AddForeignKey
ALTER TABLE "vendor_tradelines" ADD CONSTRAINT "vendor_tradelines_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tradeline_disputes" ADD CONSTRAINT "tradeline_disputes_tradelineId_fkey" FOREIGN KEY ("tradelineId") REFERENCES "vendor_tradelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
