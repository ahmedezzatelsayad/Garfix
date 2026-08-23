"use client";

// FE-04 FIX (Audit v2 · Phase 1) — text-white/40 → text-white/60 (WCAG AAA
// large-text contrast ≥4.5:1 on #0b1220 navy background).

import { useState } from "react";
import {
  Globe, Mail, Phone, ChevronUp,
  Shield, FileText, HelpCircle, Info, MessageCircle,
} from "lucide-react";

/* ── Footer Link Data ──────────────────────────────────────────────────── */

interface FooterLinkGroup {
  title: string;
  links: Array<{ label: string; href: string; icon?: React.ReactNode }>;
}

const FOOTER_LINKS: FooterLinkGroup[] = [
  {
    title: "المنصة",
    links: [
      { label: "من نحن", href: "/about", icon: <Info size={13} /> },
      { label: "المزايا", href: "/features", icon: <Shield size={13} /> },
      { label: "الأسعار والأسئلة الشائعة", href: "/pricing", icon: <FileText size={13} /> },
    ],
  },
  {
    title: "القانونية",
    links: [
      { label: "سياسة الخصوصية", href: "/privacy", icon: <Shield size={13} /> },
      { label: "الشروط والأحكام", href: "/terms", icon: <FileText size={13} /> },
      { label: "سياسة الاسترداد", href: "/refund", icon: <FileText size={13} /> },
      { label: "إدارة ملفات تعريف الارتباط", href: "/cookies", icon: <Shield size={13} /> },
    ],
  },
  {
    title: "الدعم",
    links: [
      { label: "مركز المساعدة", href: "/help", icon: <HelpCircle size={13} /> },
      { label: "تواصل معنا", href: "/contact", icon: <Mail size={13} /> },
      { label: "الشركاء", href: "/partners", icon: <Globe size={13} /> },
      { label: "حالة الخدمة", href: "/status", icon: <MessageCircle size={13} /> },
    ],
  },
];

const SOCIAL_LINKS = [
  { label: "X (Twitter)", href: "https://x.com/garfix", icon: "𝕏" },
  { label: "LinkedIn", href: "https://linkedin.com/company/garfix", icon: "in" },
  { label: "WhatsApp", href: "https://wa.me/96500000000", icon: "WA" },
];

/* ── Component ──────────────────────────────────────────────────────────── */

interface ProfessionalFooterProps {
  variant?: "landing" | "app";
  version?: string;
}

