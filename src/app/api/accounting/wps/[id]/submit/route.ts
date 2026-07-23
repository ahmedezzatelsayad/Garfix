/**
 * /api/accounting/wps/[id]/submit
 * POST — submit a WPS file
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const SubmitSchema = z.object({
  companySlug: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const wpsId = parseInt(id, 10);

  const body = await parseJsonBody(req);
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  const existing = await db.wpsFile.findUnique({
    where: { id: wpsId },
  });
  if (!existing) return apiError("WPS file not found", 404);
  if (existing.companySlug !== data.companySlug) return apiError("WPS file does not belong to this company", 403);

  // Only draft files can be submitted
  if (existing.status !== "draft") {
    return apiError("Only draft WPS files can be submitted", 400);
  }

  const wpsFile = await db.wpsFile.update({
    where: { id: wpsId },
    data: {
      status: "submitted",
      submittedAt: new Date(),
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "submit_wps",
    entity: "wps_file",
    entityId: wpsId,
    companySlug: data.companySlug,
    details: { country: existing.country, month: existing.month, fileName: existing.fileName },
  });

  return apiOk({
    ...wpsFile,
    totalAmount: num(wpsFile.totalAmount, 3).toFixed(3),
  });
});
