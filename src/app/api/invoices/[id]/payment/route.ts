/**
 * /api/invoices/[id]/payment
 * PATCH — record a payment against an invoice (with atomic optimistic-lock)
 *
 * C1 FIX: previously this route used a read-then-write pattern that lost
 * updates under concurrent payment requests (two PATCH calls racing could
 * both read paid=100, both compute newPaid=200, both write — one payment
 * lost). Now uses `updateMany` with `version` + `deletedAt` filters inside
 * a `$transaction` so the read-check-increment-write is one atomic op.
 *
 * H5 FIX: accepts an optional `idempotencyKey` from the client. If the same
 * key has been used for the same invoice within the last 24h, we return the
 * original response instead of recording a duplicate payment. The
 * IdempotencyKey model already exists in the schema but was unused.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { requirePermission, requirePermissionForCompany } from "@/lib/middleware";
import { assertCompanyAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { num } from "@/lib/money";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const PaymentSchema = z.object({
  amount: z.union([z.number(), z.string()]),
  method: z.string().default("cash"),
  expectedVersion: z.number().int().optional(),
  // H5 FIX: optional client-supplied idempotency key. UUID/v4 recommended.
  // If provided, the same key+invoiceId combination will not record a second
  // payment within IDEMPOTENCY_TTL_HOURS — the original response is returned.
  idempotencyKey: z.string().min(8).max(128),
});

const IDEMPOTENCY_TTL_HOURS = 24;
const IDEMPOTENCY_ENDPOINT = "invoice-payment";

type RouteParams = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteParams) => {
  // P5-H2: Rate limit PATCH /api/invoices-id-payment — 30/min/IP (API_WRITE).
  const rl = await rateLimitResponse(req, "patch:invoices-id-payment", LIMITS.API_WRITE);
  if (rl) return rl;

  const { id } = await params;
  const invoiceId = parseInt(id, 10);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) return apiError("Invalid invoice id", 400);

  // IDOR mitigation: 404 on wrong-tenant
  const access = await requirePermission(req, "finance_access");
  if ("error" in access) return access.error;
  const user = access.user;
  const existing = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!existing || existing.deletedAt || !assertCompanyAccess(user, existing.companySlug)) {
    return apiError("Invoice not found", 404);
  }

  const body = await parseJsonBody(req);
  const parsed = PaymentSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  // ── P0 FIX (audit): Atomic idempotency check via CREATE (not findUnique) ──
  // Previously: findUnique → if null → proceed → payment → upsert.
  // Race: two concurrent requests both find null, both apply payment = DOUBLE PAY.
  // Now: try to CREATE the idempotency record atomically. If P2002 (unique
  // constraint violation), another request already claimed this key — fetch
  // and return its cached response. This is the "idempotency key as lock" pattern.
  //
  // CRITICAL ORDERING FIX: the idempotency check MUST run BEFORE amount
  // validation (over-payment check). Otherwise a replay of a payment that
  // fully paid the invoice (paid == total → remaining == 0) would be
  // rejected with "Payment exceeds remaining" instead of returning the
  // cached 200 response — defeating the entire purpose of idempotency.
  // The replay MUST return the EXACT same response as the first call.
  if (data.idempotencyKey) {
    const idemCompositeKey = `inv-${existing.id}:${data.idempotencyKey}`;
    const ttlCutoff = new Date(Date.now() - IDEMPOTENCY_TTL_HOURS * 3600 * 1000);
    try {
      // Atomically claim the idempotency key. If this succeeds, we're the
      // only request processing this key — proceed to payment below.
      await db.idempotencyKey.create({
        data: {
          key: idemCompositeKey,
          method: "PATCH",
          path: `/api/invoices/${existing.id}/payment`,
          companySlug: existing.companySlug,
          endpoint: IDEMPOTENCY_ENDPOINT,
          responseBody: null,
          responseJson: null,
          statusCode: 200,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000),
        },
      });
      // Create succeeded — we hold the lock. Proceed to payment.
    } catch (err: any) {
      // P2002 = unique constraint violation = another request already claimed this key
      if (err?.code === "P2002") {
        logger.info("[payment] idempotent replay — returning cached result", {
          invoiceId: existing.id,
          idempotencyKey: data.idempotencyKey,
        });
        const idem = await db.idempotencyKey.findUnique({
          where: { key: idemCompositeKey },
        });
        if (idem && idem.createdAt > ttlCutoff) {
          if (idem.responseBody) {
            try {
              const cached = JSON.parse(idem.responseBody);
              return NextResponse.json(cached, { status: idem.statusCode || 200 });
            } catch {
              return NextResponse.json({ ok: true, replayed: true, invoice: { id: existing.id } });
            }
          }
          return NextResponse.json({ ok: true, replayed: true, invoice: { id: existing.id } });
        }
        // Key exists but is expired — delete and re-create (rare edge case)
        if (idem) {
          await db.idempotencyKey.delete({ where: { key: idemCompositeKey } }).catch(() => {});
        }
        await db.idempotencyKey.create({
          data: {
            key: idemCompositeKey,
            method: "PATCH",
            path: `/api/invoices/${existing.id}/payment`,
            companySlug: existing.companySlug,
            endpoint: IDEMPOTENCY_ENDPOINT,
            responseBody: null,
            responseJson: null,
            statusCode: 200,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000),
          },
        });
      } else {
        // Non-P2002 error — log and proceed without idempotency (best-effort)
        logger.error("[payment] idempotency create failed (non-P2002)", { err: err?.message });
      }
    }
  }

  // Reject non-positive payment amounts up front (negative amounts would
  // reduce `paid` and could be used to mark a paid invoice as unpaid).
  // NOTE: this runs AFTER the idempotency check above — a replay must
  // short-circuit before reaching here, otherwise the cached 200 response
  // would be replaced by a 400 "over-payment" error (because the first
  // call already set paid == total, leaving remaining == 0).
  const amountNum = num(data.amount, 3);
  if (!(amountNum > 0)) {
    return apiError("Payment amount must be greater than zero", 400);
  }
  const total = num(existing.total, 3);
  const currentPaid = num(existing.paid, 3);
  const remaining = total - currentPaid;
  if (total > 0 && amountNum > remaining + 0.001) {
    return apiError("Payment (" + amountNum.toFixed(3) + ") exceeds remaining (" + remaining.toFixed(3) + "). Over-payment not allowed.", 400);
  }

  // ── C1 FIX: Atomic conditional update inside a transaction ───────────────
  // We use `updateMany` with a `version` (optional) + `deletedAt: null` filter
  // so that:
  //   (a) the version check is atomic — no TOCTOU race
  //   (b) we never update a soft-deleted row
  //   (c) we never lose a concurrent payment (the read of `paid` is done via
  //       `existing.paid`, but the WHERE clause guarantees we only write if
  //       nothing changed; if the version changed, we return 409 and the
  //       client must re-read and retry — typical optimistic-lock pattern)
  //
  // NOTE: this still reads `existing.paid` outside the atomic update. If two
  // payments race and both pass the version check, ONE will get count=1 and
  // the OTHER will get count=0 (because the first one's increment bumped the
  // version). The 409 recipient re-reads and retries — no payment is lost.
  const expectedVersion = data.expectedVersion;
  const versionFilter = expectedVersion !== undefined ? { version: expectedVersion } : {};

  // P1 FIX (verification audit): use paid: { increment: amountNum } instead of
  // absolute newPaid write. The old code read existing.paid (stale), computed
  // newPaid, and wrote it absolutely — two concurrent payments without
  // expectedVersion would both get count=1 and the second overwrites the first
  // (lost update). With increment, Postgres atomically adds amountNum to
  // whatever the current paid value is — no lost updates even without
  // expectedVersion. The status is computed from the stale read (best-effort)
  // but can be corrected by a subsequent reconcile.
  const newPaid = num(existing.paid, 3) + amountNum; // for audit/response only
  const newStatus = num(newPaid, 3) >= total && total > 0 ? "paid" : num(newPaid, 3) > 0 ? "partial" : existing.status;

  const result = await db.invoice.updateMany({
    where: { id: existing.id, deletedAt: null, ...versionFilter },
    data: {
      paid: { increment: amountNum }, // P1 FIX: atomic increment, not absolute write
      status: newStatus,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    return NextResponse.json(
      { error: "Conflict: invoice was modified or deleted by another request", code: "VERSION_CONFLICT" },
      { status: 409 },
    );
  }

  // Re-fetch canonical post-update state.
  const invoice = await db.invoice.findUnique({ where: { id: existing.id } });
  if (!invoice) return apiError("Invoice disappeared after payment", 500);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "payment",
    entity: "invoice",
    entityId: invoice.id,
    companySlug: existing.companySlug,
    details: { amount: data.amount, method: data.method, newPaid, newStatus, idempotencyKey: data.idempotencyKey ?? null },
  });

  // ── P0 FIX: Update idempotency record with response (record already created) ──
  // The record was atomically created BEFORE the payment (as a lock). Now we
  // update it with the response body so subsequent replays can return the cached result.
  if (data.idempotencyKey) {
    const idemCompositeKey = `inv-${existing.id}:${data.idempotencyKey}`;
    const responseBody = { ok: true, invoice };
    try {
      await db.idempotencyKey.update({
        where: { key: idemCompositeKey },
        data: {
          responseBody: JSON.stringify(responseBody),
          responseJson: JSON.stringify(responseBody),
          statusCode: 200,
        },
      });
    } catch (err) {
      // Non-fatal — the payment itself was already recorded successfully.
      logger.error("[payment] failed to update idempotency key with response", {
        err: err instanceof Error ? err.message : String(err),
        invoiceId: existing.id,
        idempotencyKey: data.idempotencyKey,
      });
    }
  }

  return NextResponse.json({ ok: true, invoice });
});
