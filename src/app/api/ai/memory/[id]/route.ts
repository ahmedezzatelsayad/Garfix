/**
 * /api/ai/memory/[id]
 *
 * DELETE — delete a memory note.
 *
 * The user must have access to the note's company (founder/admin bypasses).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { apiError, withErrorHandler } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) {
    return apiError("Invalid id", 400);
  }

  const existing = await db.aIMemoryNote.findUnique({ where: { id } });
  if (!existing) {
    return apiError("Memory note not found", 404);
  }

  // Enforce company access — only users who can access the note's
  // company may delete it. Founders/admins bypass via assertCompanyAccess.
  if (!assertCompanyAccess(user, existing.companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.aIMemoryNote.delete({ where: { id: existing.id } });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "delete",
    entity: "ai_memory_note",
    entityId: existing.id,
    companySlug: existing.companySlug,
    details: {
      entityType: existing.entityType,
      entityId: existing.entityId,
      notePreview: existing.note.slice(0, 80),
    },
  });

  return NextResponse.json({ ok: true });
});
