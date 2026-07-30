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
      className="border-t border-border bg-card/30 px-3 py-2 text-[11px] text-muted-foreground"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground/80">GARFIX EOS</span>
          <span className="text-muted-foreground/60">v{version}</span>
          {shortSha && (
            <span className="font-mono text-[10px] text-muted-foreground/60" dir="ltr">
              #{shortSha}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/status"
            className="hover:text-foreground transition-colors no-underline"
          >
            حالة الخدمة
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <Link
            href="/help"
            className="hover:text-foreground transition-colors no-underline"
          >
            مركز المساعدة
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors no-underline"
          >
            الخصوصية
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors no-underline"
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
