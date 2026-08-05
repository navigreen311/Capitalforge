-- CreateTable
CREATE TABLE "graduation_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromTrack" TEXT,
    "toTrack" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graduation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "graduation_events_tenantId_observedAt_idx" ON "graduation_events"("tenantId", "observedAt");

-- CreateIndex
CREATE INDEX "graduation_events_businessId_observedAt_idx" ON "graduation_events"("businessId", "observedAt");

-- AddForeignKey
ALTER TABLE "graduation_events" ADD CONSTRAINT "graduation_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
