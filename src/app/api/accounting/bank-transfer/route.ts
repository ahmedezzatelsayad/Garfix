/**
 * /api/accounting/bank-transfer
 * GET  — list bank transfer transactions for a company
 * POST — transfer between bank accounts
 */
import { NextRequest } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { transferBetweenAccounts } from "@/lib/accounting/banking";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { db } from "@/lib/db";

const GetSchema = z.object({
  companySlug: z.string().min(1),
});

const TransferSchema = z.object({
  companySlug: z.string().min(1),
  fromAccountId: z.number().int(),
  toAccountId: z.number().int(),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().default("KWD"),
  date: z.string().min(1), // YYYY-MM-DD
  description: z.string().min(1),
});

// ── GET: List bank transfer transactions ────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const parsed = GetSchema.safeParse({
    companySlug: sp.get("companySlug") || "",
  });
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;

  const transfers = await db.bankTransaction.findMany({
    where: {
      companySlug: data.companySlug,
      transactionType: "transfer",
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      bankAccount: { select: { id: true, bankName: true, accountName: true, currency: true } },
    },
  });

  return apiOk({
    transfers: transfers.map((t) => ({
      ...t,
      amount: num(t.amount, 3),
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = TransferSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate from ≠ to
  if (data.fromAccountId === data.toAccountId) {
    return apiError("Source and destination accounts must be different", 400);
  }

  try {
    const result = await transferBetweenAccounts(
      data.companySlug,
      data.fromAccountId,
      data.toAccountId,
      String(data.amount),
      data.currency,
      data.date,
      data.description,
      user.email,
    );

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "bank_transfer",
      entity: "bank_transaction",
      companySlug: data.companySlug,
      details: {
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amount: String(data.amount),
        currency: data.currency,
        date: data.date,
        description: data.description,
        withdrawalTransactionId: result.withdrawalTransactionId,
        depositTransactionId: result.depositTransactionId,
        journalEntryId: result.journalEntryId,
      },
    });

    return apiOk({
      result,
      message: "Transfer completed successfully",
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transfer failed";
    return apiError(message, 400);
  }
});
