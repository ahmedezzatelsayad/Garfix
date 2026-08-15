/**
 * GET /api/setup/status
 *
 * Returns whether setup has been completed. Used by the /setup page to
 * detect if the wizard is still available, and by middleware to decide
 * whether to redirect / → /setup.
 *
 * Always returns 200 (even when setup is complete) — this endpoint is
 * intentionally public so the wizard can probe it without auth.
 */

import { isSetupComplete } from "@/lib/setup/setup-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({
    setupComplete: isSetupComplete(),
    version: 1,
  });
}
