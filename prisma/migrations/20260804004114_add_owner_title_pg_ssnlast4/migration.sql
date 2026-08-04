-- AlterTable
ALTER TABLE "business_owners" ADD COLUMN     "personalGuarantee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ssnLast4" TEXT,
ADD COLUMN     "title" TEXT;
