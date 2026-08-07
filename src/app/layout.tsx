import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import dynamic from "next/dynamic";

// VERCEL FIX: load Providers dynamically with ssr:false to prevent
// hydration issues. ThemeProvider/AuthProvider/QueryClientProvider
// mutate the DOM on mount which causes hydration mismatches on Vercel.
const Providers = dynamic(() => import("@/components/Providers").then(m => ({ default: m.Providers })), {
  ssr: false,
  loading: () => null,
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* VERCEL FIX: removed themeInitScript — it was causing hydration
            race conditions on Vercel. next-themes handles theme init on
            the client side via the ThemeProvider in Providers.tsx. */}
      </head>
      <body
        className={`${cairo.variable} font-cairo antialiased bg-background text-foreground`}
        style={{ fontFamily: "'Cairo', sans-serif" }}
      >
        {/* VERCEL FIX: Providers loaded as dynamic import with ssr:false
            to prevent hydration issues. The login/landing pages render
            their own self-contained forms that don't need these providers. */}
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
