/**
 * /api/accounting/installments
 * POST — Create installment schedule
 * GET — List installment schedules
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { scheduleInstallments } from "@/lib/accounting/ar-ap";

// ── Zod Schemas ──────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  invoiceId: z.number().int(),
  installmentCount: z.number().int().min(2, "At least 2 installments required"),
  startDate: z.string().min(1), // YYYY-MM-DD
  interval: z.enum(["monthly", "weekly"]),
});

// ── GET: List installment schedules ──────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };

  const schedules = await db.installmentSchedule.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });

  return NextResponse.json({
    schedules: schedules.map((s) => ({
      ...s,
      totalAmount: num(s.totalAmount, 3),
      installments: s.installments.map((i) => ({
        ...i,
        amount: num(i.amount, 3),
        paidAmount: num(i.paidAmount, 3),
      })),
    })),
  });
});

// ── POST: Create installment schedule ──────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  try {
    const result = await scheduleInstallments(
      data.companySlug,
      data.invoiceId,
      data.installmentCount,
      data.startDate,
      data.interval,
      user.email,
      user.uid,
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(message, 400);
  }
});
