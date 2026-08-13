/**
 * /api/e-invoicing/zatca/status
 * GET — ZATCA certificate status for a company.
 *
 * Query: ?companySlug=<slug>
 *
 * Returns: { hasCsid, hasCcd, csidExpiry?, ccdExpiry?, status }
 *   status: "not_started" | "csid_only" | "fully_configured" | "expired"
 *
 * Auth: founder OR company admin.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { isFounderEmail } from "@/lib/founder";
import { dbTyped as db } from "@/lib/db";
import { requireAuth } from "@/lib/middleware";
import { apiError, withErrorHandler } from "@/lib/api";
import { logger } from "@/lib/logger";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authResponse = await requireAuth(req);
  if (authResponse instanceof NextResponse) return authResponse;
  const user = authResponse.user;

  const url = new URL(req.url);
  const companySlug = url.searchParams.get("companySlug");
  if (!companySlug) {
    return apiError("companySlug مطلوب", 400);
  }

  // Verify access
  const userCompanies = user.companies || [];
  const isFounder = isFounderEmail(user.email);
  if (!isFounder && !userCompanies.includes(companySlug)) {
    return apiError("ليس لديك صلاحية على هذه الشركة", 403);
  }

  try {
    const certs = await db.zatcaCertificate.findMany({
      where: { companySlug },
      select: {
        certificateType: true,
        expiryDate: true,
        status: true,
        serialNumber: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const csid = certs.find((c) => c.certificateType === "csid");
    const ccd = certs.find((c) => c.certificateType === "ccd");

    const hasCsid = !!csid && csid.status === "active";
    const hasCcd = !!ccd && ccd.status === "active";

    const now = new Date();
    const csidExpired = csid?.expiryDate ? csid.expiryDate < now : false;
    const ccdExpired = ccd?.expiryDate ? ccd.expiryDate < now : false;

    let status: "not_started" | "csid_only" | "fully_configured" | "expired";
    if (!hasCsid && !hasCcd) status = "not_started";
    else if (hasCsid && hasCcd) status = csidExpired || ccdExpired ? "expired" : "fully_configured";
    else if (hasCsid) status = "csid_only";
    else status = "not_started";

    return NextResponse.json({
      hasCsid,
      hasCcd,
      csidExpiry: csid?.expiryDate?.toISOString() || null,
      ccdExpiry: ccd?.expiryDate?.toISOString() || null,
      csidSerialNumber: csid?.serialNumber || null,
      ccdSerialNumber: ccd?.serialNumber || null,
      csidStatus: csid?.status || null,
      ccdStatus: ccd?.status || null,
      status,
    });
  } catch (err) {
    logger.error("[zatca/status] failed", {
      companySlug,
      err: err instanceof Error ? err.message : String(err),
    });
    return apiError("فشل تحميل حالة شهادات ZATCA", 500);
  }
});
