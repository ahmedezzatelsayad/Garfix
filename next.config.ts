import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
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
