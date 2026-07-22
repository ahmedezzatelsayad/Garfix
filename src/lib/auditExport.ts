/**
 * auditExport.ts — Export audit logs for a tenant (CSV/PDF-ready).
 * All exports are scoped to a single company to prevent cross-tenant leaks.
 */

import { db } from "@/lib/db";

export interface ExportOptions {
  companySlug: string;
  startDate?: Date;
  endDate?: Date;
  action?: string;
  format?: "json" | "csv";
  limit?: number;
}

/** Export audit logs scoped to a single tenant. */
export async function exportAuditLogs(options: ExportOptions): Promise<{ data: unknown[]; format: string }> {
  const where: Record<string, unknown> = { companySlug: options.companySlug };

  if (options.startDate) where.createdAt = { ...((where.createdAt as Record<string, unknown>) || {}), gte: options.startDate };
  if (options.endDate) where.createdAt = { ...((where.createdAt as Record<string, unknown>) || {}), lte: options.endDate };
  if (options.action) where.action = options.action;

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options.limit || 10000,
  });

  const format = options.format || "json";

  if (format === "csv") {
    const headers = ["Timestamp", "User", "Action", "Entity", "Entity ID", "Details"];
    const rows = logs.map((log) => [
      log.createdAt.toISOString(),
      log.userEmail,
      log.action,
      log.entity,
      log.entityId || "",
      log.details || "",
    ]);
    return { data: [headers, ...rows], format: "csv" };
  }

  return {
    data: logs.map((log) => ({
      id: log.id,
      timestamp: log.createdAt.toISOString(),
      user: log.userEmail,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      details: log.details ? JSON.parse(log.details) : null,
    })),
    format: "json",
  };
}