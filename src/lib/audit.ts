/**
 * audit.ts — Audit logging helper.
 */
import { db } from "@/lib/db";
import { logger } from "./logger";

export interface AuditInput {
  userEmail: string;
  userUid: string;
  action: string;
  entity: string;
  entityId?: string | number | null;
  companySlug?: string | null;
  details?: Record<string, unknown> | null;
}

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userEmail: input.userEmail,
        userUid: input.userUid,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId !== null && input.entityId !== undefined ? String(input.entityId) : null,
        companySlug: input.companySlug ?? null,
        details: input.details ? JSON.stringify(input.details) : null,
      },
    });
  } catch (err) {
    // Non-critical — log but never throw
    logger.error("[audit] failed to write audit log", { err: err instanceof Error ? err.message : String(err), action: input.action, entity: input.entity });
  }
}

export async function logAdminAction(input: {
  adminEmail: string;
  action: string;
  targetType?: string;
  targetId?: string;
  changes?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await db.adminAuditLog.create({
      data: {
        adminEmail: input.adminEmail,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        changes: input.changes ? JSON.stringify(input.changes) : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error("[admin-audit] failed to write admin audit log", { err: err instanceof Error ? err.message : String(err), action: input.action });
  }
}
