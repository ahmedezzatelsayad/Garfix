// Responsive: sm/md/lg breakpoints added
"use client";

import { useEffect, useState, useCallback, useRef, Suspense, lazy, startTransition } from "react";
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
// FE-01 FIX (Audit v2): import GarfixSkipLinks so skip-link targets work.
// The skip links were defined in garfix-ds but never rendered in the shell,
// making them dead code (WCAG 2.4.1 violation).
// Lazy Loading: Specific loading states for each view type
import {
  DashboardLoading,
  TableLoading,
  FormLoading,
  MinimalLoading,
  SettingsLoading,
  AdminLoading,
  ReportsLoading,
  AccountingLoading,
} from "@/components/ui/PageLoading";
// GarfiX AI - Enhanced components for "Everywhere" strategy


// Wire the real 7-step SetupWizard instead of the bare OnboardingScreen stub.
// SetupWizard has been in the repo since 2025-09 but was never rendered — it
// handles company creation, country selection, business type, feature
// toggles (employees/warehouse/WhatsApp), an AI smart-parse demo, and a
// completion step that auto-generates a chart of accounts. OnboardingScreen
// was a single-form stub created during a previous fix that ignored this
// existing component. We keep OnboardingScreen around as a fallback if
// SetupWizard itself errors out (defensive ErrorBoundary inside the wizard).
import { SetupWizard } from "@/modules/onboarding/SetupWizard";
import { OnboardingTour } from "@/modules/common/OnboardingTour";

// ════════════════════════════════════════════════════════════════════
// LAZY-LOADED VIEWS — Code Splitting Optimization
// Each view is loaded on demand with webpack chunk naming for better debugging
// ════════════════════════════════════════════════════════════════════

// Dashboard Views
const DashboardView = lazy(() => import(
  /* webpackChunkName: "dashboard" */
  "@/modules/dashboard/DashboardView"
).then((m) => ({ default: m.DashboardView })));

// Core Business Views (Table-based)
const InvoicesView = lazy(() => import(
  /* webpackChunkName: "invoices" */
  "@/modules/invoices/InvoicesView"
).then((m) => ({ default: m.InvoicesView })));

const ClientsView = lazy(() => import(
  /* webpackChunkName: "clients" */
  "@/modules/clients/ClientsView"
).then((m) => ({ default: m.ClientsView })));

const CatalogView = lazy(() => import(
  /* webpackChunkName: "catalog" */
  "@/modules/catalog/CatalogView"
).then((m) => ({ default: m.CatalogView })));

const PurchasesView = lazy(() => import(
  /* webpackChunkName: "purchases" */
  "@/modules/purchases/PurchasesView"
).then((m) => ({ default: m.PurchasesView })));

const InventoryView = lazy(() => import(
  /* webpackChunkName: "inventory" */
  "@/modules/inventory/InventoryView"
).then((m) => ({ default: m.InventoryView })));

// HR & Team Views
const HRView = lazy(() => import(
  /* webpackChunkName: "hr" */
  "@/modules/hr/HRView"
).then((m) => ({ default: m.HRView })));

const TeamView = lazy(() => import(
  /* webpackChunkName: "team" */
  "@/modules/team/TeamView"
).then((m) => ({ default: m.TeamView })));

// Financial Views
const AccountingView = lazy(() => import(
  /* webpackChunkName: "accounting" */
  "@/modules/accounting/AccountingView"
).then((m) => ({ default: m.AccountingView })));

const ReportsView = lazy(() => import(
  /* webpackChunkName: "reports" */
  "@/modules/reports/ReportsView"
).then((m) => ({ default: m.ReportsView })));

// Settings & Account Views (Form-based)
const SettingsView = lazy(() => import(
  /* webpackChunkName: "settings" */
  "@/modules/settings/SettingsView"
).then((m) => ({ default: m.SettingsView })));

