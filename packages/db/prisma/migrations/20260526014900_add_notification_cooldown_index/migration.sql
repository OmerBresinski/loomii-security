-- CreateIndex
-- Supports the per-project notification cooldown query:
-- WHERE userId IN (...) AND type = ... AND projectId = ... AND createdAt >= ...
CREATE INDEX "notifications_cooldown_idx" ON "notifications"("user_id", "type", "project_id", "created_at");
