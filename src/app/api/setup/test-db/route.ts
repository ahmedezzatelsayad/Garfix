/**
 * POST /api/setup/test-db
 * Body: { host, port, database, user, password, ssl? }
 *
 * Tests the database connection with the provided credentials by running
 * a trivial `SELECT 1` query via a fresh PrismaClient.
 *
 * Returns:
 *   200 { ok: true, serverVersion, database, currentuser }
 *   400 { ok: false, error: "<human-readable message>" }
 *   410 if setup is already complete
 */

import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import {
  isSetupComplete,
  setupAlreadyCompleteResponse,
  buildDatabaseUrl,
  appendPoolParams,
} from "@/lib/setup/setup-config";

export const runtime = "nodejs";
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
    url?: string; // alternative: accept full URL
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept either a full URL or individual fields
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

  datasourceUrl = appendPoolParams(datasourceUrl, 2);

  let prisma: PrismaClient | null = null;
  try {
    prisma = new PrismaClient({
      datasourceUrl,
      log: ["error"],
    });

    // Test the connection by running a trivial query + extracting metadata
    const result = await prisma.$queryRaw<
      Array<{ server_version: string; current_database: string; current_user: string }>
    >`SELECT version() AS server_version, current_database() AS current_database, current_user AS current_user`;

    const row = result[0];
    return Response.json({
      ok: true,
      serverVersion: row?.server_version || "unknown",
      database: row?.current_database || "unknown",
      currentUser: row?.current_user || "unknown",
    });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    let humanMessage: string;
    switch (e?.code) {
      case "P1001":
        humanMessage = `Cannot reach database server at ${body.host || "host"}:${body.port || 5432}. Check the host, port, and firewall rules.`;
        break;
      case "P1000":
        humanMessage = `Authentication failed for user "${body.user}". Check the username and password.`;
        break;
      case "P1003":
        humanMessage = `Database "${body.database}" does not exist on the server. Create it first or pick a different name.`;
        break;
      case "P1008":
        humanMessage = "Connection timed out. The database server may be behind a firewall or slow to respond.";
        break;
      default:
        humanMessage = e?.message || "Unknown database connection error";
    }
    return Response.json({ ok: false, error: humanMessage, code: e?.code }, { status: 400 });
  } finally {
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch {
        // swallow disconnect errors
      }
    }
  }
}
