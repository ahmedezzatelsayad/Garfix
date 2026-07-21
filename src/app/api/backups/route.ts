/**
 * /api/backups
 * GET  — list existing backups
 * POST — trigger a new backup (founder only)
 *
 * RUNTIME: Node.js only — imports backup.ts which uses node:fs/promises
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import { runBackup, listBackups } from "@/lib/backup";
import { logger } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFounderEmail(result.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }
  const backups = await listBackups();
  return NextResponse.json({ backups });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFounderEmail(result.user.email)) {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }
  logger.info("[backups] manual backup triggered", { user: result.user.email });
  const backup = await runBackup("manual");
  if (!backup.ok) {
    return NextResponse.json({ error: backup.error || "Backup failed" }, { status: 500 });
  }
  return NextResponse.json({ ...backup });
});
