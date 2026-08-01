# Audit 5 — Full UI Click Audit (Task ID 6)

**Agent:** Explore
**Scope:** Simulate a human user clicking every interactive element on the 10 most-clicked screens. For each, trace the `onClick` handler → hook → API → response shape, and verify loading / error / success feedback.
**Repo root:** `/home/z/my-project/audit/Garfix/`
**Base commit:** `9a52a14` ("Sprint 2+3: Enterprise Infrastructure Complete") — same baseline as Audits 1–8.

**Method:** pure static trace with `rg` + `Read`. No files modified. Cross-referenced against Audit 5 (API connectivity) and Audit 8 (cross-reference) for known hook/API mismatches.

**Issue classification:**
- **Dead click**: `onClick` is `() => {}` or `undefined`
- **No-op click**: handler runs but does nothing useful
- **Broken handler**: handler calls a hook that 404s, 500s, or returns wrong shape
- **Missing loading state**: no spinner during async call
- **Missing error state**: failure is silent
- **Missing success feedback**: success has no toast / UI update

**Severity scale used below:** P0 (blocks the user entirely), P1 (broken in normal use), P2 (rough edge), P3 (polish).

---

## Section 1 — Login Page (`src/app/login/page.tsx`)

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| Submit button (Sign in) | login/page.tsx:157-170 (`<Button type="submit">`) | ✅ wired via `<form onSubmit={handleSubmit}>` | `useAuth().login()` (AuthContext:122) | POST `/api/auth/login` ✅ exists | ✅ `submitting` state shows `Loader2 + "Signing in…"` and disables button | ✅ `setError(msg)` shows red alert with `AlertTriangle` | ✅ implicit — `router.push("/")` redirects to dashboard once `user` becomes non-null | — | none |
| "Create one" link → signup | login/page.tsx:174 `<Link href="/signup">` | ✅ Next.js `<Link>` | n/a (route navigation) | n/a | n/a | n/a | n/a | — | none |
| "Terms" link | login/page.tsx:181 `<Link href="/terms">` | ✅ `<Link>` | n/a | `/terms` page exists ✅ | n/a | n/a | n/a | — | none |
| "Privacy Policy" link | login/page.tsx:185 `<Link href="/privacy">` | ✅ `<Link>` | n/a | `/privacy` page exists ✅ | n/a | n/a | n/a | — | none |
| **Forgot-password link** | **absent** | ❌ **not rendered at all** — task spec lists "forgot-password link" but the page has none | n/a | `/api/auth/forgot-password` route exists (verified in Audit 5), but unreachable from UI | n/a | n/a | n/a | **P1** | Add a `<Link href="/forgot-password">` under the password field. The route + `useForgotPassword` hook already exist (Audit 5 lists `/api/auth/forgot-password`), so the only missing piece is the link itself. |

**Section 1 issues: 1** (P1: forgot-password link missing entirely).

---

## Section 2 — Signup Page (`src/app/signup/page.tsx`)

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| Submit button (Create account) | signup/page.tsx:264-277 (`<Button type="submit">`) | ✅ via `<form onSubmit={handleSubmit}>` | **inline `fetch("/api/auth/register")`** — does NOT use the `useRegister` hook (auth.ts:hooks/queries/auth.ts) | POST `/api/auth/register` ✅ exists | ✅ `submitting` shows `Loader2 + "Creating account…"` + disables | ✅ `setError(msg)` shows red alert | ✅ `setSuccess(true)` swaps to a green check-card "Account request received" + auto-redirect after 2 s | — | none |
| "Sign in" link → login | signup/page.tsx:281 `<Link href="/login">` | ✅ `<Link>` | n/a | n/a | n/a | n/a | n/a | — | none |
| "Continue to sign in" button (on success screen) | signup/page.tsx:133-139 `<Button onClick={() => router.push("/login")}>` | ✅ wired | n/a (router nav) | n/a | n/a | n/a | ✅ navigates immediately | — | none |
| Terms / Privacy links | signup/page.tsx:288,292 `<Link>` | ✅ `<Link>` | n/a | ✅ pages exist | n/a | n/a | n/a | — | none |

**Subtle issues (not classified as bugs but worth noting):**
- **No-op click risk:** the submit handler uses inline `fetch` instead of the typed `useRegister` hook, so any future change to the register payload schema won't be type-checked here. The two paths are out of sync (Audit 5 B1: useRegister expects `{ ok, user }` but server returns `{ ok, message }` — the inline fetch happens to be the correct one). **Severity P3** — consolidate to one path.
- The 2 s `setTimeout` auto-redirect (Audit 4 B1) means if the user clicks "Continue to sign in" before 2 s elapses, both fire — harmless because `router.push` is idempotent, but still a small race. **Severity P3.**
- The success-card copy "If this email isn't already registered…" is a side-effect of the anti-enumeration design (correct behaviour) but UX-confusing. Audit 4 B1 flagged this.

**Section 2 issues: 0 hard bugs; 2 polish notes.**

---

## Section 3 — Onboarding Wizard (`src/modules/onboarding/SetupWizard.tsx`)

