-- AlterTable
ALTER TABLE "vendor_tradelines" ADD COLUMN     "paymentTerms" TEXT;

-- CreateTable
CREATE TABLE "tradeline_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tradelineId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "dueOn" TIMESTAMP(3),
    "onTime" BOOLEAN,
    "method" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tradeline_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tradeline_payments_tradelineId_paidOn_idx" ON "tradeline_payments"("tradelineId", "paidOn");

-- CreateIndex
CREATE INDEX "tradeline_payments_tenantId_idx" ON "tradeline_payments"("tenantId");

-- AddForeignKey
ALTER TABLE "tradeline_payments" ADD CONSTRAINT "tradeline_payments_tradelineId_fkey" FOREIGN KEY ("tradelineId") REFERENCES "vendor_tradelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
