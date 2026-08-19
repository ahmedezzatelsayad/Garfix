import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/Providers";

// FONT FIX: Use next/font/google when building on Vercel/CI (has internet
// access to fonts.gstatic.com). Fall back to a CSS-only variable when
// building offline (local dev without internet). The font-family is still
// applied via globals.css + Tailwind config (font-cairo class).
//
// To enable the Google Font: set env var GARFIX_USE_GOOGLE_FONT=1 at build
// time. Otherwise we skip next/font optimization entirely.
const cairo =
  process.env.GARFIX_USE_GOOGLE_FONT === "1"
    ? (() => {
        // Dynamic import not supported in layout — use require
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { Cairo } = require("next/font/google");
          return Cairo({
            variable: "--font-cairo",
            subsets: ["arabic", "latin"],
            weight: ["300", "400", "500", "600", "700", "800", "900"],
            display: "swap",
          });
        } catch {
          return { variable: "--font-cairo", className: "" };
        }
      })()
    : { variable: "--font-cairo", className: "" };

export const metadata: Metadata = {
  metadataBase: new URL("https://garfix.app"),
  title: {
    default: "GarfiX EOS — AI-Native Business Platform",
    template: "%s · GarfiX EOS",
  },
  description: "Modular Enterprise Monolith with 16-Stage AI Cascade Pipeline. Accounting, HR, E-Invoicing, and more.",
  keywords: ["GarfiX", "Next.js", "TypeScript", "Tailwind CSS", "shadcn/ui", "AI", "accounting", "HR", "e-invoicing"],
  authors: [{ name: "GarfiX Team" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "GarfiX EOS",
    description: "AI-Native Business Platform — Modular Enterprise Monolith",
    url: "https://garfix.app",
    siteName: "GarfiX",
    type: "website",
    locale: "ar_SA",
  },
  twitter: {
    card: "summary_large_image",
    title: "GarfiX EOS",
    description: "AI-Native Business Platform",
  },
  alternates: {
    canonical: "/",
  },
};

/**
 * Inline theme-init script — runs BEFORE React hydration so the .dark class
 * is on <html> on the very first paint. Prevents the light-mode flash that
 * dark-mode-preferring users would otherwise see for one frame.
 *
 * Reads from localStorage("garfix:theme") — the same key next-themes is
 * configured to use in Providers.tsx (storageKey="garfix:theme"). If no
 * preference is stored, falls back to the OS preference via
 * prefers-color-scheme.
 *
 * `suppressHydrationWarning` on <html> is required because this script
 * mutates the className before React renders, causing a hydration mismatch
 * that React would otherwise warn about.
 */
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('garfix:theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark' || theme === 'system' && prefersDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    // localStorage may be unavailable (private mode, etc.) — fall back to light.
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Phase 9 P2 fix: read CSP nonce from middleware response headers.
  // Passed to the inline themeInitScript so it satisfies the nonce-based CSP.
  const headersList = await headers();
  const nonce = headersList.get("x-csp-nonce") ?? undefined;

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Phase 2 P1 fix: re-added themeInitScript to prevent FOUC (flash of
            unstyled content) when enableSystem=true. The script runs BEFORE
            React hydration, reading localStorage + OS preference and setting
            the `dark` class on <html>. suppressHydrationWarning on <html>
            (line 86) absorbs the className mismatch — standard next-themes
            pattern. The original "hydration race condition" was actually
            caused by the old html:not([data-theme]) { visibility: hidden }
            CSS rule (now removed), NOT by this script. */}
        {/* Phase 9 P2 fix: pass nonce to satisfy nonce-based CSP in production. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${cairo.variable} font-cairo antialiased bg-mutedackgroundackground text-foreground`}
        style={{ fontFamily: "'Cairo', sans-serif" }}
      >
        {/* Providers is a client component ("use client" directive). SSRs normally
            and hydrates on the client. (Phase 17 P3: was incorrectly documented as dynamic/ssr:false.)
            their own self-contained forms that don't need these providers. */}
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
