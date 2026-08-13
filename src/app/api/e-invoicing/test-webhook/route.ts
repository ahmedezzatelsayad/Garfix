/**
 * /api/e-invoicing/test-webhook
 * POST — Admin-only: send a signed test payload to one of our own webhook
 * receivers to verify the end-to-end pipeline works.
 *
 * This is useful when:
 *   - First configuring e-invoicing for a country (smoke-test the receiver)
 *   - Debugging a "no receipts showing in dashboard" issue
 *   - Verifying a new deployment has webhook routes reachable
 *
 * Body: { country: "SA" | "EG" | "AE" | "KW" | "BH" | "OM" | "QA" }
 *
 * The endpoint:
 *   1. Looks up the test secret from the integration config for the country
 *   2. Builds a realistic payload (per country)
 *   3. Signs it with HMAC-SHA256 using the same encoding the receiver expects
 *   4. Sends an HTTP POST to the local webhook receiver (http://localhost:${PORT}/api/e-invoicing/webhooks/{path})
 *   5. Returns the receiver's response + the receipt id (if recorded)
 *
 * Founder-only.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/middleware";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { dbTyped as db } from "@/lib/db";
import { createHmac } from "crypto";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

// ─── Country webhook config ────────────────────────────────────────────────

const WEBHOOK_CONFIG: Record<string, {
  path: string;
  header: string;
  encoding: "hex" | "base64";
  secretKey: string; // which field in the integration config holds the HMAC secret
  integrationType: string;
  authority: string;
}> = {
  SA: { path: "/api/e-invoicing/webhooks/zatca", header: "X-ZATCA-Signature", encoding: "base64", secretKey: "csid_secret",     integrationType: "einvoice_sa", authority: "zatca" },
  EG: { path: "/api/e-invoicing/webhooks/eta",   header: "X-Signature",        encoding: "hex",     secretKey: "api_token",        integrationType: "einvoice_eg", authority: "eta_egypt" },
  AE: { path: "/api/e-invoicing/webhooks/uae",   header: "X-AP-Signature",     encoding: "hex",     secretKey: "ap_client_secret", integrationType: "einvoice_ae", authority: "uae_fta" },
  KW: { path: "/api/e-invoicing/webhooks/kw",    header: "X-MoF-Signature",    encoding: "hex",     secretKey: "client_secret",    integrationType: "einvoice_kw", authority: "kuwait_decree_10_2026" },
  BH: { path: "/api/e-invoicing/webhooks/bh",    header: "X-NBR-Signature",    encoding: "hex",     secretKey: "api_key",          integrationType: "einvoice_bh", authority: "bahrain_nbr" },
  OM: { path: "/api/e-invoicing/webhooks/om",    header: "X-TA-Signature",     encoding: "hex",     secretKey: "client_secret",    integrationType: "einvoice_om", authority: "oman_tax" },
  QA: { path: "/api/e-invoicing/webhooks/qa",    header: "X-AP-Signature",     encoding: "hex",     secretKey: "ap_client_secret", integrationType: "einvoice_qa", authority: "qatar_gta" },
};

// ─── Per-country payload generator ─────────────────────────────────────────

function buildPayload(country: string, externalUuid: string, companySlug: string): Record<string, unknown> {
  const base = {
    companySlug,
    invoiceId: null,
    status: "CLEARED",
    rejectionReason: null,
    eventType: "cleared",
  };
  switch (country) {
    case "SA":
      return { ...base, invoiceUuid: externalUuid, status: "CLEARED", qrCode: "test-qr-code" };
    case "EG":
      return { ...base, documentUuid: externalUuid, submissionUuid: `${externalUuid}-sub`, status: "Valid" };
    case "AE":
    case "QA":
      return { ...base, peppolMessageId: externalUuid, documentUuid: externalUuid, status: "delivered", recipientId: "0195:300000000000003" };
    case "KW":
      return { ...base, invoiceUuid: externalUuid, clearanceId: `${externalUuid}-cl`, status: "CLEARED", phase: "phase_1" };
    case "BH":
      return { ...base, invoiceUuid: externalUuid, submissionId: externalUuid, status: "ACCEPTED", vatNumber: "BH00000000000000" };
    case "OM":
      return { ...base, invoiceUuid: externalUuid, clearanceId: `${externalUuid}-cl`, status: "CLEARED" };
    default:
      return base;
  }
}

// ─── Schema ────────────────────────────────────────────────────────────────

const Schema = z.object({
  country: z.enum(["SA", "EG", "AE", "KW", "BH", "OM", "QA"]),
  companySlug: z.string().optional(),
});

// ─── POST Handler ──────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limit: 6 test sends per minute per IP (low — this is an admin action)
  const rl = await rateLimitResponse(req, "post:einvoice-test-webhook", LIMITS.API_WRITE);
  if (rl) return rl;

  const authResult = await requireFounder(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = await parseJsonBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return apiError("Country must be one of: SA, EG, AE, KW, BH, OM, QA", 400);
  }

  const { country, companySlug: explicitSlug } = parsed.data;
  const cfg = WEBHOOK_CONFIG[country];
  if (!cfg) return apiError(`Unsupported country: ${country}`, 400);

  // ─── 1. Look up the secret from integration config ────────────────────
  const creds = await getIntegrationConfig(cfg.integrationType);
  const secret = creds?.[cfg.secretKey];
  if (!secret) {
    return apiError(
      `No ${cfg.secretKey} configured for ${cfg.integrationType}. Save credentials first in Settings → E-Invoicing.`,
      400,
    );
  }

  // ─── 2. Resolve companySlug (use explicit, or first company in DB) ────
  let companySlug = explicitSlug || "";
  if (!companySlug) {
    const firstCompany = await db.company.findFirst({
      where: { deletedAt: null, country },
      select: { slug: true },
      orderBy: { createdAt: "desc" },
    });
    companySlug = firstCompany?.slug || "test-company";
  }

  // ─── 3. Build + sign the payload ──────────────────────────────────────
  const testUuid = `test-${Date.now()}-${country.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = buildPayload(country, testUuid, companySlug);
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(rawBody).digest(cfg.encoding);

  // ─── 4. Determine the local webhook URL ───────────────────────────────
  // Use the same origin as the incoming request (so it works in any deployment).
  const origin = new URL(req.url).origin;
  const webhookUrl = `${origin}${cfg.path}`;

  // ─── 5. Send the HTTP POST ────────────────────────────────────────────
  const start = Date.now();
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [cfg.header]: signature,
      },
      body: rawBody,
    });
    const latencyMs = Date.now() - start;
    const responseText = await res.text();
    let responseBody: unknown = responseText;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      // keep as text
    }

    if (!res.ok) {
      logger.warn("[test-webhook] receiver returned non-200", {
        country, webhookUrl, status: res.status, body: responseText,
      });
      return NextResponse.json({
        ok: false,
        country,
        webhookUrl,
        status: res.status,
        responseBody,
        latencyMs,
        testUuid,
        error: `Receiver returned HTTP ${res.status}`,
      });
    }

    // ─── 6. Query the receipt that was just recorded ──────────────────
    // (give the DB a tiny moment to commit)
    await new Promise((r) => setTimeout(r, 100));
    const receipt = await db.eInvoiceReceipt.findFirst({
      where: { externalUuid: testUuid, authority: cfg.authority },
      select: {
        id: true,
        status: true,
        signatureValid: true,
        eventType: true,
        receivedAt: true,
      },
    });

    logger.info("[test-webhook] test sent successfully", {
      country, webhookUrl, testUuid, status: res.status, latencyMs, receiptId: receipt?.id,
    });

    return NextResponse.json({
      ok: true,
      country,
      webhookUrl,
      status: res.status,
      responseBody,
      latencyMs,
      testUuid,
      signatureHeader: cfg.header,
      signatureEncoding: cfg.encoding,
      payload,
      receipt: receipt || null,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error("[test-webhook] fetch failed", {
      country, webhookUrl, err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({
      ok: false,
      country,
      webhookUrl,
      status: 0,
      error: err instanceof Error ? err.message : "Fetch failed",
      latencyMs,
      testUuid,
    });
  }
});
