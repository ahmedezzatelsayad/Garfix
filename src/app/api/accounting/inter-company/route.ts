/**
 * /api/accounting/inter-company
 * GET — List inter-company transactions (companySlug)
 * POST — Create inter-company settlement
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { createInterCompanySettlement } from "@/lib/accounting/consolidation";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

// ── GET: List inter-company transactions ────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const transactions = await db.interCompanyTransaction.findMany({
    where: {
      OR: [
        { companySlugFrom: companySlug },
        { companySlugTo: companySlug },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({
    transactions: transactions.map((t) => ({
      ...t,
      amount: num(t.amount, 3),
    })),
  });
});

// ── POST: Create inter-company settlement ──────────────────────────────────────

const SettlementSchema = z.object({
  companySlugFrom: z.string().min(1),
  companySlugTo: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().default("KWD"),
  description: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = SettlementSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Verify access for both companies (user must have access to at least one)
  const accessFrom = await requirePermissionForCompany(req, "finance_access", data.companySlugFrom);
  if ("error" in accessFrom) {
    // Try access to companyTo
    const accessTo = await requirePermissionForCompany(req, "finance_access", data.companySlugTo);
    if ("error" in accessTo) return accessTo.error;
  }

  // Resolve user identity from whichever access succeeded
  const access = await requirePermissionForCompany(req, "finance_access", data.companySlugFrom);
  if ("error" in access) {
    const accessTo = await requirePermissionForCompany(req, "finance_access", data.companySlugTo);
    if ("error" in accessTo) return accessTo.error;
    const user = accessTo.user;

    const amountStr = typeof data.amount === "number"
      ? num(data.amount, 3).toFixed(3)
      : String(data.amount);

    const result = await createInterCompanySettlement(
      data.companySlugFrom,
      data.companySlugTo,
      amountStr,
      data.currency,
      data.description,
      user.email,
      user.uid,
    );

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "create_inter_company_settlement",
      entity: "inter_company_transaction",
      companySlug: data.companySlugTo,
      details: { from: data.companySlugFrom, to: data.companySlugTo, amount: amountStr, currency: data.currency },
    });

    return NextResponse.json({ ok: true, settlement: result });
  }

  const user = access.user;

  const amountStr = typeof data.amount === "number"
    ? num(data.amount, 3).toFixed(3)
    : String(data.amount);

  const result = await createInterCompanySettlement(
    data.companySlugFrom,
    data.companySlugTo,
    amountStr,
    data.currency,
    data.description,
    user.email,
    user.uid,
  );

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create_inter_company_settlement",
    entity: "inter_company_transaction",
    companySlug: data.companySlugFrom,
    details: { from: data.companySlugFrom, to: data.companySlugTo, amount: amountStr, currency: data.currency },
  });

  return NextResponse.json({ ok: true, settlement: result });
});
