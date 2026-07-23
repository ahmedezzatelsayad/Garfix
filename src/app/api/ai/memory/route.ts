/**
 * /api/ai/memory
 *
 * GET  — list memory notes for an entity (?companySlug=X&entityType=client&entityId=Y)
 * POST — create a memory note { companySlug, entityType, entityId, note }
 *
 * Permission: view_customers (any authenticated user with company access can
 * read/write notes for entities within companies they can access).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1, "companySlug is required"),
  entityType: z.enum(["client", "invoice", "product", "employee"]),
  entityId: z.number().int().min(1),
  note: z.string().min(1, "النص مطلوب").max(4000, "النص طويل جداً"),
});

const ALLOWED_ENTITY_TYPES = new Set(["client", "invoice", "product", "employee"]);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  const entityType = sp.get("entityType");
  const entityIdRaw = sp.get("entityId");

  if (!companySlug) return apiError("companySlug is required", 400);
  if (!entityType || !ALLOWED_ENTITY_TYPES.has(entityType)) {
    return apiError("entityType must be one of: client, invoice, product, employee", 400);
  }
  const entityId = Number(entityIdRaw);
  if (!Number.isInteger(entityId) || entityId < 1) {
    return apiError("entityId must be a positive integer", 400);
  }

  if (!assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const notes = await db.aIMemoryNote.findMany({
    where: { companySlug, entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      companySlug: n.companySlug,
      entityType: n.entityType,
      entityId: n.entityId,
      note: n.note,
      createdBy: n.createdBy,
      createdAt: n.createdAt,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues?.[0]?.message || "Invalid input", 400);
  }
  const data = parsed.data;

  // view_customers is the minimal permission required to attach notes to
  // customer/client entities; for other entity types we still require
  // view_customers as the baseline (anyone who can see the entity can
  // annotate it). Founders/admins bypass via hasPermission.
  const access = await requirePermissionForCompany(req, "view_customers", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const note = await db.aIMemoryNote.create({
    data: {
      companySlug: data.companySlug,
      entityType: data.entityType,
      entityId: data.entityId,
      note: data.note,
      createdBy: user.email,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "ai_memory_note",
    entityId: note.id,
    companySlug: data.companySlug,
    details: {
      entityType: data.entityType,
      entityId: data.entityId,
      notePreview: data.note.slice(0, 80),
    },
  });

  return NextResponse.json(
    {
      ok: true,
      note: {
        id: note.id,
        companySlug: note.companySlug,
        entityType: note.entityType,
        entityId: note.entityId,
        note: note.note,
        createdBy: note.createdBy,
        createdAt: note.createdAt,
      },
    },
    { status: 201 },
  );
});
