import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

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
  // VERCEL FIX: Externalize Prisma for proper bundling
  serverExternalPackages: ["@prisma/client"],
  // SEC-009 FIX: Security headers
  // SEC-003 FIX: CSP policy — nonce-based in production, relaxed in development
  async headers() {
    // In production: strict CSP without unsafe-eval/unsafe-inline
    // In development: allow unsafe-eval/unsafe-inline for Next.js hot reload & Turbopack
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
      : "script-src 'self'";

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
          // LOW-001 FIX (Cycle 2): tighten CSP connect-src from `https:` (any
          // HTTPS endpoint) to an explicit allowlist of the AI providers and
          // webhook callbacks the app actually uses. Prevents exfiltration of
          // tokens / data to attacker-controlled HTTPS endpoints via XSS.
          // Add new providers here ONLY after explicit review.
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.paymob.com https://api.whatsapp.com https://graph.facebook.com; frame-ancestors 'none'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
