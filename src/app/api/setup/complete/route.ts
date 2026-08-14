/**
 * POST /api/setup/complete
 * Body: { founderEmail: string }
 *
 * Final step of the setup wizard:
 *   1. Writes the .setup-complete marker file
 *   2. Sets SETUP_COMPLETE=true in .env (so the app picks it up on next boot)
 *   3. Best-effort deletes the /setup page + /api/setup/* route files from
 *      the filesystem so they can't be reused to reinstall the app.
 *      In Docker deployments (read-only filesystem) this is a no-op and
 *      the marker file alone is the security boundary.
 *
 * Returns 200 on success. After this, the middleware will redirect /setup
 * → / and /api/setup/* will return 410.
 */

import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  isSetupComplete,
  setupAlreadyCompleteResponse,
  markSetupComplete,
  upsertEnvKey,
} from "@/lib/setup/setup-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  if (isSetupComplete()) return setupAlreadyCompleteResponse();

  let body: { founderEmail?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const founderEmail = (body.founderEmail || "").trim().toLowerCase();

  // 1. Write marker file
  try {
    markSetupComplete(founderEmail);
  } catch (err) {
    return Response.json(
      { ok: false, error: `Failed to write setup-complete marker: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // 2. Set SETUP_COMPLETE=true in .env
  try {
    upsertEnvKey("SETUP_COMPLETE", "true");
  } catch (err) {
    // non-fatal — marker file alone is sufficient
    console.warn("[setup] Failed to write SETUP_COMPLETE to .env:", (err as Error).message);
  }

  // 3. Best-effort delete the /setup page + /api/setup/* routes
  //    In Docker (read-only FS) this fails silently — the marker file is
  //    the security boundary in that case.
  const deletedFiles: string[] = [];
  const failedFiles: string[] = [];

  const filesToDelete = [
    "src/app/setup/page.tsx",
    // Don't delete the API route files themselves — we need /api/setup/complete
    // to finish responding first. The middleware + marker file makes the
    // API routes return 410 from the next request onward.
  ];

  for (const rel of filesToDelete) {
    const abs = path.join(process.cwd(), rel);
    try {
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
        deletedFiles.push(rel);
      }
    } catch {
      failedFiles.push(rel);
    }
  }

  // Also try to delete this very route file (best-effort, after response is sent)
  // We use a setTimeout to ensure the response is sent first.
  setTimeout(() => {
    const routeFiles = [
      "src/app/api/setup/test-db/route.ts",
      "src/app/api/setup/run-migrations/route.ts",
      "src/app/api/setup/create-founder/route.ts",
      "src/app/api/setup/save-integrations/route.ts",
      "src/app/api/setup/complete/route.ts",
      "src/app/api/setup/status/route.ts",
    ];
    for (const rel of routeFiles) {
      try {
        const abs = path.join(process.cwd(), rel);
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch {
        // ignore — marker file is the real security boundary
      }
    }
  }, 1000);

  return Response.json({
    ok: true,
    message: "Setup complete. The installer has been disabled.",
    deleted: deletedFiles,
    failedToDelete: failedFiles,
    nextStep: "Log in with your founder email and password at /login",
  });
}
