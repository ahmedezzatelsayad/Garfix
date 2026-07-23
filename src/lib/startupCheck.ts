/**
 * startupCheck.ts — Validates environment + secrets on server boot.
 *
 * Implements E-01 (force secrets at startup) + E-14 (warning for missing
 * WHATSAPP_ALLOWED_SENDERS). Called from API route /api/startup-check.
 *
 * ⚠️ ARCHITECTURAL CHANGE (v12.1):
 * This module NO LONGER imports or registers queue workers.
 * Worker registration has been moved to src/runtime/bootstrap.ts
 * to prevent side-effects during `next build`.
 *
 * Previous anti-pattern:
 *   import "./workers/aiProductMatchWorker"  // ← caused registerAIProductMatchWorker() on import
 *   import "./workers/emailWorker"           // ← caused registerEmailWorker() on import
 *   ...etc
 *
 * New pattern: Workers are only registered when explicitly calling
 * bootstrapRuntime() from the server entry point.
 *
 * Failure modes:
 *   - FATAL: JWT_SECRET missing → server refuses to start
 *   - FATAL: FOUNDER_EMAIL missing → server refuses to start
 *   - WARN:  WHATSAPP_ALLOWED_SENDERS missing → logs warning
 *   - WARN:  PAYMENTS_ENC_KEY missing → logs warning (uses fallback in dev)
 *   - WARN:  LOG_LEVEL invalid → falls back to "info"
 */

import { logger } from "./logger";
import { DEFAULT_PLANS } from "./plans";

// ❌ REMOVED: All worker imports that caused build-time side effects
// These are now in src/runtime/bootstrap.ts
// import "./workers/aiProductMatchWorker";
// import "./workers/emailWorker";
// import "./workers/whatsappWorker";
// import "./workers/backupWorker";
// import "./workers/schedulerWorker";

const REQUIRED_FOR_PRODUCTION = [
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "FOUNDER_EMAIL",
  "DATABASE_URL",
];

const RECOMMENDED = [
  "WHATSAPP_ALLOWED_SENDERS",
  "PAYMENTS_ENC_KEY",
  "SMTP_HOST",
  "SMTP_FROM",
];

// SEC-C3 / SEC-M4 FIX (Cycle 1): Blocklist of known placeholder / leaked
// secret values that must NEVER be accepted in production. If any env var
// matches one of these, the server refuses to boot.
//
// These values come from the originally-committed `.env` file — they are
// effectively public. Anyone running production with one of these values is
// running with a compromised secret.
const LEAKED_PLACEHOLDER_VALUES: ReadonlySet<string> = new Set([
  "garfix-build-secret-key-32-chars-long!!",
  "garfix-refresh-secret-32-chars!!",
  "garfix-payments-encryption-32-char-key!!",
  "garfix-dev-secret-change-me",
  "garfix_strong_pass_change_me",
]);

// Env vars that must not match any leaked placeholder value in production.
const PLACEHOLDER_CHECKED_VARS = [
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "PAYMENTS_ENC_KEY",
];

function isPlaceholderValue(value: string): boolean {
  // Direct match against the blocklist (case-insensitive).
  const lower = value.toLowerCase();
  for (const leaked of LEAKED_PLACEHOLDER_VALUES) {
    if (lower === leaked.toLowerCase()) return true;
  }
  // Heuristic: starts with the canonical prefix.
  if (lower.startsWith("replace_with_")) return true;
  if (lower.startsWith("garfix-build-secret")) return true;
  if (lower.startsWith("garfix-refresh-secret")) return true;
  if (lower.startsWith("garfix-payments-encryption")) return true;
  if (lower.startsWith("garfix-dev-secret")) return true;
  return false;
}

