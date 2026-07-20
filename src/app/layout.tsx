// M1 TODO: Convert inline styles to Tailwind classes across the codebase.
// This is a large visual refactor that could break UI — deferred until a
// dedicated refactor sprint. Key files: chart.tsx, sidebar.tsx, and various
// page components use `style={{}}` attributes that should be Tailwind utilities.
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Cairo, Tajawal } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { BrandProvider } from "@/context/BrandContext";
import { QueryProvider } from "@/components/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "GARFIX — منصة إدارة الأعمال المتكاملة",
  description: "GARFIX Enterprise Engineering Operating System v12 — منصة SaaS متكاملة لإدارة الفواتير والعملاء والموارد البشرية والمحاسبة",
  keywords: ["GARFIX", "ERP", "SaaS", "فواتير", "محاسبة", "موارد بشرية"],
  authors: [{ name: "GARFIX" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GARFIX",
  },
  icons: {
    icon: [{ url: "/manifest.json", sizes: "any" }],
  },
};

/**
 * Production Mobile Viewport — locks the layout to behave like a native app
 * on iOS Safari + Android Chrome:
 *  • width=device-width, initialScale=1 → no auto-zoom on load
 *  • maximumScale=1, userScalable=false → no pinch-zoom (native-app feel)
 *  • viewportFit=cover → render into the notch / home-indicator area
 *    so safe-area-inset-* env() values become usable in CSS
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7c3aed" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0a1e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} ${tajawal.variable} antialiased bg-background text-foreground overflow-x-hidden touch-manipulation`}
        style={{ fontFamily: "var(--font-cairo), var(--font-tajawal), var(--font-geist-sans), sans-serif" }}
      >
        <AuthProvider>
          <BrandProvider>
            <QueryProvider>
              {children}
              <Toaster />
              <SonnerToaster position="top-center" />
            </QueryProvider>
          </BrandProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
