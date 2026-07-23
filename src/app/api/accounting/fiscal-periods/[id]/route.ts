/**
 * /api/accounting/fiscal-periods/[id]
 * GET / PATCH / DELETE — single fiscal period
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  companySlug: z.string().min(1),
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  fiscalYear: z.number().int().optional(),
  periodType: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  status: z.enum(["open", "closed", "locked"]).optional(),
});

// ── GET: Single fiscal period ────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const period = await db.fiscalPeriod.findFirst({
    where: { id: parseInt(id), companySlug },
  });
  if (!period) return apiError("Fiscal period not found", 404);

  return NextResponse.json({ period });
});

// ── PATCH: Update fiscal period ────────────────────────────────────────────────────

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const body = await parseJsonBody(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const existing = await db.fiscalPeriod.findFirst({
    where: { id: parseInt(id), companySlug: data.companySlug },
  });
  if (!existing) return apiError("Fiscal period not found", 404);

  // Cannot modify closed/locked period (only reopen via the list endpoint)
  if (existing.status === "closed" || existing.status === "locked") {
    return apiError(`Cannot modify period in "${existing.status}" status. Use the reopen endpoint instead.`, 400);
  }

  const updateData: Record<string, unknown> = {};
  if (data.name) updateData.name = data.name;
  if (data.startDate) updateData.startDate = data.startDate;
  if (data.endDate) updateData.endDate = data.endDate;
  if (data.fiscalYear) updateData.fiscalYear = data.fiscalYear;
  if (data.periodType) updateData.periodType = data.periodType;
  if (data.status) updateData.status = data.status;

  // Validate date overlap if dates are being changed
  if (data.startDate || data.endDate) {
    const newStart = data.startDate || existing.startDate;
    const newEnd = data.endDate || existing.endDate;
    const overlapping = await db.fiscalPeriod.findFirst({
      where: {
        companySlug: data.companySlug,
        id: { not: parseInt(id) },
        OR: [{ startDate: { lte: newEnd }, endDate: { gte: newStart } }],
      },
    });
    if (overlapping) {
      return apiError(`Date range overlaps with period "${overlapping.name}"`, 400);
    }
  }

  const period = await db.fiscalPeriod.update({
    where: { id: parseInt(id) },
    data: updateData,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "fiscal_period",
    entityId: period.id,
    companySlug: data.companySlug,
    details: updateData,
  });

  return NextResponse.json({ ok: true, period });
});

// ── DELETE: Delete fiscal period ────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const existing = await db.fiscalPeriod.findFirst({
    where: { id: parseInt(id), companySlug },
  });
  if (!existing) return apiError("Fiscal period not found", 404);

  // Cannot delete closed period
  if (existing.status === "closed") {
    return apiError("Cannot delete a closed fiscal period. Reopen it first.", 400);
  }

  await db.fiscalPeriod.delete({ where: { id: parseInt(id) } });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "fiscal_period",
    entityId: parseInt(id),
    companySlug,
    details: { name: existing.name, periodType: existing.periodType },
  });

  return NextResponse.json({ ok: true });
});
