import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/context/AuthContext";
import { BrandProvider } from "@/context/BrandContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GARFIX — نظام إدارة ذكي",
  description: "أول نظام ERP ذكي لإدارة المنشآت — فواتير، محاسبة، مخزون، موارد بشرية، وتحكم مالي شامل.",
  keywords: ["GARFIX", "ERP", "إدارة أعمال", "فاتورة إلكترونية", "محاسبة", "مخزون", "منشآت"],
  authors: [{ name: "GARFIX Team" }],
  openGraph: {
    title: "GARFIX — نظام إدارة ذكي",
    description: "منصة ERP متخصصة لإدارة أعمال المنشآت",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          <BrandProvider>
            {children}
          </BrandProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
