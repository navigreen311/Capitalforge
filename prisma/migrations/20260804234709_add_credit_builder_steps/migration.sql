-- CreateTable
CREATE TABLE "credit_builder_steps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_builder_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_builder_steps_tenantId_idx" ON "credit_builder_steps"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_builder_steps_businessId_stepNumber_key" ON "credit_builder_steps"("businessId", "stepNumber");

-- AddForeignKey
ALTER TABLE "credit_builder_steps" ADD CONSTRAINT "credit_builder_steps_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
