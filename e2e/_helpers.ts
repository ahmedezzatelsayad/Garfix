// TPD-01 FIX (Audit v2 · Phase 1)
/**
 * Shared E2E test helpers — real DB + real HTTP, no facades.
 *
 * These helpers exist so that every spec in `e2e/` can:
 *   1. Authenticate against the running app via the real /api/auth/login route
 *      (no mocked auth) and have the resulting session cookies applied to the
 *      Playwright browser context for subsequent page navigations.
 *   2. Obtain / attach the CSRF double-submit token required by middleware.ts
 *      for every mutating request (POST/PATCH/PUT/DELETE) — otherwise the
 *      dev server returns 403 "رمز حماية CSRF غير صالح أو مفقود" and the test
 *      would falsely conclude the route is broken.
 *   3. Query the DB directly via PrismaClient for state assertions, so tests
 *      verify what actually persisted — not just what the API chose to return.
 *   4. Generate unique identifiers (invoice numbers, client names, etc.) so
 *      tests can run in parallel / repeated without colliding on unique
 *      constraints (e.g. @@unique([companySlug, invoiceNumber])).
 *
 * Design notes:
 *   - `prisma` is a module-level singleton: spinning up a PrismaClient per
 *     test would exhaust the connection pool (default 20) when the suite
 *     runs with workers > 1. The client is reused across tests.
 *   - `login()` uses `page.request.post()` (NOT the standalone `request`
 *     fixture) because `page.request` shares cookies with the browser
 *     context — so after login, `page.goto('/dashboard')` carries the
 *     `inv_token` + `inv_refresh` cookies automatically. The standalone
 *     `request` fixture would keep cookies in a separate jar that the page
 *     never sees.
 *   - `authedJson()` reads the `inv_csrf` cookie out of the browser context
 *     and echoes it in the `x-csrf-token` header, exactly as the React
 *     client does in production. Without this every POST returns 403.
 */
import { test as base, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";

// ── Configuration ───────────────────────────────────────────────────────────

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

/** Test-only marker company slug. All test data is scoped to this slug so
 *  cleanup is a single DELETE WHERE companySlug = 'e2e-test'. */
export const TEST_COMPANY_SLUG = "e2e-test-company";

/** Founder email — MUST match the dev server's FOUNDER_EMAIL env var for the
 *  isFounderEmail() check in src/lib/founder.ts to return true. The default
 *  matches the fallback in founder.ts and .env.example. */
export const FOUNDER_EMAIL =
  process.env.E2E_FOUNDER_EMAIL || process.env.FOUNDER_EMAIL || "founder@garfix.app";

export const FOUNDER_PASSWORD =
  process.env.E2E_FOUNDER_PASSWORD ||
  process.env.FOUNDER_PASSWORD ||
  "E2eTestPassword2026!";

/** Default admin/employee credentials — created on the fly by `ensureTestUser`
 *  if they don't already exist in the DB. */
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "e2e-admin@garfix.app";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "E2eAdminPassword2026!";
export const EMPLOYEE_EMAIL =
  process.env.E2E_EMPLOYEE_EMAIL || "e2e-employee@garfix.app";
export const EMPLOYEE_PASSWORD =
  process.env.E2E_EMPLOYEE_PASSWORD || "E2eEmployeePassword2026!";

// ── Prisma singleton ────────────────────────────────────────────────────────

const prismaUrl =
  process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || "";

if (!prismaUrl) {
  // We don't throw — some CI environments run the lint check without a DB —
  // but we log loudly so a developer running the suite knows what to set.
   
  console.warn(
    "[e2e/_helpers] DATABASE_URL is not set — DB assertions will fail at runtime.",
  );
}

export const prisma = new PrismaClient({
  datasourceUrl: prismaUrl || undefined,
  log: ["warn", "error"],
});

// ── ID + value generators ───────────────────────────────────────────────────

/** Short, unique, human-readable suffix for invoice numbers / client names. */
export function uniqueSuffix(): string {
  return (
    Date.now().toString(36) + randomBytes(3).toString("hex").slice(0, 6)
  ).toLowerCase();
}

/** A unique invoice number that fits the @@unique([companySlug, invoiceNumber])
 *  constraint without colliding with seeded data. */
export function uniqueInvoiceNumber(): string {
  return `E2E-INV-${uniqueSuffix()}`;
}

/** A unique client name. */
export function uniqueClientName(): string {
  return `E2E Client ${uniqueSuffix()}`;
}

/** A unique webhook URL.
 *
 *  SSRF FIX: Previously this returned `http://localhost:9999/...` which is
 *  blocked by `validateBaseUrl()` (loopback host + non-HTTPS protocol). The
 *  webhook registration route would return 400/500 instead of 201, breaking
 *  the "register endpoint → trigger event → delivery row created" test.
 *
 *  Now we use a unique subdomain of `example.com` (a real domain reserved
 *  by RFC 2606 for documentation/testing — no real server will respond).
 *  The E2E test only verifies that:
 *    1. The endpoint is registered in the DB (encrypted secret stored).
 *    2. The event dispatch creates a WebhookDelivery row with status="pending".
 *  The actual HTTP delivery happens in `processPendingDeliveries()` which
 *  is NOT running in the test environment — so no real network call is made
 *  to example.com during the test. */
export function uniqueWebhookUrl(): string {
  return `https://example.com/webhook/${uniqueSuffix()}`;
}

/** A unique role id for RBAC tests — lowercase alphanumeric + underscores. */
export function uniqueRoleId(): string {
  return `e2e_role_${uniqueSuffix().replace(/[^a-z0-9]/g, "")}`;
}

// ── TOTP (RFC 6238) generator ───────────────────────────────────────────────
//
// We need this for the MFA E2E test: it sets up an MFASecret with a known
// base32 secret, then computes a real TOTP code to submit through the login
// form. We don't pull in `otplib` / `speakeasy` because the dependency cost
// is unjustified for a single test — RFC 6238 is 30 lines of crypto.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Decode a base32 string to a Buffer. Accepts uppercase RFC 4648 alphabet. */
export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 char: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a 6-digit TOTP code per RFC 6238 (SHA-1, 30s step). */
export function generateTOTP(secretBase32: string, at: Date = new Date()): string {
  const counter = Math.floor(at.getTime() / 1000 / 30);
  const buffer = Buffer.alloc(8);
  // Write counter as big-endian 64-bit
  buffer.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secretBase32);
  const hmac = createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  const code = truncated % 1_000_000;
  return code.toString().padStart(6, "0");
}

