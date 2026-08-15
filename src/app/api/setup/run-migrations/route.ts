/**
 * POST /api/setup/run-migrations
 * Body: { host, port, database, user, password, ssl? } | { url }
 *
 * 1. Builds DATABASE_URL from the request body
 * 2. Writes it to .env (so prisma CLI picks it up)
 * 3. Spawns `prisma migrate deploy` as a child process
 * 4. Returns the migration output
 *
 * This route runs BEFORE the founder account exists, so it does NOT use
 * the standard requireAuth middleware. It's guarded by isSetupComplete()
 * instead — once setup is complete, this route refuses to run.
 */

import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  isSetupComplete,
  setupAlreadyCompleteResponse,
  buildDatabaseUrl,
  appendPoolParams,
  upsertEnvKey,
} from "@/lib/setup/setup-config";

export const runtime = "nodejs";
export const maxDuration = 300; // migrations can take a while on first run
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  if (isSetupComplete()) return setupAlreadyCompleteResponse();

  let body: {
    host?: string;
    port?: string | number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean;
    url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let datasourceUrl: string;
  if (body.url) {
    datasourceUrl = body.url;
  } else if (body.host && body.database && body.user) {
    datasourceUrl = buildDatabaseUrl({
      host: body.host,
      port: body.port || 5432,
      database: body.database,
      user: body.user,
      password: body.password || "",
      ssl: body.ssl,
    });
  } else {
    return Response.json(
      { ok: false, error: "Missing required fields: host, database, user (or url)" },
      { status: 400 },
    );
  }

  // Write DATABASE_URL to .env (without pool params — those are added by the
  // Prisma client at runtime via appendPoolParams in db.ts). The prisma CLI
  // needs the bare URL for `migrate deploy`.
  try {
    upsertEnvKey("DATABASE_URL", datasourceUrl);
  } catch (err) {
    return Response.json(
      { ok: false, error: `Failed to write .env file: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // Also set it in the current process so the spawned child inherits it
  process.env.DATABASE_URL = appendPoolParams(datasourceUrl, 2);

  // Spawn `prisma migrate deploy` and stream its output
  const binPath = path.join(process.cwd(), "node_modules", ".bin", "prisma");
  const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");

  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        binPath,
        ["migrate", "deploy", "--schema", schemaPath],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });

      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code === 0) resolve(stdout + (stderr ? `\n[stderr]\n${stderr}` : ""));
        else reject(new Error(`prisma migrate deploy exited with code ${code}\n${stdout}\n${stderr}`));
      });
    });

    return Response.json({
      ok: true,
      output: output.toString(),
      databaseUrl: datasourceUrl.replace(/:[^:@/]+@/, ":****@"), // mask password
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: `Migration failed: ${(err as Error).message}`,
      },
      { status: 500 },
    );
  }
}
