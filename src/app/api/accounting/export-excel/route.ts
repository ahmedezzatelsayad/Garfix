/**
 * /api/accounting/export-excel
 * GET — Export data for accountant in structured JSON ready for Excel conversion.
 *
 * Query params:
 *   companySlug — required
 *   periodFrom — YYYY-MM-DD required
 *   periodTo   — YYYY-MM-DD required
 *   type       — trial_balance | general_ledger | journal_entries | full_package (required)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { exportToAccountantExcel, type ExportType } from "@/lib/accounting/accountant-collab";
import { apiError, withErrorHandler } from "@/lib/api";
import { z } from "zod";

const QuerySchema = z.object({
  companySlug: z.string().min(1),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodFrom must be YYYY-MM-DD"),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodTo must be YYYY-MM-DD"),
  type: z.enum(["trial_balance", "general_ledger", "journal_entries", "full_package"]),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    companySlug: sp.get("companySlug"),
    periodFrom: sp.get("periodFrom"),
    periodTo: sp.get("periodTo"),
    type: sp.get("type"),
  });
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid query params", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;

  const result = await exportToAccountantExcel(
    data.companySlug,
    data.periodFrom,
    data.periodTo,
    data.type as ExportType,
  );

  return NextResponse.json(result);
});
