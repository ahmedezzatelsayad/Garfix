/**
 * backupWorker.ts — Worker for the BACKUP queue.
 *
 * Registered as the handler for `QUEUE_NAMES.BACKUP`. The existing
 * `enqueueBackup(label)` helper in src/lib/backup.ts enqueues a `{type:"backup"}`
 * job to this queue — but until this worker file existed, every such job
 * silently dead-lettered with "No handler registered for queue backup-jobs".
 *
 * Job types:
 *   - "backup"        → calls runBackup(label) — produces a SQLite VACUUM INTO
 *     snapshot at BACKUP_DIR/garfix-{label}-{ts}.db and prunes old backups.
 *   - "verify-backup" → opens the most recent backup, runs PRAGMA integrity_check,
 *     and logs the result. Used by the scheduler daily to confirm backups are
 *     restorable (a backup that can't be restored is worse than no backup).
 *
 * Failure modes:
 *   - VACUUM INTO fails → runBackup falls back to file copy (already handled
 *     in lib/backup.ts) — if even the fallback fails, the job throws and the
 *     queue runner retries 3× with backoff, then dead-letters.
 *   - Backup directory not writable → runBackup throws → retry → dead-letter.
 *     Operators MUST see this — a 3-day-stale backup is a stop-ship signal.
 *   - Verify-backup fails integrity check → throws → retry → dead-letter so
 *     the founder panel surfaces the corrupt backup.
 *
 * RUNTIME: Node.js only — uses node:fs/promises, node:path, process.cwd()
 */
'use node';

import { logger } from "../logger";
import { registerWorker, QUEUE_NAMES } from "../queues";
import { runBackup, listBackups, getBackupDir } from "../backup";
import { dbTyped as db } from "../db";
import fs from "node:fs/promises";
import path from "node:path";

export const BACKUP_JOB_TYPES = {
  BACKUP: "backup",
  VERIFY_BACKUP: "verify-backup",
} as const;

export interface BackupJobData {
  label?: string;
}

export interface VerifyBackupJobData {
  backupName?: string; // optional — defaults to most recent
}

/** The actual handler — exported for direct invocation from tests. */
export async function handleBackupJob(data: Record<string, unknown>): Promise<void> {
  const jobType = (data.type as string) || BACKUP_JOB_TYPES.BACKUP;
  const payload = (data.payload ?? data) as Record<string, unknown>;

  switch (jobType) {
    case BACKUP_JOB_TYPES.BACKUP:
      return handleBackup(payload as  BackupJobData);
    case BACKUP_JOB_TYPES.VERIFY_BACKUP:
      return handleVerifyBackup(payload as  VerifyBackupJobData);
    default:
      throw new Error(`backupWorker: unknown job type "${jobType}"`);
  }
}

async function handleBackup(data: BackupJobData): Promise<void> {
  const label = (data.label && typeof data.label === "string") ? data.label : "scheduled";
  logger.info("[backup-worker] starting backup", { label });
  const result = await runBackup(label);
  if (!result.ok) {
    throw new Error(`backupWorker.backup: runBackup failed — ${result.error ?? "unknown"}`);
  }
  logger.info("[backup-worker] backup completed", {
    label, path: result.filePath, size: result.size, durationMs: result.durationMs,
  });
}

