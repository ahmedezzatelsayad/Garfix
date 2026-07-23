"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useBrand, type CompanyInfo } from "@/context/BrandContext";
import type { ViewKey } from "./AppShell";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart, UserCog,
  Calculator, Settings, Building2, Shield, History, LogOut, Menu, X,
  Sun, Moon, ChevronDown, Plus, Sparkles, BarChart3, User, Boxes, Zap, Bot,
} from "lucide-react";

interface SidebarProps {
  user: { displayName: string; email: string; role: string };
  view: ViewKey;
  navigate: (v: ViewKey) => void;
  perms: Record<string, number>;
  isAdmin: boolean;
  isFounder: boolean;
  activeCompany: CompanyInfo | null;
  companies: CompanyInfo[];
  setActiveSlug: (slug: string | null) => void;
  loadingCompanies: boolean;
  onLogout: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  perm?: string;
  adminOnly?: boolean;
  founderOnly?: boolean;
}> = [
  { key: "dash", label: "لوحة التحكم", icon: LayoutDashboard },
  { key: "invoices", label: "الفواتير", icon: FileText, perm: "create_invoice" },
  { key: "bulk-input", label: "إدخال مجمع بالـ AI", icon: Sparkles, perm: "create_invoice" },
  { key: "clients", label: "العملاء", icon: Users, perm: "view_customers" },
  { key: "catalog", label: "المنتجات", icon: Package },
  { key: "inventory", label: "المخزون", icon: Boxes, perm: "settings_access" },
  { key: "purchases", label: "المشتريات", icon: ShoppingCart },
  { key: "hr", label: "الموارد البشرية", icon: UserCog, perm: "employee_management" },
  { key: "accounting", label: "المحاسبة", icon: Calculator, perm: "finance_access" },
  { key: "reports", label: "التقارير", icon: BarChart3, perm: "reports_access" },
  { key: "automation", label: "الأتمتة", icon: Zap, perm: "settings_access" },
  { key: "ai-agents", label: "وكلاء AI", icon: Bot },
  { key: "team", label: "فريقي", icon: Users, perm: "settings_access" },
  { key: "settings", label: "الإعدادات", icon: Settings, perm: "settings_access" },
  { key: "account", label: "حسابي", icon: User },
  { key: "saas", label: "إدارة المنصة", icon: Building2, adminOnly: true },
  { key: "platform-admin", label: "إدارة المؤسس", icon: Shield, founderOnly: true },
  { key: "audit", label: "سجل التدقيق", icon: History, adminOnly: true },
];

