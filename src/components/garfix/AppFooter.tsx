"use client";

import Link from "next/link";

interface AppFooterProps {
  version?: string;
  commitSha?: string;
}

export function AppFooter({ version = "12", commitSha }: AppFooterProps) {
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;
  const year = new Date().getFullYear();

  return (
    <footer
      className="border-t border-emerald-500/30 bg-[#0b1220]/90 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur-sm"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground/80">GARFIX EOS</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-muted-foreground/80">v{version}</span>
          {shortSha && (
            <span className="font-mono text-[10px] text-muted-foreground/60" dir="ltr">
              #{shortSha}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/status"
            className="hover:text-emerald-400 hover-lift duration-120 transition-all no-underline"
          >
            حالة الخدمة
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <Link
            href="/help"
            className="hover:text-emerald-400 hover-lift duration-120 transition-all no-underline"
          >
            مركز المساعدة
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <Link
            href="/privacy"
            className="hover:text-emerald-400 hover-lift duration-120 transition-all no-underline"
          >
            الخصوصية
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <Link
            href="/terms"
            className="hover:text-emerald-400 hover-lift duration-120 transition-all no-underline"
          >
            الشروط
          </Link>
        </div>

        <div className="text-muted-foreground/60 hidden sm:block">
          © {year} GARFIX
        </div>
      </div>
    </footer>
  );
}

export default AppFooter;
