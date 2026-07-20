/**
 * /api/permissions/catalog
 * GET — return the permission catalog + role presets + role defaults
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api";
import { PERMISSION_CATALOG, ROLE_DEFAULTS, ROLE_PRESETS, LOCKED_PERMS } from "@/lib/permissions";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    catalog: PERMISSION_CATALOG,
    rolePresets: ROLE_PRESETS,
    roleDefaults: ROLE_DEFAULTS,
    lockedKeys: LOCKED_PERMS,
  });
});
