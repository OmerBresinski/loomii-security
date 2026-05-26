-- AlterTable
ALTER TABLE "projects" ADD COLUMN "assigned_to_id" TEXT;

-- CreateIndex
CREATE INDEX "projects_assigned_to_id_idx" ON "projects"("assigned_to_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
