/**
 * /api/accounting/recurring/process-due
 * POST — Process all due recurring entries (cron job / scheduled task)
 *
 * This endpoint is designed to be called by a cron job or scheduler.
 * It finds all active recurring entries whose nextRunDate has passed
 * and processes them (creates journal entries, updates schedules).
 *
 * Security: Requires internal API key or admin authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, hasPermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler } from "@/lib/api";

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

// ─── POST: Process all due entries ───────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Authentication - require finance_access permission
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  // This endpoint requires elevated permissions (admin or system)
  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ 
      error: "ليس لديك صلاحية لمعالجة القيود الدورية" 
    }, { status: 403 });
  }

  const now = new Date();

  // Find all due recurring entries
  const dueEntries = await db.recurringJournalEntry.findMany({
    where: {
      isActive: true,
      nextRunDate: { lte: now },
      OR: [
        { endDate: null },
        { endDate: { gte: now } },
      ],
    },
    orderBy: { nextRunDate: "asc" },
  });

  if (dueEntries.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "لا توجد قيود دورية مستحقة للمعالجة",
      processed: 0,
      skipped: 0,
      errors: [],
    });
  }

  const processed: Array<{ id: string; title: string; status: string }> = [];
  const errors: Array<{ id: string; title: string; error: string }> = [];
  let skipped = 0;

  for (const recurring of dueEntries) {
    try {
      // Parse template lines
      const templateLines = recurring.templateLines as unknown as Array<{
        accountId: string;
        debit: number | string;
        credit: number | string;
        description?: string;
      }>;

      if (!templateLines || templateLines.length < 2) {
        errors.push({ 
          id: recurring.id, 
          title: recurring.title, 
          error: "قالب القيد غير صالح" 
        });
        skipped++;
        continue;
      }

      // Generate journal entry number
      const entryDate = new Date();
      const jeNumber = `RJE-${entryDate.getFullYear()}${String(entryDate.getMonth() + 1).padStart(2, "0")}${String(entryDate.getDate()).padStart(2, "0")}-${String(recurring.totalPosted + 1).padStart(4, "0")}`;

      // Create journal entry in transaction
      await db.$transaction(async (tx) => {
        await tx.journalEntry.create({
          data: {
            companySlug: recurring.companySlug,
            companyId: recurring.companyId,
            number: jeNumber,
            date: entryDate,
            description: `[دوري] ${recurring.title}`,
            reference: `RECURRING-${recurring.id}`,
            status: recurring.autoPost ? "posted" : "draft",
            entryType: "general",
            createdBy: "system-cron",
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
            
            const isDebitNormal = acc.type === "asset" || acc.type === "expense";
            const delta = isDebitNormal
              ? num(line.debit, 3) - num(line.credit, 3)
              : num(line.credit, 3) - num(line.debit, 3);
            
            deltas.set(line.accountId, (deltas.get(line.accountId) || 0) + delta);
          }

          for (const [accountId, delta] of deltas) {
            const acc = accountMap.get(accountId)!;
            const currentBalance = num(acc.balance, 3);
            await tx.account.update({
              where: { id: accountId },
              data: { balance: (currentBalance + delta).toFixed(3) },
            });
          }
        }
      });

      // Update recurring entry schedule
      const nextRunDate = calculateNextRunDate(
        recurring.frequency,
        recurring.intervalValue,
        entryDate,
      );

      let isActive = true;
      if (recurring.endDate && nextRunDate > recurring.endDate) {
        isActive = false;
      }

      await db.recurringJournalEntry.update({
        where: { id: recurring.id },
        data: {
          lastRunDate: entryDate,
          nextRunDate: isActive ? nextRunDate : null,
          totalPosted: { increment: 1 },
          isActive,
        },
      });

      processed.push({
        id: recurring.id,
        title: recurring.title,
        status: recurring.autoPost ? "posted" : "draft",
      });

      // Log audit trail
      await logAudit({
        userEmail: "system-cron",
        userUid: "system",
        action: "auto_run",
        entity: "recurring_journal_entry",
        entityId: recurring.id,
        companySlug: recurring.companySlug,
        details: {
          title: recurring.title,
          journalEntryNumber: jeNumber,
          triggeredBy: "cron",
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ 
        id: recurring.id, 
        title: recurring.title, 
        error: errorMsg 
      });
      skipped++;
    }
  }

  return NextResponse.json({
    ok: true,
    message: `تمت معالجة ${processed.length} قيد دوري`,
    summary: {
      dueCount: dueEntries.length,
      processed: processed.length,
      skipped,
      errors: errors.length,
    },
    processed,
    errors,
  });
});
