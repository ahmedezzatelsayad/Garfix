/**
 * /api/notifications
 * GET  — list notifications for the current user (unread first, then by date)
 * POST — mark all as read (body: { action: "mark_all_read" })
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  const notifications = await db.notification.findMany({
    where: { userUid: user.uid },
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({ notifications, unreadCount });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;

  const body = await parseJsonBody(req);
  const action = (body as Record<string, unknown>)?.action;

  if (action === "mark_all_read") {
    await db.notification.updateMany({
      where: { userUid: user.uid, isRead: false },
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
      data: { isRead: true, readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
});
