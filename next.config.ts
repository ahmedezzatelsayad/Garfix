import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// ── Build-time metadata ────────────────────────────────────────────────────
//   Injected into the bundle so /api/health can report which commit is live.
//   COMMIT_SHA is preferred from env (CI sets it explicitly); falls back to
//   `git rev-parse HEAD` for local builds.
let commitSha = process.env.COMMIT_SHA || "";
if (!commitSha) {
  try {
    commitSha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    commitSha = "unknown";
  }
}
const buildTime = new Date().toISOString();

const nextConfig: NextConfig = {
  // NOTE: "standalone" output removed for platform compatibility.
  // chat.z.ai publish flow expects standard `next build` + `next start`,
  // which auto-loads `.env` and respects the PORT env var.
  // Docker self-hosting still works via `next start` (no standalone server needed).
  reactStrictMode: false,
  // Expose build metadata to both server and client runtime.
  env: {
    COMMIT_SHA: commitSha,
    BUILD_TIME: buildTime,
    APP_VERSION: "12.1.0",
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@prisma/client',
    ],
  },
  turbopack: { root: __dirname },
};

export default nextConfig;
