/**
 * /api/platform-admin/announcements
 * GET / POST — platform-wide announcements (founder only for write)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { logAdminAction } from "@/lib/audit";
import { withErrorHandler, parseJsonBody, parseJsonField, apiError } from "@/lib/api";
import { z } from "zod";

const CreateSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  type: z.enum(["info", "warning", "success", "critical"]).default("info"),
  targetPlans: z.array(z.string()).default([]),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const announcements = await db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({
    announcements: announcements.map((a) => ({
      ...a,
      targetPlans: parseJsonField(a.targetPlans, []),
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFounderEmail(result.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;
  const a = await db.announcement.create({
    data: {
      title: data.title, body: data.body, type: data.type,
      targetPlans: JSON.stringify(data.targetPlans),
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      isActive: data.isActive, createdBy: result.user.email,
    },
  });
  await logAdminAction({
    adminEmail: result.user.email, action: "create_announcement",
    targetType: "announcement", targetId: a.id,
  });
  return NextResponse.json({ ok: true, announcement: a });
});
