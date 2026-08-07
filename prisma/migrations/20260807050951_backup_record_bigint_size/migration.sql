-- AlterTable
ALTER TABLE "backup_records" ALTER COLUMN "status" SET DEFAULT 'running',
ALTER COLUMN "sizeBytes" SET DATA TYPE BIGINT;
