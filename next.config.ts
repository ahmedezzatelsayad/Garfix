import type { NextConfig } from "next";

// P1-2: ignoreBuildErrors is required because Next.js 16 + Turbopack
// generates routes.d.ts with duplicate-identifier bugs that tsc --noEmit
// (skipLibCheck=true) doesn't catch. The canonical type-check gate runs
// in CI via `bunx tsc --noEmit` (see .github/workflows/ci.yml and
// production-verification.yml). ESLint is enforced separately in CI.
// Removing this flag will break `next build` until upstream fixes the
// routes.d.ts duplicate-identifier issue.
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  typescript: {
    // Build-time type check is skipped — CI runs `bunx tsc --noEmit` separately.
    ignoreBuildErrors: true,
  },
  // NOTE: `eslint: { ignoreDuringBuilds: true }` is NOT included because the
  // NextConfig type doesn't accept it in Next 16 (TS2353). CI runs ESLint
  // separately via `bunx eslint src/app src/lib src/modules`.
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
