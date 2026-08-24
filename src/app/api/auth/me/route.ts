/**
 * GET /api/auth/me — Return the current user profile.
 *
 * NOTE: The token-refresh POST handler moved to `/api/auth/refresh/route.ts`
 * (bug fix: the frontend calls `POST /api/auth/refresh`, not `/api/auth/me`).
 *
 * SEC-M2 FIX (Cycle 1): pin to Node.js runtime — Prisma + JWT + (now) Valkey
 *   blacklist check inside resolveAuth.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import {
  resolveAuth,
  type SessionUser,
  buildUserProfile,
} from "@/lib/auth";
import { withErrorHandler, parseJsonField } from "@/lib/api";

// SEC-M2 FIX (Cycle 1): pin to Node.js runtime.
export const runtime = "nodejs";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the latest user from DB (in case permissions/companies changed).
  // P3.2 (Cycle 5): omit passwordHash — this route only reads identity fields
  // (uid, email, displayName, role, companies, permissions, emailVerified,
  // tokenVersion). Loading the bcrypt hash into memory on every /auth/me
  // call (which fires on every page load) was an unnecessary exposure.
  const dbUser = await db.appUser.findUnique({
    where: { uid: result.user.uid },
    omit: { passwordHash: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const sessionUser: SessionUser = {
    uid: dbUser.uid ?? "",
    email: dbUser.email,
    displayName: dbUser.displayName ?? "",
    role: dbUser.role,
    companies: parseJsonArray(dbUser.companies, []),
    permissions: parseJsonField<Record<string, number>>(dbUser.permissions, {}),
    emailVerified: dbUser.emailVerified,
    tokenVersion: dbUser.tokenVersion,
  };

  return NextResponse.json(await buildUserProfile(sessionUser));
});

// FRONTEND-REVIEW FIX (2026-08-24): this local copy diverged from the
// canonical parseJsonField in @/lib/api — it cast `as unknown as T`, could
// return a string[] where a Record was expected, didn't handle
// single-element corruption, and never logged. Now we use the canonical
// parser for object fields and a purpose-typed repair path ONLY for
// string[] fields (company slugs), which logs what it repaired.
function parseJsonArray(s: string | null, fallback: string[]): string[] {
  if (!s) return fallback;
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
    console.warn("[auth/me] companies field is valid JSON but not an array — using fallback", { preview: s.slice(0, 100) });
    return fallback;
  } catch {
    // P0 HARDENING: rows like [slug1,slug2] without quotes previously failed
    // silently → sessions with no companies → every screen opened the setup
    // wizard. Try to repair (split on commas) before giving up.
    const cleaned = s.replace(/^[\[\]]|[\[\]]$/g, "").trim();
    const parts = cleaned
      .split(",")
      .map((x) => x.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    if (parts.length > 0) {
      console.warn("[auth/me] repaired unquoted companies JSON", { count: parts.length });
      return parts;
    }
    console.warn("[auth/me] malformed companies JSON — using fallback", { preview: s.slice(0, 100) });
    return fallback;
  }
}
