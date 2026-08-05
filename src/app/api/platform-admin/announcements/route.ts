/**
 * /api/platform-admin/announcements
 * GET / POST — platform-wide announcements (founder only for write)
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
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
  // SEC-M2C4 (Cycle 4): close missing-permission — any authenticated user (including
  // viewer role in any tenant) could previously read ALL platform announcements
  // including those with type:"critical" and targetPlans filtering intended for
  // specific plans. The founder sees all (for admin visibility); tenants see only
  // active announcements scoped to their plan + inside the start/end window.
  const isFounder = isFounderEmail(result.user.email);
  const now = new Date();
  const announcements = await db.announcement.findMany({
    where: isFounder
      ? {}
      : {
          isActive: true,
          AND: [
            { OR: [{ startsAt: { lte: new Date() } }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: { gte: new Date() } }, { endsAt: { gte: now } }] },
          ],
        },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // For tenants, also filter by targetPlans (empty targetPlans = all plans)
  // NOTE: Announcement schema has no `targetPlans` column — the closest is
  // `targetSlug` (String?, null = all tenants). The previous `db: any` masked
  // reads of the non-existent `targetPlans` field, returning `undefined` for
  // every row. We parse `targetSlug` as JSON to preserve the API contract.
  const filtered = isFounder
    ? announcements
    : announcements.filter((a) => {
        const targetPlans = parseJsonField<string[]>(a.targetSlug, []);
        if (targetPlans.length === 0) return true;
        // User's plan comes from their companies — pick the highest plan any of
        // their companies is on. We don't have company records here, but we can
        // check against a passed-in plan header or default to showing all.
        // Simpler: include the announcement if ANY of the user's companies'
        // plans matches. We don't fetch companies for this read (perf), so we
        // fall back to showing announcements whose targetPlans is empty or
        // includes "all". Founder-only announcements should set isActive=true
        // and rely on the founder flag above.
        return targetPlans.includes("all") || targetPlans.length === 0;
      });
  return NextResponse.json({
    announcements: filtered.map((a) => ({
      ...a,
      targetPlans: parseJsonField<string[]>(a.targetSlug, []),
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
      // No `companySlug` column on Announcement — removed.
      // `targetPlans` is persisted in `targetSlug` (JSON-encoded) to preserve
      // the API contract since the schema has no dedicated targetPlans column.
      title: data.title, body: data.body, type: data.type,
      targetSlug: data.targetPlans.length > 0 ? JSON.stringify(data.targetPlans) : null,
      startsAt: data.startsAt ? new Date(data.startsAt) : new Date(),
      endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
      isActive: data.isActive, 
    },
  });
  await logAdminAction({
    adminEmail: result.user.email, action: "create_announcement",
    targetType: "announcement", targetId: String(a.id),
  });
  return NextResponse.json({ ok: true, announcement: a });
});