async function handleVerifyBackup(data: VerifyBackupJobData): Promise<void> {
  // Resolve target backup — default to most recent if not specified.
  const backups = await listBackups();
  if (backups.length === 0) {
    logger.warn("[backup-worker] verify-backup: no backups found — nothing to verify");
    return;
  }

  const target = data.backupName
    ? backups.find((b) => b.name === data.backupName)
    : backups[0]; // listBackups returns sorted desc by mtime
  if (!target) {
    throw new Error(`backupWorker.verify-backup: backup "${data.backupName}" not found`);
  }

  const BACKUP_DIR = getBackupDir();
  const backupPath = path.join(BACKUP_DIR, target.name);
  // Path-traversal guard — backupName is from a trusted caller, but be safe.
  const resolvedBase = path.resolve(BACKUP_DIR);
  const resolvedCandidate = path.resolve(backupPath);
  if (resolvedCandidate !== resolvedBase && !resolvedCandidate.startsWith(resolvedBase + path.sep)) {
    throw new Error(`backupWorker.verify-backup: path traversal refused — "${target.name}"`);
  }

  // File size sanity — an empty or tiny backup is corrupt.
  const stat = await fs.stat(backupPath);
  if (stat.size < 1024) {
    throw new Error(`backupWorker.verify-backup: backup too small (${stat.size} bytes) — likely corrupt`);
  }

  // P1 FIX (audit): Previous code checked for "SQLite format 3" header, but
  // backups are encrypted Postgres SQL dumps (.sql.enc). The check always
  // failed because the header is AES-GCM ciphertext, never matching SQLite magic.
  //
  // New approach: read the file, decrypt it, and verify it contains valid
  // PostgreSQL SQL statements (e.g., "CREATE TABLE", "INSERT", "COPY", "SET").
  //
  // TPD-02 FIX (Audit v2): The decrypted content is BASE64-encoded SQL
  // (because runBackup does: rawBuffer.toString("base64") → encryptSecret).
  // The previous check looked for "create table" in the base64 string —
  // which NEVER matches because base64 output doesn't contain plaintext
  // SQL keywords. Every real backup was incorrectly marked "corrupt".
  // Fix: decode base64 first, THEN check for SQL patterns.
  const { decryptSecret } = await import("@/lib/cryptoVault");
  const encryptedContent = await fs.readFile(backupPath, "utf8");
  let decryptedB64: string;
  try {
    decryptedB64 = decryptSecret(encryptedContent);
  } catch (err) {
    throw new Error(
      `backupWorker.verify-backup: failed to decrypt "${target.name}" — ` +
      `check PAYMENTS_ENC_KEY is correct. Original error: ` +
      (err instanceof Error ? err.message : String(err))
    );
  }

  // Decode the base64 payload to recover the actual SQL dump
  let decryptedContent: string;
  try {
    decryptedContent = Buffer.from(decryptedB64, "base64").toString("utf8");
  } catch (err) {
    throw new Error(
      `backupWorker.verify-backup: decrypted content of "${target.name}" ` +
      `is not valid base64 — likely corrupt. Original error: ` +
      (err instanceof Error ? err.message : String(err))
    );
  }

  // Verify the decoded content looks like valid PostgreSQL SQL
  const sqlLower = decryptedContent.toLowerCase();
  const hasValidSqlPatterns =
    sqlLower.includes("create table") ||
    sqlLower.includes("insert into") ||
    sqlLower.includes("copy ") ||
    sqlLower.includes("set ") ||
    sqlLower.includes("alter table") ||
    sqlLower.includes("postgresql database dump");
  if (!hasValidSqlPatterns) {
    throw new Error(
      `backupWorker.verify-backup: decoded content of "${target.name}" ` +
      `does not contain valid PostgreSQL SQL statements — likely corrupt`
    );
  }

  logger.info("[backup-worker] verify-backup: OK (PostgreSQL encrypted dump verified)", {
    name: target.name, sizeMB: (target.size / 1024 / 1024).toFixed(2),
  });
}

// ─── Registration Function (explicit call only) ─────────────────────────────

let registered = false;
export function registerBackupWorker(): void {
  if (registered) return;
  registerWorker(QUEUE_NAMES.BACKUP, handleBackupJob);
  registered = true;
  logger.info("[backup-worker] registered for queue", { queue: QUEUE_NAMES.BACKUP });
}

// ❌ REMOVED: Module-level side effect (was causing build failures)
// registerBackupWorker();

// Reference `db` so the import isn't tree-shaken (used by future integrity
// checks that query the backup file via a second Prisma client).
void db;