// ── Auth + CSRF helpers ─────────────────────────────────────────────────────

export interface LoginResult {
  status: number;
  body: unknown;
  ok: boolean;
}

/** POST /api/auth/login with the given credentials.
 *  Uses `page.request` so the response Set-Cookie headers populate the
 *  browser context — subsequent `page.goto()` calls carry the session. */
export async function login(
  page: Page,
  email: string,
  password: string,
  mfaCode?: string,
): Promise<LoginResult> {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password, mfaCode },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body, ok: response.ok() };
}

/** Fetch the CSRF double-submit token. The middleware sets the `inv_csrf`
 *  cookie on ANY response, so if we've already navigated / logged in, the
 *  cookie is present in the browser context. If not, we hit /api/auth/csrf
 *  to force-issues one. */
export async function getCsrfToken(page: Page): Promise<string> {
  // Try the cookie jar first — saves a round trip.
  const cookies = await page.context().cookies();
  const existing = cookies.find((c) => c.name === "inv_csrf");
  if (existing?.value) return existing.value;

  // Cookie missing — request one. /api/auth/csrf requires auth, so call this
  // AFTER login. If called before login it 401s, which we surface as an error.
  const response = await page.request.get("/api/auth/csrf");
  if (!response.ok()) {
    throw new Error(
      `Failed to obtain CSRF token: GET /api/auth/csrf returned ${response.status()}`,
    );
  }
  const json = (await response.json()) as { csrfToken?: string };
  if (!json.csrfToken) {
    throw new Error("CSRF endpoint returned no csrfToken field");
  }
  return json.csrfToken;
}

/** Make an authenticated, CSRF-signed JSON request via the page's API context.
 *  This is the correct way to call POST/PATCH/DELETE routes from E2E tests:
 *  it carries the session cookies AND the X-CSRF-Token header that
 *  middleware.ts requires. */
export async function authedJson(
  page: Page,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
): Promise<{ status: number; body: unknown; response: import("@playwright/test").APIResponse }> {
  const csrf = await getCsrfToken(page);
  const response = await page.request[method.toLowerCase() as "post" | "patch" | "put" | "delete"](path, {
    headers: {
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    data: data ?? {},
  });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body, response };
}

// ── Test user / company lifecycle ───────────────────────────────────────────

/** Ensure the test company exists in the DB. Returns the company row. */
export async function ensureTestCompany(): Promise<{
  id: string;
  slug: string;
}> {
  const company = await prisma.company.upsert({
    where: { slug: TEST_COMPANY_SLUG },
    update: {},
    create: {
      id: `e2e-company-${uniqueSuffix()}`,
      name: "E2E Test Company",
      slug: TEST_COMPANY_SLUG,
      currency: "SAR",
      country: "SA",
      plan: "trial",
      subscriptionStatus: "active",
      vatNumber: "E2E-VAT-001",
      address: "E2E Test Address, Riyadh",
      commercialRegistration: "E2E-CR-001",
      // P2-Reconciliation: currencyDecimalPlaces is a required Int column.
      currencyDecimalPlaces: 2,
    },
  });
  return { id: company.id, slug: company.slug };
}

