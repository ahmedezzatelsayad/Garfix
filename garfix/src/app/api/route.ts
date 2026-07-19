/**
 * GET /api — API root with health/info.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "GARFIX EOS API",
    version: "12.0.0",
    status: "ok",
    timestamp: new Date().toISOString(),
    docs: "/api/docs",
  });
}
