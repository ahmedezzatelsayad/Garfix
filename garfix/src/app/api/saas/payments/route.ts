/**
 * /api/saas/payments
 * GET — list payment transactions (founder: all; admin: scoped to assigned companies)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, hasUnrestrictedScope } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api";
import { num } from "@/lib/money";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;
  const where: Record<string, unknown> = {};
  if (!hasUnrestrictedScope(user)) where.companySlug = { in: user.companies };

  const txns = await db.paymentTransaction.findMany({
    where, orderBy: { createdAt: "desc" }, take: 200,
  });
  return NextResponse.json({
    payments: txns.map((t) => ({
      ...t,
      amount: num(t.amount, 3),
      metadata: t.metadata ? (() => { try { return JSON.parse(t.metadata); } catch { return null; } })() : null,
    })),
  });
});