/** Ensure a user exists with the given email + password + role, scoped to the
 *  test company. Uses bcryptjs (matching src/lib/auth.ts) so the dev server's
 *  verifyPasswordAndMaybeRehash can validate the password. */
export async function ensureTestUser(opts: {
  email: string;
  password: string;
  role: "admin" | "employee" | "founder";
  companies: string[];
  emailVerified?: boolean;
}): Promise<{ uid: string; email: string }> {
  const existing = await prisma.appUser.findUnique({
    where: { email: opts.email },
  });
  const passwordHash = await hash(opts.password, 12);
  if (existing) {
    // Update password hash + role so the test is deterministic across runs
    // even if a prior run was interrupted mid-cleanup.
    return prisma.appUser.update({
      where: { email: opts.email },
      data: {
        passwordHash,
        role: opts.role,
        companies: JSON.stringify(opts.companies),
        emailVerified: opts.emailVerified ?? true,
        tokenVersion: { increment: 1 },
      },
      select: { uid: true, email: true },
    });
  }
  const user = await prisma.appUser.create({
    data: {
      uid: `e2e-${opts.role}-${uniqueSuffix()}`,
      email: opts.email,
      passwordHash,
      displayName: `E2E ${opts.role}`,
      role: opts.role,
      companies: JSON.stringify(opts.companies),
      emailVerified: opts.emailVerified ?? true,
    },
    select: { uid: true, email: true },
  });
  return user;
}

/** Best-effort cleanup of all E2E-created test data. Called in afterEach
 *  for every spec so the suite is order-independent. */
export async function cleanupTestData(opts: {
  invoiceIds?: number[];
  clientIds?: string[];
  idempotencyKeys?: string[];
  webhookEndpointIds?: string[];
  fiscalPeriodIds?: string[];
  backupIds?: string[];
  userIds?: string[];
}): Promise<void> {
  // Delete in dependency order to avoid FK violations.
  if (opts.invoiceIds?.length) {
    await prisma.paymentTransaction.deleteMany({
      where: { invoiceId: { in: opts.invoiceIds } },
    }).catch(() => {});
    await prisma.eInvoice.deleteMany({
      where: { invoiceId: { in: opts.invoiceIds } },
    }).catch(() => {});
    await prisma.invoice.deleteMany({
      where: { id: { in: opts.invoiceIds } },
    }).catch(() => {});
  }
  if (opts.clientIds?.length) {
    await prisma.client.deleteMany({
      where: { id: { in: opts.clientIds } },
    }).catch(() => {});
  }
  if (opts.idempotencyKeys?.length) {
    await prisma.idempotencyKey.deleteMany({
      where: { key: { in: opts.idempotencyKeys } },
    }).catch(() => {});
  }
  if (opts.webhookEndpointIds?.length) {
    await prisma.webhookDelivery.deleteMany({
      where: { endpointId: { in: opts.webhookEndpointIds } },
    }).catch(() => {});
    await prisma.webhookEndpoint.deleteMany({
      where: { id: { in: opts.webhookEndpointIds } },
    }).catch(() => {});
  }
  if (opts.fiscalPeriodIds?.length) {
    await prisma.fiscalPeriod.deleteMany({
      where: { id: { in: opts.fiscalPeriodIds } },
    }).catch(() => {});
  }
  if (opts.userIds?.length) {
    await prisma.mFASecret.deleteMany({
      where: { userId: { in: opts.userIds } },
    }).catch(() => {});
    await prisma.appUser.deleteMany({
      where: { uid: { in: opts.userIds } },
    }).catch(() => {});
  }
}

/** Compute a SHA-256 hash hex string — used to verify the database stored
 *  exactly what we expected (e.g. invoice UUID hash matches). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// ── Extended test fixture (provides a ready-to-use logged-in page) ──────────

type Fixtures = {
  /** A page that has already logged in as the test admin and has CSRF
   *  cookies set. Specs that need a different role (employee/founder) can
   *  call `login()` manually. */
  adminPage: Page;
};

export const test = base.extend<Fixtures>({
  adminPage: async ({ page }, use) => {
    await ensureTestCompany();
    await ensureTestUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
      companies: [TEST_COMPANY_SLUG],
    });
    const result = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(result.status, `admin login should succeed (got ${result.status})`).toBe(200);
    await use(page);
  },
});

export { expect };
