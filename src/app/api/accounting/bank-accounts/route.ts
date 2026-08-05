/**
 * /api/accounting/bank-accounts
 * GET — list bank accounts for company
 * POST — create bank account
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { entityId, entityIdOptional, entityIdNullable } from "@/lib/validation";
import { resolveCompanyId } from "@/lib/company-resolver";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  bankName: z.string().min(1),
  accountName: z.string().min(1),
  accountNumber: z.string().min(1),
  iban: z.string().optional(),
  branchCode: z.string().optional(),
  currency: z.string().default("KWD"),
  accountType: z.enum(["checking", "savings", "cash_vault"]).default("checking"),
  glAccountId: entityIdOptional,
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
    include: { glAccount: true },
  });

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      ...a,
      balance: num(a.balance, 3).toFixed(3),
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/accounting-bank-accounts — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:accounting-bank-accounts", LIMITS.API_WRITE);
  if (rl) return rl;

  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Validate GL account belongs to the same company if provided
  if (data.glAccountId) {
    const glAccount = await db.account.findFirst({ where: { id: data.glAccountId, companySlug: data.companySlug } });
    if (!glAccount) {
      return apiError("GL account does not belong to this company", 400);
    }
    if (glAccount.type !== "asset") {
      return apiError("Bank account must be linked to an asset-type GL account", 400);
    }
  }

  // P5-C1: resolve real Company.id (cuid) from slug — was `companyId: "0"` placeholder.
  let companyId: string;
  try {
    companyId = await resolveCompanyId(data.companySlug);
  } catch {
    return apiError("Invalid company", 400);
  }

  const account = await db.bankAccount.create({
    data: {
      companySlug: data.companySlug,
      companyId,
      // Note (P2): BankAccount.name is a required String column
      // (legacy field). The newer P2 `accountName` column carries the same
      // human-readable label — populate both for compatibility.
      name: data.accountName,
      bankName: data.bankName,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      iban: data.iban || null,
      branchCode: data.branchCode || null,
      currency: data.currency,
      accountType: data.accountType,
      // P2-Sprint6: BankAccount.glAccountId is now String? (cuid FK).
      // Pass the string value directly.
      glAccountId: data.glAccountId ? String(data.glAccountId) : null,
      balance: "0.000",
    },
    include: { glAccount: true },
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
