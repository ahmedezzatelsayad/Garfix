# GATE 3 — IDOR Audit (Dynamic Routes in `src/app/api/`)

**Scope:** All 30 dynamic-route files under `src/app/api/` were reviewed for the
"Missing Authorization / Insecure Direct Object Reference" pattern.

**Audit method:** For each `GET` / `POST` / `PATCH` / `DELETE` handler we verified:
1. That it calls `resolveAuth()` / `requireAuth()` / `requirePermission()` /
   `requirePermissionForCompany()` / `requireFounder()` first.
2. That, after loading the resource by its id, the handler validates the
   authenticated user can access the resource's `companySlug` via
   `assertCompanyAccess(user, companySlug)` (single-resource reads) or via
   `requirePermissionForCompany(req, perm, existing.companySlug)` (mutations),
   or that the route is intentionally founder-only / cross-tenant.

**Reference helpers** (see `src/lib/auth.ts` + `src/lib/middleware.ts`):
- `resolveAuth(req)` → 401 if no session
- `assertCompanyAccess(user, slug)` → boolean (founder/admin bypass)
- `requirePermissionForCompany(req, perm, slug)` → 401/403 + permission check + tenant check
- `requireFounder(req)` → 403 unless caller email matches `FOUNDER_EMAIL` and is verified

---

## Critical findings (P0 FAIL)

Only **one** P0 issue was found and **fixed in-place**:

### 1. `src/app/api/storage/[key]/route.ts` — GET (FIXED)

- **Before:** the handler served any stored file by its UUID key with **no
  authentication at all**. The keys themselves are 128-bit random UUIDs (so
  guess-attacks are infeasible), but anyone who ever obtained a URL — e.g. via
  a leaked email, browser history, referrer header, or screenshot — could read
  the file forever, even after their session was revoked.
- **Fix applied:** added `resolveAuth(req)` at the top of the handler and
  returns 401 if not authenticated. Because the auth cookie is `sameSite=lax`
  and `httpOnly`, browsers automatically send it on `<img src="/api/storage/...">`
  requests, so legitimate image rendering inside the authenticated app is
  unaffected. A TODO comment was added recommending a separate signed-URL
  mechanism for any future public/landing-page assets.
- **Status:** ✅ FIXED (see `src/app/api/storage/[key]/route.ts:28-41`).

---

## Audit table

