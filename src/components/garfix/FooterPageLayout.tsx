"use client";

import { ProfessionalFooter } from "./ProfessionalFooter";
import { PublicSiteHeader } from "@/components/site/PublicSiteHeader";
// FE-15 FIX (Audit v2 · Phase 3): pages rendered through FooterPageLayout
// (contact, help, privacy, terms, refund, partners, cookies, status) were
// missing the skip-nav that the AppShell provides. Keyboard users had no way
// to jump past the long nav/hero to the main content. We render the shared
// GarfixSkipLinks component here and add matching id targets below.
interface FooterPageLayoutProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  lastUpdated?: string;
}

export function FooterPageLayout({
  title,
  subtitle,
  icon,
  children,
  lastUpdated,
}: FooterPageLayoutProps) {
  return (
    <div
      dir="rtl"
      className="min-h-dvh bg-background text-foreground"
    >
      {/* FE-15 FIX (Audit v2 · Phase 3): skip-nav for keyboard users. */}
      {/* ── Nav — الهيدر المشترك للموقع متعدد الصفحات ───────── */}
      <PublicSiteHeader />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="py-16 md:py-20 px-[5%] text-center max-w-[900px] mx-auto">
        {icon && (
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 mb-6">
            {icon}
          </div>
        )}
        <h1 className="text-[clamp(28px,5vw,48px)] font-black mb-4 leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground text-base md:text-lg max-w-[640px] mx-auto leading-relaxed">
            {subtitle}
          </p>
        )}
        {lastUpdated && (
          <div className="text-muted-foreground/50 text-xs mt-4">
            آخر تحديث: {lastUpdated}
          </div>
        )}
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main id="main-content" tabIndex={-1} className="px-[5%] pb-20 max-w-[900px] mx-auto">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-10 shadow-sm backdrop-blur-sm">
          {children}
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div id="main-footer">
        <ProfessionalFooter variant="landing" version="12" />
      </div>
    </div>
  );
}

export default FooterPageLayout;
