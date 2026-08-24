/**
 * test.preload.ts — Global test setup that runs BEFORE any test file.
 *
 * Sets up environment variables needed by modules that tests import:
 *   - PAYMENTS_ENC_KEY: needed by cryptoVault for encryptSecret/decryptSecret
 *   - JWT_SECRET / JWT_REFRESH_SECRET: needed by auth
 *   - FOUNDER_EMAIL: needed by founder checks
 *   - DEEPSEEK_API_KEY: default AI provider for tests
 *
 * Without these, modules fall back to dev-only keys which can cause
 * cross-test inconsistencies (e.g. cryptoVault caches the key at module
 * load time, so if one test sets the env var and another doesn't, they
 * get different keys).
 */

// ── Crypto vault key (32+ chars) ────────────────────────────────────────────
if (!process.env.PAYMENTS_ENC_KEY) {
  process.env.PAYMENTS_ENC_KEY = "test-encryption-key-for-vault-32-chars-min!!";
}

// ── JWT secrets (64 hex chars) ──────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "a".repeat(64);
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = "b".repeat(64);
}

// ── Founder email ───────────────────────────────────────────────────────────
// HERMETIC TESTS FIX (2026-08-25): always override — a developer's .env may
// set FOUNDER_EMAIL to a real address, which silently broke the founder
// test fixtures (they expect founder@garfix.com). Tests must not depend on
// the ambient environment.
process.env.FOUNDER_EMAIL = "founder@garfix.com";

// ── Default AI provider: DeepSeek (cheapest + fastest for invoice parsing) ──
if (!process.env.DEEPSEEK_API_KEY) {
  process.env.DEEPSEEK_API_KEY = "sk-test-deepseek-key-placeholder";
}

// ── Disable maintenance crons during tests ──────────────────────────────────
if (!process.env.MAINTENANCE_DISABLED) {
  process.env.MAINTENANCE_DISABLED = "1";
}
