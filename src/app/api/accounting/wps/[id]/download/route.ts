/**
 * /api/accounting/wps/[id]/download
 * GET — download a WPS file (returns SIF format data)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, apiOk } from "@/lib/api";

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const companySlug = req.nextUrl.searchParams.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "finance_access", companySlug);
  if ("error" in access) return access.error;

  const wpsFile = await db.wpsFile.findUnique({
    where: { id: parseInt(id, 10) },
  });

  if (!wpsFile) return apiError("WPS file not found", 404);
  if (wpsFile.companySlug !== companySlug) return apiError("WPS file does not belong to this company", 403);

  // Return the file content (SIF format) for download
  return apiOk({
    id: wpsFile.id,
    fileName: wpsFile.fileName,
    fileContent: wpsFile.fileContent,
    country: wpsFile.country,
    month: wpsFile.month,
    totalEmployees: wpsFile.totalEmployees,
    totalAmount: num(wpsFile.totalAmount, 3).toFixed(3),
    status: wpsFile.status,
    createdAt: wpsFile.createdAt.toISOString(),
  });
});
