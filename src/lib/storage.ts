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

/**
 * SEC-M5C4 (Cycle 4): hard cap on saved file size. Previously saveBase64 had
 * no size limit — a 1 GB base64 string would decode to 750 MB on disk. The
 * global parseJsonBody cap (1 MiB) mitigates this for routes that go through
 * parseJsonBody, but saveBase64 is also called from migrateFromBase64 which
 * may bypass it.
 */
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB

/**
 * SEC-M5C4 (Cycle 4): magic-byte (file signature) verification. The MIME
 * allowlist above already constrains the declared type, but a malicious client
 * could send a polyglot or non-image payload labelled `image/png`. This map
 * defines the expected first bytes for each allowed MIME type.
 */
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }> = {
  "image/png": { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  "image/jpeg": { offset: 0, bytes: [0xff, 0xd8, 0xff] },
  "image/gif": { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF87a / GIF89a
  "image/webp": { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
  "application/pdf": { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
};

function verifyMagicBytes(buf: Buffer, mimeType: string): boolean {
  const sig = MAGIC_BYTES[mimeType];
  if (!sig) return false;
  if (buf.length < sig.offset + sig.bytes.length) return false;
  return sig.bytes.every((b, i) => buf[sig.offset + i] === b);
}

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

  // SEC-M5C4 (Cycle 4): enforce size cap BEFORE writing to disk
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${buffer.length} bytes (max ${MAX_FILE_BYTES} bytes)`);
  }

  // SEC-M5C4 (Cycle 4): verify magic bytes match the declared MIME type
  if (!verifyMagicBytes(buffer, mimeType)) {
    throw new Error(`Magic bytes do not match declared MIME type "${mimeType}" — possible polyglot / mislabeled payload`);
  }

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
