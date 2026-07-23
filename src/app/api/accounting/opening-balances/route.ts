/**
 * /api/accounting/opening-balances
 * GET       — List opening balance entries (?companySlug=X)
 * POST      — Create opening balance entries (asOfDate, entries: [{accountId, amount}], importedFrom)
 * POST /post — Post all opening balance entries as a single JE
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { logAccountingChange } from "@/lib/accounting/accountant-collab";
import { num } from "@/lib/money";
import { apiError, apiOk, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

// ─── GET ─────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const asOfDate = sp.get("asOfDate");
  const status = sp.get("status");

  const where: Record<string, unknown> = { companySlug };
  if (asOfDate) where.asOfDate = asOfDate;
  if (status) where.status = status;

  const entries = await db.openingBalanceEntry.findMany({
    where,
    orderBy: { accountId: "asc" },
    include: {
      account: { select: { id: true, code: true, nameAr: true, type: true } },
      journalEntry: { select: { id: true, status: true, reference: true } },
    },
  });

  return apiOk({
    entries: entries.map((e) => ({
      ...e,
      amount: num(e.amount, 3),
    })),
  });
});

// ─── POST (create entries) ────────────────────────────────────────────

const EntrySchema = z.object({
  accountId: z.number().int(),
  amount: z.union([z.number(), z.string()]),
});

const CreateOBSchema = z.object({
  companySlug: z.string().min(1),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "asOfDate must be YYYY-MM-DD"),
  entries: z.array(EntrySchema).min(1, "At least one entry required"),
  importedFrom: z.string().default("manual"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");

  // ── POST /post — Post all opening balance entries as a single JE ────
  if (action === "post") {
    const body = await parseJsonBody(req);
    const PostSchema = z.object({ companySlug: z.string().min(1) });
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
    const data = parsed.data;

    const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
    if ("error" in access) return access.error;
    const user = access.user;

    // Get all draft opening balance entries
    const draftEntries = await db.openingBalanceEntry.findMany({
      where: { companySlug: data.companySlug, status: "draft" },
      include: { account: true },
    });

    if (draftEntries.length === 0) return apiError("No draft opening balance entries to post", 400);

    // Validate that the entries are balanced (total debits = total credits)
    // Opening balances: assets/expenses are debit, liabilities/equity/revenue are credit
    let totalDebit = 0;
    let totalCredit = 0;

    const lines: Array<{ accountId: number; debit: string; credit: string; description: string }> = [];
    for (const entry of draftEntries) {
      const amount = num(entry.amount, 3);
      const isDebitNormal = entry.account.type === "asset" || entry.account.type === "expense";

      if (isDebitNormal) {
        totalDebit += amount;
        lines.push({
          accountId: entry.accountId,
          debit: amount.toFixed(3),
          credit: "0.000",
          description: `رصيد افتتاحي - ${entry.account.nameAr}`,
        });
      } else {
        totalCredit += amount;
        lines.push({
          accountId: entry.accountId,
          debit: "0.000",
          credit: amount.toFixed(3),
          description: `رصيد افتتاحي - ${entry.account.nameAr}`,
        });
      }
    }

    // If not balanced, we need a balancing line (typically to Retained Earnings)
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.001) {
      // Create a balancing entry to equity (Retained Earnings / Income Summary)
      const equityAccount = await db.account.findFirst({
        where: { companySlug: data.companySlug, type: "equity", isActive: true },
        orderBy: { code: "asc" },
      });
      if (!equityAccount) return apiError("Cannot balance opening entries — no equity account found", 400);

      if (totalDebit > totalCredit) {
        // Need a credit to balance
        totalCredit += diff;
        lines.push({
          accountId: equityAccount.id,
          debit: "0.000",
          credit: num(diff, 3).toFixed(3),
          description: `تسوية أرصدة افتتاحية - ${equityAccount.nameAr}`,
        });
      } else {
        // Need a debit to balance
        totalDebit += diff;
        lines.push({
          accountId: equityAccount.id,
          debit: num(diff, 3).toFixed(3),
          credit: "0.000",
          description: `تسوية أرصدة افتتاحية - ${equityAccount.nameAr}`,
        });
      }
    }

    // Use the asOfDate from the first entry as the JE date
    const jeDate = draftEntries[0].asOfDate;

    // Create JE + update opening balance entries in a transaction
    const result = await db.$transaction(async (tx) => {
      // Create the journal entry
      const je = await tx.journalEntry.create({
        data: {
          companySlug: data.companySlug,
          date: jeDate,
          description: "ترحيل أرصدة افتتاحية",
          reference: "OB-OPENING",
          status: "posted",
          createdBy: user.email,
          sourceType: "opening_balance",
          lines: { create: lines },
        },
      });

      // Update all opening balance entries to "posted" and link to the JE
      for (const entry of draftEntries) {
        await tx.openingBalanceEntry.update({
          where: { id: entry.id },
          data: { status: "posted", journalEntryId: je.id },
        });
      }

      // Update account balances
      const accountIds = [...new Set(lines.map((l) => l.accountId))];
      const accounts = await tx.account.findMany({
        where: { id: { in: accountIds }, companySlug: data.companySlug },
      });
      const accountMap = new Map(accounts.map((a) => [a.id, a]));

      for (const line of lines) {
        const acc = accountMap.get(line.accountId);
        if (!acc) continue;
        const isDebitNormal = acc.type === "asset" || acc.type === "expense";
        const delta = isDebitNormal
          ? num(line.debit, 3) - num(line.credit, 3)
          : num(line.credit, 3) - num(line.debit, 3);
        await tx.account.update({
          where: { id: acc.id },
          data: { balance: (num(acc.balance, 3) + delta).toFixed(3) },
        });
      }

      return { jeId: je.id, totalDebit, totalCredit, entriesPosted: draftEntries.length };
    });

    await logAudit({
      userEmail: user.email, userUid: user.uid,
      action: "post", entity: "opening_balance", companySlug: data.companySlug,
      details: { jeId: result.jeId, entriesPosted: result.entriesPosted, totalDebit: result.totalDebit.toFixed(3), totalCredit: result.totalCredit.toFixed(3) },
    });

    await logAccountingChange(
      data.companySlug, user.email, "post", "opening_balance", null,
      { entriesCount: draftEntries.length, status: "draft" },
      { status: "posted", jeId: result.jeId },
      null,
    );

    return apiOk({ ok: true, ...result });
  }

  // ── POST (create entries) ──────────────────────────────────────────
  const body = await parseJsonBody(req);
  const parsed = CreateOBSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Verify all accounts exist and belong to this company
  const accountIds = data.entries.map((e) => e.accountId);
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds }, companySlug: data.companySlug, isActive: true },
  });
  if (accounts.length !== accountIds.length) {
    const found = new Set(accounts.map((a) => a.id));
    const missing = accountIds.filter((id) => !found.has(id));
    return apiError(`Accounts not found or not active: ${missing.join(", ")}`, 400);
  }

  // Create opening balance entries (use upsert since there's a unique constraint on companySlug+accountId+asOfDate)
  const createdEntries: Array<{
    id: number; companySlug: string; accountId: number; amount: string;
    asOfDate: string; importedFrom: string | null; status: string;
    journalEntryId: number | null; account: { id: number; code: string; nameAr: string; type: string };
  }> = [];
  for (const entry of data.entries) {
    const ob = await db.openingBalanceEntry.upsert({
      where: {
        companySlug_accountId_asOfDate: {
          companySlug: data.companySlug,
          accountId: entry.accountId,
          asOfDate: data.asOfDate,
        },
      },
      update: {
        amount: num(entry.amount, 3).toFixed(3),
        importedFrom: data.importedFrom,
      },
      create: {
        companySlug: data.companySlug,
        accountId: entry.accountId,
        amount: num(entry.amount, 3).toFixed(3),
        asOfDate: data.asOfDate,
        importedFrom: data.importedFrom,
        status: "draft",
      },
      include: { account: { select: { id: true, code: true, nameAr: true, type: true } } },
    });
    createdEntries.push({
      id: ob.id as number,
      companySlug: ob.companySlug as string,
      accountId: ob.accountId as number,
      amount: ob.amount as string,
      asOfDate: ob.asOfDate as string,
      importedFrom: ob.importedFrom as string | null,
      status: ob.status as string,
      journalEntryId: ob.journalEntryId as number | null,
      account: ob.account as { id: number; code: string; nameAr: string; type: string },
    });
  }

  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "opening_balance", companySlug: data.companySlug,
    details: { asOfDate: data.asOfDate, entriesCount: createdEntries.length, importedFrom: data.importedFrom },
  });

  return apiOk({
    ok: true,
    entries: createdEntries.map((e: Record<string, unknown>) => ({
      id: e.id as number,
      companySlug: e.companySlug as string,
      accountId: e.accountId as number,
      amount: num(e.amount, 3),
      asOfDate: e.asOfDate as string,
      importedFrom: e.importedFrom as string | null,
      status: e.status as string,
      journalEntryId: e.journalEntryId as number | null,
      account: e.account as { id: number; code: string; nameAr: string; type: string },
    })),
  });
});
