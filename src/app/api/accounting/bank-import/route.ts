/**
 * /api/accounting/bank-import
 * POST — import bank statement CSV
 */
import { NextRequest } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { importBankStatement } from "@/lib/accounting/banking";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const ImportSchema = z.object({
  companySlug: z.string().min(1),
  bankAccountId: z.number().int(),
  csvData: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  try {
    const result = await importBankStatement(
      data.companySlug,
      data.bankAccountId,
      data.csvData,
    );

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "import_bank_statement",
      entity: "bank_transaction",
      companySlug: data.companySlug,
      details: {
        bankAccountId: data.bankAccountId,
        importedCount: result.importedCount,
        skippedCount: result.skippedCount,
        totalDeposits: result.summary.totalDeposits,
        totalWithdrawals: result.summary.totalWithdrawals,
        totalFees: result.summary.totalFees,
      },
    });

    return apiOk({
      result,
      message: `Successfully imported ${result.importedCount} transactions, skipped ${result.skippedCount}`,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return apiError(message, 400);
  }
});
