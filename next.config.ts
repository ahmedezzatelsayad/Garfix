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
  // Mark heavy Node-only packages as external so they're loaded from
  // node_modules at runtime instead of bundled. This reduces the serverless
  // function size dramatically and avoids Edge Runtime tracing warnings.
  serverExternalPackages: [
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/exporter-metrics-otlp-http",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/sdk-metrics",
    "pg-boss",
    "ioredis",
    "jsonwebtoken",
    "bcryptjs",
  ],
  experimental: {
    // P3.7 (Cycle 5): added all 26 @radix-ui/react-* packages actually
    // imported by src/components/ui/*. Each `import * as X from
    // "@radix-ui/react-Y"` was previously pulling the entire package into
    // the client bundle even when only one component was used. Next.js's
    // optimizer tree-shakes these barrel imports, reducing first-load JS
    // for every page that uses any Radix UI component.
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@prisma/client',
      'date-fns',
      'framer-motion',
      // REMOVED (unused): 'react-syntax-highlighter' — not imported anywhere in src/
      // REMOVED (unused): '@mdxeditor/editor' — not imported anywhere in src/
      // These were inflating the config and misleading contributors.
      // Radix UI primitives (curated list of packages actually imported):
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
    ],
  },
  // turbopack disabled temporarily - use webpack for compatibility
  // turbopack: { root: __dirname },
  // Type checking is enabled by default (Next.js default behavior).
  // If new type errors are introduced, `next build` will fail loudly instead
  // of silently shipping broken types to production.
};

export default nextConfig;
