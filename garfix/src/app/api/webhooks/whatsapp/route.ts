/**
 * /api/webhooks/whatsapp — Meta WhatsApp Business API webhook receiver.
 *
 * GET  — Verification challenge (Meta subscribes the webhook).
 * POST — Receive incoming messages from WhatsApp users.
 *
 * Verification (GET):
 *   Meta sends hub.mode=subscribe, hub.challenge=CHALLENGE, hub.verify_token=TOKEN.
 *   We compare hub.verify_token against the platform-level env var
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN (plaintext comparison) or, if not set,
 *   we hash the incoming token and check against every Company's
 *   whatsappVerifyTokenHash.
 *
 * Message receiving (POST):
 *   Meta signs the payload with x-hub-signature-256 using the app secret.
 *   We locate the company by matching the phone_number_id from the payload
 *   against Company.whatsappPhoneNumberId, then verify the signature using
 *   that company's decrypted whatsappAppSecretEnc.
 *   For now, messages are logged (AI processing can be added later).
 *   We return 200 immediately (Meta requires fast response).
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, hashToken, safeCompare, tryDecryptSecret } from "@/lib/cryptoVault";
import { logger } from "@/lib/logger";
import { z } from "zod";

// ─── GET: Webhook verification ────────────────────────────────────────────────

const verifyQuerySchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.challenge": z.string().min(1),
  "hub.verify_token": z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = verifyQuerySchema.safeParse(params);

    if (!parsed.success) {
      logger.warn("[whatsapp-webhook] GET verification failed: invalid query params", {
        errors: parsed.error.flatten().fieldErrors,
      });
      return new NextResponse("Invalid verification request", { status: 400 });
    }

    const { "hub.verify_token": verifyToken, "hub.challenge": challenge } = parsed.data;

    // Strategy 1: Platform-level env var (plaintext comparison)
    const platformToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (platformToken && safeCompare(verifyToken, platformToken)) {
      logger.info("[whatsapp-webhook] GET verification succeeded via platform env var");
      return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    // Strategy 2: Check against all companies' hashed verify tokens
    const companies = await db.company.findMany({
      where: { whatsappVerifyTokenHash: { not: null } },
      select: { slug: true, whatsappVerifyTokenHash: true },
    });

    const incomingHash = hashToken(verifyToken);
    for (const company of companies) {
      if (company.whatsappVerifyTokenHash && safeCompare(incomingHash, company.whatsappVerifyTokenHash)) {
        logger.info("[whatsapp-webhook] GET verification succeeded for company", { companySlug: company.slug });
        return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      }
    }

    logger.warn("[whatsapp-webhook] GET verification failed: no matching verify token");
    return new NextResponse("Forbidden", { status: 403 });
  } catch (err) {
    logger.error("[whatsapp-webhook] GET verification error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// ─── POST: Receive messages ──────────────────────────────────────────────────

/**
 * Verify the x-hub-signature-256 header against the raw body using HMAC-SHA256.
 * The app secret is decrypted from the company's whatsappAppSecretEnc field.
 */
function verifySignature(rawBody: string, signature: string, appSecret: string): boolean {
  const expectedSig = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeCompare(signature, expectedSig);
}

/**
 * Extract the WhatsApp business phone number ID from the Meta payload.
 * The structure is: entry[].changes[].value.metadata.phone_number_id
 */
function extractPhoneNumberId(body: unknown): string | null {
  try {
    const b = body as Record<string, unknown>;
    const entries = Array.isArray(b.entry) ? b.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray((entry as Record<string, unknown>)?.changes)
        ? ((entry as Record<string, unknown>).changes as unknown[])
        : [];
      for (const change of changes) {
        const value = (change as Record<string, unknown>)?.value;
        if (value && typeof value === "object") {
          const metadata = (value as Record<string, unknown>).metadata;
          if (metadata && typeof metadata === "object") {
            const phoneId = (metadata as Record<string, unknown>).phone_number_id;
            if (typeof phoneId === "string" && phoneId) return phoneId;
          }
        }
      }
    }
  } catch {
    // Malformed payload
  }
  return null;
}

/**
 * Extract messages from the Meta payload.
 * Returns an array of { from, text, timestamp, type } objects.
 */
