# Audit 3 — Navigation Integrity Audit

**Task ID:** 4
**Agent:** Explore
**Repo root:** `/home/z/my-project/audit/Garfix/`
**Scope:** End-to-end audit of every navigation flow — forward nav, backward nav, breadcrumbs, browser back/forward, 404 recovery, unauthorized redirects, expired session redirects, tenant switching, company switching.
**Method:** Static code inspection of middleware, page routes, AppShell, Sidebar, Topbar, AuthContext, BrandContext, api-client, CommandPalette, SetupWizard, payment callback, and public legal pages. No files modified (audit-only).
**Prior-audit cross-references:** Audit 1 slice A (Task 2-a — routes), Audit 1 slice C (Task 2-c — env/external URLs), Audit 6 (Task 7 — production readiness).

---

## A. Flow verification matrix

| Flow ID | Description | Works? | Issues | Fix |
|---------|-------------|--------|--------|-----|
| 1 | Landing (`/`) → Login (`/login`) → Dashboard (`/` with auth → AppShell `#dash`) | ⚠️ Partial | (a) Middleware never redirects logged-out users from `/` to `/login` — page.tsx renders the marketing landing page instead. (b) No breadcrumbs anywhere in the app. (c) `e2e/auth.spec.ts:13` expects `toHaveURL(/\/(login|auth)/)` after `page.goto("/")` — that assertion is wrong (URL stays `/`); test only "passes" because subsequent assertions are wrapped in `if (isVisible)` guards. | Either change the e2e test to expect `/` (landing) or add an explicit redirect. Decide on UX: is "show landing" or "redirect to /login" the intended behavior for logged-out users at `/`? See **C1**. |
| 2 | Landing → Signup (`/signup`) → Onboarding (SetupWizard) → Dashboard | ❌ Broken | (a) Signup page redirects to `/login` after 2s (`signup/page.tsx:87`), NOT to onboarding. (b) Onboarding (SetupWizard) is triggered INSIDE AppShell when `companies.length === 0` (`AppShell.tsx:137`), so the actual flow is: Signup → 2s wait → /login → manual login → / → AppShell → SetupWizard. (c) Anti-enumeration message "If this email isn't already registered, your account has been created" misleads users whose email WAS already registered — they click "Continue to sign in", try to log in with a non-existent password, fail, and have no recourse. | See **B1** + **C2**. |
| 3 | Dashboard → each Sidebar item (18 views via hash router) | ⚠️ Partial | (a) Hash router works: `navigate(v)` sets `window.location.hash`, hashchange listener fires, `setView(v)` runs, view renders. (b) Mobile drawer closes after navigate. (c) **Unauthorized views render BLANK**: when a non-admin/non-founder user types `#saas`, `#platform-admin`, `#audit`, `#team`, `#inventory`, or `#automation` in the URL (or clicks the hash in an email/notification), AppShell's conditional render `{view === "saas" && (isAdmin \|\| isFounder) && <SaaSControlPanel />}` evaluates to `false` → NOTHING renders in `<main>`. No 403 page, no redirect, no "you don't have access" message — just an empty main area with the Sidebar still visible. | See **B2**. |
| 4 | Dashboard → Profile (`#account`) → Logout → Landing | ⚠️ Partial | (a) `#account` renders AccountView (no perm check — always visible). (b) **AccountView has NO logout button** — logout is only in the Sidebar footer (`Sidebar.tsx:283-288`). User on `#account` must scroll back to the Sidebar to log out. (c) `handleLogout` (`AppShell.tsx:119-127`) calls `logout()` then `window.location.reload()`. After reload, `fetchMe()` returns null → page.tsx renders EnhancedLandingPage (landing page, NOT `/login`). (d) `e2e/auth.spec.ts:80` expects logout to redirect to `/login` — that assertion is wrong (URL stays `/` after reload). (e) **Race condition**: `AuthContext.logout()` calls `setUser(null)` BEFORE the `/api/auth/logout` fetch resolves (`AuthContext.tsx:137-146`). If the network call fails (caught silently with `.catch(() => {})`), user state is null but cookies may still be valid → after `window.location.reload()`, `fetchMe()` succeeds → user is back, thinking they logged out. | See **B3** + **C3**. |
| 5 | Dashboard → Settings (`#settings`) → Company switcher → different company dashboard | ⚠️ Partial | (a) Sidebar company selector dropdown lists all companies (`Sidebar.tsx:184-193`). (b) `setActiveSlug(slug)` updates state + localStorage (`BrandContext.tsx:163-169`). (c) `activeCompany` changes → all queries that read `activeCompany?.slug` get a new TanStack Query key → auto-refetch. ✓ (d) **URL does NOT change** when switching companies — slug is stored only in `localStorage["garfix:active-slug"]`. (e) Browser back/forward does NOT restore previous company. (f) Deep-linking a specific company is impossible (URL doesn't carry the slug). (g) After switching companies the view stays at `#settings`; user must manually click `#dash` to see the new company's dashboard. | See **B4** + **C4**. |
| 6 | Expired access token → refresh → continue, OR redirect to `/login` | ❌ Broken | (a) `authedFetch` (`AuthContext.tsx:86-107`) detects 401 → calls `/api/auth/refresh` → on success retries the original request. ✓ (b) Refresh token rotation works (`api/auth/refresh/route.ts:67-78` blacklists the consumed JTI). ✓ (c) **If refresh fails (refresh token expired/revoked), `authedFetch` returns the original 401 Response** → `apiGet/apiPost` throws `ApiError(401)` → React Query receives the error → each view shows its own error state. (d) **NO global redirect to `/login` on persistent 401**. The user is stuck on a broken page with per-view error messages until they manually refresh → `fetchMe()` returns null → page.tsx renders the landing page (NOT `/login`). (e) NO "session expired" toast before the redirect. | See **B5** + **C5**. |
| 7 | Unauthorized access to admin/founder route → redirect to `/login` or show 403 | ❌ Broken | (a) API routes correctly use `requireFounder` / `requireAdmin` / `requirePermission` → return 403 JSON (`lib/middleware.ts:176-203`). ✓ (b) **Client-side: NO 403 handling at all**. AppShell's conditional render `{view === "platform-admin" && isFounder && <PlatformAdminPanel />}` silently renders nothing when the condition is false. No 403 page, no redirect, no inline "access denied" message. (c) **`/founder-panel/*` pages have NO client-side auth check**. Middleware comment (`src/middleware.ts:43`) claims "founder-panel has its own auth check inside the page" — but the code does NOT do this. Pages render the loading skeleton → `useMissionControl()`/`useAIFabric()`/`useFinOps()` fetch `/api/founder-panel/*` → 401 (unauth) or 403 (authed non-founder) → page shows "Connection Error" with the raw API error message. No redirect to `/login`. | See **B6** + **B7**. |
| 8 | Public legal pages link back to landing or to each other | ⚠️ Partial | (a) `FooterPageLayout` has `<Link href="/">` for both the logo and the "العودة للرئيسية" button (`FooterPageLayout.tsx:29, 39`). ✓ (b) `ProfessionalFooter` links to all 8 legal/support pages + 4 landing-page sections (`/#about`, `/#features`, `/#pricing`, `/#faq`). ✓ (c) **`ProfessionalFooter` uses raw `<a>` tags** (`ProfessionalFooter.tsx:166-172`) instead of `<Link>` → every click causes a full page reload, losing SPA state. (d) **`refund/page.tsx` (L125, L129), `terms/page.tsx` (L134), `privacy/page.tsx` (L135, L170) still use raw `<a>`** for `/contact`, `/help`, `/cookies` links — same full-reload issue. (e) `AppFooter.tsx` already uses `<Link>` correctly (Audit 1's P3 here was fixed). (f) **`/#about` / `/#features` / `/#pricing` / `/#faq` only resolve on the unauthed landing page** — for authed users these hashes conflict with AppShell's hash router (`parseHash()` returns "dash" for unknown hashes, so the user lands on the dashboard instead of scrolling to a section). Not a bug per se because the ProfessionalFooter is not rendered inside AppShell — but worth noting. | See **B8**. |
| 9 | Mobile sidebar: open drawer → click item → drawer closes → view changes | ✅ Works | (a) Topbar hamburger (`Topbar.tsx:41-50`) calls `onOpenMobile` → `setMobileSidebar(true)`. (b) Sidebar drawer slides in from the right (RTL-correct) with `translate-x-0` when `mobileOpen` (`Sidebar.tsx:114-128`). (c) Overlay closes drawer on click (`Sidebar.tsx:97-102`). (d) `navigate(v)` in AppShell calls `setMobileSidebar(false)` after `setView(v)` (`AppShell.tsx:113-117`) → drawer closes after click. (e) X button closes drawer (`Sidebar.tsx:131-139`). (f) Desktop: drawer is always visible (`md:translate-x-0`). | No fix needed. |
| 10 | ⌘K CommandPalette: open → search → enter on result → navigates to view | ⚠️ Partial | (a) `CommandPaletteProvider` listens for Ctrl+K / Cmd+K globally (`CommandPaletteProvider.tsx:20-27`). ✓ (b) Topbar search button dispatches `garfix:open-command-palette` event (`Topbar.tsx:28-30`). ✓ (c) Palette opens, focuses input, filters NAV_ITEMS + QUICK_ACTIONS + invoices + clients. ✓ (d) Enter triggers `onSelect` → `navigate(hash)` → `window.location.hash = hash` → `onClose()`. ✓ (e) All 18 NAV_ITEMS hashes are valid ViewKeys (Audit 1's missing `automation` + `ai-agents` are now present). ✓ (f) **Palette does NOT filter NAV_ITEMS by user permissions** — a non-admin user can search "platform-admin" and press Enter → hash becomes `#platform-admin` → AppShell renders nothing (same blank-main-area issue as Flow 3/7). | See **B9**. |
| 11 | Theme toggle (light/dark) persists across navigation | ⚠️ Partial | (a) `BrandContext.theme` state initialized from `document.documentElement.classList.contains("dark")` (set by `layout.tsx` theme-init script before hydration). ✓ (b) `toggleTheme` flips state, effect adds/removes `.dark` class on `<html>`, writes to `localStorage["garfix:theme"]` (`BrandContext.tsx:79-87`). ✓ (c) Theme persists across navigation (localStorage). ✓ (d) **Two theme systems running simultaneously**: `Providers.tsx:43` wraps children in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` from `next-themes` (uses `localStorage["theme"]` by default), AND `BrandContext` manages its own theme state (uses `localStorage["garfix:theme"]`). They both toggle the `.dark` class on `<html>` but read different storage keys. If they ever disagree (e.g., user changes theme via `BrandContext.toggleTheme`, which writes `garfix:theme` but not `theme`), a re-mount where next-themes re-initializes could flip the class back to its own stored value. In practice they usually converge (both default to OS preference) but this is fragile. | See **B10** + **C6**. |
| 12 | Payment flow: Dashboard → Settings → subscribe → MyFatoorah → callback → back to `/?payment=success#settings` → toast shown | ❌ Broken | (a) **`useInitiatePayment` hook exists** (`hooks/queries/platform-admin.ts:959-967`) but is **NOT called from any UI component** (verified via `rg "useInitiatePayment"` — only the definition site and the `index.ts` barrel export reference it; zero call sites in `src/modules/`). (b) **`SettingsView` (`#settings`) has NO "Subscribe" or "Upgrade plan" button** — it only renders `CompanySettingsForm` + `TemplateSettingsForm` + `TemplateListManager`. (c) `SaaSControlPanel` (`#saas`) only LISTS existing payments (read-only) — no initiate button. (d) The expected entry point "Dashboard → Settings → subscribe" **does not exist in the UI**. (e) The BACKEND works: `/api/saas/payments/callback` verifies payment via `GetPaymentStatus`, updates `PaymentTransaction`, redirects to `/?payment=<status>#settings`. ✓ (f) AppShell's `useEffect` (`AppShell.tsx:94-111`) reads `payment=success` from `useSearchParams()` → shows `toast.success("تمت عملية الدفع بنجاح! مفاعلاتك مُفعّلة الآن.")`. ✓ (g) `parseHash()` strips `?...` from the hash (`AppShell.tsx:72-74`) → `#settings` resolves correctly. ✓ (h) AppShell cleans up the URL via `history.replaceState` (deletes `payment` + `tab`). ✓ (i) **`APP_URL` env var is not enforced** (`api/saas/payments/initiate/route.ts:216-217` uses `process.env.APP_URL \|\| "http://localhost:3000"`) → in production without `APP_URL` set, MyFatoorah receives `http://localhost:3000/api/saas/payments/callback` as the `CallBackUrl` → MyFatoorah cannot reach localhost → user pays but is never redirected back to the app. (Already flagged as P1 in Audits 2-c and 7.) | See **B11** + **C7**. |

**Summary:** 12 flows audited — **1 fully works** (Flow 9), **6 partially work** (Flows 1, 3, 4, 5, 8, 10, 11), **5 broken** (Flows 2, 6, 7, 12, and the 404 recovery path described below).

---

## B. Broken navigation paths

### B1. Signup flow does not route to onboarding — redirects to `/login` instead

- **Entry point:** `src/app/signup/page.tsx:87` — `setTimeout(() => router.push("/login"), 2000);`
- **Expected behavior (per task spec):** Landing → Signup → Onboarding (SetupWizard) → Dashboard.
- **Actual behavior:** Signup → 2s wait → `/login` → user must manually log in → `/` → AppShell detects `companies.length === 0` → SetupWizard renders. The onboarding step IS reached, but only after a manual login detour that the task flow doesn't mention.
- **Severity:** P2 (UX — flow works but is suboptimal; anti-enumeration design choice conflicts with auto-login).
- **Suggested fix:** Either (a) change the server's `/api/auth/register` to issue a session on success (abandoning the anti-enumeration behavior) and have `signup/page.tsx` push to `/` directly so AppShell→SetupWizard mounts immediately, OR (b) keep anti-enumeration but make the success-screen copy explicit: "If this email is new, check your inbox for a verification link. If you already have an account, [Sign in] instead." (currently the copy is ambiguous). Also remove the `setTimeout(…, 2000)` auto-redirect — let the user click "Continue to sign in" themselves.

### B2. Unauthorized hash-route views render BLANK main area (no 403, no redirect)

- **Entry point:** `src/modules/common/AppShell.tsx:213-222` — the conditional renders:
  ```
  {view === "saas" && (isAdmin || isFounder) && <SaaSControlPanel />}
  {view === "team" && (perms.settings_access || isAdmin || isFounder) && <TeamView />}
  {view === "platform-admin" && isFounder && <PlatformAdminPanel />}
  {view === "audit" && (isAdmin || isFounder) && <AuditView />}
  {view === "inventory" && (perms.settings_access || isAdmin || isFounder) && <InventoryView />}
  {view === "automation" && (perms.settings_access || isAdmin || isFounder) && <AutomationView />}
  ```
- **Expected behavior:** When a non-authorized user lands on one of these hashes (via URL bar, email link, notification, or CommandPalette), show a 403 "access denied" page or redirect to `#dash`.
- **Actual behavior:** The conditional evaluates to `false` → React renders `false` → `<main>` is empty. The Sidebar stays visible. The user sees a blank content area with no explanation.
- **Severity:** P1 (broken UX, security-adjacent — user has no feedback that they lack access).
- **Suggested fix:** Add a fallback at the end of the view switch in `AppShell.tsx` (after line 222):
  ```tsx
  {/* Fallback for authorized-but-not-permitted views */}
  {view !== "dash" && view !== "invoices" && view !== "clients" && view !== "catalog"
    && view !== "purchases" && view !== "hr" && view !== "accounting"
    && view !== "reports" && view !== "bulk-input" && view !== "account" && view !== "ai-agents"
    && !(
      (view === "saas" && (isAdmin || isFounder))
      || (view === "team" && (perms.settings_access || isAdmin || isFounder))
      || (view === "platform-admin" && isFounder)
      || (view === "audit" && (isAdmin || isFounder))
      || (view === "inventory" && (perms.settings_access || isAdmin || isFounder))
      || (view === "automation" && (perms.settings_access || isAdmin || isFounder))
    )
  && (
    <div className="p-8 text-center text-muted-foreground">
      <ShieldOff className="mx-auto mb-3 h-10 w-10 opacity-50" />
      <p className="text-sm">ليس لديك صلاحية للوصول إلى هذه الصفحة.</p>
      <button onClick={() => navigate("dash")} className="mt-3 text-primary underline">العودة للوحة التحكم</button>
    </div>
  )}
  ```
  Or refactor the view switch into a helper that returns either the permitted component or a `<NoAccess />` component.

### B3. Logout race condition — `setUser(null)` before API resolves

- **Entry point:** `src/context/AuthContext.tsx:137-146` —
  ```ts
  const logout = useCallback(async () => {
    setUser(null);
    const csrf = getCsrfToken();
    const headers: Record<string, string> = {};
    if (csrf) headers["X-CSRF-Token"] = csrf;
    await fetch("/api/auth/logout", {
      method: "POST", headers, credentials: "include",
    }).catch(() => {});  // ← silently swallows errors
  }, []);
  ```
- **Expected behavior:** Logout API succeeds → cookies cleared → user state null → reload → landing page.
- **Actual behavior:** If the `/api/auth/logout` fetch fails (network error, 5xx, etc.), the `.catch(() => {})` swallows the error. `setUser(null)` already ran. `AppShell.handleLogout` then calls `window.location.reload()`. On reload, `fetchMe()` runs → if cookies are still valid (logout never reached the server) → user is set again → AppShell re-mounts. The user thinks they logged out but they're still logged in.
- **Severity:** P1 (security-adjacent — false logout).
- **Suggested fix:** Reorder so `setUser(null)` runs AFTER the fetch resolves (or only on success):
  ```ts
  const logout = useCallback(async () => {
    const csrf = getCsrfToken();
    const headers: Record<string, string> = {};
    if (csrf) headers["X-CSRF-Token"] = csrf;
    try {
      await fetch("/api/auth/logout", {
        method: "POST", headers, credentials: "include",
      });
    } catch {
      // Network error — still clear local state so the UI reflects intent.
      // The next fetchMe() will re-establish the session if cookies are still valid.
    }
    setUser(null);
  }, []);
  ```
  Also surface a toast on error: `toast.error("تعذّر تسجيل الخروج — تحقق من اتصالك بالإنترنت")` — `AppShell.handleLogout` already has a `try/catch` that toasts on error, but the catch is unreachable because `logout()` never throws (`.catch(() => {})`).

### B4. Company switch does NOT update the URL

- **Entry point:** `src/context/BrandContext.tsx:163-169` —
  ```ts
  const setActiveSlug = useCallback((slug: string | null) => {
    setActiveSlugState(slug);
    if (typeof window !== "undefined") {
      if (slug) localStorage.setItem(STORAGE_KEY, slug);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);
  ```
- **Expected behavior:** When the user switches companies, the URL should reflect the active company (e.g., `/?company=acme#dash`) so that (a) browser back/forward restores the previous company, (b) deep-linking a specific company works, (c) refreshing the page restores the same company.
- **Actual behavior:** Only `localStorage` is updated. The URL is unchanged. Browser back/forward does nothing (no history entry). Deep-linking is impossible. Refreshing DOES restore the company (from localStorage) — so the bug is subtle and only manifests when sharing URLs or using back/forward.
- **Severity:** P2 (UX — works for the common case, fails for power users).
- **Suggested fix:** Use `history.replaceState` to add `?company=<slug>` to the URL on switch:
  ```ts
  const setActiveSlug = useCallback((slug: string | null) => {
    setActiveSlugState(slug);
    if (typeof window !== "undefined") {
      if (slug) localStorage.setItem(STORAGE_KEY, slug);
      else localStorage.removeItem(STORAGE_KEY);
      // Reflect in URL so back/forward + deep-linking work
      const url = new URL(window.location.href);
      if (slug) url.searchParams.set("company", slug);
      else url.searchParams.delete("company");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  ```
  Then in the `useEffect` that syncs companies from TanStack Query, prioritize the URL `?company=` param over localStorage when restoring. (Using `replaceState` rather than `pushState` avoids polluting browser history on every switch — but if you want back/forward to restore companies, use `pushState` instead. Decide which UX is intended — see **C4**.)

### B5. No global 401 redirect — expired session leaves user stuck on broken page

- **Entry point:** `src/context/AuthContext.tsx:86-107` — `authedFetch` retries once on 401 via `/api/auth/refresh`. If refresh fails, returns the original 401 Response. `src/hooks/api-client.ts:107-116` (`apiGet`) throws `ApiError(401)`. No global handler intercepts this.
- **Expected behavior:** When refresh fails (refresh token expired/revoked), the user should be redirected to `/login` (or see a "session expired" toast + redirect).
- **Actual behavior:** `ApiError(401)` propagates to React Query → each view shows its own error state (typically a toast or inline "فشل تحميل البيانات"). The user remains on the page. The next time they manually refresh, `fetchMe()` returns null → page.tsx renders the landing page (not `/login`).
- **Severity:** P1 (broken UX for expired sessions).
- **Suggested fix:** Add a global 401 interceptor. Two options:
  - **(a) In `apiGet`/`apiPost`/etc. (api-client.ts):** after `authedFetch` returns a 401, check if the response is still 401 (meaning refresh also failed) → call `window.location.href = "/login?reason=session_expired"` and throw a sentinel error.
  - **(b) In `QueryClient` default options (`Providers.tsx`):** add an `onError` callback that checks `error instanceof ApiError && error.status === 401` and redirects.
  
  Option (a) is more reliable (catches non-React-Query fetches too). Implement in `api-client.ts`:
  ```ts
  let redirectingToLogin = false;
  function handle401() {
    if (redirectingToLogin) return;
    redirectingToLogin = true;
    if (typeof window !== "undefined") {
      window.location.href = "/login?reason=session_expired";
    }
  }
  // In apiGet/apiPost/etc. after authedFetch:
  if (res.status === 401) {
    handle401();
    throw new ApiError(401, { error: "Session expired" });
  }
  ```
  And in `login/page.tsx`, read `?reason=session_expired` and show a toast "انتهت جلستك. يرجى تسجيل الدخول مرة أخرى." before the form renders.

### B6. `/founder-panel/*` pages have NO client-side auth check

- **Entry point:** `src/app/founder-panel/mission-control/page.tsx`, `src/app/founder-panel/ai-fabric/page.tsx`, `src/app/founder-panel/finops/page.tsx` — all three pages directly call `useMissionControl()` / `useAIFabric()` / `useFinOps()` with no `useAuth()` check, no redirect, no 403 handling.
- **Expected behavior:** Unauthenticated users hitting `/founder-panel/mission-control` should be redirected to `/login`. Authenticated non-founder users should see a 403 "founder only" page.
- **Actual behavior:** Page renders loading skeleton → API returns 401 (unauth) or 403 (authed non-founder) → React Query receives error → page shows "Connection Error" with the raw API error message ("غير مصرّح" or "هذه العملية متاحة للمؤسس فقط"). No redirect.
- **Severity:** P1 (broken UX + leaky error messages — unauth users see the page shell before the error).
- **Suggested fix:** Add a client-side guard at the top of each founder-panel page:
  ```tsx
  const { user, loading, isFounder } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login?redirect=" + encodeURIComponent(window.location.pathname)); return; }
    if (!isFounder) { router.replace("/?error=founder_only"); return; }
  }, [user, loading, isFounder, router]);
  if (loading || !user || !isFounder) return <LoadingSpinner />;
  ```
  Or extract this into a `<FounderOnly>` wrapper component. Also fix the misleading comment in `src/middleware.ts:43` (`// founder-panel has its own auth check inside the page`).

### B7. `/founder-panel` is in `PUBLIC_PAGE_PREFIXES` — middleware skips auth entirely

- **Entry point:** `src/middleware.ts:43` — `"/founder-panel",  // founder-panel has its own auth check inside the page`
- **Expected behavior:** Either middleware enforces auth (redirects unauth to `/login`) OR the page-level guard does (per B6).
- **Actual behavior:** Middleware marks `/founder-panel/*` as public → no auth check → page renders → API call returns 401/403 → page shows error. The comment claims the page does its own check, but it doesn't (see B6).
- **Severity:** P2 (compounds B6).
- **Suggested fix:** Either (a) remove `"/founder-panel"` from `PUBLIC_PAGE_PREFIXES` so middleware returns 401 JSON for unauth users (but that's also wrong — see B12 below — a 401 JSON for a page route is broken), OR (b) keep it in `PUBLIC_PAGE_PREFIXES` AND implement the client-side guard per B6. Option (b) is cleaner because page routes should render HTML, not JSON.

### B8. Public legal pages still use raw `<a>` tags (full page reload)

- **Entry points:**
  - `src/components/garfix/ProfessionalFooter.tsx:166-172` — 12 raw `<a>` tags for footer links (8 legal/support pages + 4 landing sections)
  - `src/app/refund/page.tsx:125` — `<a href="/contact">`
  - `src/app/refund/page.tsx:129` — `<a href="/help">`
  - `src/app/terms/page.tsx:134` — `<a href="/contact">`
  - `src/app/privacy/page.tsx:135` — `<a href="/cookies">`
  - `src/app/privacy/page.tsx:170` — `<a href="/contact">`
- **Expected behavior:** Internal links use `next/link`'s `<Link>` for SPA navigation (no full reload).
- **Actual behavior:** Raw `<a>` triggers a full page reload — the browser re-fetches the HTML, re-downloads/parses the JS bundle (cache helps but still parses), re-runs the auth bootstrap (`fetchMe()`), and re-mounts React. Loses in-memory state (e.g., draft form input on the contact page).
- **Severity:** P3 (UX nit — links work, just non-SPA).
- **Suggested fix:** Replace all raw `<a>` tags pointing to internal routes with `<Link>` from `next/link`. For `ProfessionalFooter.tsx`, change line 166 from `<a href={link.href} ...>` to `<Link href={link.href} ...>` and add `import Link from "next/link"`. For the 5 instances in `refund/page.tsx`, `terms/page.tsx`, `privacy/page.tsx`, do the same. (Already flagged as P3 in Audit 1 slice A — confirmed still unfixed.)

### B9. CommandPalette shows all NAV_ITEMS regardless of user permissions

- **Entry point:** `src/components/garfix/CommandPalette.tsx:28-47` — `NAV_ITEMS` array has all 18 entries with no perm/admin/founder flags. Lines 156-172 filter by query string only, not by permission.
- **Expected behavior:** A non-admin user searching "platform-admin" should either (a) not see the result, or (b) see it greyed out with a lock icon, or (c) see it but get a 403 when selected.
- **Actual behavior:** All 18 NAV_ITEMS are searchable and selectable. Selecting an unauthorized one navigates to the hash → AppShell renders nothing (B2).
- **Severity:** P3 (compounds B2).
- **Suggested fix:** Mirror the `canSee` logic from `Sidebar.tsx:73-78` into CommandPalette. Add `perm?`, `adminOnly?`, `founderOnly?` fields to `NAV_ITEMS` and filter:
  ```ts
  const { perms, isAdmin, isFounder } = useAuth();
  const canSee = (n: NavItem) => {
    if (n.founderOnly && !isFounder) return false;
    if (n.adminOnly && !isAdmin && !isFounder) return false;
    if (n.perm && !perms[n.perm] && !isAdmin && !isFounder) return false;
    return true;
  };
  const navMatches = (q.length === 0 ? NAV_ITEMS : NAV_ITEMS.filter(...)).filter(canSee);
  ```
  Requires importing `useAuth` into `CommandPalette.tsx` (currently only imports `useBrand`).

### B10. Two theme systems running simultaneously (`next-themes` + `BrandContext`)

- **Entry point:** `src/components/Providers.tsx:43` — `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` wraps the entire app. `src/context/BrandContext.tsx:60-87` — separate `theme` state + `toggleTheme` + effect that toggles `.dark` class.
- **Expected behavior:** One theme system, persisted across navigation.
- **Actual behavior:** `next-themes` (ThemeProvider) uses `localStorage["theme"]` by default and toggles `.dark` on `<html>` via its own hydration logic. `BrandContext` uses `localStorage["garfix:theme"]` and toggles `.dark` via its own effect. They usually converge (both default to OS preference) but:
  - If a user previously set a theme via `next-themes` (e.g., from an older version of the app that used next-themes directly), `localStorage["theme"]` is set but `localStorage["garfix:theme"]` is not. On load, the theme-init script reads `garfix:theme` (unset) → falls back to OS preference → may differ from `next-themes`'s stored value → next-themes then re-hydrates and flips the class → brief flicker.
  - `BrandContext.toggleTheme` writes only to `garfix:theme`, not `theme`. If next-themes ever re-initializes (e.g., after a hot reload in dev), it reads `theme` (stale) and may flip the class back.
- **Severity:** P2 (rare flicker, but architectural fragility).
- **Suggested fix:** Pick ONE theme system. Either:
  - **(a)** Remove `<ThemeProvider>` from `Providers.tsx` and rely solely on `BrandContext` + the `layout.tsx` theme-init script. (Simpler — BrandContext already does everything next-themes does, just with a different storage key.)
  - **(b)** Remove `BrandContext`'s theme state + effect and use `next-themes`'s `useTheme()` hook instead. Update `Sidebar.tsx` and `Topbar.tsx` to call `useTheme()` from `next-themes`. (More idiomatic for Next.js but requires changing all `theme`/`toggleTheme` consumers.)
  
  Option (a) is lower-risk. Also delete the `themeInitScript` in `layout.tsx` if you go with (b) — next-themes has its own SSR script.

### B11. Payment flow has NO UI entry point — `useInitiatePayment` is dead code

- **Entry point:** `src/hooks/queries/platform-admin.ts:959-967` — `useInitiatePayment` hook defined but never called. Verified via `rg "useInitiatePayment"` — only the definition and the barrel export reference it.
- **Expected behavior:** A "Subscribe" or "Upgrade plan" button somewhere in the authenticated UI (per task spec: "Dashboard → Settings → subscribe").
- **Actual behavior:** `SettingsView` (`#settings`) renders only `CompanySettingsForm`, `TemplateSettingsForm`, `TemplateListManager` — no subscribe button. `SaaSControlPanel` (`#saas`) lists existing payments (read-only) — no initiate button. The user has no way to initiate a subscription payment from the UI.
- **Severity:** P1 (broken business flow — users cannot upgrade subscriptions without an entry point).
- **Suggested fix:** Add a "Billing & Plans" section to `SettingsView` (or a new `#billing` view) that:
  1. Fetches the current company's plan + subscription status.
  2. Shows the available plans (from `DEFAULT_PLANS` in `src/lib/plans.ts`).
  3. Has a "اشترك الآن" / "ترقية الباقة" button that calls `useInitiatePayment` and redirects to `result.paymentUrl` on success:
     ```tsx
     const initiatePayment = useInitiatePayment();
     const handleSubscribe = (planKey: string, billingPeriod: "monthly" | "yearly") => {
       initiatePayment.mutate({ planKey, billingPeriod }, {
         onSuccess: (data) => {
           if (data.paymentUrl) window.location.href = data.paymentUrl;
         },
         onError: (err) => toast.error(err.message),
       });
     };
     ```
  This is a feature gap, not a bug fix — requires product/business decision on where to place the entry point (see **C7**).

### B12. Middleware returns JSON 401 for unknown page routes when unauthenticated

- **Entry point:** `src/middleware.ts:173-182` — for any path that is NOT in `PUBLIC_ROUTES` (API list) and NOT in `PUBLIC_PAGE_PREFIXES`, middleware runs `resolveAuth(req)`. If unauthenticated, returns `NextResponse.json({ error: "Unauthorized" }, { status: 401 })`.
- **Expected behavior:** An unauthenticated user hitting an unknown page route (e.g., `/foo`, `/dashboard`, `/acount` typo) should see the branded 404 page (`src/app/not-found.tsx`), not a JSON 401.
- **Actual behavior:** The middleware intercepts the request before Next.js can determine it's a 404. For unauth users, the response is `{"error":"Unauthorized"}` with status 401 — the browser renders raw JSON. For authed users, middleware returns `NextResponse.next()` → Next.js finds no matching route → renders `not-found.tsx` ✓. So the bug is specific to unauth users hitting unknown page routes.
- **Severity:** P1 (broken 404 recovery for unauth users — see task spec Flow: "404 recovery: unknown route → not-found.tsx").
- **Suggested fix:** Restructure the middleware to distinguish API routes from page routes:
  ```ts
  // After the isPublicRoute / isPublicPage checks:
  if (pathname.startsWith("/api/")) {
    // Protected API route — return JSON 401
    const authResult = await resolveAuth(req);
    if (!authResult.ok || !authResult.user) {
      return withSecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), pathname);
    }
    // ... continue with CSRF, rate limit, etc.
  } else {
    // Page route — let Next.js handle 404 (don't block unauth users with JSON 401)
    // Only apply security headers.
    return withSecurityHeaders(NextResponse.next(), pathname);
  }
  ```
  This way, unknown page routes fall through to Next.js's 404 mechanism (which renders `not-found.tsx`), and protected API routes still return JSON 401. Page-level auth gating is already handled client-side by `page.tsx` (landing for unauth, AppShell for auth) and by the founder-panel guard (B6).

---

## C. Manual fixes required (need human/business decisions)

### C1. Should logged-out users at `/` see the landing page or be redirected to `/login`?
- **Current behavior:** `page.tsx` renders `EnhancedLandingPage` for unauthed users (with Sign In / Get Started buttons).
- **Question:** Is this the intended UX? The e2e test (`auth.spec.ts:13`) expects a redirect to `/login`. Either:
  - (a) Change the e2e test to expect `/` (landing page) — keep current behavior.
  - (b) Add `router.replace("/login")` in `page.tsx` for unauthed users — match the e2e test.
- **Recommendation:** (a) — the landing page is a legitimate marketing page; redirecting unauth users to `/login` immediately loses the marketing opportunity. Fix the test instead.

### C2. Should signup auto-login or require email verification?
- **Current behavior:** `/api/auth/register` has anti-enumeration behavior (always returns 200, never issues a session). Signup page redirects to `/login` after 2s.
- **Question:** Is the anti-enumeration design intentional? If yes, the signup → onboarding flow cannot be seamless (user must manually log in). If no, change `/api/auth/register` to issue a session on success.
- **Recommendation:** Keep anti-enumeration (it's a security best practice). But fix the UX: remove the 2s auto-redirect, make the success-screen copy explicit about what to do next, and consider sending a verification email with a magic link that auto-logs-in on click.

### C3. Should expired-session users see a "session expired" toast before redirect?
- **Current behavior:** No global 401 handling (B5). When implemented, the user would be redirected to `/login?reason=session_expired` with no explanation.
- **Question:** Should the redirect be preceded by a toast "انتهت جلستك. يرجى تسجيل الدخول مرة جديدة."?
- **Recommendation:** Yes — show the toast on the login page (read `?reason=session_expired`) rather than before the redirect (the redirect would unmount the toast host).

### C4. Should company switching use `pushState` (back/forward restores companies) or `replaceState` (no history pollution)?
- **Current behavior:** No URL update at all (B4).
- **Question:** If we add URL update, should back/forward restore previous companies?
- **Recommendation:** Use `replaceState` — back/forward is for navigation, not state changes. Users expect back to go to the previous PAGE, not the previous COMPANY. If they want to switch back, they click the company selector.

### C5. Should the `/founder-panel/*` pages show a 403 page for authed non-founders, or redirect to `/`?
- **Current behavior:** Page renders, API returns 403, page shows "Connection Error" (B6).
- **Question:** For an authed non-founder user hitting `/founder-panel/mission-control`, should they see a 403 page or be redirected to `/`?
- **Recommendation:** Redirect to `/?error=not_founder` (with a toast on the dashboard). A 403 page is appropriate for "you have an account but lack this specific permission"; for "this entire section is founder-only", a redirect is cleaner.

### C6. Which theme system should be the source of truth — `next-themes` or `BrandContext`?
- **Current behavior:** Both run simultaneously (B10).
- **Question:** Which one stays?
- **Recommendation:** Keep `BrandContext` (it's already wired into Sidebar + Topbar + the theme-init script). Remove `<ThemeProvider>` from `Providers.tsx` and uninstall `next-themes` (or leave the dep but stop using it).

### C7. Where should the "Subscribe" / "Upgrade plan" button live?
- **Current behavior:** No entry point exists (B11).
- **Question:** Should it be in `#settings` (SettingsView), `#saas` (SaaSControlPanel), `#account` (AccountView), or a new `#billing` view?
- **Recommendation:** Add a "Billing & Plans" tab to `SettingsView` — it's the most natural place for company-level settings, and the task spec explicitly says "Dashboard → Settings → subscribe". Alternatively, surface it as a banner on `#dash` when the trial is about to expire (proactive upgrade prompt).

---

## D. Additional findings (not part of the 12 flows but relevant to navigation integrity)

### D1. No breadcrumbs anywhere in the app
- The `Breadcrumb` UI component exists (`src/components/ui/breadcrumb.tsx`) but is never used. Zero `Breadcrumb` imports in `src/modules/`.
- The task spec asks "Breadcrumbs exist where needed" — they don't exist anywhere.
- **Severity:** P3 (UX — users navigate a 18-view app with no breadcrumb trail; the Sidebar highlights the active view but provides no parent/child hierarchy).
- **Recommendation:** Add breadcrumbs to the `Topbar` showing e.g. `الرئيسية / المحاسبة / دليل الحسابات` for nested views. Lower priority than the P1/P2 fixes above.

### D2. `e2e/auth.spec.ts` and `e2e/dashboard.spec.ts` are broken
- `auth.spec.ts:13` expects `/login` redirect after `page.goto("/")` — wrong (URL stays `/`).
- `auth.spec.ts:29` expects `/dashboard` or `/app` after login — wrong (URL is `/` with `#dash` hash).
- `auth.spec.ts:80` expects `/login` after logout — wrong (URL is `/` after reload).
- `dashboard.spec.ts:35` looks for `nav a, [class*="sidebar"] a` — but Sidebar uses `<button>`, not `<a>`. `linkCount` is always 0, so the test silently skips (`if (linkCount > 0)`).
- **Severity:** P2 (tests give false confidence — they "pass" but verify nothing).
- **Recommendation:** Rewrite the e2e tests to match the actual app behavior. Use `page.waitForURL("/")` + `page.waitForSelector('[class*="sidebar"]')` + click `button:has-text("الفواتير")` etc.

### D3. `Sidebar.tsx` still imports `Link` from `next/link` but never uses it
- **Entry point:** `src/modules/common/Sidebar.tsx:4` — `import Link from "next/link";`
- Already flagged as P3 in Audit 1 slice A — confirmed still unfixed.
- **Severity:** P3 (lint warning, no runtime impact).
- **Fix:** Remove the unused import.

### D4. `sitemap.ts` omits `/api-docs` and `/founder-panel/*` routes
- **Entry point:** `src/app/sitemap.ts:9-21` — lists 11 routes but omits `/api-docs`, `/founder-panel/mission-control`, `/founder-panel/ai-fabric`, `/founder-panel/finops`.
- **Severity:** P3 (SEO — founder-panel pages probably shouldn't be in the sitemap anyway since they're auth-gated; `/api-docs` should be).
- **Fix:** Add `/api-docs` to the staticRoutes array. Consider whether founder-panel pages should be in the sitemap (probably not — they're not for public search engines).

---

## E. Summary of fixes by severity

| Severity | Count | Items |
|----------|-------|-------|
| P0 | 0 | — |
| P1 | 5 | B2 (blank views for unauthorized hashes), B3 (logout race), B5 (no global 401 redirect), B6 (founder-panel no auth check), B11 (no payment entry point), B12 (JSON 401 for unknown pages) |
| P2 | 4 | B1 (signup→login not onboarding), B4 (company switch no URL), B7 (founder-panel in PUBLIC_PAGE_PREFIXES), B10 (dual theme systems), D2 (broken e2e tests) |
| P3 | 4 | B8 (raw `<a>` in legal pages), B9 (CommandPalette no perm filter), D1 (no breadcrumbs), D3 (unused Sidebar Link import), D4 (sitemap omissions) |

**Auto-fixable (no business decision needed):** B2, B3, B5, B6, B8, B9, B10, B12, D3, D4 — 10 items.

**Requires human/business decision (see Section C):** B1 (C2), B4 (C4), B7 (C5), B11 (C7), and the broader "should `/` redirect to `/login`" question (C1) — 5 items.

**Flows verified:** 12. **Flows broken:** 5 (Flows 2, 6, 7, 12, and the 404-recovery path B12). **Auto-fixable issues:** 10.
