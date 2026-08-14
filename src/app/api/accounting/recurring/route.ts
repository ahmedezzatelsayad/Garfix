/**
 * /api/accounting/recurring
 * GET / POST — Recurring Journal Entries management
 *
 * Features:
 * - List all recurring entries with pagination and filtering
 * - Create new recurring entry templates
 * - Validates template lines for balanced debits/credits
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope, hasPermission } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const TemplateLineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.union([z.number(), z.string()]).default(0),
  credit: z.union([z.number(), z.string()]).default(0),
  description: z.string().optional(),
});

const CreateRecurringSchema = z.object({
  companySlug: z.string().min(1),
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
  intervalValue: z.number().int().min(1).default(1),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(), // null = forever
  templateLines: z.array(TemplateLineSchema).min(2, "مطلوب سطران على الأقل (مدين ودائن)"),
  autoPost: z.boolean().default(true),
  requireApproval: z.boolean().default(false),
});

// ─── Helper: Calculate next run date based on frequency ───────────────────────

function _calculateNextRunDate(
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

// ─── GET: List recurring entries ─────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20", 10)));
  const statusFilter = sp.get("status"); // active, paused, all
  const search = sp.get("search");

  const where: Record<string, unknown> = {};
  
  if (companySlug) {
    if (!assertCompanyAccess(result.user, companySlug)) {
      return NextResponse.json({ error: "ممنوع" }, { status: 403 });
    }
    where.companySlug = companySlug;
  } else if (!hasUnrestrictedScope(result.user)) {
    where.companySlug = { in: result.user.companies };
  }

  // Status filter
  if (statusFilter === "active") {
    where.isActive = true;
  } else if (statusFilter === "paused") {
    where.isActive = false;
  }

  // Search filter
  if (search) {
    where.title = { contains: search };
  }

  const skip = (page - 1) * pageSize;

  const [entries, total] = await Promise.all([
    db.recurringJournalEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.recurringJournalEntry.count({ where }),
  ]);

  return NextResponse.json({
    entries,
    pagination: {
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// ─── POST: Create new recurring entry ─────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/accounting-recurring — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:accounting-recurring", LIMITS.API_WRITE);
  if (rl) return rl;

  const body = await parseJsonBody(req);
  const parsed = CreateRecurringSchema.safeParse(body);
  
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "بيانات غير صالحة", 400);
  }
  
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate template lines are balanced
  const totalDebit = data.templateLines.reduce((s, l) => s + num(l.debit, 3), 0);
  const totalCredit = data.templateLines.reduce((s, l) => s + num(l.credit, 3), 0);
  
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    return apiError("قوالب القيود الدورية يجب أن تكون متوازنة (مدين = دائن)", 400);
  }

  // Validate all accounts exist
  const accountIds = [...new Set(data.templateLines.map((l) => l.accountId))];
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds }, companySlug: data.companySlug, isActive: true },
  });

  if (accounts.length !== accountIds.length) {
    const foundIds = new Set(accounts.map((a) => a.id));
    const missingIds = accountIds.filter((id) => !foundIds.has(id));
    return apiError(`حسابات غير موجودة أو غير نشطة: ${missingIds.join(", ")}`, 400);
  }

  // Calculate initial nextRunDate from startDate
  const startDate = new Date(data.startDate);
  const endDate = data.endDate ? new Date(data.endDate) : null;

  const entry = await db.recurringJournalEntry.create({
    data: {
      companyId: (await db.company.findUnique({ where: { slug: data.companySlug } }))!.id,
      companySlug: data.companySlug,
      title: data.title,
      description: data.description || null,
      frequency: data.frequency,
      intervalValue: data.intervalValue,
      startDate,
      endDate,
      nextRunDate: startDate,
      templateLines: data.templateLines as  object,
      autoPost: data.autoPost,
      requireApproval: data.requireApproval,
      isActive: true,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "recurring_journal_entry",
    entityId: entry.id,
    companySlug: data.companySlug,
    details: {
      title: data.title,
      frequency: data.frequency,
      lineCount: data.templateLines.length,
      totalDebit,
      totalCredit,
    },
  });

  return NextResponse.json({ ok: true, entry }, { status: 201 });
});
