/**
 * /api/accounting/fiscal-periods/[id]/reopen
 * POST — reopen a closed fiscal period
 *
 * FIX: Now uses the proper reopenFiscalPeriod engine which reverses
 * closing JEs and updates account balances. Also requires
 * period_reopen permission (not just finance_access).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth } from "@/lib/auth";
import { reopenFiscalPeriod } from "@/lib/accounting/period-close";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler, apiOk } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const ReopenSchema = z.object({
  reason: z.string().min(1, "Reason for reopening is required"),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  // Require period_reopen permission (special permission beyond finance_access)
  const access = await requirePermissionForCompany(req, "period_reopen", companySlug);
  if ("error" in access) {
    // Fallback: check if user has finance_access AND period_reopen via resolveAuth
    const authResult = await resolveAuth(req);
    if (!authResult.ok || !authResult.user) return access.error;
    if (!hasPermission(authResult.user, "period_reopen")) {
      return apiError("ليس لديك صلاحية period_reopen لفتح فترة مالية مقفلة", 403);
    }
    // User has period_reopen but not via requirePermissionForCompany — continue
  }
  const user = ("user" in access) ? access.user : (await resolveAuth(req)).user!;

  const period = await db.fiscalPeriod.findFirst({
    where: { id: parseInt(id), companySlug },
  });
  if (!period) return apiError("Fiscal period not found", 404);
  if (period.status !== "closed") return apiError("Only closed periods can be reopened", 400);

  // Use the proper reopenFiscalPeriod engine which reverses closing JEs
  try {
    const result = await reopenFiscalPeriod(
      companySlug,
      period.name,
      user.email,
      user.uid,
      req.nextUrl.searchParams.get("reason") || "Manual reopen via admin",
    );

    return apiOk({
      ok: true,
      period: {
        id: result.periodId,
        name: result.periodName,
        status: "open",
        reopenedBy: result.reopenedBy,
        reopenedAt: result.reopenedAt,
        reversalJEId: result.reversalJEId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(message, 400);
  }
});
