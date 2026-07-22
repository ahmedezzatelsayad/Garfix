/**
 * GET /api/auth/csrf
 * Returns the current CSRF token value (read from cookie) for the client
 * to echo in the X-CSRF-Token header on mutating requests.
 *
 * This endpoint is a safe GET — it does NOT require a CSRF header itself
 * (since GET is exempt from CSRF enforcement in the edge middleware).
 * If the cookie is missing (e.g. first request after login), it generates
 * and sets a new one.
 *
 * SEC-010: CSRF double-submit pattern support endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { CSRF_COOKIE, generateCsrfToken, CSRF_COOKIE_OPTS } from "@/lib/cookies";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Must be authenticated
  const authResult = await resolveAuth(req);
  if (!authResult.ok || !authResult.user) {
    return NextResponse.json(
      { error: authResult.error || "Unauthorized" },
      { status: authResult.status || 401 },
    );
  }

  // Read existing CSRF cookie, or generate a new one if missing
  const existingToken = req.cookies.get(CSRF_COOKIE)?.value;
  const token = existingToken || generateCsrfToken();

  const response = NextResponse.json({ csrfToken: token });

  // Set the cookie if we generated a new one
  if (!existingToken) {
    response.cookies.set(CSRF_COOKIE, token, CSRF_COOKIE_OPTS);
  }

  return response;
}