function extractMessages(body: unknown): Array<{
  from: string;
  text: string;
  timestamp: string;
  type: string;
}> {
  const messages: Array<{ from: string; text: string; timestamp: string; type: string }> = [];
  try {
    const b = body as Record<string, unknown>;
    const entries = Array.isArray(b.entry) ? b.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray((entry as Record<string, unknown>)?.changes)
        ? ((entry as Record<string, unknown>).changes as unknown[])
        : [];
      for (const change of changes) {
        const value = (change as Record<string, unknown>)?.value;
        if (!value || typeof value !== "object") continue;
        const msgs = Array.isArray((value as Record<string, unknown>).messages)
          ? ((value as Record<string, unknown>).messages as unknown[])
          : [];
        for (const msg of msgs) {
          const m = msg as Record<string, unknown>;
          const from = typeof m.from === "string" ? m.from : "";
          const timestamp = typeof m.timestamp === "string" ? m.timestamp : "";
          const type = typeof m.type === "string" ? m.type : "unknown";

          let text = "";
          if (type === "text" && m.text && typeof m.text === "object") {
            text = typeof (m.text as Record<string, unknown>).body === "string"
              ? (m.text as Record<string, unknown>).body as string
              : "";
          } else if (type === "interactive" && m.interactive && typeof m.interactive === "object") {
            const interactive = m.interactive as Record<string, unknown>;
            if (interactive.list_reply && typeof interactive.list_reply === "object") {
              text = typeof (interactive.list_reply as Record<string, unknown>).title === "string"
                ? (interactive.list_reply as Record<string, unknown>).title as string
                : "";
            } else if (interactive.button_reply && typeof interactive.button_reply === "object") {
              text = typeof (interactive.button_reply as Record<string, unknown>).title === "string"
                ? (interactive.button_reply as Record<string, unknown>).title as string
                : "";
            }
          }

          if (from) {
            messages.push({ from, text, timestamp, type });
          }
        }
      }
    }
  } catch {
    // Malformed payload — return what we have
  }
  return messages;
}

export async function POST(req: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    // Parse the JSON body
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      logger.warn("[whatsapp-webhook] POST: failed to parse JSON body");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Identify the company by phone_number_id
    const phoneNumberId = extractPhoneNumberId(body);

    if (!phoneNumberId) {
      logger.warn("[whatsapp-webhook] POST: no phone_number_id found in payload");
      // Still return 200 so Meta doesn't retry indefinitely
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    // Find the company with this phone number ID
    const company = await db.company.findFirst({
      where: {
        whatsappPhoneNumberId: phoneNumberId,
        whatsappEnabled: true,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        whatsappAppSecretEnc: true,
      },
    });

    if (!company) {
      logger.warn("[whatsapp-webhook] POST: no company found for phone_number_id", { phoneNumberId });
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    // Verify signature if app secret is configured
    if (company.whatsappAppSecretEnc && signature) {
      let appSecret: string | null = null;
      try {
        appSecret = decryptSecret(company.whatsappAppSecretEnc);
      } catch {
        // Decryption failed — try safe variant
        appSecret = tryDecryptSecret(company.whatsappAppSecretEnc);
      }

      if (appSecret) {
        const isValid = verifySignature(rawBody, signature, appSecret);
        if (!isValid) {
          logger.warn("[whatsapp-webhook] POST: signature verification failed", {
            companySlug: company.slug,
          });
          return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
        }
      } else {
        logger.warn("[whatsapp-webhook] POST: could not decrypt app secret, skipping signature verification", {
          companySlug: company.slug,
        });
      }
    } else if (!signature) {
      logger.debug("[whatsapp-webhook] POST: no x-hub-signature-256 header present", {
        companySlug: company.slug,
      });
    } else if (!company.whatsappAppSecretEnc) {
      logger.debug("[whatsapp-webhook] POST: no app secret configured for company, skipping signature verification", {
        companySlug: company.slug,
      });
    }

    // Extract and log messages
    const messages = extractMessages(body);

    if (messages.length > 0) {
      for (const msg of messages) {
        logger.info("[whatsapp-webhook] POST: received message", {
          companySlug: company.slug,
          company_id: company.id,
          from: msg.from,
          type: msg.type,
          text: msg.text.slice(0, 500),
          timestamp: msg.timestamp,
        });
      }
    } else {
      // Could be a status update or other non-message event
      logger.debug("[whatsapp-webhook] POST: no messages in payload (likely a status update)", {
        companySlug: company.slug,
      });
    }

    // Return 200 immediately — Meta requires fast response
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    logger.error("[whatsapp-webhook] POST: unhandled error", {
      err: err instanceof Error ? err.message : String(err),
    });
    // Still return 200 to prevent Meta retries on our internal errors
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
