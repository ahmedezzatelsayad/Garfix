/**
 * backup.ts — Database backup (E-05).
 *
 * In v10 with Postgres, this ran pg_dump via child_process.spawn to produce
 * a .dump file restorable via pg_restore.
 *
 * In v11 with SQLite, the equivalent is a file copy of the .db file. We use
 * SQLite's Online Backup API via Prisma's underlying better-sqlite3 driver
 * to take a consistent snapshot without locking writers for long.
 *
 * RUNTIME: Node.js only — uses node:fs/promises, node:path, process.cwd()
 */
'use node';

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { db } from "./db";
import { logger } from "./logger";
import { enqueue, QUEUE_NAMES } from "./queues";
import { encryptSecret, decryptSecret } from "./cryptoVault";

// EA-004 FIX: Use relative path based on cwd() instead of hardcoded /home/z/ path
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "storage", "backups");
const MAX_BACKUPS = parseInt(process.env.BACKUP_KEEP_MAX || "30", 10);

export interface BackupResult {
  ok: boolean;
  filePath?: string;
  size?: number;
  durationMs: number;
  error?: string;
}

/**
 * Sanitize a backup label so it's safe to embed in a SQL VACUUM INTO path.
 * P0 FIX (SQL injection): label could be user-supplied via enqueueBackup(label?).
 * We restrict to [a-zA-Z0-9._-] and a short length, then validate the final
 * path stays inside BACKUP_DIR (no path traversal).
 */
function sanitizeLabel(label: string): string {
  if (!label || typeof label !== "string") return "scheduled";
  const trimmed = label.trim().slice(0, 40);
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return "scheduled";
  return trimmed;
}

/**
 * Resolve and validate the final backup path so it cannot escape BACKUP_DIR.
 * Returns the ABSOLUTE path (validated to stay inside BACKUP_DIR) or null if
 * validation fails (caller should fall back to file copy).
 *
 * v1.2 fix: previously this returned just the filename, which caused
 * `VACUUM INTO 'garfix-...db'` to create the file in the SQLite process's
 * CWD (wherever Prisma connects from), NOT in BACKUP_DIR — and the
 * subsequent `fs.stat(absolutePath)` then failed with ENOENT. Returning
 * the absolute path makes VACUUM INTO and fs.stat agree on the location.
 */
