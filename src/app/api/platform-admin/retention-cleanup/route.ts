/**
 * POST /api/platform-admin/retention-cleanup
 * Founder-triggered: permanently deletes financial records soft-deleted > retention period (default 5 years).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const RequestSchema = z.object({
  confirmYears: z.number().int().min(1).max(30).optional(),
  dryRun: z.boolean().optional().default(false),
});

const DEFAULT_RETENTION_YEARS = 5;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const founderResult = await requireFounder(req);
  if (founderResult instanceof NextResponse) return founderResult;
  const user = founderResult.user;

  const body = await parseJsonBody(req);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const { confirmYears, dryRun } = parsed.data;

  const retentionYears = confirmYears ?? DEFAULT_RETENTION_YEARS;
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

  logger.info("[retention-cleanup] starting", { founder: user.email, retentionYears, cutoffDate, dryRun });

  const whereClause = { deletedAt: { lt: cutoffDate, not: null } };

  const eligible = {
    invoices: await db.invoice.count({ where: whereClause }),
    journalEntries: await db.journalEntry.count({ where: whereClause }),
    paymentTransactions: await db.paymentTransaction.count({ where: whereClause }),
    eInvoices: await db.eInvoice.count({ where: whereClause }),
    purchaseInvoices: await db.purchaseInvoice.count({ where: whereClause }),
  };

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, retentionPeriodYears: retentionYears, cutoffDate: cutoffDate.toISOString(), eligible, deleted: { invoices: 0, journalEntries: 0, paymentTransactions: 0, eInvoices: 0, purchaseInvoices: 0 } });
  }

  const deleted = { invoices: 0, journalEntries: 0, paymentTransactions: 0, eInvoices: 0, purchaseInvoices: 0 };
  await db.$transaction(async (tx) => {
    await tx.journalEntryLine.deleteMany({ where: { entry: { deletedAt: { lt: cutoffDate, not: null } } } });
    deleted.journalEntries = (await tx.journalEntry.deleteMany({ where: whereClause })).count;
    deleted.eInvoices = (await tx.eInvoice.deleteMany({ where: whereClause })).count;
    deleted.invoices = (await tx.invoice.deleteMany({ where: whereClause })).count;
    deleted.purchaseInvoices = (await tx.purchaseInvoice.deleteMany({ where: whereClause })).count;
    deleted.paymentTransactions = (await tx.paymentTransaction.deleteMany({ where: whereClause })).count;
  });

  await logAudit({ userEmail: user.email, userUid: user.uid, action: "retention_cleanup", entity: "platform", details: { retentionYears, cutoffDate: cutoffDate.toISOString(), deleted, totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0) } });
  return NextResponse.json({ ok: true, dryRun: false, retentionPeriodYears: retentionYears, cutoffDate: cutoffDate.toISOString(), eligible, deleted });
});
