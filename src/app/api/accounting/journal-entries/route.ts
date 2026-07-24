/**
 * /api/accounting/journal-entries
 * GET / POST — journal entries with their lines
 *
 * P0-5: JE Validation — minimum 2 lines, accounts must exist, balanced debit/credit.
 * P0-4: Cannot post to closed/locked fiscal periods.
 * P0-2: Posted entries cannot be set via creation (use /reverse/ for reversal).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { preventPostingToClosedPeriod } from "@/lib/accounting/period-close";

const LineSchema = z.object({
  accountId: z.number().int(),
  debit: z.union([z.number(), z.string()]).default(0),
  credit: z.union([z.number(), z.string()]).default(0),
  description: z.string().optional(),
});

// P0-5: Minimum 2 lines per journal entry (a valid JE must have at least
// one debit and one credit line — single-sided entries are not valid accounting).
// Also: "reversed" status is NOT allowed on creation — reversal happens via /reverse/.
const CreateSchema = z.object({
  companySlug: z.string().min(1),
  date: z.string().min(1),
  description: z.string().optional(),
  reference: z.string().optional(),
  status: z.enum(["draft", "posted"]).default("draft"),  // P0-2: removed "reversed" — only via reverse route
  lines: z.array(LineSchema).min(2, "P0-5: Journal entry requires at least 2 lines (debit and credit)"),
});

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
  // P0-3: Filter out soft-deleted entries
  where.deletedAt = null;
  const entries = await db.journalEntry.findMany({
    where, orderBy: { date: "desc" }, take: 500,
    include: { lines: true },
  });
  return NextResponse.json({
    entries: entries.map((e) => ({
      ...e,
      lines: e.lines.map((l) => ({ ...l, debit: num(l.debit, 3), credit: num(l.credit, 3) })),
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // ── P0-5: Validate balanced entry ──
  const totalDebit = data.lines.reduce((s, l) => s + num(l.debit, 3), 0);
  const totalCredit = data.lines.reduce((s, l) => s + num(l.credit, 3), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    return apiError("P0-5: Journal entry not balanced (debit ≠ credit)", 400);
  }

  // ── P0-5: Validate no zero-amount lines ──
  const zeroLines = data.lines.filter((l) => num(l.debit, 3) === 0 && num(l.credit, 3) === 0);
  if (zeroLines.length > 0) {
    return apiError("P0-5: Journal entry lines cannot have zero debit and zero credit", 400);
  }

  // ── P0-5: Validate all accounts exist and belong to the company ──
  const accountIds = [...new Set(data.lines.map((l) => l.accountId))];
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds }, companySlug: data.companySlug, isActive: true },
  });

  if (accounts.length !== accountIds.length) {
    const foundIds = new Set(accounts.map((a) => a.id));
    const missingIds = accountIds.filter((id) => !foundIds.has(id));
    return apiError(`P0-5: Accounts not found or inactive: IDs ${missingIds.join(", ")}`, 400);
  }

  const accountMap: Map<any, any> = new Map(accounts.map((a) => [a.id, a]));

  // ── P0-4: Check fiscal period before posting ──
  if (data.status === "posted") {
    try {
      await preventPostingToClosedPeriod(data.companySlug, data.date);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg, code: "CLOSED_PERIOD" }, { status: 403 });
    }
  }

  // DB-03 FIX: Wrap entry creation + balance updates in a single transaction
  const entry = await db.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        companySlug: data.companySlug, date: data.date, description: data.description || null,
        reference: data.reference || null, status: data.status, createdBy: user.email,
        lines: {
          create: data.lines.map((l) => ({
            accountId: l.accountId, debit: num(l.debit, 3).toFixed(3),
            credit: num(l.credit, 3).toFixed(3), description: l.description || null,
          })),
        },
      },
      include: { lines: true },
    });

    // Update account balances if posted — within same transaction
    if (data.status === "posted") {
      const deltas = new Map<number, number>();
      for (const line of data.lines) {
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

    return created;
  });

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "journal_entry", entityId: entry.id, companySlug: data.companySlug,
    details: { totalDebit, totalCredit, status: data.status, lineCount: data.lines.length },
  });

  return NextResponse.json({ ok: true, entry });
});
