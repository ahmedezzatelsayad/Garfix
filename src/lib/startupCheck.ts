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
    if (process.env.JWT_SECRET === "garfix-dev-secret-change-me") {
      fatal.push("JWT_SECRET must be changed from the dev default in production");
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
