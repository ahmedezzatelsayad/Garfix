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

function shouldLog(level: Level): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function format(level: Level, msg: string, meta?: LogMeta): string {
  const ts = new Date().toISOString();
  const base = { ts, level, msg };
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify(meta ? { ...base, ...meta } : base);
  }
  const metaStr = meta && Object.keys(meta).length > 0
    ? " " + JSON.stringify(meta)
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
