/**
 * /api/notifications
 * GET  — list notifications for the current user (unread first, then by date)
 * POST — mark all as read (body: { action: "mark_all_read" })
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  // Phase 4 P2 fix: filter by companySlug when provided (was returning
  // notifications from ALL companies the user belongs to).
  const companySlug = req.nextUrl.searchParams.get("companySlug") || undefined;
  const where: Record<string, unknown> = { userUid: user.uid };
  if (companySlug) where.companySlug = companySlug;

  const notifications = await db.notification.findMany({
    where,
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({ notifications, unreadCount });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/notifications — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:notifications", LIMITS.API_WRITE);
  if (rl) return rl;

  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  const body = await parseJsonBody(req);
  const action = (body as Record<string, unknown>)?.action;

  if (action === "mark_all_read") {
    await db.notification.updateMany({
      where: { userUid: user.uid, isRead: false },
      // Note: Notification schema uses `isRead` (not `read`) by design.
      data: { isRead: true, readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_read" && (body as Record<string, unknown>)?.id) {
    await db.notification.update({
      where: {
        id: Number((body as Record<string, unknown>).id),
        userUid: user.uid, // ensure ownership
      },
      // Note: Notification schema uses `isRead` (not `read`) by design.
      data: { isRead: true, readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
});
