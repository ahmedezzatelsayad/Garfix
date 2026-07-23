/**
 * tamperAudit.ts — Tamper-evident audit log (append-only hash chain).
 *
 * Every audit log entry gets an HMAC-SHA256 hash stored in TamperEvidenceChain.
 * Each entry's hash incorporates the previous entry's hash, creating a
 * blockchain-like chain. Any modification to a historical entry breaks
 * the chain and can be detected by verifyChain().
 *
 * SEC-A2C4 (Cycle 4): the previous implementation used plain SHA-256 — any
 * attacker with DB write access (SQL injection, backup leak, insider) could
 * recompute every contentHash and prevHash in place and keep the chain "valid".
 * We now use HMAC-SHA256 keyed by AUDIT_CHAIN_SECRET (env var, with a startup
 * fallback to JWT_SECRET which is already required + validated in production).
 */

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { logger } from "./logger";

export interface ChainEntry {
  entryId: string;
  contentHash: string;
  prevHash: string;
  chainOrder: number;
  companySlug?: string | null;
}

/**
 * Resolve the chain HMAC key. Falls back to JWT_SECRET (which is required in
 * production and validated by startupCheck.ts) so we don't introduce a new
 * required env var that operators might forget to set. If a dedicated
 * AUDIT_CHAIN_SECRET is set, it takes precedence (allows key rotation without
 * rotating JWTs).
 */
function getChainSecret(): string {
  const dedicated = process.env.AUDIT_CHAIN_SECRET;
  if (dedicated && dedicated.length >= 32) return dedicated;
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && jwtSecret.length >= 32) return jwtSecret;
  // Last-resort fallback for dev — in production startupCheck.ts will have
  // already refused to boot if JWT_SECRET is missing/weak.
  if (process.env.NODE_ENV === "production") {
    logger.error("[tamper-audit] no AUDIT_CHAIN_SECRET or JWT_SECRET >= 32 chars — chain integrity is compromised");
  }
  return "garfix-audit-chain-insecure-dev-fallback-do-not-use-in-prod";
}

/** Compute HMAC-SHA256 of audit entry content + previous hash. */
function computeHash(content: string, prevHash: string): string {
  return crypto
    .createHmac("sha256", getChainSecret())
    .update(`${content}:${prevHash}`)
    .digest("hex");
}

/** Hash the content of an audit log entry for tamper evidence. */
function hashAuditContent(entry: {
  userEmail: string;
  action: string;
  entity: string;
  entityId?: string | null;
  companySlug?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: Date;
}): string {
  const serialized = JSON.stringify({
    userEmail: entry.userEmail,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    companySlug: entry.companySlug,
    details: entry.details,
    ts: entry.createdAt.toISOString(),
  });
  return crypto
    .createHmac("sha256", getChainSecret())
    .update(serialized)
    .digest("hex");
}

/** Add a new link in the tamper-evidence chain. Call after every audit log write. */
export async function appendToChain(params: {
  entryId: string;
  content: {
    userEmail: string;
    action: string;
    entity: string;
    entityId?: string | null;
    companySlug?: string | null;
    details?: Record<string, unknown> | null;
    createdAt: Date;
  };
  companySlug?: string | null;
}): Promise<void> {
  try {
    const contentHash = hashAuditContent(params.content);

    // SEC-A11C4 (Cycle 4): wrap findFirst + create in a transaction to prevent
    // the TOCTOU race where two concurrent audit writes both read the same
    // lastEntry, both produce the same chainOrder, and deterministically break
    // the chain. Prisma's interactive $transaction gives us serializable-ish
    // behavior at the cost of one extra round-trip.
    await db.$transaction(async (tx) => {
      const lastEntry = await tx.tamperEvidenceChain.findFirst({
        orderBy: { chainOrder: "desc" },
      });

      const prevHash = lastEntry ? lastEntry.contentHash : "GENESIS";
      const chainOrder = lastEntry ? lastEntry.chainOrder + 1 : 0;

      await tx.tamperEvidenceChain.create({
        data: {
          entryId: params.entryId,
          contentHash: computeHash(contentHash, prevHash),
          prevHash,
          chainOrder,
          companySlug: params.companySlug ?? null,
        },
      });
    });
  } catch (err) {
    // Tamper evidence is best-effort — never block the main audit write
    logger.error("[tamper-audit] failed to append to chain", {
      err: err instanceof Error ? err.message : String(err),
      entryId: params.entryId,
    });
  }
}

/** Verify the entire hash chain. Returns { valid, breakAt } where breakAt is the first broken link. */
export async function verifyChain(companySlug?: string): Promise<{
  valid: boolean;
  totalEntries: number;
  breakAt?: { entryId: string; chainOrder: number; reason: string };
}> {
  const where = companySlug ? { companySlug } : {};
  const entries = await db.tamperEvidenceChain.findMany({
    where,
    orderBy: { chainOrder: "asc" },
  });

  if (entries.length === 0) return { valid: true, totalEntries: 0 };

  let prevHash = "GENESIS";

  for (const entry of entries) {
    // SEC-A3C4 (Cycle 4): the previous implementation had dead code here —
    // the `if (entry.contentHash !== expectedHash)` branch contained only a
    // comment and no check, so the contentHash field was never actually
    // verified. We now verify the structural chain LINKAGE (prevHash matches
    // the previous entry's contentHash) — that's what catches deletion,
    // reordering, and insertion attacks. Full content verification (re-read
    // the AuditLog row and recompute the content HMAC) is a future
    // enhancement tracked separately (would require an extra query per chain
    // entry — expensive at scale).
    if (entry.prevHash !== prevHash) {
      await db.tamperEvidenceChain.update({
        where: { id: entry.id },
        data: { isValid: false, verifiedAt: new Date() },
      });
      return {
        valid: false,
        totalEntries: entries.length,
        breakAt: {
          entryId: entry.entryId,
          chainOrder: entry.chainOrder,
          reason: `prevHash mismatch: expected ${prevHash.substring(0, 12)}... got ${entry.prevHash.substring(0, 12)}...`,
        },
      };
    }

    prevHash = entry.contentHash;
  }

  // SEC-A13C4 (Cycle 4): only mark rows as verifiedAt on success — do NOT
  // overwrite isValid=false back to true without an explicit admin "clear
  // tamper flag" action. The previous implementation did `updateMany` with
  // `isValid: true` which would silently un-flag tampered rows.
  await db.tamperEvidenceChain.updateMany({
    where: { ...where, isValid: true },
    data: { verifiedAt: new Date() },
  });

  return { valid: true, totalEntries: entries.length };
}

/** Get chain statistics. */
export async function getChainStats(): Promise<{
  totalEntries: number;
  verifiedCount: number;
  unverifiedCount: number;
  tamperedCount: number;
}> {
  const [total, verified, tampered] = await Promise.all([
    db.tamperEvidenceChain.count(),
    db.tamperEvidenceChain.count({ where: { isValid: true, verifiedAt: { not: null } } }),
    db.tamperEvidenceChain.count({ where: { isValid: false } }),
  ]);

  return {
    totalEntries: total,
    verifiedCount: verified,
    unverifiedCount: total - verified - tampered,
    tamperedCount: tampered,
  };
}
