-- AlterTable
ALTER TABLE "business_owners" ADD COLUMN     "email" TEXT,
ADD COLUMN     "isSignatory" BOOLEAN NOT NULL DEFAULT false;
