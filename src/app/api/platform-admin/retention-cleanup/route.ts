/**
 * POST /api/platform-admin/retention-cleanup
 * Founder-triggered: permanently deletes financial records soft-deleted > retention period.
 *
 * Kuwait Decree 10/2026: minimum 5-year retention (cannot be reduced).
 * Other countries: configurable via company.recordRetentionYears.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { getRetentionPeriodForCompany, KUWAIT_RETENTION_YEARS } from "@/lib/e-invoicing/retention";
import { isKuwait } from "@/lib/gulfConfig";

const RequestSchema = z.object({
  confirmYears: z.number().int().min(1).max(30).optional(),
  dryRun: z.boolean().optional().default(false),
});

const DEFAULT_RETENTION_YEARS = 5;

/**
 * Per-company retention-aware cleanup.
 * Kuwait companies have a mandatory 5-year retention per Decree 10/2026.
 * Other countries use company.recordRetentionYears (default 5).
 *
 * This function processes companies individually, using each company's
 * retention period, to ensure Kuwait records are never deleted within
 * the 5-year window.
 */
async function cleanupWithPerCompanyRetention(
  retentionYearsOverride: number | null,
  dryRun: boolean,
): Promise<Record<string, { retentionYears: number; country: string; decreeRef?: string; deletedCount: Record<string, number> }>> {
  const companies = await db.company.findMany({
    where: { deletedAt: null },
    select: { slug: true, country: true },
  });

  const results: Record<string, { retentionYears: number; country: string; decreeRef?: string; deletedCount: Record<string, number> }> = {};

  for (const company of companies) {
    let retentionYears = retentionYearsOverride ?? getRetentionPeriodForCompany(company);

    // Kuwait companies: enforce minimum 5-year retention per Decree 10/2026
    if (isKuwait(company.country) && retentionYears < KUWAIT_RETENTION_YEARS) {
      logger.warn("[retention-cleanup] Kuwait company retention override", {
        companySlug: company.slug,
        requestedYears: retentionYears,
        enforcedYears: KUWAIT_RETENTION_YEARS,
        decreeRef: "Decree 10/2026",
      });
      retentionYears = KUWAIT_RETENTION_YEARS;
    }

    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

    const whereClause = {
      companySlug: company.slug,
      deletedAt: { lt: cutoffDate, not: null },
    };

    if (dryRun) {
      const eligible = {
        invoices: await db.invoice.count({ where: whereClause }),
        journalEntries: await db.journalEntry.count({ where: whereClause }),
        paymentTransactions: await db.paymentTransaction.count({ where: whereClause }),
        eInvoices: await db.eInvoice.count({ where: whereClause }),
        purchaseInvoices: await db.purchaseInvoice.count({ where: whereClause }),
      };
      results[company.slug] = {
        retentionYears,
        country: company.country || "unknown",
        decreeRef: isKuwait(company.country) ? "Decree 10/2026" : undefined,
        deletedCount: eligible,
      };
      continue;
    }

    // Actual deletion per company
    const deletedCount: Record<string, number> = {
      invoices: 0,
      journalEntries: 0,
      paymentTransactions: 0,
      eInvoices: 0,
      purchaseInvoices: 0,
    };

    await db.$transaction(async (tx) => {
      // Delete journal entry lines first (foreign key dependency)
      await tx.journalEntryLine.deleteMany({
        where: { entry: { companySlug: company.slug, deletedAt: { lt: cutoffDate, not: null } } },
      });
      deletedCount.journalEntries = (await tx.journalEntry.deleteMany({ where: whereClause })).count;
      deletedCount.eInvoices = (await tx.eInvoice.deleteMany({ where: whereClause })).count;
      deletedCount.invoices = (await tx.invoice.deleteMany({ where: whereClause })).count;
      deletedCount.purchaseInvoices = (await tx.purchaseInvoice.deleteMany({ where: whereClause })).count;
      deletedCount.paymentTransactions = (await tx.paymentTransaction.deleteMany({ where: whereClause })).count;
    });

    results[company.slug] = {
      retentionYears,
      country: company.country || "unknown",
      decreeRef: isKuwait(company.country) ? "Decree 10/2026" : undefined,
      deletedCount,
    };
  }

  return results;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const founderResult = await requireFounder(req);
  if (founderResult instanceof NextResponse) return founderResult;
  const user = founderResult.user;

  const body = await parseJsonBody(req);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const { confirmYears, dryRun } = parsed.data;

  const retentionYears = confirmYears ?? DEFAULT_RETENTION_YEARS;

  logger.info("[retention-cleanup] starting", { founder: user.email, retentionYears, dryRun, perCompanyRetention: true });

  // ── Global count for backward compatibility ──────────────────────────
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);
  const globalWhereClause = { deletedAt: { lt: cutoffDate, not: null } };

  const eligible = {
    invoices: await db.invoice.count({ where: globalWhereClause }),
    journalEntries: await db.journalEntry.count({ where: globalWhereClause }),
    paymentTransactions: await db.paymentTransaction.count({ where: globalWhereClause }),
    eInvoices: await db.eInvoice.count({ where: globalWhereClause }),
    purchaseInvoices: await db.purchaseInvoice.count({ where: globalWhereClause }),
  };

  // ── Per-company retention-aware cleanup ─────────────────────────────────
  const perCompanyResult = await cleanupWithPerCompanyRetention(confirmYears ?? null, dryRun);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      retentionPeriodYears: retentionYears,
      cutoffDate: cutoffDate.toISOString(),
      eligible,
      deleted: { invoices: 0, journalEntries: 0, paymentTransactions: 0, eInvoices: 0, purchaseInvoices: 0 },
      perCompanyRetention: perCompanyResult,
      decreeRef: "Decree 10/2026 for Kuwait companies",
    });
  }

  // Calculate totals from per-company results
  const deleted = { invoices: 0, journalEntries: 0, paymentTransactions: 0, eInvoices: 0, purchaseInvoices: 0 };
  for (const result of Object.values(perCompanyResult)) {
    deleted.invoices += result.deletedCount.invoices;
    deleted.journalEntries += result.deletedCount.journalEntries;
    deleted.paymentTransactions += result.deletedCount.paymentTransactions;
    deleted.eInvoices += result.deletedCount.eInvoices;
    deleted.purchaseInvoices += result.deletedCount.purchaseInvoices;
  }

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "retention_cleanup",
    entity: "platform",
    details: {
      retentionYears,
      cutoffDate: cutoffDate.toISOString(),
      deleted,
      totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
      decreeRef: "Decree 10/2026 for Kuwait companies",
      perCompanyResult,
    },
  });

  return NextResponse.json({
    ok: true,
    dryRun: false,
    retentionPeriodYears: retentionYears,
    cutoffDate: cutoffDate.toISOString(),
    eligible,
    deleted,
    perCompanyRetention: perCompanyResult,
  });
});
