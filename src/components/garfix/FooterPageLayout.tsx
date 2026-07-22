"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProfessionalFooter } from "./ProfessionalFooter";

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
      className="min-h-dvh bg-[linear-gradient(180deg,#0f0a1e_0%,#1a1035_35%,#12082e_70%,#0f0a1e_100%)] text-white"
    >
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="py-5 px-[5%] flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="w-11 h-11 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center text-[22px] font-black text-white shadow-[0_8px_24px_rgba(124,58,237,0.4)]">
            G
          </div>
          <div>
            <div className="text-xl font-black tracking-wider text-white">GARFIX</div>
            <div className="text-[10px] text-white/50 tracking-[2px]">EOS v1.5.1</div>
          </div>
        </Link>
        <Link
          href="/"
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm no-underline transition-colors"
        >
          <ArrowRight size={16} />
          العودة للرئيسية
        </Link>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="py-16 md:py-20 px-[5%] text-center max-w-[900px] mx-auto">
        {icon && (
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[rgba(124,58,237,0.15)] border border-[rgba(124,58,237,0.3)] text-[#c4b5fd] mb-6">
            {icon}
          </div>
        )}
        <h1 className="text-[clamp(28px,5vw,48px)] font-black mb-4 leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-white/60 text-base md:text-lg max-w-[640px] mx-auto leading-relaxed">
            {subtitle}
          </p>
        )}
        {lastUpdated && (
          <div className="text-white/30 text-xs mt-4">
            آخر تحديث: {lastUpdated}
          </div>
        )}
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main className="px-[5%] pb-20 max-w-[900px] mx-auto">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 md:p-10">
          {children}
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <ProfessionalFooter variant="landing" version="12" />
    </div>
  );
}

export default FooterPageLayout;
