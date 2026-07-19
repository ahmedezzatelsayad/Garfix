/**
 * /api/catalog
 * GET  — list products
 * POST — create product
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess, hasUnrestrictedScope } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, parseJsonField } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  code: z.string().optional(),
  name: z.string().min(1, "اسم المنتج مطلوب"),
  aliases: z.array(z.string()).default([]),
  purchasePrice: z.union([z.number(), z.string()]).optional(),
  sellingPrice: z.union([z.number(), z.string()]).optional(),
  wholesalePrice: z.union([z.number(), z.string()]).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = result.user;
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug") || undefined;
  const search = sp.get("search") || undefined;

  if (companySlug && !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const where: Record<string, unknown> = {};
  if (companySlug) where.companySlug = companySlug;
  else if (!hasUnrestrictedScope(user)) where.companySlug = { in: user.companies };
  if (search) where.OR = [{ name: { contains: search } }, { code: { contains: search } }];

  const products = await db.productCatalog.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json({
    products: products.map((p) => ({
      ...p,
      aliases: parseJsonField(p.aliases, []),
      purchasePrice: p.purchasePrice ? num(p.purchasePrice, 3) : null,
      sellingPrice: p.sellingPrice ? num(p.sellingPrice, 3) : null,
      wholesalePrice: p.wholesalePrice ? num(p.wholesalePrice, 3) : null,
    })),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // Enforce permission + company access (catalog management is admin/manager only)
  const access = await requirePermissionForCompany(req, "settings_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const product = await db.productCatalog.create({
    data: {
      companySlug: data.companySlug,
      code: data.code || null,
      name: data.name,
      aliases: JSON.stringify(data.aliases),
      purchasePrice: data.purchasePrice !== undefined ? num(data.purchasePrice, 3).toFixed(3) : null,
      sellingPrice: data.sellingPrice !== undefined ? num(data.sellingPrice, 3).toFixed(3) : null,
      wholesalePrice: data.wholesalePrice !== undefined ? num(data.wholesalePrice, 3).toFixed(3) : null,
    },
  });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "product", entityId: product.id, companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, product });
});
