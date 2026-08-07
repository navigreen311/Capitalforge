-- CreateTable
CREATE TABLE "recovery_tests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "backupId" TEXT,
    "testType" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL,
    "rtoAchievedMinutes" INTEGER,
    "notes" TEXT,
    "performedBy" TEXT NOT NULL,
    "loggedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovery_tests_tenantId_createdAt_idx" ON "recovery_tests"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "recovery_tests_outcome_idx" ON "recovery_tests"("outcome");

-- AddForeignKey
ALTER TABLE "recovery_tests" ADD CONSTRAINT "recovery_tests_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "backup_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
