/**
 * /api/accounting/accounts
 * GET / POST — chart of accounts
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany, hasPermission } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { parseCursorParams, buildCursorResponse, buildCursorPrismaQuery } from "@/lib/cursor-pagination-server";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  code: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().optional(),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense", "contra_revenue", "contra_asset"]),
  parentId: z.number().int().optional().nullable(),
  balance: z.union([z.number(), z.string()]).default(0),
  currency: z.string().default("KWD"),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // SEC-M1C4 (Cycle 4): close missing-permission — list endpoint checked tenant
  // scope but NOT finance_access, allowing a viewer/employee with company access
  // to list the entire chart of accounts including balances. Sibling routes
  // /api/accounting/bank-accounts and /api/accounting/journal-entries already
  // enforce finance_access; this brings the accounts list in line with them.
  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { companySlug, cursor, limit, search } = parseCursorParams(req);
  if (companySlug && !assertCompanyAccess(result.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(result.user)) where.companySlug = { in: result.user.companies };
  if (search) {
    where.OR = [
      { nameAr: { contains: search, mode: "insensitive" } },
      { nameEn: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }

  // If cursor param is present, use cursor pagination (infinite scroll)
  if (cursor || req.nextUrl.searchParams.has("limit")) {
    const pagination = buildCursorPrismaQuery(cursor, limit, "code", "asc");
    const allAccounts = await db.account.findMany({ where, ...pagination });
    const { items, nextCursor } = buildCursorResponse(allAccounts, limit);
    return NextResponse.json({
      accounts: items.map((a) => ({ ...a, balance: num(a.balance, 3) })),
      nextCursor,
    });
  }

  // Legacy: no cursor — return all accounts (for backward compat with non-paginated callers)
  const accounts = await db.account.findMany({ where, orderBy: [{ code: "asc" }] });
  return NextResponse.json({ accounts: accounts.map((a) => ({ ...a, balance: num(a.balance, 3) })) });
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

  const account = await db.account.create({
    data: {
      companySlug: data.companySlug, code: data.code, nameAr: data.nameAr, nameEn: data.nameEn || null,
      type: data.type, parentId: data.parentId || null,
      balance: num(data.balance, 3).toFixed(3), currency: data.currency,
    },
  });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "account", entityId: account.id, companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, account });
});