export function ProfessionalFooter({ variant = "landing", version = "12" }: ProfessionalFooterProps) {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && email.includes("@")) {
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  const isLanding = variant === "landing";

  // Color scheme based on variant - DS v4.0 Emerald Theme
  const colors = isLanding
    ? {
        bg: "bg-background",
        border: "border-emerald-500/20",
        accentLine: "from-emerald-500 via-emerald-400 to-emerald-600",
        text: "text-muted-foreground",
        textHover: "hover:text-emerald-600 dark:hover:text-emerald-400",
        heading: "text-emerald-500 dark:text-emerald-400",
        muted: "text-muted-foreground",
        brand: "text-foreground",
        inputBg: "bg-muted",
        inputBorder: "border-border",
        buttonBg: "from-emerald-600 to-emerald-700",
        logoBg: "from-emerald-600 to-emerald-700",
      }
    : {
        bg: "bg-card",
        border: "border-emerald-500/20",
        accentLine: "from-emerald-500 via-emerald-400 to-emerald-600",
        text: "text-muted-foreground",
        textHover: "hover:text-emerald-600 dark:hover:text-emerald-400",
        heading: "text-emerald-600 dark:text-emerald-400",
        muted: "text-muted-foreground",
        brand: "text-foreground",
        inputBg: "bg-muted",
        inputBorder: "border-border",
        buttonBg: "from-emerald-600 to-emerald-700",
        logoBg: "from-emerald-600 to-emerald-700",
      };

  return (
    <footer
      className={`${colors.bg} safe-bottom relative`}
      dir="rtl"
    >
      {/* DS v4.0 Gradient Accent Line */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${colors.accentLine}`} />
      
      {/* ── Main Footer Content ──────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-[5%] py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-11 h-11 rounded-lg bg-gradient-to-br ${colors.logoBg} flex items-center justify-center text-[22px] font-black text-white shadow-brand-sm`}>
                G
              </div>
              <div>
                <div className={`text-xl font-black tracking-wider ${colors.brand}`}>GARFIX</div>
                <div className={`text-[10px] tracking-[2px] ${colors.muted}`}>EOS v{version}</div>
              </div>
            </div>
            <p className={`text-[13px] leading-relaxed mb-5 max-w-[340px] ${colors.text}`}>
              منصة سحابية متكاملة لإدارة الفواتير والعملاء والموارد البشرية والمحاسبة والمشتريات. مدعومة بالذكاء الاصطناعي، ومُحسّنة لـ 20+ دولة في الشرق الأوسط وشمال أفريقيا.
            </p>

            {/* Newsletter */}
            <form onSubmit={handleSubscribe} className="flex gap-2 max-w-[340px]">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="بريدك الإلكتروني للنشرة البريدية"
                className={`flex-1 px-3 py-2 rounded-lg ${colors.inputBg} border ${colors.inputBorder} text-foreground placeholder:text-muted-foreground text-[12px] outline-none focus-ring focus:border-emerald-500 transition-all duration-150`}
                dir="ltr"
              />
              <button
                type="submit"
                className={`px-4 py-2 rounded-lg bg-gradient-to-r ${colors.buttonBg} text-white text-[12px] font-bold border-none cursor-pointer active-press duration-150 hover:shadow-brand-sm whitespace-nowrap transition-shadow`}
              >
                {subscribed ? "تم الاشتراك ✓" : "اشترك"}
              </button>
            </form>

            {/* Social Links */}
            <div className="flex gap-3 mt-5">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.label}
                  className={`w-9 h-9 rounded-lg ${colors.inputBg} border ${colors.inputBorder} flex items-center justify-center text-[11px] font-bold ${colors.text} ${colors.textHover} hover-lift duration-120 transition-all no-underline hover:border-emerald-500/50`}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link Groups */}
          {FOOTER_LINKS.map((group) => (
            <div key={group.title}>
              <h3 className={`text-[13px] font-extrabold mb-4 ${colors.heading} uppercase tracking-wider`}>
                {group.title}
              </h3>
              <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className={`text-[12px] ${colors.text} ${colors.textHover} no-underline transition-colors inline-flex items-center gap-2 hover:translate-x-[-2px] transition-transform`}
                    >
                      {link.icon}
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Bar ───────────────────────────────────────────────── */}
      <div className={`border-t ${colors.border} py-5 px-[5%] bg-muted/50`}>
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className={`text-[11px] ${colors.muted} flex flex-wrap items-center gap-x-2`}>
            <span>&copy; {new Date().getFullYear()} GARFIX v4.0. جميع الحقوق محفوظة.</span>
            <span className="mx-1">|</span>
            <span>صُنع بـ ❤️ في الكويت</span>
          </div>

          <div className={`text-[11px] ${colors.muted} flex items-center gap-3`}>
            <span className="inline-flex items-center gap-1">
              <Globe size={11} />
              MENA + الشرق الأوسط (20+ دولة)
            </span>
            <span className="inline-flex items-center gap-1">
              <Shield size={11} />
              AES-256-GCM
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone size={11} />
              +965
            </span>
          </div>
        </div>
      </div>

      {/* ── Back to Top (landing only) ───────────────────────────────── */}
      {isLanding && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 left-6 z-50 w-11 h-11 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-none cursor-pointer shadow-brand-md flex items-center justify-center transition-all hover:shadow-brand-lg hover:-translate-y-1 active-press duration-150 max-md:hidden"
          aria-label="العودة للأعلى"
        >
          <ChevronUp size={20} />
        </button>
      )}
    </footer>
  );
}

export default ProfessionalFooter;
