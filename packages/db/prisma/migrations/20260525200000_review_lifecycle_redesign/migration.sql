-- Review Lifecycle Redesign Migration
-- Collapses ReviewStatus (8 -> 4), FindingStatus (5 -> 2 nullable),
-- removes ReviewMode, adds DismissalReason enum and new metadata columns.

-- ============================================================
-- Step 1: Create new DismissalReason enum
-- ============================================================

CREATE TYPE "DismissalReason" AS ENUM ('FALSE_POSITIVE', 'NOT_APPLICABLE', 'DUPLICATE', 'ALREADY_MITIGATED');

-- ============================================================
-- Step 2: Add new columns BEFORE changing enums
-- ============================================================

-- Review: new publish metadata columns
ALTER TABLE "reviews" ADD COLUMN "risk_level" TEXT;
ALTER TABLE "reviews" ADD COLUMN "published_at" TIMESTAMP(3);
ALTER TABLE "reviews" ADD COLUMN "published_by" TEXT;
ALTER TABLE "reviews" ADD COLUMN "comment_text" TEXT;
ALTER TABLE "reviews" ADD COLUMN "comment_posted_to" TEXT[] DEFAULT '{}';

-- Finding: new dismissal/confirmation columns
ALTER TABLE "findings" ADD COLUMN "dismissal_reason" "DismissalReason";
ALTER TABLE "findings" ADD COLUMN "dismissed_by" TEXT;
ALTER TABLE "findings" ADD COLUMN "dismissed_at" TIMESTAMP(3);
ALTER TABLE "findings" ADD COLUMN "confirmed_at" TIMESTAMP(3);

-- ============================================================
-- Step 3: Migrate existing data BEFORE enum swap
-- ============================================================

-- Backfill publishedAt for existing PUBLISHED reviews
UPDATE "reviews" SET "published_at" = "updated_at" WHERE "status" = 'PUBLISHED';

-- Backfill confirmedAt for findings that will become CONFIRMED
UPDATE "findings" SET "confirmed_at" = "updated_at"
  WHERE "status" IN ('ACCEPTED', 'RESOLVED');

-- Backfill dismissal metadata for findings that will become DISMISSED
UPDATE "findings" SET
  "dismissal_reason" = 'FALSE_POSITIVE',
  "dismissed_at" = "updated_at"
  WHERE "status" = 'REJECTED';

-- ============================================================
-- Step 4: Replace ReviewStatus enum (create new, swap, drop old)
-- ============================================================

-- Create the new enum type
CREATE TYPE "ReviewStatus_new" AS ENUM ('GENERATING', 'READY', 'PUBLISHED', 'ERROR');

-- Map existing values to new enum and swap column
ALTER TABLE "reviews" ADD COLUMN "status_new" "ReviewStatus_new";

UPDATE "reviews" SET "status_new" = CASE
  WHEN "status" = 'PENDING' THEN 'GENERATING'::"ReviewStatus_new"
  WHEN "status" = 'GENERATING' THEN 'GENERATING'::"ReviewStatus_new"
  WHEN "status" = 'DRAFT' THEN 'READY'::"ReviewStatus_new"
  WHEN "status" = 'IN_REVIEW' THEN 'READY'::"ReviewStatus_new"
  WHEN "status" = 'APPROVED' THEN 'PUBLISHED'::"ReviewStatus_new"
  WHEN "status" = 'REJECTED' THEN 'PUBLISHED'::"ReviewStatus_new"
  WHEN "status" = 'PUBLISHED' THEN 'PUBLISHED'::"ReviewStatus_new"
  WHEN "status" = 'ERROR' THEN 'ERROR'::"ReviewStatus_new"
END;

-- Drop old column and rename new
ALTER TABLE "reviews" DROP COLUMN "status";
ALTER TABLE "reviews" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "reviews" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "status" SET DEFAULT 'GENERATING'::"ReviewStatus_new";

-- Drop old type and rename new
DROP TYPE "ReviewStatus";
ALTER TYPE "ReviewStatus_new" RENAME TO "ReviewStatus";

-- ============================================================
-- Step 5: Replace FindingStatus enum (create new, swap, drop old)
-- ============================================================

-- Create the new enum type
CREATE TYPE "FindingStatus_new" AS ENUM ('DISMISSED', 'CONFIRMED');

-- Map existing values to new enum (nullable)
ALTER TABLE "findings" ADD COLUMN "status_new" "FindingStatus_new";

UPDATE "findings" SET "status_new" = CASE
  WHEN "status" = 'OPEN' THEN NULL
  WHEN "status" = 'DEFERRED' THEN NULL
  WHEN "status" = 'ACCEPTED' THEN 'CONFIRMED'::"FindingStatus_new"
  WHEN "status" = 'RESOLVED' THEN 'CONFIRMED'::"FindingStatus_new"
  WHEN "status" = 'REJECTED' THEN 'DISMISSED'::"FindingStatus_new"
END;

-- Drop old column and rename new
ALTER TABLE "findings" DROP COLUMN "status";
ALTER TABLE "findings" RENAME COLUMN "status_new" TO "status";
-- Note: NOT adding NOT NULL constraint - NULL means untriaged

-- Drop old type and rename new
DROP TYPE "FindingStatus";
ALTER TYPE "FindingStatus_new" RENAME TO "FindingStatus";

-- ============================================================
-- Step 6: Remove ReviewMode enum and column
-- ============================================================

ALTER TABLE "reviews" DROP COLUMN "mode";
DROP TYPE "ReviewMode";

-- ============================================================
-- Step 7: Remove old Finding columns
-- ============================================================

ALTER TABLE "findings" DROP COLUMN "resolved_by";
ALTER TABLE "findings" DROP COLUMN "resolved_at";

-- ============================================================
-- Step 8: Recreate indexes that were on dropped columns
-- ============================================================

CREATE INDEX "reviews_status_idx" ON "reviews"("status");
CREATE INDEX "findings_status_idx" ON "findings"("status");
