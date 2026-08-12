# E2E — Playwright end-to-end tests

> Real, assertion-backed E2E tests for the Garfix ERP critical paths.
> Replaces the v1 facade suite (TPD-01 fix · Audit v2 · Phase 1).

## Test files

Each spec exercises a single critical path with REAL assertions: HTTP
status codes, response body fields, DB state via Prisma, and UI element
visibility (via `expect(locator).toBeVisible()`, never `isVisible().catch()`).

| File | Critical path | What it asserts |
|------|---------------|-----------------|
| `auth-mfa.spec.ts` | MFA login flow | `mfaRequired:true` response, TOTP code → 200 + session cookie, no redirect to /login |
| `invoice-create.spec.ts` | Invoice creation | POST /api/invoices → 200, invoice in list, DB row with exact total (253), 409 on duplicate number |
| `payment-idempotent.spec.ts` | Idempotent payment | Same idempotency key → 200 both times, `paid` incremented once (not twice), single IdempotencyKey row |
| `zatca-clearance.spec.ts` | ZATCA e-invoicing | Mocked clearance → `clearanceStatus:"cleared"` + uuid; real negative path → 400 (no CCD cert) + no EInvoice row |
| `client-crud.spec.ts` | Client CRUD cycle | Create → list → update → list → delete → list; DB soft-delete (`deletedAt != null`) |
| `period-close.spec.ts` | Fiscal period close | POST /close → 200, DB status `open` → `closed`, `closedBy` + `closedAt` set, 400 on re-close |
| `webhook-delivery.spec.ts` | Webhook dispatch | Register → 201 + encrypted secret; trigger → `dispatched >= 1`; DB delivery row with payload; SSRF guard |
| `backup-trigger.spec.ts` | Backup trigger | Founder → 200 + file on disk; admin → 403; 500 path with error message |
| `rbac-denial.spec.ts` | RBAC denial | Employee → /founder-panel redirect; POST /roles → 403; DELETE /invoice → 403; positive control (GET invoices → 200) |
| `rtl-render.spec.ts` | RTL layout | `<html dir="rtl" lang="ar">`; sidebar `right:0px`; body `font-family` contains "Cairo"; Arabic nav labels render |

## Helper module

`_helpers.ts` provides shared utilities so each spec doesn't reimplement them:

- `prisma` — singleton PrismaClient for DB assertions (uses `E2E_DATABASE_URL` or `DATABASE_URL`)
- `login(page, email, password, mfaCode?)` — POST /api/auth/login via `page.request` (shares cookies with browser context)
- `authedJson(page, method, path, data)` — wraps `page.request` with the `x-csrf-token` header (required by middleware for all mutating requests)
- `getCsrfToken(page)` — reads the `inv_csrf` cookie or fetches a fresh one from /api/auth/csrf
- `ensureTestCompany()` / `ensureTestUser()` — idempotent setup of test data scoped to `TEST_COMPANY_SLUG = "e2e-test-company"`
- `cleanupTestData({ invoiceIds, clientIds, ... })` — best-effort teardown in `afterEach`
- `generateTOTP(secret)` — RFC 6238 TOTP code from a base32 secret (for the MFA test)
- `uniqueInvoiceNumber()` / `uniqueClientName()` / `uniqueSuffix()` — unique value generators for parallel-safe tests

## CI lint guard

`lint-check.mjs` fails the build if any `*.spec.ts` file contains the
forbidden facade patterns (TPD-01):

- `isVisible().catch(` — silent-skip guard
- `expect(typeof` — tautological type check
- `.toBe("number")` — tautological value assertion

The script strips comments before scanning, so doc-comments that document
the anti-patterns are NOT flagged — only actual code occurrences fail.

Wire into CI:

```json
// package.json
"scripts": {
  "lint:e2e": "node e2e/lint-check.mjs"
}
```

Run locally:

```bash
node e2e/lint-check.mjs
```

## Running the tests

```bash
# Install browsers (one-time)
bunx playwright install

# Run all E2E tests (requires running app + DB)
bunx playwright test

# Run a single spec
bunx playwright test e2e/invoice-create.spec.ts

# Run with UI
bunx playwright test --ui

# HTML report
bunx playwright show-report
```

## Environment variables

The tests read credentials and DB URL from the environment. Defaults match
the seed script and `.env.example` — override for CI / staging:

```bash
# Database (must match the dev server's DB for DB assertions to work)
E2E_DATABASE_URL=postgresql://user:pass@host:5432/garfix

# Test users (created on-the-fly by _helpers.ts ensureTestUser)
E2E_FOUNDER_EMAIL=founder@garfix.app
E2E_FOUNDER_PASSWORD=E2eTestPassword2026!
E2E_ADMIN_EMAIL=e2e-admin@garfix.app
E2E_ADMIN_PASSWORD=E2eAdminPassword2026!
E2E_EMPLOYEE_EMAIL=e2e-employee@garfix.app
E2E_EMPLOYEE_PASSWORD=E2eEmployeePassword2026!

# App URL (defaults to http://localhost:3000)
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

## Test isolation

Every spec:

1. Creates its own test data in `beforeEach` (scoped to `TEST_COMPANY_SLUG`)
2. Cleans up in `afterEach` via `cleanupTestData()`
3. Uses unique identifiers (`uniqueInvoiceNumber()`, etc.) so parallel runs don't collide on `@@unique` constraints

Tests can run in any order and are safe to re-run.
