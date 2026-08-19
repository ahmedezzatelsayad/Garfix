"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Brain,
  Cpu,
  DollarSign,
  Settings,
  Building,
  Key,
  Menu,
  X,
  Shield,
  Zap,
  Plug,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
// FE-15 FIX (Audit v2 · Phase 3): founder-panel pages render through
// FounderPanelShell, which never included the shared skip-links that AppShell
// has. Keyboard users had to Tab through the entire sidebar to reach content.
import { GarfixSkipLinks } from "@/components/garfix-ds";
// Phase 2 P1 fix: FounderGuard import removed — server layout does the check now.

// ── Types ───────────────────────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  labelAr: string;
  href: string;
  icon: React.ReactNode;
  badge?: number | string;
  group: "main" | "ai" | "management";
}

// ── Navigation Configuration ───────────────────────────────────────────

const navigationItems: NavItem[] = [
  // Main Dashboard Group
  {
    id: "mission-control",
    label: "Mission Control",
    labelAr: "مركز التحكم",
    href: "/founder-panel/mission-control",
    icon: <Activity className="h-5 w-5" />,
    group: "main",
  },
  {
    id: "finops",
    label: "Financial Ops",
    labelAr: "العمليات المالية",
    href: "/founder-panel/finops",
    icon: <DollarSign className="h-5 w-5" />,
    group: "main",
  },
  
  // AI & Intelligence Group
  {
    id: "ai-dashboard",
    label: "AI Dashboard",
    labelAr: "لوحة الذكاء الاصطناعي",
    href: "/founder-panel/ai-dashboard",
    icon: <Brain className="h-5 w-5" />,
    badge: "جديد",
    group: "ai",
  },
  {
    id: "ai-fabric",
    label: "AI Fabric",
    labelAr: "محرك الذكاء الاصطناعي",
    href: "/founder-panel/ai-fabric",
    icon: <Cpu className="h-5 w-5" />,
    group: "ai",
  },
  
  // Management Group
  {
    id: "companies-ai",
    label: "Company AI Mgmt",
    labelAr: "إدارة ذكاء الشركات",
    href: "/founder-panel/companies-ai-management",
    icon: <Building className="h-5 w-5" />,
    group: "management",
  },
  {
    id: "ai-settings",
    label: "AI Settings",
    labelAr: "إعدادات الذكاء الاصطناعي",
    href: "/founder-panel/ai-settings",
    icon: <Settings className="h-5 w-5" />,
    group: "management",
  },
  {
    id: "api-keys-pool",
    label: "API Key Pool",
    labelAr: "مجمع مفاتيح API",
    href: "/founder-panel/api-key-pool",
    icon: <Key className="h-5 w-5" />,
    badge: "مهم",
    group: "management",
  },
  {
    id: "integrations",
    label: "Integrations",
    labelAr: "التكاملات",
    href: "/founder-panel/integrations",
    icon: <Plug className="h-5 w-5" />,
    group: "management",
  },
  {
    id: "e-invoicing",
    label: "E-Invoicing",
    labelAr: "الفوترة الإلكترونية",
    href: "/founder-panel/e-invoicing",
    icon: <ShieldCheck className="h-5 w-5" />,
    badge: "جديد",
    group: "management",
  },
];

const groupLabels: Record<string, { en: string; ar: string }> = {
  main: { en: "Main Dashboard", ar: "لوحة التحكم الرئيسية" },
  ai: { en: "AI & Intelligence", ar: "الذكاء الاصطناعي" },
  management: { en: "Management", ar: "الإدارة" },
};

// ── Component ───────────────────────────────────────────────────────────

