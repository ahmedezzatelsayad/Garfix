# E2E — Playwright end-to-end tests

> Real, assertion-backed E2E tests for the Garfix ERP critical paths.
> Replaces the v1 facade suite (TPD-01 fix · Audit v2 · Phase 1).

**Status:** ✅ 30 tests (28 passing + 2 green-flaky) · Workflow green on every commit

## Test files

Each spec exercises a single critical path with REAL assertions: HTTP
status codes, response body fields, DB state via Prisma, and UI element
visibility (via `expect(locator).toBeVisible()`, never `isVisible().catch()`).

| File | Critical path | What it asserts |
|------|---------------|-----------------|
| `auth-mfa.spec.ts` | MFA login flow | SEC-06 anti-enumeration: password-only → 401 (NOT 200+mfaRequired); TOTP code → 200 + session cookie |
| `invoice-create.spec.ts` | Invoice creation | POST /api/invoices → 200, invoice in list, DB row with exact total (253), 409 on duplicate number |
| `payment-idempotent.spec.ts` | Idempotent payment | Same idempotency key → 200 both times, `paid` incremented once (not twice), single IdempotencyKey row |
| `zatca-clearance.spec.ts` | ZATCA e-invoicing | Mocked clearance via `page.evaluate(fetch)` → `clearanceStatus:"cleared"` + uuid; real negative path → 400 (no CCD cert) |
| `client-crud.spec.ts` | Client CRUD cycle | Create → list → update → list → delete → list; DB soft-delete (`deletedAt != null`) |
| `period-close.spec.ts` | Fiscal period close | POST /close → 200, DB status `open` → `closed`, `closedBy` + `closedAt` set, 400 on re-close |
| `webhook-delivery.spec.ts` | Webhook dispatch | Register → 201 + encrypted secret (https://example.com URL, NOT localhost); trigger → `dispatched >= 1`; SSRF guard → 400 |
| `backup-trigger.spec.ts` | Backup trigger | Founder → 200 + file on disk; admin → 403; 500 path with error message |
| `rbac-denial.spec.ts` | RBAC denial | Employee → /founder-panel/mission-control redirect; POST /roles → 403; DELETE /invoice → 403 (delete_invoice=0 for employees); positive control (GET invoices → 200 via view_invoices) |
| `rtl-render.spec.ts` | RTL layout | `<html dir="rtl" lang="ar">`; sidebar `right:0px`; body `font-family` contains "Cairo"; Arabic nav labels render |
| `focus-trap-keyboard.spec.ts` | Focus trap | Founder login → /founder-panel/ai-settings → click "اختبار الاتصال" → modal opens → Tab cycles inside → Escape closes → trigger present + enabled |

## Helper module

`_helpers.ts` provides shared utilities so each spec doesn't reimplement them:

- `prisma` — singleton PrismaClient for DB assertions (uses `E2E_DATABASE_URL` or `DATABASE_URL`)
- `login(page, email, password, mfaCode?)` — POST /api/auth/login via `page.request` (shares cookies with browser context)
- `authedJson(page, method, path, data)` — wraps `page.request` with the `x-csrf-token` header (required by middleware for all mutating requests)
- `getCsrfToken(page)` — reads the `inv_csrf` cookie or fetches a fresh one from /api/auth/csrf
- `ensureTestCompany()` / `ensureTestUser()` — idempotent setup of test data scoped to `TEST_COMPANY_SLUG = "e2e-test-company"`
- `cleanupTestData({ invoiceIds, clientIds, ... })` — best-effort teardown in `afterEach`
- `generateTOTP(secret)` — RFC 6238 TOTP code from a base32 secret (for the MFA test)
- `uniqueInvoiceNumber()` / `uniqueClientName()` / `uniqueSuffix()` / `uniqueWebhookUrl()` — unique value generators for parallel-safe tests
- `BASE_URL` — app origin (defaults to `http://localhost:3000`, used for absolute URLs in `page.evaluate(fetch)`)

## Key learnings (from E2E workflow fixes)

### 1. `page.route()` vs `page.request.*`
`page.route()` only intercepts **browser-initiated** requests (fetch/XHR
from JS running in the page). `page.request.*` calls go through Node's
APIRequestContext and are NOT intercepted. To mock an endpoint that the
test calls via `page.request.post()`, either:
- Use `page.context().route()` (covers context-wide APIRequestContext), OR
- Trigger the request via `page.evaluate(() => fetch(...))` so it
  originates from the browser context.

### 2. `page.evaluate(fetch)` needs absolute URLs
`fetch('/api/...')` inside `page.evaluate` throws "Failed to parse URL"
in some Chromium versions. Always pass the full URL:
```ts
const baseUrl = await page.evaluate(() => window.location.origin);
// or use BASE_URL from _helpers
const url = `${BASE_URL}/api/...`;
```

### 3. `document.cookie` throws SecurityError
`page.evaluate(() => document.cookie)` may throw `SecurityError: Failed
to read the 'cookie' property from 'Document'` on some origins. Read
cookies from the BrowserContext instead:
```ts
const cookies = await page.context().cookies();
const csrf = cookies.find(c => c.name === 'inv_csrf')?.value;
```

### 4. Server-side `redirect()` may not work in Bun
`next/navigation`'s `redirect()` from server components silently fails
in Next.js 16 + Bun production builds. For auth guards that MUST
redirect, use a client component with `router.replace()` after fetching
`/api/auth/me`.

### 5. `useFocusTrap` returnFocus races with React unmount
The hook's cleanup calls `previouslyFocused.focus()` synchronously, but
React may have unmounted the element by then. The fixed hook
(`src/lib/accessibility/index.ts`) uses `requestAnimationFrame` + retries
+ a re-queryable selector to restore focus reliably.

### 6. Anti-enumeration (SEC-06)
The login route returns the **same** 401 error for all failures (wrong
password / user not found / MFA missing / MFA wrong). Tests that
previously asserted `{ mfaRequired: true }` on a correct-password-no-MFA
attempt must now assert 401.

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
