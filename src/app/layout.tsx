import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/Providers";
// SEO: السعر في البيانات المنظمة من نفس مصدر الفوترة الفعلي — لا انحراف تسويقي
import { COUNTRY_PRICES, COUNTRY_CURRENCY } from "@/lib/billing/pricing";

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
    default: "جارفيكس | برنامج فواتير ومحاسبة إلكترونية بالذكاء الاصطناعي",
    template: "%s · جارفيكس GarfiX",
  },
  description:
    "منصة سحابية عربية لإدارة الفواتير الإلكترونية المعتمدة (ZATCA وETA) والمحاسبة والمخزون والموارد البشرية — مدعومة بالذكاء الاصطناعي. جرّب 30 يومًا مجانًا بدون بطاقة ائتمان.",
  keywords: [
    "فواتير إلكترونية", "برنامج محاسبة", "فاتورة ضريبية", "فاتورة إلكترونية ZATCA",
    "برنامج فواتير", "محاسبة", "إدارة مخزون", "برنامج موارد بشرية",
    "فوترة إلكترونية السعودية", "فاتورة", "GarfiX", "جارفيكس",
  ],
  authors: [{ name: "GarfiX جارفيكس" }],
  creator: "GarfiX",
  publisher: "GarfiX",
  applicationName: "GarfiX جارفيكس",
  category: "business software",
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
    title: "جارفيكس | فواتير ومحاسبة إلكترونية بالذكاء الاصطناعي",
    description:
      "فواتير إلكترونية معتمدة + محاسبة كاملة + مخزون + ذكاء اصطناعي يحوّل رسائل الطلبات إلى فواتير. مدعوم لأكثر من 20 دولة عربية.",
    url: "https://garfix.app",
    siteName: "GarFiX جارفيكس",
    type: "website",
    locale: "ar_SA",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "جارفيكس — منظومة أعمال كاملة: فواتير إلكترونية ومحاسبة ومخزون بالذكاء الاصطناعي",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "جارفيكس | فواتير ومحاسبة إلكترونية بالذكاء الاصطناعي",
    description: "منصة أعمال عربية متكاملة: فوترة إلكترونية معتمدة، محاسبة، مخزون، ومساعد ذكي ينفّذ أوامرك.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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

/**
 * SEO: بيانات منظمة JSON-LD — تُحقن في كل الصفحات (Organization + SoftwareApplication).
 * تساعد محركات البحث على فهم الكيان وعرض rich results (تقييم/سعر/روابط).
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://garfix.app/#organization",
      name: "GarFiX جارفيكس",
      url: "https://garfix.app",
      logo: "https://garfix.app/icons/icon-512.png",
      description: "منصة سحابية عربية للفواتير الإلكترونية والمحاسبة وإدارة الأعمال بالذكاء الاصطناعي",
      areaServed: ["SA", "KW", "AE", "EG", "QA", "BH", "OM", "JO", "MA"],
      knowsLanguage: ["ar", "en"],
      sameAs: [
        "https://x.com/garfix",
        "https://linkedin.com/company/garfix",
      ],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://garfix.app/#app",
      name: "GarFiX جارفيكس",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android (PWA), iOS (PWA)",
      url: "https://garfix.app",
      description: "برنامج فواتير إلكترونية ومحاسبة ومخزون وموارد بشرية بالذكاء الاصطناعي للشركات العربية",
      inLanguage: ["ar", "en"],
      offers: {
        "@type": "Offer",
        price: String(COUNTRY_PRICES.SA.starter),
        priceCurrency: COUNTRY_CURRENCY.SA,
        url: "https://garfix.app/pricing",
      },
      featureList: [
        "فواتير إلكترونية معتمدة ZATCA/ETA",
        "محاسبة مزدوجة كاملة",
        "إدارة مخزون متعدد المستودعات",
        "موارد بشرية ورواتب",
        "مساعد ذكاء اصطناعي تنفيذي",
      ],
    },
  ],
};

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
        {/* SEO: JSON-LD structured data (Organization + SoftwareApplication) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${cairo.variable} font-cairo antialiased bg-background text-foreground`}
        style={{ fontFamily: "'IBM Plex Sans Arabic', 'Cairo', sans-serif" }}
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
