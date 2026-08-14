/** POST /api/product-matching/undo — bulk undo matches */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { undoMatches } from "@/lib/productMatcher";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const Schema = z.object({ companySlug: z.string(), auditIds: z.array(z.number()) });

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/product-matching-undo — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:product-matching-undo", LIMITS.API_WRITE);
  if (rl) return rl;

  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid", 400);
  const { companySlug, auditIds } = parsed.data;
  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;
  const result = await undoMatches(auditIds, access.user.email);
  return NextResponse.json({ ok: true, ...result });
});
