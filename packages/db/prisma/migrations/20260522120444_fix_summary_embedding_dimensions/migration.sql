-- Fix summary_embedding column dimensions from 1536 to 1024
-- to match Amazon Titan Embed Text v2 output dimensions
ALTER TABLE "projects" ALTER COLUMN "summary_embedding" TYPE vector(1024);
