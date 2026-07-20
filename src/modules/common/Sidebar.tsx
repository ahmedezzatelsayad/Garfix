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
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--sidebar-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "40px", height: "40px", borderRadius: "12px",
                background: "linear-gradient(135deg, var(--primary), var(--accent))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "20px", fontWeight: 900, color: "#fff",
                boxShadow: "0 6px 20px rgba(124, 58, 237, 0.35)",
              }}
            >
              G
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: "16px", letterSpacing: "0.5px" }}>GARFIX</div>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)", letterSpacing: "1px" }}>EOS v12</div>
            </div>
          </div>
        </div>

        {/* Company selector */}
        <div style={{ padding: "14px 14px", borderBottom: "1px solid var(--sidebar-border)" }}>
          <button
            onClick={() => setShowCompanyMenu(!showCompanyMenu)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 12px", borderRadius: "10px",
              background: "var(--sidebar-accent)", border: "1px solid var(--sidebar-border)",
              color: "var(--sidebar-foreground)", cursor: "pointer", fontFamily: "inherit",
              textAlign: "right",
            }}
          >
            <div
              style={{
                width: "32px", height: "32px", borderRadius: "8px",
                background: activeCompany?.color || "var(--primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "16px", flexShrink: 0,
              }}
            >
              {activeCompany?.emoji || "🏢"}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {activeCompany?.nameAr || activeCompany?.name || "اختر شركة"}
              </div>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                {activeCompany ? activeCompany.plan : "—"}
              </div>
            </div>
            <ChevronDown size={16} style={{ opacity: 0.6 }} />
          </button>
          {showCompanyMenu && (
            <div style={{ marginTop: "6px", background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "10px", padding: "6px", maxHeight: "240px", overflowY: "auto" }} className="garfix-scroll">
              {loadingCompanies && <div style={{ padding: "8px 10px", fontSize: "11px", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>}
              {!loadingCompanies && companies.length === 0 && (
                <div style={{ padding: "8px 10px", fontSize: "11px", color: "var(--muted-foreground)" }}>لا توجد شركات بعد</div>
              )}
              {companies.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => { setActiveSlug(c.slug); setShowCompanyMenu(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "8px",
                    padding: "8px 10px", borderRadius: "6px",
                    border: "none", color: "var(--popover-foreground)", cursor: "pointer",
                    fontFamily: "inherit", textAlign: "right",
                    background: c.slug === activeCompany?.slug ? "var(--accent)" : "transparent",
                  }}
                >
                  <span style={{ fontSize: "16px" }}>{c.emoji || "🏢"}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nameAr || c.name}</span>
                </button>
              ))}
              <button
                onClick={() => { setShowCreateCompany(true); setShowCompanyMenu(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "8px",
                  padding: "8px 10px", borderRadius: "6px", background: "transparent",
                  border: "1px dashed var(--border)", color: "var(--primary)", cursor: "pointer",
                  fontFamily: "inherit", textAlign: "right", marginTop: "4px", fontSize: "12px",
                }}
              >
                <Plus size={14} /> شركة جديدة
              </button>
            </div>
          )}
          {showCreateCompany && (
            <div style={{ marginTop: "8px", padding: "10px", background: "var(--card)", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <input
                placeholder="اسم الشركة"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--border)", marginBottom: "6px", fontFamily: "inherit", fontSize: "12px", background: "var(--background)", color: "var(--foreground)" }}
              />
              <input
                placeholder="المعرّف (english-slug)"
                value={newCompanySlug}
                onChange={(e) => setNewCompanySlug(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--border)", marginBottom: "6px", fontFamily: "inherit", fontSize: "12px", background: "var(--background)", color: "var(--foreground)", direction: "ltr" }}
              />
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={createCompany}
                  disabled={creating || !newCompanyName || !newCompanySlug}
                  style={{
                    flex: 1, padding: "8px", borderRadius: "6px",
                    background: "var(--primary)", color: "var(--primary-foreground)",
                    border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
                    opacity: creating || !newCompanyName || !newCompanySlug ? 0.6 : 1,
                  }}
                >
                  {creating ? "جارٍ…" : "إنشاء"}
                </button>
                <button
                  onClick={() => setShowCreateCompany(false)}
                  style={{
                    padding: "8px 12px", borderRadius: "6px",
                    background: "transparent", color: "var(--muted-foreground)",
                    border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
                  }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }} className="garfix-scroll">
          {NAV_ITEMS.filter(canSee).map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "12px",
                  padding: "10px 12px", borderRadius: "8px",
                  background: active ? "var(--sidebar-primary)" : "transparent",
                  color: active ? "#FFFFFF" : "var(--sidebar-foreground)",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: "13px", fontWeight: active ? 700 : 500,
                  marginBottom: "2px", textAlign: "right",
                  transition: "all 0.15s",
                  boxShadow: active ? "0 2px 8px rgba(124, 58, 237, 0.3)" : "none",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--sidebar-accent)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <Icon size={16} />
                <span style={{ flex: 1 }}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div style={{ padding: "12px", borderTop: "1px solid var(--sidebar-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <div
              style={{
                width: "36px", height: "36px", borderRadius: "50%",
                background: "linear-gradient(135deg, var(--primary), var(--accent))",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "14px",
              }}
            >
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.displayName}
              </div>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.email}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={toggleTheme}
              style={{
                flex: 1, padding: "8px", borderRadius: "6px",
                background: "var(--sidebar-accent)", border: "1px solid var(--sidebar-border)",
                color: "var(--sidebar-foreground)", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
              }}
            >
              {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
              {theme === "dark" ? "فاتح" : "داكن"}
            </button>
            <button
              onClick={onLogout}
              style={{
                flex: 1, padding: "8px", borderRadius: "6px",
                background: "var(--destructive)", border: "none",
                color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
              }}
            >
              <LogOut size={12} /> خروج
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
