/**
 * /api/accounting/fiscal/audit-log
 * GET — Get audit log of fiscal year close/reopen history
 *
 * Returns a chronological list of all fiscal year close and reopen events.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, hasPermission, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api";

// ─── GET: Audit log ──────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20", 10)));

  // Build where clause
  const where: Record<string, unknown> = {};
  
  if (companySlug) {
    if (!assertCompanyAccess(result.user, companySlug)) {
      return NextResponse.json({ error: "ممنوع" }, { status: 403 });
    }
    where.companySlug = companySlug;
  } else if (!hasUnrestrictedScope(result.user)) {
    where.companySlug = { in: result.user.companies };
  }

  const skip = (page - 1) * pageSize;

  // Fetch fiscal year closes with pagination
  const [closes, total] = await Promise.all([
    db.fiscalYearClose.findMany({
      where,
      orderBy: [{ year: "desc" }, { closedAt: "desc" }],
      skip,
      take: pageSize,
    }),
    db.fiscalYearClose.count({ where }),
  ]);

  // Format response with Arabic labels
  const formattedCloses = closes.map((close) => ({
    id: close.id,
    year: close.year,
    status: close.isReopened ? "مفتوح" : "مغلق",
    closedAt: close.closedAt,
    closedBy: close.closedBy,
    reopenedAt: close.reopenedAt,
    reopenedBy: close.reopenedBy,
    openingRetainedEarnings: close.openingRetainedEarnings.toString(),
    notes: close.notes,
    createdAt: close.createdAt,
    companySlug: close.companySlug,
  }));

  return NextResponse.json({
    entries: formattedCloses,
    pagination: {
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    },
    summary: {
      totalClosed: closes.filter((c) => !c.isReopened).length,
      totalReopened: closes.filter((c) => c.isReopened).length,
    },
  });
});