export function Sidebar({
  user, view, navigate, perms, isAdmin, isFounder,
  activeCompany, companies, setActiveSlug, loadingCompanies,
  onLogout, theme, toggleTheme, mobileOpen, onCloseMobile,
}: SidebarProps) {
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [creating, setCreating] = useState(false);

  const canSee = (item: typeof NAV_ITEMS[number]) => {
    if (item.founderOnly && !isFounder) return false;
    if (item.adminOnly && !isAdmin && !isFounder) return false;
    if (item.perm && !perms[item.perm] && !isAdmin && !isFounder) return false;
    return true;
  };

  const createCompany = async () => {
    if (!newCompanyName || !newCompanySlug) return;
    setCreating(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newCompanyName, slug: newCompanySlug }),
      });
      if (res.ok) {
        await reloadCompanies();
        setShowCreateCompany(false);
        setNewCompanyName("");
        setNewCompanySlug("");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to create company");
      }
    } finally {
      setCreating(false);
    }
  };

  const reloadCompanies = async () => {
    // Trigger a re-fetch by toggling the slug — BrandContext's refresh is exposed via useBrand
    // Simpler: reload the page so the context re-hydrates
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <>
      {/* Mobile overlay — only visible when drawer is open on <md screens */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/50 z-[199] backdrop-blur-sm md:hidden"
        />
      )}
      {/*
        Part 1.2 fix: responsive sidebar.
        - Mobile (<md): off-canvas drawer, slides in from the RIGHT (RTL-correct).
          Default state: translate-x-full (off-screen to the right). When mobileOpen:
          translate-x-0. Width: w-[260px] (fixed). z-50 to sit above content.
        - Desktop (md+): always visible fixed rail on the right. md:translate-x-0
          forces it on-screen regardless of mobileOpen state. Width: md:w-[260px].
        - RTL note: in RTL, `translate-x-full` moves the element to the RIGHT
          (positive X = right in RTL), which is correct for a right-side drawer.
          The drawer slides in from the right edge.
      */}
      <aside
        className={cn(
          "garfix-scroll fixed top-0 bottom-0 right-0 z-50 w-[260px]",
          "flex flex-col border-s border-sidebar-border bg-white text-sidebar-foreground shadow-card",
          "transform transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "translate-x-full",
          // Desktop: always visible, regardless of mobileOpen state
          "md:translate-x-0",
        )}
      >
        {/* Mobile close button — only visible on <md */}
        <div className="flex justify-start p-2 border-b border-sidebar-border md:hidden">
          <button
            onClick={onCloseMobile}
            className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 rounded-md hover:bg-sidebar-accent"
            aria-label="إغلاق القائمة"
          >
            <X size={20} />
          </button>
        </div>

        {/* Brand header */}
        <div className="py-5 px-[18px] pb-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xl font-black text-white shadow-[0_6px_20px_rgba(124,58,237,0.35)]"
            >
              G
            </div>
            <div>
              <div className="font-black text-base tracking-wide">GARFIX</div>
              <div className="text-[10px] text-muted-foreground tracking-widest">EOS v12</div>
            </div>
          </div>
        </div>

        {/* Company selector */}
        <div className="py-3.5 px-3.5 border-b border-sidebar-border">
          <button
            onClick={() => setShowCompanyMenu(!showCompanyMenu)}
            className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-[10px] bg-sidebar-accent border border-sidebar-border text-sidebar-foreground cursor-pointer font-inherit text-right"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
              style={{ background: activeCompany?.color || "var(--primary)" }} // TAILWINDBREAK: dynamic company color
            >
              {activeCompany?.emoji || "🏢"}
            </div>
            <div className="flex-1 min-w-0 text-right">
              <div className="text-[13px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">
                {activeCompany?.nameAr || activeCompany?.name || "اختر شركة"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {activeCompany ? activeCompany.plan : "—"}
              </div>
            </div>
            <ChevronDown size={16} className="opacity-60" />
          </button>
          {showCompanyMenu && (
            <div className="mt-1.5 bg-popover border border-border rounded-[10px] p-1.5 max-h-[240px] overflow-y-auto garfix-scroll">
              {loadingCompanies && <div className="py-2 px-2.5 text-[11px] text-muted-foreground">جارٍ التحميل…</div>}
              {!loadingCompanies && companies.length === 0 && (
                <div className="py-2 px-2.5 text-[11px] text-muted-foreground">لا توجد شركات بعد</div>
              )}
              {companies.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => { setActiveSlug(c.slug); setShowCompanyMenu(false); }}
                  className={cn("w-full flex items-center gap-2 py-2 px-2.5 rounded-md border-none text-popover-foreground cursor-pointer font-inherit text-right", c.slug === activeCompany?.slug ? "bg-accent" : "bg-transparent")}
                >
                  <span className="text-base">{c.emoji || "🏢"}</span>
                  <span className="text-xs font-semibold flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{c.nameAr || c.name}</span>
                </button>
              ))}
              <button
                onClick={() => { setShowCreateCompany(true); setShowCompanyMenu(false); }}
                className="w-full flex items-center gap-2 py-2 px-2.5 rounded-md bg-transparent border border-dashed border-border text-primary cursor-pointer font-inherit text-right mt-1 text-xs"
              >
                <Plus size={14} /> شركة جديدة
              </button>
            </div>
          )}
          {showCreateCompany && (
            <div className="mt-2 p-2.5 bg-card rounded-lg border border-border">
              <input
                placeholder="اسم الشركة"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                className="w-full py-2 rounded-md border border-border mb-1.5 font-inherit text-xs bg-background text-foreground" // TAILWINDBREAK: var(--background)/var(--foreground)
              />
              <input
                placeholder="المعرّف (english-slug)"
                value={newCompanySlug}
                onChange={(e) => setNewCompanySlug(e.target.value)}
                className="w-full py-2 rounded-md border border-border mb-1.5 font-inherit text-xs bg-background text-foreground" dir="ltr" // TAILWINDBREAK: var(--background)/var(--foreground)
              />
              <div className="flex gap-1.5">
                <button
                  onClick={createCompany}
                  disabled={creating || !newCompanyName || !newCompanySlug}
                  className={cn("flex-1 py-2 rounded-md bg-primary text-primary-foreground border-none cursor-pointer font-inherit text-[11px", creating || !newCompanyName || !newCompanySlug ? "opacity-60" : "")}
                >
                  {creating ? "جارٍ…" : "إنشاء"}
                </button>
                <button
                  onClick={() => setShowCreateCompany(false)}
                  className="py-2 px-3 rounded-md bg-transparent text-muted-foreground border border-border cursor-pointer font-inherit text-[11px"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2.5 px-2 garfix-scroll">
          {NAV_ITEMS.filter(canSee).map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                className={cn(
                  "w-full flex items-center gap-3 py-2.5 px-3 rounded-lg border-none cursor-pointer font-inherit text-[13px] text-right transition-all duration-150 mb-0.5",
                  active ? "bg-sidebar-primary text-white font-bold shadow-[0_2px_8px_rgba(124,58,237,0.3)]" : "bg-transparent text-sidebar-foreground font-medium",
                )}
                onMouseEnter={(e) => { if (!active) e.currentTarget.classList.add("bg-sidebar-accent"); }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.classList.remove("bg-sidebar-accent"); }}
              >
                <Icon size={16} />
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent text-white flex items-center justify-center font-bold text-sm"
            >
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis">
                {user.displayName}
              </div>
              <div className="text-[10px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                {user.email}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={toggleTheme}
              className="flex-1 py-2 rounded-md bg-sidebar-accent border border-sidebar-border text-sidebar-foreground cursor-pointer font-inherit text-[11px] flex items-center justify-center gap-1"
            >
              {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
              {theme === "dark" ? "فاتح" : "داكن"}
            </button>
            <button
              onClick={onLogout}
              className="flex-1 py-2 rounded-md bg-destructive border-none text-white cursor-pointer font-inherit text-[11px] flex items-center justify-center gap-1"
            >
              <LogOut size={12} /> خروج
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
