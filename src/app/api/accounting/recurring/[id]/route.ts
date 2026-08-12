/**
 * /api/accounting/recurring/[id]
 * GET / PUT / DELETE — Single recurring entry operations
 *
 * - Get single recurring entry details
 * - Update recurring entry (schedule, template, settings)
 * - Soft delete/deactivate recurring entry
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, hasPermission } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ─── Validation Schema ───────────────────────────────────────────────────────

const TemplateLineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.union([z.number(), z.string()]).default(0),
  credit: z.union([z.number(), z.string()]).default(0),
  description: z.string().optional(),
});

const UpdateRecurringSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).optional(),
  intervalValue: z.number().int().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  templateLines: z.array(TemplateLineSchema).min(2).optional(),
  autoPost: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─── GET: Single recurring entry ─────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const entry = await db.recurringJournalEntry.findUnique({
    where: { id },
  });

  if (!entry) {
    return apiError("القيد الدوري غير موجود", 404);
  }

  // Always verify the user has access to the entry's company, even when
  // companySlug is not provided in the query — prevents cross-tenant IDOR.
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  const effectiveSlug = companySlug || entry.companySlug;
  if (!result.user.companies || !result.user.companies.includes(effectiveSlug)) {
    return apiError("ممنوع", 403);
  }
  if (companySlug && entry.companySlug !== companySlug) {
    return apiError("ممنوع", 403);
  }

  return NextResponse.json({ entry });
});

// ─── PUT: Update recurring entry ─────────────────────────────────────────────

export const PUT = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  // P5-H2: Rate limit PUT /api/accounting-recurring-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "put:accounting-recurring-id", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await ctx.params;
  const body = await parseJsonBody(req);
  const parsed = UpdateRecurringSchema.safeParse(body);
  
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "بيانات غير صالحة", 400);
  }
  
  const data = parsed.data;

  // Fetch existing entry for permission check
  const existing = await db.recurringJournalEntry.findUnique({ where: { id } });
  if (!existing) {
    return apiError("القيد الدوري غير موجود", 404);
  }

  const access = await requirePermissionForCompany(req, "finance_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Build update data
  const updateData: Record<string, unknown> = {};
  
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.frequency !== undefined) updateData.frequency = data.frequency;
  if (data.intervalValue !== undefined) updateData.intervalValue = data.intervalValue;
  if (data.autoPost !== undefined) updateData.autoPost = data.autoPost;
  if (data.requireApproval !== undefined) updateData.requireApproval = data.requireApproval;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;

  // Validate and update template lines if provided
  if (data.templateLines) {
    const totalDebit = data.templateLines.reduce((s, l) => s + num(l.debit, 3), 0);
    const totalCredit = data.templateLines.reduce((s, l) => s + num(l.credit, 3), 0);
    
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      return apiError("قوالب القيود الدورية يجب أن تكون متوازنة (مدين = دائن)", 400);
    }

    // Validate accounts exist
    const accountIds = [...new Set(data.templateLines.map((l) => l.accountId))];
    const accounts = await db.account.findMany({
      where: { id: { in: accountIds }, companySlug: existing.companySlug, isActive: true },
    });

    if (accounts.length !== accountIds.length) {
      return apiError("بعض الحسابات غير موجودة أو غير نشطة", 400);
    }

    updateData.templateLines = data.templateLines as unknown as object;
  }

  // Recalculate nextRunDate if schedule changed
  if (data.frequency || data.intervalValue || data.startDate) {
    const frequency = data.frequency || existing.frequency;
    const intervalValue = data.intervalValue || existing.intervalValue;
    const fromDate = data.startDate ? new Date(data.startDate) : existing.startDate;
    
    updateData.nextRunDate = calculateNextRunDate(frequency, intervalValue, fromDate);
  }

  const entry = await db.recurringJournalEntry.update({
    where: { id },
    data: updateData,
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "recurring_journal_entry",
    entityId: id,
    companySlug: existing.companySlug,
    details: { updatedFields: Object.keys(data) },
  });

  return NextResponse.json({ ok: true, entry });
});

// ─── DELETE: Deactivate recurring entry ──────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  // P5-H2: Rate limit DELETE /api/accounting-recurring-id — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "delete:accounting-recurring-id", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await ctx.params;
  
  const existing = await db.recurringJournalEntry.findUnique({ where: { id } });
  if (!existing) {
    return apiError("القيد الدوري غير موجود", 404);
  }

  const access = await requirePermissionForCompany(req, "finance_access", existing.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Soft delete by deactivating
  const entry = await db.recurringJournalEntry.update({
    where: { id },
    data: { isActive: false },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "recurring_journal_entry",
    entityId: id,
    companySlug: existing.companySlug,
    details: { title: existing.title },
  });

  return NextResponse.json({ 
    ok: true, 
    message: "تم إلغاء القيد الدوري بنجاح",
    entry 
  });
});

// ─── Helper: Calculate next run date ─────────────────────────────────────────

function calculateNextRunDate(
  frequency: string,
  intervalValue: number,
  fromDate: Date,
): Date {
  const next = new Date(fromDate);
  
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + intervalValue);
      break;
    case "weekly":
      next.setDate(next.getDate() + (7 * intervalValue));
      break;
    case "monthly":
      next.setMonth(next.getMonth() + intervalValue);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + (3 * intervalValue));
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + intervalValue);
      break;
    default:
      next.setMonth(next.getMonth() + intervalValue);
  }
  
  return next;
}
