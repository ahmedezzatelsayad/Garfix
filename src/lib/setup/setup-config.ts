/**
 * setup-config.ts — Shared helpers for the founder setup wizard.
 *
 * The setup wizard runs BEFORE the app is configured. It cannot rely on
 * DATABASE_URL being set, so it accepts DB credentials from the request
 * body and uses a fresh PrismaClient bound to the user-provided URL.
 *
 * The "is setup complete?" check uses a marker file (.setup-complete) on
 * the filesystem. This file is created by /api/setup/complete after the
 * founder finishes the wizard. Once present:
 *   - /setup redirects to / via middleware
 *   - /api/setup/* routes refuse to run (return 410 Gone)
 *
 * In Docker deployments the marker is written to /data/.setup-complete
 * (mounted as a persistent volume). Outside Docker it falls back to
 * process.cwd() + /.setup-complete.
 */

import fs from "node:fs";
import path from "node:path";

// Marker file location — try /data first (Docker volume), fallback to cwd
const DATA_DIR = fs.existsSync("/data") && fs.statSync("/data").isDirectory()
  ? "/data"
  : process.cwd();

export const SETUP_MARKER_PATH = path.join(DATA_DIR, ".setup-complete");
export const ENV_FILE_PATH = path.join(process.cwd(), ".env");

export function isSetupComplete(): boolean {
  // If env var explicitly says setup is complete, trust it (12-factor deploys)
  if (process.env.SETUP_COMPLETE === "true") return true;
  try {
    return fs.existsSync(SETUP_MARKER_PATH);
  } catch {
    return false;
  }
}

/**
 * Mark setup as complete by writing the marker file.
 * The marker contains a JSON blob with the founder email + timestamp
 * for forensic/audit purposes.
 */
export function markSetupComplete(founderEmail: string): void {
  const payload = {
    completedAt: new Date().toISOString(),
    founderEmail,
    version: 1,
  };
  fs.writeFileSync(SETUP_MARKER_PATH, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

/**
 * Read or parse a DATABASE_URL into pieces for the UI to display back.
 * Returns null if url is empty/invalid.
 */
export function parseDatabaseUrl(url: string): {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
} | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port || "5432",
      database: u.pathname.replace(/^\//, ""),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ssl: u.searchParams.get("sslmode") === "require" || u.searchParams.get("ssl") === "true",
    };
  } catch {
    return null;
  }
}

/**
 * Build a postgres connection URL from individual fields.
 */
export function buildDatabaseUrl(opts: {
  host: string;
  port: string | number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}): string {
  const pwd = encodeURIComponent(opts.password);
  const user = encodeURIComponent(opts.user);
  const sslParam = opts.ssl ? "?sslmode=require" : "";
  return `postgresql://${user}:${pwd}@${opts.host}:${opts.port}/${opts.database}${sslParam}`;
}

/**
 * Append Prisma pool-tuning params to a DATABASE_URL.
 * Keeps existing query params intact.
 */
export function appendPoolParams(url: string, poolSize = 10): string {
  if (url.includes("connection_limit=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=${poolSize}&pool_timeout=30&statement_timeout=30000&idle_timeout=30000`;
}

/**
 * Update .env file with a key=value pair.
 * - If the key exists, replace its value (preserves comments above it).
 * - If the key doesn't exist, append it at the end.
 * - Creates the file if it doesn't exist.
 *
 * Used by the setup wizard to write DATABASE_URL, OPENROUTER_API_KEY, etc.
 * without clobbering the rest of .env.
 */
export function upsertEnvKey(key: string, value: string): void {
  let content = "";
  try {
    content = fs.readFileSync(ENV_FILE_PATH, "utf8");
  } catch {
    content = "";
  }

  const lines = content.split("\n");
  let found = false;
  const escapedValue = value.includes(" ") || value.includes("#") ? `"${value}"` : value;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(new RegExp(`^\\s*${key}\\s*=`));
    if (match) {
      lines[i] = `${key}=${escapedValue}`;
      found = true;
      break;
    }
  }

  if (!found) {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push(`${key}=${escapedValue}`);
  }

  fs.writeFileSync(ENV_FILE_PATH, lines.join("\n"), { mode: 0o600 });
}

/**
 * Returns a JSON response with a 410 Gone status when setup is already complete.
 * Used as a guard at the top of every /api/setup/* route.
 */
export function setupAlreadyCompleteResponse() {
  return Response.json(
    {
      error: "Setup has already been completed. The installer is disabled.",
      code: "SETUP_COMPLETE",
    },
    { status: 410 },
  );
}
