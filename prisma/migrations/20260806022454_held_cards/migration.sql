-- CreateTable
CREATE TABLE "held_cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "productName" TEXT,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "creditLimit" DECIMAL(65,30),
    "source" TEXT NOT NULL DEFAULT 'advisor_attested',
    "attestedBy" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "held_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "held_cards_tenantId_businessId_idx" ON "held_cards"("tenantId", "businessId");

-- AddForeignKey
ALTER TABLE "held_cards" ADD CONSTRAINT "held_cards_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