const AccountView = lazy(() => import(
  /* webpackChunkName: "account" */
  "@/modules/account/AccountView"
).then((m) => ({ default: m.AccountView })));

// AI & Automation Views (Minimal loading)
const AutomationView = lazy(() => import(
  /* webpackChunkName: "automation" */
  "@/modules/automation/AutomationView"
).then((m) => ({ default: m.AutomationView })));

const AIAgentsView = lazy(() => import(
  /* webpackChunkName: "ai-agents" */
  "@/modules/ai-agents/AIAgentsView"
).then((m) => ({ default: m.AIAgentsView })));

// Company Agent — الوكيل الخاص بالشركة + n8n (Commercial v2: $20 add-on)
const CompanyAgentView = lazy(() => import(
  /* webpackChunkName: "company-agent" */
  "@/modules/company-agent/CompanyAgentView"
).then((m) => ({ default: m.CompanyAgentView })));

const BulkInputView = lazy(() => import(
  /* webpackChunkName: "bulk-input" */
  "@/modules/bulk-input/BulkInputView"
).then((m) => ({ default: m.BulkInputView })));

// Admin Views (Heavy - Admin loading state)
const SaaSControlPanel = lazy(() => import(
  /* webpackChunkName: "saas-admin" */
  "@/modules/saas/SaaSControlPanel"
).then((m) => ({ default: m.SaaSControlPanel })));

const PlatformAdminPanel = lazy(() => import(
  /* webpackChunkName: "platform-admin" */
  "@/modules/admin/PlatformAdminPanel"
).then((m) => ({ default: m.PlatformAdminPanel })));

const AuditView = lazy(() => import(
  /* webpackChunkName: "audit" */
  "@/modules/admin/EnhancedAuditView"
).then((m) => ({ default: m.EnhancedAuditView })));

const BillingView = lazy(() => import(
  /* webpackChunkName: "billing" */
  "@/modules/billing/BillingView"
).then((m) => ({ default: m.BillingView })));

const RolesView = lazy(() => import(
  /* webpackChunkName: "roles" */
  "@/modules/roles/RolesView"
).then((m) => ({ default: m.RolesView })));

// ════════════════════════════════════════════════════════════════════
// PRELOADING MAP — For hover-based preloading in Sidebar
// ════════════════════════════════════════════════════════════════════
export const preloadViewMap: Record<ViewKey, () => Promise<void>> = {
  dash: () => import(/* webpackChunkName: "dashboard" */ "@/modules/dashboard/DashboardView").then(() => {}),
  invoices: () => import(/* webpackChunkName: "invoices" */ "@/modules/invoices/InvoicesView").then(() => {}),
  clients: () => import(/* webpackChunkName: "clients" */ "@/modules/clients/ClientsView").then(() => {}),
  catalog: () => import(/* webpackChunkName: "catalog" */ "@/modules/catalog/CatalogView").then(() => {}),
  purchases: () => import(/* webpackChunkName: "purchases" */ "@/modules/purchases/PurchasesView").then(() => {}),
  hr: () => import(/* webpackChunkName: "hr" */ "@/modules/hr/HRView").then(() => {}),
  accounting: () => import(/* webpackChunkName: "accounting" */ "@/modules/accounting/AccountingView").then(() => {}),
  settings: () => import(/* webpackChunkName: "settings" */ "@/modules/settings/SettingsView").then(() => {}),
  saas: () => import(/* webpackChunkName: "saas-admin" */ "@/modules/saas/SaaSControlPanel").then(() => {}),
  "platform-admin": () => import(/* webpackChunkName: "platform-admin" */ "@/modules/admin/PlatformAdminPanel").then(() => {}),
  audit: () => import(/* webpackChunkName: "audit" */ "@/modules/admin/EnhancedAuditView").then(() => {}),
  "bulk-input": () => import(/* webpackChunkName: "bulk-input" */ "@/modules/bulk-input/BulkInputView").then(() => {}),
  reports: () => import(/* webpackChunkName: "reports" */ "@/modules/reports/ReportsView").then(() => {}),
  team: () => import(/* webpackChunkName: "team" */ "@/modules/team/TeamView").then(() => {}),
  account: () => import(/* webpackChunkName: "account" */ "@/modules/account/AccountView").then(() => {}),
  inventory: () => import(/* webpackChunkName: "inventory" */ "@/modules/inventory/InventoryView").then(() => {}),
  automation: () => import(/* webpackChunkName: "automation" */ "@/modules/automation/AutomationView").then(() => {}),
"ai-agents": () => import(/* webpackChunkName: "ai-agents" */ "@/modules/ai-agents/AIAgentsView").then(() => {}),
  "company-agent": () => import(/* webpackChunkName: "company-agent" */ "@/modules/company-agent/CompanyAgentView").then(() => {}),
  billing: () => import(/* webpackChunkName: "billing" */ "@/modules/billing/BillingView").then(() => {}),
  roles: () => import(/* webpackChunkName: "roles" */ "@/modules/roles/RolesView").then(() => {}),
};

