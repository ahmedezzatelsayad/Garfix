/**
 * /api/platform-admin/integrations/test
 * POST — test connection for a specific integration provider
 *
 * Validates credentials by calling the provider's testConnection() method.
 * Returns health status, details, and timestamp.
 *
 * Security: Founder-only endpoint (via requireFounder).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/middleware";
import { getProvider } from "@/lib/integrations/registry";
import "@/lib/integrations"; // side-effect: registers providers

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireFounder(req);
    if (authResult instanceof NextResponse) return authResult;

    const body = await req.json();
    const { type } = body;

    if (!type || typeof type !== "string") {
      return NextResponse.json(
        { error: "Integration type is required" },
        { status: 400 }
      );
    }

    // Get provider instance
    const provider = getProvider(type);

    if (!provider) {
      return NextResponse.json(
        { error: `Unknown integration type: ${type}` },
        { status: 404 }
      );
    }

    // Run test connection
    const result = await provider.testConnection();

    return NextResponse.json({
      success: result.ok,
      data: {
        healthy: result.ok,
        details: result.details || (result.ok ? "Connection successful" : "Connection failed"),
        testedAt: new Date().toISOString(),
      },
      error: result.error ? result.error : undefined,
    });
  } catch (error) {
    console.error("Integration test error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { error: "Failed to test integration", details: message },
      { status: 500 }
    );
  }
}
