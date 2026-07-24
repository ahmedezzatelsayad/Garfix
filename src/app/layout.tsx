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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
