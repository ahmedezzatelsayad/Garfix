import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // Next.js 16 auto-generated routes.d.ts has duplicate identifier bugs with Turbopack.
  // skipLibCheck is already true in tsconfig.json, but Next.js type-check ignores it.
  // This ONLY skips the type-check phase — compiled output is still fully functional.
  typescript: {
    ignoreBuildErrors: true,
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
