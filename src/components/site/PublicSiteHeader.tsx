"use client";

/**
 * PublicSiteHeader — الهيدر الاحترافي المشترك لكل صفحات الموقع الخارجي.
 *
 * استُحدث عند التحول من Landing Page واحدة إلى موقع متعدد الصفحات:
 * - روابط تنقل حقيقية (الرئيسية / المميزات / الأسعار / من نحن / تواصل معنا / المساعدة)
 * - تمييز الصفحة النشطة (لون + خلفية)
 * - زر تبديل الوضع الفاتح/الداكن (next-themes)
 * - قائمة موبايل قابلة للفتح
 * - أزرار الدخول وإنشاء الحساب
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Menu, X, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "الرئيسية" },
  { href: "/features", label: "المميزات" },
  { href: "/pricing", label: "الأسعار" },
  { href: "/about", label: "من نحن" },
  { href: "/contact", label: "تواصل معنا" },
  { href: "/help", label: "المساعدة" },
];

export function PublicSiteHeader() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  // next-themes لا يعرف الثيم على السيرفر — ننتظر التركيب لعرض الأيقونة الصحيحة
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted-flag pattern المتعارفة مع next-themes
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-50 glass border-b border-emerald-500/20"
    >
      <div className="max-w-[1200px] mx-auto px-[5%] py-3 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 no-underline shrink-0" aria-label="GARFIX — الرئيسية">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-[20px] font-black text-white shadow-brand-sm">
            G
          </div>
          <div className="leading-tight">
            <div className="text-lg font-black tracking-wider text-foreground">GARFIX</div>
            <div className="text-[9px] text-emerald-500 dark:text-emerald-400/60 tracking-[2px]">
              EOS v{process.env.NEXT_PUBLIC_APP_VERSION || "12"}
            </div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="التنقل الرئيسي" className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative px-3.5 py-2 rounded-lg text-[13.5px] font-bold no-underline transition-colors duration-150",
                isActive(link.href)
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              aria-current={isActive(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="w-9 h-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer flex items-center justify-center transition-colors"
            aria-label={isDark ? "تبديل إلى الوضع الفاتح" : "تبديل إلى الوضع الداكن"}
            title={isDark ? "الوضع الفاتح" : "الوضع الداكن"}
          >
            {mounted && isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <Link
            href="/login"
            className="hidden sm:inline-flex items-center bg-transparent text-foreground/85 border border-border rounded-lg px-4 py-2 text-[13px] font-bold no-underline cursor-pointer transition-all hover:bg-muted"
          >
            تسجيل الدخول
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center bg-[linear-gradient(135deg,#047857,#10b981)] text-white border-none rounded-lg px-4 py-2 text-[13px] font-extrabold no-underline cursor-pointer transition-all shadow-[0_6px_18px_rgba(4,120,87,0.35)] hover:shadow-[0_10px_26px_rgba(4,120,87,0.45)] active-press"
          >
            ابدأ مجاناً
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden w-9 h-9 rounded-lg border border-border bg-card text-foreground cursor-pointer flex items-center justify-center"
            aria-label={mobileOpen ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav
          aria-label="التنقل — موبايل"
          className="md:hidden border-t border-border bg-card/95 backdrop-blur-md px-[5%] py-3 flex flex-col gap-1"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "px-3.5 py-2.5 rounded-lg text-sm font-bold no-underline transition-colors min-h-[44px] flex items-center",
                isActive(link.href)
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              aria-current={isActive(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setMobileOpen(false)}
            className="px-3.5 py-2.5 rounded-lg text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted no-underline min-h-[44px] flex items-center"
          >
            تسجيل الدخول
          </Link>
        </nav>
      )}
    </header>
  );
}

export default PublicSiteHeader;
