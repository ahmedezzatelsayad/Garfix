import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// TPD-14 FIX (Audit v2 · Phase 3): Bundle size budget + analyzer.
// ────────────────────────────────────────────────────────────────────────────
// Next.js does not ship a built-in size-budget enforcer, but we can:
//   1. Conditionally enable `@next/bundle-analyzer` when ANALYZE=true so
//      `bun run analyze` produces a per-chunk treemap (commit-by-commit
//      regression hunting). The wrapper is applied at the bottom of this
//      file via `withBundleAnalyzer(nextConfig)`.
//   2. Document the size budgets that gate a merge — enforced by the
//      `scripts/bundle-analysis.mjs` post-build step (runs in CI).
//
// BUDGETS (First-Load JS, gzipped, per route):
//   /                       (AppShell dashboard)   220 kB   — heaviest route
//   /invoices, /clients     (table views)          180 kB
//   /settings, /account     (form views)           150 kB
//   /login, /signup         (auth)                  90 kB
//   /api-docs               (standalone)           140 kB
//   Per-route budget overage of >10% fails CI (scripts/bundle-analysis.mjs).
//
// RATIONALE: ERP users on Gulf mobile networks (often 3G/4G with high RTT)
// are extremely sensitive to first-load JS — a 50 kB regression adds ~1.5s
// of blocking time on a 200 ms RTT connection. The budgets above are
// calibrated from the v12.1 baseline + 15% headroom.
// ────────────────────────────────────────────────────────────────────────────
let withBundleAnalyzer:
  | ((cfg: NextConfig) => NextConfig)
  | undefined = undefined;
if (process.env.ANALYZE === "true") {
  try {
    // Lazy require so the dep isn't pulled into every CI run / production build.
    // @next/bundle-analyzer is a devDependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analyzer = require("@next/bundle-analyzer");
    withBundleAnalyzer = analyzer({ enabled: true });
  } catch {
    // @next/bundle-analyzer not installed (production Docker build) — skip.
  }
}

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
  // Enable standalone output for Docker/AWS deployments.
  // Vercel has its own build flow (detected via VERCEL env var).
  ...(process.env.VERCEL !== "1" ? { output: "standalone" as const } : {}),
  reactStrictMode: true,
  images: { remotePatterns: [] }, // Phase 6 P3: explicit empty — no remote image optimization
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
    "exceljs",  // Phase 6 P3: externalize to reduce bundle
    // PERF FIX: BullMQ is dynamically imported (await import("bullmq")) in
    // src/lib/queues.ts. Webpack's static analysis traces the entire bullmq
    // package, including dist/esm/classes/valkey-glide-client.js which tries
    // to import "@valkey/valkey-glide" (an OPTIONAL peer dep we don't ship).
    // That produced a build warning:
    //   Module not found: Can't resolve '@valkey/valkey-glide' in
    //   '.../node_modules/bullmq/dist/esm/classes'
    // Marking bullmq as external makes Next.js load it from node_modules at
    // runtime, skipping the webpack trace entirely. BullMQ is server-only
    // (no client code imports it), so this is safe.
    "bullmq",
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
      // VERCEL FIX: removed @prisma/client — it's a server-only package
      // and optimizePackageImports conflicts with Prisma engine bundling.
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
  // VERCEL FIX: explicitly disable Turbopack for production builds.
  // Next.js 16 uses Turbopack by default for `next build`, but Turbopack's
  // client runtime doesn't initialize properly on Vercel — the page gets
  // stuck on "Loading…" because React hydration never starts.
  // Setting turbopack to an empty object + using the --no-turbopack flag
  // in the build script forces webpack (stable, battle-tested on Vercel).
  // turbopack: { root: __dirname },
  // VERCEL FIX: include Prisma engine binary in serverless function output.
  // Without this, Vercel strips node_modules/.prisma/ from the deployment
  // causing "Prisma Client could not locate the Query Engine" at runtime.
  outputFileTracingIncludes: {
    "/": ["./node_modules/.prisma/client/**/*", "./node_modules/@prisma/client/**/*"],
  },
  // Type checking is enabled by default (Next.js default behavior).
};

// TPD-14 FIX (Audit v2 · Phase 3): apply the bundle-analyzer wrapper when
// ANALYZE=true so `bun run analyze` produces the treemap reports.
export default withBundleAnalyzer ? withBundleAnalyzer(nextConfig) : nextConfig;
