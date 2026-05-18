-- CreateEnum
CREATE TYPE "ThreatModelStatus" AS ENUM ('PENDING', 'GENERATING', 'ACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "StrideCategory" AS ENUM ('SPOOFING', 'TAMPERING', 'REPUDIATION', 'INFORMATION_DISCLOSURE', 'DENIAL_OF_SERVICE', 'ELEVATION_OF_PRIVILEGE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "threat_models" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" "ThreatModelStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "generated_at" TIMESTAMP(3),
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threat_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_components" (
    "id" TEXT NOT NULL,
    "threat_model_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_data_flows" (
    "id" TEXT NOT NULL,
    "threat_model_id" TEXT NOT NULL,
    "from_component_id" TEXT NOT NULL,
    "to_component_id" TEXT NOT NULL,
    "description" TEXT,
    "data_type" TEXT,
    "sensitivity" TEXT,
    "encryption" TEXT,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_data_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_trust_boundaries" (
    "id" TEXT NOT NULL,
    "threat_model_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "from_zone" TEXT,
    "to_zone" TEXT,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_trust_boundaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_entry_points" (
    "id" TEXT NOT NULL,
    "threat_model_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "auth_required" BOOLEAN NOT NULL DEFAULT false,
    "auth_type" TEXT,
    "rate_limited" BOOLEAN NOT NULL DEFAULT false,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_entry_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_assets" (
    "id" TEXT NOT NULL,
    "threat_model_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sensitivity" TEXT,
    "description" TEXT,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_threats" (
    "id" TEXT NOT NULL,
    "threat_model_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stride_category" "StrideCategory" NOT NULL,
    "severity" "Severity" NOT NULL,
    "likelihood" TEXT,
    "mitigation_status" TEXT NOT NULL DEFAULT 'UNMITIGATED',
    "mitigation_notes" TEXT,
    "component_id" TEXT,
    "data_flow_id" TEXT,
    "entry_point_id" TEXT,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_threats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_changes" (
    "id" TEXT NOT NULL,
    "threat_model_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "change_type" TEXT NOT NULL,
    "triggered_by" TEXT,
    "summary" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tm_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_gaps" (
    "id" TEXT NOT NULL,
    "threat_model_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "description" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tm_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "threat_models_tenant_id_key" ON "threat_models"("tenant_id");

-- CreateIndex
CREATE INDEX "threat_models_status_idx" ON "threat_models"("status");

-- CreateIndex
CREATE INDEX "tm_components_threat_model_id_idx" ON "tm_components"("threat_model_id");

-- CreateIndex
CREATE INDEX "tm_data_flows_threat_model_id_idx" ON "tm_data_flows"("threat_model_id");

-- CreateIndex
CREATE INDEX "tm_data_flows_from_component_id_idx" ON "tm_data_flows"("from_component_id");

-- CreateIndex
CREATE INDEX "tm_data_flows_to_component_id_idx" ON "tm_data_flows"("to_component_id");

-- CreateIndex
CREATE INDEX "tm_trust_boundaries_threat_model_id_idx" ON "tm_trust_boundaries"("threat_model_id");

-- CreateIndex
CREATE INDEX "tm_entry_points_threat_model_id_idx" ON "tm_entry_points"("threat_model_id");

-- CreateIndex
CREATE INDEX "tm_assets_threat_model_id_idx" ON "tm_assets"("threat_model_id");

-- CreateIndex
CREATE INDEX "tm_threats_threat_model_id_idx" ON "tm_threats"("threat_model_id");

-- CreateIndex
CREATE INDEX "tm_threats_severity_idx" ON "tm_threats"("severity");

-- CreateIndex
CREATE INDEX "tm_threats_mitigation_status_idx" ON "tm_threats"("mitigation_status");

-- CreateIndex
CREATE INDEX "tm_threats_stride_category_idx" ON "tm_threats"("stride_category");

-- CreateIndex
CREATE INDEX "tm_changes_threat_model_id_idx" ON "tm_changes"("threat_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "tm_changes_threat_model_id_version_key" ON "tm_changes"("threat_model_id", "version");

-- CreateIndex
CREATE INDEX "tm_gaps_threat_model_id_idx" ON "tm_gaps"("threat_model_id");

-- CreateIndex
CREATE INDEX "tm_gaps_severity_idx" ON "tm_gaps"("severity");

-- CreateIndex
CREATE INDEX "tm_gaps_is_resolved_idx" ON "tm_gaps"("is_resolved");

-- AddForeignKey
ALTER TABLE "threat_models" ADD CONSTRAINT "threat_models_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_components" ADD CONSTRAINT "tm_components_threat_model_id_fkey" FOREIGN KEY ("threat_model_id") REFERENCES "threat_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_data_flows" ADD CONSTRAINT "tm_data_flows_threat_model_id_fkey" FOREIGN KEY ("threat_model_id") REFERENCES "threat_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_data_flows" ADD CONSTRAINT "tm_data_flows_from_component_id_fkey" FOREIGN KEY ("from_component_id") REFERENCES "tm_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_data_flows" ADD CONSTRAINT "tm_data_flows_to_component_id_fkey" FOREIGN KEY ("to_component_id") REFERENCES "tm_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_trust_boundaries" ADD CONSTRAINT "tm_trust_boundaries_threat_model_id_fkey" FOREIGN KEY ("threat_model_id") REFERENCES "threat_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_entry_points" ADD CONSTRAINT "tm_entry_points_threat_model_id_fkey" FOREIGN KEY ("threat_model_id") REFERENCES "threat_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_assets" ADD CONSTRAINT "tm_assets_threat_model_id_fkey" FOREIGN KEY ("threat_model_id") REFERENCES "threat_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_threats" ADD CONSTRAINT "tm_threats_threat_model_id_fkey" FOREIGN KEY ("threat_model_id") REFERENCES "threat_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_threats" ADD CONSTRAINT "tm_threats_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "tm_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_threats" ADD CONSTRAINT "tm_threats_data_flow_id_fkey" FOREIGN KEY ("data_flow_id") REFERENCES "tm_data_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_threats" ADD CONSTRAINT "tm_threats_entry_point_id_fkey" FOREIGN KEY ("entry_point_id") REFERENCES "tm_entry_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_changes" ADD CONSTRAINT "tm_changes_threat_model_id_fkey" FOREIGN KEY ("threat_model_id") REFERENCES "threat_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_gaps" ADD CONSTRAINT "tm_gaps_threat_model_id_fkey" FOREIGN KEY ("threat_model_id") REFERENCES "threat_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
