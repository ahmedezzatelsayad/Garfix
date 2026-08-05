/**
 * /api/accounting/recurring/[id]/run
 * POST — Manually trigger a recurring entry run
 *
 * Creates a journal entry from the recurring template and updates schedule.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, hasPermission } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

// ─── POST: Manual trigger ────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  // P5-H2: Rate limit POST /api/accounting-recurring-id-run — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:accounting-recurring-id-run", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await ctx.params;
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  // Fetch the recurring entry
  const recurring = await db.recurringJournalEntry.findUnique({ where: { id } });
  if (!recurring) {
    return apiError("القيد الدوري غير موجود", 404);
  }

  if (!recurring.isActive) {
    return apiError("القيد الدوري غير نشط", 400);
  }

  // Verify permission
  const access = await requirePermissionForCompany(req, "finance_access", recurring.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Parse template lines
  const templateLines = recurring.templateLines as unknown as Array<{
    accountId: string;
    debit: number | string;
    credit: number | string;
    description?: string;
  }>;

  if (!templateLines || templateLines.length < 2) {
    return apiError("قالب القيد غير صالح", 400);
  }

  // Generate journal entry number
  const company = await db.company.findUnique({
    where: { slug: recurring.companySlug },
    select: { id: true },
  });
  
  if (!company) {
    return apiError("الشركة غير موجودة", 404);
  }

  // Get current date for the entry
  const entryDate = new Date();
  const jeNumber = `RJE-${entryDate.getFullYear()}${String(entryDate.getMonth() + 1).padStart(2, "0")}${String(entryDate.getDate()).padStart(2, "0")}-${String(recurring.totalPosted + 1).padStart(4, "0")}`;

  // Create journal entry in transaction
  const journalEntry = await db.$transaction(async (tx) => {
    // Create the journal entry
    const je = await tx.journalEntry.create({
      data: {
        companySlug: recurring.companySlug,
        companyId: recurring.companyId,
        number: jeNumber,
        date: entryDate,
        description: `[دوري] ${recurring.title}`,
        reference: `RECURRING-${recurring.id}`,
        status: recurring.autoPost ? "posted" : "draft",
        entryType: "general",
        createdBy: user.email,
        lines: {
          create: templateLines.map((line) => ({
            accountId: line.accountId,
            debit: num(line.debit, 3).toFixed(3),
            credit: num(line.credit, 3).toFixed(3),
            description: line.description || `[دوري] ${recurring.title}`,
            sortOrder: 0,
          })),
        },
      },
      include: { lines: true },
    });

    // Update account balances if auto-posted
    if (recurring.autoPost) {
      const accountIds = [...new Set(templateLines.map((l) => l.accountId))];
      const accounts = await tx.account.findMany({
        where: { id: { in: accountIds } },
      });

      const accountMap = new Map(accounts.map((a) => [a.id, a]));
      const deltas = new Map<string, number>();

      for (const line of templateLines) {
        const acc = accountMap.get(line.accountId);
        if (!acc) continue;
        
        // Use type assertion for account properties
        const accAny = acc as Record<string, unknown>;
        const accType = String(accAny.type ?? '');
        const isDebitNormal = accType === "asset" || accType === "expense";
        const delta = isDebitNormal
          ? num(line.debit, 3) - num(line.credit, 3)
          : num(line.credit, 3) - num(line.debit, 3);
        
        deltas.set(line.accountId, (deltas.get(line.accountId) || 0) + delta);
      }

      for (const [accountId, delta] of deltas) {
        const acc = accountMap.get(accountId)!;
        const accAny = acc as Record<string, unknown>;
        const currentBalance = Number(accAny.balance ?? 0);
        await tx.account.update({
          where: { id: accountId },
          data: { balance: (currentBalance + delta).toFixed(3) },
        });
      }
    }

    return je;
  });

  // Update recurring entry schedule
  const nextRunDate = calculateNextRunDate(
    recurring.frequency,
    recurring.intervalValue,
    entryDate,
  );

  // Check if we've reached the end date
  let isActive = true;
  if (recurring.endDate && nextRunDate > recurring.endDate) {
    isActive = false;
  }

  await db.recurringJournalEntry.update({
    where: { id },
    data: {
      lastRunDate: entryDate,
      // Note (P2): `nextRunDate` is DateTime (non-nullable). Always
      // set to the computed value — when isActive=false, the schedule is
      // disabled and nextRunDate is informational only.
      nextRunDate,
      totalPosted: { increment: 1 },
      isActive,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "run",
    entity: "recurring_journal_entry",
    entityId: id,
    companySlug: recurring.companySlug,
    details: {
      title: recurring.title,
      journalEntryId: journalEntry.id,
      journalEntryNumber: jeNumber,
      status: recurring.autoPost ? "posted" : "draft",
      totalPosted: recurring.totalPosted + 1,
    },
  });

  return NextResponse.json({
    ok: true,
    message: recurring.autoPost 
      ? "تم إنشاء وترحيل القيد الدوري بنجاح" 
      : "تم إنشاء القيد الدوري كمسودة (بانتظار المراجعة)",
    journalEntry,
    nextRunDate: isActive ? nextRunDate : null,
    isCompleted: !isActive,
  });
});
