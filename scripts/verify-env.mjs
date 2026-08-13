#!/usr/bin/env node
/**
 * verify-env.mjs — Verify that production environment variables are real
 * (not build-placeholder values) before the runtime tries to use them.
 *
 * Run locally before deploying:
 *   node scripts/verify-env.mjs
 *
 * Or as part of a pre-deploy hook:
 *   "scripts": { "verify:env": "node scripts/verify-env.mjs" }
 *
 * Exit codes:
 *   0 — all critical env vars are present and well-formed
 *   1 — at least one critical env var is missing or has a placeholder value
 *
 * Why this exists:
 *   The `resolveSecret()` helper in src/lib/auth.ts has a build-phase escape
 *   hatch that returns a `build-placeholder-*-not-for-runtime-use` string
 *   when JWT_SECRET is missing during `next build`. This is necessary so
 *   `next build` doesn't fail when env vars aren't available at build time.
 *   BUT if those placeholder values leak into runtime (because the real
 *   secret isn't set on Vercel), JWT signing uses a publicly-known secret
 *   and auth becomes completely broken — without any error message.
 *
 *   This script makes the failure loud. Run it in CI before deploy, or
 *   run it manually with `vercel env pull && node scripts/verify-env.mjs`
 *   to confirm your Vercel env vars are actually set.
 */

// ── Critical env vars (production will fail without these) ─────────────────
const REQUIRED = [
  {
    name: "DATABASE_URL",
    pattern: /^postgresql:\/\/.+/,
    placeholderPrefix: "build-placeholder-",
    minLength: 30,
    description: "PostgreSQL connection string (Neon, Supabase, or self-hosted)",
  },
  {
    name: "JWT_SECRET",
    pattern: null, // any non-empty string ≥ 16 chars
    placeholderPrefix: "build-placeholder-",
    minLength: 16,
    description: "Secret used to sign access JWTs (≥ 16 chars, high entropy)",
  },
  {
    name: "JWT_REFRESH_SECRET",
    pattern: null,
    placeholderPrefix: "build-placeholder-",
    minLength: 16,
    description: "Secret used to sign refresh JWTs (≥ 16 chars, must differ from JWT_SECRET)",
  },
  // Phase 11 P2 fix: added missing REQUIRED vars
  {
    name: "FOUNDER_EMAIL",
    pattern: /^[^@]+@[^@]+\.[^@]+$/,
    placeholderPrefix: "build-placeholder-",
    minLength: 5,
    description: "Founder email for founder-panel access (must be valid email)",
  },
  {
    name: "PAYMENTS_ENC_KEY",
    pattern: null,
    placeholderPrefix: "build-placeholder-",
    minLength: 32,
    description: "AES-256 encryption key for payments/secrets (≥ 32 chars)",
  },
];

// ── Recommended env vars (warn if missing, don't fail) ─────────────────────
const RECOMMENDED = [
  { name: "NEXT_PUBLIC_APP_URL", description: "Public app URL for SEO/canonical links" },
  { name: "VALKEY_URL", description: "Redis-compatible URL for rate limiting + token blacklist + BullMQ" },
  { name: "DATABASE_DIRECT_URL", description: "Direct PostgreSQL URL for Prisma migrations (no pgbouncer)" },
  { name: "OPENROUTER_API_KEY", description: "OpenRouter API key for AI fallback chain" },
  { name: "GOOGLE_GENERATIVE_AI_API_KEY", description: "Gemini API key for AI" },
  { name: "SENTRY_DSN", description: "Sentry DSN for error monitoring" },
  { name: "SEED_ADMIN_PASSWORD", description: "Admin password for seed script (required only for bun run seed)" },
];

// TPD-15 FIX (Audit v2 · Phase 3): expanded cross-checks.
// ────────────────────────────────────────────────────────────────────────────
// Beyond simple presence/format checks, we add semantic cross-checks that
// catch configuration mistakes that would otherwise silently corrupt runtime
// behavior:
//   1. NODE_ENV must be "production" in production deploys (catches `next
//      build` running with the wrong env, which disables auth rate-limiting
//      and exposes dev-only endpoints).
//   2. JWT_SECRET and JWT_REFRESH_SECRET must differ (already checked below,
//      but we centralize the rule here so it's discoverable).
//   3. If VALKEY_URL is set, it must NOT use the default unauthenticated
//      `valkey://` scheme — production Valkey must require a password.
//   4. If DATABASE_URL contains `sslmode=disable`, warn loudly (RDS/Neon
//      require TLS).
//   5. PAYMENTS_ENC_KEY must NOT be one of the documented CI-build
//      placeholder values (extends the placeholderPrefix check with the
//      known CI strings).
// ────────────────────────────────────────────────────────────────────────────
const KNOWN_BAD_PLACEHOLDERS = new Set([
  "ci-build-encryption-key-at-least-32-characters!",
  "ci-test-encryption-key-at-least-32-characters!",
  "change-me-at-least-32-characters-long-please!!",
]);

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn(`  ⚠ ${msg}`);
}

