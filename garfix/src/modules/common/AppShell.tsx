"use client";

import { useEffect, useState, useCallback, Suspense, lazy } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { toast } from "sonner";
import { AICopilotBubble } from "@/modules/ai/AICopilotBubble";
import { CommandPaletteProvider } from "@/components/garfix/CommandPaletteProvider";
import { ErrorBoundary } from "@/components/garfix/ErrorBoundary";

// Lazy-load heavy views
const DashboardView = lazy(() => import("@/modules/dashboard/DashboardView").then((m) => ({ default: m.DashboardView })));
const InvoicesView = lazy(() => import("@/modules/invoices/InvoicesView").then((m) => ({ default: m.InvoicesView })));
const ClientsView = lazy(() => import("@/modules/clients/ClientsView").then((m) => ({ default: m.ClientsView })));
const CatalogView = lazy(() => import("@/modules/catalog/CatalogView").then((m) => ({ default: m.CatalogView })));
const PurchasesView = lazy(() => import("@/modules/purchases/PurchasesView").then((m) => ({ default: m.PurchasesView })));
const HRView = lazy(() => import("@/modules/hr/HRView").then((m) => ({ default: m.HRView })));
const AccountingView = lazy(() => import("@/modules/accounting/AccountingView").then((m) => ({ default: m.AccountingView })));
const SettingsView = lazy(() => import("@/modules/settings/SettingsView").then((m) => ({ default: m.SettingsView })));
const SaaSControlPanel = lazy(() => import("@/modules/saas/SaaSControlPanel").then((m) => ({ default: m.SaaSControlPanel })));
const PlatformAdminPanel = lazy(() => import("@/modules/admin/PlatformAdminPanel").then((m) => ({ default: m.PlatformAdminPanel })));
const AuditView = lazy(() => import("@/modules/admin/AuditView").then((m) => ({ default: m.AuditView })));
const BulkInputView = lazy(() => import("@/modules/bulk-input/BulkInputView").then((m) => ({ default: m.BulkInputView })));
const ReportsView = lazy(() => import("@/modules/reports/ReportsView").then((m) => ({ default: m.ReportsView })));
const TeamView = lazy(() => import("@/modules/team/TeamView").then((m) => ({ default: m.TeamView })));
const AccountView = lazy(() => import("@/modules/account/AccountView").then((m) => ({ default: m.AccountView })));
const InventoryView = lazy(() => import("@/modules/inventory/InventoryView").then((m) => ({ default: m.InventoryView })));
const AutomationView = lazy(() => import("@/modules/automation/AutomationView").then((m) => ({ default: m.AutomationView })));
const AIAgentsView = lazy(() => import("@/modules/ai-agents/AIAgentsView").then((m) => ({ default: m.AIAgentsView })));

export type ViewKey =
  | "dash"
  | "invoices"
  | "clients"
  | "catalog"
  | "purchases"
  | "hr"
  | "accounting"
  | "settings"
  | "saas"
  | "platform-admin"
  | "audit"
  | "bulk-input"
  | "reports"
  | "team"
  | "account"
  | "inventory"
  | "automation"
  | "ai-agents";

const VALID_VIEWS: ViewKey[] = ["dash", "invoices", "clients", "catalog", "purchases", "hr", "accounting", "settings", "saas", "platform-admin", "audit", "bulk-input", "reports", "team", "account", "inventory", "automation", "ai-agents"];

function parseHash(): ViewKey {
  if (typeof window === "undefined") return "dash";
  const h = window.location.hash.replace(/^#/, "") as ViewKey;
  return VALID_VIEWS.includes(h) ? h : "dash";
}

export default function AppShell() {
  const { user, logout, perms, isAdmin, isFounder } = useAuth();
  const { activeCompany, companies, setActiveSlug, loadingCompanies, refreshCompanies, theme, toggleTheme } = useBrand();
  // Lazy-initialize from the URL hash so we don't need a setState-in-effect on mount
  const [view, setView] = useState<ViewKey>(() => parseHash());
  const [mobileSidebar, setMobileSidebar] = useState(false);

  useEffect(() => {
    const onHash = () => setView(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((v: ViewKey) => {
    window.location.hash = v;
    setView(v);
    setMobileSidebar(false);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      window.location.hash = "";
      window.location.reload();
    } catch {
      toast.error("تعذّر تسجيل الخروج");
    }
  }, [logout]);

  if (!user) return null;

  return (
    <CommandPaletteProvider>
      <div
        className="flex min-h-dvh bg-[#F9FAFB] text-foreground"
        dir="rtl"
      >
        <Sidebar
          user={user}
          view={view}
          navigate={navigate}
          perms={perms}
          isAdmin={isAdmin}
          isFounder={isFounder}
          activeCompany={activeCompany}
          companies={companies}
          setActiveSlug={setActiveSlug}
          loadingCompanies={loadingCompanies}
          onLogout={handleLogout}
          theme={theme}
          toggleTheme={toggleTheme}
          mobileOpen={mobileSidebar}
          onCloseMobile={() => setMobileSidebar(false)}
        />

        {/*
          Part 1.1 fix: the previous code had `marginRight: { md: "260px" } as unknown as string`
          which is a broken object-as-string cast (produces invalid CSS). Replaced with
          Tailwind logical-property class `md:me-[260px]` (margin-end = right in RTL,
          left in LTR). On mobile (<md) the sidebar is an off-canvas drawer so no margin.
          On desktop (md+) the sidebar is a fixed rail on the right (RTL) so the main
          content needs margin-end: 260px to not sit under it.
        */}
        <div className="flex flex-1 flex-col min-w-0 md:me-[260px] garfix-scroll">
          <Topbar
            user={user}
            activeCompany={activeCompany}
            onOpenMobile={() => setMobileSidebar(true)}
            theme={theme}
            toggleTheme={toggleTheme}
          />
          <main className="flex-1 p-4 md:p-6 overflow-y-auto max-md:pb-[var(--ai-bubble-safe-area)]">
            <ErrorBoundary>
            <Suspense
              fallback={
                <div className="p-12 text-center text-muted-foreground">
                  جارٍ التحميل…
                </div>
              }
            >
              {view === "dash" && <DashboardView />}
              {view === "invoices" && <InvoicesView />}
              {view === "clients" && <ClientsView />}
              {view === "catalog" && <CatalogView />}
              {view === "purchases" && <PurchasesView />}
              {view === "hr" && <HRView />}
              {view === "accounting" && <AccountingView />}
              {view === "settings" && <SettingsView activeCompany={activeCompany} onUpdated={refreshCompanies} />}
              {view === "saas" && (isAdmin || isFounder) && <SaaSControlPanel />}
              {view === "team" && (perms.settings_access || isAdmin || isFounder) && <TeamView />}
              {view === "platform-admin" && isFounder && <PlatformAdminPanel />}
              {view === "audit" && (isAdmin || isFounder) && <AuditView />}
              {view === "bulk-input" && <BulkInputView />}
              {view === "reports" && <ReportsView />}
              {view === "account" && <AccountView />}
              {view === "inventory" && (perms.settings_access || isAdmin || isFounder) && <InventoryView />}
              {view === "automation" && (perms.settings_access || isAdmin || isFounder) && <AutomationView />}
              {view === "ai-agents" && <AIAgentsView />}
            </Suspense>
            </ErrorBoundary>
          </main>
        </div>

        <AICopilotBubble />
      </div>
    </CommandPaletteProvider>
  );
}
