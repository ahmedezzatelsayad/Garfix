/**
 * /api/accounting/wps/[id]
 * GET — download WPS file content
 * PATCH — update WPS file status (submit/accept/reject)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody, apiOk } from "@/lib/api";

const PatchSchema = z.object({
  companySlug: z.string().min(1),
  status: z.enum(["submitted", "accepted", "rejected"]),
  rejectionReason: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const wpsFile = await db.wpsFile.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!wpsFile) return apiError("WPS file not found", 404);

    // SEC-C7 (Cycle 4): close IDOR — GET was missing the requirePermissionForCompany
    // guard that PATCH already enforced. WPS files contain government-compliance
    // salary data and must be tenant-scoped.
    const access = await requirePermissionForCompany(req, "finance_access", wpsFile.companySlug);
    if ("error" in access) return access.error;

    // Return the full file content for download
    return apiOk({
      ...wpsFile,
      totalAmount: num(wpsFile.totalAmount, 3).toFixed(3),
    });
  })();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const { id } = await params;
    const wpsId = parseInt(id, 10);
    const body = await parseJsonBody(req);
    const parsed = PatchSchema.safeParse(body);
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

    // Validate status transitions
    if (data.status === "submitted" && existing.status !== "draft") {
      return apiError("Only draft WPS files can be submitted", 400);
    }
    if (data.status === "accepted" && existing.status !== "submitted") {
      return apiError("Only submitted WPS files can be accepted", 400);
    }
    if (data.status === "rejected" && existing.status !== "submitted") {
      return apiError("Only submitted WPS files can be rejected", 400);
    }
    if (data.status === "rejected" && !data.rejectionReason) {
      return apiError("Rejection reason is required when rejecting a WPS file", 400);
    }

    const updateData: Record<string, unknown> = {};
    updateData.status = data.status;

    if (data.status === "submitted") {
      updateData.submittedAt = new Date();
    }
    if (data.status === "rejected") {
      updateData.rejectionReason = data.rejectionReason;
    }

    const wpsFile = await db.wpsFile.update({
      where: { id: wpsId },
      data: updateData,
    });

    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: data.status === "submitted" ? "submit_wps" : data.status === "accepted" ? "accept_wps" : "reject_wps",
      entity: "wps_file",
      entityId: wpsId,
      companySlug: data.companySlug,
      details: {
        status: data.status,
        rejectionReason: data.rejectionReason,
        country: existing.country,
        month: existing.month,
      },
    });

    return apiOk({
      ...wpsFile,
      totalAmount: num(wpsFile.totalAmount, 3).toFixed(3),
    });
  })();
}
