// Responsive: sm/md/lg breakpoints added
"use client";

import { useEffect, useState, useCallback, Suspense, lazy } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { toast } from "sonner";
import { AICopilotBubble } from "@/modules/ai/AICopilotBubble";
import { CommandPaletteProvider } from "@/components/garfix/CommandPaletteProvider";
import { ErrorBoundary } from "@/components/garfix/ErrorBoundary";
import { AppFooter } from "@/components/garfix/AppFooter";
// GarfiX AI - Enhanced components for "Everywhere" strategy
import { 
  GarfixAIIcon,
  AICelebration,
  AIOnboardingTour,
  AIFeatureDiscovery,
} from "@/components/garfix";
// Wire the real 7-step SetupWizard instead of the bare OnboardingScreen stub.
// SetupWizard has been in the repo since 2025-09 but was never rendered — it
// handles company creation, country selection, business type, feature
// toggles (employees/warehouse/WhatsApp), an AI smart-parse demo, and a
// completion step that auto-generates a chart of accounts. OnboardingScreen
// was a single-form stub created during a previous fix that ignored this
// existing component. We keep OnboardingScreen around as a fallback if
// SetupWizard itself errors out (defensive ErrorBoundary inside the wizard).
import { SetupWizard } from "@/modules/onboarding/SetupWizard";

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
const AuditView = lazy(() => import("@/modules/admin/EnhancedAuditView").then((m) => ({ default: m.EnhancedAuditView })));
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
  // Hash may carry trailing query params, e.g. `#settings?tab=billing&payment=success`
  // (MyFatoorah callback redirects). Strip everything after `?` so the view key
  // resolves correctly; the payment-param is read separately by useSearchParams().
  const raw = window.location.hash.replace(/^#/, "");
  const key = raw.split("?", 1)[0] as ViewKey;
  return VALID_VIEWS.includes(key) ? key : "dash";
}

