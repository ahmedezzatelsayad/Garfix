/**
 * metrics-middleware.ts — API Route Metrics Wrapper
 *
 * Wraps Next.js API route handlers with automatic metrics collection
 * using the observability stack (observability.ts).
 *
 * Usage:
 *   import { withMetrics } from "@/lib/metrics-middleware";
 *   export const GET = withMetrics("/api/invoices", async (req) => { ... });
 */

import { NextRequest, NextResponse } from "next/server";
import { metrics, trackApiRequest } from "./observability";
import { logger } from "./logger";

type ApiHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse> | Promise<Response>;

/**
 * Wrap an API route handler with automatic metrics collection.
 *
 * Records:
 *   - Request latency histogram (api.latency)
 *   - Request counter (api.request)
 *   - Error counter (api.error) on 5xx responses
 *
 * @param route - Route identifier (e.g., "/api/invoices")
 * @param handler - The actual Next.js API route handler
 */
export function withMetrics(route: string, handler: ApiHandler): ApiHandler {
  return async (req: NextRequest, ctx?: any) => {
    const start = Date.now();
    const method = req.method || "GET";

    try {
      const response = await handler(req, ctx);
      const durationMs = Date.now() - start;
      const statusCode = response.status ?? 200;

      trackApiRequest(route, method, durationMs, statusCode);

      return response;
    } catch (error: unknown) {
      const durationMs = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);

      trackApiRequest(route, method, durationMs, 500);
      metrics.increment("api.error", { route, method, statusCode: "500" });

      logger.error("[metrics-middleware] Unhandled error in API handler", {
        route,
        method,
        durationMs,
        error: message,
      });

      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 },
      );
    }
  };
}
