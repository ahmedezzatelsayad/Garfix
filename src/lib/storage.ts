/**
 * storage.ts — External file storage for logos and other binary assets.
 *
 * Replaces the previous pattern of storing logoBase64 directly in the
 * companies table (E-17). Logos are now saved to /home/z/my-project/storage/
 * and served via /api/storage/[id]. The DB stores only the file path.
 *
 * In production: swap the fs operations with S3/GCS upload + signed URL.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";

// EA-004 FIX: Use relative path based on cwd() instead of hardcoded /home/z/ path
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");

/** MIME type allowlist — only these types may be saved to storage. */
const ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
]);

async function ensureStorageDir(): Promise<void> {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (err) {
    logger.error("[storage] failed to create storage dir", { err: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/**
 * Save a base64-encoded file to disk. Returns the storage key (filename).
 * The key can later be passed to getPublicUrl() to construct a fetchable URL.
 */
export async function saveBase64(
  base64Data: string,
  mimeType: string = "image/png",
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`MIME type "${mimeType}" is not allowed. Allowed types: ${[...ALLOWED_MIME_TYPES].join(", ")}`);
  }
  await ensureStorageDir();
  // Strip data URL prefix if present
  const cleaned = base64Data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleaned, "base64");
  const ext = mimeType.split("/")[1] || "bin";
  const key = `${randomUUID()}.${ext}`;
  const fullPath = path.join(STORAGE_DIR, key);
  await fs.writeFile(fullPath, buffer);
  logger.debug("[storage] file saved", { key, size: buffer.length });
  return key;
}

/** Read a file from storage as a Buffer. */
export async function readAsBuffer(key: string): Promise<Buffer | null> {
  try {
    const fullPath = path.join(STORAGE_DIR, key);
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

/** Delete a file from storage. */
export async function remove(key: string): Promise<void> {
  try {
    const fullPath = path.join(STORAGE_DIR, key);
    await fs.unlink(fullPath);
  } catch (err) {
    logger.warn("[storage] failed to delete file", { err: err instanceof Error ? err.message : String(err), key });
  }
}

/** Construct the public URL for a stored file. */
export function getPublicUrl(key: string): string {
  return `/api/storage/${key}`;
}

/** Migrate a base64 string from DB → file system. Returns the storage key. */
export async function migrateFromBase64(base64: string, mimeType?: string): Promise<string> {
  return saveBase64(base64, mimeType);
}