export default function FounderPanelShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Get current active item
  const activeId = navigationItems.find((item) => 
    pathname === item.href || pathname.startsWith(item.href + "/")
  )?.id;

  // Group items by category
  const groupedItems = Object.entries(groupLabels).map(([key, label]) => ({
    ...label,
    items: navigationItems.filter((item) => item.group === key),
  }));

  return (
    // Phase 2 P1 fix: FounderGuard removed — the server-side layout.tsx now
    // does the founder check BEFORE this client component renders. The
    // client-side guard was redundant and caused a flash of unauthenticated HTML.
    <div className="min-h-dvh bg-background text-foreground" dir="rtl">
        {/* FE-15 FIX (Audit v2 · Phase 3): skip-nav for keyboard users. */}
        <GarfixSkipLinks />
        {/* Mobile Header */}
        <header id="main-navigation" className="lg:hidden fixed top-0 start-0 end-0 z-40 h-16 bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-emerald-500"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-emerald-500" />
              <span className="font-bold text-foreground">GarfiX Founder</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#d4a574]" />
            <span className="text-xs text-[#d4a574]/80 font-medium">v4.0 EOS</span>
          </div>
        </header>

        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed top-0 start-0 z-50 h-full bg-sidebar/98 backdrop-blur-xl border-e border-sidebar-border",
            "transition-all duration-300 ease-out",
            "flex flex-col",
            // Width
            collapsed ? "w-[72px]" : "w-[280px]",
            // Mobile
            "lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          )}
        >
          {/* Header */}
          <div className={cn(
            "flex items-center h-16 border-b border-sidebar-border px-4",
            collapsed ? "justify-center" : "justify-between"
          )}>
            {!collapsed && (
              <Link href="/founder-panel/mission-control" className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-sidebar-foreground text-sm leading-tight">GarfiX</p>
                  <p className="text-[10px] text-[#d4a574]/80 font-medium tracking-wider uppercase">Founder Panel</p>
                </div>
              </Link>
            )}
            
            {/* Collapse Toggle (Desktop) */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:flex p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label={collapsed ? "توسيع" : "طي"}
            >
              <Menu className={cn("h-5 w-5 transition-transform", collapsed && "rotate-180")} />
            </button>

            {/* Close (Mobile) */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-thin">
            {groupedItems.map((group) => (
              <div key={group.en}>
                {/* Group Label */}
                {!collapsed && (
                  <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {group.ar}
                  </p>
                )}

                {/* Items */}
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = item.id === activeId;
                    
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          title={collapsed ? item.labelAr : undefined}
                          className={cn(
                            "w-full flex items-center gap-3 rounded-xl font-medium transition-all duration-200 relative",
                            // Size
                            collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                            // Active State
                            isActive && [
                              "bg-gradient-to-l from-emerald-500/15 to-transparent",
                              "text-emerald-400",
                              "shadow-lg shadow-emerald-500/10",
                              "border border-emerald-500/20",
                            ],
                            // Inactive State
                            !isActive && [
                              "text-muted-foreground/80 hover:text-foreground",
                              "hover:bg-sidebar-accent",
                              "border border-transparent",
                            ],
                            // Focus
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                          )}
                        >
                          {/* Active Indicator */}
                          {isActive && !collapsed && (
                            <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-500 rounded-e-full" />
                          )}

                          {/* Icon */}
                          <span className={cn(
                            "flex-shrink-0 transition-colors",
                            isActive ? "text-emerald-400" : "text-muted-foreground/60"
                          )}>
                            {item.icon}
                          </span>

                          {/* Label & Badge */}
                          {!collapsed && (
                            <>
                              <span className="flex-1 text-start text-sm">{item.labelAr}</span>
                              
                              {item.badge && (
                                <span className={cn(
                                  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full",
                                  isActive
                                    ? "bg-emerald-500 text-white"
                                    : item.badge === "مهم"
                                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                      : "bg-[#d4a574]/15 text-[#d4a574]"
                                )}>
                                  {item.badge}
                                </span>
                              )}
                            </>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className={cn(
            "border-t border-sidebar-border p-4",
            collapsed && "flex justify-center"
          )}>
            {!collapsed ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-emerald-400 font-medium">النظام يعمل بشكل طبيعي</span>
                </div>
                <p className="text-[10px] text-muted-foreground/40 text-center">
                  GarfiX DS v4.0 EOS • Emerald Edition
                </p>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "min-h-dvh transition-all duration-300",
            // Offset for sidebar
            collapsed ? "lg:ms-[72px]" : "lg:ms-[280px]",
            // Mobile header offset
            "pt-16 lg:pt-0"
          )}
        >
          {/* Top Bar (Desktop) */}
          <div className="hidden lg:flex h-16 items-center justify-between px-6 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <Menu className={cn("h-5 w-5 transition-transform", collapsed && "rotate-180")} />
              </button>
              <div className="h-6 w-px bg-border" />
              <h1 className="text-sm font-medium text-muted-foreground">
                {navigationItems.find(i => i.id === activeId)?.labelAr || "لوحة المؤسس"}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-[#d4a574]" />
                <span>DeepSeek V3</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
            </div>
          </div>

          {/* Page Content */}
          <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
    </div>
  );
}