/** Preload a view's chunk (call on hover/focus for instant navigation) */
export function preloadView(viewKey: ViewKey): void {
  const preload = preloadViewMap[viewKey];
  if (preload) {
    // Use startTransition for low-priority preloading
    startTransition(() => {
      preload().catch(() => {
        // Silently ignore preloading errors
      });
    });
  }
}

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
  | "ai-agents"
  | "company-agent"
  | "billing"
  | "roles";

const VALID_VIEWS: ViewKey[] = ["dash", "invoices", "clients", "catalog", "purchases", "hr", "accounting", "settings", "saas", "platform-admin", "audit", "bulk-input", "reports", "team", "account", "inventory", "automation", "ai-agents",
  "company-agent", "billing", "roles"];

function parseHash(): ViewKey {
  if (typeof window === "undefined") return "dash";
  // Hash may carry trailing query params, e.g. `#settings?tab=billing&payment=success`
  // (MyFatoorah callback redirects). Strip everything after `?` so the view key
  // resolves correctly; the payment-param is read separately by useSearchParams().
  const raw = window.location.hash.replace(/^#/, "");
  const key = raw.split("?", 1)[0] as ViewKey;
  return VALID_VIEWS.includes(key) ? key : "dash";
}

export default function AppShell(props: Record<string, unknown>) {
  return <Suspense fallback={null}><AppShellContent {...props} /></Suspense>;
}

function AppShellContent(_props: Record<string, unknown>) {
  const { user, logout, perms, isAdmin, isFounder } = useAuth();
  const { activeCompany, companies, setActiveSlug, loadingCompanies, refreshCompanies, theme, toggleTheme } = useBrand();
  // Lazy-initialize from the URL hash so we don't need a setState-in-effect on mount
  const [view, setView] = useState<ViewKey>(() => parseHash());
  // LINT FIX (من أسفل المكون): حالة المعالج وref التثبيت — كانتا بعد
  // early-return فكسرتا قواعد Hooks.
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const wizardForcedRef = useRef(false);
  const dismissWizard = useCallback(() => {
    wizardForcedRef.current = false;
    setWizardDismissed(true);
  }, []);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    // A11Y FIX (Review / 2026-08-24): skip links (and any in-page anchors like
    // #main-content / #main-navigation) change the hash WITHOUT being view
    // keys. Re-parsing the hash on every hashchange threw keyboard users from
    // e.g. #invoices back to the dashboard the moment they used a skip link.
    // Now: a hash that is NOT a valid view key leaves the current view alone.
    const onHash = () => {
      const raw = window.location.hash.replace(/^#/, "");
      const key = raw.split("?", 1)[0] as ViewKey;
      if (VALID_VIEWS.includes(key)) setView(key);
    };
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

  // تثبيت المعالج: بمجرد رؤية "لا شركات" يبقى مفتوحاً حتى بعد ظهور شركة
  // أثناء الرحلة (inside effect — لا تحويل حالة أثناء الرسم).
  useEffect(() => {
    if (!loadingCompanies && companies.length === 0) {
      wizardForcedRef.current = true;
    }
  }, [loadingCompanies, companies]);

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
  // P0 ONBOARDING FIX: كان المعالج يُغلق فور إنشاء الشركة (refreshCompanies
  // يحدّث القائمة فينقلب showOnboarding إلى false من منتصف الرحلة) — فلا يرى
  // المستخدم الجديد خطوات الدولة/التخصيص/النشاط/المميزات أبداً. الآن: بمجرد
  // فتح المعالج يبقى مفتوحاً حتى يُكمل المستخدم الخطوات أو يتخطاها صراحةً.
  // LINT FIX: الحالة والـ ref نُقلتا لأعلى المكون (كانتا بعد early-return —
  // استدعاء hooks شرطي يكسر قواعد React ويرمي عند تغيّر الترتيب).
  const needsOnboarding = !loadingCompanies && companies.length === 0;
  const showOnboarding = !wizardDismissed && (needsOnboarding || wizardForcedRef.current);

  return (
    <CommandPaletteProvider>
      {/* FE-01 FIX (Audit v2): Render skip links at the top of the shell so
          keyboard users can jump directly to main content / nav / footer.
          Targets (#main-content, #main-navigation, #main-footer) are set below. */}
      <div
        className="flex flex-col sm:flex-row min-h-dvh bg-background text-foreground"
        dir="rtl"
      >
        <div id="main-navigation" role="navigation" aria-label="القائمة الرئيسية">
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
        </div>

        {/*
          Part 1.1 fix: the previous code had `marginRight: { md: "260px" } as  string`
          which is a broken object-as-string cast (produces invalid CSS). Replaced with
          Tailwind logical-property class `md:me-[260px]` (margin-end = right in RTL,
          left in LTR). On mobile (<md) the sidebar is an off-canvas drawer so no margin.
          On desktop (md+) the sidebar is a fixed rail on the right (RTL) so the main
          content needs margin-end: 260px to not sit under it.
        */}
        <div className="flex flex-1 flex-col min-w-0 sm:ms-[200px] md:ms-[260px] garfix-scroll transition-all duration-300">
          <Topbar
            user={user}
            activeCompany={activeCompany}
            onOpenMobile={() => setMobileSidebar(true)}
            theme={theme}
            toggleTheme={toggleTheme}
          />
          <main id="main-content" className="flex-1 p-2 sm:p-3 md:p-6 overflow-y-auto max-md:pb-[var(--ai-bubble-safe-area)] glass">
            <ErrorBoundary>
            {/* ════════════════════════════════════════════════════════════
                MULTI-SUSPENSE BOUNDARIES — Optimized Loading States
                Each view group has a contextually appropriate skeleton UI
                that matches the expected content structure.
               ════════════════════════════════════════════════════════════ */}
            {showOnboarding ? (
              <Suspense fallback={<MinimalLoading />}>
                {/* Real 7-step onboarding wizard — was orphan in the repo
                    since 2025-09. The previous fix rendered a 250-line
                    OnboardingScreen stub here instead, which is why users saw
                    "no onboarding" — the stub barely explained anything and
                    immediately threw users into a dashboard with no company.
                    SetupWizard takes over the full screen (its own min-h-screen
                    gradient background) and calls onComplete when the user
                    finishes the final step, which triggers refreshCompanies()
                    → companies list populates → showOnboarding flips false →
                    the real dashboard mounts. */}
                <SetupWizard
                  onComplete={async () => { await refreshCompanies(); dismissWizard(); }}
                  onSkip={async () => { await refreshCompanies(); dismissWizard(); }}
                />
              </Suspense>
            ) : (
              <>
                {/* ── Dashboard ── KPI Cards + Charts Skeleton */}
                <Suspense fallback={<DashboardLoading />}>
                  {view === "dash" && <DashboardView />}
                </Suspense>

                {/* ── Table-Based Views ── Header + Filters + Table Skeleton */}
                <Suspense fallback={<TableLoading />}>
                  {view === "invoices" && <InvoicesView />}
                  {view === "clients" && <ClientsView />}
                  {view === "catalog" && <CatalogView />}
                  {view === "inventory" && ((perms.settings_access || isAdmin || isFounder) ? <InventoryView /> : <NoAccessView label="المخزون" />)}
                  {view === "purchases" && <PurchasesView />}
                  {view === "hr" && <HRView />}
                  {view === "bulk-input" && <BulkInputView />}
                </Suspense>

                {/* ── Reports ── Charts + Date Range Skeleton */}
                <Suspense fallback={<ReportsLoading />}>
                  {view === "reports" && <ReportsView />}
                </Suspense>

                {/* ── Accounting ── Tabs + Summary Cards + Ledger Skeleton */}
                <Suspense fallback={<AccountingLoading />}>
                  {view === "accounting" && <AccountingView />}
                </Suspense>

                {/* ── Form-Based Views ── Fields + Actions Skeleton */}
                <Suspense fallback={<SettingsLoading />}>
                  {view === "settings" && <SettingsView activeCompany={activeCompany} onUpdated={refreshCompanies} />}
                </Suspense>

                <Suspense fallback={<FormLoading />}>
                  {view === "account" && <AccountView />}
                </Suspense>

                {/* ── Admin Panels ── Stats Grid + Tables Skeleton */}
                <Suspense fallback={<AdminLoading />}>
                  {/* saas = لوحة المنصة على مستوى المستأجرين — founder فقط.
                      سابقًا كانت (isAdmin || isFounder) فكانت تظهر لكل مالك شركة. */}
                  {view === "saas" && (isFounder ? <SaaSControlPanel /> : <NoAccessView label="إدارة المنصة" />)}
                  {view === "platform-admin" && (isFounder ? <PlatformAdminPanel /> : <NoAccessView label="إدارة المؤسس" />)}
                  {view === "audit" && ((isAdmin || isFounder) ? <AuditView /> : <NoAccessView label="سجل التدقيق" />)}
                </Suspense>

                {/* ── Minimal Loading Views ── Simple Spinner */}
                <Suspense fallback={<MinimalLoading />}>
                  {view === "automation" && ((perms.settings_access || isAdmin || isFounder) ? <AutomationView /> : <NoAccessView label="الأتمتة" />)}
                  {view === "ai-agents" && <AIAgentsView />}
                  {view === "company-agent" && <CompanyAgentView />}
                  {view === "team" && ((perms.settings_access || isAdmin || isFounder) ? <TeamView /> : <NoAccessView label="الفريق" />)}
                  {view === "billing" && <BillingView />}
                  {view === "roles" && ((isAdmin || isFounder) ? <RolesView /> : <NoAccessView label="الأدوار والصلاحيات" />)}
                </Suspense>
              </>
            )}
            </ErrorBoundary>
          </main>
          <div id="main-footer">
          <AppFooter
            version={process.env.NEXT_PUBLIC_APP_VERSION || "12"}
            commitSha={process.env.COMMIT_SHA}
          />
          </div>
        </div>

        <AICopilotBubble />
        <OnboardingTour />
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
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
        !
      </div>
      <h2 className="text-lg sm:text-xl font-extrabold mb-1 text-emerald-400">لا تملك صلاحية الوصول</h2>
      <p className="text-sm text-muted-foreground">
        هذه الصفحة ({label}) متاحة للمسؤولين فقط. تواصل مع مدير المنصة إذا كنت تعتقد أن هذا خطأ.
      </p>
    </div>
  );
}
