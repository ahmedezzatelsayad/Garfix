/**
 * /api/accounting/fiscal
 * GET — Fiscal year status and audit log
 *
 * - Check if a fiscal year is closed
 * - Get audit log of all closes/reopens
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, hasPermission } from "@/lib/auth";
import { assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api";

// ─── GET: Fiscal status check ────────────────────────────────────────────────

/**
 * GET /api/accounting/fiscal/status?companySlug=xxx&year=2026
 * Returns the close status for a specific year or all years.
 */
export async function GET(req: NextRequest) {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  if (!hasPermission(result.user, "finance_access")) {
    return NextResponse.json({ error: "ليس لديك صلاحية: finance_access" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  const year = sp.get("year") ? parseInt(sp.get("year")!, 10) : null;

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

  if (year) {
    where.year = year;
  }

  // Fetch fiscal year closes
  const closes = await db.fiscalYearClose.findMany({
    where,
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });

  // If specific year requested, return detailed status
  if (year && companySlug) {
    const closeRecord = closes.find((c) => c.year === year);
    
    return NextResponse.json({
      year,
      isClosed: !!closeRecord && !closeRecord.isReopened,
      closeRecord: closeRecord || null,
      canClose: !closeRecord || closeRecord.isReopened,
    });
  }

  // Return list of all years' status
  return NextResponse.json({
    closes,
    closedYears: closes.filter((c) => !c.isReopened).map((c) => c.year),
  });
}

// Wrap with error handler for consistency
const _GET_handler = withErrorHandler(GET);
