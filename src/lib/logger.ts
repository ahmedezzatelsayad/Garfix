/**
 * logger.ts — Structured logger (replaces console.log across the codebase).
 *
 * Levels: debug, info, warn, error, fatal.
 * Output: JSON to stdout for production, pretty-printed in dev.
 *
 * BROWSER COMPATIBILITY FIX:
 * Previously `debug()` and `info()` used `process.stdout.write()` which is
 * undefined in the browser. When the logger is imported by a client-side
 * module (e.g. AuthContext, Providers), calling `logger.info()` threw
 * `TypeError: Cannot read properties of undefined (reading 'write')`,
 * crashing React hydration and showing the ErrorBoundary ("تعذر تحميل التطبيق").
 *
 * The fix: detect the runtime and use `console.log()` / `console.info()` in
 * the browser, `process.stdout.write()` on the server. This preserves the
 * structured-JSON output on the server (for log aggregation) while keeping
 * the browser console readable.
 *
 * Signature: `(message: string, meta?: LogMeta)` — message first, meta second.
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

/**
 * Detect if we're running in a browser environment.
 * In the browser, `process.stdout` is undefined, so we must use `console.*`.
 * On the server (Node.js / Edge runtime), `process.stdout.write` is available
 * and preferred for structured log output.
 */
const IS_BROWSER = typeof window !== "undefined";

/**
 * Write a log line to the appropriate output:
 *   - Server: process.stdout.write (structured JSON, no console formatting)
 *   - Browser: console.log/info/warn/error (browser devtools formatting)
 */
function writeLog(level: Level, msg: string, meta?: LogMeta): void {
  const formatted = format(level, msg, meta);
  if (IS_BROWSER) {
    // Browser: use console methods (process.stdout is undefined here)
    switch (level) {
      case "debug":
        // eslint-disable-next-line no-console
        console.debug(formatted);
        break;
      case "info":
        // eslint-disable-next-line no-console
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
      case "fatal":
        console.error(formatted);
        break;
    }
  } else {
    // Server: use process.stdout for debug/info (avoids console formatting)
    // and console.warn/error for warnings/errors (matches existing behavior)
    switch (level) {
      case "debug":
      case "info":
        process.stdout.write(formatted + "\n");
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
      case "fatal":
        console.error(formatted);
        break;
    }
  }
}

export const logger = {
  debug(msg: string, meta?: LogMeta) {
    if (shouldLog("debug")) writeLog("debug", msg, meta);
  },
  info(msg: string, meta?: LogMeta) {
    if (shouldLog("info")) writeLog("info", msg, meta);
  },
  warn(msg: string, meta?: LogMeta) {
    if (shouldLog("warn")) writeLog("warn", msg, meta);
  },
  error(msg: string, meta?: LogMeta) {
    if (shouldLog("error")) writeLog("error", msg, meta);
  },
  fatal(msg: string, meta?: LogMeta) {
    if (shouldLog("fatal")) {
      writeLog("fatal", msg, meta);
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
