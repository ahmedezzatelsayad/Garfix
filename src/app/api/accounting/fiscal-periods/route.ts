/**
 * /api/accounting/fiscal-periods
 * GET / POST — fiscal periods for a company
 * PATCH /close — close a fiscal period
 * PATCH /reopen — reopen a fiscal period (requires period_reopen permission)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { closeFiscalPeriod, reopenFiscalPeriod } from "@/lib/accounting/period-close";

// ── Zod Schemas ──────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  name: z.string().min(1),
  startDate: z.string().min(1), // YYYY-MM-DD
  endDate: z.string().min(1), // YYYY-MM-DD
  fiscalYear: z.number().int(),
  periodType: z.enum(["monthly", "quarterly", "yearly"]),
});

const CloseSchema = z.object({
  companySlug: z.string().min(1),
  periodName: z.string().min(1),
});

const ReopenSchema = z.object({
  companySlug: z.string().min(1),
  periodName: z.string().min(1),
  reason: z.string().min(1, "Reason is required for reopening a period"),
});

// ── GET: List fiscal periods ──────────────────────────────────────────────────────

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

  const periods = await db.fiscalPeriod.findMany({
    where,
    orderBy: [{ fiscalYear: "desc" }, { startDate: "asc" }],
  });

  return NextResponse.json({ periods });
});

// ── POST: Create fiscal period ──────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate date ranges don't overlap with existing periods
  const overlapping = await db.fiscalPeriod.findFirst({
    where: {
      companySlug: data.companySlug,
      OR: [
        { startDate: { lte: data.endDate }, endDate: { gte: data.startDate } },
      ],
    },
  });
  if (overlapping) {
    return apiError(
      `Fiscal period date range (${data.startDate} to ${data.endDate}) overlaps with existing period "${overlapping.name}" (${overlapping.startDate} to ${overlapping.endDate})`,
      400,
    );
  }

  // Validate endDate > startDate
  if (data.endDate <= data.startDate) {
    return apiError("End date must be after start date", 400);
  }

  const period = await db.fiscalPeriod.create({
    data: {
      companySlug: data.companySlug,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      fiscalYear: data.fiscalYear,
      periodType: data.periodType,
      status: "open",
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "fiscal_period",
    entityId: period.id,
    companySlug: data.companySlug,
    details: { name: data.name, startDate: data.startDate, endDate: data.endDate, fiscalYear: data.fiscalYear, periodType: data.periodType },
  });

  return NextResponse.json({ ok: true, period });
});

// ── PATCH /close: Close a fiscal period ──────────────────────────────────────────────

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const action = req.nextUrl.searchParams.get("action");

  if (action === "close") {
    const parsed = CloseSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
    const data = parsed.data;

    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    try {
      const result = await closeFiscalPeriod(data.companySlug, data.periodName, user.email, user.uid);
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return apiError(message, 400);
    }
  }

  if (action === "reopen") {
    const parsed = ReopenSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
    const data = parsed.data;

    // Require special period_reopen permission
    const access = await requirePermissionForCompany(req, "period_reopen", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    try {
      const result = await reopenFiscalPeriod(data.companySlug, data.periodName, user.email, user.uid, data.reason);
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return apiError(message, 400);
    }
  }

  return apiError("Invalid action. Use action=close or action=reopen", 400);
});
