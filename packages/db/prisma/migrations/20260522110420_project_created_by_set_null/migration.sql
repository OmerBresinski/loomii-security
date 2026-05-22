-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_created_by_id_fkey";

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
