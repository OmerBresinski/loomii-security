-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "onboarding_step" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN "onboarding_completed" BOOLEAN NOT NULL DEFAULT false;
