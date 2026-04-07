-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_decline_recoveries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "declineReasons" JSONB NOT NULL,
    "adverseActionRaw" TEXT,
    "reconsiderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "reconsiderationNotes" TEXT,
    "reapplyCooldownDate" DATETIME,
    "letterGenerated" BOOLEAN NOT NULL DEFAULT false,
    "recoveryStage" TEXT NOT NULL DEFAULT 'new',
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_decline_recoveries" ("adverseActionRaw", "applicationId", "businessId", "createdAt", "declineReasons", "id", "issuer", "letterGenerated", "reapplyCooldownDate", "reconsiderationNotes", "reconsiderationStatus", "tenantId", "updatedAt") SELECT "adverseActionRaw", "applicationId", "businessId", "createdAt", "declineReasons", "id", "issuer", "letterGenerated", "reapplyCooldownDate", "reconsiderationNotes", "reconsiderationStatus", "tenantId", "updatedAt" FROM "decline_recoveries";
DROP TABLE "decline_recoveries";
ALTER TABLE "new_decline_recoveries" RENAME TO "decline_recoveries";
CREATE INDEX "decline_recoveries_tenantId_businessId_idx" ON "decline_recoveries"("tenantId", "businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
