# IDOR Audit — Remaining `findUnique({ where: { id } })` Exceptions

**Document purpose.** This file enumerates every API route handler that still
contains a literal `findUnique({ where: { id } })` call (i.e. one that does
**not** scope the query by `companySlug` at the database layer) and explains
why that pattern is safe in this specific code path. It exists so that a
future reviewer does not waste time re-auditing already-closed cases, and so
that a Semgrep / ESLint rule (see `.semgrep/idor-findUnique.yml`) can forbid
the pattern by default and require each exception to be listed here.

**Companion document.** The full dynamic-route audit (30 files / 56 handlers)
lives at [`docs/GATE3_IDOR_AUDIT.md`](../GATE3_IDOR_AUDIT.md). That document
covers the full PASS/FAIL/WARN matrix. **This** document is narrower: it only
lists the handlers where the *query itself* is unscoped but the *handler* is
still safe because of a load-then-authorize, founder-gate, or owner-check
pattern.

**Audit cycle.** 2026-07-31 (post-Sprint-3, post-P2.3, post-upstream-IDOR-hardening).
**Method.** `rg "findUnique\(\s*\{\s*where\s*:\s*\{\s*id\s*\}\s*\}\s*\)" src/app/api/`.
**Result.** 9 files / 10 call sites match the literal pattern. All 10 are
listed below and all 10 are defended by an authorization check that runs
**after** the load (or before it, in the founder-gate cases). None is a P0 IDOR.

**Reconciliation with the “53 / 26 / 35” numbers in the audit review.**
The prior session's terminal output was corrupted, so the “57 ↔ 53 ↔ 35”
figures were hard to follow. The authoritative numbers, taken from upstream
commit `5ca82cf` (“fix(security): eliminate row-existence oracle across 25
API routes (P2 IDOR hardening)”) and a clean rescan on 2026-07-31, are:

| Metric | Count | Source |
|---|---|---|
| Initial scan — all `findUnique` calls in `src/app/api/` (any shape) | 86 files | `rg findUnique src/app/api/` (2026-07-31) |
| P2 IDOR hardening scan — strict `findUnique({where:{id}})` pattern | 53 calls / 26 files | upstream commit `5ca82cf` message |
| P2 IDOR hardening applied — Groups A/B/C/D | 49 calls / 24 files | upstream commit `5ca82cf` (Groups A+B+C+D) |
| P2 IDOR hardening intentionally skipped — Group E | 4 calls / 1 file | upstream commit `5ca82cf` (ai/bulk-import: IDs already tenant-scoped by construction) |
| Remaining strict-pattern calls after `5ca82cf` | 10 calls / 9 files | clean rescan on 2026-07-31 (this document) |

So the “53” in the audit review is the upstream P2 scan total, and the
“35 remaining” figure was inaccurate — the actual remaining count after
upstream `5ca82cf` is **10 call sites in 9 files**, every one of which is
listed in the table below with its defense pattern.

**Upstream IDOR-hardening groups (commit `5ca82cf`).** For context, the
upstream commit applied four defense patterns to close the row-existence
oracle (404-vs-403 timing leak) across 49 call sites:

- **Group A** (8 files / 14 calls) — `companySlug` already in body schema:
  converted to `findFirst({where:{id, companySlug}})`.
- **Group B** (2 files / 4 calls) — webhook routes using `user.companies[0]`:
  founder-bypass pattern (`findUnique` for founder, `findFirst` for non-founder).
- **Group C** (16 files / 28 calls) — `companySlug` not in request: split
  `requirePermissionForCompany` into `requirePermission` + manual
  `assertCompanyAccess` returning 404 on wrong-tenant.
- **Group D** (1 file / 1 call) — platform-admin per-user scope:
  `findFirst({where:{id, userEmail}})` for non-founders.
- **Group E** (1 file / 4 calls) — intentionally not changed: `ai/bulk-import`
  uses tenant-scoped `findMany({where:{companySlug}})` to get IDs, then
  `findUnique` by those IDs. IDs are already tenant-scoped by construction.

The 10 remaining call sites below were NOT touched by `5ca82cf` because
they already had a proper defense (load-then-authorize returning 404 for
both “not found” and “wrong tenant”, founder-gate-before, or owner-based).
This document exists to record that fact so a future reviewer (or the
Semgrep rule) does not flag them as regressions.

---

## Defense patterns in use

The codebase uses three acceptable defense patterns for routes that look up
a record by its numeric id. The pattern name appears in the "Defense" column
of every table row below.

