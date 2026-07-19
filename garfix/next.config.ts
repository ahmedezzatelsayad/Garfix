import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow agent-browser (Chromium) to load dev resources from 127.0.0.1
  // without Next.js blocking them as cross-origin in dev mode.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // CODE-001 FIX: Don't ignore TypeScript build errors in production
  typescript: {
    ignoreBuildErrors: false,
  },
  // SEC-007 FIX: Enable React Strict Mode
  reactStrictMode: true,
  // SEC-009 FIX: Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
