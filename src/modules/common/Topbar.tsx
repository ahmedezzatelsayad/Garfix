"use client";

/**
 * Topbar — sticky header inside the AppShell.
 *
 * Theme-aware: all colors use shadcn/ui tokens (bg-mutedackgroundackground, text-foreground,
 * bg-muted, text-muted-foreground, bg-primary/10, text-primary, border-border)
 * so the Topbar reads correctly in BOTH light and dark modes.
 *
 * Enhanced with GarfiX AI status indicator for "AI Everywhere" presence.
 * Enhanced with global warehouse/branch selector.
 */
import { Menu, Search, Building2, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import type { CompanyInfo } from "@/context/BrandContext";
import { cn } from "@/lib/utils";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { AIStatusBar } from "@/components/garfix";
import { useWarehouses } from "@/hooks/queries";

interface TopbarProps {
  user: { displayName: string; email: string };
  activeCompany: CompanyInfo | null;
  onOpenMobile: () => void;
  theme: "light" | "dark" | "system";
  toggleTheme: () => void;
}

export function Topbar({ user: _user, activeCompany, onOpenMobile }: TopbarProps) {
  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent("garfix:open-command-palette"));
  };

  // ── Global warehouse/branch selector ──
  const companySlug = activeCompany?.slug || "";
  const warehousesQuery = useWarehouses(companySlug);
  const warehouses: Array<{ id: string; name: string; code: string }> =
    (warehousesQuery.data?.warehouses ?? []).map((w) => ({ id: String(w.id), name: w.name, code: String(w.code ?? '') }));

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [showWarehouseMenu, setShowWarehouseMenu] = useState(false);

  // Load saved warehouse from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("garfix:selected-warehouse");
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage read on mount
        setSelectedWarehouse(saved);
      }
    } catch { /* ignore */ }
  }, []);

  // Dispatch warehouse change event so other components can react
  useEffect(() => {
    try {
      localStorage.setItem("garfix:selected-warehouse", selectedWarehouse);
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("garfix:warehouse-changed", { detail: { warehouseId: selectedWarehouse } }));
  }, [selectedWarehouse]);

  const selectedWarehouseName = warehouses.find((w) => w.id === selectedWarehouse)?.name || "كل الفروع";

  return (
    <header
      className="sticky top-0 z-[100] bg-mutedackgroundackground/95 backdrop-blur
                 border-b border-border
                 flex items-center gap-3 px-4 py-3 md:px-6 md:gap-3
                 shadow-brand-sm"
    >
      {/* Mobile hamburger — 44×44px touch target (iOS HIG). Desktop sidebar is
          always visible so the hamburger is hidden on md+. */}
      <button
        onClick={onOpenMobile}
        className="md:hidden flex items-center justify-center
                   min-w-[44px] min-h-[44px] rounded-lg
                   bg-transparent border-none text-foreground cursor-pointer
                   hover:bg-muted touch-manipulation
                   active-press duration-150"
        aria-label="فتح القائمة"
      >
        <Menu size={22} />
      </button>

      <div className="flex-1 flex items-center gap-2 md:gap-3 min-w-0">
        {/* Active company badge — uses primary/10 + primary text tokens so it
            has a soft violet tint in light mode and a vivid violet chip in
            dark mode. */}
        <div
          className="px-2.5 py-1 rounded-full
                     bg-mutedmerald-500/10 text-emerald-400 border border-emerald-500/20
                     text-xs font-bold truncate max-w-[50vw] md:max-w-none"
        >
          {activeCompany?.nameAr || activeCompany?.name || "—"}
        </div>
        {activeCompany?.plan && (
          <div
            className={cn(
              "hidden sm:inline-block px-2 py-0.5 rounded-xl",
              "text-[10px] font-bold uppercase tracking-wider",
              activeCompany.plan.toLowerCase().includes('premium') || activeCompany.plan.toLowerCase().includes('pro')
                ? "bg-gradient-to-r from-[#d4a574] to-[#c9956a] text-white shadow-gold-sm"
                : "bg-mutedmerald-600 text-white"
            )}
          >
            {activeCompany.plan}
          </div>
        )}

        {/* ── Global Warehouse/Branch Selector ── */}
        {warehouses.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowWarehouseMenu(!showWarehouseMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                         bg-muted/60 border border-border text-xs font-medium
                         text-muted-foreground hover:bg-primary/10 hover:border-primary/20 hover:text-primary
                         transition-colors cursor-pointer min-h-[36px]"
              aria-label="اختيار الفرع"
            >
              <Building2 size={14} />
              <span className="hidden sm:inline truncate max-w-[100px]">{selectedWarehouseName}</span>
              <ChevronDown size={12} className={cn("transition-transform", showWarehouseMenu && "rotate-180")} />
            </button>
            {showWarehouseMenu && (
              <div className="absolute top-full right-0 mt-1 w-52 bg-popover border border-border rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
                <button
                  onClick={() => { setSelectedWarehouse(""); setShowWarehouseMenu(false); }}
                  className={cn(
                    "w-full text-right px-3 py-2 text-xs hover:bg-muted transition-colors",
                    !selectedWarehouse && "bg-primary/10 text-primary font-bold"
                  )}
                >
                  🏢 كل الفروع
                </button>
                {warehouses.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => { setSelectedWarehouse(w.id); setShowWarehouseMenu(false); }}
                    className={cn(
                      "w-full text-right px-3 py-2 text-xs hover:bg-muted transition-colors",
                      selectedWarehouse === w.id && "bg-primary/10 text-primary font-bold"
                    )}
                  >
                    🏬 {w.name} ({w.code})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Command palette trigger — opens the global Ctrl+K palette. */}
      <button
        type="button"
        onClick={openCommandPalette}
        title="بحث وأوامر سريعة (Ctrl+K)"
        aria-label="بحث وأوامر سريعة"
        className="flex items-center gap-2 min-h-[44px] min-w-[44px] md:min-h-[36px]
                   px-2 md:px-3 rounded-lg bg-muted/60 border border-border
                   text-muted-foreground cursor-pointer font-inherit text-xs
                   hover:bg-primary/10 hover:border-primary/20 hover:text-primary
                   transition-colors touch-manipulation
                   hover-lift duration-120"
      >
        <Search size={16} />
        <span className="hidden sm:inline whitespace-nowrap">بحث…</span>
        <kbd
          className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded
                     bg-mutedackgroundackground border border-border text-[10px] font-mono
                     text-muted-foreground leading-tight"
        >
          Ctrl K
        </kbd>
      </button>

      {/* GarfiX AI Status - Everywhere Presence */}
      <AIStatusBar
        status="online"
        lastActivity="جاهز للمساعدة"
        onClick={() => window.dispatchEvent(new CustomEvent('open-ai-copilot'))}
        compact
        className="hidden sm:flex"
      />
      
      <NotificationsDropdown />
    </header>
  );
}

export default Topbar;