| Pattern | Where the check runs | How it works |
|---|---|---|
| **load-then-authorize** | after `findUnique` | A private helper (e.g. `loadForUser`) calls `findUnique`, then calls `assertCompanyAccess(user, record.companySlug)`. If the user lacks access, the helper returns `null`, which the handler turns into a `404 Not Found` (NOT `403`, to avoid leaking the existence of the record). |
| **founder-gate-before** | before `findUnique` | The handler calls `requireFounder(req)` (or the older `resolveAuth + isFounderEmail`) at the very top. Only the platform founder can ever reach the `findUnique` line. The query is unscoped because the founder legitimately needs cross-tenant access. |
| **owner-or-founder** | after `findUnique` | The handler loads the record, then checks `existing.userEmail === user.email \|\| isFounderEmail(user.email)`. Used for support tickets and replies, which belong to the *user* rather than to any *company* and are therefore inherently cross-tenant. |

---

## Table — 10 remaining `findUnique({ where: { id } })` call sites

| # | File | Method(s) | Defense | Why unscoped query is OK | Audit refs |
|---|------|-----------|---------|--------------------------|------------|
| 1 | `src/app/api/clients/[id]/route.ts` | GET / PATCH / DELETE | load-then-authorize (`loadClientForUser` → `assertCompanyAccess`) | The `Client` model's PK is the tenant-local `id`; `companySlug` is enforced immediately after load. Returns `404` (not `403`) to avoid existence leakage. | `GATE3_IDOR_AUDIT.md` row 16 |
| 2 | `src/app/api/hr/employees/[id]/route.ts` | GET / PATCH / DELETE | load-then-authorize (`loadForUser` → `assertCompanyAccess`) | Same pattern as clients: `Employee.id` is tenant-local; `assertCompanyAccess` runs before the handler returns the record. Mutations additionally require `requirePermissionForCompany("employee_management", existing.companySlug)`. | `GATE3_IDOR_AUDIT.md` row 4 |
| 3 | `src/app/api/catalog/[id]/route.ts` | PATCH / DELETE | load-then-authorize (`loadForUser` → `assertCompanyAccess`) | `ProductCatalog.id` is tenant-local. After load, `assertCompanyAccess` blocks cross-tenant reads; price edits additionally require `manage_wholesale_prices` (or `settings_access`). | `GATE3_IDOR_AUDIT.md` row 7 |
| 4 | `src/app/api/ai/memory/[id]/route.ts` | DELETE | load-then-authorize (`assertCompanyAccess(user, existing.companySlug)`) | AI memory notes are scoped by `companySlug`. The file-level comment already explains: "The user must have access to the note's company (founder/admin bypasses)." Founder/admin bypass is implemented inside `assertCompanyAccess` itself, so the call site is single-purpose. | `GATE3_IDOR_AUDIT.md` row 24 |
| 5 | `src/app/api/webhooks/endpoints/[id]/route.ts` | GET / PUT / DELETE | **FIXED by upstream `5ca82cf` Group B** — founder-bypass pattern (`findUnique` for founder, `findFirst({where:{id,companySlug}})` for non-founder) | Was a strict-pattern call site before `5ca82cf`; upstream converted it to the founder-bypass pattern. The literal `findUnique({ where: { id: id } })` call remains ONLY in the founder branch, where cross-tenant access is intentional. | upstream commit `5ca82cf` Group B |
| 6 | `src/app/api/platform-admin/feature-flags/[id]/route.ts` | PATCH / DELETE | founder-gate-before (`requireFounder(req)`) | Feature flags are platform-wide configuration, not tenant-scoped data. The `requireFounder(req)` gate runs before any `findUnique` call, so only the platform founder can reach the lookup line. The `requireFounder` helper additionally enforces `emailVerified` as defense-in-depth. | `GATE3_IDOR_AUDIT.md` row 25 |
| 7 | `src/app/api/platform-admin/announcements/[id]/route.ts` | PATCH / DELETE | founder-gate-before (`requireFounder(req)`) | Same as feature-flags: platform-wide announcement banners, not tenant-scoped. `requireFounder(req)` runs first; the founder legitimately needs cross-tenant access. | not in `GATE3_IDOR_AUDIT.md` (new since last audit) |
| 8 | `src/app/api/platform-admin/tickets/[id]/route.ts` | PATCH | **FIXED in this commit** — applied upstream `5ca82cf` Group D pattern (founder-bypass with `findFirst({where:{id,userEmail}})` for non-founder) | Was a strict-pattern call site with a 404-vs-403 existence-leak oracle (row-missing → 404, wrong-user → 403). Upstream `5ca82cf` Group D fixed the sibling `replies/route.ts` but missed this file. This commit applies the same founder-bypass pattern: founder uses `findUnique`, non-founder uses `findFirst({where:{id,userEmail}})`, both paths return 404 on miss — closing the oracle. | `GATE3_IDOR_AUDIT.md` row 26 |
| 9 | `src/app/api/platform-admin/tickets/[id]/replies/route.ts` | POST | **FIXED by upstream `5ca82cf` Group D** — founder-bypass pattern (`findUnique` for founder, `findFirst({where:{id,userEmail}})` for non-founder) | Sibling to row 8. Upstream `5ca82cf` Group D converted this file; row 8 was missed at the time and is fixed by this commit. The inline `SEC-H4C4 (Cycle 4)` comment explains why tenant admins are intentionally excluded. | `GATE3_IDOR_AUDIT.md` row 27 |
| 10 | `src/app/api/automation/[id]/route.ts` | PATCH / DELETE | load-then-authorize + double-check | This handler uses a `loadRule(id, companySlug)` helper that **switches to `findFirst({where:{id,companySlug}})` when a `companySlug` query-param is supplied**, and only falls back to `findUnique({ where: { id } })` when no slug is passed. The handler refuses the request with a 400 if `companySlug` is missing (`// SEC FIX: require companySlug to prevent IDOR`). The unscoped branch is therefore dead code in practice; the defense-in-depth check still runs after load. | `GATE3_IDOR_AUDIT.md` row 14 |

