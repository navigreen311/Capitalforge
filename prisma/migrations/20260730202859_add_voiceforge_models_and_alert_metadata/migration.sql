-- AlterTable
ALTER TABLE "regulatory_alerts" ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "voice_calls" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "advisorId" TEXT,
    "twilioCallSid" TEXT,
    "recordingSid" TEXT,
    "recordingUrl" TEXT,
    "toPhoneNumber" TEXT NOT NULL,
    "fromPhoneNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "purpose" TEXT NOT NULL,
    "campaignType" TEXT,
    "campaignId" TEXT,
    "durationSeconds" INTEGER,
    "transcriptText" TEXT,
    "documentVaultId" TEXT,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voice_calls_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "voice_calls_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "call_compliance_scans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "criticalViolationCount" INTEGER NOT NULL DEFAULT 0,
    "complianceStatus" TEXT NOT NULL,
    "violationsJson" TEXT NOT NULL,
    "disclosuresJson" TEXT NOT NULL,
    "isLiveScan" BOOLEAN NOT NULL DEFAULT false,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "call_compliance_scans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "call_compliance_scans_callId_fkey" FOREIGN KEY ("callId") REFERENCES "voice_calls" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "call_qa_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "complianceScore" INTEGER,
    "scriptAdherence" INTEGER,
    "tcpaHandling" INTEGER,
    "consentCapture" INTEGER,
    "riskClaimAvoidance" INTEGER,
    "disclosureDelivery" INTEGER,
    "grade" TEXT NOT NULL,
    "feedback" TEXT,
    "scoredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "call_qa_scores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "call_qa_scores_callId_fkey" FOREIGN KEY ("callId") REFERENCES "voice_calls" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "voice_calls_tenantId_businessId_idx" ON "voice_calls"("tenantId", "businessId");

-- CreateIndex
CREATE INDEX "voice_calls_tenantId_status_idx" ON "voice_calls"("tenantId", "status");

-- CreateIndex
CREATE INDEX "voice_calls_twilioCallSid_idx" ON "voice_calls"("twilioCallSid");

-- CreateIndex
CREATE INDEX "call_compliance_scans_tenantId_callId_idx" ON "call_compliance_scans"("tenantId", "callId");

-- CreateIndex
CREATE INDEX "call_compliance_scans_tenantId_complianceStatus_idx" ON "call_compliance_scans"("tenantId", "complianceStatus");

-- CreateIndex
CREATE INDEX "call_qa_scores_tenantId_advisorId_idx" ON "call_qa_scores"("tenantId", "advisorId");

-- CreateIndex
CREATE INDEX "call_qa_scores_tenantId_callId_idx" ON "call_qa_scores"("tenantId", "callId");
