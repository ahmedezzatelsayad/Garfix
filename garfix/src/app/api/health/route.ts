/**
 * GET /api/health
 *
 * Lightweight health-check endpoint for load balancers / container orchestrators.
 *
 * P0.2 fix (Remaining Work Handoff): the GLM handoff's P0.2 asked to
 * reconcile the version string across `package.json`, `/api/route.ts`, and
 * `/api/health/route.ts`. The third file did not exist in the v13 zip.
 * A prior session mentioned an "HTTP 500 healthcheck deployment failure" —
 * if a load balancer or container orchestrator points a healthcheck at
 * `/api/health`, the missing route would explain that failure (Next.js
 * returns 404 by default, which most healthcheck configs treat as unhealthy
 * and may translate to a 500 at the LB layer).
 *
 * Grep results (run from project root):
 *   - Caddyfile: no `/api/health` reference (just reverse-proxies to :3000)
 *   - package.json scripts: no `healthcheck` script
 *   - No docker-compose.yml / Dockerfile in the repo
 *   - No `*.yml` / `*.yaml` references
 *
 * Conclusion: nothing in the repo references `/api/health`, but external
 * infrastructure (Replit deployment healthcheck, future Docker HEALTHCHECK,
 * future Kubernetes livenessProbe) may. Restoring the route as
 * defense-in-depth costs nothing and prevents a future 500-on-deploy
 * regression. The route is intentionally:
 *   - Unauthenticated (healthchecks must succeed without cookies)
 *   - Fast (single DB ping with 1s timeout, no joins)
 *   - Returns 503 on DB failure (not 500, so LBs can distinguish)
 *
 * Note: this route does NOT call `startupCheck.ts`'s `process.exit(1)` path
 * (ISS-01 from the prior security audit). The startup check runs at boot
 * time and exits the process if env vars are missing — that happens BEFORE
 * Next.js starts serving, so this route is only reachable after a
 * successful boot. The two mechanisms are complementary, not overlapping.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const VERSION = "12.0.0"; // keep in sync with package.json + /api/route.ts

export const dynamic = "force-dynamic"; // never cache healthchecks

export async function GET() {
  const started = Date.now();
  let dbOk = true;
  let dbError: string | undefined;

  try {
    // 1-second timeout — if the DB is hung, the healthcheck should fail fast
    // rather than queue up behind every other request.
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DB ping timed out after 1000ms")), 1000),
      ),
    ]);
  } catch (err) {
    dbOk = false;
    dbError = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - started;

  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      version: VERSION,
      uptime: process.uptime ? Math.round(process.uptime()) : null,
      db: { ok: dbOk, error: dbError, latencyMs },
      timestamp: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 },
  );
}