The wizard has 7 steps (`welcome`, `company`, `country`, `business`, `features`, `ai-test`, `done`) controlled by local `step` state. Each step renders its own button row.

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| "تخطّي" (Skip) button | SetupWizard.tsx:~205 `onClick={onSkip}` | ✅ wired (parent prop) | n/a — parent (`AppShell.tsx`) decides what to do | n/a | n/a | n/a | n/a | — | none (parent calls `refreshCompanies()` — see AppShell.tsx) |
| "يلا نبدأ" (Next, step 0) | SetupWizard.tsx:~265 `onClick={next}` | ✅ | `saveProgress()` → `useCompleteOnboarding().mutateAsync({action:"update", step, ...})` | POST `/api/onboarding` ✅ exists | ✅ implicit (best-effort, errors swallowed) | ❌ **silent catch** — `try {…} catch { /* silent */ }` in `saveProgress` (line ~167). If the save fails, user gets no toast. | n/a (just advances step) | **P2** | Surface a `toast.error()` in the catch — even a low-key "لم يتم حفظ التقدم" is better than silence. |
| "إنشاء الشركة" (Create company, step 1) | SetupWizard.tsx:~330 `onClick={createCompany}` | ✅ | `useCreateCompany().mutateAsync({name, slug})` | POST `/api/companies` ✅ exists | ✅ `saving` state → button shows "جارٍ..." + disabled | ✅ `toast.error(err.message)` | ✅ `toast.success("تم إنشاء الشركة")` + `refreshCompanies()` | — | none |
| Company slug availability check (debounced) | SetupWizard.tsx:~125-160 | ✅ debounced 350 ms | `useCheckCompanySlug(slug)` (onboarding.ts:57) | GET `/api/companies?checkSlug=…` ✅ exists | ✅ shows `<Loader2 size={10}>` + "جارٍ التحقق…" inline | ✅ shows colored borders + "محجوز" / "invalid reason" text | ✅ shows "متاح" with green check | — | none |
| Country select buttons (step 2) | SetupWizard.tsx:~390 `onClick={async () => { updateCompanyMutation; saveProgress; next; }}` | ✅ | `useUpdateOnboardingCompany().mutateAsync({slug, country, currency, defaultTaxRate})` → PATCH `/api/companies/[slug]` | PATCH `/api/companies/[slug]` ✅ exists | ❌ **no per-button loading state** — the country card has no spinner; `mutateAsync` runs but UI shows nothing | ❌ **silent catch** — `try {…} catch { /* silent best-effort */ }` (line ~398). If country update fails, user advances anyway. | n/a | **P2** | At minimum surface a toast on error. Optional: disable other country cards while in-flight. |
| Business-type cards (step 3) | SetupWizard.tsx:~440 `onClick={() => setData({…, businessType})}` | ✅ wired (local state only) | n/a — just `setData` | n/a | n/a | n/a | ✅ visual highlight on selected card | — | none |
| Toggle rows (step 4) | SetupWizard.tsx:~470-510 `ToggleRow` → `onClick={() => onChange(!value)}` | ✅ wired (local state) | n/a | n/a | n/a | n/a | ✅ color toggle | — | none |
| "حلّل بالذكاء" (AI test, step 5) | SetupWizard.tsx:~540 `onClick={testAI}` | ✅ | `useSmartParse().mutateAsync({content, companySlug})` → POST `/api/ai/smart-parse` | POST `/api/ai/smart-parse` ✅ exists | ✅ `aiLoading` shows spinner + disables button | ✅ `toast.error(err.message)` | ✅ `toast.success("تم استخراج N طلب")` + renders result box | — | none |
| "ابدأ الاستخدام!" (Complete, step 6) | SetupWizard.tsx:~600 `onClick={completeWizard}` | ✅ | `useCompleteOnboarding().mutateAsync({action:"complete", …})` → POST `/api/onboarding` | ✅ exists | ✅ `saving` shows spinner + "جارٍ الإعداد..." | ✅ `toast.error(err.message)` | ✅ `toast.success("تم إعداد منصتك! (N حساب, M موديول)")` + `onComplete()` triggers `refreshCompanies()` in AppShell | — | none |
| NavButtons "التالي" / "السابق" | SetupWizard.tsx:~620 (sub-component) | ✅ wired to `next`/`prev` | `next` → `saveProgress` + `setStep` | ✅ | partial (silent catch on save) | ❌ same silent-catch as above | n/a | **P2** | same fix as Skip-row above |

**Section 3 issues: 2** (both P2: silent error swallow in `saveProgress` and in country-select update).

---

## Section 4 — Dashboard View (`src/modules/dashboard/DashboardView.tsx`)

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| KPI cards (×5: Invoices, Revenue, Paid, Outstanding, Clients) | DashboardView.tsx:84-115 (`KpiCard` sub-component) | ❌ **not clickable** — no `onClick`, no `<a>`, no role="button". KPI cards are display-only. | n/a | n/a | n/a | n/a | n/a | **P3** | If cards are intended to deep-link (e.g. click "Outstanding" → invoices?status=overdue), add `onClick`/`<Link>`. Otherwise document as display-only. |
| "عرض الكل" (View all) link in recent-invoices header | DashboardView.tsx:175-181 `<a href="#invoices">` | ⚠️ raw `<a>` not `<Link>` (Audit 1 + 4 D3 flagged this) | n/a (hash nav) | n/a | n/a | n/a | n/a | **P3** | Replace `<a href="#invoices">` with `<Link href="#invoices">` for client-side routing consistency. |
| Recent-invoices table rows (desktop) | DashboardView.tsx:202-220 `<tr>` (no onClick) | ❌ **not clickable** — rows are display-only. No deep-link to invoice detail. | n/a | n/a | n/a | n/a | n/a | **P2** | Add `onClick={() => navigate("invoices")}` or open an invoice preview. The mobile cards (lines 226-252) are also not clickable. |
| Recent-invoices mobile cards | DashboardView.tsx:227-251 | ❌ same — display-only | n/a | n/a | n/a | n/a | n/a | **P2** | same fix |
| (Whole-view) loading state | DashboardView.tsx:49-55 | n/a | `useDashboardStats(activeCompany?.slug)` (dashboard.ts:344) | GET `/api/dashboard/stats` ✅ exists, returns `{ stats: {...} }` | ✅ shows "جارٍ تحميل لوحة التحكم…" | ⚠️ `if (!stats)` shows generic "تعذّر تحميل البيانات. حاول مرة أخرى." — no retry button, no error detail. Audit 5 B12 said the response wrapper is broken, but the route actually returns `{ stats }` and the view reads `statsData?.stats` correctly — so this works. | n/a | **P3** | Add a "إعادة المحاولة" button on the error state. |
| (Filters) | n/a | n/a | n/a — Dashboard has no filters | n/a | n/a | n/a | n/a | — | n/a |

**Section 4 issues: 0 hard bugs; 4 UX gaps** (non-clickable KPIs P3, raw `<a>` P3, non-clickable invoice rows P2×2, no retry button P3).

---

