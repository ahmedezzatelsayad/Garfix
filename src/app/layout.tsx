import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GarfiX EOS — AI-Native Business Platform",
  description: "Modular Enterprise Monolith with 16-Stage AI Cascade Pipeline. Accounting, HR, E-Invoicing, and more.",
  keywords: ["GarfiX", "Next.js", "TypeScript", "Tailwind CSS", "shadcn/ui", "AI", "accounting", "HR", "e-invoicing"],
  authors: [{ name: "GarfiX Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "GarfiX EOS",
    description: "AI-Native Business Platform — Modular Enterprise Monolith",
    url: "https://garfix.app",
    siteName: "GarfiX",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GarfiX EOS",
    description: "AI-Native Business Platform",
  },
};

/**
 * Inline theme-init script — runs BEFORE React hydration so the .dark class
 * is on <html> on the very first paint. Prevents the light-mode flash that
 * dark-mode-preferring users would otherwise see for one frame.
 *
 * Reads from localStorage("garfix:theme"). If no preference is stored, falls
 * back to the OS preference via prefers-color-scheme.
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
    if (theme === 'dark') {
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
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