// ── CRITICAL-002 FIX (Cycle 2): Strength-based secret validation ─────────
// A blocklist only catches secrets we already know are bad. An attacker can
// use any low-entropy string the blocklist doesn't know about (e.g.
// `garfix-prod-jwt-2024!!`). The strength check below catches any secret
// that is too short, too repetitive, or matches a "looks like a placeholder"
// regex — defense-in-depth on top of the blocklist.
//
// Production-only. Dev uses the deterministic fallback in auth.ts which is
// clearly marked and not production-grade.
const WEAK_SECRET_PATTERNS: readonly RegExp[] = [
  /garfix/i,
  /^dev-only-/i,
  /change[-_]?me/i,
  /secret[-_]?key/i,
  /password/i,
  /placeholder/i,
  /example/i,
  /12345/,
  /^test[-_]/i,
  /^ci[-_]/i,
  /[-_]+$/, // trailing dashes/underscores (common in hand-typed placeholders)
];

/**
 * Returns true if `value` is too weak to be a production secret.
 * Checks: minimum length, pattern blocklist, and Shannon-style entropy.
 */
export function isSecretWeak(value: string, opts: { minLength?: number } = {}): boolean {
  const minLength = opts.minLength ?? 32;
  if (typeof value !== "string" || value.length < minLength) return true;
  if (WEAK_SECRET_PATTERNS.some((re) => re.test(value))) return true;
  // Entropy heuristic: unique-character ratio. A 32-char string with only
  // 8 unique characters is almost certainly a hand-typed placeholder like
  // `garfix-build-secret-key-32-chars-long!!`.
  const unique = new Set(value).size;
  if (unique < value.length / 3) return true;
  // Reject secrets that are just one repeated character / very low variety.
  if (unique < 4) return true;
  return false;
}

export interface StartupCheckResult {
  ok: boolean;
  fatal: string[];
  warnings: string[];
}