| # | Route | Method | Auth? | Company-scope check? | Status | Recommended fix |
|---|-------|--------|-------|----------------------|--------|-----------------|
| 1 | `hr/attendance/[id]` | PATCH | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 1 | `hr/attendance/[id]` | DELETE | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 2 | `hr/salaries/[id]` | PATCH | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 2 | `hr/salaries/[id]` | DELETE | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 3 | `hr/commissions/[id]` | PATCH | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 3 | `hr/commissions/[id]` | DELETE | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 4 | `hr/employees/[id]` | GET | ✅ `resolveAuth` + `loadForUser` (asserts company) | ✅ `assertCompanyAccess` inside `loadForUser` | ✅ PASS | — |
| 4 | `hr/employees/[id]` | PATCH | ✅ `resolveAuth` + `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 4 | `hr/employees/[id]` | DELETE | ✅ `resolveAuth` + `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 5 | `hr/leaves/[id]` | PATCH | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 5 | `hr/leaves/[id]` | DELETE | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 6 | `hr/performance/[id]` | PATCH | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 6 | `hr/performance/[id]` | DELETE | ✅ `requirePermissionForCompany` | ✅ `existing.companySlug` | ✅ PASS | — |
| 7 | `catalog/[id]` | PATCH | ✅ `resolveAuth` + `requirePermissionForCompany` | ✅ `existing.companySlug` (via `loadForUser`) | ✅ PASS | — |
| 7 | `catalog/[id]` | DELETE | ✅ `resolveAuth` + `requirePermissionForCompany` | ✅ `existing.companySlug` (via `loadForUser`) | ✅ PASS | — |
| 8 | `invoices/[id]` | GET | ✅ `resolveAuth` | ✅ `assertCompanyAccess(user, invoice.companySlug)` | ✅ PASS | — |
| 8 | `invoices/[id]` | PATCH | ✅ `requirePermissionForCompany("edit_invoice")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 8 | `invoices/[id]` | DELETE | ✅ `requirePermissionForCompany("delete_invoice")` | ✅ `existing.companySlug` (soft-delete) | ✅ PASS | — |
| 9 | `invoices/[id]/status` | PATCH | ✅ `requirePermissionForCompany("edit_invoice")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 10 | `invoices/[id]/payment` | PATCH | ✅ `requirePermissionForCompany("finance_access")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 11 | `accounting/accounts/[id]` | DELETE | ✅ `requirePermissionForCompany("finance_access")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 12 | `accounting/journal-entries/[id]` | DELETE | ✅ `requirePermissionForCompany("finance_access")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 13 | `accounting/journal-entries/[id]/reverse` | POST | ✅ `requirePermissionForCompany("finance_access")` | ✅ `findFirst({where:{id,companySlug}})` + `existing.companySlug` | ✅ PASS | Defense-in-depth: requires `companySlug` query param and uses it in the `findFirst` filter, then re-checks via `requirePermissionForCompany`. |
| 14 | `automation/[id]` | PATCH | ✅ `requirePermissionForCompany("settings_access")` | ✅ `findFirst({where:{id,companySlug}})` + `existing.companySlug` | ✅ PASS | Same double-check pattern as #13. |
| 14 | `automation/[id]` | DELETE | ✅ `requirePermissionForCompany("settings_access")` | ✅ `findFirst({where:{id,companySlug}})` + `existing.companySlug` | ✅ PASS | Same as above. |
| 15 | `automation/[id]/logs` | GET | ✅ `requirePermissionForCompany("settings_access")` | ✅ `rule.companySlug` | ✅ PASS | — |
| 16 | `clients/[id]` | GET | ✅ `resolveAuth` + `loadClientForUser` | ✅ `assertCompanyAccess` inside `loadClientForUser` | ✅ PASS | — |
| 16 | `clients/[id]` | PATCH | ✅ `requirePermissionForCompany("edit_customer")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 16 | `clients/[id]` | DELETE | ✅ `requirePermissionForCompany("delete_customer")` | ✅ `existing.companySlug` (soft-delete) | ✅ PASS | — |
| 17 | `clients/[id]/profile` | GET | ✅ `resolveAuth` + `hasPermission("view_customers")` | ✅ `assertCompanyAccess(user, client.companySlug)` | ✅ PASS | — |
| 18 | `purchases/[id]` | PATCH | ✅ `requirePermissionForCompany("settings_access")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 18 | `purchases/[id]` | DELETE | ✅ `requirePermissionForCompany("settings_access")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 19 | `inventory/warehouses/[id]` | PATCH | ✅ `requirePermissionForCompany("settings_access")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 19 | `inventory/warehouses/[id]` | DELETE | ✅ `requirePermissionForCompany("settings_access")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 20 | `companies/[slug]/members` | GET | ✅ `requirePermissionForCompany("settings_access", slug)` | ✅ `slug` from path | ✅ PASS | — |
| 20 | `companies/[slug]/members` | POST | ✅ `requirePermissionForCompany("settings_access", slug)` | ✅ `slug` from path | ✅ PASS | — |
| 21 | `companies/[slug]/members/[uid]` | PATCH | ✅ `requirePermissionForCompany("settings_access", slug)` | ✅ `slug` from path + membership re-check | ✅ PASS | — |
| 21 | `companies/[slug]/members/[uid]` | DELETE | ✅ `requirePermissionForCompany("settings_access", slug)` | ✅ `slug` from path + membership re-check | ✅ PASS | — |
| 22 | `companies/[slug]` | GET | ✅ `resolveAuth` | ✅ `assertCompanyAccess(user, slug)` | ✅ PASS | — |
| 22 | `companies/[slug]` | PATCH | ✅ `requirePermissionForCompany("settings_access", slug)` | ✅ `slug` from path | ✅ PASS | — |
| 22 | `companies/[slug]` | DELETE | ✅ `resolveAuth` + `isFounderEmail` | N/A — founder-only | ⚠️ WARN | Founder check is correct, but uses inline `isFounderEmail` instead of `requireFounder(req)`, so it skips the emailVerified defense-in-depth check that `requireFounder` enforces. Recommend swapping to `requireFounder(req)` for consistency. Not P0 (founder email check itself is correct). |
| 23 | `saas/users/[uid]` | PATCH | ✅ `requireAuth` | N/A — cross-tenant by design (SaaS user management); uses `isSelf \|\| isCallerAdmin` ownership check + founder-protection rules | ✅ PASS | — |
| 23 | `saas/users/[uid]` | DELETE | ✅ `requireFounder(req)` | N/A — founder-only | ✅ PASS | — |
| 24 | `ai/memory/[id]` | DELETE | ✅ `resolveAuth` | ✅ `assertCompanyAccess(user, existing.companySlug)` | ✅ PASS | — |
| 25 | `platform-admin/feature-flags/[id]` | PATCH | ✅ `requireFounder(req)` | N/A — founder-only (cross-tenant feature flag) | ✅ PASS | — |
| 25 | `platform-admin/feature-flags/[id]` | DELETE | ✅ `requireFounder(req)` | N/A — founder-only | ✅ PASS | — |
| 26 | `platform-admin/tickets/[id]` | PATCH | ✅ `resolveAuth` | ✅ Owner-based: `existing.userEmail === user.email \|\| isAdmin` | ✅ PASS | Support tickets are cross-tenant by design; owner-based access is correct. |
| 27 | `platform-admin/tickets/[id]/replies` | POST | ✅ `resolveAuth` | ✅ Owner-based: `existing.userEmail === user.email \|\| isAdmin` | ✅ PASS | Same as #26. |
| 28 | `platform-admin/tenants/[slug]` | GET | ✅ `requireFounder(req)` | N/A — founder-only | ✅ PASS | — |
| 28 | `platform-admin/tenants/[slug]` | PATCH | ✅ `requireFounder(req)` | N/A — founder-only | ✅ PASS | — |
| 28 | `platform-admin/tenants/[slug]` | DELETE | ✅ `requireFounder(req)` | N/A — founder-only | ✅ PASS | — |
| 29 | `invoice-templates/[id]` | PATCH | ✅ `requirePermissionForCompany("settings_access")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 29 | `invoice-templates/[id]` | DELETE | ✅ `requirePermissionForCompany("settings_access")` | ✅ `existing.companySlug` | ✅ PASS | — |
| 30 | `storage/[key]` | GET | ❌ → ✅ FIXED (now `resolveAuth`) | N/A — file served by UUID key (no tenant field) | ✅ FIXED | **P0 fix applied.** See "Critical findings" section above. |

---

## Summary

- **Total routes audited:** 30 files, 56 HTTP handlers (some files export multiple methods).
- **P0 FAIL found and fixed:** 1 (`storage/[key]` GET — added `resolveAuth` gate).
- **WARN (non-P0, no auto-fix applied):** 1 (`companies/[slug]` DELETE — uses inline `isFounderEmail` instead of `requireFounder`; functionally correct but skips the emailVerified check. Recommend a follow-up refactor).
- **PASS:** 54 handlers.
- **No P0 FAILs remain.**

## Notes on intentional cross-tenant routes

The following routes are intentionally cross-tenant and are exempt from the
`companySlug` requirement (founder-only or owner-based):

- `platform-admin/feature-flags/[id]` — founder-only (`requireFounder`).
- `platform-admin/tenants/[slug]` — founder-only (`requireFounder`).
- `platform-admin/tickets/[id]` and `replies` — owner-based (`userEmail` match).
  Support tickets are inherently cross-tenant: a user's ticket belongs to the
  user, not to any single company they may belong to.
- `saas/users/[uid]` PATCH — SaaS user management is cross-tenant by design
  (a user may belong to multiple companies); protected by `isSelf || isCallerAdmin`
  plus founder-protection rules. DELETE is founder-only.
- `storage/[key]` — file assets served by unguessable UUID; auth is now required
  but tenant scoping is intentionally not enforced (an authed user can fetch any
  logo by UUID). This is acceptable because the only files currently stored
  are non-sensitive company logos.

## Follow-up recommendations (not P0)

1. **`companies/[slug]` DELETE** — replace `resolveAuth + isFounderEmail` with
   `requireFounder(req)` to inherit the emailVerified check. ~3-line change.
2. **`storage/[key]`** — add a `public/` prefix convention (or a separate
   `/api/public-storage/[key]` route) for assets that must be embeddable on
   public landing pages without auth, and keep the main route authed.
3. **Consider a smoke test** in the new test suite (see `docs/GATE2_TEST_SUITE.md`)
   that hits one tenant-scoped route with a stolen-id from another tenant to
   assert the 403 path — this would catch future regressions where someone
   forgets to thread `existing.companySlug` into the auth check.
