/**
 * /api/accounting/consolidation
 * GET — Consolidated reports (groupSlug + asOfDate)
 * POST — Consolidate group (groupSlug, asOfDate)
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForCompany } from "@/lib/middleware";
import { consolidateGroup } from "@/lib/accounting/consolidation";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { z } from "zod";

// ── GET: Consolidated reports ───────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const groupSlug = sp.get("groupSlug");
  if (!groupSlug) return apiError("groupSlug مطلوب", 400);
  const asOfDate = sp.get("asOfDate") || new Date().toISOString().slice(0, 10);

  const access = await requirePermissionForCompany(req, "finance_access", groupSlug);
  if ("error" in access) return access.error;

  const consolidation = await consolidateGroup(groupSlug, asOfDate);
  return NextResponse.json({ consolidation });
});

// ── POST: Consolidate group ────────────────────────────────────────────────────

const ConsolidateSchema = z.object({
  groupSlug: z.string().min(1),
  asOfDate: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = ConsolidateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "finance_access", data.groupSlug);
  if ("error" in access) return access.error;

  const consolidation = await consolidateGroup(data.groupSlug, data.asOfDate);
  return NextResponse.json({ ok: true, consolidation });
});
