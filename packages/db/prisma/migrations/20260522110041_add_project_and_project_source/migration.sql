-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'GENERATING', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ERROR');

-- CreateEnum
CREATE TYPE "ReviewMode" AS ENUM ('AUTOMATED', 'MANUAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('THREAT', 'REQUIREMENT', 'MITIGATION', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED', 'RESOLVED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "Effort" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('THREAT_TO_REQUIREMENT', 'REQUIREMENT_TO_MITIGATION', 'THREAT_TO_MITIGATION', 'RELATED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('NOTION_PAGE', 'LINEAR_ISSUE');

-- CreateEnum
CREATE TYPE "LinkMethod" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "context_bundles" ADD COLUMN     "project_id" TEXT;

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "summary_embedding" vector(1536),
    "summary_updated_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_sources" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "linked_by" "LinkMethod" NOT NULL,
    "linked_by_user_id" TEXT,
    "link_reason" JSONB,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "archived_reason" TEXT,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinked_at" TIMESTAMP(3),

    CONSTRAINT "project_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT[],
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_overrides" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "context_bundle_id" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "mode" "ReviewMode" NOT NULL DEFAULT 'AUTOMATED',
    "severity" "Severity",
    "confidence" DOUBLE PRECISION,
    "summary" TEXT,
    "model_used" TEXT,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_versions" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "editor_type" TEXT NOT NULL,
    "editor_id" TEXT,
    "edit_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "type" "FindingType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "Severity" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "stride_category" "StrideCategory",
    "policy_id" TEXT,
    "policy_name" TEXT,
    "effort_estimate" "Effort",
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_relations" (
    "id" TEXT NOT NULL,
    "from_finding_id" TEXT NOT NULL,
    "to_finding_id" TEXT NOT NULL,
    "relation_type" "RelationType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_tenant_id_idx" ON "projects"("tenant_id");

-- CreateIndex
CREATE INDEX "projects_tenant_id_name_idx" ON "projects"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "project_sources_source_type_source_id_idx" ON "project_sources"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "project_sources_project_id_is_archived_idx" ON "project_sources"("project_id", "is_archived");

-- CreateIndex
CREATE UNIQUE INDEX "project_sources_project_id_source_type_source_id_key" ON "project_sources"("project_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_identifier_key" ON "policies"("identifier");

-- CreateIndex
CREATE INDEX "policies_tenant_id_idx" ON "policies"("tenant_id");

-- CreateIndex
CREATE INDEX "policies_framework_idx" ON "policies"("framework");

-- CreateIndex
CREATE INDEX "policies_is_enabled_idx" ON "policies"("is_enabled");

-- CreateIndex
CREATE INDEX "policy_overrides_tenant_id_idx" ON "policy_overrides"("tenant_id");

-- CreateIndex
CREATE INDEX "policy_overrides_policy_id_idx" ON "policy_overrides"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_overrides_tenant_id_policy_id_key" ON "policy_overrides"("tenant_id", "policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_context_bundle_id_key" ON "reviews"("context_bundle_id");

-- CreateIndex
CREATE INDEX "reviews_tenant_id_idx" ON "reviews"("tenant_id");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex
CREATE INDEX "reviews_severity_idx" ON "reviews"("severity");

-- CreateIndex
CREATE INDEX "reviews_created_at_idx" ON "reviews"("created_at");

-- CreateIndex
CREATE INDEX "review_versions_review_id_idx" ON "review_versions"("review_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_versions_review_id_version_key" ON "review_versions"("review_id", "version");

-- CreateIndex
CREATE INDEX "findings_review_id_idx" ON "findings"("review_id");

-- CreateIndex
CREATE INDEX "findings_type_idx" ON "findings"("type");

-- CreateIndex
CREATE INDEX "findings_severity_idx" ON "findings"("severity");

-- CreateIndex
CREATE INDEX "findings_status_idx" ON "findings"("status");

-- CreateIndex
CREATE INDEX "finding_relations_from_finding_id_idx" ON "finding_relations"("from_finding_id");

-- CreateIndex
CREATE INDEX "finding_relations_to_finding_id_idx" ON "finding_relations"("to_finding_id");

-- CreateIndex
CREATE UNIQUE INDEX "finding_relations_from_finding_id_to_finding_id_key" ON "finding_relations"("from_finding_id", "to_finding_id");

-- CreateIndex
CREATE INDEX "context_bundles_project_id_idx" ON "context_bundles"("project_id");

-- AddForeignKey
ALTER TABLE "context_bundles" ADD CONSTRAINT "context_bundles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_linked_by_user_id_fkey" FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_overrides" ADD CONSTRAINT "policy_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_overrides" ADD CONSTRAINT "policy_overrides_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_context_bundle_id_fkey" FOREIGN KEY ("context_bundle_id") REFERENCES "context_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_versions" ADD CONSTRAINT "review_versions_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_relations" ADD CONSTRAINT "finding_relations_from_finding_id_fkey" FOREIGN KEY ("from_finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_relations" ADD CONSTRAINT "finding_relations_to_finding_id_fkey" FOREIGN KEY ("to_finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
