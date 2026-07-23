/**
 * /api/accounting/accounting-audit
 * GET — Accounting audit trail.
 *
 * Query params:
 *   companySlug — required
 *   entity      — optional filter (journal_entry, account, voucher, etc.)
 *   entityId    — optional filter
 *   fromDate    — optional YYYY-MM-DD
 *   toDate      — optional YYYY-MM-DD
 */
import { NextRequest } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { getAccountingAuditTrail } from "@/lib/accounting/accountant-collab";
import { apiError, apiOk, withErrorHandler } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const filters = {
    entity: sp.get("entity") || undefined,
    entityId: sp.get("entityId") ? parseInt(sp.get("entityId")!) : undefined,
    fromDate: sp.get("fromDate") || undefined,
    toDate: sp.get("toDate") || undefined,
  };

  const trail = await getAccountingAuditTrail(companySlug, filters);
  return apiOk({ trail });
});
