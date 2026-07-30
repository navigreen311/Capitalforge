-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "phoneNumber" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_repayment_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "totalBalance" DECIMAL NOT NULL,
    "monthlyPayment" DECIMAL,
    "strategy" TEXT NOT NULL DEFAULT 'avalanche',
    "status" TEXT NOT NULL DEFAULT 'active',
    "interestShockDate" DATETIME,
    "interestShockAmount" DECIMAL,
    "nextPaymentDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "repayment_plans_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_repayment_plans" ("businessId", "createdAt", "id", "interestShockAmount", "interestShockDate", "monthlyPayment", "nextPaymentDate", "status", "strategy", "tenantId", "totalBalance", "updatedAt") SELECT "businessId", "createdAt", "id", "interestShockAmount", "interestShockDate", "monthlyPayment", "nextPaymentDate", "status", "strategy", "tenantId", "totalBalance", "updatedAt" FROM "repayment_plans";
DROP TABLE "repayment_plans";
ALTER TABLE "new_repayment_plans" RENAME TO "repayment_plans";
CREATE INDEX "repayment_plans_tenantId_businessId_idx" ON "repayment_plans"("tenantId", "businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
