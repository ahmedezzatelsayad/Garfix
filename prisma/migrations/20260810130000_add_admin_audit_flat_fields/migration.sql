-- P1 FIX (SaaS audit): Add flat fields to AdminAuditLog for queryability
-- targetType, targetId, changes, ipAddress, userAgent were previously nested in `details` JSON
-- Now stored as flat columns for filtering and indexing

ALTER TABLE "admin_audit_logs" ADD COLUMN "targetType" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "targetId" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "changes" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "userAgent" TEXT;

CREATE INDEX "admin_audit_logs_targetType_idx" ON "admin_audit_logs"("targetType");