console.log("\n=== GarfiX Environment Variable Verification ===\n");
console.log("Checking required env vars (these MUST be set in production):\n");

let allOk = true;

for (const v of REQUIRED) {
  const val = process.env[v.name];
  if (!val) {
    fail(`${v.name} is NOT SET. ${v.description}`);
    allOk = false;
    continue;
  }
  if (val.startsWith(v.placeholderPrefix)) {
    fail(
      `${v.name} is set to a BUILD-PLACEHOLDER value (\`${val.slice(0, 50)}...\`). ` +
      `This means the build-phase escape hatch in resolveSecret() leaked into runtime. ` +
      `Set the real value on Vercel: Project Settings → Environment Variables.`
    );
    allOk = false;
    continue;
  }
  if (val.length < v.minLength) {
    fail(`${v.name} is too short (${val.length} chars, need ≥ ${v.minLength}). ${v.description}`);
    allOk = false;
    continue;
  }
  if (v.pattern && !v.pattern.test(val)) {
    fail(`${v.name} has wrong format. ${v.description} (expected pattern: ${v.pattern})`);
    allOk = false;
    continue;
  }
  console.log(`  ✓ ${v.name} — OK (${val.length} chars)`);
}

// Special cross-check: JWT_SECRET and JWT_REFRESH_SECRET must differ
const jwtSecret = process.env.JWT_SECRET;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
if (jwtSecret && jwtRefreshSecret && jwtSecret === jwtRefreshSecret) {
  fail("JWT_SECRET and JWT_REFRESH_SECRET must NOT be the same value.");
  allOk = false;
}

// TPD-15 FIX (Audit v2 · Phase 3): NODE_ENV must be production in prod deploys.
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv && nodeEnv !== "production") {
  // Only fail when VERIFY_ENV_STRICT=1 (CI pre-deploy gate). For local dev
  // runs we warn — `bun run verify:env` is useful from a dev shell.
  if (process.env.VERIFY_ENV_STRICT === "1") {
    fail(`NODE_ENV is "${nodeEnv}" — must be "production" for prod deploys.`);
    allOk = false;
  } else {
    warn(`NODE_ENV is "${nodeEnv}" (expected "production" in prod).`);
  }
}

// TPD-15 FIX: PAYMENTS_ENC_KEY must not be a known-bad CI placeholder.
const paymentsKey = process.env.PAYMENTS_ENC_KEY;
if (paymentsKey && KNOWN_BAD_PLACEHOLDERS.has(paymentsKey)) {
  fail(
    `PAYMENTS_ENC_KEY is set to a known CI-build placeholder (${paymentsKey.slice(0, 20)}…). ` +
    `Generate a real key: openssl rand -base64 32`
  );
  allOk = false;
}

// TPD-15 FIX: VALKEY_URL must include a password in production.
const valkeyUrl = process.env.VALKEY_URL;
if (valkeyUrl) {
  try {
    const u = new URL(valkeyUrl);
    if (!u.password) {
      warn(
        `VALKEY_URL has no password component (${u.protocol}//${u.host}). ` +
        `Production Valkey must require authentication.`
      );
    }
  } catch {
    warn("VALKEY_URL is not a valid URL — skipping auth check.");
  }
}

// TPD-15 FIX: warn if DATABASE_URL disables TLS.
const dbUrl = process.env.DATABASE_URL;
if (dbUrl && /sslmode=disable/i.test(dbUrl)) {
  warn(
    "DATABASE_URL contains sslmode=disable — production DB connections MUST use TLS."
  );
}

console.log("\nChecking recommended env vars (warnings only):\n");
for (const v of RECOMMENDED) {
  if (!process.env[v.name]) {
    warn(`${v.name} is not set. ${v.description}.`);
  } else {
    console.log(`  ✓ ${v.name} — OK`);
  }
}

console.log("");
if (allOk) {
  console.log("✓ All critical env vars verified.\n");
} else {
  console.error("✗ Environment verification FAILED. Fix the issues above before deploying.\n");
  if (process.exitCode === undefined) process.exitCode = 1;
}

// ── How to set these on Vercel (printed on failure) ────────────────────────
if (!allOk) {
  console.log("To set these on Vercel:");
  console.log("  1. Go to https://vercel.com/[your-org]/[your-project]/settings/environment-variables");
  console.log("  2. Add each missing variable for the Production environment");
  console.log("  3. Or use the Vercel CLI:");
  console.log("       vercel env add DATABASE_URL production");
  console.log("       vercel env add JWT_SECRET production");
  console.log("       vercel env add JWT_REFRESH_SECRET production");
  console.log("  4. After setting, redeploy: vercel --prod");
  console.log("");
}