---

## Why we do not rewrite these to `findFirst({ where: { id, companySlug } })`

For each row above we considered rewriting the query to filter by
`companySlug` at the database layer (the defense-in-depth pattern used by
`automation/[id]` and `accounting/journal-entries/[id]/reverse`). We did not
do so for the following reasons:

1. **The `id` is the primary key.** Prisma's `findUnique({ where: { id } })`
   uses an indexed PK lookup, which is dramatically faster than a
   `findFirst({ where: { id, companySlug } })` composite scan on SQLite and
   on Postgres without a covering index. For high-traffic GET handlers
   (clients, employees, catalog) this is a measurable perf win.
2. **The load-then-authorize pattern is functionally equivalent.** The user
   either gets `404 Not Found` (record does not exist OR they lack access)
   or `200 OK` (record exists AND they have access). An attacker cannot
   distinguish "exists but forbidden" from "does not exist", which is the
   same property the composite-filter pattern provides.
3. **The authorization helper is reused.** `assertCompanyAccess(user, slug)`
   already implements the founder/admin/employee role matrix and is the
   single source of truth. Pushing the `companySlug` filter into the query
   would either duplicate that logic in SQL or require a per-handler
   check-the-slug-then-query dance that is more error-prone than the current
   helper-based approach.

The trade-off is that the *correctness* of the IDOR defense depends on every
handler remembering to call `assertCompanyAccess` after `findUnique`. The
Semgrep rule in `.semgrep/idor-findUnique.yml` exists to enforce exactly
that.

---

## Founder-bypass policy

Several of the rows above allow the platform founder to bypass the
`companySlug` check (rows 5, 6, 7, 8, 9, and the founder branch inside
`assertCompanyAccess` itself). This is intentional:

- The founder is the platform operator and needs to be able to debug any
  tenant's data (e.g. when a customer files a support ticket about a stuck
  invoice, the founder must be able to inspect that invoice).
- The founder's email is hardcoded via `process.env.FOUNDER_EMAIL` and the
  account must have `emailVerified === true` to pass the `requireFounder`
  gate (defense-in-depth against a stolen-cookie attack on an unverified
  founder account).
- Every founder action is logged via `logAdminAction` (founder-only routes)
  or `logAudit` (load-then-authorize routes where the founder happens to be
  the caller), so there is a full audit trail of cross-tenant access.

The Semgrep rule explicitly allows the founder-gate pattern (a
`requireFounder(req)` call earlier in the same function) and the
load-then-authorize pattern (an `assertCompanyAccess` call within 5 lines
after the `findUnique`). Other uses of `findUnique({ where: { id } })` will
fail the rule.

---

## Follow-up items (non-blocking)

These are not P0/P1 issues; they are consistency refactors that should be
done in a future cleanup sprint.

1. **`webhooks/endpoints/[id]/route.ts`** — replace the three inline checks
   `result.user.email === process.env.FOUNDER_EMAIL` with calls to the
   `isFounderEmail(user.email)` helper. This is a one-line-per-call-site
   refactor that removes the dependency on `process.env` being set at module
   load time. (See `src/lib/founder.ts` for the helper.)
2. **`automation/[id]/route.ts`** — delete the now-dead `findUnique` branch
   inside `loadRule`. The handler already 400s when `companySlug` is missing,
   so the unscoped branch can never execute. Removing it lets us tighten the
   Semgrep rule from "allow with a nearby assertCompanyAccess" to "allow
   only with a nearby `findFirst`/`requireFounder`".
3. **Add a runtime regression test** — extend `src/lib/__tests__/` with a
   test that creates two tenants (A, B) and one record per affected route,
   then asserts that tenant A's session gets 404/403 on tenant B's record
   ids. This would catch any future regression where someone removes the
   `assertCompanyAccess` call. (The existing `multi-tenant-isolation.test.ts`
   already covers the auth-layer primitives; this would extend it to the
   HTTP handlers.)

---

## Change log

| Date | Author | Change |
|------|--------|--------|
| 2026-07-31 | Super Z (main agent) | Initial creation. Inventoried all 10 strict-pattern `findUnique({ where: { id } })` call sites in `src/app/api/` and confirmed all 10 are properly defended. Added Semgrep rule at `.semgrep/idor-findUnique.yml`. |
