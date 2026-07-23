/**
 * /api/accounting/bank-accounts
 * GET — list bank accounts for company
 * POST — create bank account
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  bankName: z.string().min(1),
  accountName: z.string().min(1),
  accountNumber: z.string().min(1),
  iban: z.string().optional(),
  branchCode: z.string().optional(),
  currency: z.string().default("KWD"),
  accountType: z.enum(["checking", "savings", "cash_vault"]).default("checking"),
  glAccountId: z.number().int().optional(),
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

  // Only show active accounts by default unless explicitly requested
  const showInactive = sp.get("showInactive") === "true";
  if (!showInactive) where.isActive = true;

  const accounts = await db.bankAccount.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      glAccount: { select: { id: true, code: true, nameAr: true, nameEn: true, type: true } },
    },
  });

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      ...a,
      balance: num(a.balance, 3).toFixed(3),
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

  // Validate GL account belongs to the same company if provided
  if (data.glAccountId) {
    const glAccount = await db.account.findUnique({ where: { id: data.glAccountId } });
    if (!glAccount || glAccount.companySlug !== data.companySlug) {
      return apiError("GL account does not belong to this company", 400);
    }
    if (glAccount.type !== "asset") {
      return apiError("Bank account must be linked to an asset-type GL account", 400);
    }
  }

  const account = await db.bankAccount.create({
    data: {
      companySlug: data.companySlug,
      bankName: data.bankName,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      iban: data.iban || null,
      branchCode: data.branchCode || null,
      currency: data.currency,
      accountType: data.accountType,
      glAccountId: data.glAccountId || null,
      balance: "0.000",
    },
    include: {
      glAccount: { select: { id: true, code: true, nameAr: true, nameEn: true, type: true } },
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "bank_account",
    entityId: account.id,
    companySlug: data.companySlug,
    details: { bankName: data.bankName, accountName: data.accountName, currency: data.currency },
  });

  return apiOk({
    ...account,
    balance: num(account.balance, 3).toFixed(3),
  }, 201);
});
