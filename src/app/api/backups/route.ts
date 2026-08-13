/**
 * /api/backups
 * GET  — list existing backups
 * POST — trigger a new backup (founder only)
 *
 * RUNTIME: Node.js only — uses dynamic import for backup.ts
 * which uses node:fs/promises and node:path.
 *
 * Dynamic import prevents Next.js from tracing node:fs/path
 * through the Edge Runtime during build.
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/middleware";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  const { listBackups } = await import("@/lib/backup");
  const backups = await listBackups();
  return NextResponse.json({ backups });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // P5-H2: Rate limit POST /api/backups — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "post:backups", LIMITS.API_WRITE);
  if (rl) return rl;

  const founderAccess = await requireFounder(req);
  if (founderAccess instanceof NextResponse) return founderAccess;
  logger.info("[backups] manual backup triggered", { user: founderAccess.user.email });
  const { runBackup } = await import("@/lib/backup");
  const backup = await runBackup("manual");
  if (!backup.ok) {
    return NextResponse.json({ error: backup.error || "Backup failed" }, { status: 500 });
  }
  return NextResponse.json({ ...backup });
});
