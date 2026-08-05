/**
 * /api/hr/commissions
 * GET / POST — commission records
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  employeeId: z.string().min(1),
  period: z.string().min(1),
  date: z.string().min(1).optional(),
  type: z.enum(["sales", "referral", "target", "other"]).default("sales"),
  description: z.string().optional(),
  amount: z.union([z.number(), z.string()]).default(0),
  isPaid: z.boolean().default(false),
  status: z.string().default("draft"),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  // companySlug filter (added P3)
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };
  const records = await db.hRCommission.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json({ commissions: records.map((r) => ({ ...r, amount: num(r.amount, 3) })) });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "employee_management", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const c = await db.hRCommission.create({
    data: {
      employeeId: data.employeeId,
      companySlug: data.companySlug,
      amount: num(data.amount, 3).toFixed(3),
      period: data.period,
      date: data.date ? new Date(data.date) : new Date(),
      type: data.type,
      isPaid: data.isPaid,
      status: data.isPaid ? "paid" : data.status,
      // `description` is not a column on HRCommission
    },
  });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "commission", entityId: c.id, companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, commission: c });
});
