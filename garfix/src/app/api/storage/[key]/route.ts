/**
 * GET /api/storage/[key] — Serve a stored file (logos, etc.).
 * Files are stored via lib/storage.ts (E-17).
 *
 * Wrapped in `withErrorHandler` (GLM P0.3 fix) so any unexpected throw from
 * `readAsBuffer` produces the standard `{ error }` JSON shape instead of an
 * unhandled 500 with stack trace leakage. Existing 400/404 paths are preserved
 * as-is — they are intentional, validated responses, not errors.
 */
import { NextRequest, NextResponse } from "next/server";
import { readAsBuffer } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api";
import { resolveAuth } from "@/lib/auth";

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

type RouteParams = { params: Promise<{ key: string }> };

export const GET = withErrorHandler<[NextRequest, RouteParams]>(
  // GATE3 IDOR FIX: previously this route served files with no auth at all.
  // Storage keys are random UUIDs (128 bits of entropy), so guess-attacks
  // are infeasible, but the route still leaked files to anyone who held a
  // link. We now require an authenticated session — browsers automatically
  // send the auth cookie on `<img src="/api/storage/...">` requests, so this
  // does not break legitimate image rendering inside the app. Public/landing
  // assets should use a separate public-bucket path (TODO: signed URLs).
  async (req, { params }) => {
    const authResult = await resolveAuth(req);
    if (!authResult.ok || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { key } = await params;
    // Sanitize — only allow alphanumeric + dash + dot (UUIDs + extension)
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(key)) {
      return NextResponse.json({ error: "Invalid file key" }, { status: 400 });
    }
    const buffer = await readAsBuffer(key);
    if (!buffer) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const ext = key.split(".").pop()?.toLowerCase() || "bin";
    const mime = MIME_MAP[ext] || "application/octet-stream";
    logger.debug("[storage] serving file", { key, mime, size: buffer.length });
    return new NextResponse(new Uint8Array(buffer) as BodyInit, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=3600",
        "Content-Length": buffer.length.toString(),
      },
    });
  },
);
