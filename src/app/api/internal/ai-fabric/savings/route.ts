import { NextResponse } from "next/server";

// Phase 4 P2 fix: this route was moved to /api/founder-panel/internal/ai-fabric/savings
// to be consistent with sibling founder routes. The old path is kept as a
// permanent redirect for backward compatibility.
export const GET = () => NextResponse.redirect(
  new URL("/api/founder-panel/internal/ai-fabric/savings", "http://localhost:3000"),
  308
);
