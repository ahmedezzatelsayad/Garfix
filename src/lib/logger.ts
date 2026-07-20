/**
 * logger.ts — Structured logger (replaces console.log across the codebase).
 *
 * Levels: debug, info, warn, error, fatal.
 * Output: JSON to stdout for production, pretty-printed in dev.
 *
 * Uses console.* methods (which Next.js routes work with across Node + Edge
 * runtimes) instead of process.stdout.write — same performance, better
 * runtime compatibility.
 *
 * Signature: `(message: string, meta?: LogMeta)` — message first, meta second.
 * This was previously documented backwards in this same file, which caused
 * the 92 caller files to copy the wrong order. The order is now correct here
 * and the callers are being fixed in a separate mechanical pass.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("user logged in", { userId, action });
 *   logger.error("request failed", { err, route });
 */

type Level = "debug" | "info" | "warn" | "error" | "fatal";

interface LogMeta {
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === "production" ? "info" : "debug");

const REDACT_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "authorization",
  "cookie",
  "set-cookie",
  "apiKey",
  "openrouterApiKey",
]);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

function redactMeta(meta: LogMeta): LogMeta {
  const result: LogMeta = {};
  for (const key of Object.keys(meta)) {
    if (REDACT_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
      continue;
    }
    const value = meta[key];
    if (typeof value === "string") {
      result[key] = value.replace(EMAIL_RE, (match, domain) => {
        const local = match.substring(0, match.indexOf("@"));
        return local[0] + "***@" + domain;
      });
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactMeta(value as LogMeta);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object" ? redactMeta(item as LogMeta) : item,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function shouldLog(level: Level): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function format(level: Level, msg: string, meta?: LogMeta): string {
  const ts = new Date().toISOString();
  const base = { ts, level, msg };
  const redactedMeta = meta ? redactMeta(meta) : undefined;
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify(redactedMeta ? { ...base, data: redactedMeta } : base);
  }
  const metaStr = redactedMeta && Object.keys(redactedMeta).length > 0
    ? " " + JSON.stringify(redactedMeta)
    : "";
  return `[${ts}] ${level.toUpperCase().padEnd(5)} ${msg}${metaStr}`;
}

export const logger = {
  debug(msg: string, meta?: LogMeta) {
    if (shouldLog("debug")) console.log(format("debug", msg, meta));
  },
  info(msg: string, meta?: LogMeta) {
    if (shouldLog("info")) console.log(format("info", msg, meta));
  },
  warn(msg: string, meta?: LogMeta) {
    if (shouldLog("warn")) console.warn(format("warn", msg, meta));
  },
  error(msg: string, meta?: LogMeta) {
    if (shouldLog("error")) console.error(format("error", msg, meta));
  },
  fatal(msg: string, meta?: LogMeta) {
    if (shouldLog("fatal")) {
      console.error(format("fatal", msg, meta));
      // Don't call process.exit here — let the caller decide
    }
  },
  /** Wrap an async fn — auto-catch and log errors. */
  async wrap<T>(label: string, fn: () => Promise<T>, meta?: LogMeta): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err) {
      this.error(label, { err: err instanceof Error ? err.message : String(err), ...meta });
      return undefined;
    }
  },
};

export type { Level, LogMeta };
