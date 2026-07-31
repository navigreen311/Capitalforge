-- CreateTable
CREATE TABLE "do_not_call_list" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "businessId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'opt_out',
    "reason" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "do_not_call_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT,
    "providerSid" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "toPhoneNumber" TEXT NOT NULL,
    "fromPhoneNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "blockedReason" TEXT,
    "errorCode" TEXT,
    "campaignId" TEXT,
    "purpose" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "do_not_call_list_phoneNumber_idx" ON "do_not_call_list"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "do_not_call_list_tenantId_phoneNumber_key" ON "do_not_call_list"("tenantId", "phoneNumber");

-- CreateIndex
CREATE INDEX "sms_messages_tenantId_campaignId_idx" ON "sms_messages"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "sms_messages_businessId_sentAt_idx" ON "sms_messages"("businessId", "sentAt");

-- CreateIndex
CREATE INDEX "sms_messages_providerSid_idx" ON "sms_messages"("providerSid");

-- AddForeignKey
ALTER TABLE "do_not_call_list" ADD CONSTRAINT "do_not_call_list_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
