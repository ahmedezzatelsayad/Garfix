/**
 * /api/platform-admin/announcements/[id]
 * PATCH  — update an announcement (founder only)
 * DELETE — delete an announcement (founder only)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFounder } from "@/lib/middleware";
import { logAdminAction } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  type: z.enum(["info", "warning", "success", "critical"]).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const founder = founderAccess.user;

  const { id } = await params;
  const existing = await db.announcement.findUnique({ where: { id } });
  if (!existing) return apiError("Announcement not found", 404);

  const body = await parseJsonBody(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.body !== undefined) updateData.body = data.body;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.startsAt !== undefined) {
    updateData.startsAt = data.startsAt ? new Date(data.startsAt) : null;
  }
  if (data.endsAt !== undefined) {
    updateData.endsAt = data.endsAt ? new Date(data.endsAt) : null;
  }

  const announcement = await db.announcement.update({ where: { id: existing.id }, data: updateData });

  await logAdminAction({
    adminEmail: founder.email,
    action: "update_announcement",
    targetType: "announcement",
    targetId: existing.id,
    changes: updateData,
  });

  return NextResponse.json({ ok: true, announcement });
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const founder = founderAccess.user;

  const { id } = await params;
  const existing = await db.announcement.findUnique({ where: { id } });
  if (!existing) return apiError("Announcement not found", 404);

  await db.announcement.delete({ where: { id: existing.id } });

  await logAdminAction({
    adminEmail: founder.email,
    action: "delete_announcement",
    targetType: "announcement",
    targetId: existing.id,
  });

  return NextResponse.json({ ok: true });
});