export default function AppShell() {
  const { user, logout, perms, isAdmin, isFounder } = useAuth();
  const { activeCompany, companies, setActiveSlug, loadingCompanies, refreshCompanies, theme, toggleTheme } = useBrand();
  // Lazy-initialize from the URL hash so we don't need a setState-in-effect on mount
  const [view, setView] = useState<ViewKey>(() => parseHash());
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const onHash = () => setView(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Surface MyFatoorah payment callback result as a toast. The callback
  // redirects to /?payment=<status>#settings so this runs once on mount.
  // Without this, paying users landed on the dashboard with zero feedback.
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (!payment) return;
    if (payment === "success") {
      toast.success("تمت عملية الدفع بنجاح! مفاعلاتك مُفعّلة الآن.");
    } else if (payment === "failed" || payment === "error") {
      toast.error("تعذّر إتمام عملية الدفع. يُرجى المحاولة مرة أخرى أو التواصل مع الدعم.");
    } else if (payment === "cancelled") {
      toast.info("تم إلغاء عملية الدفع.");
    }
    // Clear the param so a refresh doesn't re-show the toast.
    if (typeof window !== "undefined" && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      url.searchParams.delete("tab");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

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

  // First-run onboarding: if companies have finished loading and the user
  // has zero companies, show the company-creation wizard instead of the
  // dashboard. Without this, the dashboard renders with no active company
  // → all API queries 401/empty → views either show "no data" or crash
  // on undefined fields. This is the gap that produced the user's complaint
  // "مفيش onboarding ومفيش داش بورد".
  const showOnboarding = !loadingCompanies && companies.length === 0;

  return (
    <CommandPaletteProvider>
      <div
        className="flex flex-col sm:flex-row min-h-dvh bg-background text-foreground"
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
        <div className="flex flex-1 flex-col min-w-0 sm:me-[200px] md:me-[260px] garfix-scroll">
          <Topbar
            user={user}
            activeCompany={activeCompany}
            onOpenMobile={() => setMobileSidebar(true)}
            theme={theme}
            toggleTheme={toggleTheme}
          />
          <main className="flex-1 p-2 sm:p-3 md:p-6 overflow-y-auto max-md:pb-[var(--ai-bubble-safe-area)]">
            <ErrorBoundary>
            <Suspense
              fallback={
                <div className="p-4 sm:p-8 md:p-12 text-center text-muted-foreground">
                  جارٍ التحميل…
                </div>
              }
            >
              {showOnboarding ? (
                // Real 7-step onboarding wizard — was orphan in the repo
                // since 2025-09. The previous fix rendered a 250-line
                // OnboardingScreen stub here instead, which is why users saw
                // "no onboarding" — the stub barely explained anything and
                // immediately threw users into a dashboard with no company.
                // SetupWizard takes over the full screen (its own min-h-screen
                // gradient background) and calls onComplete when the user
                // finishes the final step, which triggers refreshCompanies()
                // → companies list populates → showOnboarding flips false →
                // the real dashboard mounts.
                <SetupWizard
                  onComplete={async () => { await refreshCompanies(); }}
                  onSkip={async () => { await refreshCompanies(); }}
                />
              ) : (
                <>
                  {view === "dash" && <DashboardView />}
                  {view === "invoices" && <InvoicesView />}
                  {view === "clients" && <ClientsView />}
                  {view === "catalog" && <CatalogView />}
                  {view === "purchases" && <PurchasesView />}
                  {view === "hr" && <HRView />}
                  {view === "accounting" && <AccountingView />}
                  {view === "settings" && <SettingsView activeCompany={activeCompany} onUpdated={refreshCompanies} />}
                  {view === "saas" && (isAdmin || isFounder ? <SaaSControlPanel /> : <NoAccessView label="إدارة المنصة" />)}
                  {view === "team" && ((perms.settings_access || isAdmin || isFounder) ? <TeamView /> : <NoAccessView label="الفريق" />)}
                  {view === "platform-admin" && (isFounder ? <PlatformAdminPanel /> : <NoAccessView label="إدارة المؤسس" />)}
                  {view === "audit" && ((isAdmin || isFounder) ? <AuditView /> : <NoAccessView label="سجل التدقيق" />)}
                  {view === "bulk-input" && <BulkInputView />}
                  {view === "reports" && <ReportsView />}
                  {view === "account" && <AccountView />}
                  {view === "inventory" && ((perms.settings_access || isAdmin || isFounder) ? <InventoryView /> : <NoAccessView label="المخزون" />)}
                  {view === "automation" && ((perms.settings_access || isAdmin || isFounder) ? <AutomationView /> : <NoAccessView label="الأتمتة" />)}
                  {view === "ai-agents" && <AIAgentsView />}
                </>
              )}
            </Suspense>
            </ErrorBoundary>
          </main>
          <AppFooter
            version={process.env.NEXT_PUBLIC_APP_VERSION || "12"}
            commitSha={process.env.COMMIT_SHA}
          />
        </div>

        <AICopilotBubble />
      </div>
    </CommandPaletteProvider>
  );
}

/** Fallback rendered when a user navigates to a hash view they don't have
 * permission to see (e.g. #platform-admin as a non-founder). Previously the
 * AppShell rendered NOTHING for these views — a blank main area with no
 * explanation, which users interpreted as "the app is broken".
 */
function NoAccessView({ label }: { label: string }) {
  return (
    <div className="p-8 md:p-12 text-center" dir="rtl">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-destructive/10 text-destructive mb-3">
        !
      </div>
      <h2 className="text-lg sm:text-xl font-extrabold mb-1">لا تملك صلاحية الوصول</h2>
      <p className="text-sm text-muted-foreground">
        هذه الصفحة ({label}) متاحة للمسؤولين فقط. تواصل مع مدير المنصة إذا كنت تعتقد أن هذا خطأ.
      </p>
    </div>
  );
}
