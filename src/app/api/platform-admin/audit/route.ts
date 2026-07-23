/**
 * /api/platform-admin/audit
 * GET — list admin audit logs (founder only)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { withErrorHandler, parseJsonField } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFounderEmail(result.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(sp.get("limit") || "100"), 500);
  const logs = await db.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return NextResponse.json({
    logs: logs.map((l) => ({
      ...l,
      changes: l.changes ? parseJsonField(l.changes, null) : null,
    })),
  });
});