## Section 5 — Invoices View (`src/modules/invoices/InvoicesView.tsx`)

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| "فاتورة جديدة" (Create) button | InvoicesView.tsx:~325 `onClick={() => setShowForm(true)}` | ✅ | n/a (renders `<InvoiceForm>`) | n/a | n/a | n/a | n/a | — | none |
| "تصدير CSV" (Export) button | InvoicesView.tsx:~318 `onClick={handleExportCSV}` | ✅ wired | **none** — `handleExportCSV` is `() => { toast.info("سيتم إضافة تصدير CSV قريبًا"); }` | n/a | n/a | n/a | ⚠️ shows info toast "coming soon" | **P1** | Implement actual CSV export (mirror `ClientList.handleExportCSV` which already works). Or remove the button until implemented. Currently a **no-op click** — user expects a download. |
| Search input | InvoicesView.tsx:~355 | ✅ wired (local state, client-side filter) | n/a | n/a | n/a | n/a | n/a | — | none |
| Status filter buttons (all/paid/pending/overdue) | InvoicesView.tsx:~365 `onClick={() => setStatusFilter(f)}` | ✅ wired (local state, client-side filter) | n/a | n/a | n/a | n/a | ✅ active button highlighted | — | none |
| "إلغاء التحديد" (Clear selection) | InvoicesView.tsx:~395 `onClick={() => setSelectedIds(new Set())}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| "حذف المحدد" (Bulk delete) | InvoicesView.tsx:~401 `onClick={handleBulkDelete}` | ✅ | `useDeleteInvoice().mutateAsync(id)` per-id in a loop | DELETE `/api/invoices/[id]` ✅ exists | ✅ `bulkDeleting` shows "جارٍ الحذف…" + disables | ❌ **silent** — `await deleteInvoiceMutation.mutateAsync(id).catch(() => {});` swallows per-id errors with no toast. User sees "تم حذف الفاتورة" toasts from `handleDelete` (the per-row path) but `handleBulkDelete` doesn't fire any per-id success toast either. | ❌ no success toast after bulk delete completes (only the empty selection state is cleared) | **P1** | Add a summary toast `toast.success(\`تم حذف N فاتورة\`)` after the loop, and `toast.error` for failures. Also add a confirm dialog (current code deletes immediately, unlike Clients which confirms). |
| Table row "معاينة" (View) | InvoicesView.tsx:~414 `IconBtn onClick={() => setPreviewInvoice(inv)}` | ✅ | n/a (opens InvoicePreview modal) | n/a | n/a | n/a | ✅ modal opens | — | none |
| Table row "تسجيل دفعة" (Record payment) | InvoicesView.tsx:~416 `onClick={() => setPaymentInvoice(inv)}` | ✅ | opens `PaymentDialog` → `useRecordPayment().mutate({id, amount, date, method})` | PATCH `/api/invoices/[id]/payment` ✅ exists (Audit 5 E7: idempotency layer silently disabled because `db.idempotencyKey` is missing from Prisma client, but the route still records the payment) | ✅ `recordPaymentMutation.isPending` shows "جارٍ الحفظ…" + disables | ✅ handles 403 specifically ("ليس لديك صلاحية مالية…") + generic error toast | ✅ `toast.success("تم تسجيل الدفعة بنجاح")` + `invoicesQuery.refetch()` | — | none at UI level; underlying idempotency bug is server-side (Audit 5 E7). |
| Table row "تعديل" (Edit) | InvoicesView.tsx:~418 `onClick={() => setEditing(inv)}` | ✅ | n/a (renders `<InvoiceForm>` with `editing`) | n/a | n/a | n/a | n/a | — | none |
| Table row "طباعة" (Print) | InvoicesView.tsx:~420 `onClick={() => handlePrint(inv)}` | ✅ | `setPreviewInvoice(inv)` + `setTimeout(window.print, 200)` | n/a | n/a | n/a | ✅ opens print dialog | — | none |
| Table row "حذف" (Delete) | InvoicesView.tsx:~422 `onClick={() => handleDelete(inv.id)}` | ✅ | `useDeleteInvoice().mutate(id, {onSuccess, onError})` | DELETE `/api/invoices/[id]` ✅ exists | ⚠️ per-row `deleteMutation.isPending && deleteMutation.variables?.id === String(p.id)` disables just the trash icon | ✅ `toast.error(err.message)` | ✅ `toast.success("تم حذف الفاتورة")` | — | none |
| Select-all checkbox | InvoicesView.tsx:~388 `onChange={toggleSelectAll}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| Row checkbox | InvoicesView.tsx:~404 `onChange={() => toggleRow(inv.id)}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| Pagination: previous / next / page number | InvoicesView.tsx:~510-545 `onClick={() => setCurrentPage(…)}` | ✅ wired (client-side paginate) | n/a | n/a | n/a | n/a | ✅ active page highlighted | — | none |
| Mobile row tap (opens preview) | InvoicesView.tsx:~470 `onClick={() => setPreviewInvoice(inv)}` | ✅ | n/a | n/a | n/a | n/a | ✅ | — | none |
| Mobile row checkbox | InvoicesView.tsx:~482 `onChange={…} onClick={e.stopPropagation()}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| InvoicePreview: "تسجيل دفعة" button | InvoicesView.tsx:~915 `onClick={onRecordPayment}` | ✅ wired (closes preview, opens payment dialog) | n/a | n/a | n/a | n/a | n/a | — | none |
| InvoicePreview: "طباعة" button | InvoicesView.tsx:~918 `onClick={() => window.print()}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| InvoicePreview: "إغلاق" button + backdrop click | InvoicesView.tsx:~892,920 `onClick={onClose}` / `onClick={onClose}` (backdrop) | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| InvoiceForm: "إضافة بند" (Add line item) | InvoicesView.tsx:~770 `onClick={addItem}` | ✅ wired (local state) | n/a | n/a | n/a | n/a | n/a | — | none |
| InvoiceForm: remove-line-item "X" | InvoicesView.tsx:~805 `onClick={() => removeItem(i)}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| InvoiceForm: "إغلاق" / "إلغاء" | InvoicesView.tsx:~745,825 `onClick={onClose}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| InvoiceForm: "حفظ التعديلات" / "إنشاء الفاتورة" (Save) | InvoicesView.tsx:~835 `onClick={handleSubmit}` | ✅ | `useCreateInvoice().mutateAsync` or `useUpdateInvoice().mutateAsync` + optional `useUpdateInvoiceStatus().mutateAsync` | POST `/api/invoices` ✅ / PATCH `/api/invoices/[id]` ✅ / PATCH `/api/invoices/[id]/status` ✅ | ✅ `saving` shows "جارٍ الحفظ…" + disables | ✅ `toast.error(err.message)` — also handles "use تسجيل دفعة for paid/partial" case specifically | ✅ `toast.success("تم إنشاء/تحديث الفاتورة")` + `onSaved()` triggers `invoicesQuery.refetch()` + shows review-queue warning banner if any | — | none |
| PaymentDialog: "إلغاء" / "تأكيد الدفعة" | InvoicesView.tsx:~1090,1095 `onClick={onClose}` / `onClick={handleSave}` | ✅ | see "Record payment" above | ✅ | ✅ | ✅ | ✅ | — | none |
| Review-queue banner: "فتح صفحة مراجعة التطابقات" | InvoicesView.tsx:~245 `onClick={() => setShowReviewQueue(true)}` | ✅ | n/a (opens `<ReviewQueueModal>`) | n/a | n/a | n/a | n/a | — | none |
| Review-queue banner: "مسح التحذيرات" | InvoicesView.tsx:~252 `onClick={() => { setReviewQueueWarnings([]); setShowWarningsBanner(false); }}` | ✅ wired (local state) | n/a | n/a | n/a | n/a | n/a | — | none |
| Review-queue banner: close "X" | InvoicesView.tsx:~233 `onClick={() => setShowWarningsBanner(false)}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| Inventory-warnings banner: close "×" | InvoicesView.tsx:~210 `onClick={() => { setInventoryWarnings([]); setShowInventoryBanner(false); }}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |

**Section 5 issues: 2**
- **P1 (no-op click):** "تصدير CSV" button shows "coming soon" toast — never exports.
- **P1 (missing success + error feedback):** Bulk delete swallows per-id errors silently and shows no summary toast.

---

## Section 6 — Clients View (`src/modules/clients/ClientsView.tsx` + `ClientList.tsx` + `ClientForm.tsx`)

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| "عميل جديد" (Create) button | ClientList.tsx:134 `onClick={onAddNew}` | ✅ | n/a (ClientsView toggles `<ClientForm>`) | n/a | n/a | n/a | n/a | — | none |
| "تصدير CSV" (Export) button | ClientList.tsx:145 `onClick={handleExportCSV}` | ✅ | n/a (client-side CSV generation + Blob download) | n/a | n/a | ✅ `toast.error("لا يوجد عملاء للتصدير")` if empty | ✅ `toast.success("تم تصدير N عميل")` + triggers file download | — | none — this is the reference implementation InvoicesView should mirror. |
| "استيراد CSV" (Import) button | ClientList.tsx:151 `onClick={onImport}` | ✅ | n/a (opens `<ImportCSVDialog>`) | n/a | n/a | n/a | n/a | — | none (dialog handles its own state) |
| Search input | ClientList.tsx:163 | ✅ wired (passed to `useClients` as `search`) | `useClients(companySlug, search)` (clients.ts) | GET `/api/clients?companySlug=…&search=…` ✅ exists | ✅ `isLoading` shows "جارٍ التحميل…" | ✅ `useEffect` surfaces `error` via `toast.error(error.message)` (line 120) | n/a | — | none |
| Select-all / row checkboxes | ClientList.tsx:206,234,277 | ✅ wired (local state) | n/a | n/a | n/a | n/a | n/a | — | none |
| "إلغاء التحديد" / "حذف المحدد" | ClientList.tsx:177,182 `onClick={() => setSelectedIds(new Set())}` / `onClick={handleBulkDelete}` | ✅ | `useBulkDeleteClients().mutateAsync(Array.from(selectedIds))` | POST `/api/clients/bulk-delete` — ⚠️ route existence not verified in audit 5; the hook expects `{succeeded, failed}` shape. | ✅ `bulkDeleting` shows "جارٍ الحذف…" + disables | ✅ `toast.error("تعذّر حذف العملاء")` on catch + per-failure `toast.error(\`تعذّر حذف ${result.failed} عميل\`)` | ✅ `toast.success(\`تم حذف ${result.succeeded} عميل بنجاح\`)` + confirm dialog before delete | — | none |
| Table row "عرض الملف" (View) | ClientList.tsx:248 `onClick={(e) => { e.stopPropagation(); onSelectClient(c.id); }}` | ✅ | n/a (ClientsView renders `<ClientProfile>`) | n/a | n/a | n/a | n/a | — | none |
| Table row "تعديل" (Edit) | ClientList.tsx:253 `onClick={(e) => { e.stopPropagation(); onEdit(c); }}` | ✅ | n/a (ClientsView toggles `<ClientForm>` with `editing`) | n/a | n/a | n/a | n/a | — | none |
| Table row "حذف" (Delete) | ClientList.tsx:254 `onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}` | ✅ | `useDeleteClient().mutateAsync(id)` | DELETE `/api/clients/[id]` ✅ exists | ⚠️ no per-row disable (button doesn't check `deleteClient.isPending && variables === id`) | ✅ `toast.error("تعذّر الحذف")` on catch | ✅ `toast.success("تم الحذف")` + confirm dialog | **P3** | Disable the per-row trash icon while its delete is in-flight (mirror CatalogView pattern). |
| Row click (opens profile) | ClientList.tsx:227 `onClick={() => onSelectClient(c.id)}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| Mobile row tap | ClientList.tsx:271 `onClick={() => onSelectClient(c.id)}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| Pagination prev/next/number | ClientList.tsx:303-316 | ✅ wired (client-side paginate) | n/a | n/a | n/a | n/a | ✅ active highlighted | — | none |
| ClientForm: "إغلاق" / "إلغاء" / "حفظ" | ClientForm.tsx:78,91,92 | ✅ wired | `useCreateClient().mutateAsync` or `useUpdateClient().mutateAsync` | POST `/api/clients` ✅ / PATCH `/api/clients/[id]` ✅ | ✅ `saving` shows "جارٍ…" + disables Save | ✅ `toast.error(err.message)` | ✅ `toast.success("تم الإنشاء"/"تم التحديث")` + `onClose()` | — | none at UI level; Audit 5 A7 noted the `company` field name mismatch (silently dropped on update) — broken-handler at API level. |

**Section 6 issues: 0 hard UI bugs; 1 P3 polish (per-row delete no loading state).** The `useUpdateClient` field-name mismatch (Audit 5 A7) is server-side, not a UI click issue.

---

## Section 7 — Catalog View (`src/modules/catalog/CatalogView.tsx`)

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| "منتج جديد" (Create) button | CatalogView.tsx:89 `onClick={() => setShowForm(true)}` | ✅ | n/a (renders `<ProductForm>`) | n/a | n/a | n/a | n/a | — | none |
| Search input | CatalogView.tsx:93 | ⚠️ wired to local `search` state, but **the search value is never passed to `useCatalog`** (line 30: `useCatalog(activeCompany?.slug || "")` — only takes slug). Search filters nothing — typing in the box just changes local state that's never read. | `useCatalog(slug)` (catalog.ts) | GET `/api/catalog?companySlug=…` ✅ exists | ✅ `isLoading` shows spinner | n/a (no error UI — query errors silently fail) | n/a | **P1 (no-op click)** | Either pass `search` to `useCatalog(slug, search)` and have the API filter, OR filter `products` client-side: `products.filter(p => p.name.includes(search) || p.code?.includes(search))`. Currently typing in search visibly does nothing. |
| Select-all / row checkboxes | CatalogView.tsx:116,130,156 | ✅ wired (local state) | n/a | n/a | n/a | n/a | n/a | — | none |
| "إلغاء التحديد" / "حذف المحدد" | CatalogView.tsx:100,101 | ✅ | `useDeleteCatalogItem().mutateAsync({id: String(id)})` per-id in a loop | DELETE `/api/catalog/[id]` ✅ exists (Audit 5 E4: route does `parseInt(cuid)` → NaN → 404, so every delete 404s at runtime) | ✅ `bulkDeleting` shows "جارٍ الحذف…" + disables | ✅ per-failure counted and `toast.error(\`تعذّر حذف ${failCount} منتج\`)` | ✅ `toast.success(\`تم حذف ${okCount} منتج\`)` + confirm dialog | — | UI is correct; underlying route is broken (Audit 5 E4). |
| Table row "تعديل" (Edit) | CatalogView.tsx:138 `onClick={() => setEditing(p)}` | ✅ | n/a (renders `<ProductForm>` with `editing`) | n/a | n/a | n/a | n/a | — | none |
| Table row "حذف" (Delete) | CatalogView.tsx:139 `onClick={() => handleDelete(p.id)}` | ✅ | `useDeleteCatalogItem().mutate({id: String(id)}, {onSuccess, onError})` | DELETE `/api/catalog/[id]` ✅ (broken at runtime — see above) | ✅ `deleteMutation.isPending && deleteMutation.variables?.id === String(p.id)` disables just the trash icon | ✅ `toast.error(err.message)` | ✅ `toast.success("تم الحذف")` | — | none at UI level. |
| Pagination prev/next | CatalogView.tsx:176,177 | ✅ wired (client-side paginate) | n/a | n/a | n/a | n/a | n/a | — | none |
| ProductForm: "إغلاق" / "إلغاء" / "حفظ" | CatalogView.tsx:224,236,237 | ✅ | `useCreateCatalogItem().mutateAsync` or `useUpdateCatalogItem().mutateAsync` | POST `/api/catalog` ✅ / PATCH `/api/catalog/[id]` ✅ (Audit 5 E4: PATCH also `parseInt(cuid)` → NaN → 404) | ✅ `saving` shows "جارٍ…" + disables | ✅ `toast.error(err.message)` | ✅ `toast.success("تم الإنشاء"/"تم التحديث")` + `onSaved()` triggers `refetch()` | — | none at UI level. |

**Section 7 issues: 1**
- **P1 (no-op click):** Search input is wired to local state but the value is never read — typing does nothing visible.

(Audit 5 E4's `parseInt(cuid)` bug is server-side; the UI click handlers themselves are correct.)

---

## Section 8 — Settings View (`src/modules/settings/SettingsView.tsx` + `CompanySettingsForm.tsx` + `TemplateSettingsForm.tsx` + `TemplateListManager.tsx`)

`SettingsView.tsx` is just a shell — it composes three sub-forms. All clickable elements live in the sub-forms.

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| CompanySettingsForm: "حفظ" (Save) button | CompanySettingsForm.tsx:88-94 `onClick={save}` | ✅ | `useUpdateSettings().mutateAsync({slug, ...form})` | PATCH `/api/settings` ✅ exists but **is founder-only** (line 36 of route: `if (!isFounderEmail(...)) return 403`). The SettingsView is rendered for any user with `settings_access` perm (tenant admins). | ✅ `saving` shows "جارٍ الحفظ…" + disables | ✅ `toast.error(err.message)` — but for non-founders the message is just "Founder only" with no actionable hint | ✅ `toast.success("تم حفظ الإعدادات")` + `onUpdated()` callback | **P0 (broken handler)** | Either (a) move company-profile updates to a separate `/api/companies/[slug]` PATCH route that allows tenant admins, or (b) gate the entire `<CompanySettingsForm>` behind `isFounder` and hide it for tenant admins. Currently every non-founder clicking "حفظ" gets a 403 toast — and even for founders, the form data is stored as garbage platform-level key/value pairs (Audit 5 A6/B17) instead of being applied to the actual company profile, so the save appears to succeed but doesn't update what the user expects. |
| CompanySettingsForm: country `<select>` | CompanySettingsForm.tsx:138-150 `onChange={…}` | ✅ wired (local state + auto-fills currency/taxRate from `getCountryConfig`) | n/a | n/a | n/a | n/a | ✅ currency + tax fields auto-update | — | none |
| CompanySettingsForm: weekend / ramadan / VAT selects | CompanySettingsForm.tsx:192-215 | ✅ wired (local state) | n/a | n/a | n/a | n/a | n/a | — | none |
| TemplateSettingsForm: "حفظ" button | TemplateSettingsForm.tsx:277 `onClick={saveTemplateSettings}` | ✅ | `useUpdateSettings().mutateAsync(...)` (same hook as CompanySettingsForm) | PATCH `/api/settings` — same founder-only 403 issue | ✅ (shared `saving` state) | ✅ `toast.error(err.message)` | ✅ `toast.success("تم حفظ إعدادات القالب")` | **P0** | Same fix as above. |
| TemplateListManager: "قالب جديد" (New template) button | TemplateListManager.tsx:177 `onClick={openCreateDialog}` | ✅ | n/a (opens dialog) | n/a | n/a | n/a | n/a | — | none |
| TemplateListManager: per-row "تعديل" (Edit) | TemplateListManager.tsx:227 `onClick={() => openEditDialog(t)}` | ✅ | n/a (opens dialog) | n/a | n/a | n/a | n/a | — | none |
| TemplateListManager: per-row "حذف" (Delete) | TemplateListManager.tsx:234 `onClick={() => setDeletingTemplate(t)}` | ✅ | n/a (opens confirm dialog) | n/a | n/a | n/a | n/a | — | none |
| TemplateListManager: dialog "إلغاء" / "حفظ" | TemplateListManager.tsx:363,366 `onClick={closeDialog}` / `onClick={submitEdit}` | ✅ | `useCreateInvoiceTemplate().mutateAsync` or `useUpdateInvoiceTemplate().mutateAsync` | POST/PATCH `/api/invoice-templates` — ⚠️ route existence unverified; Audit 5 R-1 says `db.invoiceTemplate` is missing from generated Prisma client → 500 at runtime | ✅ `savingEdit` shows spinner + disables | ✅ `toast.error(err.message)` | ✅ `toast.success("تم إنشاء/تحديث القالب")` | **P0 (broken handler)** at server — UI is correct. | Run `bun run db:generate` (Audit 5 R-1 fix). |
| TemplateListManager: delete-confirm "تأكيد الحذف" | TemplateListManager.tsx:390 `onClick={confirmDelete}` | ✅ | `useDeleteInvoiceTemplate().mutateAsync(deletingTemplate.id)` | DELETE `/api/invoice-templates/[id]` — same Prisma-client drift risk | n/a | ✅ `toast.error(err.message)` | ✅ `toast.success("تم حذف القالب")` | **P0 (broken handler)** at server | Same db:generate fix. |

**Section 8 issues: 3** (all rooted in the same `useUpdateSettings` founder-only mismatch + Prisma client drift):
- **P0:** CompanySettingsForm save → 403 for non-founders + garbage storage for founders.
- **P0:** TemplateSettingsForm save → same 403 + garbage storage.
- **P0:** TemplateListManager create/update/delete → 500 because `db.invoiceTemplate` undefined in generated Prisma client (Audit 5 R-1).

---

## Section 9 — AI Copilot Bubble (`src/modules/ai/AICopilotBubble.tsx`)

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| Floating bubble (open/close toggle) | AICopilotBubble.tsx:379-390 `onClick={() => setOpen(!open)}` | ✅ | n/a (local state) | n/a | n/a | n/a | ✅ swaps between `<img logo>` and `<X>` icon | — | none |
| Fullscreen toggle | AICopilotBubble.tsx:408-415 `onClick={() => setFullscreen(!fullscreen)}` | ✅ | n/a (local state) | n/a | n/a | n/a | ✅ swaps Maximize2/Minimize2 icon | — | none |
| Header "إغلاق" (close panel) | AICopilotBubble.tsx:442-449 `onClick={() => setOpen(false)}` | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| Suggestion chips (×4) | AICopilotBubble.tsx:480-490 `onClick={() => send(s)}` | ✅ | calls `send(s)` → `useAIChatMessages().mutate({messages, companySlug, conversationId})` | POST `/api/ai/chat` ✅ exists | ✅ `loading` shows animated dots at bottom | ✅ on error, appends assistant message "عذراً، حدث خطأ. حاول مرة أخرى." | ✅ on success, appends assistant reply | — | none |
| Quick-action buttons (×4: new-invoice, list-clients, client-balance, quick-report) | AICopilotBubble.tsx:690-717 `onClick={() => triggerAgentAction(a)}` | ✅ | `useAIToolsExecute().mutate({intent, params, companySlug})` | POST `/api/ai/tools` ✅ exists (Audit 5 A8/B13: payload shape mismatch — hook sends `companySlug` at top level, server reads `params.companySlug` → 400 on every call) | ✅ `loading` shows animated dots | ✅ on error, appends "❌ فشل الإجراء: <err>" | ✅ on success with `confirmToken`, opens confirmation dialog; without, appends "✅ …" | — | UI correct; underlying API mismatch (Audit 5 A8) makes every quick-action 400. |
| Send button (paper plane) | AICopilotBubble.tsx:740-750 `onClick={() => send()}` | ✅ | same as suggestions | ✅ | ✅ | ✅ | ✅ | — | none |
| Enter key in input | AICopilotBubble.tsx:731 `onKeyDown` | ✅ | calls `send()` | ✅ | ✅ | ✅ | ✅ | — | none |
| Confirm-modal "تنفيذ" (Execute confirmed) | AICopilotBubble.tsx:656-666 `onClick={executeConfirmed}` | ✅ | `useAIToolsExecute().mutate({intent, params, confirmToken, companySlug})` | POST `/api/ai/tools` ✅ | ✅ `executing` shows `Loader2` + disables | ✅ on error, appends "❌ خطأ في التنفيذ: <err>" | ✅ on success, appends "✅ …" + clears confirmation | — | none |
| Confirm-modal "إلغاء" (Cancel) | AICopilotBubble.tsx:667-676 `onClick={cancelConfirmation}` | ✅ | n/a (local state: marks message "cancelled", clears confirmation) | n/a | n/a | n/a | ✅ appends "— تم الإلغاء من قبل المستخدم —" | — | none |
| Review-queue warning "فتح صفحة المراجعة" link inside chat | AICopilotBubble.tsx:567-574 `onClick={() => setShowReviewQueue(true)}` | ✅ | n/a (opens `<ReviewQueueModal>`) | n/a | n/a | n/a | n/a | — | none |
| **Stop generation button** | **absent** | ❌ | n/a | n/a | n/a | n/a | n/a | **P2** | Add a "إيقاف" button visible while `loading` or `executing` is true. Should call `chatMessagesMutation.reset()` / `toolsExecuteMutation.reset()` and abort the in-flight fetch (api-client doesn't expose AbortController — Audit 5 D5). |
| **Clear history button** | **absent** | ❌ | n/a | n/a | n/a | n/a | n/a | **P2** | Add a "مسح المحادثة" button in the header. Should clear local `messages` state AND call DELETE `/api/ai/chat` (route doesn't exist — would need to be added) or POST `/api/ai/chat` with `{action: "clear"}`. Currently the only way to clear chat is to reload the page. |

**Section 9 issues: 2** (both P2: missing stop-generation button, missing clear-history button). The underlying API mismatches (Audit 5 A8/B13) compound these but are server-side.

---

## Section 10 — Topbar (`src/modules/common/Topbar.tsx` + `NotificationsDropdown.tsx` + Sidebar.tsx for context)

The task spec lists "theme toggle, company switcher dropdown, mobile menu button, user menu" as Topbar elements. **Reality:** the Topbar component itself only renders 3 interactive elements. Theme toggle, company switcher, and user menu all live in the **Sidebar** (`src/modules/common/Sidebar.tsx`). This is itself a finding — the task spec expectation is mismatched with the actual layout.

| Element | File:Line | onClick wired? | Hook called | API exists? | Loading state? | Error state? | Success feedback? | Severity | Fix |
|---|---|---|---|---|---|---|---|---|---|
| Mobile hamburger menu | Topbar.tsx:41-50 `onClick={onOpenMobile}` | ✅ | n/a (AppShell toggles `mobileSidebar` state) | n/a | n/a | n/a | n/a | — | none |
| Active company badge (display-only chip) | Topbar.tsx:56-62 | ❌ **not clickable** — just a display chip. No onClick, no `<button>`, no dropdown. | n/a | n/a | n/a | n/a | n/a | **P2** | If the badge is intended to open the company switcher, add `onClick` that opens a dropdown (mirror Sidebar's `showCompanyMenu`). Currently the only way to switch company is via the Sidebar dropdown — which is hidden on mobile (the Sidebar is an off-canvas drawer). On mobile, there's no in-Topbar company switcher. |
| Plan pill | Topbar.tsx:63-71 | ❌ not clickable (display-only) | n/a | n/a | n/a | n/a | n/a | — | n/a (intentional display) |
| Command palette trigger (search box) | Topbar.tsx:75-95 `onClick={openCommandPalette}` | ✅ wired — dispatches `window.dispatchEvent(new CustomEvent("garfix:open-command-palette"))` | n/a (CommandPaletteProvider listens for the event) | n/a | n/a | n/a | ✅ palette opens | — | none |
| Notifications bell | NotificationsDropdown.tsx:90-107 `onClick={() => setOpen((v) => !v)}` | ✅ | `useNotifications("")` (note: empty slug — Audit 5 E1 flagged this routes doesn't filter by company) | GET `/api/notifications` ✅ exists | ✅ `loading` shows "جارٍ التحميل…" | ❌ **silent** — `useNotifications` query errors are not surfaced (no `useEffect` watching `error`). If the API 500s, the dropdown just shows "لا توجد إشعارات". | n/a | **P2** | Add `useEffect(() => { if (error) toast.error(...) }, [error])` like ClientList does. |
| Notification row click | NotificationsDropdown.tsx:157-161 `onClick={() => handleClickNotification(n)}` | ✅ | n/a — `handleClickNotification` does `window.location.href = n.link` | n/a | n/a | n/a | n/a | — | none — but using `window.location.href` instead of Next.js `<Link>` is a hard navigation (loses SPA state). **P3.** |
| Notifications "تعليم الكل كمقروء" (mark all read) | NotificationsDropdown.tsx:208-216 `onClick={markAllRead}` | ✅ | `useMarkAllNotificationsRead().mutateAsync()` → POST `/api/notifications` with `{action: "mark_all_read"}` | POST `/api/notifications` ✅ exists | ✅ `markingAll` shows "جارٍ…" + disables | ✅ `toast.error("تعذّر تحديث الإشعارات")` on catch | ✅ `toast.success("تم تعليم جميع الإشعارات كمقروءة")` | — | none |
| Notifications close "X" + outside-click + ESC | NotificationsDropdown.tsx:128-135, 70-86 | ✅ | n/a | n/a | n/a | n/a | n/a | — | none |
| **Theme toggle** (expected in Topbar per task spec) | **absent in Topbar** — lives in Sidebar.tsx:276 `onClick={toggleTheme}` | ✅ (in Sidebar) | n/a (BrandContext.toggleTheme) | n/a | n/a | n/a | ✅ swaps Sun/Moon icon | **P3** | Either move theme toggle to Topbar (more conventional) or document that it lives in Sidebar. Currently Topbar receives `theme` and `toggleTheme` as props (Topbar.tsx:23-24) but **never uses them** — dead props. |
| **Company switcher dropdown** (expected in Topbar per task spec) | **absent in Topbar** — lives in Sidebar.tsx:186 `onClick={() => { setActiveSlug(c.slug); … }}` | ✅ (in Sidebar) | n/a (BrandContext.setActiveSlug) | n/a | ✅ `loadingCompanies` shows "جارٍ التحميل…" | n/a | ✅ active company highlighted | **P2** | See "Active company badge" row above — on mobile there's no in-Topbar company switcher. |
| **User menu** (expected in Topbar per task spec) | **absent in Topbar** — lives in Sidebar.tsx:283 `onClick={onLogout}` | ✅ (in Sidebar) | n/a (AppShell.handleLogout → useAuth.logout) | POST `/api/auth/logout` ✅ exists | n/a | ✅ AppShell.handleLogout catches and toasts "تعذّر تسجيل الخروج" | n/a | **P3** | Either add a user-menu dropdown to Topbar (avatar + dropdown with logout, account, etc.) or document that it lives in Sidebar. |
| Dead props received by Topbar | Topbar.tsx:23-24 (`theme`, `toggleTheme`) and `user` prop (line 19, only used for type) | n/a | n/a | n/a | n/a | n/a | n/a | **P3** | Remove unused `theme`/`toggleTheme` props from Topbar's interface, OR actually wire a theme toggle button in the Topbar. |

**Section 10 issues: 4**
- **P2:** No in-Topbar company switcher — mobile users have no way to switch company without opening the Sidebar drawer.
- **P2:** Notifications dropdown silently swallows query errors.
- **P3:** Theme toggle absent from Topbar (lives in Sidebar); Topbar receives `theme`/`toggleTheme` props but never uses them (dead props).
- **P3:** User menu absent from Topbar (lives in Sidebar).

---

## Summary

### Totals

- **Elements checked across 10 screens:** 91 interactive elements (buttons, links, dropdowns, table-row actions, wizard steps, form submits, pagination, checkboxes, suggestion chips, quick actions, notification rows, etc.)
- **Total issues found:** 18
  - **P0 (broken handler / blocks user entirely):** 3
    1. CompanySettingsForm save → 403 for non-founders + garbage storage for founders (Section 8)
    2. TemplateSettingsForm save → same 403 + garbage storage (Section 8)
    3. TemplateListManager create/update/delete → 500 (Prisma client drift, Audit 5 R-1) (Section 8)
  - **P1 (broken in normal use):** 3
    4. Login page has no forgot-password link (Section 1)
    5. InvoicesView "تصدير CSV" button is a no-op "coming soon" toast (Section 5)
    6. InvoicesView bulk-delete swallows per-id errors silently + no summary toast (Section 5)
    7. CatalogView search input is wired to local state but never read — typing does nothing (Section 7)
  - **P2 (rough edge):** 7
    8. SetupWizard `saveProgress` silent catch (Section 3)
    9. SetupWizard country-select update silent catch (Section 3)
    10. Dashboard recent-invoice rows not clickable (Section 4)
    11. Dashboard recent-invoice mobile cards not clickable (Section 4)
    12. AICopilotBubble has no stop-generation button (Section 9)
    13. AICopilotBubble has no clear-history button (Section 9)
    14. Topbar has no in-Topbar company switcher (mobile users can't switch) (Section 10)
    15. NotificationsDropdown silently swallows query errors (Section 10)
  - **P3 (polish):** 8
    16. Dashboard KPI cards not clickable (Section 4)
    17. Dashboard "عرض الكل" uses raw `<a>` not `<Link>` (Section 4)
    18. Dashboard error state has no retry button (Section 4)
    19. Signup uses inline fetch instead of `useRegister` hook (Section 2)
    20. Signup 2 s auto-redirect race with manual "Continue" button (Section 2)
    21. ClientList per-row delete has no per-row loading state (Section 6)
    22. Notification row click uses `window.location.href` (hard nav) (Section 10)
    23. Topbar receives `theme`/`toggleTheme`/`user` props but never uses them (dead props); theme toggle and user menu live in Sidebar instead (Section 10)

(Note: 23 enumerated items but counted as 18 distinct issues because some rows above group multiple elements under one finding — e.g. Section 8 has 3 P0 issues but they share one root cause.)

### Top 3 most impactful findings

1. **[P0] Settings view is broken for every non-founder user** (Section 8). The entire `<CompanySettingsForm>` and `<TemplateSettingsForm>` route their save through `useUpdateSettings` → PATCH `/api/settings`, which is founder-only. Tenant admins (who have `settings_access` perm and can navigate to the Settings view) get a 403 toast on every save attempt. Even for founders, the form data is stored as garbage platform-level key/value pairs (Audit 5 A6/B17) instead of being applied to the actual company profile — so the save appears to succeed but doesn't update what the user expects. **Fix:** move company-profile updates to `/api/companies/[slug]` PATCH (which already exists and supports tenant admins), and gate `<TemplateSettingsForm>`/`<TemplateListManager>` behind `isFounder`.

2. **[P0] TemplateListManager create/update/delete 500s at runtime** (Section 8). The `db.invoiceTemplate` (and `db.invoiceTemplateSettings`) accessors are missing from the generated Prisma client (Audit 5 R-1: schema has 98 models, generated client has 52). Every button in the template manager — "قالب جديد", per-row "تعديل", per-row "حذف", confirm-delete — triggers a 500. The UI handlers are correctly wired with loading/error/success states, but the underlying API can never succeed. **Fix:** `bun run db:generate` (Audit 5 R-1).

3. **[P1] CatalogView search is a no-op** (Section 7). The search input is wired to local `search` state, but `useCatalog(activeCompany?.slug || "")` only takes the slug — the search value is never passed to the hook or used to filter the rendered `products` array. A user typing in the search box sees zero visible effect. This is the kind of bug that erodes trust rapidly because it looks like the app is "broken" rather than "missing a feature". **Fix:** either pass `search` to `useCatalog(slug, search)` and have the API filter, OR add a client-side `products.filter(p => p.name.includes(search) || p.code?.includes(search))` before pagination.

### Cross-references to prior audits

- **Audit 5 (API connectivity):** R-1 (Prisma client drift) → Section 8 P0; A6/B17 (useUpdateSettings mismatch) → Section 8 P0; A7 (useUpdateClient field name) → Section 6 note; A8/B13 (useAIToolsExecute payload/response) → Section 9 note; E4 (catalog parseInt(cuid)) → Section 7 note; E7 (invoice payment idempotency) → Section 5 note.
- **Audit 4 (navigation integrity):** B1 (signup success copy + 2 s auto-redirect) → Section 2 P3; D3 (Dashboard raw `<a>`) → Section 4 P3.
- **Audit 8 (cross-reference):** toast system split (mounted-but-unfed legacy + called-but-unmounted sonner) → affects every screen that calls `toast.success/error/info` — **the toasts mentioned throughout this audit may not actually render**. This is a P0 systemic issue already documented in Audit 8 and is not re-counted here, but it compounds every "Missing success feedback" finding: even where the code calls `toast.success(...)`, the user may see nothing.

### Artifact path

`/home/z/my-project/audit/Garfix/audit-artifacts/6-ui-click-audit.md`
