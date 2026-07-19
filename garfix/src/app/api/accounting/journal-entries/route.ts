/**
 * /api/accounting/journal-entries
 * GET / POST — journal entries with their lines
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const LineSchema = z.object({
  accountId: z.number().int(),
  debit: z.union([z.number(), z.string()]).default(0),
  credit: z.union([z.number(), z.string()]).default(0),
  description: z.string().optional(),
});

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  date: z.string().min(1),
  description: z.string().optional(),
  reference: z.string().optional(),
  status: z.enum(["draft", "posted", "reversed"]).default("draft"),
  lines: z.array(LineSchema).min(1, "At least one line required"),
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
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };
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

  // Enforce permission + company access
  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate balanced entry
  const totalDebit = data.lines.reduce((s, l) => s + num(l.debit, 3), 0);
  const totalCredit = data.lines.reduce((s, l) => s + num(l.credit, 3), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    return apiError("Journal entry not balanced (debit ≠ credit)", 400);
  }

  const entry = await db.journalEntry.create({
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

  // Update account balances if posted
  if (data.status === "posted") {
    for (const line of data.lines) {
      // SEC FIX: filter by companySlug to prevent IDOR — without this,
      // a user could pass an accountId from another tenant and corrupt their balances.
      const acc = await db.account.findFirst({
        where: { id: line.accountId, companySlug: data.companySlug },
      });
      if (!acc) continue;
      const currentBalance = num(acc.balance, 3);
      const isDebitNormal = acc.type === "asset" || acc.type === "expense";
      const delta = isDebitNormal
        ? num(line.debit, 3) - num(line.credit, 3)
        : num(line.credit, 3) - num(line.debit, 3);
      await db.account.update({
        where: { id: acc.id },
        data: { balance: (currentBalance + delta).toFixed(3) },
      });
    }
  }

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "journal_entry", entityId: entry.id, companySlug: data.companySlug,
    details: { totalDebit, totalCredit, status: data.status },
  });

  return NextResponse.json({ ok: true, entry });
});
