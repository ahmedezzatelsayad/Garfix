/**
 * GET /api/docs — OpenAPI 3.1 specification endpoint.
 *
 * Returns the full GarfiX API specification as JSON.
 * Serves as the foundation for Swagger UI, SDK generation,
 * and contract testing.
 *
 * Public endpoint — no auth required (spec is not sensitive).
 */
import { NextResponse } from "next/server";
import spec from "@/lib/openapi/openapi.json";

export const GET = async () => {
  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "X-API-Version": spec.info.version,
    },
  });
};
