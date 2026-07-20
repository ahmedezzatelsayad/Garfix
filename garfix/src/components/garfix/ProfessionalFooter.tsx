"use client";

import { useState } from "react";
import {
  Globe, Mail, Phone, MapPin, ChevronUp,
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
      { label: "عن GARFIX", href: "#about", icon: <Info size={13} /> },
      { label: "المزايا", href: "#features", icon: <Shield size={13} /> },
      { label: "الأسعار", href: "#pricing", icon: <FileText size={13} /> },
      { label: "الأسئلة الشائعة", href: "#faq", icon: <HelpCircle size={13} /> },
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

  // Color scheme based on variant
  const colors = isLanding
    ? {
        bg: "bg-[rgba(15,10,30,0.95)]",
        border: "border-[rgba(124,58,237,0.15)]",
        text: "text-white/60",
        textHover: "hover:text-[#c4b5fd]",
        heading: "text-white/90",
        muted: "text-white/40",
        brand: "text-white",
        inputBg: "bg-white/[0.05]",
        inputBorder: "border-white/[0.1]",
      }
    : {
        bg: "bg-[var(--card)]",
        border: "border-[var(--border)]",
        text: "text-[var(--muted-foreground)]",
        textHover: "hover:text-[var(--primary)]",
        heading: "text-[var(--foreground)]",
        muted: "text-[var(--muted-foreground)]",
        brand: "text-[var(--foreground)]",
        inputBg: "bg-[var(--background)]",
        inputBorder: "border-[var(--border)]",
      };

  return (
    <footer
      className={`${colors.bg} border-t ${colors.border} safe-bottom`}
      dir="rtl"
    >
      {/* ── Main Footer Content ──────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-[5%] py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] flex items-center justify-center text-[22px] font-black text-white shadow-[0_8px_24px_rgba(124,58,237,0.4)]">
                G
              </div>
              <div>
                <div className={`text-xl font-black tracking-wider ${colors.brand}`}>GARFIX</div>
                <div className={`text-[10px] tracking-[2px] ${colors.muted}`}>EOS v{version}</div>
              </div>
            </div>
            <p className={`text-[13px] leading-relaxed mb-5 max-w-[340px] ${colors.text}`}>
              منصة سحابية متكاملة لإدارة الفواتير والعملاء والموارد البشرية والمحاسبة والمشتريات. مدعومة بالذكاء الاصطناعي، ومُحسّنة لأسواق الشرق الأوسط.
            </p>

            {/* Newsletter */}
            <form onSubmit={handleSubscribe} className="flex gap-2 max-w-[340px]">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="بريدك الإلكتروني للنشرة البريدية"
                className={`flex-1 px-3 py-2 rounded-lg ${colors.inputBg} border ${colors.inputBorder} ${colors.text} text-[12px] outline-none focus:border-[#7c3aed] transition-colors`}
                dir="ltr"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white text-[12px] font-bold border-none cursor-pointer transition-all hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] whitespace-nowrap"
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
                  className={`w-9 h-9 rounded-lg ${colors.inputBg} border ${colors.inputBorder} flex items-center justify-center text-[11px] font-bold ${colors.text} ${colors.textHover} transition-all no-underline`}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link Groups */}
          {FOOTER_LINKS.map((group) => (
            <div key={group.title}>
              <h3 className={`text-[13px] font-extrabold mb-4 ${colors.heading}`}>
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
      <div className={`border-t ${colors.border} py-5 px-[5%]`}>
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className={`text-[11px] ${colors.muted} flex flex-wrap items-center gap-x-2`}>
            <span>&copy; {new Date().getFullYear()} GARFIX. جميع الحقوق محفوظة.</span>
            <span className="mx-1">|</span>
            <span>صُنع بـ ❤️ في الكويت</span>
          </div>

          <div className={`text-[11px] ${colors.muted} flex items-center gap-3`}>
            <span className="inline-flex items-center gap-1">
              <Globe size={11} />
              MENA Region
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
          className="fixed bottom-6 left-6 z-50 w-11 h-11 rounded-full bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white border-none cursor-pointer shadow-[0_4px_16px_rgba(124,58,237,0.4)] flex items-center justify-center transition-all hover:shadow-[0_6px_24px_rgba(124,58,237,0.6)] hover:-translate-y-1 max-md:hidden"
          aria-label="العودة للأعلى"
        >
          <ChevronUp size={20} />
        </button>
      )}
    </footer>
  );
}

export default ProfessionalFooter;
