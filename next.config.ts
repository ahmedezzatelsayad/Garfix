import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  typescript: {
    // Build errors are now properly handled — no need to ignore them.
    // ROADMAP P2.2 complete: TypeScript errors properly block build.
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
