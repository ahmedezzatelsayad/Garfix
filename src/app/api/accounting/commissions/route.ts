/**
 * /api/accounting/commissions
 * GET  — Commission calculations (?companySlug=X&from=YYYY-MM-DD&to=YYYY-MM-DD)
 * POST — Post commissions as JE
 */
import { NextRequest } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { calculateSalesCommissions, postCommissionsJE } from "@/lib/accounting/commissions";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

// ─── GET ─────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to) return apiError("from و to مطلوبان (YYYY-MM-DD)", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const result = await calculateSalesCommissions(companySlug, from, to);
  return apiOk(result);
});

// ─── POST ──────────────────────────────────────────────────────────────

const PostCommissionsSchema = z.object({
  companySlug: z.string().min(1),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = PostCommissionsSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // First calculate commissions
  const commissionResult = await calculateSalesCommissions(data.companySlug, data.periodFrom, data.periodTo);

  if (commissionResult.commissions.length === 0) {
    return apiError("No commissions to post for this period", 400);
  }

  // Then post as JE
  const jeResult = await postCommissionsJE(
    data.companySlug,
    commissionResult.commissions,
    { from: data.periodFrom, to: data.periodTo },
    user.email,
  );

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "post_commissions", entity: "journal_entry", entityId: jeResult.jeId, companySlug: data.companySlug,
    details: { periodFrom: data.periodFrom, periodTo: data.periodTo, totalCommissions: commissionResult.totalCommissions },
  });

  return apiOk({
    ok: true,
    jeId: jeResult.jeId,
    lines: jeResult.lines,
    commissions: commissionResult.commissions,
    totalCommissions: commissionResult.totalCommissions,
  });
});
