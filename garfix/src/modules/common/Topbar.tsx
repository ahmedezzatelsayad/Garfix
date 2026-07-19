"use client";

import { Menu, Search } from "lucide-react";
import type { CompanyInfo } from "@/context/BrandContext";
import { NotificationsDropdown } from "./NotificationsDropdown";

interface TopbarProps {
  user: { displayName: string; email: string };
  activeCompany: CompanyInfo | null;
  onOpenMobile: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

export function Topbar({ user, activeCompany, onOpenMobile }: TopbarProps) {
  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent("garfix:open-command-palette"));
  };

  return (
    <header
      className="sticky top-0 z-[100] bg-white border-b border-gray-200
                 flex items-center gap-3 px-4 py-3 md:px-6 md:gap-3
                 shadow-card"
    >
      {/*
        Part 1.3 fix: hamburger button — 44×44px touch target (min iOS HIG).
        Only visible on <md (mobile/tablet). On desktop the sidebar is always visible.
      */}
      <button
        onClick={onOpenMobile}
        className="md:hidden flex items-center justify-center
                   min-w-[44px] min-h-[44px] rounded-lg
                   bg-transparent border-none text-foreground cursor-pointer
                   hover:bg-muted touch-manipulation"
        aria-label="فتح القائمة"
      >
        <Menu size={22} />
      </button>

      <div className="flex-1 flex items-center gap-2 md:gap-3 min-w-0">
        <div
          className="px-2.5 py-1 rounded-full bg-brand-purple-50 text-brand-purple
                     text-xs font-bold truncate max-w-[50vw] md:max-w-none border border-brand-purple-100"
        >
          {activeCompany?.nameAr || activeCompany?.name || "—"}
        </div>
        {activeCompany?.plan && (
          <div
            className="hidden sm:inline-block px-2 py-0.5 rounded-xl
                       bg-brand-purple text-white
                       text-[10px] font-bold uppercase tracking-wider"
          >
            {activeCompany.plan}
          </div>
        )}
      </div>

      {/* Command palette trigger — opens the global Ctrl+K palette.
          44×44px touch target on mobile; shrinks to compact on desktop. */}
      <button
        type="button"
        onClick={openCommandPalette}
        title="بحث وأوامر سريعة (Ctrl+K)"
        aria-label="بحث وأوامر سريعة"
        className="flex items-center gap-2 min-h-[44px] min-w-[44px] md:min-h-[36px]
                   px-2 md:px-3 rounded-lg bg-gray-50 border border-gray-200
                   text-gray-400 cursor-pointer font-inherit text-xs
                   hover:bg-brand-purple-50 hover:border-brand-purple-100 hover:text-brand-purple transition-colors touch-manipulation"
      >
        <Search size={16} />
        <span className="hidden sm:inline whitespace-nowrap">بحث…</span>
        <kbd
          className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded
                     bg-white border border-gray-200 text-[10px] font-mono
                     text-gray-400 leading-tight"
        >
          Ctrl K
        </kbd>
      </button>

      <NotificationsDropdown />
    </header>
  );
}

export default Topbar;