export function runStartupChecks(): StartupCheckResult {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  // Required (always)
  if (!process.env.JWT_SECRET) {
    fatal.push("JWT_SECRET is required — set it to a strong random string (>= 32 chars)");
  } else if (process.env.JWT_SECRET.length < 16) {
    fatal.push("JWT_SECRET is too short — use at least 16 characters");
  }

  if (!process.env.JWT_REFRESH_SECRET) {
    fatal.push("JWT_REFRESH_SECRET is required — set it to a different strong random string");
  }

  if (!process.env.FOUNDER_EMAIL) {
    fatal.push("FOUNDER_EMAIL is required — set it to the founder account email");
  }

  if (!process.env.DATABASE_URL) {
    fatal.push("DATABASE_URL is required — set it to a Prisma connection string");
  }

  // Production-only strict checks
  if (isProd) {
    if (!process.env.PAYMENTS_ENC_KEY) {
      fatal.push("PAYMENTS_ENC_KEY is required in production — generate one with: openssl rand -base64 32");
    }
    // SEC-C3 / SEC-M4 FIX: reject any known leaked/placeholder value.
    // The original `.env` file was committed to the repo with these exact
    // values, so they are effectively public — production must NOT use them.
    for (const varName of PLACEHOLDER_CHECKED_VARS) {
      const value = process.env[varName];
      if (value && isPlaceholderValue(value)) {
        fatal.push(
          `${varName} is set to a known leaked/placeholder value. ` +
            `Generate a fresh secret with: openssl rand -base64 48 (for JWT_*) or openssl rand -base64 32 (for PAYMENTS_ENC_KEY).`,
        );
      }
    }
    // SEC-C3 FIX: reject the leaked DATABASE_URL password too.
    const dbUrl = process.env.DATABASE_URL || "";
    if (dbUrl.includes("garfix_strong_pass_change_me")) {
      fatal.push(
        "DATABASE_URL still uses the leaked placeholder password 'garfix_strong_pass_change_me'. " +
          "Rotate the database user's password and update DATABASE_URL / DATABASE_DIRECT_URL.",
      );
    }

    // CRITICAL-002 FIX (Cycle 2): strength-based secret validation.
    // Even if a secret is NOT in the blocklist above, reject it if it's
    // too short, too repetitive, or matches a "looks like a placeholder"
    // pattern. This catches e.g. `garfix-prod-jwt-2024!!` which would
    // sail past the blocklist but is trivially guessable.
    //
    // JWT secrets: minimum 32 chars (OWASP), high entropy.
    // PAYMENTS_ENC_KEY: minimum 32 chars (AES-256-GCM key requirement).
    const SECRET_STRENGTH_CHECKS: Array<{ name: string; minLength: number }> = [
      { name: "JWT_SECRET", minLength: 32 },
      { name: "JWT_REFRESH_SECRET", minLength: 32 },
      { name: "PAYMENTS_ENC_KEY", minLength: 32 },
    ];
    for (const { name, minLength } of SECRET_STRENGTH_CHECKS) {
      const value = process.env[name];
      if (!value) continue; // missing-secret errors handled above
      if (isSecretWeak(value, { minLength })) {
        fatal.push(
          `${name} appears weak (too short, low entropy, or matches a placeholder pattern). ` +
            `Generate a fresh secret with: openssl rand -hex 64 (for JWT_*) or openssl rand -base64 32 (for PAYMENTS_ENC_KEY).`,
        );
      }
    }
    // Defense-in-depth: JWT_SECRET and JWT_REFRESH_SECRET MUST differ.
    if (
      process.env.JWT_SECRET &&
      process.env.JWT_REFRESH_SECRET &&
      process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET
    ) {
      fatal.push(
        "JWT_SECRET and JWT_REFRESH_SECRET must be DIFFERENT values. " +
          "Using the same secret means compromising one token type compromises both.",
      );
    }
  }

  // Recommended (warn)
  if (!process.env.WHATSAPP_ALLOWED_SENDERS) {
    warnings.push(
      "WHATSAPP_ALLOWED_SENDERS is not set — WhatsApp inbound messages from any number will be processed. " +
      "Set it to a comma-separated allowlist of phone numbers for production safety.",
    );
  }

  if (!process.env.PAYMENTS_ENC_KEY && !isProd) {
    warnings.push(
      "PAYMENTS_ENC_KEY is not set — using JWT_SECRET as fallback for encrypting secrets at rest. " +
      "Set a dedicated key in production with: openssl rand -base64 32",
    );
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    warnings.push(
      "SMTP_HOST/SMTP_FROM not configured — email features (OTP, welcome email, ticket replies) will be non-functional.",
    );
  }

  // Log results
  if (fatal.length > 0) {
    fatal.forEach((msg) => logger.error("[startup] FATAL environment check failed", { msg }));
    logger.error("[startup] refusing to boot due to missing required configuration", { fatal, warnings });
    if (isProd) {
      throw new Error(`FATAL startup config errors: ${fatal.join("; ")}`);
    }
    logger.warn("[startup] continuing in dev mode despite fatal errors");
  }

  if (warnings.length > 0) {
    warnings.forEach((msg) => logger.warn("[startup] configuration warning", { msg }));
  }

  if (fatal.length === 0 && warnings.length === 0) {
    logger.info("[startup] all environment checks passed");
  }

  return { ok: fatal.length === 0, fatal, warnings };
}

/** Plan limits catalog loader — checks that plan values are sensible. */
export function validatePlanLimits(): void {
  try {
    for (const [key, plan] of Object.entries(DEFAULT_PLANS)) {
      if (plan.maxUsers < -1) logger.warn("[startup] plan has invalid maxUsers", { plan: key });
      if (plan.maxInvoicesPerMonth < -1) logger.warn("[startup] plan has invalid maxInvoices", { plan: key });
      if (plan.maxCompanies < -1) logger.warn("[startup] plan has invalid maxCompanies", { plan: key });
    }
    logger.info("[startup] plan limits validated");
  } catch (err) {
    logger.error("[startup] failed to validate plan limits", { err: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Explicit startup recovery hook.
 *
 * Re-enqueues any jobs left unfinished from a previous server lifetime:
 *   - status="pending" (never started — e.g. crash between INSERT and pickup)
 *   - status="running" with lockedAt older than 5 min (worker died mid-run)
 *
 * This can be triggered manually from the startup-check API route,
 * or automatically by bootstrapRuntime() on server boot.
 */
export async function runStartupRecovery(): Promise<{ recovered: number; errors: string[] }> {
  const { recoverPendingJobs } = await import("./queues");
  return recoverPendingJobs();
}