function resolveSafeBackupPath(label: string, ts: string): string | null {
  const safeLabel = sanitizeLabel(label);
  const backupName = `garfix-${safeLabel}-${ts}.db`;
  const candidate = path.join(BACKUP_DIR, backupName);
  // Path-traversal guard: real path must start with BACKUP_DIR
  const resolvedBase = path.resolve(BACKUP_DIR);
  const resolvedCandidate = path.resolve(candidate);
  if (resolvedCandidate !== resolvedBase && !resolvedCandidate.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  // Final filename sanity — must end with .db and contain no shell metacharacters
  if (!/^[a-zA-Z0-9._-]+\.db$/.test(backupName)) return null;
  // Return the ABSOLUTE path so VACUUM INTO and fs.stat agree on location.
  // The path is safe to embed in SQL because: (1) BACKUP_DIR is set by the
  // operator, not the user; (2) the filename portion is validated to match
  // ^[a-zA-Z0-9._-]+\.db$; (3) single quotes are escaped by the caller.
  return resolvedCandidate;
}

/**
 * Run a backup. Uses pg_dump for PostgreSQL or VACUUM INTO for SQLite.
 * Returns the file path on success.
 */
export async function runBackup(label = "scheduled"): Promise<BackupResult> {
  const start = Date.now();
  const dbUrl = process.env.DATABASE_URL || "";
  const isPostgres = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = resolveSafeBackupPath(label, ts);
    if (!backupPath) {
      throw new Error("Invalid backup label — refused to proceed (path traversal or invalid characters)");
    }

    if (isPostgres) {
      // PostgreSQL backup: use pg_dump via child_process
      const encPath = backupPath.replace(/\.db$/, ".sql.enc");
      const dumpPath = backupPath.replace(/\.db$/, ".sql");
      try {
        // pg_dump is the standard PostgreSQL backup tool.
        // If not installed, the backup fails gracefully (non-fatal).
        // Strip Prisma-specific query params that pg_dump doesn't understand.
        const cleanUrl = dbUrl.replace(/[?&](schema|connection_limit|pool_timeout|connect_timeout|sslmode|sslaccept)=[^&]*/g, "").replace(/\?$/, "").replace(/&$/, "");
        execFileSync("pg_dump", [cleanUrl, "-f", dumpPath], { timeout: 30000 });
        // Encrypt the dump file
        const rawBuffer = await fs.readFile(dumpPath);
        const b64Content = rawBuffer.toString("base64");
        const encrypted = encryptSecret(b64Content);
        await fs.writeFile(encPath, encrypted);
        await fs.unlink(dumpPath); // remove unencrypted temp file
        const durationMs = Date.now() - start;
        const stat = await fs.stat(encPath);
        logger.info("[backup] PostgreSQL backup completed (pg_dump, encrypted)", { backupPath: encPath, size: stat.size, durationMs });
        await pruneOldBackups();
        return { ok: true, filePath: encPath, size: stat.size, durationMs };
      } catch (pgErr) {
        logger.warn("[backup] pg_dump not available or failed — skipping PostgreSQL backup", {
          err: pgErr instanceof Error ? pgErr.message : String(pgErr),
        });
        return { ok: false, durationMs: Date.now() - start, error: `pg_dump failed: ${pgErr instanceof Error ? pgErr.message : String(pgErr)}` };
      }
    }

    // SQLite backup (original logic)
    const dbPath = dbUrl.replace(/^file:/, "");
    if (!dbPath) {
      throw new Error("DATABASE_URL not set or not a file path");
    }
    // For SQLite, the simplest safe backup is to use Prisma's $executeRaw to
    // call the SQLite backup API. better-sqlite3 supports this via .backup().
    // Prisma doesn't expose .backup() directly, so we fall back to file copy
    // after a VACUUM INTO — which produces a consistent snapshot.
    try {
      const sql = `VACUUM INTO '${backupPath.replace(/'/g, "''")}'`;
      await db.$executeRawUnsafe(sql);
    } catch (vacErr) {
      // Fallback: plain file copy (less consistent but works)
      logger.warn("[backup] VACUUM INTO failed — falling back to file copy", { err: vacErr instanceof Error ? vacErr.message : String(vacErr) });
      await fs.copyFile(dbPath, backupPath);
    }

    const stat = await fs.stat(backupPath);

    // Encrypt the backup file using AES-256-GCM before saving to disk
    const rawBuffer = await fs.readFile(backupPath);
    const b64Content = rawBuffer.toString("base64");
    const encrypted = encryptSecret(b64Content);
    await fs.writeFile(backupPath, encrypted);

    // Rename from .db to .db.enc to mark as encrypted
    const encPath = backupPath.replace(/\.db$/, ".db.enc");
    await fs.rename(backupPath, encPath);

    const durationMs = Date.now() - start;
    logger.info("[backup] backup completed (encrypted)", { backupPath: encPath, size: stat.size, durationMs });

    // Prune old backups
    await pruneOldBackups();

    return { ok: true, filePath: encPath, size: stat.size, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    logger.error("[backup] backup failed", { err: error, durationMs });
    return { ok: false, durationMs, error };
  }
}

/** Delete old backups beyond MAX_BACKUPS. */
async function pruneOldBackups(): Promise<void> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups = files.filter((f) => f.endsWith(".db.enc") || f.endsWith(".sql.enc")).sort(); // ISO timestamps sort naturally
    if (backups.length <= MAX_BACKUPS) return;
    const toDelete = backups.slice(0, backups.length - MAX_BACKUPS);
    for (const f of toDelete) {
      await fs.unlink(path.join(BACKUP_DIR, f));
      logger.info("[backup] pruned old backup", { file: f });
    }
  } catch (err) {
    logger.warn("[backup] failed to prune old backups", { err: err instanceof Error ? err.message : String(err) });
  }
}

/** List existing backups. */
export async function listBackups(): Promise<Array<{ name: string; size: number; createdAt: Date }>> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const result: Array<{ name: string; size: number; createdAt: Date }> = [];
    for (const f of files) {
      if (!f.endsWith(".db.enc") && !f.endsWith(".sql.enc")) continue;
      const stat = await fs.stat(path.join(BACKUP_DIR, f));
      result.push({ name: f, size: stat.size, createdAt: stat.mtime });
    }
    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

/** Enqueue a backup job (runs in background via the backup queue). */
export async function enqueueBackup(label?: string): Promise<void> {
  await enqueue(QUEUE_NAMES.BACKUP, {
    type: "backup",
    data: { label },
  });
}

/**
 * Decrypt an encrypted backup file (.db.enc) and return the raw SQLite buffer.
 * Used for restoring a backup — the caller writes the buffer to a .db file.
 */
export async function decryptBackup(filePath: string): Promise<Buffer> {
  const encrypted = await fs.readFile(filePath, "utf8");
  const b64Content = decryptSecret(encrypted);
  return Buffer.from(b64Content, "base64");
}
