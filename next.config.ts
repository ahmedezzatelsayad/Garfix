import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: "standalone" output removed for platform compatibility.
  // chat.z.ai publish flow expects standard `next build` + `next start`,
  // which auto-loads `.env` and respects the PORT env var.
  // Docker self-hosting still works via `next start` (no standalone server needed).
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
