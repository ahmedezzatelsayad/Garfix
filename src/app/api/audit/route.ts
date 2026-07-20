/**
 * /api/audit
 * GET — list audit logs (scoped to user's accessible companies)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { withErrorHandler, parseJsonField } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  const action = sp.get("action") || undefined;
  const limit = Math.min(parseInt(sp.get("limit") || "100"), 500);

  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(user)) where.companySlug = { in: user.companies };
  if (action) where.action = action;

  const logs = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
  return NextResponse.json({
    logs: logs.map((l) => ({ ...l, details: l.details ? parseJsonField(l.details, null) : null })),
  });
});
