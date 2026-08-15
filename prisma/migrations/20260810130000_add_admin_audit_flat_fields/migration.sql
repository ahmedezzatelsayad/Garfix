-- P1 FIX (SaaS audit): Add flat fields to AdminAuditLog for queryability
-- targetType, targetId, changes, ipAddress, userAgent were previously nested in `details` JSON
-- Now stored as flat columns for filtering and indexing

ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "targetId" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "changes" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

CREATE INDEX IF NOT EXISTS "admin_audit_logs_targetType_idx" ON "admin_audit_logs"("targetType");
