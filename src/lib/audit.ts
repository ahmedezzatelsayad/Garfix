/**
 * audit.ts — Audit logging helper.
 */
import { db } from "@/lib/db";
import { logger } from "./logger";
import { appendToChain } from "./tamperAudit";

export interface AuditInput {
  userEmail: string;
  userUid: string;
  action: string;
  entity: string;
  entityId?: string | number | null;
  companySlug?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * SEC-M4C4 (Cycle 4): redact sensitive fields from audit log details before
 * JSON serialization. The previous implementation passed details raw — any
 * route that logged user-supplied details (e.g. login failures with the
 * attempted password, or webhook payloads containing API keys) would write
 * PII / secrets to the audit_logs table in plaintext.
 *
 * The redaction is recursive (handles nested objects + arrays) and matches
 * keys case-insensitively against a known-sensitive pattern.
 */
const SENSITIVE_KEY_RE = /(password|passwd|pwd|token|secret|apiKey|api_key|authorization|bearer|iban|cvv|cvc|ssn|nationalId|creditCard|cardNumber|refreshToken|accessToken|privateKey|signingKey)/i;

function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[max-depth-reached]"; // prevent cycles / runaway recursion
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, depth + 1));
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redactSensitive(obj[key], depth + 1);
    }
  }
  return out;
}

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    // SEC-M4C4 (Cycle 4): redact sensitive fields before persisting
    const redactedDetails = input.details
      ? (redactSensitive(input.details) as Record<string, unknown>)
      : null;
    const created = await db.auditLog.create({
      data: {
        userEmail: input.userEmail,
        userUid: input.userUid,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId !== null && input.entityId !== undefined ? String(input.entityId) : null,
        companySlug: input.companySlug ?? null,
        details: redactedDetails ? JSON.stringify(redactedDetails) : null,
      },
    });
    // SEC-A1C4 (Cycle 4): wire appendToChain into logAudit. Previously the
    // TamperEvidenceChain table was permanently empty in production — the
    // entire hash-chain machinery was dead code. Now every audit entry gets
    // a chain link appended (best-effort: failures don't block the audit write).
    // We pass the redacted details so the chain hash matches what's stored.
    void appendToChain({
      entryId: String(created.id),
      content: {
        userEmail: input.userEmail,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId !== null && input.entityId !== undefined ? String(input.entityId) : null,
        companySlug: input.companySlug ?? null,
        details: redactedDetails,
        createdAt: created.createdAt,
      },
      companySlug: input.companySlug ?? null,
    }).catch((err) => {
      // Best-effort — never block the main audit write
      logger.error("[audit] failed to append to tamper-evidence chain", {
        err: err instanceof Error ? err.message : String(err),
        auditId: created.id,
      });
    });
  } catch (err) {
    // Non-critical — log but never throw
    logger.error("[audit] failed to write audit log", { err: err instanceof Error ? err.message : String(err), action: input.action, entity: input.entity });
  }
}

export async function logAdminAction(input: {
  adminEmail: string;
  action: string;
  targetType?: string;
  targetId?: string;
  changes?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    // SEC-M4C4 (Cycle 4): redact sensitive fields in admin audit changes too
    const redactedChanges = input.changes
      ? (redactSensitive(input.changes) as Record<string, unknown>)
      : null;
    await db.adminAuditLog.create({
      data: {
        adminEmail: input.adminEmail,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        changes: redactedChanges ? JSON.stringify(redactedChanges) : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error("[admin-audit] failed to write admin audit log", { err: err instanceof Error ? err.message : String(err), action: input.action });
  }
}
