/**
 * /api/inventory/warehouses
 * GET  — list warehouses for a company
 * POST — create a new warehouse
 *
 * Both require `settings_access` permission.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  name: z.string().min(1, "اسم المستودع مطلوب"),
  code: z.string().min(1, "كود المستودع مطلوب"),
  address: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;

  const warehouses = await db.warehouse.findMany({
    where: { companySlug },
    orderBy: [{ code: "asc" }],
    include: {
      _count: { select: { inventoryItems: true } },
    },
  });

  return NextResponse.json({
    warehouses: warehouses.map((w) => ({
      id: w.id,
      companySlug: w.companySlug,
      name: w.name,
      code: w.code,
      address: w.address,
      isActive: w.isActive,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      itemCount: w._count.inventoryItems,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "settings_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Enforce uniqueness of code within a company
  const existing = await db.warehouse.findFirst({
    where: { companySlug: data.companySlug, code: data.code },
  });
  if (existing) return apiError("كود المستودع مستخدم بالفعل", 409);

  const warehouse = await db.warehouse.create({
    data: {
      companySlug: data.companySlug,
      name: data.name,
      code: data.code,
      address: data.address || null,
      isActive: data.isActive,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "create",
    entity: "warehouse",
    entityId: warehouse.id,
    companySlug: data.companySlug,
  });

  return NextResponse.json({ ok: true, warehouse }, { status: 201 });
});
