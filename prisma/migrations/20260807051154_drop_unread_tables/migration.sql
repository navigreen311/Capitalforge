/*
  Warnings:

  - You are about to drop the `rewards_optimizations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sandbox_profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tenant_brandings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tenant_brandings" DROP CONSTRAINT "tenant_brandings_tenantId_fkey";

-- DropTable
DROP TABLE "rewards_optimizations";

-- DropTable
DROP TABLE "sandbox_profiles";

-- DropTable
DROP TABLE "tenant_brandings";
